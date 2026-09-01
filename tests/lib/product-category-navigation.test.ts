import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_CATEGORY_ALL_ID,
  buildProductCategoryNavigationOptions,
  matchesProductCategoryNavigationOption,
} from "../../lib/productos/product-category-navigation";

const labels = { all: "Todas", uncategorized: "Sin categoría" };

test("incluye Todas y detecta categorías presentes solo en productos", () => {
  const options = buildProductCategoryNavigationOptions(
    [],
    [
      { categoria: "Entrantes" },
      { categoria: "Entrantes" },
      { categoria: "CHAMPAGNE / CAVA" },
    ],
    labels,
  );

  assert.equal(options[0]?.id, PRODUCT_CATEGORY_ALL_ID);
  assert.equal(options[0]?.count, 3);
  assert.deepEqual(
    options.slice(1).map(({ label, count }) => ({ label, count })),
    [
      { label: "CHAMPAGNE / CAVA", count: 1 },
      { label: "Entrantes", count: 2 },
    ],
  );
});

test("une la categoría configurada con productos legacy por nombre", () => {
  const options = buildProductCategoryNavigationOptions(
    [{ id: "entrantes", name: "Entrantes", sortOrder: 1 }],
    [
      { categoriaCartaId: "entrantes", categoria: "Entrantes" },
      { categoria: "ENTRÁNTES" },
    ],
    labels,
  );
  const entrantes = options.find((option) => option.id === "entrantes");

  assert.ok(entrantes);
  assert.equal(entrantes.count, 2);
  assert.equal(entrantes.isConfigured, true);
  assert.equal(
    matchesProductCategoryNavigationOption({ categoria: "Entrantes" }, entrantes),
    true,
  );
});

test("mantiene Sin categoría como opción cuando corresponde", () => {
  const options = buildProductCategoryNavigationOptions(
    [{ id: "bebidas", name: "Bebidas", sortOrder: 1 }],
    [{ categoriaCartaId: "bebidas", categoria: "Bebidas" }, {}],
    labels,
  );

  assert.deepEqual(
    options.map(({ label, count }) => ({ label, count })),
    [
      { label: "Todas", count: 2 },
      { label: "Bebidas", count: 1 },
      { label: "Sin categoría", count: 1 },
    ],
  );
});
