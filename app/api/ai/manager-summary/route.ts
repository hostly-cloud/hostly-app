import { NextResponse } from "next/server";
import { resolveHostlyAiTenant } from "@/lib/ai/hostly-ai-context";
import { getManagerDaySummary } from "@/lib/ai/tools/get-manager-day-summary";
import type {
  HostlyAiManagerSummaryResponse,
  HostlyManagerDaySummary,
} from "@/lib/ai/types";
import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type { AuthenticatedRestaurantDependencies } from "@/lib/server/auth/require-authenticated-restaurant";

export type ManagerSummaryRouteDependencies =
  AuthenticatedRestaurantDependencies & {
    getSummary?: (params: {
      db: AuthenticatedRestaurantDependencies["db"];
      restaurantId: string;
    }) => Promise<HostlyManagerDaySummary>;
  };

export async function handleManagerSummaryRequest(
  req: Request,
  dependencies?: ManagerSummaryRouteDependencies,
) {
  const tenant = await resolveHostlyAiTenant(req, dependencies);
  if (!tenant.ok) {
    const body: HostlyAiManagerSummaryResponse = {
      ok: false,
      error: tenant.error,
    };
    return NextResponse.json(body, { status: tenant.status });
  }
  // `viewer` conserva analytics.view para pantallas de analítica, pero el
  // resumen gerencial queda restringido a roles de gestión.
  const role = normalizeHostlyRole(tenant.role);
  if (
    !serverRoleHasCapability(tenant.role, "analytics.view") ||
    (role !== "owner" && role !== "admin" && role !== "manager")
  ) {
    const body: HostlyAiManagerSummaryResponse = {
      ok: false,
      error: "ANALYTICS_VIEW_REQUIRED",
    };
    return NextResponse.json(body, { status: 403 });
  }

  const startedAt = Date.now();
  try {
    const summary = await (dependencies?.getSummary ?? getManagerDaySummary)({
      db: tenant.db,
      restaurantId: tenant.restaurantId,
    });
    const body: HostlyAiManagerSummaryResponse = { ok: true, summary };
    return NextResponse.json(body);
  } catch {
    console.error("[ai/manager-summary]", {
      event: "summary_failed",
      uid: tenant.uid,
      restaurantId: tenant.restaurantId,
      code: "MANAGER_SUMMARY_FAILED",
      durationMs: Date.now() - startedAt,
    });
    const body: HostlyAiManagerSummaryResponse = {
      ok: false,
      error: "MANAGER_SUMMARY_FAILED",
    };
    return NextResponse.json(body, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleManagerSummaryRequest(req);
}
