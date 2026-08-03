import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleRemoveLineUnit } from "@/lib/server/tpv/handle-tpv-order-lifecycle";
import {
  isTpvMutationError,
  tpvMutationJsonError,
  tpvMutationJsonOk,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const lineId = typeof body?.lineId === "string" ? body.lineId.trim() : "";
  if (!orderId || !lineId) {
    return NextResponse.json({ ok: false, error: "ORDER_AND_LINE_REQUIRED" }, { status: 400 });
  }

  const result = await handleRemoveLineUnit(authCtx, {
    orderId,
    lineId,
    idempotencyKey:
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined,
    expectedUpdatedAtMs:
      typeof body?.expectedUpdatedAtMs === "number" ? Math.floor(body.expectedUpdatedAtMs) : undefined,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
