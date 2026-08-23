import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductCommercialIdentityError,
  isValidGtin,
  normalizeProductCommercialIdentityInput,
} from "@/lib/server/product-images/product-commercial-identity";

test("accepts standard GS1 GTIN lengths with a valid check digit", () => {
  assert.equal(isValidGtin("96385074"), true); // GTIN-8
  assert.equal(isValidGtin("036000291452"), true); // GTIN-12 / UPC-A
  assert.equal(isValidGtin("5449000131805"), true); // GTIN-13 / EAN-13
  assert.equal(isValidGtin("10012345678902"), true); // GTIN-14
});

test("rejects wrong check digits and unsupported barcode lengths", () => {
  assert.equal(isValidGtin("5449000131804"), false);
  assert.equal(isValidGtin("123456789"), false);
});

test("normalizes commercial identity fields and canonical GTIN digits", () => {
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

test("invalid GTIN is rejected before Firestore writes", () => {
  for (const barcode of ["not-a-barcode", "5449000131804", "123456789"]) {
    assert.throws(
      () =>
        normalizeProductCommercialIdentityInput({
          productId: "product-1",
          barcode,
        }),
      (error: unknown) =>
        error instanceof ProductCommercialIdentityError &&
        error.code === "INVALID_PRODUCT_GTIN" &&
        error.httpStatus === 400,
    );
  }
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
