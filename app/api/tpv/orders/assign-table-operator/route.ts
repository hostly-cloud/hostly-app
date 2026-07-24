import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { handleAssignTableOperator } from "@/lib/server/tpv/handle-tpv-order-mutations";
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
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const assignedOperatorId =
    typeof body?.assignedOperatorId === "string" ? body.assignedOperatorId.trim() : "";
  const assignedOperatorName =
    typeof body?.assignedOperatorName === "string" ? body.assignedOperatorName.trim() : "";

  if (!tableId) {
    return NextResponse.json({ ok: false, error: "TABLE_ID_REQUIRED" }, { status: 400 });
  }
  if (!assignedOperatorId || !assignedOperatorName) {
    return NextResponse.json({ ok: false, error: "OPERATOR_REQUIRED" }, { status: 400 });
  }

  const result = await handleAssignTableOperator(authCtx, {
    tableId,
    orderId: orderId || undefined,
    assignedOperatorId,
    assignedOperatorName,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
