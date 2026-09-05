"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";
import { useAuth } from "@/components/auth/auth-context";
import { canAccessDashboardPath } from "@/lib/auth/hostly-capabilities";
import {
  getOperacionLauncherDiagnostic,
  isOperacionModuleSlug,
  OPERACION_LAUNCHER_BUILD_ID,
  operacionModuleHref,
  OPERACION_LAUNCHER_MODULES,
  type OperacionModuleSlug,
} from "@/lib/operacion/operacion-launcher-modules";

function LauncherIcon({ children }: { children: ReactNode }) {
  return <span className="hostly-op-launcher-icon">{children}</span>;
}

function IconTpv() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 8h8M8 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}
function IconCaja() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 8h14v11H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7 5h10l1 3H6l1-3zM8 12h3M16 13.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></LauncherIcon>;
}
function IconCocina() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M8 3v8a4 4 0 1 0 8 0V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M6 21h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}
function IconBarra() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M8 4h8l-1 14H9L8 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}
function IconCocteleria() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M8 4h8l-4 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /><path d="M6 20h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}
function IconSala() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 10h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></LauncherIcon>;
}
function IconReservas() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 4v2M17 4v2M5 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></LauncherIcon>;
}
function IconSommelier() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M8 4h8c0 4-1.5 7-4 8-2.5-1-4-4-4-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 12v6M8 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M18.5 5.5l.45 1.05 1.05.45-1.05.45-.45 1.05-.45-1.05L17 7l1.05-.45.45-1.05z" fill="currentColor" /></svg></LauncherIcon>;
}
function IconActivity() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6h12v12H6V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 10h6M9 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}
function IconSesiones() {
  return <LauncherIcon><svg viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></LauncherIcon>;
}

const MODULE_ICONS: Record<OperacionModuleSlug, () => ReactNode> = {
  tpv: IconTpv,
  caja: IconCaja,
  cocina: IconCocina,
  barra: IconBarra,
  cocteleria: IconCocteleria,
  sala: IconSala,
  reservas: IconReservas,
  sommelier: IconSommelier,
  centro: IconActivity,
  activity: IconActivity,
  sesiones: IconSesiones,
};

export default function OperacionMenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const legacyTab = searchParams.get("tab");
  const shouldRedirect = isOperacionModuleSlug(legacyTab);
  const accessibleModules = useMemo(
    () => OPERACION_LAUNCHER_MODULES.filter((module) => canAccessDashboardPath(role, operacionModuleHref(module.slug))),
    [role],
  );

  useEffect(() => {
    if (!shouldRedirect || !legacyTab) return;
    const destination = operacionModuleHref(legacyTab);
    if (!canAccessDashboardPath(role, destination)) {
      router.replace("/dashboard/operacion");
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("tab");
    const qs = next.toString();
    router.replace(`${destination}${qs ? `?${qs}` : ""}`);
  }, [shouldRedirect, legacyTab, searchParams, router, role]);

  useEffect(() => {
    console.log(
      "[operation-launcher] render",
      accessibleModules.map((module) => ({ slug: module.slug, label: module.label, href: operacionModuleHref(module.slug) })),
    );
    console.log("[operation-launcher] diagnostic", {
      ...getOperacionLauncherDiagnostic(),
      visibleModuleCount: accessibleModules.length,
    });
  }, [accessibleModules]);

  if (shouldRedirect) return null;

  return (
    <ModulePageShell title="Operación" subtitle="Flujo diario del servicio" maxWidth={1280} compactLayout operationalFocus shellSurface="configLight">
      <nav aria-label="Módulos de operación" className="hostly-op-launcher-grid" data-launcher-build={OPERACION_LAUNCHER_BUILD_ID} data-launcher-count={accessibleModules.length}>
        {accessibleModules.map((module) => {
          const Icon = MODULE_ICONS[module.slug];
          return (
            <Link key={module.slug} href={operacionModuleHref(module.slug)} className="hostly-op-launcher-card">
              <Icon />
              <span className="hostly-op-launcher-text"><span className="hostly-op-launcher-title">{module.label}</span><span className="hostly-op-launcher-subtitle">{module.subtitle}</span></span>
            </Link>
          );
        })}
      </nav>
    </ModulePageShell>
  );
}
