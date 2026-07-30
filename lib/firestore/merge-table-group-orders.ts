import type { Firestore } from "firebase/firestore";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import {
  printTableJoinFirestoreDebugReport,
  type TableJoinFirestoreDebugReport,
} from "@/lib/firestore/table-join-merge-diagnostic";

export type MergeOpenOrdersForTableGroupOptions = {
  secondaryTableId?: string;
};

export type MergeOpenOrdersForTableGroupResult = {
  merged: boolean;
  destOrderId?: string;
  debugReport: TableJoinFirestoreDebugReport;
};

/**
 * Fusiona comandas del grupo vía API Admin (actualiza tableOrderLocks atómicamente).
 * La lógica cliente de escritura directa quedó retirada en 3B-2A.1.
 */
export async function mergeOpenOrdersForTableGroup(
  _db: Firestore,
  restaurantId: string,
  mainTableId: string,
  memberIds: string[],
  options?: MergeOpenOrdersForTableGroupOptions,
): Promise<MergeOpenOrdersForTableGroupResult> {
  const rid = restaurantId.trim();
  const mainId = mainTableId.trim();
  const uniqueMemberIds = [
    ...new Set(memberIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];

  const report: TableJoinFirestoreDebugReport = {
    mergeExecuted: true,
    mergeMerged: false,
    brokenAtStep: null,
    brokenReason: null,
    restaurantId: rid,
    mainTableId: mainId,
    secondaryTableId: options?.secondaryTableId?.trim() || null,
    memberIds: uniqueMemberIds,
    beforeByTable: {},
    destOrderId: null,
    destTableIdBefore: null,
    plannedFinalItems: [],
    mergedSourceOrderIds: [],
    afterByTable: {},
  };

  if (!rid || !mainId) {
    report.brokenAtStep = "1-validacion-ids";
    report.brokenReason = "restaurantId o mainTableId vacío";
    printTableJoinFirestoreDebugReport(report);
    return { merged: false, debugReport: report };
  }

  const response = await authenticatedApiFetch("/api/tpv/orders/merge-table-group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mainTableId: mainId,
      memberIds: uniqueMemberIds,
      secondaryTableId: options?.secondaryTableId?.trim() || undefined,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    merged?: boolean;
    destOrderId?: string;
    reason?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    report.brokenAtStep = "8-batch-commit";
    report.brokenReason = payload?.error ?? "MERGE_TABLE_GROUP_FAILED";
    printTableJoinFirestoreDebugReport(report);
    return { merged: false, debugReport: report };
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
    merged: payload.merged === true,
    destOrderId: payload.destOrderId,
    debugReport: report,
  };
}
