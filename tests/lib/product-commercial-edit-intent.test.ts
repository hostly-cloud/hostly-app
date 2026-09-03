import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeProductCommercialEdit,
  requestProductCommercialEdit,
} from "@/lib/productos/product-commercial-edit-intent";

test("commercial edit intent only opens the requested product once", () => {
  requestProductCommercialEdit("product-a");

  assert.equal(consumeProductCommercialEdit("product-b"), false);
  assert.equal(consumeProductCommercialEdit("product-a"), true);
  assert.equal(consumeProductCommercialEdit("product-a"), false);
});

test("blank commercial edit intent is ignored", () => {
  requestProductCommercialEdit("   ");

  assert.equal(consumeProductCommercialEdit("product-a"), false);
});
