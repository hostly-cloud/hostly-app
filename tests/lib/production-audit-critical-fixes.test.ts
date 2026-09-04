import assert from "node:assert/strict";
import test from "node:test";
import { centralProductVisibleOnMenu } from "@/lib/carta/operational-catalog-mappers";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  INCOMPATIBLE_INVENTORY_UNIT_CHANGE,
  normalizePreviousStockForUnitChange,
  planInventoryUnitChange,
} from "@/lib/inventory/inventory-unit-change";
import { calculateSuggestedPurchaseQuantity } from "@/lib/inventory/suggested-purchase-draft";

function product(overrides: Partial<ProductDocument> = {}): ProductDocument {
  return {
    id: "product-1",
    name: "Producto",
    categoryId: null,
    price: 10,
    active: true,
    station: null,
    type: null,
    inventory: { enabled: false, unit: "ud", currentStock: 0, costPerUnit: 0 },
    recipe: { enabled: false, ingredients: [] },
    ...overrides,
  };
}

test("el TPV excluye ingredientes creados solo para inventario", () => {
  assert.equal(centralProductVisibleOnMenu(product({ type: "inventory" })), false);
  assert.equal(centralProductVisibleOnMenu(product({ type: null })), true);
});

test("la sugerencia repone también el déficit de stock negativo", () => {
  assert.equal(
    calculateSuggestedPurchaseQuantity({
      averageDailyConsumption: 1,
      targetCoverageDays: 5,
      currentStock: -137,
    }),
    142,
  );
});

test("litros a mililitros conserva stock, mínimo y valoración", () => {
  assert.deepEqual(
    planInventoryUnitChange({
      fromUnit: "l",
      toUnit: "ml",
      currentStock: 4,
      minStock: 1,
      costPerUnit: 0.5,
    }),
    { ok: true, currentStock: 4000, minStock: 1000, costPerUnit: 0.0005 },
  );
});

test("bloquea cambios incompatibles con existencias", () => {
  assert.deepEqual(
    planInventoryUnitChange({
      fromUnit: "l",
      toUnit: "ud",
      currentStock: 4,
      minStock: 0,
      costPerUnit: 2,
    }),
    { ok: false, error: INCOMPATIBLE_INVENTORY_UNIT_CHANGE },
  );
  assert.throws(
    () =>
      normalizePreviousStockForUnitChange({
        previousStock: 4,
        previousUnit: "l",
        nextStock: 4,
        nextUnit: "ud",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === INCOMPATIBLE_INVENTORY_UNIT_CHANGE,
  );
});

test("el historial convierte el stock anterior a la unidad nueva", () => {
  assert.equal(
    normalizePreviousStockForUnitChange({
      previousStock: 4,
      previousUnit: "l",
      nextStock: 4000,
      nextUnit: "ml",
    }),
    4000,
  );
});
