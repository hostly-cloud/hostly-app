"use client";

import { useMemo, useState } from "react";
import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { HostlyKpiCard, HostlySectionHeader } from "@/components/ui/hostly";
import {
  buildInventoryMarginAnalytics,
  normalizeInventoryMarginOrders,
  type InventoryMarginAggregateRow,
} from "@/lib/analytics/inventory-margin-analytics";

export type RentabilidadAnalyticsSectionProps = {
  orders?: Array<Record<string, unknown>> | null;
  dataState?: "loading" | "ready" | "error";
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  formatDateEs: (date: string) => string;
};

function formatEur(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")} %`;
}

function lineCountLabel(count: number): string {
  return `${count} ${count === 1 ? "línea" : "líneas"}`;
}

function MarginProductsTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: InventoryMarginAggregateRow[];
  emptyLabel: string;
}) {
  return (
    <div className="hostly-panel p-4">
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--hostly-ink-strong)",
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--hostly-ink-muted)",
            padding: "8px 0",
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <table className="hostly-inv-native-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="hostly-inv-th-num">Ventas</th>
              <th className="hostly-inv-th-num">Coste</th>
              <th className="hostly-inv-th-num">Margen</th>
              <th className="hostly-inv-th-num">%</th>
              <th className="hostly-inv-th-num">Uds.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="hostly-inv-td-primary">{row.label}</td>
                <td className="hostly-inv-td-amount">{formatEur(row.sales)}</td>
                <td className="hostly-inv-td-amount">{formatEur(row.cost)}</td>
                <td className="hostly-inv-td-amount">{formatEur(row.margin)}</td>
                <td className="hostly-inv-td-muted">{formatPercent(row.marginPercent)}</td>
                <td className="hostly-inv-td-muted">{row.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function RentabilidadAnalyticsSection({
  orders,
  dataState = "ready",
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  formatDateEs,
}: RentabilidadAnalyticsSectionProps) {
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const marginOrders = useMemo(
    () => normalizeInventoryMarginOrders(orders),
    [orders],
  );

  const baseAnalytics = useMemo(
    () => buildInventoryMarginAnalytics(marginOrders),
    [marginOrders],
  );

  const analytics = useMemo(
    () =>
      buildInventoryMarginAnalytics(marginOrders, {
        familyName: familyFilter,
        categoryName: categoryFilter,
      }),
    [marginOrders, familyFilter, categoryFilter],
  );

  const { summary, byProduct } = analytics;
  const hasCompleteData = summary.completeLineCount > 0;

  return (
    <div className="hostly-analytics-panel">
      <div className="hostly-analytics-stack">
      <HostlySectionHeader
        title="Rentabilidad"
        description={`Ventas cobradas con costes congelados al enviar · ${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)}`}
        titleVariant="section"
        className="hostly-section-header--operational"
      />

      {dataState === "loading" ? (
        <div className="hostly-panel p-4" role="status" aria-live="polite">
          <div style={{ fontSize: 14, color: "var(--hostly-ink-muted)" }}>
            Cargando ventas cobradas y costes…
          </div>
        </div>
      ) : dataState === "error" ? (
        <div className="hostly-panel p-4" role="alert">
          <div style={{ fontSize: 14, color: "var(--hostly-ink-muted)", lineHeight: 1.5 }}>
            No se pudo calcular la rentabilidad. Revisa tu conexión o tus permisos e inténtalo de nuevo.
          </div>
        </div>
      ) : (
        <>

      <div className="hostly-analytics-toolbar">
        <div className="hostly-analytics-toolbar__filters">
          <AnalyticsDateRangeFields
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="hostly-select hostly-select--toolbar-compact"
            aria-label="Filtrar por familia"
          >
            <option value="all">Todas las familias</option>
            {baseAnalytics.filterOptions.families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="hostly-select hostly-select--toolbar-compact"
            aria-label="Filtrar por categoría"
          >
            <option value="all">Todas las categorías</option>
            {baseAnalytics.filterOptions.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasCompleteData ? (
        <div className="hostly-panel p-4">
          <div style={{ fontSize: 14, color: "var(--hostly-ink-muted)", lineHeight: 1.5 }}>
            {marginOrders.length === 0
              ? "No hay ventas completamente cobradas en este periodo."
              : "No hay líneas con coste de inventario completo en este periodo."}
            {summary.incompleteCostCount > 0
              ? ` ${lineCountLabel(summary.incompleteCostCount)} con coste incompleto.`
              : ""}
            {summary.excludedNoCostCount > 0
              ? ` ${lineCountLabel(summary.excludedNoCostCount)} sin historial de coste.`
              : ""}
          </div>
        </div>
      ) : (
        <>
          <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics">
            <HostlyKpiCard title="Ventas" value={formatEur(summary.salesTotal)} />
            <HostlyKpiCard title="Coste inventario" value={formatEur(summary.costTotal)} />
            <HostlyKpiCard title="Margen bruto" value={formatEur(summary.grossMargin)} />
            <HostlyKpiCard
              title="Margen %"
              value={formatPercent(summary.grossMarginPercent)}
              helper={`${summary.completeLineCount} líneas con coste`}
            />
          </div>

          {(summary.incompleteCostCount > 0 || summary.excludedNoCostCount > 0) && (
            <div
              style={{
                fontSize: 12,
                color: "var(--hostly-ink-muted)",
                padding: "0 2px",
              }}
            >
              {summary.incompleteCostCount > 0
                ? `${lineCountLabel(summary.incompleteCostCount)} con coste incompleto excluidas del margen. `
                : ""}
              {summary.excludedNoCostCount > 0
                ? `${lineCountLabel(summary.excludedNoCostCount)} antiguas sin historial de coste excluidas.`
                : ""}
            </div>
          )}

          <MarginProductsTable
            title="Productos"
            rows={byProduct}
            emptyLabel="Sin productos con margen completo en el filtro actual."
          />

          {analytics.topProfitableProducts.length > 0 ? (
            <MarginProductsTable
              title="Top rentables"
              rows={analytics.topProfitableProducts}
              emptyLabel=""
            />
          ) : null}

          {analytics.highVolumeLowMarginProducts.length > 0 ? (
            <MarginProductsTable
              title="Menor margen entre productos con 2 o más unidades"
              rows={analytics.highVolumeLowMarginProducts}
              emptyLabel=""
            />
          ) : null}
        </>
      )}
        </>
      )}
      </div>
    </div>
  );
}
