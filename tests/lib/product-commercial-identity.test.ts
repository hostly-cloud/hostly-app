import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductCommercialIdentityError,
  normalizeProductCommercialIdentityInput,
} from "@/lib/server/product-images/product-commercial-identity";

test("normalizes commercial identity fields and canonical barcode digits", () => {
  assert.deepEqual(
    normalizeProductCommercialIdentityInput({
      productId: " product-1 ",
      brand: " Coca-Cola ",
      quantity: " 33 cl ",
      barcode: "5 449-0001 31805",
    }),
    {
      productId: "product-1",
      brand: "Coca-Cola",
      quantity: "33 cl",
      barcode: "5449000131805",
    },
  );
});

test("empty optional identity fields are preserved as empty strings for deletion", () => {
  assert.deepEqual(
    normalizeProductCommercialIdentityInput({
      productId: "product-1",
      brand: " ",
      quantity: "",
      barcode: "",
    }),
    {
      productId: "product-1",
      brand: "",
      quantity: "",
      barcode: "",
    },
  );
});

test("invalid barcode is rejected before Firestore writes", () => {
  assert.throws(
    () =>
      normalizeProductCommercialIdentityInput({
        productId: "product-1",
        barcode: "not-a-barcode",
      }),
    (error: unknown) =>
      error instanceof ProductCommercialIdentityError &&
      error.code === "INVALID_PRODUCT_BARCODE" &&
      error.httpStatus === 400,
  );
});

test("identity ids cannot escape the tenant product path", () => {
  assert.throws(
    () =>
      normalizeProductCommercialIdentityInput({
        productId: "../other-product",
      }),
    (error: unknown) =>
      error instanceof ProductCommercialIdentityError &&
      error.code === "INVALID_PRODUCT_IDENTITY_ID",
  );
});
