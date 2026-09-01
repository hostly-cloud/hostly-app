import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("facturas diferencia carga, error y vacío real", () => {
  const page = readFileSync(
    "app/dashboard/inventario/facturas-proveedor/page.tsx",
    "utf8",
  );

  assert.match(page, /Cargando facturas registradas/);
  assert.match(page, /No se han podido cargar las facturas/);
  assert.match(page, /invoicesSourceState === "ready"/);
  assert.match(page, /title="Sin facturas registradas"/);
  assert.doesNotMatch(page, /setInvoicesListenerReady/);
});
