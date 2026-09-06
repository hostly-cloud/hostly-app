import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildFiscalConfiguration,
  fiscalReadiness,
  isStoredFiscalConfiguration,
  type FiscalConfigurationInput,
} from "@/lib/fiscal/configuration";
import { fiscalLiveReadiness } from "@/lib/fiscal/live-readiness";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";

function publicConfiguration(config: ReturnType<typeof buildFiscalConfiguration>) {
  const { certificateSecretResource: _secretResource, ...safe } = config;
  void _secretResource;
  return {
    ...safe,
    certificateConfigured: Boolean(config.certificateSecretResource),
    readiness: fiscalReadiness(config),
    liveReadiness: fiscalLiveReadiness(config),
  };
}

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.config")) {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIG_REQUIRED" }, { status: 403 });
  }
  const snap = await ctx.db.collection("fiscalConfigurations").doc(ctx.restaurantId).get();
  if (!snap.exists) return NextResponse.json({ ok: true, configuration: null });
  const value = snap.data();
  if (!isStoredFiscalConfiguration(value)) {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIGURATION_CORRUPT" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, configuration: publicConfiguration(value) });
}

export async function PUT(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.config")) {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIG_REQUIRED" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || "restaurantId" in body) {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIGURATION_INVALID" }, { status: 400 });
  }
  const ref = ctx.db.collection("fiscalConfigurations").doc(ctx.restaurantId);
  const existingSnap = await ref.get();
  const existingRaw = existingSnap.data();
  const existing = isStoredFiscalConfiguration(existingRaw) ? existingRaw : null;
  if (existing?.status === "active") {
    return NextResponse.json({ ok: false, error: "FISCAL_CONFIGURATION_ACTIVE_LOCKED" }, { status: 409 });
  }
  let config;
  try {
    config = buildFiscalConfiguration({
      restaurantId: ctx.restaurantId,
      value: body as FiscalConfigurationInput,
      existing,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "FISCAL_CONFIGURATION_INVALID" },
      { status: 400 },
    );
  }
  const nowMs = Date.now();
  await ctx.db.runTransaction(async (tx) => {
    tx.set(ref, { ...config, updatedAtMs: nowMs, updatedBy: ctx.uid });
    tx.create(ctx.db.collection("fiscalAuditEvents").doc(randomUUID()), {
      restaurantId: ctx.restaurantId,
      taxEntityId: config.taxEntityId,
      actorUid: ctx.uid,
      action: existing ? "fiscal_configuration_updated" : "fiscal_configuration_created",
      entityType: "fiscalConfiguration",
      entityId: ctx.restaurantId,
      result: "success",
      source: "configuration_api",
      createdAtMs: nowMs,
    });
  });
  return NextResponse.json({ ok: true, configuration: publicConfiguration(config) });
}
