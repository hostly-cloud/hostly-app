"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";

type NavLeaf = { href: string; label: string };
type NavGroup = { id: string; label: string; children: NavLeaf[] };
type NavLink = { href: string; label: string };
type NavItem = NavGroup | NavLink;

const NAV: NavItem[] = [
  {
    id: "carta",
    label: "Carta",
    children: [
      { href: "/dashboard/configuracion/carta/productos", label: "Productos" },
      { href: "/dashboard/configuracion/carta/categorias", label: "Categorías" },
      { href: "/dashboard/configuracion/carta/familias", label: "Familias" },
      {
        href: "/dashboard/configuracion/carta/modificadores",
        label: "Modificadores",
      },
      { href: "/dashboard/configuracion/carta/escandallos", label: "Escandallos" },
      {
        href: "/dashboard/configuracion/carta/importacion",
        label: "IA / Importación",
      },
    ],
  },
  {
    id: "espacios",
    label: "Espacios",
    children: [
      { href: "/dashboard/configuracion/espacios/mesas", label: "Mesas" },
      { href: "/dashboard/configuracion/espacios/zonas", label: "Zonas" },
    ],
  },
  { href: "/dashboard/configuracion/empleados", label: "Empleados" },
  { href: "/dashboard/operacion", label: "Operación" },
  { href: "/dashboard/configuracion/empresa", label: "Empresa" },
  {
    href: "/dashboard/configuracion/integraciones",
    label: "Integraciones",
  },
];

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item && Array.isArray((item as NavGroup).children);
}

function pathnameMatches(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

function navLinkClass(active: boolean, nested = false) {
  const base =
    "block rounded-[var(--hostly-config-radius)] text-[11px] font-semibold transition-[background-color,color,border-color,box-shadow] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-sky-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#203449]";
  const pad = nested ? "py-1.5 pl-7 pr-2" : "px-2.5 py-2";
  const colors = active
    ? "border border-sky-200/22 bg-sky-100/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_8px_rgba(15,23,42,0.1)]"
    : "border border-transparent text-slate-200/90 hover:border-sky-200/12 hover:bg-sky-100/[0.07] hover:text-white";
  return `${base} ${pad} ${colors}`;
}

export function ConfiguracionSidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [mobileOpen]);

  const asideClass = useMemo(
    () =>
      [
        "fixed z-50 flex min-h-screen w-[min(196px,88vw)] flex-col border-r border-sky-100/[0.09] bg-[linear-gradient(180deg,#274258_0%,#20374c_46%,#1a2d40_100%)] text-slate-200 shadow-[2px_0_24px_-10px_rgba(15,23,42,0.2)] transition-transform duration-200 ease-out lg:static lg:z-auto lg:min-h-[100dvh] lg:w-[196px] lg:translate-x-0 lg:shadow-none xl:w-[200px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" "),
    [mobileOpen],
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[1px] lg:hidden"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside className={asideClass}>
        <div className="flex h-12 shrink-0 items-center border-b border-sky-100/[0.09] px-3 lg:h-12">
          <Link
            href="/dashboard/configuracion/carta/productos"
            className="flex min-w-0 items-center gap-2 text-left"
            onClick={onCloseMobile}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-100/[0.13] text-[13px] text-sky-100 ring-1 ring-sky-100/15"
              aria-hidden
            >
              ⚙
            </span>
            <span className="truncate text-[13px] font-semibold tracking-tight text-white">
              Configuración
            </span>
          </Link>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 lg:py-3.5"
          aria-label="Configuración"
        >
          <ul className="space-y-4">
            {NAV.map((item) => {
              if (isGroup(item)) {
                const anyChildActive = item.children.some((c) =>
                  pathnameMatches(pathname, c.href),
                );
                return (
                  <li key={item.id}>
                    <div
                      className={`px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                        anyChildActive ? "text-sky-100" : "text-slate-300/70"
                      }`}
                    >
                      {item.label}
                    </div>
                    <ul className="ml-2 space-y-0.5 border-l border-sky-100/[0.11] pl-2.5">
                      {item.children.map((c) => {
                        const active = pathnameMatches(pathname, c.href);
                        return (
                          <li key={c.href}>
                            <Link
                              href={c.href}
                              className={navLinkClass(active, true)}
                              aria-current={active ? "page" : undefined}
                              onClick={onCloseMobile}
                            >
                              {c.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              }

              const isOperacion = item.href === "/dashboard/operacion";
              const active = isOperacion
                ? pathname.startsWith("/dashboard/operacion")
                : pathnameMatches(pathname, item.href);

              return (
                <li key={item.href} className="px-0.5">
                  <Link
                    href={item.href}
                    className={navLinkClass(active)}
                    aria-current={active ? "page" : undefined}
                    onClick={onCloseMobile}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="grid shrink-0 gap-2 border-t border-sky-100/[0.09] px-2.5 py-2.5 text-[10px] leading-snug text-slate-300/75">
          <Link
            href="/dashboard"
            className="rounded-[var(--hostly-config-radius)] border border-sky-100/[0.12] bg-sky-100/[0.08] px-2.5 py-2 text-[11px] font-semibold text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors duration-200 hover:bg-sky-100/[0.13] hover:text-white"
            onClick={onCloseMobile}
          >
            ← Volver al panel
          </Link>
        </div>
      </aside>
    </>
  );
}

export function ConfiguracionMobileHeader({
  onOpenNav,
  navOpen,
}: {
  onOpenNav: () => void;
  navOpen: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-sm lg:hidden">
      <button
        type="button"
        className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800 shadow-sm touch-manipulation hover:bg-slate-50"
        aria-expanded={navOpen}
        aria-label="Abrir menú de configuración"
        onClick={onOpenNav}
      >
        <span className="text-lg leading-none" aria-hidden>
          ☰
        </span>
      </button>
      <span className="text-sm font-medium text-slate-800">Configuración</span>
    </header>
  );
}
