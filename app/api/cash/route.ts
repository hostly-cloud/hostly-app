import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  addCashMovement,
  CashRegisterError,
  closeCashSession,
  countCashBlind,
  getCashWorkspace,
  openCashSession,
  reopenCashCount,
} from "@/lib/server/cash/cash-register";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const snapshot = await getCashWorkspace({
      db: auth.db,
      restaurantId: auth.restaurantId,
      actorUid: auth.uid,
      actorRole: auth.role,
    });
    return NextResponse.json(
      { ok: true, snapshot },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof CashRegisterError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[cash:get]", error);
    return jsonError(500, "CASH_WORKSPACE_FAILED");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError(400, "INVALID_BODY");

    switch (body.action) {
      case "session.open": {
        const sessionId = await openCashSession({
          db: auth.db,
          restaurantId: auth.restaurantId,
          actorUid: auth.uid,
          actorEmail: auth.email,
          actorRole: auth.role,
          openingFloat: body.openingFloat,
          registerId: body.registerId,
          registerName: body.registerName,
        });
        return NextResponse.json({ ok: true, sessionId });
      }
      case "movement.add":
        await addCashMovement({
          db: auth.db,
          restaurantId: auth.restaurantId,
          actorUid: auth.uid,
          actorEmail: auth.email,
          actorRole: auth.role,
          sessionId: body.sessionId,
          type: body.type,
          amount: body.amount,
          reason: body.reason,
        });
        return NextResponse.json({ ok: true });
      case "session.count":
        await countCashBlind({
          db: auth.db,
          restaurantId: auth.restaurantId,
          actorUid: auth.uid,
          actorRole: auth.role,
          sessionId: body.sessionId,
          countedCash: body.countedCash,
        });
        return NextResponse.json({ ok: true });
      case "session.reopen":
        await reopenCashCount({
          db: auth.db,
          restaurantId: auth.restaurantId,
          actorUid: auth.uid,
          actorRole: auth.role,
          sessionId: body.sessionId,
          reason: body.reason,
        });
        return NextResponse.json({ ok: true });
      case "session.close": {
        const result = await closeCashSession({
          db: auth.db,
          restaurantId: auth.restaurantId,
          actorUid: auth.uid,
          actorRole: auth.role,
          sessionId: body.sessionId,
          discrepancyReason: body.discrepancyReason,
        });
        return NextResponse.json({ ok: true, result });
      }
      default:
        return jsonError(400, "UNKNOWN_CASH_OPERATION");
    }
  } catch (error) {
    if (error instanceof CashRegisterError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[cash:post]", error);
    return jsonError(500, "CASH_OPERATION_FAILED");
  }
}
