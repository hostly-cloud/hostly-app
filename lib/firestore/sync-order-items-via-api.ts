import { firestoreItemsToSaleLineIntents } from "@/lib/firestore/firestore-items-to-sale-intent";
import {
  cancelLinesViaApi,
  createOpenOrderViaApi,
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
};

/** @deprecated Usar tpv-mutations-via-api directamente. */
export async function syncOrderItemsViaApi(
  params: SyncOrderItemsViaApiParams,
  deps: SyncOrderItemsViaApiDeps = {},
): Promise<SyncOrderItemsViaApiResult> {
  const createOpen = deps.createOpenOrderViaApi ?? createOpenOrderViaApi;
  const upsertSaleLines = deps.upsertSaleLinesViaApi ?? upsertSaleLinesViaApi;
  const cancelLines = deps.cancelLinesViaApi ?? cancelLinesViaApi;
  const lines = firestoreItemsToSaleLineIntents(params.items);

  if (params.operation === "create_open") {
    if (!params.tableId?.trim()) {
      return { ok: false, error: "TABLE_ID_REQUIRED" };
    }
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

  const result = await upsertSaleLines({
    orderId,
    lines,
    markSent: params.operation === "send_items" || params.markSent === true,
  });
  return result.ok
    ? result
    : { ok: false, error: result.error, details: result.details };
}
