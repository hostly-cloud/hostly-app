import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managementSource = readFileSync(
  "components/productos/productos-management-page.tsx",
  "utf8",
);
const dataViewSource = readFileSync(
  "components/productos/productos-carta-data-view.tsx",
  "utf8",
);

test("las métricas de paridad usan una cuadrícula uniforme en móvil", () => {
  assert.match(
    managementSource,
    /\.hostly-productos-resolver-parity-strip \{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    managementSource,
    /@media \(max-width: 640px\) \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    managementSource,
    /\[data-hostly-touch\] \.hostly-productos-resolver-parity-pill \{\s*min-height: 56px !important;/,
  );
});

test("el color queda reservado a señales discretas y al filtro seleccionado", () => {
  assert.match(
    managementSource,
    /\.hostly-productos-resolver-parity-pill--active \{[\s\S]*?box-shadow: inset 3px 0 0 var\(--hostly-action-primary/,
  );
  assert.match(
    managementSource,
    /\.hostly-productos-resolver-parity-pill--ok \.hostly-productos-resolver-parity-pill__label::before \{\s*background: #22c55e;/,
  );
  assert.doesNotMatch(
    managementSource,
    /\.hostly-productos-resolver-parity-pill--ok \{[^}]*background: rgba\(240, 253, 244/,
  );
});

test("las métricas siguen siendo filtros accesibles", () => {
  assert.match(dataViewSource, /type="button"/);
  assert.match(dataViewSource, /aria-pressed=\{isActive\}/);
  assert.match(dataViewSource, /onClick=\{\(\) => onFilterChange\(filterId\)\}/);
});
