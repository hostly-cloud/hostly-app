import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleChargeOrder } from "@/lib/server/tpv/handle-tpv-payment-mutations";
import { parseChargeOrderBody } from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  tpvMutationJsonError,
  tpvMutationJsonOk,
  isTpvMutationError,
} from "@/lib/server/tpv/tpv-mutation-response";
import { enqueueFiscalRecord } from "@/lib/server/fiscal/fiscal-outbox-queue";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = await req.json().catch(() => null);
  const parsed = parseChargeOrderBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const result = await handleChargeOrder(authCtx, parsed);
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  if (result.fiscal) {
    await enqueueFiscalRecord(result.fiscal.recordId).catch((error) => {
      console.error("[fiscal-outbox] initial enqueue failed", {
        recordId: result.fiscal?.recordId,
        code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
    });
  }
  return tpvMutationJsonOk(result);
}
