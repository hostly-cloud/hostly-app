import assert from "node:assert/strict";
import test from "node:test";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";
import {
  isOperacionModuleSlug,
  operacionModuleHref,
  OPERACION_LAUNCHER_MODULES,
} from "@/lib/operacion/operacion-launcher-modules";
import {
  canAccessDashboardPath,
  requiredCapabilityForDashboardPath,
} from "@/lib/auth/hostly-capabilities";

test("Sommelier IA is an Ultra-only active entitlement", () => {
  assert.equal(hasHostlyPlanEntitlement("basic", "ai.sommelierPairing"), false);
  assert.equal(hasHostlyPlanEntitlement("pro", "ai.sommelierPairing"), false);
  assert.equal(hasHostlyPlanEntitlement("ultra", "ai.sommelierPairing"), true);
});

test("operation launcher exposes Sommelier IA at the canonical route", () => {
  assert.equal(isOperacionModuleSlug("sommelier"), true);
  assert.equal(operacionModuleHref("sommelier"), "/dashboard/operacion/sommelier");
  assert.equal(
    OPERACION_LAUNCHER_MODULES.some((module) => module.slug === "sommelier"),
    true,
  );
});

test("Sommelier route follows TPV staff RBAC", () => {
  assert.equal(
    requiredCapabilityForDashboardPath("/dashboard/operacion/sommelier"),
    "tpv.sell",
  );
  assert.equal(canAccessDashboardPath("waiter", "/dashboard/operacion/sommelier"), true);
  assert.equal(canAccessDashboardPath("kitchen", "/dashboard/operacion/sommelier"), false);
});
