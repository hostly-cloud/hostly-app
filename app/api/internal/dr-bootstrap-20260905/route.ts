import { createHash, timingSafeEqual } from "node:crypto";
import { getApp } from "firebase-admin/app";
import { NextResponse } from "next/server";
import { getHostlyFirestore, getHostlyStorageBucket } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const FIRESTORE_API = "https://firestore.googleapis.com/v1";
const AUTH_HASH = "6d5ffe46d561765a0c200808adbbe1837a89ccc0e57839bf5e3a278b144b89c1";

function authorized(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const actual = createHash("sha256").update(token).digest("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(AUTH_HASH, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function accessToken(): Promise<string> {
  if (!getHostlyFirestore()) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const credential = getApp().options.credential;
  if (!credential) throw new Error("FIREBASE_ADMIN_CREDENTIAL_MISSING");
  return (await credential.getAccessToken()).access_token;
}

async function gcpJson(path: string, init?: RequestInit) {
  const res = await fetch(`${FIRESTORE_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`GCP_${res.status}:${JSON.stringify(body)}`);
  return body;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
    const parent = `projects/${projectId}/databases/(default)`;
    const op = new URL(req.url).searchParams.get("op") || "status";

    if (op === "enable") {
      await gcpJson(`${parent}?updateMask=pointInTimeRecoveryEnablement&updateMask=deleteProtectionState`, {
        method: "PATCH",
        body: JSON.stringify({
          pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
          deleteProtectionState: "DELETE_PROTECTION_ENABLED",
        }),
      });

      const listed = (await gcpJson(`${parent}/backupSchedules`)) as { backupSchedules?: Array<Record<string, unknown>> };
      const schedules = listed.backupSchedules ?? [];
      if (!schedules.some((item) => "dailyRecurrence" in item)) {
        await gcpJson(`${parent}/backupSchedules`, {
          method: "POST",
          body: JSON.stringify({ retention: "8467200s", dailyRecurrence: {} }),
        });
      }
      if (!schedules.some((item) => "weeklyRecurrence" in item)) {
        await gcpJson(`${parent}/backupSchedules`, {
          method: "POST",
          body: JSON.stringify({ retention: "8467200s", weeklyRecurrence: { day: "SUNDAY" } }),
        });
      }

      const bucket = getHostlyStorageBucket();
      if (!bucket) throw new Error("FIREBASE_STORAGE_NOT_CONFIGURED");
      await bucket.setMetadata({ softDeletePolicy: { retentionDurationSeconds: 1209600 } } as never);
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, {
      status: 500,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
