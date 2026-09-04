import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import type { ClockAction } from "@/lib/employees/types";
import {
  captureTrustedNetwork,
  clearTrustedNetwork,
  createClockingChallenge,
  getClockingAdminState,
  getClockingSelfState,
  performQrClock,
  performTerminalClock,
  requestIpFromHeaders,
  saveClockingConfig,
  SecureClockingError,
  setEmployeeClockPin,
} from "@/lib/server/employees/secure-clocking";

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
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "self";
    if (mode === "self") {
      const state = await getClockingSelfState({
        db: auth.db,
        restaurantId: auth.restaurantId,
        employeeId: auth.uid,
      });
      return NextResponse.json(
        { ok: true, state },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!auth.canManageUsers) return jsonError(403, "USERS_MANAGE_REQUIRED");
    if (mode === "challenge") {
      const challenge = await createClockingChallenge({
        db: auth.db,
        restaurantId: auth.restaurantId,
      });
      return NextResponse.json(
        { ok: true, challenge },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (mode === "admin") {
      const state = await getClockingAdminState({
        db: auth.db,
        restaurantId: auth.restaurantId,
        includeSensitive: true,
      });
      return NextResponse.json(
        { ok: true, state },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return jsonError(400, "INVALID_CLOCKING_MODE");
  } catch (error) {
    if (error instanceof SecureClockingError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/clocking:get]", error);
    return jsonError(500, "CLOCKING_STATE_FAILED");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError(400, "INVALID_BODY");
    const action = body.action;
    const requestIp = requestIpFromHeaders(req.headers);

    if (action === "clock.qr") {
      if (!isClockAction(body.clockAction)) return jsonError(400, "INVALID_CLOCK_ACTION");
      const state = await performQrClock({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        token: body.token,
        action: body.clockAction,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
        ip: requestIp,
      });
      return NextResponse.json({ ok: true, state });
    }

    if (!auth.canManageUsers) return jsonError(403, "USERS_MANAGE_REQUIRED");

    if (action === "config.save") {
      await saveClockingConfig({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        latitude: body.latitude,
        longitude: body.longitude,
        radiusMeters: body.radiusMeters,
        maxAccuracyMeters: body.maxAccuracyMeters,
        enabled: body.enabled,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "network.capture") {
      await captureTrustedNetwork({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        ip: requestIp,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "network.clear") {
      await clearTrustedNetwork({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "pin.set") {
      await setEmployeeClockPin({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        employeeId: body.employeeId,
        pin: body.pin,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "clock.terminal") {
      if (!isClockAction(body.clockAction)) return jsonError(400, "INVALID_CLOCK_ACTION");
      await performTerminalClock({
        db: auth.db,
        restaurantId: auth.restaurantId,
        actorUid: auth.uid,
        actorRole: auth.role,
        employeeId: body.employeeId,
        pin: body.pin,
        action: body.clockAction,
        ip: requestIp,
      });
      return NextResponse.json({ ok: true });
    }

    return jsonError(400, "UNKNOWN_CLOCKING_OPERATION");
  } catch (error) {
    if (error instanceof SecureClockingError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/clocking:post]", error);
    return jsonError(500, "CLOCKING_OPERATION_FAILED");
  }
}
