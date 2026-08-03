import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleVoidPayment } from "@/lib/server/tpv/handle-tpv-payment-mutations";
import { parseVoidPaymentBody } from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  isTpvMutationError,
  tpvMutationJsonError,
  tpvMutationJsonOk,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = await req.json().catch(() => null);
  const parsed = parseVoidPaymentBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const result = await handleVoidPayment(authCtx, parsed);
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
