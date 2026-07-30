import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import { handlePayTableOrders } from "@/lib/server/tpv/handle-pay-table-orders";
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
  const tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  if (!tableId) {
    return NextResponse.json({ ok: false, error: "TABLE_ID_REQUIRED" }, { status: 400 });
  }

  const result = await handlePayTableOrders(authCtx, { tableId });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
