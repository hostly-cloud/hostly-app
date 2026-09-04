import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  applyClockAction,
  correctTimeEntry,
  deleteEmployeeShift,
  EmployeeOperationsError,
  listEmployeeOperations,
  saveEmployeeShift,
  upsertEmployeeProfile,
} from "@/lib/server/employees/employee-operations";
import type { ClockAction } from "@/lib/employees/types";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isClockAction(value: unknown): value is ClockAction {
  return (
    value === "clock_in" ||
    value === "break_start" ||
    value === "break_end" ||
    value === "clock_out"
  );
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    if (!auth.canManageUsers) return jsonError(403, "USERS_MANAGE_REQUIRED");

    const url = new URL(req.url);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const from = url.searchParams.get("from") || today;
    const to = url.searchParams.get("to") || today;
    const snapshot = await listEmployeeOperations({
      db: auth.db,
      restaurantId: auth.restaurantId,
      from,
      to,
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof EmployeeOperationsError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/operations:get]", error);
    return jsonError(500, "EMPLOYEE_OPERATIONS_LIST_FAILED");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError(400, "INVALID_BODY");
    const action = body.action;

    if (action === "time.clock") {
      if (!isClockAction(body.clockAction)) return jsonError(400, "INVALID_CLOCK_ACTION");
      const requestedEmployeeId =
        typeof body.employeeId === "string" && body.employeeId.trim()
          ? body.employeeId.trim()
          : auth.uid;
      const actingOnOtherEmployee = requestedEmployeeId !== auth.uid;
      if (actingOnOtherEmployee && !auth.canManageUsers) {
        return jsonError(403, "USERS_MANAGE_REQUIRED");
      }
      await applyClockAction({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        employeeId: requestedEmployeeId,
        action: body.clockAction,
        source: actingOnOtherEmployee ? "manager" : "self",
      });
      return NextResponse.json({ ok: true });
    }

    if (!auth.canManageUsers) return jsonError(403, "USERS_MANAGE_REQUIRED");

    if (action === "profile.save") {
      await upsertEmployeeProfile({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        userId: body.userId,
        displayName: body.displayName,
        email: body.email,
        phone: body.phone,
        position: body.position,
        area: body.area,
        startDate: body.startDate,
        notes: body.notes,
        active: body.active,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "shift.save") {
      const id = await saveEmployeeShift({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        id: body.id,
        employeeId: body.employeeId,
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        breakMinutes: body.breakMinutes,
        area: body.area,
        notes: body.notes,
      });
      return NextResponse.json({ ok: true, id });
    }

    if (action === "shift.delete") {
      await deleteEmployeeShift({
        db: auth.db,
        restaurantId: auth.restaurantId,
        id: body.id,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "time.correct") {
      await correctTimeEntry({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        id: body.id,
        clockInAt: body.clockInAt,
        clockOutAt: body.clockOutAt,
        breakMinutes: body.breakMinutes,
        reason: body.reason,
      });
      return NextResponse.json({ ok: true });
    }

    return jsonError(400, "UNKNOWN_EMPLOYEE_OPERATION");
  } catch (error) {
    if (error instanceof EmployeeOperationsError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/operations:post]", error);
    return jsonError(500, "EMPLOYEE_OPERATION_FAILED");
  }
}
