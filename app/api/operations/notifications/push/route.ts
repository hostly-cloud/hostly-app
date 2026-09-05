import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { getOperationalNotificationProviderAvailability } from "@/lib/server/operations/operational-notification-dispatcher";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function tokenDocId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cleanToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length >= 32 && token.length <= 4096 ? token : "";
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, "OPERATIONS_AUDIT_REQUIRED");
  }
  const snapshot = await authCtx.db
    .collection(`restaurants/${authCtx.restaurantId}/operationalNotificationSubscriptions`)
    .where("uid", "==", authCtx.uid)
    .limit(20)
    .get();
  return NextResponse.json({
    ok: true,
    subscribed: !snapshot.empty,
    subscriptionCount: snapshot.size,
    provider: getOperationalNotificationProviderAvailability(),
  });
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, "OPERATIONS_AUDIT_REQUIRED");
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const action = typeof body.action === "string" ? body.action : "";
  const collection = authCtx.db.collection(
    `restaurants/${authCtx.restaurantId}/operationalNotificationSubscriptions`,
  );
  const nowMs = Date.now();

  if (action === "subscribe") {
    const token = cleanToken(body.token);
    if (!token) return jsonError(400, "INVALID_PUSH_TOKEN");
    const provider = getOperationalNotificationProviderAvailability();
    if (!provider.push) return jsonError(503, "PUSH_PROVIDER_NOT_CONFIGURED");
    const ref = collection.doc(tokenDocId(token));
    const existing = await ref.get();
    if (existing.exists) {
      const data = existing.data() as Record<string, unknown>;
      if (data.restaurantId !== authCtx.restaurantId || data.uid !== authCtx.uid) {
        return jsonError(409, "PUSH_TOKEN_ALREADY_REGISTERED");
      }
    }
    await ref.set({
      restaurantId: authCtx.restaurantId,
      uid: authCtx.uid,
      token,
      platform: "web",
      enabled: true,
      updatedAtMs: nowMs,
      createdAtMs: existing.data()?.createdAtMs ?? nowMs,
    }, { merge: true });
    return NextResponse.json({ ok: true, subscribed: true });
  }

  if (action === "unsubscribeAll") {
    const snapshot = await collection.where("uid", "==", authCtx.uid).limit(100).get();
    if (!snapshot.empty) {
      const batch = authCtx.db.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
    return NextResponse.json({ ok: true, subscribed: false });
  }

  return jsonError(400, "INVALID_ACTION");
}
