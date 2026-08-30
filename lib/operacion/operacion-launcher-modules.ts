/**
 * Única fuente de verdad del launcher `/dashboard/operacion`.
 * Misma lista en desktop y móvil — sin filtros por viewport, rol ni entorno.
 */
export type OperacionModuleSlug =
  | "tpv"
  | "cocina"
  | "barra"
  | "cocteleria"
  | "sala"
  | "reservas"
  | "activity"
  | "sesiones";

export type OperacionLauncherModule = {
  slug: OperacionModuleSlug;
  label: string;
  subtitle: string;
};

/** Orden fijo del grid operacional (8 módulos). */
export const OPERACION_LAUNCHER_MODULES: readonly OperacionLauncherModule[] = [
  { slug: "tpv", label: "TPV", subtitle: "Pedidos y cobro" },
  { slug: "cocina", label: "Cocina", subtitle: "Preparación en tiempo real" },
  { slug: "barra", label: "Barra", subtitle: "Bebidas y tickets" },
  { slug: "cocteleria", label: "Coctelería", subtitle: "Cócteles y preparación" },
  { slug: "sala", label: "Sala", subtitle: "Entrega y servicio" },
  { slug: "reservas", label: "Reservas", subtitle: "Gestión de mesas" },
  { slug: "activity", label: "Actividad", subtitle: "Historial del servicio" },
  { slug: "sesiones", label: "Sesiones", subtitle: "Turnos y cierre" },
] as const;

export const OPERACION_MODULE_SLUGS: readonly OperacionModuleSlug[] =
  OPERACION_LAUNCHER_MODULES.map((module) => module.slug);

export function isOperacionModuleSlug(value: string | null): value is OperacionModuleSlug {
  return value !== null && (OPERACION_MODULE_SLUGS as readonly string[]).includes(value);
}

export function operacionModuleHref(slug: OperacionModuleSlug): string {
  return `/dashboard/operacion/${slug}`;
}

/** Marcador de build — comprobar en consola/DOM tras deploy. */
export const OPERACION_LAUNCHER_BUILD_ID = "launcher-8-unfiltered-v1";

export function getOperacionLauncherDiagnostic() {
  return {
    buildId: OPERACION_LAUNCHER_BUILD_ID,
    nodeEnv: process.env.NODE_ENV,
    moduleCount: OPERACION_LAUNCHER_MODULES.length,
    modules: OPERACION_LAUNCHER_MODULES.map((module) => ({
      slug: module.slug,
      label: module.label,
      href: operacionModuleHref(module.slug),
    })),
  };
}

if (typeof window !== "undefined") {
  console.log("[operation-launcher] source constant", getOperacionLauncherDiagnostic());
}
