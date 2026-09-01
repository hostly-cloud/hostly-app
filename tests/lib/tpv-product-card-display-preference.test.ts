import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTpvProductCardDisplayMode,
  TPV_PRODUCT_CARD_DISPLAY_STORAGE_KEY,
} from "../../lib/tpv/product-card-display-preference";

test("defaults the TPV product grid to image and name", () => {
  assert.equal(parseTpvProductCardDisplayMode(null), "images");
  assert.equal(parseTpvProductCardDisplayMode("unexpected"), "images");
});

test("restores the explicit name-only preference", () => {
  assert.equal(parseTpvProductCardDisplayMode("names"), "names");
  assert.equal(TPV_PRODUCT_CARD_DISPLAY_STORAGE_KEY, "hostly.tpv.productCardDisplay");
});
