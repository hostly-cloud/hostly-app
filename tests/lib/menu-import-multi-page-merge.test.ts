import assert from "node:assert/strict";
import test from "node:test";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import { mergeMenuImportPageItems } from "@/lib/server/menu-imports/merge-menu-import-pages";

function item(
  id: string,
  name: string,
  price: number,
  description = "",
  confidence = 90,
): ImportedMenuItem {
  return {
    id,
    sourceType: "image",
    name,
    description,
    price,
    sectionName: "Bebidas",
    suggestedCategory: "Bebidas",
    suggestedStation: "bar",
    confidence,
    needsReview: false,
    selectedForPublish: true,
  };
}

test("same product and price repeated on another page is deduplicated", () => {
  const result = mergeMenuImportPageItems([
    { pageIndex: 0, items: [item("a", "Coca-Cola", 3.5)] },
    { pageIndex: 1, items: [item("b", "Coca Cola", 3.5)] },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.items[0].id, "page-1-a");
});

test("same name with different price is preserved as a distinct menu entry", () => {
  const result = mergeMenuImportPageItems([
    { pageIndex: 0, items: [item("a", "Copa Rioja", 4.5)] },
    { pageIndex: 1, items: [item("b", "Copa Rioja", 6)] },
  ]);
  assert.equal(result.items.length, 2);
  assert.equal(result.duplicateCount, 0);
  assert.deepEqual(result.items.map((row) => row.id), ["page-1-a", "page-2-b"]);
});

test("duplicate merge keeps richer description while preserving stable id", () => {
  const result = mergeMenuImportPageItems([
    { pageIndex: 0, items: [item("a", "Tarta de queso", 7, "", 92)] },
    {
      pageIndex: 1,
      items: [item("b", "Tarta de queso", 7, "Con coulis de frutos rojos", 80)],
    },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "page-1-a");
  assert.equal(result.items[0].description, "Con coulis de frutos rojos");
});
