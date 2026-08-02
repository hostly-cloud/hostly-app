import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import { handleSplitTableGroupOrders } from "@/lib/server/tpv/handle-split-table-group-orders";
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
    : undefined;
  const separateTableId =
    typeof body.separateTableId === "string" ? body.separateTableId.trim() : undefined;
  const operationId =
    typeof body.operationId === "string"
      ? body.operationId.trim()
      : typeof body.idempotencyKey === "string"
        ? body.idempotencyKey.replace(/^split-table-group:/, "").trim()
        : "";
  if (!operationId) {
    return NextResponse.json({ ok: false, error: "OPERATION_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const result = await handleSplitTableGroupOrders(authCtx, {
      mainTableId,
      memberIds,
      separateTableId,
      operationId,
    });
    if (isTpvMutationError(result)) return tpvMutationJsonError(result);
    return tpvMutationJsonOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Hostly:SplitTableGroup] route_unhandled", {
      operationId,
      mainTableId,
      separateTableId: separateTableId ?? null,
      errorMessage: msg,
      stack: e instanceof Error ? e.stack ?? null : null,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "SPLIT_TABLE_GROUP_FAILED",
        details:
          process.env.NODE_ENV === "production"
            ? null
            : msg.slice(0, 240),
      },
      { status: 500 },
    );
  }
}
