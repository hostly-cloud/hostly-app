import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globalsSource = readFileSync("app/globals.css", "utf8");
const filterCardSource = readFileSync(
  "components/ui/hostly/HostlyFilterCard.tsx",
  "utf8",
);
const managementSource = readFileSync(
  "components/productos/productos-management-page.tsx",
  "utf8",
);
const dataViewSource = readFileSync(
  "components/productos/productos-carta-data-view.tsx",
  "utf8",
);
const printerQueueSource = readFileSync(
  "app/dashboard/configuracion/impresoras/cola/page.tsx",
  "utf8",
);

test("los filtros métricos comparten una cuadrícula uniforme y responsive", () => {
  assert.match(
    globalsSource,
    /\.hostly-filter-card-grid--metrics \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    globalsSource,
    /@media \(max-width: 640px\) \{[\s\S]*?\.hostly-filter-card-grid--metrics \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    globalsSource,
    /\[data-hostly-touch\] button\.hostly-filter-card--metric \{\s*min-height: calc\(var\(--hostly-mobile-cta-min-h\) \+ var\(--hostly-op-gap-sm\)\) !important;/,
  );
});

test("el componente no recorta etiquetas y reserva el color al estado", () => {
  assert.match(
    globalsSource,
    /\.hostly-filter-card__label-text \{[\s\S]*?overflow-wrap: anywhere;/,
  );
  assert.match(
    globalsSource,
    /\.hostly-filter-card\.is-active,[\s\S]*?box-shadow: inset var\(--hostly-filter-card-active-rail\) 0 0 var\(--hostly-navy-deep\)/,
  );
  assert.match(
    globalsSource,
    /\.hostly-filter-card\[data-tone="success"\] \.hostly-filter-card__marker \{\s*background: var\(--hostly-status-success\)/,
  );
  assert.doesNotMatch(
    printerQueueSource,
    /statusFilter === value\s*\?\s*"bg-sky-600/,
  );
});

test("Productos reutiliza el control compartido en sus dos resúmenes", () => {
  assert.match(dataViewSource, /<HostlyFilterCard/);
  assert.match(dataViewSource, /onClick=\{\(\) => onFilterChange\(filterId\)\}/);
  assert.match(managementSource, /<HostlyFilterCard/);
  assert.match(managementSource, /role="group"/);
});

test("Cola de impresión usa filtros compartidos, pulsables y agrupados", () => {
  assert.match(printerQueueSource, /aria-label="Filtrar por estado"/);
  assert.match(printerQueueSource, /aria-label="Filtrar por destino general"/);
  assert.match(printerQueueSource, /aria-label="Filtrar por estación operativa"/);
  assert.match(printerQueueSource, /active=\{statusFilter === value\}/);
  assert.match(printerQueueSource, /active=\{stationFilter === key\}/);
});

test("HostlyFilterCard comunica selección accesible sin cambiar la lógica", () => {
  assert.match(filterCardSource, /type=\{type\}/);
  assert.match(
    filterCardSource,
    /aria-pressed=\{rest\["aria-pressed"\] \?\? active\}/,
  );
  assert.match(filterCardSource, /data-tone=\{tone\}/);
});
