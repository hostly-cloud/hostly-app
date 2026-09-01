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
  const analysisPage = readFileSync("app/dashboard/analisis/page.tsx", "utf8");
  assert.doesNotMatch(salesActions, /Exportar JSON|Copiar KPIs/);
  assert.doesNotMatch(zones, />\s*(?:Exportar JSON|Copiar CSV|Copiar JSON|Copiar ultra)\s*</);
  assert.doesNotMatch(
    zones,
    /Uso acciones|Resets uso|Interacciones\/sesión|Madurez de uso|Salud del módulo/,
  );
  assert.doesNotMatch(
    analysisPage,
    /uso_acciones_zonas|reset_uso_acciones_zonas|last_interaction_zonas|sesiones_zonas/,
  );
  assert.match(zones, /Cuando las reservas tengan una zona asignada/);
});

test("ventas declara pagos cobrados como fuente y no pedidos abiertos", () => {
  const source = readFileSync("app/dashboard/analisis/page.tsx", "utf8");
  const table = readFileSync("components/analysis/VentasTableBlock.tsx", "utf8");
  const insights = readFileSync("components/analysis/VentasInsightsBlock.tsx", "utf8");

  assert.match(source, /collection\(db, "payments"\)/);
  assert.match(source, /where\("status", "==", "paid"\)/);
  assert.match(table, /<th>Ticket<\/th>/);
  assert.doesNotMatch(table, /<th>Pedido<\/th>/);
  assert.doesNotMatch(insights, /Mejor rendimiento|Peor rendimiento|Recomendaciones/);
});

test("comensales distingue la falta de reservas de un error de lectura", () => {
  const page = readFileSync("app/dashboard/analisis/page.tsx", "utf8");
  const section = readFileSync("components/analysis/ComensalesAnalyticsSection.tsx", "utf8");
  const reservations = readFileSync("lib/firestore/reservations.ts", "utf8");

  assert.doesNotMatch(page, /Próximamente: análisis de comensales/);
  assert.match(page, /reservationsState/);
  assert.match(section, /Cargando reservas y comensales/);
  assert.match(section, /No se pudieron cargar las reservas/);
  assert.match(reservations, /onListenError\?\./);
});
