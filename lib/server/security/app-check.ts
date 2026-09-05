import { getAppCheck } from "firebase-admin/app-check";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";

export type HostlyAppCheckMode = "off" | "monitor" | "enforce";

function resolveMode(): HostlyAppCheckMode {
  const value = process.env.HOSTLY_APP_CHECK_MODE?.trim().toLowerCase();
  if (value === "monitor" || value === "enforce") return value;
  return "off";
}

export function getHostlyAppCheckMode(): HostlyAppCheckMode {
  return resolveMode();
}

export async function verifyHostlyAppCheck(
  req: Request,
): Promise<{ ok: true; tokenPresent: boolean } | NextResponse> {
  const mode = resolveMode();
  if (mode === "off") return { ok: true, tokenPresent: false };

  const token = req.headers.get("x-firebase-appcheck")?.trim() ?? "";
  const firestore = getHostlyFirestore();

  if (!firestore) {
    if (mode === "monitor") {
      console.warn("[Security][AppCheck] Firebase Admin unavailable in monitor mode");
      return { ok: true, tokenPresent: Boolean(token) };
    }
    return NextResponse.json(
      { ok: false, error: "APP_CHECK_UNAVAILABLE" },
      { status: 503 },
    );
  }

  if (!token) {
    if (mode === "monitor") {
      console.warn("[Security][AppCheck] Missing X-Firebase-AppCheck token");
      return { ok: true, tokenPresent: false };
    }
    return NextResponse.json(
      { ok: false, error: "APP_CHECK_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    await getAppCheck().verifyToken(token);
    return { ok: true, tokenPresent: true };
  } catch (error) {
    if (mode === "monitor") {
      console.warn("[Security][AppCheck] Invalid token in monitor mode", error);
      return { ok: true, tokenPresent: true };
    }
    return NextResponse.json(
      { ok: false, error: "APP_CHECK_INVALID" },
      { status: 401 },
    );
  }
}
