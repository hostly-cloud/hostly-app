import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  assertFiscalConfigurationCanActivate,
  fiscalReadiness,
  isStoredFiscalConfiguration,
} from "@/lib/fiscal/configuration";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { readFiscalCertificateSecret } from "@/lib/server/fiscal/fiscal-certificate-secret";

export async function POST(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.config")) {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIG_REQUIRED" }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { mode?: unknown; confirmation?: unknown } | null;
  const mode = body?.mode;
  if (mode !== "test" && mode !== "live") {
    return NextResponse.json({ ok: false, error: "FISCAL_ACTIVATION_MODE_INVALID" }, { status: 400 });
  }
  const expectedConfirmation = mode === "live" ? "ACTIVAR FISCAL REAL" : "ACTIVAR FISCAL TEST";
  if (body?.confirmation !== expectedConfirmation) {
    return NextResponse.json({ ok: false, error: "FISCAL_ACTIVATION_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  const ref = ctx.db.collection("fiscalConfigurations").doc(ctx.restaurantId);
  const nowMs = Date.now();
  try {
    const preflightSnap = await ref.get();
    const preflight = preflightSnap.data();
    if (!preflightSnap.exists || !isStoredFiscalConfiguration(preflight)) {
      throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
    }
    if (preflight.status === "active") throw new Error("FISCAL_CONFIGURATION_ALREADY_ACTIVE");
    assertFiscalConfigurationCanActivate(preflight, mode);
    const preflightCertificateResource = preflight.certificateSecretResource;
    if (!preflightCertificateResource) throw new Error("FISCAL_CERTIFICATE_SECRET_REQUIRED");

    // Re-read and parse the PKCS#12 immediately before activation. This catches
    // deleted/rotated secrets, invalid passphrases and broken PFX material without
    // ever persisting or logging the certificate itself.
    await readFiscalCertificateSecret(preflightCertificateResource);

    let activated: Record<string, unknown> | null = null;
    await ctx.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.data();
      if (!snap.exists || !isStoredFiscalConfiguration(raw)) throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
      if (raw.status === "active") throw new Error("FISCAL_CONFIGURATION_ALREADY_ACTIVE");
      assertFiscalConfigurationCanActivate(raw, mode);
      if (raw.certificateSecretResource !== preflightCertificateResource) {
        throw new Error("FISCAL_CERTIFICATE_CHANGED_DURING_ACTIVATION");
      }
      activated = { ...raw, status: "active", activatedAt: new Date(nowMs).toISOString(), activatedBy: ctx.uid, updatedAtMs: nowMs, updatedBy: ctx.uid };
      tx.set(ref, activated);
      tx.create(ctx.db.collection("fiscalAuditEvents").doc(randomUUID()), {
        restaurantId: ctx.restaurantId,
        taxEntityId: raw.taxEntityId,
        actorUid: ctx.uid,
        action: mode === "live" ? "fiscal_live_activated" : "fiscal_test_activated",
        entityType: "fiscalConfiguration",
        entityId: ctx.restaurantId,
        result: "success",
        source: "activation_api",
        createdAtMs: nowMs,
      });
    });
    return NextResponse.json({ ok: true, status: "active", mode, readiness: fiscalReadiness(activated as never) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FISCAL_ACTIVATION_FAILED";
    const status = code === "FISCAL_CONFIGURATION_ALREADY_ACTIVE" ? 409 : code === "FISCAL_LIVE_ACTIVATION_DISABLED" ? 423 : 400;
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
