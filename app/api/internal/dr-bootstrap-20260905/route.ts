import { getApp } from "firebase-admin/app";
import { NextResponse } from "next/server";
import { getHostlyFirestore, getHostlyStorageBucket } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const FIRESTORE_API = "https://firestore.googleapis.com/v1";

async function accessToken(): Promise<string> {
  const db = getHostlyFirestore();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const credential = getApp().options.credential;
  if (!credential) throw new Error("FIREBASE_ADMIN_CREDENTIAL_MISSING");
  const token = await credential.getAccessToken();
  return token.access_token;
}

async function gcpJson(path: string, init?: RequestInit) {
  const token = await accessToken();
  const res = await fetch(`${FIRESTORE_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    throw new Error(`GCP_${res.status}:${JSON.stringify(body)}`);
  }
  return body;
}

function assertPreview() {
  if (process.env.VERCEL_ENV !== "preview") {
    throw new Error("PREVIEW_ONLY");
  }
}

export async function GET(req: Request) {
  try {
    assertPreview();
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
    const parent = `projects/${projectId}/databases/(default)`;
    const url = new URL(req.url);
    const op = url.searchParams.get("op") || "status";

    if (op === "enable") {
      await gcpJson(`${parent}?updateMask=pointInTimeRecoveryEnablement&updateMask=deleteProtectionState`, {
        method: "PATCH",
        body: JSON.stringify({
          pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
          deleteProtectionState: "DELETE_PROTECTION_ENABLED",
        }),
      });

      const schedules = (await gcpJson(`${parent}/backupSchedules`)) as { backupSchedules?: Array<Record<string, unknown>> };
      const existing = schedules.backupSchedules ?? [];
      const hasDaily = existing.some((item) => "dailyRecurrence" in item);
      const hasWeekly = existing.some((item) => "weeklyRecurrence" in item);

      if (!hasDaily) {
        await gcpJson(`${parent}/backupSchedules`, {
          method: "POST",
          body: JSON.stringify({ retention: "8467200s", dailyRecurrence: {} }),
        });
      }
      if (!hasWeekly) {
        await gcpJson(`${parent}/backupSchedules`, {
          method: "POST",
          body: JSON.stringify({ retention: "8467200s", weeklyRecurrence: { day: "SUNDAY" } }),
        });
      }

      const bucket = getHostlyStorageBucket();
      if (!bucket) throw new Error("FIREBASE_STORAGE_NOT_CONFIGURED");
      await bucket.setMetadata({
        softDeletePolicy: { retentionDurationSeconds: 1209600 },
      } as never);
    }

    const database = await gcpJson(parent);
    const backupSchedules = await gcpJson(`${parent}/backupSchedules`);
    const bucket = getHostlyStorageBucket();
    const storage = bucket ? await bucket.getMetadata().then(([metadata]) => ({
      name: metadata.name,
      location: metadata.location,
      softDeletePolicy: metadata.softDeletePolicy ?? null,
    })) : null;

    return NextResponse.json({ ok: true, op, database, backupSchedules, storage }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
