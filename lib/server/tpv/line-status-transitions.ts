import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";

/** Transiciones KDS — sin cancelled (eso es cancel-lines + tpv.cancel_line). */
const KDS_ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["pending", "sent"],
  sent: ["sent", "preparing", "prepared"],
  preparing: ["preparing", "prepared"],
  prepared: ["prepared", "served"],
  ready: ["ready", "served"],
  served: ["served"],
};

export function isAllowedKdsLineStatusTransition(from: unknown, to: unknown): boolean {
  const fromNorm = normalizeProductionLineStatus(from);
  const toNorm = normalizeProductionLineStatus(to);
  if (toNorm === "cancelled") return false;
  const allowed = KDS_ALLOWED_TRANSITIONS[fromNorm];
  if (!allowed) return false;
  return allowed.includes(toNorm);
}

export function timestampFieldForKdsStatus(status: unknown): string | null {
  const norm = normalizeProductionLineStatus(status);
  switch (norm) {
    case "sent":
      return "sentAt";
    case "preparing":
      return "preparingAt";
    case "prepared":
      return "preparedAt";
    case "served":
      return "servedAt";
    default:
      return null;
  }
}

export function applyKdsLineStatusTransition(
  line: Record<string, unknown>,
  nextStatus: string,
  nowMs: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...line,
    status: normalizeProductionLineStatus(nextStatus),
    updatedAt: nowMs,
  };
  const tsField = timestampFieldForKdsStatus(nextStatus);
  if (tsField) out[tsField] = nowMs;
  return out;
}

export function applyLineCancellation(
  line: Record<string, unknown>,
  nowMs: number,
  cancelledBy?: string,
): Record<string, unknown> {
  return {
    ...line,
    status: "cancelled",
    cancelledAt: nowMs,
    quantity: 0,
    qty: 0,
    total: 0,
    ...(cancelledBy ? { cancelledBy } : {}),
    updatedAt: nowMs,
  };
}

/** @deprecated Usar isAllowedKdsLineStatusTransition */
export function isAllowedLineStatusTransition(from: unknown, to: unknown): boolean {
  return isAllowedKdsLineStatusTransition(from, to);
}

/** @deprecated Usar applyKdsLineStatusTransition */
export function applyLineStatusTransition(
  line: Record<string, unknown>,
  nextStatus: string,
  nowMs: number,
): Record<string, unknown> {
  return applyKdsLineStatusTransition(line, nextStatus, nowMs);
}
