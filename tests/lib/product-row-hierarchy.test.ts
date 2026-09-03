import test from "node:test";
import assert from "node:assert/strict";

import { PRODUCT_FORM_DRAWER_TAB_SPECS } from "../../components/productos/product-form-drawer-tabs";

test("product editor prioritizes everyday commercial work before operational detail", () => {
  assert.deepEqual(
    PRODUCT_FORM_DRAWER_TAB_SPECS.map((tab) => tab.id),
    ["producto", "comercial", "operacion", "modificadores", "escandallo"],
  );
});

test("product editor uses restaurant-facing labels", () => {
  assert.equal(PRODUCT_FORM_DRAWER_TAB_SPECS[1]?.label, "Contenido");
  assert.equal(PRODUCT_FORM_DRAWER_TAB_SPECS[4]?.label, "Escandallo");
  assert.equal(PRODUCT_FORM_DRAWER_TAB_SPECS[4]?.description, "Coste y margen");
});
