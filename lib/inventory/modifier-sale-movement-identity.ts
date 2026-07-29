import { createHash } from "crypto";
import {
  convertInventoryQuantity,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";

export const STOCK_MOVEMENT_ID_CONFLICT = "STOCK_MOVEMENT_ID_CONFLICT";

function canonicalSerialize(value: unknown): string {
  if (value === undefined) return '{"$hostly":"undefined"}';
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export type ModifierSaleV2MovementIdentity = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
  selectionOccurrence: number;
};

export type ModifierSaleMovementFingerprintInput = {
  sentQuantity: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
};

export function buildModifierSaleV2MovementId(
  identity: ModifierSaleV2MovementIdentity,
): string {
  const digest = createHash("sha256")
    .update(
      canonicalSerialize({
        type: "modifier_sale",
        restaurantId: identity.restaurantId.trim(),
        orderId: identity.orderId.trim(),
        sentSegmentLineId: identity.sentSegmentLineId.trim(),
        modifierGroupId: identity.modifierGroupId.trim(),
        modifierOptionId: identity.modifierOptionId.trim(),
        inventoryProductId: identity.inventoryProductId.trim(),
        selectionOccurrence: identity.selectionOccurrence,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `modifier_sale_v2_${digest}`;
}

export function buildModifierSaleMovementFingerprint(
  input: ModifierSaleMovementFingerprintInput,
): string {
  return canonicalSerialize({
    sentQuantity: input.sentQuantity,
    inventoryQuantityPerUnit: input.inventoryQuantityPerUnit,
    inventoryUnit: input.inventoryUnit.trim(),
    quantityDelta: input.quantityDelta,
  });
}

export function readStoredModifierSaleMovementFingerprint(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;
  if (typeof data.movementFingerprint === "string" && data.movementFingerprint.trim()) {
    return data.movementFingerprint.trim();
  }
  const sentQuantity = data.sentQuantity;
  const inventoryQuantityPerUnit = data.inventoryQuantityPerUnit;
  const inventoryUnit = data.inventoryUnit;
  const quantityDelta = data.quantityDelta;
  if (
    typeof sentQuantity !== "number" ||
    !Number.isFinite(sentQuantity) ||
    typeof inventoryQuantityPerUnit !== "number" ||
    !Number.isFinite(inventoryQuantityPerUnit) ||
    typeof inventoryUnit !== "string" ||
    typeof quantityDelta !== "number" ||
    !Number.isFinite(quantityDelta)
  ) {
    return null;
  }
  return buildModifierSaleMovementFingerprint({
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
}

function readStrictFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readStrictTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rejectExistingModifierSaleMovement(): never {
  throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
}

export type ValidateExistingModifierSaleMovementParams = {
  movementId: string;
  existing: Record<string, unknown>;
  expectedFingerprint: string;
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  inventoryProductId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  selectionOccurrence: number;
  sentQuantity: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
  productCurrentStock: number;
  productUnit: string;
};

/**
 * Acepta un movimiento existente como idempotencia legítima solo si coincide con
 * el planificado y demuestra que el stock del producto ya refleja su aplicación.
 */
export function assertExistingModifierSaleMovementIsValidForIdempotentSkip(
  params: ValidateExistingModifierSaleMovementParams,
): void {
  const { existing, movementId, expectedFingerprint } = params;
  const expectedFp = expectedFingerprint.trim();

  const movementFingerprint = readStrictTrimmedString(existing.movementFingerprint);
  if (!movementFingerprint || movementFingerprint !== expectedFp) {
    rejectExistingModifierSaleMovement();
  }

  const derivedFingerprint = readStoredModifierSaleMovementFingerprint(existing);
  if (!derivedFingerprint || derivedFingerprint !== expectedFp) {
    rejectExistingModifierSaleMovement();
  }

  if (existing.type !== "modifier_sale" || existing.source !== "modifier_sale") {
    rejectExistingModifierSaleMovement();
  }

  if (existing.applied !== true) {
    rejectExistingModifierSaleMovement();
  }

  const restaurantId = readStrictTrimmedString(existing.restaurantId);
  if (!restaurantId || restaurantId !== params.restaurantId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const orderId = readStrictTrimmedString(existing.orderId);
  if (!orderId || orderId !== params.orderId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const productId = readStrictTrimmedString(existing.productId);
  if (!productId || productId !== params.inventoryProductId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const expectedLineId = params.sentSegmentLineId.trim();
  const lineId = readStrictTrimmedString(existing.lineId);
  if (!lineId || lineId !== expectedLineId) {
    rejectExistingModifierSaleMovement();
  }

  const sentSegmentLineId = readStrictTrimmedString(existing.sentSegmentLineId);
  if (!sentSegmentLineId || sentSegmentLineId !== expectedLineId) {
    rejectExistingModifierSaleMovement();
  }

  const modifierGroupId = readStrictTrimmedString(existing.modifierGroupId);
  if (!modifierGroupId || modifierGroupId !== params.modifierGroupId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const modifierOptionId = readStrictTrimmedString(existing.modifierOptionId);
  if (!modifierOptionId || modifierOptionId !== params.modifierOptionId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const selectionOccurrence = readStrictFiniteNumber(existing.selectionOccurrence);
  if (selectionOccurrence == null || selectionOccurrence !== params.selectionOccurrence) {
    rejectExistingModifierSaleMovement();
  }

  const idempotencyKey = readStrictTrimmedString(existing.idempotencyKey);
  if (!idempotencyKey || idempotencyKey !== movementId.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const sentQuantity = readStrictFiniteNumber(existing.sentQuantity);
  if (sentQuantity == null || sentQuantity !== params.sentQuantity) {
    rejectExistingModifierSaleMovement();
  }

  const inventoryQuantityPerUnit = readStrictFiniteNumber(existing.inventoryQuantityPerUnit);
  if (
    inventoryQuantityPerUnit == null ||
    inventoryQuantityPerUnit !== params.inventoryQuantityPerUnit
  ) {
    rejectExistingModifierSaleMovement();
  }

  const quantityDelta = readStrictFiniteNumber(existing.quantityDelta);
  if (quantityDelta == null || quantityDelta !== params.quantityDelta) {
    rejectExistingModifierSaleMovement();
  }

  const unit = readStrictTrimmedString(existing.unit);
  if (!unit || unit !== params.inventoryUnit.trim()) {
    rejectExistingModifierSaleMovement();
  }

  const stockBefore = readStrictFiniteNumber(existing.stockBefore);
  const stockAfter = readStrictFiniteNumber(existing.stockAfter);
  if (stockBefore == null || stockAfter == null) {
    rejectExistingModifierSaleMovement();
  }

  const convertedPerUnit = convertInventoryQuantity({
    quantity: -params.inventoryQuantityPerUnit,
    fromUnit: params.inventoryUnit,
    toUnit: params.productUnit,
  });
  if (convertedPerUnit == null || !Number.isFinite(convertedPerUnit)) {
    rejectExistingModifierSaleMovement();
  }

  const expectedConvertedDelta = roundInventoryQuantity(
    convertedPerUnit * params.sentQuantity,
  );
  const expectedStockAfter = roundInventoryQuantity(stockBefore + expectedConvertedDelta);
  if (stockAfter !== expectedStockAfter) {
    rejectExistingModifierSaleMovement();
  }

  if (params.productCurrentStock !== stockAfter) {
    rejectExistingModifierSaleMovement();
  }
}
