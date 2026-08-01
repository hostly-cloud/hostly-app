import type { Firestore } from "firebase/firestore";
import { traceEmptyDraft } from "@/lib/debug/tpv-empty-draft-trace";
import { selectDraftPersistableFirestoreItems } from "@/lib/firestore/merge-order-items-for-persist";
import { persistDraftItemsViaApi } from "@/lib/firestore/tpv-mutations-via-api";

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
 * Actualiza `orders/{existingOrderId}` para sync de borrador vía API Admin.
 * `items: []` es una mutación válida (elimina pending omitidas; conserva no-pending).
 */
export async function persistOpenOrderForTable(
  _db: Firestore,
  params: PersistOpenOrderForTableParams,
): Promise<string> {
  const { tableId, items, existingOrderId } = params;
  const tid = tableId.trim();
  const id = existingOrderId?.trim() ?? "";

  if (!id) {
    throw new Error(
      "PERSIST_OPEN_ORDER_CREATE_FORBIDDEN: use create-open API for new active table orders",
    );
  }

  const draftItems = selectDraftPersistableFirestoreItems(items);

  traceEmptyDraft("draftApi.request", {
    tableId: tid,
    orderId: id,
    localItems: items.length,
    draftPending: draftItems.length,
    deleteEffect: draftItems.length === 0,
  });

  const result = await persistDraftItemsViaApi({
    orderId: id,
    items: draftItems,
  });

  if (!result.ok) {
    traceEmptyDraft("draftApi.error", {
      tableId: tid,
      orderId: id,
      error: result.error,
      details: result.details ?? null,
    });
    throw new Error(result.error);
  }

  traceEmptyDraft("draftApi.success", {
    tableId: tid,
    orderId: result.orderId,
    total: result.total,
    pendingRemoved: result.pendingRemoved,
    nonPendingPreserved: result.nonPendingPreserved,
    resultItems: result.items.length,
  });

  return result.orderId;
}
