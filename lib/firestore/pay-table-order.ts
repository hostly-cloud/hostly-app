import type { Firestore } from "firebase/firestore";
import { finalizeTableAfterPaymentViaApi } from "@/lib/firestore/tpv-mutations-via-api";

/**
 * Finaliza la mesa tras cobro autoritativo (sin marcar orders como paid sin payment).
 */
export async function handlePayTableOrder(
  tableId: string,
  {
    restaurantId,
  }: {
    db: Firestore;
    restaurantId: string;
  },
): Promise<{ updatedCount: number }> {
  const tid = String(tableId).trim();
  if (!tid || !restaurantId) return { updatedCount: 0 };

  const result = await finalizeTableAfterPaymentViaApi({
    tableId: tid,
    idempotencyKey: `finalize-table:${restaurantId}:${tid}`,
  });
  if (!result.ok) {
    if (result.error === "TABLE_HAS_UNPAID_ORDERS") return { updatedCount: 0 };
    throw new Error(result.error);
  }
  return { updatedCount: 1 };
}
