import assert from "node:assert/strict";
import test from "node:test";
import { resolveTpvProductInfoAccess } from "@/lib/tpv/product-info-plan-access";

test("Basic keeps TPV product cards click-only", () => {
  assert.deepEqual(resolveTpvProductInfoAccess("basic"), {
    canOpenGastronomy: false,
    canSeeAllergens: false,
    canSeeWineProfile: false,
    canSeeAiPairings: false,
  });
});

test("Pro enables allergens and wine profile but not AI pairings", () => {
  assert.deepEqual(resolveTpvProductInfoAccess("pro"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: false,
  });
});

test("Ultra enables the complete TPV product info experience", () => {
  assert.deepEqual(resolveTpvProductInfoAccess("ultra"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: true,
  });
});
