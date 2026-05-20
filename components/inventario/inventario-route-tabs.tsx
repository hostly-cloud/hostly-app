"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs del hub Inventario → rutas reales (`/dashboard/...`). */
export type InventarioHubTabId = "stock" | "compras" | "recepciones" | "mermas";

const TABS: readonly { id: InventarioHubTabId; label: string; href: string }[] = [
  /** Stock inventario Firestore central (lista + inspector). */
  { id: "stock", label: "Stock", href: "/dashboard/inventario" },
  { id: "compras", label: "Compras", href: "/dashboard/compras" },
  { id: "recepciones", label: "Recepciones", href: "/dashboard/recepciones" },
  { id: "mermas", label: "Mermas", href: "/dashboard/mermas" },
] as const;

function pathnameToInventarioTabId(pathname: string): InventarioHubTabId | null {
  if (!pathname.startsWith("/dashboard")) return null;
  if (pathname === "/dashboard/inventario" || pathname === "/dashboard/stock") return "stock";
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
 * Tabs de navegación del hub Inventario (`hostly-segmented` / `hostly-tab`).
 * Colocar en `ModulePageShell` → `headerBelow` para alinear con shell existente.
 */
export function InventarioRouteTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <div
      className={["hostly-inventario-route-tabs", className].filter(Boolean).join(" ")}
      style={{ display: "flex", justifyContent: "flex-start", width: "100%", minHeight: 0 }}
    >
      <div role="tablist" aria-label="Secciones de inventario" className="hostly-segmented">
        {TABS.map((t) => {
          const selected = tabActive(pathname, t.id);
          return (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={selected}
              data-active={selected ? "true" : undefined}
              className="hostly-tab hostly-tab--inventory-hub"
              prefetch
              style={{
                minWidth: 92,
                padding: "5px 12px",
                textDecoration: "none",
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
