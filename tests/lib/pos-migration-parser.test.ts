import assert from "node:assert/strict";
import test from "node:test";
import { parsePosExport } from "@/lib/server/pos-migrations/parse-pos-export";

test("maps common Spanish POS headers and decimal comma values", () => {
  const parsed = parsePosExport({
    fileName: "productos.csv",
    text: [
      "Artículo;Familia;PVP;IVA;Coste compra;Stock;Unidad;Destino",
      "Coca-Cola;Refrescos;3,50;10%;1,10;24;ud;Barra",
      "Hamburguesa;Comida;12,90;10%;4,25;8;ud;Cocina",
    ].join("\n"),
  });

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].name, "Coca-Cola");
  assert.equal(parsed.items[0].category, "Refrescos");
  assert.equal(parsed.items[0].price, 3.5);
  assert.equal(parsed.items[0].taxRate, 10);
  assert.equal(parsed.items[0].cost, 1.1);
  assert.equal(parsed.items[0].stock, 24);
  assert.equal(parsed.items[0].station, "Barra");
  assert.equal(parsed.mapping.find((entry) => entry.sourceColumn === "Artículo")?.targetField, "name");
});

test("supports quoted delimiters and English exports", () => {
  const parsed = parsePosExport({
    fileName: "products.csv",
    text: [
      "Product,Category,Price,Tax,Current Stock",
      '"Burger, classic",Food,14.50,10,12',
    ].join("\n"),
  });

  assert.equal(parsed.items[0].name, "Burger, classic");
  assert.equal(parsed.items[0].price, 14.5);
  assert.equal(parsed.items[0].taxRate, 10);
  assert.equal(parsed.items[0].stock, 12);
});

test("requires a recognizable product name column", () => {
  assert.throws(
    () => parsePosExport({ fileName: "unknown.csv", text: "foo;bar\na;b" }),
    /POS_EXPORT_NAME_COLUMN_NOT_FOUND/,
  );
});

test("flags duplicates inside the same export for review", () => {
  const parsed = parsePosExport({
    fileName: "products.csv",
    text: "Producto;Precio\nAgua;2\nAgua;2",
  });
  assert.equal(parsed.items[0].decision, "create");
  assert.equal(parsed.items[1].decision, "review");
  assert.match(parsed.items[1].warnings.join(" "), /duplicado/i);
});
