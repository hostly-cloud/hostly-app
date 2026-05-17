"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
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

const insightAccentBorder: Record<NonNullable<InsightCardProps["accent"]>, string> = {
  rose: "rgba(251, 113, 133, 0.22)",
  teal: "rgba(45, 212, 191, 0.22)",
  amber: "rgba(251, 191, 36, 0.22)",
  sky: "rgba(56, 189, 248, 0.22)",
  slate: "rgba(148, 163, 184, 0.14)",
};

function InsightCard({ label, value, sub, accent = "slate" }: InsightCardProps) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "12px 14px",
        border: `1px solid ${insightAccentBorder[accent]}`,
        background: "linear-gradient(155deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.72) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#64748b",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {value}
      </span>
      {sub ? (
        <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.3, marginTop: "auto" }}>{sub}</span>
      ) : null}
    </div>
  );
}

type PanelShellProps = {
  title: string;
  children: ReactNode;
};

function PanelShell({ title, children }: PanelShellProps) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(148, 163, 184, 0.12)",
        background: "linear-gradient(160deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.85) 100%)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: "10px 12px 8px",
          borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8" }}>
          {title}
        </h3>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px 12px" }}>{children}</div>
    </div>
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
        <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: "#94a3b8", ...tabularNums, flexShrink: 0 }}>{valueLabel}</span>
      </div>
      <div style={{ height: 5, borderRadius: 4, background: "rgba(148, 163, 184, 0.1)" }}>
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

  const kpiShell: CSSProperties = {
    background: "linear-gradient(155deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.78) 100%)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: 14,
    padding: "12px 14px",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
  };

  const sectionEyebrow: CSSProperties = {
    margin: "0 0 8px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#64748b",
    flexShrink: 0,
  };

  return (
    <ModulePageShell
      title={t("reportes.title")}
      subtitle={t("reportes.subtitle")}
      maxWidth={1180}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={() => {
            refreshLocal();
            void loadEscandallos();
          }}
          style={{
            border: "1px solid var(--hostly-line)",
            background: "var(--hostly-surface-card-solid)",
            color: "var(--hostly-ink-muted)",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            boxShadow: "var(--hostly-shadow-hairline)",
          }}
        >
          {t("common.reload")}
        </button>
      }
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
        }}
      >
        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiMermaCost")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", ...tabularNums }}>
              {hydrated ? formatEuro(mermaCost30d, locale) : t("reportes.marginDash")}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto", lineHeight: 1.3 }}>
              {mermaCostHasEstimate ? t("reportes.kpiMermaSubEstimated") : t("reportes.kpiMermaSub")}
            </span>
          </div>
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiMermaCount")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", ...tabularNums, color: "#fda4af" }}>
              {hydrated ? mermas30Count : t("reportes.marginDash")}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>{t("reportes.kpiMermaCountSub")}</span>
          </div>
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiMargin")}
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                ...tabularNums,
                color: avgMarginPct != null && !escandalloError ? "#5eead4" : "#e2e8f0",
              }}
            >
              {marginDisplay}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>
              {escandalloError ? t("reportes.escandalloSyncError") : t("reportes.kpiMarginSub")}
            </span>
          </div>
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiCritical")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", ...tabularNums, color: criticalCount > 0 ? "#fcd34d" : "#f8fafc" }}>
              {hydrated ? criticalCount : t("reportes.marginDash")}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>{t("reportes.kpiCriticalSub")}</span>
          </div>
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiOrders")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", ...tabularNums }}>{hydrated ? pedidosRealizados : t("reportes.marginDash")}</span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>{t("reportes.kpiOrdersSub")}</span>
          </div>
          <div style={kpiShell}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              {t("reportes.kpiSpend")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", ...tabularNums }}>{hydrated ? formatEuro(totalCompraSpend, locale) : t("reportes.marginDash")}</span>
            <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>{t("reportes.kpiSpendSub")}</span>
          </div>
        </div>

        {/* Insights */}
        <div style={{ flexShrink: 0, minHeight: 0 }}>
          <h2 style={sectionEyebrow}>{t("reportes.sectionInsights")}</h2>
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
          <div
            style={{
              flexShrink: 0,
              borderRadius: 12,
              padding: "10px 14px",
              border: "1px solid rgba(94, 234, 212, 0.18)",
              background: "linear-gradient(125deg, rgba(13, 148, 136, 0.1) 0%, rgba(15, 23, 42, 0.9) 100%)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t("reportes.emptyTitle")}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>{t("reportes.emptyBody")}</div>
          </div>
        ) : null}

        {/* Paneles inferiores */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ ...sectionEyebrow, marginBottom: 0 }}>{t("reportes.sectionPanels")}</h2>
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
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("reportes.noData")}</p>
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
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("reportes.noData")}</p>
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
                    borderTop: "1px solid rgba(148, 163, 184, 0.1)",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
                    {t("reportes.panelComprasHint")}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35 }}>
                    {formatEuro(totalCompraSpend, locale)}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.35 }}>
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
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("reportes.noData")}</p>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {criticalList.map((p) => (
                        <li key={p.id} style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.35 }}>
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
                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 8 }}>
                    {t("reportes.panelMargins")}
                  </div>
                  {escandalloError ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>{t("reportes.escandalloSyncError")}</p>
                  ) : rankedMargins.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("reportes.noData")}</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#5eead4", letterSpacing: "0.04em" }}>{t("reportes.marginWinners")}</div>
                      {[...rankedMargins].sort((a, b) => b.pct - a.pct).slice(0, 3).map(({ row, pct }) => (
                        <BarRow
                          key={`b-${String(row.id)}`}
                          label={(row.nombre_plato || "").trim() || "—"}
                          valueLabel={`${Math.round(pct)}%`}
                          ratio={Math.max(0, Math.min(1, pct / 100))}
                          barColor="linear-gradient(90deg, #34d399, #2dd4bf)"
                        />
                      ))}
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#fdba74", letterSpacing: "0.04em", marginTop: 4 }}>
                        {t("reportes.marginLosers")}
                      </div>
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
      </div>
    </ModulePageShell>
  );
}
