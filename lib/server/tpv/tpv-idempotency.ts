import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type {
  ModifierStockConsumptionWarning,
  ModifierStockConsumptionWarningReason,
} from "@/lib/inventory/stock-movement-types";

const KNOWN_MODIFIER_STOCK_WARNING_REASONS = new Set<ModifierStockConsumptionWarningReason>([
  "PRODUCT_NOT_FOUND",
  "PRODUCT_INACTIVE",
  "INVENTORY_DISABLED",
  "INVALID_CURRENT_STOCK",
  "UNKNOWN_PRODUCT_UNIT",
  "INCOMPATIBLE_UNIT",
  "INVALID_CONSUMPTION_QUANTITY",
]);

function compareInventoryWarnings(
  a: ModifierStockConsumptionWarning,
  b: ModifierStockConsumptionWarning,
): number {
  for (const key of ["lineId", "groupId", "optionId", "inventoryProductId", "reason"] as const) {
    const left = String(a[key] ?? "");
    const right = String(b[key] ?? "");
    if (left !== right) return left.localeCompare(right);
  }
  return 0;
}

export function sortInventoryWarningsStable(
  warnings: readonly ModifierStockConsumptionWarning[],
): ModifierStockConsumptionWarning[] {
  return [...warnings].sort(compareInventoryWarnings);
}

export function readInventoryWarningsFromIdempotencyResult(
  result: Record<string, unknown> | null | undefined,
): ModifierStockConsumptionWarning[] {
  if (!result) return [];
  const raw = result.inventoryWarnings;
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const parsed: ModifierStockConsumptionWarning[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const orderId = typeof row.orderId === "string" ? row.orderId.trim() : "";
    const lineId = typeof row.lineId === "string" ? row.lineId.trim() : "";
    const groupId = typeof row.groupId === "string" ? row.groupId.trim() : "";
    const optionId = typeof row.optionId === "string" ? row.optionId.trim() : "";
    const reasonRaw = typeof row.reason === "string" ? row.reason.trim() : "";
    if (!orderId || !lineId || !groupId || !optionId || !reasonRaw) continue;
    if (!KNOWN_MODIFIER_STOCK_WARNING_REASONS.has(reasonRaw as ModifierStockConsumptionWarningReason)) {
      continue;
    }
    const requestedQuantity =
      typeof row.requestedQuantity === "number" && Number.isFinite(row.requestedQuantity)
        ? row.requestedQuantity
        : undefined;
    const unit = typeof row.unit === "string" && row.unit.trim() ? row.unit.trim() : undefined;
    const inventoryProductId =
      typeof row.inventoryProductId === "string" && row.inventoryProductId.trim()
        ? row.inventoryProductId.trim()
        : undefined;
    parsed.push({
      orderId,
      lineId,
      groupId,
      optionId,
      reason: reasonRaw as ModifierStockConsumptionWarningReason,
      ...(inventoryProductId ? { inventoryProductId } : {}),
      ...(requestedQuantity != null ? { requestedQuantity } : {}),
      ...(unit ? { unit } : {}),
    });
  }
  return sortInventoryWarningsStable(parsed);
}

export function buildIdempotencyResultWithInventoryWarnings(
  result: Record<string, unknown>,
  warnings: readonly ModifierStockConsumptionWarning[],
): Record<string, unknown> {
  return {
    ...result,
    inventoryWarnings: sortInventoryWarningsStable(warnings),
  };
}

export type IdempotencyRecord = {
  kind: string;
  payloadHash: string;
  result: Record<string, unknown>;
};

export function idempotencyDocRef(
  db: Firestore,
  restaurantId: string,
  key: string,
): DocumentReference {
  return db
    .collection("restaurants")
    .doc(restaurantId.trim())
    .collection("tpvIdempotency")
    .doc(key.trim());
}

/** Serialización canónica recursiva para hash de idempotencia. */
export function canonicalSerialize(value: unknown): string {
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

export function buildIdempotencyPayload(
  actorUid: string,
  restaurantId: string,
  operation: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return { actorUid: actorUid.trim(), restaurantId: restaurantId.trim(), operation, ...body };
}

export function stablePayloadHash(payload: unknown): string {
  return canonicalSerialize(payload);
}

export function readIdempotencyHit(
  snap: FirebaseFirestore.DocumentSnapshot | null | undefined,
  kind: string,
  payloadHash: string,
): Record<string, unknown> | null {
  if (!snap?.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (data.kind !== kind) return { conflict: true } as Record<string, unknown>;
  if (data.payloadHash !== payloadHash) return { conflict: true } as Record<string, unknown>;
  const result = data.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return null;
}

export function writeIdempotencyRecord(
  tx: Transaction,
  ref: DocumentReference,
  kind: string,
  payloadHash: string,
  result: Record<string, unknown>,
): void {
  tx.set(ref, {
    kind,
    payloadHash,
    result,
    createdAt: FieldValue.serverTimestamp(),
  });
}
