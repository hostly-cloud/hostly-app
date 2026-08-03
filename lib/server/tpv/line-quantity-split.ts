import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { applyKdsLineStatusTransition } from "@/lib/server/tpv/line-status-transitions";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function readQty(line: Record<string, unknown>): number {
  const q = Math.floor(Number(line.quantity ?? line.qty) || 0);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

function cloneLine(line: Record<string, unknown>): Record<string, unknown> {
  return { ...line };
}

function splitLineTotal(lineTotal: number, origQty: number, partQty: number): number {
  if (!Number.isFinite(lineTotal) || origQty <= 0 || partQty <= 0) return 0;
  return roundMoney((lineTotal * partQty) / origQty);
}

export type SplitLineQuantityResult = {
  items: Record<string, unknown>[];
  advancedLineId: string;
};

export function splitLineQuantityForKdsTransition(
  items: readonly Record<string, unknown>[],
  lineId: string,
  units: number,
  nextStatus: string,
  nowMs: number,
  newLineId?: string,
): SplitLineQuantityResult | { error: string } {
  const idx = items.findIndex((row) => String(row.id ?? "").trim() === lineId.trim());
  if (idx < 0) return { error: "LINE_NOT_FOUND" };
  const row = items[idx]!;
  const origQty = readQty(row);
  if (!Number.isInteger(units) || units <= 0) return { error: "UNITS_INVALID" };
  if (units >= origQty) return { error: "UNITS_NOT_PARTIAL" };

  const advancedId =
    newLineId?.trim() ||
    `${lineId}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
  const lineTotal = Number(row.total);
  const remainderQty = origQty - units;

  const remainder = cloneLine(row);
  remainder.qty = remainderQty;
  remainder.quantity = remainderQty;
  remainder.total = splitLineTotal(lineTotal, origQty, remainderQty);
  remainder.updatedAt = nowMs;

  const advanced = applyKdsLineStatusTransition(
    {
      ...cloneLine(row),
      id: advancedId,
      qty: units,
      quantity: units,
      total: splitLineTotal(lineTotal, origQty, units),
      createdAt: nowMs,
    },
    nextStatus,
    nowMs,
  );

  const out = items.map((r) => cloneLine(r));
  out[idx] = remainder;
  out.splice(idx + 1, 0, advanced);

  const ids = new Set<string>();
  for (const line of out) {
    const id = String(line.id ?? "").trim();
    if (!id) return { error: "LINE_ID_REQUIRED" };
    if (ids.has(id)) return { error: "DUPLICATE_LINE_ID" };
    ids.add(id);
  }

  return { items: out, advancedLineId: advancedId };
}

export function assertNoDuplicateLineIds(items: readonly Record<string, unknown>[]): string | null {
  const ids = new Set<string>();
  for (const line of items) {
    const id = typeof line.id === "string" ? line.id.trim() : "";
    if (!id) return "LINE_ID_REQUIRED";
    if (ids.has(id)) return "DUPLICATE_LINE_ID";
    ids.add(id);
  }
  return null;
}

export function lineNeedsProjection(line: Record<string, unknown>): boolean {
  const st = normalizeProductionLineStatus(line.status);
  return st !== "pending";
}
