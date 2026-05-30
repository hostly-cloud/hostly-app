"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HostlySegmentedControl, hostlySegmentTabClassName } from "@/components/ui/hostly";

export type ConfigCartaRouteTabId =
  | "productos"
  | "categorias"
  | "familias"
  | "importacion"
  | "escandallos"
  | "modificadores";

const TABS: readonly { id: ConfigCartaRouteTabId; label: string; href: string }[] = [
  { id: "productos", label: "Productos", href: "/dashboard/configuracion/carta/productos" },
  { id: "categorias", label: "Categorías", href: "/dashboard/configuracion/carta/categorias" },
  { id: "familias", label: "Familias", href: "/dashboard/configuracion/carta/familias" },
  { id: "importacion", label: "Importación", href: "/dashboard/configuracion/carta/importacion" },
  { id: "escandallos", label: "Escandallos", href: "/dashboard/configuracion/carta/escandallos" },
  { id: "modificadores", label: "Modificadores", href: "/dashboard/configuracion/modificadores" },
] as const;

function pathnameToConfigCartaTabId(pathname: string): ConfigCartaRouteTabId | null {
  if (!pathname.startsWith("/dashboard/configuracion")) return null;
  if (pathname.includes("/carta/productos")) return "productos";
  if (pathname.includes("/carta/categorias")) return "categorias";
  if (pathname.includes("/carta/familias")) return "familias";
  if (pathname.includes("/carta/importacion")) return "importacion";
  if (pathname.includes("/carta/escandallos")) return "escandallos";
  if (pathname.includes("/modificadores")) return "modificadores";
  return null;
}

function tabActive(pathname: string | null, id: ConfigCartaRouteTabId): boolean {
  return pathnameToConfigCartaTabId(pathname ?? "") === id;
}

/**
 * Tabs unificadas del ecosistema Configuración → Carta.
 * Colocar en `ModulePageShell` / `ConfigCartaWorkbench` → `headerBelow`.
 */
export function ConfigCartaRouteTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <div
      className={["hostly-carta-config-route-tabs", className].filter(Boolean).join(" ")}
      style={{ width: "100%", minHeight: 0, minWidth: 0 }}
    >
      <HostlySegmentedControl aria-label="Secciones de configuración de carta">
        {TABS.map((t) => {
          const selected = tabActive(pathname, t.id);
          return (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={selected}
              data-active={selected ? "true" : undefined}
              className={hostlySegmentTabClassName()}
              prefetch
              style={{ textDecoration: "none", cursor: "pointer", boxSizing: "border-box" }}
            >
              {t.label}
            </Link>
          );
        })}
      </HostlySegmentedControl>
    </div>
  );
}
