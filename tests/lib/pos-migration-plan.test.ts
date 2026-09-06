import assert from "node:assert/strict";
import test from "node:test";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";

test("Basic has no automatic TPV migration", () => {
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.products"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.full"), false);
});

test("Pro can migrate catalog but not the operational layout", () => {
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.full"), false);
});

test("Ultra can migrate catalog and the complete operational layout", () => {
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.full"), true);
});
