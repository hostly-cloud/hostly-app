"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { loadCompras, type CompraEstado, type CompraLocal } from "@/lib/compras-local";
import { loadMermas, type MermaLocal } from "@/lib/mermas-local";
import { STOCK_CHANGED_EVENT, isStockBajo, loadStock, type StockProducto } from "@/lib/stock-local";
import { supabase } from "@/lib/supabase";
import type { Locale } from "@/lib/i18n";

type EscandalloRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

const MERMA_WINDOW_DAYS = 30;
const MERMA_RECENT_DAYS = 7;

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

function formatIsoDate(iso: string, locale: Locale): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso;
  try {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatEuro(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMotivoMerma(m: string): string {
  return m
    .split(" ")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function sortMermasDesc(a: MermaLocal, b: MermaLocal): number {
  const c = b.fecha.localeCompare(a.fecha);
  if (c !== 0) return c;
  return b.id.localeCompare(a.id);
}

function sortComprasDesc(a: CompraLocal, b: CompraLocal): number {
  const c = b.fecha.localeCompare(a.fecha);
  if (c !== 0) return c;
  return b.id.localeCompare(a.id);
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

function IconStock({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16v10H4V7zm2 2v6h12V9H6zm2-4h8v2H8V5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6h15l-2 9H8L6 6zm0 0L5 3H2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.5" fill="currentColor" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconRecepciones({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7h13v10H3V7zm13 3h3l2 2v5h-5v-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="18" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="18" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconFacturasCostes({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h8l3 3v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4M8 12h8M8 15h6M8 18h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M16.5 20.5h3M18 19v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconValidacionInteligente({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2l1.2 3.6h3.8l-3 2.2 1.1 3.5L12 10.5 8.9 11.3l1.1-3.5-3-2.2h3.8L12 2z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M8 14h9l2 2v5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-5l2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconWaste({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6l1 4H8l1-4zm-2 6h10l-1 14H8L7 9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRecipe({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16V11M12 16V8M16 16V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 8v-1a4 4 0 0 0-4-4h-1M8 21v-1a4 4 0 0 0-4-4H3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MODULE_ENTRIES = [
  { path: "/dashboard/stock", titleKey: "dashboard.moduleStock", Icon: IconStock },
  { path: "/dashboard/compras", titleKey: "dashboard.moduleCompras", Icon: IconCart },
  { path: "/dashboard/recepciones", titleKey: "dashboard.moduleRecepciones", Icon: IconRecepciones },
  { path: "/dashboard/facturas-costes", titleKey: "dashboard.moduleFacturasCostes", Icon: IconFacturasCostes },
  { path: "/dashboard/validacion-inteligente", titleKey: "dashboard.moduleValidacionInteligente", Icon: IconValidacionInteligente },
  { path: "/dashboard/mermas", titleKey: "dashboard.moduleMermas", Icon: IconWaste },
  { path: "/dashboard/escandallos", titleKey: "dashboard.moduleEscandallos", Icon: IconRecipe },
  { path: "/dashboard/reportes", titleKey: "dashboard.moduleReportes", Icon: IconChart },
  { path: "/dashboard/usuarios", titleKey: "dashboard.moduleUsuarios", Icon: IconUsers },
] as const;

type AlertTone = "amber" | "rose" | "sky" | "orange";

function compraEstadoLabel(estado: CompraEstado, t: (k: string) => string): string {
  switch (estado) {
    case "pendiente":
      return t("dashboard.compraEstadoPendiente");
    case "recibido":
      return t("dashboard.compraEstadoRecibido");
    default:
      return t("dashboard.compraEstadoCancelado");
  }
}

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#64748b",
  textTransform: "uppercase",
};

const controlPanelStyle: CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: "8px 10px",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

export default function DashboardPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [stock, setStock] = useState<StockProducto[]>([]);
  const [compras, setCompras] = useState<CompraLocal[]>([]);
  const [mermas, setMermas] = useState<MermaLocal[]>([]);
  const [escandallos, setEscandallos] = useState<EscandalloRow[]>([]);
  const [escandalloError, setEscandalloError] = useState<string | null>(null);
  const [hoverModule, setHoverModule] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    setStock(loadStock());
    setCompras(loadCompras());
    setMermas(loadMermas());
  }, []);

  const loadEscandallos = useCallback(async () => {
    setEscandalloError(null);
    const { data, error } = await supabase
      .from("escandallos")
      .select("id, nombre_plato, coste_total, precio_venta")
      .order("nombre_plato", { ascending: true, nullsFirst: false });

    if (error) {
      setEscandalloError(error.message);
      setEscandallos([]);
      return;
    }

    const baseRows = (data ?? []) as EscandalloRow[];
    setEscandallos(mergeEscandalloOverrides(baseRows));
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

  const stockCriticoCount = useMemo(() => stock.filter(isStockBajo).length, [stock]);

  const mermaCost30d = useMemo(() => {
    let sum = 0;
    for (const m of mermas) {
      if (isoWithinLastDays(m.fecha, MERMA_WINDOW_DAYS)) {
        sum += 0;
      }
    }
    return sum;
  }, [mermas]);

  const mermasRecent7d = useMemo(
    () => mermas.filter((m) => isoWithinLastDays(m.fecha, MERMA_RECENT_DAYS)).length,
    [mermas],
  );

  const pedidosPendientes = useMemo(() => compras.filter((c) => c.estado === "pendiente").length, [compras]);

  const { avgMarginPct, incompleteEscandalloCount, lastPriceRow } = useMemo(() => {
    let sum = 0;
    let n = 0;
    let incomplete = 0;
    for (const r of escandallos) {
      const m = computeMarginPercent(r.coste_total, r.precio_venta);
      if (m != null) {
        sum += m;
        n += 1;
      }
      const hasVenta = r.precio_venta != null && r.precio_venta > 0;
      const missingCoste = r.coste_total == null || r.coste_total === 0;
      if (hasVenta && missingCoste) incomplete += 1;
    }
    const avg = n > 0 ? sum / n : null;
    const sorted = [...escandallos].sort((a, b) => String(b.id).localeCompare(String(a.id)));
    const priceRow = sorted.find((r) => r.precio_venta != null && r.precio_venta > 0) ?? null;
    return { avgMarginPct: avg, incompleteEscandalloCount: incomplete, lastPriceRow: priceRow };
  }, [escandallos]);

  const lastMerma = useMemo(() => {
    if (!mermas.length) return null;
    return [...mermas].sort(sortMermasDesc)[0];
  }, [mermas]);

  const lastCompra = useMemo(() => {
    if (!compras.length) return null;
    return [...compras].sort(sortComprasDesc)[0];
  }, [compras]);

  const lowStockProducts = useMemo(() => stock.filter(isStockBajo), [stock]);

  const productsLabel =
    stockCriticoCount === 1 ? t("dashboard.productsCountOne") : t("dashboard.productsCount", { count: stockCriticoCount });

  const ordersLabel =
    pedidosPendientes === 1 ? t("dashboard.ordersCountOne") : t("dashboard.ordersCount", { count: pedidosPendientes });

  const marginMain =
    !hydrated || escandalloError ? t("dashboard.marginDash") : avgMarginPct != null ? `${Math.round(avgMarginPct)}%` : t("dashboard.marginDash");

  const alerts = useMemo(() => {
    const items: { key: string; title: string; body: string; tone: AlertTone }[] = [];
    if (escandalloError) {
      items.push({
        key: "sync",
        title: t("dashboard.alertSyncTitle"),
        body: t("dashboard.alertSyncLine"),
        tone: "rose",
      });
    }
    if (lowStockProducts.length > 0) {
      items.push({
        key: "stock",
        title: t("dashboard.alertStockLowTitle"),
        body: t("dashboard.alertStockLowLine", { count: lowStockProducts.length }),
        tone: "amber",
      });
    }
    if (incompleteEscandalloCount > 0 && !escandalloError) {
      items.push({
        key: "esc",
        title: t("dashboard.alertIncompleteEscandalloTitle"),
        body: t("dashboard.alertIncompleteEscandalloLine", { count: incompleteEscandalloCount }),
        tone: "sky",
      });
    }
    if (pedidosPendientes > 0) {
      items.push({
        key: "compras",
        title: t("dashboard.alertPendingPurchasesTitle"),
        body: t("dashboard.alertPendingPurchasesLine", { count: pedidosPendientes }),
        tone: "orange",
      });
    }
    if (mermasRecent7d > 0) {
      items.push({
        key: "mermas7",
        title: t("dashboard.alertRecentMermasTitle"),
        body: t("dashboard.alertRecentMermasLine", { count: mermasRecent7d }),
        tone: "amber",
      });
    }
    return items;
  }, [
    lowStockProducts.length,
    incompleteEscandalloCount,
    escandalloError,
    pedidosPendientes,
    mermasRecent7d,
    t,
  ]);

  const kpiCards = useMemo(
    () => [
      {
        label: t("dashboard.kpiStockCritical"),
        value: hydrated ? productsLabel : "—",
        sub: t("dashboard.kpiStockCriticalSub"),
        accent: "#fb7185",
      },
      {
        label: t("dashboard.kpiMermasCost"),
        value: hydrated ? formatEuro(mermaCost30d, locale) : "—",
        sub: t("dashboard.kpiMermasCostSub"),
        accent: "#fbbf24",
      },
      {
        label: t("dashboard.kpiPendingOrders"),
        value: hydrated ? ordersLabel : "—",
        sub: t("dashboard.kpiPendingOrdersSub"),
        accent: "#38bdf8",
      },
      {
        label: t("dashboard.kpiAvgMargin"),
        value: marginMain,
        sub: t("dashboard.kpiAvgMarginSub"),
        accent: avgMarginPct != null && !escandalloError ? "#2dd4bf" : "#94a3b8",
      },
    ],
    [
      t,
      hydrated,
      productsLabel,
      mermaCost30d,
      locale,
      ordersLabel,
      marginMain,
      avgMarginPct,
      escandalloError,
    ],
  );

  const metricNum: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum" 1',
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    lineHeight: 1.1,
  };

  const activityLineMuted: CSSProperties = {
    display: "block",
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 1.3,
  };

  return (
    <ModulePageShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      maxWidth={1280}
      compactLayout
      lockViewport
      hideBackLink
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            gap: 6,
          }}
        >
          {kpiCards.map((k) => (
            <div
              key={k.label}
              style={{
                background: "#1e293b",
                borderRadius: 10,
                padding: "8px 10px",
                border: "1px solid #334155",
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                borderTop: `2px solid ${k.accent}`,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                {k.label}
              </span>
              <div style={{ margin: "4px 0 0", ...metricNum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(k.value)}>
                {k.value}
              </div>
              <div
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color: "#94a3b8",
                  lineHeight: 1.3,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ ...controlPanelStyle, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <h2 style={sectionTitleStyle}>{t("dashboard.sectionActivity")}</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <li style={{ paddingBottom: 8, borderBottom: "1px solid #334155" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t("dashboard.activityLastMerma")}
                </div>
                {lastMerma && hydrated ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35, marginTop: 4 }}>
                    {lastMerma.producto_stock_nombre}
                    <span style={activityLineMuted}>
                      {formatIsoDate(lastMerma.fecha, locale)} · {formatMotivoMerma(lastMerma.motivo)}
                    </span>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
              <li style={{ paddingBottom: 8, borderBottom: "1px solid #334155" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t("dashboard.activityLastOrder")}
                </div>
                {lastCompra && hydrated ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35, marginTop: 4 }}>
                    {lastCompra.proveedor}
                    <span style={activityLineMuted}>
                      {formatIsoDate(lastCompra.fecha, locale)} · {compraEstadoLabel(lastCompra.estado, t)}
                    </span>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
              <li>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t("dashboard.activityLastRelevant")}
                </div>
                {lastPriceRow && hydrated && !escandalloError ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35, marginTop: 4 }}>
                    {lastPriceRow.nombre_plato ?? "—"} · {formatEuro(lastPriceRow.precio_venta ?? 0, locale)}
                    <span style={activityLineMuted}>{t("dashboard.activityRelevantHint")}</span>
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
            </ul>
          </div>

          <div style={{ ...controlPanelStyle, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <h2 style={sectionTitleStyle}>{t("dashboard.sectionAlerts")}</h2>
            {alerts.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{t("dashboard.alertNone")}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {alerts.map((a) => {
                  const border =
                    a.tone === "amber"
                      ? "rgba(251, 191, 36, 0.4)"
                      : a.tone === "rose"
                        ? "rgba(251, 113, 133, 0.45)"
                        : a.tone === "orange"
                          ? "rgba(251, 146, 60, 0.45)"
                          : "rgba(56, 189, 248, 0.4)";
                  const bg =
                    a.tone === "amber"
                      ? "rgba(251, 191, 36, 0.07)"
                      : a.tone === "rose"
                        ? "rgba(251, 113, 113, 0.09)"
                        : a.tone === "orange"
                          ? "rgba(251, 146, 60, 0.08)"
                          : "rgba(56, 189, 248, 0.07)";
                  return (
                    <li
                      key={a.key}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: `1px solid ${border}`,
                        backgroundColor: bg,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, color: "#f1f5f9" }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.35 }}>{a.body}</div>
                      {a.key === "stock" && lowStockProducts.length > 0 ? (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", lineHeight: 1.35 }}>
                          {lowStockProducts
                            .slice(0, 4)
                            .map((p) => p.nombre)
                            .join(" · ")}
                          {lowStockProducts.length > 4 ? "…" : ""}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 6 }}>{t("dashboard.sectionQuickAccess")}</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))",
              gap: 6,
            }}
          >
            {MODULE_ENTRIES.map((mod) => {
              const hovered = hoverModule === mod.path;
              const Icon = mod.Icon;
              return (
                <button
                  key={mod.path}
                  type="button"
                  onClick={() => router.push(mod.path)}
                  onMouseEnter={() => setHoverModule(mod.path)}
                  onMouseLeave={() => setHoverModule(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: 10,
                    padding: "8px 10px",
                    border: hovered ? "1px solid rgba(96, 165, 250, 0.45)" : "1px solid #334155",
                    background: hovered ? "rgba(30, 41, 59, 0.95)" : "#0f172a",
                    color: "#f8fafc",
                    transition: "border-color 0.15s ease, background 0.15s ease",
                  }}
                >
                  <span style={{ color: hovered ? "#93c5fd" : "#64748b", flexShrink: 0, display: "flex" }}>
                    <Icon size={20} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{t(mod.titleKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ModulePageShell>
  );
}
