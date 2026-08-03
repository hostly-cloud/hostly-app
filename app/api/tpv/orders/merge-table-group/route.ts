import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
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
  const memberTableIds = Array.isArray(body?.memberTableIds)
    ? body.memberTableIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!mainTableId || memberTableIds.length === 0) {
    return NextResponse.json({ ok: false, error: "TABLE_GROUP_INVALID" }, { status: 400 });
  }

  const result = await handleMergeTableGroupOrders(authCtx, {
    mainTableId,
    memberTableIds,
    idempotencyKey:
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
