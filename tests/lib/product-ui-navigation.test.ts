import assert from "node:assert/strict";
import test from "node:test";
import type { ProductCategoryNavigationOption } from "@/lib/productos/product-category-navigation";
import {
  filterProductCategoryNavigationOptions,
  normalizeProductUiSearch,
} from "@/lib/productos/product-ui-navigation";

const options: ProductCategoryNavigationOption[] = [
  {
    id: "entrantes",
    label: "Entrantes",
    count: 8,
    kind: "category",
    categoryId: "entrantes",
    normalizedName: "entrantes",
    isConfigured: true,
  },
  {
    id: "cafes",
    label: "Cafés y tés",
    count: 5,
    kind: "category",
    categoryId: "cafes",
    normalizedName: "cafes y tes",
    isConfigured: true,
  },
  {
    id: "sin-categoria",
    label: "Sin categoría",
    count: 2,
    kind: "uncategorized",
    categoryId: null,
    normalizedName: null,
    isConfigured: false,
  },
];

test("product category search is trim, case and accent insensitive", () => {
  assert.equal(normalizeProductUiSearch("  CAFÉS "), "cafes");
  assert.deepEqual(
    filterProductCategoryNavigationOptions(options, "cafe").map((option) => option.id),
    ["cafes"],
  );
  assert.deepEqual(
    filterProductCategoryNavigationOptions(options, "CATEGORIA").map((option) => option.id),
    ["sin-categoria"],
  );
});

test("empty product category search preserves the available option order", () => {
  assert.deepEqual(
    filterProductCategoryNavigationOptions(options, "   ").map((option) => option.id),
    ["entrantes", "cafes", "sin-categoria"],
  );
});

test("product category search returns no false positives", () => {
  assert.deepEqual(filterProductCategoryNavigationOptions(options, "postres"), []);
});
