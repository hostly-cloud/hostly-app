import { createHash } from "crypto";

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
    typeof inventoryQuantityPerUnit !== "number" ||
    typeof inventoryUnit !== "string" ||
    typeof quantityDelta !== "number"
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
