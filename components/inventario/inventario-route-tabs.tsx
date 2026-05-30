"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hostlySegmentTabClassName } from "@/components/ui/hostly";

/** Tabs del hub Inventario → rutas reales (`/dashboard/...`). */
export type InventarioHubTabId =
  | "stock"
  | "compras-inteligentes"
  | "pedidos-compra"
  | "facturas-proveedor"
  | "aliases-proveedor"
  | "compras"
  | "recepciones"
  | "mermas";

const TABS: readonly { id: InventarioHubTabId; label: string; href: string }[] = [
  /** Stock inventario Firestore central (lista + inspector). */
  { id: "stock", label: "Stock", href: "/dashboard/inventario" },
  {
    id: "compras-inteligentes",
    label: "Compras sugeridas",
    href: "/dashboard/inventario/compras-inteligentes",
  },
  {
    id: "pedidos-compra",
    label: "Pedidos compra",
    href: "/dashboard/inventario/pedidos-compra",
  },
  {
    id: "facturas-proveedor",
    label: "Facturas",
    href: "/dashboard/inventario/facturas-proveedor",
  },
  {
    id: "aliases-proveedor",
    label: "Aliases OCR",
    href: "/dashboard/inventario/aliases-proveedor",
  },
  { id: "compras", label: "Compras", href: "/dashboard/compras" },
  { id: "recepciones", label: "Recepciones", href: "/dashboard/recepciones" },
  { id: "mermas", label: "Mermas", href: "/dashboard/mermas" },
] as const;

function pathnameToInventarioTabId(pathname: string): InventarioHubTabId | null {
  if (!pathname.startsWith("/dashboard")) return null;
  if (pathname === "/dashboard/inventario" || pathname === "/dashboard/stock") return "stock";
  if (
    pathname === "/dashboard/inventario/compras-inteligentes" ||
    pathname.startsWith("/dashboard/inventario/compras-inteligentes/")
  ) {
    return "compras-inteligentes";
  }
  if (
    pathname === "/dashboard/inventario/pedidos-compra" ||
    pathname.startsWith("/dashboard/inventario/pedidos-compra/")
  ) {
    return "pedidos-compra";
  }
  if (
    pathname === "/dashboard/inventario/facturas-proveedor" ||
    pathname.startsWith("/dashboard/inventario/facturas-proveedor/")
  ) {
    return "facturas-proveedor";
  }
  if (
    pathname === "/dashboard/inventario/aliases-proveedor" ||
    pathname.startsWith("/dashboard/inventario/aliases-proveedor/")
  ) {
    return "aliases-proveedor";
  }
  if (pathname === "/dashboard/compras" || pathname.startsWith("/dashboard/compras/")) return "compras";
  if (pathname === "/dashboard/recepciones" || pathname.startsWith("/dashboard/recepciones/")) {
    return "recepciones";
  }
  if (pathname === "/dashboard/mermas" || pathname.startsWith("/dashboard/mermas/")) return "mermas";
  return null;
}

function tabActive(pathname: string | null, id: InventarioHubTabId): boolean {
  const p = pathname ?? "";
  return pathnameToInventarioTabId(p) === id;
}

/**
 * Tabs de navegación del hub Inventario.
 * Mobile: pills horizontales compactas con scroll limpio (Hostly Mobile Operational Layout).
 */
export function InventarioRouteTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={["hostly-mobile-operational-tabs", "hostly-inventario-route-tabs", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Secciones de inventario"
    >
      <div className="hostly-mobile-operational-tabs__scroll" role="tablist">
        {TABS.map((t) => {
          const selected = tabActive(pathname, t.id);
          return (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={selected}
              data-active={selected ? "true" : undefined}
              className={hostlySegmentTabClassName(
                "hostly-mobile-operational-tab hostly-tab--inventory-hub",
              )}
              prefetch
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
