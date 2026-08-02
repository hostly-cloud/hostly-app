import type { Firestore } from "firebase/firestore";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import {
  printTableJoinFirestoreDebugReport,
  type TableJoinFirestoreDebugReport,
} from "@/lib/firestore/table-join-merge-diagnostic";

export type MergeOpenOrdersForTableGroupOptions = {
  secondaryTableId?: string;
  operationId: string;
  memberIds?: string[];
};

export type MergeOpenOrdersForTableGroupResult = {
  ok: boolean;
  merged: boolean;
  destOrderId?: string;
  mainTableId?: string;
  memberIds?: string[];
  error?: string;
  debugReport: TableJoinFirestoreDebugReport;
};

/**
 * Join autoritativo vía API Admin (topología + pedidos + locks).
 * El cliente no persiste tableGroups antes del ACK.
 */
export async function mergeOpenOrdersForTableGroup(
  _db: Firestore,
  restaurantId: string,
  mainTableId: string,
  memberIds: string[],
  options: MergeOpenOrdersForTableGroupOptions,
): Promise<MergeOpenOrdersForTableGroupResult> {
  const rid = restaurantId.trim();
  const mainId = mainTableId.trim();
  const uniqueMemberIds = [
    ...new Set(memberIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  const secondaryTableId = options.secondaryTableId?.trim() || undefined;
  const operationId = options.operationId.trim();

  const report: TableJoinFirestoreDebugReport = {
    mergeExecuted: true,
    mergeMerged: false,
    brokenAtStep: null,
    brokenReason: null,
    restaurantId: rid,
    mainTableId: mainId,
    secondaryTableId: secondaryTableId || null,
    memberIds: uniqueMemberIds,
    beforeByTable: {},
    destOrderId: null,
    destTableIdBefore: null,
    plannedFinalItems: [],
    mergedSourceOrderIds: [],
    afterByTable: {},
  };

  if (!rid || !mainId || !operationId) {
    report.brokenAtStep = "1-validacion-ids";
    report.brokenReason = "restaurantId, mainTableId u operationId vacío";
    printTableJoinFirestoreDebugReport(report);
    return { ok: false, merged: false, error: "INVALID_PARAMS", debugReport: report };
  }

  const response = await authenticatedApiFetch("/api/tpv/orders/merge-table-group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mainTableId: mainId,
      secondaryTableId,
      memberIds: uniqueMemberIds.length > 0 ? uniqueMemberIds : undefined,
      operationId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    merged?: boolean;
    destOrderId?: string;
    mainTableId?: string;
    memberIds?: string[];
    reason?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    report.brokenAtStep = "8-batch-commit";
    report.brokenReason = payload?.error ?? "MERGE_TABLE_GROUP_FAILED";
    printTableJoinFirestoreDebugReport(report);
    return {
      ok: false,
      merged: false,
      error: payload?.error ?? "MERGE_TABLE_GROUP_FAILED",
      debugReport: report,
    };
  }

  report.mergeMerged = payload.merged === true;
  report.destOrderId = payload.destOrderId ?? null;
  report.resultDestOrderId = payload.destOrderId;
  if (!payload.merged) {
    report.brokenAtStep = "5-solo-una-order";
    report.brokenReason = payload.reason ?? "not_merged";
  }
  printTableJoinFirestoreDebugReport(report);
  return {
    ok: true,
    merged: payload.merged === true,
    destOrderId: payload.destOrderId,
    mainTableId: payload.mainTableId,
    memberIds: payload.memberIds,
    debugReport: report,
  };
}
