"use client";

import { useMemo, useState } from "react";
import { HostlyKpiCard, HostlySectionHeader } from "@/components/ui/hostly";
import {
  buildInventoryMarginAnalytics,
  normalizeInventoryMarginOrders,
  type InventoryMarginAggregateRow,
  type InventoryMarginOrderInput,
} from "@/lib/analytics/inventory-margin-analytics";

export type RentabilidadAnalyticsSectionProps = {
  orders?: Array<Record<string, unknown>> | null;
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

function filterPillClass(active: boolean): string {
  return `hostly-pill px-3 py-2 text-sm${active ? "" : ""}`;
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
        flex: 1,
      }}
    >
      <HostlySectionHeader
        title="Rentabilidad"
        description={`Margen histórico con costes congelados al enviar · ${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)}`}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--hostly-ink-muted)",
          }}
        >
          Desde
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 14,
            fontWeight: 700,
            outline: "none",
          }}
          aria-label="Desde"
        />
        <label
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--hostly-ink-muted)",
          }}
        >
          Hasta
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 14,
            fontWeight: 700,
            outline: "none",
          }}
          aria-label="Hasta"
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
          className={filterPillClass(familyFilter !== "all")}
          aria-label="Filtrar por familia"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 13,
            fontWeight: 700,
          }}
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
          className={filterPillClass(categoryFilter !== "all")}
          aria-label="Filtrar por categoría"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-strong)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <option value="all">Todas las categorías</option>
          {baseAnalytics.filterOptions.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {!hasCompleteData ? (
        <div className="hostly-panel p-4">
          <div style={{ fontSize: 14, color: "var(--hostly-ink-muted)", lineHeight: 1.5 }}>
            No hay líneas con coste de inventario completo en este periodo.
            {summary.incompleteCostCount > 0
              ? ` ${summary.incompleteCostCount} línea(s) con coste incompleto.`
              : ""}
            {summary.excludedNoCostCount > 0
              ? ` ${summary.excludedNoCostCount} línea(s) sin snapshot histórico.`
              : ""}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
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
                ? `${summary.incompleteCostCount} línea(s) con coste incompleto excluidas del margen. `
                : ""}
              {summary.excludedNoCostCount > 0
                ? `${summary.excludedNoCostCount} línea(s) antiguas sin snapshot excluidas.`
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
              title="Muchas ventas, poco margen"
              rows={analytics.highVolumeLowMarginProducts}
              emptyLabel=""
            />
          ) : null}
        </>
      )}
    </div>
  );
}
