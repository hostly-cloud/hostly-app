import assert from "node:assert/strict";
import test from "node:test";
import {
  countProductsMissingResolvedImage,
  filterProductsMissingResolvedImage,
  productHasResolvedImage,
} from "@/lib/productos/product-image-list-filter";

type Row = { id: string; image: string | null };
const resolveImage = (row: Row) => row.image;

test("missing image helpers use the supplied canonical resolver", () => {
  const rows: Row[] = [
    { id: "with-image", image: "https://cdn.example/product.webp" },
    { id: "blank", image: "   " },
    { id: "missing", image: null },
  ];

  assert.equal(productHasResolvedImage(rows[0]!, resolveImage), true);
  assert.equal(productHasResolvedImage(rows[1]!, resolveImage), false);
  assert.equal(countProductsMissingResolvedImage(rows, resolveImage), 2);
  assert.deepEqual(
    filterProductsMissingResolvedImage(rows, resolveImage).map((row) => row.id),
    ["blank", "missing"],
  );
});

test("missing image filtering preserves product order", () => {
  const rows: Row[] = [
    { id: "first", image: null },
    { id: "second", image: "image" },
    { id: "third", image: "" },
  ];

  assert.deepEqual(
    filterProductsMissingResolvedImage(rows, resolveImage).map((row) => row.id),
    ["first", "third"],
  );
});
