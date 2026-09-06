import { NextResponse } from "next/server";
import { resolveHostlyAiTenant } from "@/lib/ai/hostly-ai-context";
import { getManagerAnalyticsContext } from "@/lib/ai/tools/get-manager-analytics-context";
import { buildManagerHomeSnapshotResult, getMadridIsoDate } from "@/lib/ai/manager-home-intelligence";
import type { ManagerAnalyticsGenerationResponse } from "@/lib/ai/manager-analytics-types";
import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";

function error(status: number, code: string) {
  const body: ManagerAnalyticsGenerationResponse = { ok: false, error: code };
  return NextResponse.json(body, { status });
}

export async function GET(req: Request) {
  const tenant = await resolveHostlyAiTenant(req);
  if (!tenant.ok) return error(tenant.status, tenant.error);

  const role = normalizeHostlyRole(tenant.role);
  if (
    !serverRoleHasCapability(tenant.role, "analytics.view") ||
    (role !== "owner" && role !== "admin" && role !== "manager")
  ) {
    return error(403, "MANAGER_ANALYTICS_ROLE_REQUIRED");
  }

  const restaurantSnap = await tenant.db.collection("restaurants").doc(tenant.restaurantId).get();
  const restaurant = (restaurantSnap.data() ?? null) as Record<string, unknown> | null;
  const plan = resolveHostlyPlanFromRestaurant(restaurant).effectivePlan;
  const entitled = hasHostlyPlanEntitlement(plan, "ai.managerAnalytics");

  if (!entitled) {
    const body: ManagerAnalyticsGenerationResponse = {
      ok: true,
      effectivePlan: plan,
      entitled: false,
      canGenerate: false,
    };
    return NextResponse.json(body);
  }

  try {
    const today = getMadridIsoDate();
    const context = await getManagerAnalyticsContext({
      db: tenant.db,
      restaurantId: tenant.restaurantId,
      dateFrom: today,
      dateTo: today,
    });
    const response: ManagerAnalyticsGenerationResponse = {
      ok: true,
      effectivePlan: plan,
      entitled: true,
      canGenerate: true,
      result: buildManagerHomeSnapshotResult(context),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (snapshotError) {
    console.error("[ai/manager-home] snapshot_failed", {
      restaurantId: tenant.restaurantId,
      uid: tenant.uid,
      code: snapshotError instanceof Error ? snapshotError.name : "UNKNOWN",
    });
    return error(500, "MANAGER_HOME_SNAPSHOT_FAILED");
  }
}
