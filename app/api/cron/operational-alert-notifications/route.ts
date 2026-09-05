import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { isOperationalCronRequestAuthorized } from "@/lib/operations/operational-notifications";
import { dispatchOperationalAlertNotifications } from "@/lib/server/operations/operational-notification-dispatcher";

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
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const db = getHostlyFirestore();
  if (!db) {
    return NextResponse.json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const result = await dispatchOperationalAlertNotifications(db);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[operational-alert-notifications] cron failed", error);
    return NextResponse.json({ ok: false, error: "OPERATIONAL_NOTIFICATION_DISPATCH_FAILED" }, { status: 500 });
  }
}
