import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
import {
  tpvMutationJsonError,
  tpvMutationJsonOk,
  isTpvMutationError,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthorizedTpvRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  if ("restaurantId" in body && body.restaurantId != null) {
    return NextResponse.json({ ok: false, error: "RESTAURANT_ID_NOT_ALLOWED" }, { status: 400 });
  }
  const mainTableId =
    typeof body.mainTableId === "string" ? body.mainTableId.trim() : "";
  if (!mainTableId) {
    return NextResponse.json({ ok: false, error: "TABLE_ID_REQUIRED" }, { status: 400 });
  }
  const memberIds = Array.isArray(body.memberIds)
    ? body.memberIds.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  const secondaryTableId =
    typeof body.secondaryTableId === "string" ? body.secondaryTableId.trim() : undefined;

  const result = await handleMergeTableGroupOrders(authCtx, {
    mainTableId,
    memberIds,
    secondaryTableId,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
