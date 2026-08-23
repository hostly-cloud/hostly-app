import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductCommercialIdentityError,
  isValidGtin,
  normalizeProductCommercialIdentityInput,
} from "@/lib/server/product-images/product-commercial-identity";

test("accepts standard GS1 GTIN lengths with a valid check digit", () => {
  assert.equal(isValidGtin("96385074"), true);
  assert.equal(isValidGtin("036000291452"), true);
  assert.equal(isValidGtin("5449000131805"), true);
  assert.equal(isValidGtin("10012345678902"), true);
});

test("rejects wrong check digits and unsupported barcode lengths", () => {
  assert.equal(isValidGtin("5449000131804"), false);
  assert.equal(isValidGtin("123456789"), false);
});

test("normalizes commercial identity including wine evidence", () => {
  assert.deepEqual(
    normalizeProductCommercialIdentityInput({
      productId: " product-1 ",
      brand: " Marqués de Riscal ",
      quantity: " 75 cl ",
      barcode: "8 410-8680 00017",
      wineProducer: " Herederos del Marqués de Riscal ",
      wineAppellation: " Rioja DOCa ",
      wineVintage: " 2019 ",
    }),
    {
      productId: "product-1",
      brand: "Marqués de Riscal",
      quantity: "75 cl",
      barcode: "8410868000017",
      wineProducer: "Herederos del Marqués de Riscal",
      wineAppellation: "Rioja DOCa",
      wineVintage: "2019",
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
      wineProducer: "",
      wineAppellation: " ",
      wineVintage: "",
    }),
    {
      productId: "product-1",
      brand: "",
      quantity: "",
      barcode: "",
      wineProducer: "",
      wineAppellation: "",
      wineVintage: "",
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

test("wine vintage must be a plausible four-digit year", () => {
  for (const wineVintage of ["19", "abcd", "1899", "2099"]) {
    assert.throws(
      () =>
        normalizeProductCommercialIdentityInput({
          productId: "product-1",
          wineVintage,
        }),
      (error: unknown) =>
        error instanceof ProductCommercialIdentityError &&
        error.code === "INVALID_WINE_VINTAGE" &&
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
