import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

export type SplitTableGroupOrdersParams = {
  mainTableId: string;
  memberIds?: string[];
  separateTableId?: string;
  operationId: string;
};

export type SplitTableGroupOrdersClientResult =
  | {
      ok: true;
      split: boolean;
      destOrderId: string;
      ordersByTableId: Record<string, string>;
      reason?: string;
    }
  | { ok: false; error: string; details?: string | null };

/**
 * Split autoritativo vía API Admin. El cliente no persiste tableGroups antes del ACK.
 */
export async function splitTableGroupOrdersViaApi(
  params: SplitTableGroupOrdersParams,
): Promise<SplitTableGroupOrdersClientResult> {
  const response = await authenticatedApiFetch("/api/tpv/orders/split-table-group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mainTableId: params.mainTableId.trim(),
      memberIds: params.memberIds,
      separateTableId: params.separateTableId?.trim() || undefined,
      operationId: params.operationId.trim(),
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    details?: string | null;
    split?: boolean;
    destOrderId?: string;
    ordersByTableId?: Record<string, string>;
    reason?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    const error = payload?.error ?? "SPLIT_TABLE_GROUP_FAILED";
    const details = payload?.details ?? null;
    if (typeof console !== "undefined") {
      console.error("[Hostly:TableJoinMerge]", "split:api-http-error", {
        status: response.status,
        error,
        details,
        mainTableId: params.mainTableId,
        separateTableId: params.separateTableId ?? null,
        operationId: params.operationId,
      });
    }
    return { ok: false, error, details };
  }

  return {
    ok: true,
    split: payload.split === true,
    destOrderId: typeof payload.destOrderId === "string" ? payload.destOrderId : "",
    ordersByTableId:
      payload.ordersByTableId && typeof payload.ordersByTableId === "object"
        ? payload.ordersByTableId
        : {},
    reason: payload.reason,
  };
}
