import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";

export type NewlySentSegment = {
  sentSegmentLineId: string;
  line: Record<string, unknown>;
  newlySentUnits: number;
};

function readLineId(line: Record<string, unknown>): string {
  return typeof line.id === "string" ? line.id.trim() : "";
}

function readLineQuantity(line: Record<string, unknown>): number {
  const qty = Math.floor(Number(line.quantity ?? line.qty) || 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/** Canonical first-send units from orders.items[] snapshots. */
export function deriveNewlySentUnits(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): number {
  const afterStatus = normalizeProductionLineStatus(after.status);
  if (afterStatus !== "sent") return 0;
  const qty = readLineQuantity(after);
  if (qty <= 0) return 0;
  if (!before) return qty;
  const beforeStatus = normalizeProductionLineStatus(before.status);
  if (beforeStatus === "pending") return qty;
  return 0;
}

export function deriveNewlySentSegments(
  beforeItems: readonly Record<string, unknown>[],
  afterItems: readonly Record<string, unknown>[],
): NewlySentSegment[] {
  const beforeById = new Map<string, Record<string, unknown>>();
  for (const line of beforeItems) {
    const id = readLineId(line);
    if (id) beforeById.set(id, line);
  }
  const out: NewlySentSegment[] = [];
  for (const line of afterItems) {
    const sentSegmentLineId = readLineId(line);
    if (!sentSegmentLineId) continue;
    const newlySentUnits = deriveNewlySentUnits(beforeById.get(sentSegmentLineId), line);
    if (newlySentUnits <= 0) continue;
    out.push({ sentSegmentLineId, line, newlySentUnits });
  }
  return out;
}
