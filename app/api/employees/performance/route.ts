import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  buildEmployeeSalesPerformance,
  EmployeeSalesPerformanceError,
  saveEmployeeSalesGoal,
} from "@/lib/server/employees/employee-sales-performance";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function currentMonthMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    if (!serverRoleHasCapability(auth.role, "employees.manage")) {
      return jsonError(403, "EMPLOYEES_MANAGE_REQUIRED");
    }
    const month = new URL(req.url).searchParams.get("month") || currentMonthMadrid();
    const snapshot = await buildEmployeeSalesPerformance({
      db: auth.db,
      restaurantId: auth.restaurantId,
      month,
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof EmployeeSalesPerformanceError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/performance:get]", error);
    return jsonError(500, "EMPLOYEE_SALES_PERFORMANCE_FAILED");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    if (!serverRoleHasCapability(auth.role, "employees.manage")) {
      return jsonError(403, "EMPLOYEES_MANAGE_REQUIRED");
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.action !== "goal.save") return jsonError(400, "INVALID_BODY");
    await saveEmployeeSalesGoal({
      db: auth.db,
      restaurantId: auth.restaurantId,
      actorUid: auth.uid,
      employeeId: body.employeeId,
      month: body.month,
      targetAmount: body.targetAmount,
    });
    const snapshot = await buildEmployeeSalesPerformance({
      db: auth.db,
      restaurantId: auth.restaurantId,
      month: typeof body.month === "string" ? body.month : currentMonthMadrid(),
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof EmployeeSalesPerformanceError) {
      return jsonError(error.httpStatus, error.code);
    }
    console.error("[employees/performance:post]", error);
    return jsonError(500, "EMPLOYEE_SALES_GOAL_SAVE_FAILED");
  }
}
