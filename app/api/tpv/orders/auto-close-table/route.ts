import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleAutoCloseEmptyTable } from "@/lib/server/tpv/handle-tpv-order-lifecycle";
import {
  isTpvMutationError,
  tpvMutationJsonError,
  tpvMutationJsonOk,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const tableId = typeof body?.tableId === "string" ? body.tableId.trim() : "";
  if (!tableId) return NextResponse.json({ ok: false, error: "TABLE_ID_REQUIRED" }, { status: 400 });

  const result = await handleAutoCloseEmptyTable(authCtx, {
    tableId,
    idempotencyKey:
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
