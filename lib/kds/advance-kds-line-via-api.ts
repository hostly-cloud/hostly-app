import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import {
  transitionLineQuantityViaApi,
  transitionLineStatusViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";

/**
 * Avanza una línea KDS/Sala vía API autoritativa.
 * qty>1 → transition-line-quantity (1 unidad); qty=1 → transition-line-status.
 */
export async function advanceKdsLineViaApi(params: {
  orderId: string;
  lineId: string;
  expectedStatus: string;
  nextStatus: string;
  quantity: number;
  operationId?: string;
}): Promise<{ ok: true } | { ok: false; error: string; details?: string | null }> {
  const orderId = params.orderId.trim();
  const lineId = params.lineId.trim();
  if (!orderId || !lineId) {
    return { ok: false, error: "ORDER_AND_LINE_REQUIRED" };
  }

  const expected = normalizeProductionLineStatus(params.expectedStatus);
  const next = normalizeProductionLineStatus(params.nextStatus);
  const qty = Math.floor(Number(params.quantity) || 0);
  const operationId =
    params.operationId?.trim() || globalThis.crypto.randomUUID();

  if (qty > 1) {
    const result = await transitionLineQuantityViaApi({
      orderId,
      lineId,
      units: 1,
      expectedStatus: expected,
      nextStatus: next,
      operationId,
    });
    return result.ok ? { ok: true } : result;
  }

  const result = await transitionLineStatusViaApi({
    orderId,
    lineId,
    expectedStatus: expected,
    nextStatus: next,
    operationId,
  });
  return result.ok ? { ok: true } : result;
}

/**
 * orderItems proyección: `sent` se materializa como `pending`.
 * Para CAS server hay que usar el status de `orders.items`.
 */
export function orderItemsUiStatusToOrdersExpected(uiStatus: unknown): string {
  const norm = normalizeProductionLineStatus(uiStatus);
  if (norm === "pending") return "sent";
  return norm;
}

export function resolveOrderItemLineId(item: {
  id: string;
  lineId?: unknown;
}): string {
  if (typeof item.lineId === "string" && item.lineId.trim()) {
    return item.lineId.trim();
  }
  return String(item.id ?? "").trim();
}
