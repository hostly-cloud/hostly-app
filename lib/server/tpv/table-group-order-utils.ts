import type { DocumentReference } from "firebase-admin/firestore";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function asOrderItems(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

export function readOrderCreatedAtMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function isPaymentRequestedAtSet(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "number" && Number.isFinite(raw)) return true;
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis?: () => number }).toMillis === "function"
  ) {
    return true;
  }
  return false;
}

export function withTableGroupLineOrigin(
  item: Record<string, unknown>,
  sourceTableId: string,
  sourceOrderId: string,
): Record<string, unknown> {
  const tid = sourceTableId.trim();
  const oid = sourceOrderId.trim();
  return {
    ...item,
    ...(tid ? { tableGroupSourceTableId: tid } : {}),
    ...(oid ? { tableGroupSourceOrderId: oid } : {}),
  };
}

/**
 * Conserva provenance original si ya existe (línea de un merge previo);
 * si no, estampa mesa/pedido de origen del merge actual.
 */
export function ensureTableGroupLineOrigin(
  item: Record<string, unknown>,
  sourceTableId: string,
  sourceOrderId: string,
): Record<string, unknown> {
  const existingT =
    typeof item.tableGroupSourceTableId === "string"
      ? item.tableGroupSourceTableId.trim()
      : "";
  const existingO =
    typeof item.tableGroupSourceOrderId === "string"
      ? item.tableGroupSourceOrderId.trim()
      : "";
  if (existingT && existingO) return item;
  return withTableGroupLineOrigin(item, sourceTableId, sourceOrderId);
}

export function mergeNotes(parts: readonly unknown[]): string {
  const out: string[] = [];
  for (const part of parts) {
    const s = typeof part === "string" ? part.trim() : "";
    if (s) out.push(s);
  }
  return out.join("\n");
}

export function pickLatestPaymentRequestedAt(values: readonly unknown[]): unknown {
  let best: unknown = null;
  let bestMs = -1;
  for (const raw of values) {
    if (!isPaymentRequestedAtSet(raw)) continue;
    const ms = readOrderCreatedAtMs(raw);
    if (ms > bestMs) {
      bestMs = ms;
      best = raw;
    }
  }
  return best;
}

export function isActiveOrderStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "open" || s === "sent";
}

export function tableGroupsDocRef(db: FirebaseFirestore.Firestore, restaurantId: string): DocumentReference {
  return db.collection("restaurants").doc(restaurantId.trim()).collection("config").doc("tableGroups");
}

export function lineHasActiveQuantity(line: Record<string, unknown>): boolean {
  const st = String(line.status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "canceled" || st === "cancelado") return false;
  const qty = Math.floor(Number(line.quantity ?? line.qty) || 0);
  return qty > 0;
}
