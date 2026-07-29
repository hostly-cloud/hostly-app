import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleUpsertSaleLines } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { parseUpsertSaleLinesBody } from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  tpvMutationJsonError,
  tpvMutationJsonOk,
  isTpvMutationError,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = await req.json().catch(() => null);
  const parsed = parseUpsertSaleLinesBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const result = await handleUpsertSaleLines(authCtx, parsed);
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}