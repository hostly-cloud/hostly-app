import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatCurrency } from "../../components/analysis/utils";

test("las cantidades del análisis respetan el formato español", () => {
  assert.equal(formatCurrency(139.4), "139,40 €");
  assert.equal(formatCurrency(46.47), "46,47 €");
});

test("la navegación no ofrece secciones todavía vacías", () => {
  const source = readFileSync("app/dashboard/analisis/page.tsx", "utf8");
  const tabsBlock = source.slice(source.indexOf("const TABS"), source.indexOf("function todayYmd"));
  assert.doesNotMatch(tabsBlock, /id: "horas"/);
  assert.doesNotMatch(tabsBlock, /id: "productos"/);
});

test("las acciones principales evitan formatos técnicos y redundantes", () => {
  const salesActions = readFileSync("components/analysis/VentasActions.tsx", "utf8");
  const zones = readFileSync("components/analysis/ZonasAnalyticsSection.tsx", "utf8");
  assert.doesNotMatch(salesActions, /Exportar JSON|Copiar KPIs/);
  assert.doesNotMatch(zones, />\s*(?:Exportar JSON|Copiar CSV|Copiar JSON|Copiar ultra)\s*</);
  assert.match(zones, /Cuando las reservas tengan una zona asignada/);
});
