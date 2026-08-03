import { createHash } from "crypto";
import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { STOCK_MOVEMENT_ID_CONFLICT } from "@/lib/inventory/modifier-sale-movement-identity";

export { STOCK_MOVEMENT_ID_CONFLICT };

function canonicalSerialize(value: unknown): string {
  if (value === undefined) return '{"$hostly":"undefined"}';
  if (value === null) return "null";
  if (typeof value !== "number") {
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
  if (!Number.isFinite(value)) throw new Error("NON_FINITE_NUMBER");
  return JSON.stringify(value);
}

/**
 * Clave económica de una fila de receta.
 * Occurrence se cuenta solo entre filas con la misma clave.
 * No incluye índice de array, nombre ni coste.
 */
export type RecipeIngredientEconomicIdentity = {
  inventoryProductId: string;
  recipeQuantityPerUnit: number;
  recipeUnit: string;
};

export function normalizeRecipeSaleUnit(unit: string): string {
  return normalizeInventoryUnitAlias(unit.trim());
}

export function buildRecipeIngredientEconomicKey(
  identity: RecipeIngredientEconomicIdentity,
): string {
  const recipeUnit = normalizeRecipeSaleUnit(identity.recipeUnit);
  if (!recipeUnit) throw new Error("RECIPE_UNIT_REQUIRED");
  if (
    typeof identity.recipeQuantityPerUnit !== "number" ||
    !Number.isFinite(identity.recipeQuantityPerUnit)
  ) {
    throw new Error("RECIPE_QUANTITY_REQUIRED");
  }
  return canonicalSerialize({
    inventoryProductId: identity.inventoryProductId.trim(),
    recipeQuantityPerUnit: identity.recipeQuantityPerUnit,
    recipeUnit,
  });
}

export type RecipeSaleV2MovementIdentity = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  saleProductId: string;
  inventoryProductId: string;
  recipeQuantityPerUnit: number;
  recipeUnit: string;
  /**
   * Contador entre filas con la misma clave económica
   * (inventoryProductId + recipeQuantityPerUnit + recipeUnit).
   * Filas económicamente distintas tienen occurrence independiente (normalmente 0).
   */
  ingredientOccurrence: number;
};

export type RecipeSaleMovementFingerprintInput = {
  sentQuantity: number;
  recipeQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
  /** Unidad canónica del producto de inventario (destino de conversión). */
  productInventoryUnit: string;
};

export function buildRecipeSaleV2MovementId(
  identity: RecipeSaleV2MovementIdentity,
): string {
  const recipeUnit = normalizeRecipeSaleUnit(identity.recipeUnit);
  const digest = createHash("sha256")
    .update(
      canonicalSerialize({
        type: "recipe_sale",
        restaurantId: identity.restaurantId.trim(),
        orderId: identity.orderId.trim(),
        sentSegmentLineId: identity.sentSegmentLineId.trim(),
        saleProductId: identity.saleProductId.trim(),
        inventoryProductId: identity.inventoryProductId.trim(),
        recipeQuantityPerUnit: identity.recipeQuantityPerUnit,
        recipeUnit,
        ingredientOccurrence: identity.ingredientOccurrence,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `recipe_sale_v2_${digest}`;
}

export function buildRecipeSaleMovementFingerprint(
  input: RecipeSaleMovementFingerprintInput,
): string {
  return canonicalSerialize({
    sentQuantity: input.sentQuantity,
    recipeQuantityPerUnit: input.recipeQuantityPerUnit,
    inventoryUnit: normalizeRecipeSaleUnit(input.inventoryUnit),
    quantityDelta: input.quantityDelta,
    productInventoryUnit: normalizeRecipeSaleUnit(input.productInventoryUnit),
  });
}

export function readStoredRecipeSaleMovementFingerprint(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;
  if (typeof data.movementFingerprint === "string" && data.movementFingerprint.trim()) {
    return data.movementFingerprint.trim();
  }
  const sentQuantity = data.sentQuantity;
  const recipeQuantityPerUnit = data.recipeQuantityPerUnit;
  const inventoryUnit = data.unit;
  const quantityDelta = data.quantityDelta;
  const productInventoryUnit = data.productInventoryUnit;
  if (
    typeof sentQuantity !== "number" ||
    !Number.isFinite(sentQuantity) ||
    typeof recipeQuantityPerUnit !== "number" ||
    !Number.isFinite(recipeQuantityPerUnit) ||
    typeof inventoryUnit !== "string" ||
    typeof quantityDelta !== "number" ||
    !Number.isFinite(quantityDelta) ||
    typeof productInventoryUnit !== "string"
  ) {
    return null;
  }
  return buildRecipeSaleMovementFingerprint({
    sentQuantity,
    recipeQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
    productInventoryUnit,
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

function rejectExistingRecipeSaleMovement(): never {
  throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
}

export type ValidateExistingRecipeSaleMovementParams = {
  movementId: string;
  existing: Record<string, unknown>;
  expectedFingerprint: string;
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  saleProductId: string;
  inventoryProductId: string;
  ingredientOccurrence: number;
  sentQuantity: number;
  recipeQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
  productCurrentStock: number;
  productUnit: string;
  /** Cuando hay varios movimientos del mismo producto en la misma tx, diferir el match de stock. */
  expectProductStockMatch?: boolean;
};

/**
 * Acepta un movimiento recipe_sale existente como retry idempotente solo si
 * coincide con el planificado y el stock del producto ya refleja su aplicación.
 */
export function assertExistingRecipeSaleMovementIsValidForIdempotentSkip(
  params: ValidateExistingRecipeSaleMovementParams,
): void {
  const { existing, movementId, expectedFingerprint } = params;
  const expectedFp = expectedFingerprint.trim();

  const movementFingerprint = readStrictTrimmedString(existing.movementFingerprint);
  if (!movementFingerprint || movementFingerprint !== expectedFp) {
    rejectExistingRecipeSaleMovement();
  }

  const derivedFingerprint = readStoredRecipeSaleMovementFingerprint(existing);
  if (!derivedFingerprint || derivedFingerprint !== expectedFp) {
    rejectExistingRecipeSaleMovement();
  }

  if (existing.type !== "recipe_sale" || existing.source !== "recipe_sale") {
    rejectExistingRecipeSaleMovement();
  }

  if (existing.applied !== true) {
    rejectExistingRecipeSaleMovement();
  }

  const restaurantId = readStrictTrimmedString(existing.restaurantId);
  if (!restaurantId || restaurantId !== params.restaurantId.trim()) {
    rejectExistingRecipeSaleMovement();
  }

  const orderId = readStrictTrimmedString(existing.orderId);
  if (!orderId || orderId !== params.orderId.trim()) {
    rejectExistingRecipeSaleMovement();
  }

  const productId = readStrictTrimmedString(existing.productId);
  if (!productId || productId !== params.inventoryProductId.trim()) {
    rejectExistingRecipeSaleMovement();
  }

  const saleProductId = readStrictTrimmedString(existing.saleProductId);
  if (!saleProductId || saleProductId !== params.saleProductId.trim()) {
    rejectExistingRecipeSaleMovement();
  }

  const expectedLineId = params.sentSegmentLineId.trim();
  const lineId = readStrictTrimmedString(existing.lineId);
  if (!lineId || lineId !== expectedLineId) {
    rejectExistingRecipeSaleMovement();
  }

  const sentSegmentLineId = readStrictTrimmedString(existing.sentSegmentLineId);
  if (!sentSegmentLineId || sentSegmentLineId !== expectedLineId) {
    rejectExistingRecipeSaleMovement();
  }

  const ingredientOccurrence = readStrictFiniteNumber(existing.ingredientOccurrence);
  if (
    ingredientOccurrence == null ||
    ingredientOccurrence !== params.ingredientOccurrence
  ) {
    rejectExistingRecipeSaleMovement();
  }

  const idempotencyKey = readStrictTrimmedString(existing.idempotencyKey);
  if (!idempotencyKey || idempotencyKey !== movementId.trim()) {
    rejectExistingRecipeSaleMovement();
  }

  const sentQuantity = readStrictFiniteNumber(existing.sentQuantity);
  if (sentQuantity == null || sentQuantity !== params.sentQuantity) {
    rejectExistingRecipeSaleMovement();
  }

  const recipeQuantityPerUnit = readStrictFiniteNumber(existing.recipeQuantityPerUnit);
  if (
    recipeQuantityPerUnit == null ||
    recipeQuantityPerUnit !== params.recipeQuantityPerUnit
  ) {
    rejectExistingRecipeSaleMovement();
  }

  const quantityDelta = readStrictFiniteNumber(existing.quantityDelta);
  if (quantityDelta == null || quantityDelta !== params.quantityDelta) {
    rejectExistingRecipeSaleMovement();
  }

  const unit = readStrictTrimmedString(existing.unit);
  const expectedUnit = normalizeRecipeSaleUnit(params.inventoryUnit);
  if (!unit || normalizeRecipeSaleUnit(unit) !== expectedUnit) {
    rejectExistingRecipeSaleMovement();
  }

  const storedProductUnit = readStrictTrimmedString(existing.productInventoryUnit);
  const expectedProductUnit = normalizeRecipeSaleUnit(params.productUnit);
  if (!storedProductUnit || normalizeRecipeSaleUnit(storedProductUnit) !== expectedProductUnit) {
    rejectExistingRecipeSaleMovement();
  }

  const stockBefore = readStrictFiniteNumber(existing.stockBefore);
  const stockAfter = readStrictFiniteNumber(existing.stockAfter);
  if (stockBefore == null || stockAfter == null) {
    rejectExistingRecipeSaleMovement();
  }

  const convertedPerUnit = convertInventoryQuantity({
    quantity: -params.recipeQuantityPerUnit,
    fromUnit: params.inventoryUnit,
    toUnit: params.productUnit,
  });
  if (convertedPerUnit == null || !Number.isFinite(convertedPerUnit)) {
    rejectExistingRecipeSaleMovement();
  }

  const expectedConvertedDelta = roundInventoryQuantity(
    convertedPerUnit * params.sentQuantity,
  );
  const expectedStockAfter = roundInventoryQuantity(stockBefore + expectedConvertedDelta);
  if (stockAfter !== expectedStockAfter) {
    rejectExistingRecipeSaleMovement();
  }

  if (
    params.expectProductStockMatch !== false &&
    params.productCurrentStock !== stockAfter
  ) {
    rejectExistingRecipeSaleMovement();
  }
}
