import assert from "node:assert/strict";
import test from "node:test";
import { parseLayoutExport } from "@/lib/server/pos-migrations/parse-layout-export";

test("maps floor plan zone seats and coordinates", () => {
  const parsed = parseLayoutExport({
    fileName: "mesas.csv",
    text: [
      "Mesa;Plano;Zona;Comensales;X;Y;Ancho;Alto;Forma",
      "Mesa 1;Sala;Interior;4;120;220;116;76;Cuadrada",
      "Mesa 2;Terraza;Exterior;6;300;200;120;80;Redonda",
    ].join("\n"),
  });

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].floorPlanName, "Sala");
  assert.equal(parsed.items[0].zoneName, "Interior");
  assert.equal(parsed.items[0].seats, 4);
  assert.equal(parsed.items[1].shape, "round");
  assert.equal(parsed.items[1].x, 300);
});

test("renames duplicate table labels deterministically using floor plan suffix", () => {
  const parsed = parseLayoutExport({
    fileName: "tables.csv",
    existingTableNames: ["Mesa 1"],
    text: [
      "Mesa;Plano;Zona",
      "Mesa 1;Terraza;Exterior",
      "Mesa 1;Sala;Interior",
    ].join("\n"),
  });

  assert.equal(parsed.items[0].finalName, "Mesa 1T");
  assert.equal(parsed.items[0].decision, "review");
  assert.equal(parsed.items[1].finalName, "Mesa 1S");
  assert.equal(parsed.items[1].decision, "review");
});

test("uses safe defaults when the export has no geometry", () => {
  const parsed = parseLayoutExport({
    fileName: "tables.csv",
    text: "Table,Room,Zone,Covers\nT1,Main,Inside,8",
  });

  assert.equal(parsed.items[0].seats, 8);
  assert.equal(parsed.items[0].x, null);
  assert.equal(parsed.items[0].y, null);
  assert.equal(parsed.items[0].shape, "square");
});

test("blocks rows without a table name", () => {
  const parsed = parseLayoutExport({
    fileName: "tables.csv",
    text: "Mesa;Plano;Zona\n;Sala;Interior",
  });
  assert.equal(parsed.items[0].decision, "blocked");
});
