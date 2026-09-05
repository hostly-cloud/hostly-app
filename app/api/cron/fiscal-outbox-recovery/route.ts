import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { isOperationalCronRequestAuthorized } from "@/lib/operations/operational-notifications";
import { recoverDueFiscalOutbox } from "@/lib/server/fiscal/fiscal-outbox-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SCHEDULE = "* * * * *";

export async function GET(req: Request) {
  const authorized = isOperationalCronRequestAuthorized({
    authorizationHeader: req.headers.get("authorization"),
    cronSecret: process.env.CRON_SECRET,
    cronScheduleHeader: req.headers.get("x-vercel-cron-schedule"),
    expectedSchedule: SCHEDULE,
    isVercel: Boolean(process.env.VERCEL),
  });
  if (!authorized) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, { status: 503 });
  try {
    const metrics = await recoverDueFiscalOutbox(db);
    if (metrics.rejected > 0 || metrics.oldestPendingAgeMs >= 60 * 60 * 1_000) {
      console.error("[fiscal-health] attention required", {
        rejectedRecords: metrics.rejected,
        pendingRecords: metrics.pending,
        oldestPendingMinutes: Math.floor(metrics.oldestPendingAgeMs / 60_000),
      });
    }
    return NextResponse.json({ ok: true, ...metrics });
  } catch {
    return NextResponse.json({ ok: false, error: "FISCAL_OUTBOX_RECOVERY_FAILED" }, { status: 500 });
  }
}
