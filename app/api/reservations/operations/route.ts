import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  createOperationalReservation,
  transitionOperationalReservation,
  updateOperationalReservation,
} from "@/lib/server/reservas/reservation-operations";
import {
  normalizeOperationalReservationStatus,
  type OperationalReservationStatus,
} from "@/lib/reservas/reservation-operations";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function statusForError(code: string): number {
  if (code === "RESERVATION_NOT_FOUND" || code === "TABLE_NOT_FOUND") return 404;
  if (code === "RESERVATION_TENANT_MISMATCH" || code === "TABLE_TENANT_MISMATCH") return 403;
  if (
    code === "TABLE_TIME_CONFLICT" ||
    code === "TABLE_CAPACITY_EXCEEDED" ||
    code === "TABLE_NOT_AVAILABLE" ||
    code === "INVALID_STATUS_TRANSITION" ||
    code === "TABLE_REQUIRED_TO_SEAT"
  ) return 409;
  if (
    code === "INVALID_DATE" ||
    code === "INVALID_TIME" ||
    code === "INVALID_PARTY_SIZE" ||
    code === "CUSTOMER_NAME_REQUIRED" ||
    code === "RESERVATION_REQUIRED"
  ) return 400;
  return 500;
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "tpv.sell")) {
    return jsonError(403, "RESERVATIONS_OPERATION_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "create") {
      const result = await createOperationalReservation({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        userId: authCtx.uid,
        input: body,
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    const reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
    if (action === "update") {
      const result = await updateOperationalReservation({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        userId: authCtx.uid,
        reservationId,
        input: body,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "transition") {
      const rawStatus = body.nextStatus;
      const nextStatus = normalizeOperationalReservationStatus(rawStatus) as OperationalReservationStatus;
      if (rawStatus !== nextStatus) return jsonError(400, "INVALID_STATUS");
      const result = await transitionOperationalReservation({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        userId: authCtx.uid,
        reservationId,
        nextStatus,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return jsonError(400, "INVALID_ACTION");
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESERVATION_OPERATION_FAILED";
    return jsonError(statusForError(code), statusForError(code) === 500 ? "RESERVATION_OPERATION_FAILED" : code);
  }
}
