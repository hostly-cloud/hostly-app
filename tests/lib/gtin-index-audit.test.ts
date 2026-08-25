import assert from "node:assert/strict";
import test from "node:test";
import { auditProductGtinIndex } from "@/lib/productos/gtin-index-audit";

test("detects missing index for a unique valid legacy GTIN", () => {
  const result = auditProductGtinIndex({
    products: [{ productId: "p1", ean: "5449000131805" }],
    indexes: [],
  });
  assert.equal(result.findings.some((f) => f.type === "missing_index"), true);
  assert.deepEqual(result.repairPlan, [
    { action: "reserve_index", gtin: "5449000131805", productId: "p1" },
  ]);
});

test("does not propose repair when two products share the same GTIN", () => {
  const result = auditProductGtinIndex({
    products: [
      { productId: "p1", barcode: "5449000131805" },
      { productId: "p2", gtin: "5449000131805" },
    ],
    indexes: [],
  });
  assert.equal(result.findings.some((f) => f.type === "duplicate_product_gtin"), true);
  assert.equal(result.repairPlan.length, 0);
});

test("detects wrong owner and orphan indexes conservatively", () => {
  const result = auditProductGtinIndex({
    products: [{ productId: "p1", barcode: "5449000131805" }],
    indexes: [
      { gtin: "5449000131805", productId: "p2" },
      { gtin: "96385074", productId: "missing" },
    ],
  });
  assert.equal(result.findings.some((f) => f.type === "wrong_index_owner"), true);
  assert.equal(result.findings.some((f) => f.type === "orphan_index"), true);
});

test("reports invalid legacy product GTIN without repair action", () => {
  const result = auditProductGtinIndex({
    products: [{ productId: "p1", ean13: "5449000131804" }],
    indexes: [],
  });
  assert.deepEqual(result.repairPlan, []);
  assert.equal(result.findings[0]?.type, "invalid_product_gtin");
});
