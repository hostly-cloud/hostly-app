import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import { handleCloseTpvOrder } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { parseCloseTpvOrderBody } from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  tpvMutationJsonError,
  tpvMutationJsonOk,
  isTpvMutationError,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthorizedTpvRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = await req.json().catch(() => null);
  const parsed = parseCloseTpvOrderBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const result = await handleCloseTpvOrder(authCtx, parsed);
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
