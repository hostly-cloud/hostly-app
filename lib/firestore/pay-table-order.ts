import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

/**
 * Pago total de mesa vía API Admin (libera tableOrderLocks atómicamente).
 * No usar para pagos parciales: el pedido debe permanecer activo y con lock.
 */
export async function handlePayTableOrder(
  tableId: string,
  {
    restaurantId,
  }: {
    db?: unknown;
    restaurantId: string;
  },
): Promise<{ updatedCount: number; lockReleased?: boolean; paidOrderIds?: string[] }> {
  const tid = String(tableId).trim();
  if (!tid || !restaurantId?.trim()) return { updatedCount: 0 };

  const response = await authenticatedApiFetch("/api/tpv/orders/pay-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId: tid }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    updatedCount?: number;
    lockReleased?: boolean;
    paidOrderIds?: string[];
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "PAY_TABLE_FAILED");
  }

  return {
    updatedCount: Number(payload.updatedCount) || 0,
    lockReleased: payload.lockReleased === true,
    paidOrderIds: Array.isArray(payload.paidOrderIds) ? payload.paidOrderIds : [],
  };
}
