import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleRefundPayment } from "@/lib/server/tpv/handle-tpv-payment-mutations";
import { parseRefundPaymentBody } from "@/lib/server/tpv/tpv-mutation-dtos";
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
  const parsed = parseRefundPaymentBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const result = await handleRefundPayment(authCtx, parsed);
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  if (result.fiscal) await enqueueFiscalRecord(result.fiscal.recordId).catch(() => undefined);
  return tpvMutationJsonOk(result);
}
