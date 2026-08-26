"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyBrandMark } from "@/components/brand/hostly-brand";
import { DEFAULT_RESTAURANT_NAME } from "@/lib/firestore/user-restaurant-profile";

function LauncherIcon({ children }: { children: ReactNode }) {
  return <span className="hostly-op-launcher-icon">{children}</span>;
}

function StationIcon({ kind }: { kind: "tpv" | "kitchen" | "bar" | "cocktail" | "reservations" }) {
  const paths: Record<typeof kind, ReactNode> = {
    tpv: <><path d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 8h8M8 12h5"/></>,
    kitchen: <><path d="M8 3v8a4 4 0 1 0 8 0V3"/><path d="M6 21h12"/></>,
    bar: <><path d="M8 4h8l-1 14H9L8 4z"/><path d="M7 8h10"/></>,
    cocktail: <><path d="M7 4h10l-2.5 7.5a2.6 2.6 0 0 1-5 0L7 4z"/><path d="M12 14v6M9 20h6M9 7h6"/></>,
    reservations: <><path d="M7 4v2M17 4v2M5 8h14"/><path d="M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></>,
  };
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</g></svg></LauncherIcon>;
}

function SmallIcon({ kind, size = 22 }: { kind: "products" | "settings" | "analytics"; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {kind === "products" ? <><path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></> : kind === "settings" ? <><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></> : <><path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>}
  </svg>;
}

type Action = { href: string; label: string; kind: "tpv" | "kitchen" | "bar" | "cocktail" | "reservations"; visible: (can: (c: HostlyCapability) => boolean) => boolean };
const PRIMARY: Action[] = [{ href: "/dashboard/operacion/tpv", label: "TPV", kind: "tpv", visible: (can) => can("tpv.sell") }];
const OPERATION: Action[] = [
  { href: "/dashboard/operacion/cocina", label: "Cocina", kind: "kitchen", visible: (can) => can("kds.manage") },
  { href: "/dashboard/operacion/barra", label: "Barra", kind: "bar", visible: (can) => can("kds.manage") || can("tpv.sell") },
  { href: "/dashboard/operacion/cocteleria", label: "Coctelería", kind: "cocktail", visible: (can) => can("kds.manage") || can("tpv.sell") },
  { href: "/dashboard/operacion/reservas", label: "Reservas", kind: "reservations", visible: (can) => can("tpv.sell") },
];
const SUBTITLES: Record<string, string> = { Cocina: "Pedidos en preparación", Barra: "Bebidas y cafés", Coctelería: "Cócteles y combinados", Reservas: "Llegadas de hoy" };
const MANAGEMENT = [
  { path: "/dashboard/configuracion/carta/productos", label: "Productos", kind: "products" as const, capability: "settings.manage" as HostlyCapability },
  { path: "/dashboard/configuracion", label: "Configuración", kind: "settings" as const, capability: "settings.manage" as HostlyCapability },
  { path: "/dashboard/analisis", label: "Análisis", kind: "analytics" as const, capability: "analytics.view" as HostlyCapability },
];

export default function DashboardPage() {
  const router = useRouter();
  const { restaurantName } = useAuth();
  const { can } = useHostlyCapabilities();
  const primary = useMemo(() => PRIMARY.filter((x) => x.visible(can)), [can]);
  const operation = useMemo(() => OPERATION.filter((x) => x.visible(can)), [can]);
  const management = useMemo(() => MANAGEMENT.filter((x) => can(x.capability)), [can]);
  const title = restaurantName?.trim() || DEFAULT_RESTAURANT_NAME;

  return <ModulePageShell title={null} maxWidth={1280} compactLayout operationalFocus lockViewport hideBackLink shellSurface="configLight">
    <div className="hostly-dashboard-premium-shell"><div className="hostly-dashboard-command-center">
      <header className="hostly-dashboard-command-header"><div className="hostly-dashboard-command-brand"><HostlyBrandMark className="hostly-dashboard-brand-mark" size={34} tone="app"/><div className="min-w-0"><p className="hostly-dashboard-command-eyebrow">{title}</p><h1 className="hostly-dashboard-command-title">Centro de operaciones</h1><p className="hostly-dashboard-command-subtitle">Listo para operar</p></div></div></header>
      <section className="hostly-dashboard-command-main" aria-label="Acciones operativas">
        {primary.length > 0 && <nav aria-label="Acción principal" className="hostly-dashboard-command-hero-wrap">{primary.map((a) => <Link key={a.href} href={a.href} className="hostly-dashboard-command-hero"><span className="hostly-dashboard-command-hero__icon"><StationIcon kind={a.kind}/></span><span className="hostly-dashboard-command-hero__copy"><span className="hostly-dashboard-command-hero__label">Abrir TPV</span><span className="hostly-dashboard-command-hero__sub">Mesas, pedidos y cobro</span></span></Link>)}</nav>}
        {operation.length > 0 && <section aria-label="Operación" className="hostly-dashboard-command-operation"><h2 className="hostly-dashboard-command-section-title">Operación</h2><nav className="hostly-dashboard-command-stations">{operation.map((a) => <Link key={a.href} href={a.href} className="hostly-dashboard-command-station" data-visual={a.kind}><span className="hostly-dashboard-command-station__icon"><StationIcon kind={a.kind}/></span><span className="hostly-dashboard-command-station__copy"><span className="hostly-dashboard-command-station__label">{a.label}</span><span className="hostly-dashboard-command-station__sub">{SUBTITLES[a.label]}</span></span></Link>)}</nav></section>}
      </section>
      {management.length > 0 && <section aria-label="Gestión" className="hostly-dashboard-command-management"><h2 className="hostly-dashboard-command-section-title">Gestión</h2><div className="hostly-dashboard-command-dock">{management.map((m) => <button key={m.path} type="button" onClick={() => router.push(m.path)} className="hostly-dashboard-command-dock-item" data-visual={m.kind}><span className="hostly-dashboard-command-dock-item__icon"><SmallIcon kind={m.kind} size={17}/></span><span className="hostly-dashboard-command-dock-item__label">{m.label}</span></button>)}</div></section>}
    </div></div>
  </ModulePageShell>;
}
