import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleSplitTableGroupOrders } from "@/lib/server/tpv/handle-split-table-group-orders";
import {
  isTpvMutationError,
  tpvMutationJsonError,
  tpvMutationJsonOk,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const mainTableId = typeof body?.mainTableId === "string" ? body.mainTableId.trim() : "";
  const removedTableIds = Array.isArray(body?.removedTableIds)
    ? body.removedTableIds.filter((id): id is string => typeof id === "string")
    : [];
  const remainingTableIds = Array.isArray(body?.remainingTableIds)
    ? body.remainingTableIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const idempotencyKey =
    typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined;
  const expectedUpdatedAtMs =
    typeof body?.expectedUpdatedAtMs === "number" ? Math.floor(body.expectedUpdatedAtMs) : undefined;
  const newMainTableId =
    typeof body?.newMainTableId === "string" ? body.newMainTableId.trim() : undefined;

  if (!mainTableId || removedTableIds.length === 0) {
    return NextResponse.json({ ok: false, error: "TABLE_GROUP_INVALID" }, { status: 400 });
  }

  const result = await handleSplitTableGroupOrders(authCtx, {
    mainTableId,
    removedTableIds,
    remainingTableIds,
    newMainTableId,
    idempotencyKey,
    expectedUpdatedAtMs,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
