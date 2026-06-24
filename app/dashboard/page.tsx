"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth/auth-context";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";
import ModulePageShell from "@/components/module-page-shell";
import { RestaurantLogoMark } from "@/components/restaurant/restaurant-logo-mark";
import { HostlyKpiCard, HostlySectionHeader, HostlySurface } from "@/components/ui/hostly";
import { DEFAULT_RESTAURANT_NAME } from "@/lib/firestore/user-restaurant-profile";
import { getRestaurantById } from "@/lib/firestore/restaurants";
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

function LauncherIcon({ children }: { children: ReactNode }) {
  return <span className="hostly-op-launcher-icon">{children}</span>;
}

function IconTpv() {
  return (
    <LauncherIcon>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 8h8M8 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </LauncherIcon>
  );
}

function IconCocina() {
  return (
    <LauncherIcon>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 3v8a4 4 0 1 0 8 0V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 21h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </LauncherIcon>
  );
}

function IconBarra() {
  return (
    <LauncherIcon>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 4h8l-1 14H9L8 4z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M7 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </LauncherIcon>
  );
}

function IconReservas() {
  return (
    <LauncherIcon>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 4v2M17 4v2M5 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </LauncherIcon>
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

function IconEscandallos({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 18h16M6 14l3-8 3 5 2-3 4 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PrimaryAction = {
  href: string;
  label: string;
  Icon: () => ReactNode;
  visible: (can: (capability: HostlyCapability) => boolean) => boolean;
};

const PRIMARY_ACTIONS: PrimaryAction[] = [
  {
    href: "/dashboard/operacion/tpv",
    label: "TPV",
    Icon: IconTpv,
    visible: (can) => can("tpv.sell"),
  },
  {
    href: "/dashboard/operacion/cocina",
    label: "Cocina",
    Icon: IconCocina,
    visible: (can) => can("kds.manage"),
  },
  {
    href: "/dashboard/operacion/barra",
    label: "Barra",
    Icon: IconBarra,
    visible: (can) => can("kds.manage") || can("tpv.sell"),
  },
  {
    href: "/dashboard/operacion/reservas",
    label: "Reservas",
    Icon: IconReservas,
    visible: (can) => can("tpv.sell"),
  },
];

type SecondaryModule = {
  path: string;
  label: string;
  Icon: ({ size }: { size?: number }) => ReactNode;
};

const SECONDARY_MODULES: SecondaryModule[] = [
  { path: "/dashboard/inventario", label: "Inventario", Icon: IconBox },
  { path: "/dashboard/compras", label: "Compras", Icon: IconBox },
  { path: "/dashboard/configuracion/carta/escandallos", label: "Escandallos", Icon: IconEscandallos },
  { path: "/dashboard/analisis/ventas", label: "Ventas", Icon: IconChart },
  { path: "/dashboard/analisis", label: "Análisis", Icon: IconChart },
  { path: "/dashboard/configuracion", label: "Configuración", Icon: IconSettings },
  { path: "/dashboard/operacion", label: "Operación", Icon: IconOperacion },
];

function isSecondaryModuleVisible(
  path: string,
  can: (capability: HostlyCapability) => boolean,
): boolean {
  switch (path) {
    case "/dashboard/operacion":
      return can("tpv.sell") || can("kds.manage");
    case "/dashboard/configuracion":
    case "/dashboard/configuracion/carta/escandallos":
      return can("settings.manage");
    case "/dashboard/inventario":
      return can("inventory.view");
    case "/dashboard/analisis":
    case "/dashboard/analisis/ventas":
      return can("analytics.view");
    case "/dashboard/compras":
      return can("purchases.view");
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
  const { t, locale } = useI18n();
  const router = useRouter();
  const { restaurantId, restaurantName, profileReady } = useAuth();
  const { can } = useHostlyCapabilities();
  const [hydrated, setHydrated] = useState(false);
  const [stock, setStock] = useState<StockProducto[]>([]);
  const [compras, setCompras] = useState<CompraLocal[]>([]);
  const [mermas, setMermas] = useState<MermaLocal[]>([]);
  const [escandallos, setEscandallos] = useState<EscandalloRow[]>([]);
  const [escandalloError, setEscandalloError] = useState<string | null>(null);
  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    setStock(loadStock());
    setCompras(loadCompras());
    setMermas(loadMermas());
  }, []);

  const loadEscandallos = useCallback(async () => {
    if (!profileReady || !restaurantId?.trim()) {
      setEscandallos([]);
      setEscandalloError(null);
      return;
    }

    setEscandalloError(null);
    const { rows, error } = await fetchEscandalloMergedRowsForBrowser({
      profileRestaurantId: restaurantId,
    });

    const merged = mergeEscandalloOverrides(rows as EscandalloRow[]);
    setEscandallos(merged);
    setEscandalloError(merged.length === 0 && error ? error : null);
  }, [profileReady, restaurantId]);

  useEffect(() => {
    setHydrated(true);
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    void loadEscandallos();
  }, [loadEscandallos]);

  useEffect(() => {
    if (!profileReady || !restaurantId?.trim()) {
      setRestaurantLogoUrl(null);
      return;
    }
    let cancelled = false;
    void getRestaurantById(restaurantId).then((doc) => {
      if (cancelled) return;
      setRestaurantLogoUrl(doc?.logoUrl?.trim() || null);
    });
    return () => {
      cancelled = true;
    };
  }, [profileReady, restaurantId]);

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

  const visiblePrimaryActions = useMemo(
    () => PRIMARY_ACTIONS.filter((action) => action.visible(can)),
    [can],
  );

  const visibleSecondaryModules = useMemo(
    () => SECONDARY_MODULES.filter((mod) => isSecondaryModuleVisible(mod.path, can)),
    [can],
  );

  const homeTitleText = restaurantName?.trim() || DEFAULT_RESTAURANT_NAME;
  const homeSubtitle = "Listo para trabajar";

  return (
    <ModulePageShell
      title={null}
      maxWidth={1280}
      compactLayout
      operationalFocus
      lockViewport
      hideBackLink
      shellSurface="configLight"
    >
      <div className="hostly-dashboard-op-home">
        <HostlySurface variant="ice" className="hostly-dashboard-identity">
          <RestaurantLogoMark name={homeTitleText} logoUrl={restaurantLogoUrl} size={56} />
          <div className="hostly-dashboard-identity__text">
            <h1 className="hostly-dashboard-identity__name">{homeTitleText}</h1>
            <p className="hostly-dashboard-identity__subtitle">{homeSubtitle}</p>
          </div>
        </HostlySurface>

        {visiblePrimaryActions.length > 0 ? (
          <nav
            aria-label="Acciones principales"
            className="hostly-op-launcher-grid hostly-dashboard-op-actions hostly-dashboard-op-actions--hero"
          >
            {visiblePrimaryActions.map((action) => {
              const Icon = action.Icon;
              return (
                <Link key={action.href} href={action.href} className="hostly-op-launcher-card">
                  <Icon />
                  <span className="hostly-op-launcher-text">
                    <span className="hostly-op-launcher-title">{action.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : (
          <HostlySurface variant="soft" className="hostly-dashboard-panel">
            <p className="hostly-muted m-0 text-sm leading-snug">
              No tienes accesos operativos directos. Consulta las herramientas disponibles más abajo.
            </p>
          </HostlySurface>
        )}

        {visibleSecondaryModules.length > 0 ? (
          <section aria-label="Herramientas secundarias" className="hostly-dashboard-secondary">
            <h2 className={sectionTitleClass}>Herramientas</h2>
            <div className="hostly-dashboard-module-grid hostly-dashboard-module-grid--compact">
              {visibleSecondaryModules.map((mod) => {
                const Icon = mod.Icon;
                return (
                  <button
                    key={mod.path}
                    type="button"
                    onClick={() => router.push(mod.path)}
                    className="hostly-dashboard-module-card"
                  >
                    <span className="hostly-dashboard-module-card__icon">
                      <Icon size={16} />
                    </span>
                    <span className="hostly-dashboard-module-card__label">{mod.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <details className="hostly-dashboard-management-panel hostly-dashboard-management-panel--surface">
          <summary>Panel de gestión</summary>
          <div className="hostly-dashboard-management-panel__body hostly-dashboard-management-panel__body--compact">
            <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--dashboard hostly-kpi-grid-unified--dashboard-compact shrink-0">
              {kpiCards.map((k) => (
                <HostlyKpiCard
                  key={k.label}
                  title={k.label}
                  value={k.value}
                  helper={k.sub}
                  accentColor={k.accent}
                  valueTitle={String(k.value)}
                  variant="soft"
                />
              ))}
            </div>

            <div className="hostly-dashboard-panels-grid hostly-dashboard-panels-grid--compact shrink-0">
              <HostlySurface variant="soft" className="hostly-dashboard-panel hostly-dashboard-panel--compact">
                <HostlySectionHeader
                  title={t("dashboard.sectionAlerts")}
                  titleVariant="section"
                  className="hostly-section-header--operational"
                />
                {alerts.length === 0 ? (
                  <p className="hostly-muted m-0 text-xs leading-snug">{t("dashboard.alertNone")}</p>
                ) : (
                  <ul className="hostly-stack-sm m-0 list-none p-0">
                    {alerts.map((a) => (
                      <li key={a.key} className="hostly-dashboard-alert-item" data-tone={a.tone}>
                        <div className="hostly-dashboard-alert-title">{a.title}</div>
                        <div className="hostly-dashboard-alert-body">{a.body}</div>
                        {a.key === "stock" && lowStockProducts.length > 0 ? (
                          <div className="hostly-dashboard-alert-detail">
                            {lowStockProducts
                              .slice(0, 4)
                              .map((p) => p.nombre)
                              .join(" · ")}
                            {lowStockProducts.length > 4 ? "…" : ""}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </HostlySurface>

              <HostlySurface variant="soft" className="hostly-dashboard-panel hostly-dashboard-panel--compact">
                <HostlySectionHeader
                  title={t("dashboard.sectionActivity")}
                  titleVariant="section"
                  className="hostly-section-header--operational"
                />
                <ul className="hostly-stack-sm m-0 list-none p-0">
                  <li className="hostly-dashboard-activity-row">
                    <div className="hostly-kpi-label">{t("dashboard.activityLastMerma")}</div>
                    {lastMerma && hydrated ? (
                      <div className="hostly-dashboard-activity-value">
                        {lastMerma.producto_stock_nombre}
                        <span className="hostly-dashboard-activity-meta">
                          {formatIsoDate(lastMerma.fecha, locale)} · {formatMotivoMerma(lastMerma.motivo)}
                        </span>
                      </div>
                    ) : (
                      <div className="hostly-muted m-0 mt-1 text-xs">{t("dashboard.activityEmpty")}</div>
                    )}
                  </li>
                  <li className="hostly-dashboard-activity-row">
                    <div className="hostly-kpi-label">{t("dashboard.activityLastOrder")}</div>
                    {lastCompra && hydrated ? (
                      <div className="hostly-dashboard-activity-value">
                        {lastCompra.proveedor}
                        <span className="hostly-dashboard-activity-meta">
                          {formatIsoDate(lastCompra.fecha, locale)} · {compraEstadoLabel(lastCompra.estado, t)}
                        </span>
                      </div>
                    ) : (
                      <div className="hostly-muted m-0 mt-1 text-xs">{t("dashboard.activityEmpty")}</div>
                    )}
                  </li>
                  <li className="hostly-dashboard-activity-row">
                    <div className="hostly-kpi-label">{t("dashboard.activityLastRelevant")}</div>
                    {lastPriceRow && hydrated && !escandalloError ? (
                      <div className="hostly-dashboard-activity-value">
                        {lastPriceRow.nombre_plato ?? "—"} · {formatEuro(lastPriceRow.precio_venta ?? 0, locale)}
                        <span className="hostly-dashboard-activity-meta">{t("dashboard.activityRelevantHint")}</span>
                      </div>
                    ) : (
                      <div className="hostly-muted m-0 mt-1 text-xs">{t("dashboard.activityEmpty")}</div>
                    )}
                  </li>
                </ul>
              </HostlySurface>
            </div>

            <HostlySurface variant="soft" className="hostly-dashboard-onboarding hostly-dashboard-onboarding--compact shrink-0">
              <div className="hostly-dashboard-onboarding__copy">
                <h2 className="hostly-dashboard-onboarding__title">{t("dashboard.onboardingPromoTitle")}</h2>
                <p className="hostly-dashboard-onboarding__body">{t("dashboard.onboardingPromoBody")}</p>
              </div>
              <div className="hostly-dashboard-onboarding__actions">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/onboarding")}
                  className="hostly-button-secondary hostly-button-compact whitespace-nowrap"
                >
                  {t("dashboard.onboardingPromoCta")}
                </button>
                <p className="hostly-muted m-0 text-center text-[10px] leading-snug sm:text-left">
                  {t("onboarding.sideHint")}
                </p>
              </div>
            </HostlySurface>
          </div>
        </details>
      </div>
    </ModulePageShell>
  );
}
