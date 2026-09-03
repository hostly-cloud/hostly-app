import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRODUCT_FORM_DRAWER_TAB_SPECS } from "../../components/productos/product-form-drawer-tabs";

test("el editor ordena las áreas según el flujo real de un producto", () => {
  assert.deepEqual(
    PRODUCT_FORM_DRAWER_TAB_SPECS.map(({ id, label }) => ({ id, label })),
    [
      { id: "producto", label: "Producto" },
      { id: "operacion", label: "Cocina" },
      { id: "modificadores", label: "Modificadores" },
      { id: "escandallo", label: "Costes" },
      { id: "comercial", label: "Contenido" },
    ],
  );
});

test("cada acceso explica su contenido antes de abrirlo", () => {
  for (const tab of PRODUCT_FORM_DRAWER_TAB_SPECS) {
    assert.ok(tab.description.trim().length > 0, `${tab.label} necesita una descripción`);
  }
});

test("producto y cocina se renderizan en paneles independientes sin duplicar formularios", () => {
  const source = readFileSync(
    new URL("../../components/productos/productos-management-page.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.match(/tabId="producto"/g)?.length, 1);
  assert.equal(source.match(/tabId="operacion"/g)?.length, 1);
  assert.equal(source.match(/className="hostly-product-form-sale-status"/g)?.length, 1);
  assert.equal(source.match(/onClick=\{\(\) => void submitForm\(\)\}/g)?.length, 1);
});

test("el resumen del editor presenta el precio con el formato monetario del idioma", () => {
  const source = readFileSync(
    new URL("../../components/productos/productos-management-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /formatEuro\(draftSalePriceForProfitability, locale as Locale\)/,
  );
  assert.doesNotMatch(source, /`\$\{draftPrecio\.trim\(\)\} €`/);
});
