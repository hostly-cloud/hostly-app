"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { OperationalDelayAlertsPanel } from "@/components/dashboard/operational-delay-alerts-panel";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyBrandMark } from "@/components/brand/hostly-brand";
import {
  DashboardModuleArtwork,
  type DashboardArtworkKind,
} from "@/components/dashboard/dashboard-module-artwork";
import { DEFAULT_RESTAURANT_NAME } from "@/lib/firestore/user-restaurant-profile";
import { DASHBOARD_COPY } from "@/locales/dashboard-copy";

function LauncherIcon({ children }: { children: ReactNode }) {
  return <span className="hostly-op-launcher-icon">{children}</span>;
}

function StationIcon({
  kind,
}: {
  kind: "tpv" | "kitchen" | "bar" | "cocktail" | "reservations";
}) {
  const paths: Record<typeof kind, ReactNode> = {
    tpv: (
      <>
        <path d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M8 8h8M8 12h5" />
      </>
    ),
    kitchen: (
      <>
        <path d="M8 3v8a4 4 0 1 0 8 0V3" />
        <path d="M6 21h12" />
      </>
    ),
    bar: (
      <>
        <path d="M8 4h8l-1 14H9L8 4z" />
        <path d="M7 8h10" />
      </>
    ),
    cocktail: (
      <>
        <path d="M7 4h10l-2.5 7.5a2.6 2.6 0 0 1-5 0L7 4z" />
        <path d="M12 14v6M9 20h6M9 7h6" />
      </>
    ),
    reservations: (
      <>
        <path d="M7 4v2M17 4v2M5 8h14" />
        <path d="M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
      </>
    ),
  };
  return (
    <LauncherIcon>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <g
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {paths[kind]}
        </g>
      </svg>
    </LauncherIcon>
  );
}

function SmallIcon({
  kind,
  size = 22,
}: {
  kind: "products" | "settings" | "analytics";
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "products" ? (
        <>
          <path d="M4 7l8-4 8 4-8 4-8-4z" />
          <path d="M4 7v10l8 4 8-4V7M12 11v10" />
        </>
      ) : kind === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </>
      ) : (
        <>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 16v-5M12 16V8M16 16v-3" />
        </>
      )}
    </svg>
  );
}

type OperationKey = "kitchen" | "bar" | "cocktail" | "reservations";
type ManagementKey = "products" | "settings" | "analytics";

type Action = {
  href: string;
  kind: "tpv" | OperationKey;
  copyKey?: OperationKey;
  visible: (can: (c: HostlyCapability) => boolean) => boolean;
};

const PRIMARY: Action[] = [
  {
    href: "/dashboard/operacion/tpv",
    kind: "tpv",
    visible: (can) => can("tpv.sell"),
  },
];

const OPERATION: Action[] = [
  {
    href: "/dashboard/operacion/cocina",
    kind: "kitchen",
    copyKey: "kitchen",
    visible: (can) => can("kds.manage"),
  },
  {
    href: "/dashboard/operacion/barra",
    kind: "bar",
    copyKey: "bar",
    visible: (can) => can("kds.manage"),
  },
  {
    href: "/dashboard/operacion/cocteleria",
    kind: "cocktail",
    copyKey: "cocktail",
    visible: (can) => can("kds.manage"),
  },
  {
    href: "/dashboard/operacion/reservas",
    kind: "reservations",
    copyKey: "reservations",
    visible: (can) => can("reservations.manage"),
  },
];

const MANAGEMENT = [
  {
    path: "/dashboard/configuracion/carta/productos",
    copyKey: "products" as ManagementKey,
    kind: "products" as const,
    capability: "catalog.manage" as HostlyCapability,
  },
  {
    path: "/dashboard/configuracion",
    copyKey: "settings" as ManagementKey,
    kind: "settings" as const,
    capability: "settings.manage" as HostlyCapability,
  },
  {
    path: "/dashboard/analisis",
    copyKey: "analytics" as ManagementKey,
    kind: "analytics" as const,
    capability: "analytics.view" as HostlyCapability,
  },
];

export default function DashboardPage() {
  const { restaurantName } = useAuth();
  const { locale } = useI18n();
  const { can } = useHostlyCapabilities();
  const copy = DASHBOARD_COPY[locale];
  const primary = useMemo(() => PRIMARY.filter((x) => x.visible(can)), [can]);
  const operation = useMemo(
    () => OPERATION.filter((x) => x.visible(can)),
    [can],
  );
  const management = useMemo(
    () => MANAGEMENT.filter((x) => can(x.capability)),
    [can],
  );
  const title = restaurantName?.trim() || DEFAULT_RESTAURANT_NAME;
  const canSeeOperationalAlerts = can("kds.manage") || can("tpv.sell");

  const getOperationCopy = (key: OperationKey) => {
    switch (key) {
      case "kitchen":
        return { label: copy.kitchen, subtitle: copy.kitchenSubtitle };
      case "bar":
        return { label: copy.bar, subtitle: copy.barSubtitle };
      case "cocktail":
        return { label: copy.cocktail, subtitle: copy.cocktailSubtitle };
      case "reservations":
        return { label: copy.reservations, subtitle: copy.reservationsSubtitle };
    }
  };

  const getManagementCopy = (key: ManagementKey) => {
    switch (key) {
      case "products":
        return { label: copy.products, subtitle: copy.productsSubtitle };
      case "settings":
        return { label: copy.settings, subtitle: copy.settingsSubtitle };
      case "analytics":
        return { label: copy.analytics, subtitle: copy.analyticsSubtitle };
    }
  };

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
      <div className="hostly-dashboard-premium-shell">
        <div className="hostly-dashboard-command-center">
          <header className="hostly-dashboard-command-header">
            <div className="hostly-dashboard-command-brand">
              <HostlyBrandMark
                className="hostly-dashboard-brand-mark"
                size={30}
                tone="app"
              />
              <div className="min-w-0">
                <p className="hostly-dashboard-command-eyebrow">{title}</p>
                <h1 className="hostly-dashboard-command-title">
                  {copy.readyForService}
                </h1>
              </div>
            </div>
          </header>
          {canSeeOperationalAlerts && <OperationalDelayAlertsPanel />}
          <section
            className="hostly-dashboard-command-main"
            aria-label={copy.operationalActions}
          >
            {primary.length > 0 && (
              <nav
                aria-label={copy.primaryAction}
                className="hostly-dashboard-command-hero-wrap"
              >
                {primary.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="hostly-dashboard-command-hero"
                  >
                    <span className="hostly-dashboard-command-hero__art">
                      <DashboardModuleArtwork kind="tpv" />
                    </span>
                    <span className="hostly-dashboard-command-hero__icon">
                      <StationIcon kind={a.kind} />
                    </span>
                    <span className="hostly-dashboard-command-hero__copy">
                      <span className="hostly-dashboard-command-hero__label">
                        {copy.openTpv}
                      </span>
                      <span className="hostly-dashboard-command-hero__sub">
                        {copy.tpvSubtitle}
                      </span>
                    </span>
                  </Link>
                ))}
              </nav>
            )}
            {operation.length > 0 && (
              <section
                aria-label={copy.operation}
                className="hostly-dashboard-command-operation"
              >
                <h2 className="hostly-dashboard-command-section-title">
                  {copy.operation}
                </h2>
                <nav className="hostly-dashboard-command-stations">
                  {operation.map((a) => {
                    const itemCopy = getOperationCopy(a.copyKey ?? "kitchen");
                    return (
                      <Link
                        key={a.href}
                        href={a.href}
                        className="hostly-dashboard-command-station"
                        data-visual={a.kind}
                      >
                        <span className="hostly-dashboard-command-station__art">
                          <DashboardModuleArtwork
                            kind={a.kind as DashboardArtworkKind}
                          />
                        </span>
                        <span className="hostly-dashboard-command-station__icon">
                          <StationIcon kind={a.kind} />
                        </span>
                        <span className="hostly-dashboard-command-station__copy">
                          <span className="hostly-dashboard-command-station__label">
                            {itemCopy.label}
                          </span>
                          <span className="hostly-dashboard-command-station__sub">
                            {itemCopy.subtitle}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </section>
            )}
          </section>
          {management.length > 0 && (
            <section
              aria-label={copy.management}
              className="hostly-dashboard-command-management"
            >
              <h2 className="hostly-dashboard-command-section-title">
                {copy.management}
              </h2>
              <div className="hostly-dashboard-command-dock">
                {management.map((m) => {
                  const itemCopy = getManagementCopy(m.copyKey);
                  return (
                    <Link
                      key={m.path}
                      href={m.path}
                      className="hostly-dashboard-command-dock-item"
                      data-visual={m.kind}
                    >
                      <span className="hostly-dashboard-command-dock-item__art">
                        <DashboardModuleArtwork kind={m.kind} />
                      </span>
                      <span className="hostly-dashboard-command-dock-item__icon">
                        <SmallIcon kind={m.kind} size={18} />
                      </span>
                      <span className="hostly-dashboard-command-dock-item__copy">
                        <span className="hostly-dashboard-command-dock-item__label">
                          {itemCopy.label}
                        </span>
                        <span className="hostly-dashboard-command-dock-item__sub">
                          {itemCopy.subtitle}
                        </span>
                      </span>
                      <span
                        className="hostly-dashboard-command-dock-item__arrow"
                        aria-hidden
                      >
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </ModulePageShell>
  );
}
