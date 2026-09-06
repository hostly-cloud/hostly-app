import { NextResponse } from "next/server";
import { resolveHostlyAiTenant } from "@/lib/ai/hostly-ai-context";
import { getManagerAnalyticsContext } from "@/lib/ai/tools/get-manager-analytics-context";
import { generateManagerAnalyticsResult } from "@/lib/ai/tools/generate-manager-analytics-report";
import type { ManagerAnalyticsGenerationResponse } from "@/lib/ai/manager-analytics-types";
import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";

function error(status: number, code: string) {
  const body: ManagerAnalyticsGenerationResponse = { ok: false, error: code };
  return NextResponse.json(body, { status });
}

async function resolveAccess(req: Request) {
  const tenant = await resolveHostlyAiTenant(req);
  if (!tenant.ok) return { response: error(tenant.status, tenant.error) } as const;

  const role = normalizeHostlyRole(tenant.role);
  if (
    !serverRoleHasCapability(tenant.role, "analytics.view") ||
    (role !== "owner" && role !== "admin" && role !== "manager")
  ) {
    return { response: error(403, "MANAGER_ANALYTICS_ROLE_REQUIRED") } as const;
  }

  const restaurantSnap = await tenant.db.collection("restaurants").doc(tenant.restaurantId).get();
  const restaurant = (restaurantSnap.data() ?? null) as Record<string, unknown> | null;
  const plan = resolveHostlyPlanFromRestaurant(restaurant).effectivePlan;
  const entitled = hasHostlyPlanEntitlement(plan, "ai.managerAnalytics");
  return { tenant, plan, entitled } as const;
}

export async function GET(req: Request) {
  const access = await resolveAccess(req);
  if ("response" in access) return access.response;
  const body: ManagerAnalyticsGenerationResponse = {
    ok: true,
    effectivePlan: access.plan,
    entitled: access.entitled,
    canGenerate: access.entitled,
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const access = await resolveAccess(req);
  if ("response" in access) return access.response;
  if (!access.entitled) return error(403, "MANAGER_ANALYTICS_PRO_REQUIRED");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const dateFrom = typeof body?.dateFrom === "string" ? body.dateFrom : "";
  const dateTo = typeof body?.dateTo === "string" ? body.dateTo : "";
  if (!dateFrom || !dateTo) return error(400, "ANALYTICS_RANGE_REQUIRED");

  try {
    const context = await getManagerAnalyticsContext({
      db: access.tenant.db,
      restaurantId: access.tenant.restaurantId,
      dateFrom,
      dateTo,
    });
    const result = await generateManagerAnalyticsResult({
      context,
      restaurantId: access.tenant.restaurantId,
      userId: access.tenant.uid,
    });
    const response: ManagerAnalyticsGenerationResponse = {
      ok: true,
      effectivePlan: access.plan,
      entitled: true,
      canGenerate: true,
      result,
    };
    return NextResponse.json(response);
  } catch (generationError) {
    const code = generationError instanceof Error ? generationError.message : "MANAGER_ANALYTICS_FAILED";
    if (code === "INVALID_ANALYTICS_DATE" || code === "INVALID_ANALYTICS_RANGE" || code === "ANALYTICS_RANGE_TOO_LARGE") {
      return error(400, code);
    }
    console.error("[ai/manager-analytics] generation_failed", {
      restaurantId: access.tenant.restaurantId,
      uid: access.tenant.uid,
      code: generationError instanceof Error ? generationError.name : "UNKNOWN",
    });
    return error(500, "MANAGER_ANALYTICS_FAILED");
  }
}
