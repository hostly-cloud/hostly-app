import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { mergeMenuImportBatchRows } from "@/lib/carta/merge-menu-import-batch-rows";

function row(overrides: Partial<ExtractedMenuRow> & Pick<ExtractedMenuRow, "nombre">): ExtractedMenuRow {
  return {
    id: overrides.id ?? overrides.nombre.toLowerCase().replace(/\s+/g, "-"),
    nombre: overrides.nombre,
    descripcion: overrides.descripcion ?? "",
    precio: overrides.precio ?? 0,
    categoria: overrides.categoria ?? "General",
    tipoVenta: overrides.tipoVenta ?? "plato",
    confianza: overrides.confianza,
    needsReview: overrides.needsReview ?? false,
    selected: overrides.selected ?? true,
  };
}

test("deduplica el mismo producto repetido entre páginas conservando la mejor fila", () => {
  const weak = row({ nombre: "Croquetas de jamón", precio: 9.5, categoria: "", descripcion: "", needsReview: true, confianza: 0.65 });
  const strong = row({ nombre: "Croquetas de jamón", precio: 9.5, categoria: "Entrantes", descripcion: "6 unidades", needsReview: false, confianza: 0.94 });

  const merged = mergeMenuImportBatchRows([[weak], [strong]]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].categoria, "Entrantes");
  assert.equal(merged[0].descripcion, "6 unidades");
});

test("normaliza acentos y puntuación para detectar duplicados claros", () => {
  const merged = mergeMenuImportBatchRows([
    [row({ nombre: "Café cortado", precio: 2.2 })],
    [row({ nombre: "CAFE  CORTADO", precio: 2.2 })],
  ]);

  assert.equal(merged.length, 1);
});

test("conserva el mismo nombre cuando el precio cambia entre páginas", () => {
  const merged = mergeMenuImportBatchRows([
    [row({ nombre: "Copa Rioja", precio: 4.5 })],
    [row({ nombre: "Copa Rioja", precio: 6.5 })],
  ]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((item) => item.precio), [4.5, 6.5]);
});

test("respeta el orden de aparición entre páginas", () => {
  const merged = mergeMenuImportBatchRows([
    [row({ nombre: "Primero", precio: 10 }), row({ nombre: "Segundo", precio: 12 })],
    [row({ nombre: "Postre", precio: 6 })],
  ]);

  assert.deepEqual(merged.map((item) => item.nombre), ["Primero", "Segundo", "Postre"]);
});
