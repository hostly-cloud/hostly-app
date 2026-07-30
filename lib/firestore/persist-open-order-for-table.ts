import {
  doc,
  getDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import {
  computeBillableTotalFromPersistItems,
  mergeOrderItemsForPersist,
} from "@/lib/firestore/merge-order-items-for-persist";
import { dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";

export type PersistOpenOrderForTableParams = {
  restaurantId: string;
  tableId: string;
  tableLabel: string;
  /** Payload ya serializado como guarda `orderLinesToFirestoreItems`. */
  items: Record<string, unknown>[];
  total: number;
  /**
   * Obligatorio. La creación de pedidos activos debe pasar por create-open (3B-2A.1).
   * Este helper solo actualiza un pedido existente (draft sync).
   */
  existingOrderId: string;
};

/**
 * @deprecated LEGACY — no crea pedidos activos.
 * Solo actualiza `orders/{existingOrderId}` (items/total) para sync de borrador.
 * Altas activas: `createOpenOrderViaApi` / `handleCreateOpenOrder`.
 */
export async function persistOpenOrderForTable(
  db: Firestore,
  params: PersistOpenOrderForTableParams,
): Promise<string> {
  const {
    restaurantId,
    tableId,
    items,
    total,
    existingOrderId,
  } = params;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const tid = tableId.trim();
  const rid = restaurantId.trim();
  const id = existingOrderId?.trim() ?? "";

  if (!id) {
    throw new Error(
      "PERSIST_OPEN_ORDER_CREATE_FORBIDDEN: use create-open API for new active table orders",
    );
  }

  let mergedItems = items;
  let mergedTotal = safeTotal;

  try {
    const snap = await getDoc(doc(db, "orders", id));
    if (snap.exists()) {
      const serverItems = (snap.data() as { items?: unknown }).items;
      mergedItems = mergeOrderItemsForPersist(serverItems, items);
      mergedTotal = computeBillableTotalFromPersistItems(mergedItems);
    }
  } catch (mergeReadErr) {
    console.warn(
      "[persistOpenOrderForTable] no se pudo leer order para merge; se usa payload local.",
      mergeReadErr,
    );
  }

  await dbgUpdateDoc(
    doc(db, "orders", id),
    {
      items: mergedItems,
      total: mergedTotal,
      updatedAt: serverTimestamp(),
    },
    {
      label: "persistOpenOrderForTable:update",
      collection: "orders",
      restaurantId: rid,
      tableId: tid,
      orderId: id,
    },
  );
  return id;
}
