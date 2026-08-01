import { firestoreItemsToSaleLineIntents } from "@/lib/firestore/firestore-items-to-sale-intent";
import { selectDraftPersistableFirestoreItems } from "@/lib/firestore/merge-order-items-for-persist";
import {
  cancelLinesViaApi,
  createOpenOrderViaApi,
  persistDraftItemsViaApi,
  upsertSaleLinesViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import type { TpvOrderItemsOperation } from "@/lib/server/tpv/order-mutation-contract";
import type { TableOperatorAssignment } from "@/lib/tpv/table-operator-assignment";

export type SyncOrderItemsViaApiParams = {
  operation: TpvOrderItemsOperation;
  orderId?: string | null;
  tableId?: string;
  tableLabel?: string;
  items: Record<string, unknown>[];
  cancelledLineIds?: string[];
  operatorAssignment?: Pick<
    TableOperatorAssignment,
    "assignedOperatorId" | "assignedOperatorName"
  > | null;
  markSent?: boolean;
};

export type SyncOrderItemsViaApiSuccess = {
  ok: true;
  orderId: string;
  total: number;
  inventoryWarnings: ModifierStockConsumptionWarning[];
};

export type SyncOrderItemsViaApiResult =
  | SyncOrderItemsViaApiSuccess
  | { ok: false; error: string; details?: string | null };

export type SyncOrderItemsViaApiDeps = {
  createOpenOrderViaApi?: typeof createOpenOrderViaApi;
  upsertSaleLinesViaApi?: typeof upsertSaleLinesViaApi;
  cancelLinesViaApi?: typeof cancelLinesViaApi;
  persistDraftItemsViaApi?: typeof persistDraftItemsViaApi;
};

/** @deprecated Usar tpv-mutations-via-api directamente. */
export async function syncOrderItemsViaApi(
  params: SyncOrderItemsViaApiParams,
  deps: SyncOrderItemsViaApiDeps = {},
): Promise<SyncOrderItemsViaApiResult> {
  const createOpen = deps.createOpenOrderViaApi ?? createOpenOrderViaApi;
  const upsertSaleLines = deps.upsertSaleLinesViaApi ?? upsertSaleLinesViaApi;
  const cancelLines = deps.cancelLinesViaApi ?? cancelLinesViaApi;
  const persistDraft = deps.persistDraftItemsViaApi ?? persistDraftItemsViaApi;

  if (params.operation === "create_open") {
    if (!params.tableId?.trim()) {
      return { ok: false, error: "TABLE_ID_REQUIRED" };
    }
    const markSent = params.markSent === true;
    const itemsForCreate = markSent
      ? params.items
      : selectDraftPersistableFirestoreItems(params.items);
    const lines = firestoreItemsToSaleLineIntents(itemsForCreate);
    const result = await createOpen({
      tableId: params.tableId,
      tableLabel: params.tableLabel,
      lines,
      markSent: params.markSent,
      operatorAssignment: params.operatorAssignment,
    });
    return result.ok
      ? result
      : { ok: false, error: result.error, details: result.details };
  }

  const orderId = params.orderId?.trim();
  if (!orderId) return { ok: false, error: "ORDER_ID_REQUIRED" };

  if (params.operation === "cancel_lines") {
    const lineIds = params.cancelledLineIds?.filter(Boolean) ?? [];
    if (lineIds.length === 0) return { ok: false, error: "LINE_IDS_REQUIRED" };
    const result = await cancelLines({ orderId, lineIds });
    return result.ok
      ? {
          ok: true,
          orderId: result.orderId,
          total: result.total,
          inventoryWarnings: [],
        }
      : { ok: false, error: result.error, details: result.details };
  }

  if (params.operation === "persist_items") {
    const draftItems = selectDraftPersistableFirestoreItems(params.items);
    // `[]` es mutación válida: el servidor elimina pending omitidas.
    const result = await persistDraft({
      orderId,
      items: draftItems,
    });
    return result.ok
      ? {
          ok: true,
          orderId: result.orderId,
          total: result.total,
          inventoryWarnings: [],
        }
      : { ok: false, error: result.error, details: result.details };
  }

  const markSent =
    params.operation === "send_items" || params.markSent === true;
  const itemsForUpsert = markSent
    ? params.items
    : selectDraftPersistableFirestoreItems(params.items);
  const lines = firestoreItemsToSaleLineIntents(itemsForUpsert);
  const result = await upsertSaleLines({
    orderId,
    lines,
    markSent,
  });
  return result.ok
    ? result
    : { ok: false, error: result.error, details: result.details };
}
