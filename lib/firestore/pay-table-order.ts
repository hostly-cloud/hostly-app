import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { isOrderStatusActiveForTableOccupancy } from "@/lib/firestore/order-table-occupancy";

/**
 * Marca como pagadas todas las órdenes activas de una mesa (mismo `restaurantId` y `tableId`).
 * Solo actualiza documentos que siguen activos para ocupación de mesa.
 */
export async function handlePayTableOrder(
  tableId: string,
  {
    db,
    restaurantId,
  }: {
    db: Firestore;
    restaurantId: string;
  },
): Promise<{ updatedCount: number }> {
  const tid = String(tableId).trim();
  if (!tid || !restaurantId) return { updatedCount: 0 };

  const q = query(
    collection(db, "orders"),
    where("restaurantId", "==", restaurantId),
    where("tableId", "==", tid),
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as { restaurantId?: string; status?: string };
    if (data.restaurantId !== restaurantId) continue;
    if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
    batch.update(d.ref, {
      status: "paid",
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      paymentRequestedAt: null,
    });
    n++;
  }
  if (n > 0) await batch.commit();
  return { updatedCount: n };
}
