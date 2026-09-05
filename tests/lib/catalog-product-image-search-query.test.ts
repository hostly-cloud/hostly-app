import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalogSearchQueries } from "@/lib/server/product-images/search-catalog-product-images";

test("enriches Fanta Limón search with the saved format without duplicating the brand", () => {
  assert.deepEqual(
    buildCatalogSearchQueries(
      {
        name: "Fanta Limón",
        brand: "Fanta",
        quantity: "500 ml",
      },
      "Fanta Limón",
    ),
    ["Fanta Limón 500 ml", "Fanta Limón"],
  );
});

test("adds a separate brand and format to a generic product name", () => {
  assert.deepEqual(
    buildCatalogSearchQueries(
      {
        name: "Refresco Zero",
        brand: "Coca-Cola",
        quantity: "33 cl",
      },
      "Refresco Zero",
    ),
    ["Refresco Zero Coca-Cola 33 cl", "Refresco Zero"],
  );
});

test("does not duplicate equivalent 33 cl and 330 ml formats", () => {
  assert.deepEqual(
    buildCatalogSearchQueries(
      {
        name: "Coca-Cola Zero 33 cl",
        brand: "Coca-Cola",
        quantity: "330 ml",
      },
      "Coca-Cola Zero 33 cl",
    ),
    ["Coca-Cola Zero 33 cl"],
  );
});

test("keeps the broader product-name query as a fallback after a precise search", () => {
  assert.deepEqual(
    buildCatalogSearchQueries(
      {
        name: "Tónica",
        brand: "Schweppes",
        quantity: "200 ml",
      },
      "Tónica",
    ),
    ["Tónica Schweppes 200 ml", "Tónica"],
  );
});
