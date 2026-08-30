"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hostlySegmentTabClassName } from "@/components/ui/hostly";

export type InventarioHubTabId =
  | "stock"
  | "compras-inteligentes"
  | "pedidos-compra"
  | "nueva-compra"
  | "facturas-proveedor"
  | "aliases-proveedor"
  | "mermas";

const TABS: readonly { id: InventarioHubTabId; label: string; href: string }[] = [
  { id: "stock", label: "Stock", href: "/dashboard/inventario" },
  {
    id: "compras-inteligentes",
    label: "Compras sugeridas",
    href: "/dashboard/inventario/compras-inteligentes",
  },
  {
    id: "pedidos-compra",
    label: "Pedidos de compra",
    href: "/dashboard/inventario/pedidos-compra",
  },
  {
    id: "nueva-compra",
    label: "Nueva compra",
    href: "/dashboard/inventario/pedidos-compra/nuevo",
  },
  {
    id: "facturas-proveedor",
    label: "Facturas",
    href: "/dashboard/inventario/facturas-proveedor",
  },
  {
    id: "aliases-proveedor",
    label: "Nombres aprendidos",
    href: "/dashboard/inventario/aliases-proveedor",
  },
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
  if (pathname === "/dashboard/inventario/pedidos-compra/nuevo") return "nueva-compra";
  if (
    pathname === "/dashboard/inventario/pedidos-compra" ||
    pathname.startsWith("/dashboard/inventario/pedidos-compra/") ||
    pathname === "/dashboard/recepciones" ||
    pathname.startsWith("/dashboard/recepciones/")
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
  if (pathname === "/dashboard/mermas" || pathname.startsWith("/dashboard/mermas/")) return "mermas";
  return null;
}

function tabActive(pathname: string | null, id: InventarioHubTabId): boolean {
  return pathnameToInventarioTabId(pathname ?? "") === id;
}

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
