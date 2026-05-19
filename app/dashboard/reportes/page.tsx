"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyKpiCard, HostlySection, HostlySectionHeader, HostlySurface } from "@/components/ui/hostly";
import { loadCompras, type CompraLocal } from "@/lib/compras-local";
import { loadMermas, type MermaLocal, type MermaMotivo } from "@/lib/mermas-local";
import { fetchEscandalloMergedRowsForBrowser } from "@/lib/platos-escandallo-bridge";
import { STOCK_CHANGED_EVENT, isStockBajo, loadStock, type StockProducto, type UnidadStock } from "@/lib/stock-local";
import type { Locale } from "@/lib/i18n";

type EscandalloRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";
const MERMA_WINDOW_DAYS = 30;

const tabularNums: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

function computeMarginPercent(costeTotal: number | null, precioVenta: number | null): number | null {
  if (precioVenta == null || precioVenta === 0) return null;
  if (costeTotal == null) return null;
  const m = ((precioVenta - costeTotal) / precioVenta) * 100;
  return Number.isFinite(m) ? m : null;
}

function isoWithinLastDays(iso: string, days: number): boolean {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split("-").map(Number);
  const row = new Date(y, m - 1, d).getTime();
  const cutoff = Date.now() - days * 86400000;
  return row >= cutoff;
}

function formatEuro(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQtyDisplay(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    maximumFractionDigits: 3,
  }).format(n);
}

function formatShortIso(iso: string, locale: Locale): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso;
  try {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatMotivoLabel(m: string): string {
  return m
    .split(" ")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function mergeEscandalloOverrides(rows: EscandalloRow[]): EscandalloRow[] {
  let overrides: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    overrides = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    overrides = {};
  }
  return rows.map((r) => {
    const key = String(r.id);
    const ov = overrides[key];
    return typeof ov === "number" && Number.isFinite(ov) ? { ...r, coste_total: ov } : r;
  });
}

/** Coste unitario aproximado desde la última compra recibida con ese producto. */
function unitCostFromCompras(productoStockId: string, compras: CompraLocal[]): number | null {
  const rows = compras.filter(
    (c) => c.estado !== "cancelado" && c.producto_stock_id === productoStockId && (c.cantidad_recibida ?? 0) > 0,
  );
  rows.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  const c = rows[0];
  if (!c || !c.cantidad_recibida) return null;
  const u = c.total / c.cantidad_recibida;
  return Number.isFinite(u) && u >= 0 ? u : null;
}

function mermasInWindow(list: MermaLocal[], days: number): MermaLocal[] {
  return list.filter((m) => isoWithinLastDays(m.fecha, days));
}

function aggregateMermaQtyByProduct(list: MermaLocal[]): { name: string; qty: number; sampleUnit: UnidadStock }[] {
  const map = new Map<string, { qty: number; unit: UnidadStock }>();
  for (const m of list) {
    const k = (m.producto_stock_nombre || "").trim() || m.producto_stock_id;
    const prev = map.get(k);
    if (prev) map.set(k, { qty: prev.qty + m.cantidad, unit: prev.unit });
    else map.set(k, { qty: m.cantidad, unit: m.unidad });
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, sampleUnit: v.unit }))
    .sort((a, b) => b.qty - a.qty);
}

function topMotivos(list: MermaLocal[], limit: number): { motivo: MermaMotivo; count: number }[] {
  const map = new Map<MermaMotivo, number>();
  for (const m of list) {
    map.set(m.motivo, (map.get(m.motivo) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function supplierSpend(compras: CompraLocal[]): { proveedor: string; total: number }[] {
  const map = new Map<string, number>();
  for (const c of compras) {
    if (c.estado === "cancelado") continue;
    const k = (c.proveedor || "").trim() || "—";
    map.set(k, (map.get(k) ?? 0) + c.total);
  }
  return [...map.entries()]
    .map(([proveedor, total]) => ({ proveedor, total }))
    .sort((a, b) => b.total - a.total);
}

function escandalloMarginRanked(rows: EscandalloRow[]): { row: EscandalloRow; pct: number }[] {
  const out: { row: EscandalloRow; pct: number }[] = [];
  for (const r of rows) {
    const pct = computeMarginPercent(r.coste_total, r.precio_venta);
    if (pct != null) out.push({ row: r, pct });
  }
  return out;
}

function stockDelicateProduct(stock: StockProducto[]): StockProducto | null {
  const critical = stock.filter((p) => p.stock_actual < p.stock_minimo);
  if (critical.length === 0) return null;
  return [...critical].sort((a, b) => a.stock_actual - a.stock_minimo - (b.stock_actual - b.stock_minimo))[0] ?? null;
}

function criticalStockSorted(stock: StockProducto[]): StockProducto[] {
  return [...stock].filter(isStockBajo).sort((a, b) => a.stock_actual / Math.max(a.stock_minimo, 1e-6) - b.stock_actual / Math.max(b.stock_minimo, 1e-6));
}

type InsightCardProps = {
  label: string;
  value: string;
  sub?: string;
  accent?: "rose" | "teal" | "amber" | "sky" | "slate";
};

const insightAccentBar: Record<NonNullable<InsightCardProps["accent"]>, string> = {
  rose: "#fb7185",
  teal: "#2dd4bf",
  amber: "#fbbf24",
  sky: "#38bdf8",
  slate: "var(--hostly-table-divider-soft)",
};

function InsightCard({ label, value, sub, accent = "slate" }: InsightCardProps) {
  return (
    <HostlySurface
      variant="ice"
      className="flex min-h-0 min-w-0 flex-col gap-2 px-3.5 py-3 box-border"
      style={{ borderTop: `2px solid ${insightAccentBar[accent]}` }}
    >
      <span className="hostly-kpi-label !text-[9px]">{label}</span>
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--hostly-ink-strong)]">{value}</span>
      {sub ? <span className="hostly-muted mt-auto !text-[11px]">{sub}</span> : null}
    </HostlySurface>
  );
}

type PanelShellProps = {
  title: string;
  children: ReactNode;
};

function PanelShell({ title, children }: PanelShellProps) {
  return (
    <HostlySurface variant="ice" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden box-border">
      <div
        style={{
          flexShrink: 0,
          padding: "7px 10px 5px",
          borderBottom: "1px solid var(--hostly-table-divider-soft)",
        }}
      >
        <HostlySectionHeader title={title} titleVariant="section" className="[&_.hostly-section-label]:!mb-0" />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px 12px", WebkitOverflowScrolling: "touch" }}>{children}</div>
    </HostlySurface>
  );
}

function BarRow({
  label,
  valueLabel,
  ratio,
  barColor,
}: {
  label: string;
  valueLabel: string;
  ratio: number;
  barColor: string;
}) {
  const pct = Math.round(Math.min(100, Math.max(0, ratio * 100)));
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--hostly-ink-strong)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: "var(--hostly-ink-muted)", ...tabularNums, flexShrink: 0 }}>{valueLabel}</span>
      </div>
      <div style={{ height: 5, borderRadius: 4, background: "var(--hostly-table-divider-faint)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            background: barColor,
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function ReportesPage() {
  const { t, locale } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [stock, setStock] = useState<StockProducto[]>([]);
  const [compras, setCompras] = useState<CompraLocal[]>([]);
  const [mermas, setMermas] = useState<MermaLocal[]>([]);
  const [escandallos, setEscandallos] = useState<EscandalloRow[]>([]);
  const [escandalloError, setEscandalloError] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    setStock(loadStock());
    setCompras(loadCompras());
    setMermas(loadMermas());
  }, []);

  const loadEscandallos = useCallback(async () => {
    setEscandalloError(null);
    const { rows, error } = await fetchEscandalloMergedRowsForBrowser();

    if (error) {
      setEscandalloError(error);
      setEscandallos([]);
      return;
    }

    setEscandallos(mergeEscandalloOverrides(rows as EscandalloRow[]));
  }, []);

  useEffect(() => {
    setHydrated(true);
    refreshLocal();
    void loadEscandallos();
  }, [refreshLocal, loadEscandallos]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStock = () => refreshLocal();
    window.addEventListener(STOCK_CHANGED_EVENT, onStock);
    return () => window.removeEventListener(STOCK_CHANGED_EVENT, onStock);
  }, [refreshLocal]);

  const mermas30 = useMemo(() => mermasInWindow(mermas, MERMA_WINDOW_DAYS), [mermas]);

  const mermaCost30d = useMemo(() => {
    let sum = 0;
    for (const m of mermas30) {
      const unit = unitCostFromCompras(m.producto_stock_id, compras);
      if (unit != null) sum += unit * m.cantidad;
    }
    return sum;
  }, [mermas30, compras]);

  const mermas30Count = mermas30.length;

  const avgMarginPct = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const r of escandallos) {
      const m = computeMarginPercent(r.coste_total, r.precio_venta);
      if (m != null) {
        sum += m;
        n += 1;
      }
    }
    return n > 0 ? sum / n : null;
  }, [escandallos]);

  const criticalCount = useMemo(() => stock.filter(isStockBajo).length, [stock]);

  const comprasActivas = useMemo(() => compras.filter((c) => c.estado !== "cancelado"), [compras]);

  const pedidosRealizados = comprasActivas.length;

  const totalCompraSpend = useMemo(() => comprasActivas.reduce((s, c) => s + c.total, 0), [comprasActivas]);

  const topMermaRows = useMemo(() => aggregateMermaQtyByProduct(mermas30).slice(0, 6), [mermas30]);

  const motivoRows = useMemo(() => topMotivos(mermas30, 6), [mermas30]);

  const rankedMargins = useMemo(() => escandalloMarginRanked(escandallos), [escandallos]);

  const bestMargin = useMemo(() => {
    if (rankedMargins.length === 0) return null;
    return [...rankedMargins].sort((a, b) => b.pct - a.pct)[0] ?? null;
  }, [rankedMargins]);

  const worstMargin = useMemo(() => {
    if (rankedMargins.length === 0) return null;
    return [...rankedMargins].sort((a, b) => a.pct - b.pct)[0] ?? null;
  }, [rankedMargins]);

  const delicate = useMemo(() => stockDelicateProduct(stock), [stock]);

  const suppliers = useMemo(() => supplierSpend(comprasActivas), [comprasActivas]);

  const topSupplier = suppliers[0] ?? null;

  const lastCompra = useMemo(() => {
    if (comprasActivas.length === 0) return null;
    return [...comprasActivas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))[0] ?? null;
  }, [comprasActivas]);

  const lastMerma = useMemo(() => {
    if (mermas.length === 0) return null;
    return [...mermas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))[0] ?? null;
  }, [mermas]);

  const activityLine = useMemo(() => {
    if (!lastCompra && !lastMerma) return t("reportes.activityNone");
    const cmp = lastCompra ? lastCompra.fecha : "";
    const mm = lastMerma ? lastMerma.fecha : "";
    if (lastCompra && (!lastMerma || cmp >= mm)) {
      return t("reportes.activityCompra", {
        supplier: lastCompra.proveedor,
        date: formatShortIso(lastCompra.fecha, locale),
      });
    }
    if (lastMerma) {
      const name = (lastMerma.producto_stock_nombre || "").trim() || lastMerma.producto_stock_id;
      return t("reportes.activityMerma", { product: name, date: formatShortIso(lastMerma.fecha, locale) });
    }
    return t("reportes.activityNone");
  }, [lastCompra, lastMerma, t, locale]);

  const topMermaProduct = topMermaRows[0] ?? null;

  const topMotivo = motivoRows[0] ?? null;

  const maxMermaQty = topMermaRows[0]?.qty ?? 1;
  const maxMotivoCount = motivoRows[0]?.count ?? 1;

  const criticalList = useMemo(() => criticalStockSorted(stock).slice(0, 8), [stock]);

  const dataRichnessScore = useMemo(() => {
    let s = 0;
    if (mermas30Count > 0) s += 1;
    if (pedidosRealizados > 0) s += 1;
    if (avgMarginPct != null && !escandalloError) s += 1;
    if (criticalCount > 0) s += 1;
    return s;
  }, [mermas30Count, pedidosRealizados, avgMarginPct, escandalloError, criticalCount]);

  const showDataOnboarding = hydrated && dataRichnessScore < 3;

  const marginDisplay =
    !hydrated || escandalloError ? t("reportes.marginDash") : avgMarginPct != null ? `${Math.round(avgMarginPct)}%` : t("reportes.marginDash");

  const mermaCostHasEstimate = mermaCost30d > 0;

  return (
    <ModulePageShell
      title={t("reportes.title")}
      subtitle={t("reportes.subtitle")}
      maxWidth={1180}
      compactLayout
      lockViewport
      shellSurface="configLight"
      headerRight={
        <button
          type="button"
          onClick={() => {
            refreshLocal();
            void loadEscandallos();
          }}
          className="hostly-button-secondary shrink-0 !min-h-0 px-3.5 py-2 text-sm whitespace-nowrap"
        >
          {t("common.reload")}
        </button>
      }
    >
      <HostlySection stack="sm" className="min-h-0 flex-1 overflow-hidden">
        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <HostlyKpiCard
            title={t("reportes.kpiMermaCost")}
            value={hydrated ? formatEuro(mermaCost30d, locale) : t("reportes.marginDash")}
            helper={mermaCostHasEstimate ? t("reportes.kpiMermaSubEstimated") : t("reportes.kpiMermaSub")}
            accentColor="#fb7185"
            valueTitle={hydrated ? formatEuro(mermaCost30d, locale) : undefined}
            className="px-3 py-2.5"
          />
          <HostlyKpiCard
            title={t("reportes.kpiMermaCount")}
            value={hydrated ? mermas30Count : t("reportes.marginDash")}
            helper={t("reportes.kpiMermaCountSub")}
            accentColor="#fda4af"
            valueTitle={hydrated ? String(mermas30Count) : undefined}
            valueClassName="!text-[#e11d48]"
            className="px-3 py-2.5"
          />
          <HostlyKpiCard
            title={t("reportes.kpiMargin")}
            value={marginDisplay}
            helper={escandalloError ? t("reportes.escandalloSyncError") : t("reportes.kpiMarginSub")}
            accentColor="#34d399"
            valueClassName={
              avgMarginPct != null && !escandalloError ? "!text-[#0f766e]" : undefined
            }
            valueTitle={typeof marginDisplay === "string" ? marginDisplay : undefined}
            className="px-3 py-2.5"
          />
          <HostlyKpiCard
            title={t("reportes.kpiCritical")}
            value={hydrated ? criticalCount : t("reportes.marginDash")}
            helper={t("reportes.kpiCriticalSub")}
            accentColor="#fcd34d"
            valueTitle={hydrated ? String(criticalCount) : undefined}
            valueClassName={criticalCount > 0 ? "!text-[#b45309]" : undefined}
            className="px-3 py-2.5"
          />
          <HostlyKpiCard
            title={t("reportes.kpiOrders")}
            value={hydrated ? pedidosRealizados : t("reportes.marginDash")}
            helper={t("reportes.kpiOrdersSub")}
            accentColor="#38bdf8"
            valueTitle={hydrated ? String(pedidosRealizados) : undefined}
            className="px-3 py-2.5"
          />
          <HostlyKpiCard
            title={t("reportes.kpiSpend")}
            value={hydrated ? formatEuro(totalCompraSpend, locale) : t("reportes.marginDash")}
            helper={t("reportes.kpiSpendSub")}
            accentColor="#a78bfa"
            valueTitle={hydrated ? formatEuro(totalCompraSpend, locale) : undefined}
            className="px-3 py-2.5"
          />
        </div>

        {/* Insights */}
        <div style={{ flexShrink: 0, minHeight: 0 }}>
          <HostlySectionHeader title={t("reportes.sectionInsights")} titleVariant="section" className="[&_.hostly-section-label]:!mb-2" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <InsightCard
              label={t("reportes.insightTopMerma")}
              value={topMermaProduct ? topMermaProduct.name : t("reportes.noData")}
              sub={
                topMermaProduct
                  ? t("reportes.qtyUnit", {
                      qty: formatQtyDisplay(topMermaProduct.qty, locale),
                      unit: topMermaProduct.sampleUnit,
                    })
                  : undefined
              }
              accent="rose"
            />
            <InsightCard
              label={t("reportes.insightTopMotivo")}
              value={topMotivo ? formatMotivoLabel(topMotivo.motivo) : t("reportes.noData")}
              sub={topMotivo ? String(topMotivo.count) : undefined}
              accent="rose"
            />
            <InsightCard
              label={t("reportes.insightDelicate")}
              value={delicate ? delicate.nombre : t("reportes.noData")}
              sub={
                delicate
                  ? t("reportes.stockDelicateSub", {
                      actual: formatQtyDisplay(delicate.stock_actual, locale),
                      min: formatQtyDisplay(delicate.stock_minimo, locale),
                      unit: delicate.unidad,
                    })
                  : undefined
              }
              accent="amber"
            />
            <InsightCard
              label={t("reportes.insightBestMargin")}
              value={
                bestMargin && !escandalloError
                  ? (bestMargin.row.nombre_plato || "").trim() || t("reportes.noData")
                  : t("reportes.noData")
              }
              sub={bestMargin && !escandalloError ? `${Math.round(bestMargin.pct)}%` : undefined}
              accent="teal"
            />
            <InsightCard
              label={t("reportes.insightWorstMargin")}
              value={
                worstMargin && !escandalloError
                  ? (worstMargin.row.nombre_plato || "").trim() || t("reportes.noData")
                  : t("reportes.noData")
              }
              sub={worstMargin && !escandalloError ? `${Math.round(worstMargin.pct)}%` : undefined}
              accent="amber"
            />
            <InsightCard
              label={t("reportes.insightSupplier")}
              value={topSupplier ? topSupplier.proveedor : t("reportes.noData")}
              sub={topSupplier ? formatEuro(topSupplier.total, locale) : undefined}
              accent="sky"
            />
            <InsightCard label={t("reportes.insightActivity")} value={activityLine} accent="slate" />
            <InsightCard
              label={t("reportes.insightLatestCompra")}
              value={
                lastCompra
                  ? t("reportes.lastOrder", {
                      supplier: lastCompra.proveedor,
                      date: formatShortIso(lastCompra.fecha, locale),
                    })
                  : t("reportes.noData")
              }
              sub={lastCompra ? formatEuro(lastCompra.total, locale) : undefined}
              accent="sky"
            />
          </div>
        </div>

        {showDataOnboarding ? (
          <HostlySurface variant="soft" className="box-border shrink-0 border border-teal-200/25 px-3.5 py-2.5">
            <p className="m-0 text-[13px] font-semibold leading-snug text-[color:var(--hostly-ink-strong)]">{t("reportes.emptyTitle")}</p>
            <p className="hostly-muted mb-0 mt-1 !text-[12px] !leading-snug">{t("reportes.emptyBody")}</p>
          </HostlySurface>
        ) : null}

        {/* Paneles inferiores */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <HostlySectionHeader title={t("reportes.sectionPanels")} titleVariant="section" className="[&_.hostly-section-label]:!mb-2 shrink-0" />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
              alignContent: "stretch",
            }}
          >
            <PanelShell title={t("reportes.panelTopMermas")}>
              {topMermaRows.length === 0 ? (
                <p className="hostly-muted mb-0 !text-[12px]">{t("reportes.noData")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {topMermaRows.map((row) => (
                    <BarRow
                      key={row.name}
                      label={row.name}
                      valueLabel={t("reportes.qtyUnit", {
                        qty: formatQtyDisplay(row.qty, locale),
                        unit: row.sampleUnit,
                      })}
                      ratio={row.qty / maxMermaQty}
                      barColor="linear-gradient(90deg, #fb7185, #f472b6)"
                    />
                  ))}
                </div>
              )}
            </PanelShell>

            <PanelShell title={t("reportes.panelMotivos")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {motivoRows.length === 0 ? (
                  <p className="hostly-muted mb-0 !text-[12px]">{t("reportes.noData")}</p>
                ) : (
                  motivoRows.map((row) => (
                    <BarRow
                      key={row.motivo}
                      label={formatMotivoLabel(row.motivo)}
                      valueLabel={String(row.count)}
                      ratio={row.count / maxMotivoCount}
                      barColor="linear-gradient(90deg, #a78bfa, #818cf8)"
                    />
                  ))
                )}
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 10,
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div className="hostly-kpi-label mb-2 !text-[9px]">{t("reportes.panelComprasHint")}</div>
                  <div className="text-xs font-semibold leading-snug text-[color:var(--hostly-ink-strong)]">
                    {formatEuro(totalCompraSpend, locale)}
                  </div>
                  <div className="hostly-muted mb-0 mt-1 text-[11px] leading-snug">
                    {lastCompra
                      ? t("reportes.lastOrder", {
                          supplier: lastCompra.proveedor,
                          date: formatShortIso(lastCompra.fecha, locale),
                        })
                      : t("reportes.noData")}
                  </div>
                </div>
              </div>
            </PanelShell>

            <PanelShell title={`${t("reportes.panelStockRisk")} · ${t("reportes.panelMargins")}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  {criticalList.length === 0 ? (
                    <p className="hostly-muted mb-0 !text-[12px]">{t("reportes.noData")}</p>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {criticalList.map((p) => (
                        <li key={p.id} className="text-xs leading-snug text-[color:var(--hostly-ink)]">
                          {t("reportes.stockLine", {
                            name: p.nombre,
                            actual: formatQtyDisplay(p.stock_actual, locale),
                            min: formatQtyDisplay(p.stock_minimo, locale),
                            unit: p.unidad,
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={{ paddingTop: 10, borderTop: "1px solid var(--hostly-table-divider-soft)" }}>
                  <div className="hostly-kpi-label mb-2 !text-[9px]">{t("reportes.panelMargins")}</div>
                  {escandalloError ? (
                    <p className="mb-0 text-xs font-semibold text-[color:#b91c1c]">{t("reportes.escandalloSyncError")}</p>
                  ) : rankedMargins.length === 0 ? (
                    <p className="hostly-muted mb-0 !text-[12px]">{t("reportes.noData")}</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div className="hostly-kpi-label !text-[10px] !text-[color:#0d9488]">{t("reportes.marginWinners")}</div>
                      {[...rankedMargins].sort((a, b) => b.pct - a.pct).slice(0, 3).map(({ row, pct }) => (
                        <BarRow
                          key={`b-${String(row.id)}`}
                          label={(row.nombre_plato || "").trim() || "—"}
                          valueLabel={`${Math.round(pct)}%`}
                          ratio={Math.max(0, Math.min(1, pct / 100))}
                          barColor="linear-gradient(90deg, #34d399, #2dd4bf)"
                        />
                      ))}
                      <div className="hostly-kpi-label mt-1 !text-[10px] !text-[color:#d97706]">{t("reportes.marginLosers")}</div>
                      {[...rankedMargins].sort((a, b) => a.pct - b.pct).slice(0, 3).map(({ row, pct }) => (
                        <BarRow
                          key={`w-${String(row.id)}`}
                          label={(row.nombre_plato || "").trim() || "—"}
                          valueLabel={`${Math.round(pct)}%`}
                          ratio={Math.max(0, Math.min(1, (100 - pct) / 100))}
                          barColor="linear-gradient(90deg, #fbbf24, #f97316)"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PanelShell>
          </div>
        </div>
      </HostlySection>
    </ModulePageShell>
  );
}
