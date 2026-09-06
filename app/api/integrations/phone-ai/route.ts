import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  readPhoneAiSettings,
  savePhoneAiSettings,
} from "@/lib/server/phone-ai/phone-ai-center";

function noStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return noStore({ ok: false, error: "SETTINGS_MANAGE_REQUIRED" }, 403);
  }
  const settings = await readPhoneAiSettings(authCtx.db, authCtx.restaurantId);
  return noStore({
    ok: true,
    settings,
    providerConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
  });
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return noStore({ ok: false, error: "SETTINGS_MANAGE_REQUIRED" }, 403);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return noStore({ ok: false, error: "INVALID_JSON" }, 400);
  const settings = await savePhoneAiSettings(authCtx.db, authCtx.restaurantId, body);
  return noStore({ ok: true, settings });
}
