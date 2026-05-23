"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth/auth-context";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyKpiCard, HostlySectionHeader, HostlySurface } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { updateRestaurantName } from "@/lib/firestore/restaurants";
import { loadCompras, type CompraEstado, type CompraLocal } from "@/lib/compras-local";
import { loadMermas, type MermaLocal } from "@/lib/mermas-local";
import { fetchEscandalloMergedRowsForBrowser } from "@/lib/platos-escandallo-bridge";
import { STOCK_CHANGED_EVENT, isStockBajo, loadStock, type StockProducto } from "@/lib/stock-local";
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

function IconChart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16V11M12 16V8M16 16V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconBox({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7l8-4 8 4-8 4-8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4 7v10l8 4 8-4V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconOperacion({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 4h14a1 1 0 0 1 1 1v3a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0V5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconSettings({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9c.2.48.62.83 1.15.9H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const MODULE_ENTRIES = [
  { path: "/dashboard/operacion", label: "Operación", Icon: IconOperacion },
  { path: "/dashboard/configuracion", label: "Configuración", Icon: IconSettings },
  { path: "/dashboard/inventario", label: "Inventario", Icon: IconBox },
  { path: "/dashboard/analisis", label: "Análisis", Icon: IconChart },
  { path: "/dashboard/analisis/ventas", label: "Ventas", Icon: IconChart },
] as const;

function isDashboardModuleVisible(
  path: string,
  can: (capability: HostlyCapability) => boolean,
): boolean {
  switch (path) {
    case "/dashboard/operacion":
      return can("tpv.sell") || can("kds.manage");
    case "/dashboard/configuracion":
      return can("settings.manage");
    case "/dashboard/inventario":
      return can("inventory.view");
    case "/dashboard/analisis":
    case "/dashboard/analisis/ventas":
      return can("analytics.view");
    default:
      return true;
  }
}

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

const sectionTitleClass = "hostly-section-label";

export default function DashboardPage() {
  const [mobileScroll, setMobileScroll] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileScroll(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const { t, locale } = useI18n();
  const router = useRouter();
  const { restaurantId, restaurantName, role, refreshProfile } = useAuth();
  const { can } = useHostlyCapabilities();
  const [restaurantNameInput, setRestaurantNameInput] = useState("");
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
    setRestaurantNameInput(restaurantName?.trim() ?? "");
  }, [restaurantName]);

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

  const activityLineMuted: CSSProperties = {
    display: "block",
    fontSize: 10,
    color: "var(--hostly-ink-soft)",
    marginTop: 2,
    lineHeight: 1.3,
  };

  const ownerBlock =
    role === "owner" && restaurantId && isFirebaseConfigured ? (
      <HostlySurface variant="ice" className="flex shrink-0 flex-col p-4 box-border">
        <div className={`${sectionTitleClass} mb-2.5`}>Nombre del restaurante</div>
        <input
          type="text"
          value={restaurantNameInput}
          onChange={(e) => setRestaurantNameInput(e.target.value)}
          className="hostly-input mb-2.5 max-w-[360px]"
        />
        <button
          type="button"
          className="hostly-button-secondary w-fit"
          onClick={() => {
            void (async () => {
              if (!restaurantId) return;
              await updateRestaurantName(restaurantId, restaurantNameInput);
              await refreshProfile();
            })();
          }}
        >
          Guardar
        </button>
      </HostlySurface>
    ) : null;

  const visibleModuleEntries = useMemo(
    () => MODULE_ENTRIES.filter((mod) => isDashboardModuleVisible(mod.path, can)),
    [can],
  );

  const moduleEntriesOperacion = visibleModuleEntries.slice(0, 1);
  const moduleEntriesRest = visibleModuleEntries.slice(1);

  const renderModuleGrid = (modules: readonly (typeof MODULE_ENTRIES)[number][]) => (
    <div style={{ flexShrink: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: 12,
        }}
      >
        {modules.map((mod) => {
          const hovered = hoverModule === mod.path;
          const Icon = mod.Icon;
          return (
            <button
              key={mod.path}
              type="button"
              onClick={() => router.push(mod.path)}
              onMouseEnter={() => setHoverModule(mod.path)}
              onMouseLeave={() => setHoverModule(null)}
              className="flex min-h-[76px] cursor-pointer items-center gap-3.5 rounded-[14px] border px-5 py-[18px] text-left transition-[border-color,background] duration-150 ease-out sm:gap-3.5"
              style={{
                borderColor: hovered ? "var(--hostly-line-strong)" : "var(--hostly-line)",
                background: hovered ? "#ffffff" : "var(--hostly-ice-50)",
                color: "var(--hostly-ink)",
              }}
            >
              <span
                style={{
                  color: hovered ? "var(--hostly-accent)" : "var(--hostly-ink-soft)",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: hovered ? "var(--hostly-accent-soft)" : "var(--hostly-ice-100)",
                }}
              >
                <Icon size={22} />
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                  color: "var(--hostly-navy-deep)",
                }}
              >
                {mod.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <ModulePageShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      maxWidth={1280}
      compactLayout
      lockViewport={!mobileScroll}
      hideBackLink
      shellSurface="configLight"
    >
        <div
          className={
            mobileScroll
              ? "hostly-stack-md min-h-[min(100%,100dvh)] overflow-y-auto pb-24"
              : "hostly-stack-md flex min-h-0 flex-1 flex-col overflow-hidden"
          }
          style={mobileScroll ? { WebkitOverflowScrolling: "touch" } : undefined}
        >
        {!mobileScroll && ownerBlock}
        {mobileScroll ? renderModuleGrid(moduleEntriesOperacion) : null}

        <HostlySurface
          variant="elevated"
          className="box-border flex shrink-0 flex-col gap-5 overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--hostly-table-divider-soft)_75%,transparent)] p-4 shadow-[var(--hostly-shadow-card)] sm:flex-row sm:items-stretch sm:justify-between sm:gap-6 sm:p-5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="min-w-0">
              <h2 className="hostly-heading mb-1.5 leading-tight">{t("dashboard.onboardingPromoTitle")}</h2>
              <p className="m-0 text-[15px] font-medium leading-snug text-[color:var(--hostly-ink-muted)]">{t("dashboard.onboardingPromoBody")}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:grid sm:max-w-xl sm:grid-cols-2 sm:gap-x-8 sm:gap-y-2">
              {[t("onboarding.chkNegocio"), t("onboarding.chkCarta"), t("onboarding.chkInventario"), t("onboarding.chkEscandallo")].map((label) => (
                <li key={label} className="flex items-start gap-2.5 text-xs font-semibold leading-snug text-[color:var(--hostly-ink-soft)]">
                  <span className="mt-[0.3em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--hostly-accent)]" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col justify-center gap-2 border-t border-[var(--hostly-table-divider-faint)] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <button
              type="button"
              onClick={() => router.push("/dashboard/onboarding")}
              className="hostly-button-primary w-full whitespace-nowrap sm:w-auto sm:min-w-[200px]"
            >
              {t("dashboard.onboardingPromoCta")}
            </button>
            <p className="m-0 text-center text-[11px] font-medium leading-snug text-[color:var(--hostly-ink-faint)] sm:text-left">{t("onboarding.sideHint")}</p>
          </div>
        </HostlySurface>

        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
            gap: 12,
          }}
        >
          {kpiCards.map((k) => (
            <HostlyKpiCard
              key={k.label}
              title={k.label}
              value={k.value}
              helper={k.sub}
              accentColor={k.accent}
              valueTitle={String(k.value)}
            />
          ))}
        </div>

        {mobileScroll && ownerBlock}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 12,
            overflow: "hidden",
          }}
        >
          <HostlySurface
            variant="ice"
            className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-4 box-border"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <HostlySectionHeader title={t("dashboard.sectionActivity")} titleVariant="section" />
            <ul className="hostly-stack-md m-0 list-none p-0">
              <li className="border-b border-[var(--hostly-line)] pb-2.5">
                <div className="hostly-kpi-label">{t("dashboard.activityLastMerma")}</div>
                {lastMerma && hydrated ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hostly-ink-strong)", lineHeight: 1.35, marginTop: 4 }}>
                    {lastMerma.producto_stock_nombre}
                    <span style={activityLineMuted}>
                      {formatIsoDate(lastMerma.fecha, locale)} · {formatMotivoMerma(lastMerma.motivo)}
                    </span>
                  </div>
                ) : (
                  <div style={{ color: "var(--hostly-ink-soft)", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
              <li className="border-b border-[var(--hostly-line)] pb-2.5">
                <div className="hostly-kpi-label">{t("dashboard.activityLastOrder")}</div>
                {lastCompra && hydrated ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hostly-ink-strong)", lineHeight: 1.35, marginTop: 4 }}>
                    {lastCompra.proveedor}
                    <span style={activityLineMuted}>
                      {formatIsoDate(lastCompra.fecha, locale)} · {compraEstadoLabel(lastCompra.estado, t)}
                    </span>
                  </div>
                ) : (
                  <div style={{ color: "var(--hostly-ink-soft)", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
              <li>
                <div className="hostly-kpi-label">{t("dashboard.activityLastRelevant")}</div>
                {lastPriceRow && hydrated && !escandalloError ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hostly-ink-strong)", lineHeight: 1.35, marginTop: 4 }}>
                    {lastPriceRow.nombre_plato ?? "—"} · {formatEuro(lastPriceRow.precio_venta ?? 0, locale)}
                    <span style={activityLineMuted}>{t("dashboard.activityRelevantHint")}</span>
                  </div>
                ) : (
                  <div style={{ color: "var(--hostly-ink-soft)", fontSize: 12, marginTop: 4 }}>{t("dashboard.activityEmpty")}</div>
                )}
              </li>
            </ul>
          </HostlySurface>

          <HostlySurface
            variant="ice"
            className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-4 box-border"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <HostlySectionHeader title={t("dashboard.sectionAlerts")} titleVariant="section" />
            {alerts.length === 0 ? (
              <p className="hostly-muted text-xs leading-snug">{t("dashboard.alertNone")}</p>
            ) : (
              <ul className="hostly-stack-md m-0 list-none p-0">
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
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1px solid ${border}`,
                        backgroundColor: bg,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "var(--hostly-ink-strong)" }}>{a.title}</div>
                      <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)", lineHeight: 1.35 }}>{a.body}</div>
                      {a.key === "stock" && lowStockProducts.length > 0 ? (
                        <div style={{ marginTop: 4, fontSize: 10, color: "var(--hostly-ink-soft)", lineHeight: 1.35 }}>
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
          </HostlySurface>
        </div>

        {renderModuleGrid(mobileScroll ? moduleEntriesRest : visibleModuleEntries)}
      </div>
    </ModulePageShell>
  );
}
