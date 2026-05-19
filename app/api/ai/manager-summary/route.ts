import { NextResponse } from "next/server";
import { resolveHostlyAiTenant } from "@/lib/ai/hostly-ai-context";
import { getManagerDaySummary } from "@/lib/ai/tools/get-manager-day-summary";
import type { HostlyAiManagerSummaryResponse } from "@/lib/ai/types";

export async function POST(req: Request) {
  const tenant = await resolveHostlyAiTenant(req);
  if (!tenant.ok) {
    const body: HostlyAiManagerSummaryResponse = {
      ok: false,
      error: tenant.error,
    };
    return NextResponse.json(body, { status: tenant.status });
  }

  try {
    const summary = await getManagerDaySummary({
      db: tenant.db,
      restaurantId: tenant.restaurantId,
    });
    const body: HostlyAiManagerSummaryResponse = { ok: true, summary };
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MANAGER_SUMMARY_FAILED";
    const body: HostlyAiManagerSummaryResponse = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
