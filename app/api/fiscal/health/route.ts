import { NextResponse } from "next/server";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.view")) {
    return NextResponse.json({ ok: false, error: "FISCAL_VIEW_REQUIRED" }, { status: 403 });
  }
  const snapshot = await ctx.db.collection("fiscalOutbox").where("restaurantId", "==", ctx.restaurantId).limit(1_000).get();
  const nowMs = Date.now();
  const metrics = { pending: 0, sending: 0, retryScheduled: 0, rejected: 0, accepted: 0, oldestPendingAgeMs: 0 };
  for (const row of snapshot.docs) {
    const data = row.data();
    const status = String(data.status ?? "");
    if (status === "pending") metrics.pending += 1;
    else if (status === "sending") metrics.sending += 1;
    else if (status === "retry_scheduled") metrics.retryScheduled += 1;
    else if (status === "rejected") metrics.rejected += 1;
    else if (status === "accepted" || status === "accepted_with_errors") metrics.accepted += 1;
    if (["pending", "sending", "retry_scheduled"].includes(status)) {
      metrics.oldestPendingAgeMs = Math.max(metrics.oldestPendingAgeMs, Math.max(0, nowMs - (Number(data.createdAtMs) || nowMs)));
    }
  }
  const severity = metrics.rejected > 0 ? "action_required"
    : metrics.oldestPendingAgeMs >= 60 * 60 * 1_000 ? "degraded"
      : metrics.pending + metrics.sending + metrics.retryScheduled > 0 ? "pending"
        : "healthy";
  return NextResponse.json({ ok: true, severity, metrics }, { headers: { "Cache-Control": "private, no-store" } });
}
