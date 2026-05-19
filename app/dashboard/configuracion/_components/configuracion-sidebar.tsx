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
    "block rounded-lg text-[10.5px] font-medium leading-snug tracking-[-0.01em] transition-[background-color,color,border-color] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-sky-400/[0.32] focus-visible:ring-offset-2 focus-visible:ring-offset-[#303845]";
  const pad = nested ? "py-[5px] pl-6 pr-2" : "px-2 py-[7px]";
  const colors = active
    ? "border border-white/[0.11] bg-white/[0.075] text-slate-50/98 shadow-none"
    : "border border-transparent text-slate-400/93 hover:bg-white/[0.042] hover:text-slate-100/96";
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
        /* Graphite/navy helado: menos bloque oscuro; hairline derecho suave */
        "fixed z-50 flex min-h-screen w-[min(196px,88vw)] flex-col border-r border-white/[0.055] bg-[linear-gradient(168deg,#3d4654_0%,#363f4d_38%,#2f3743_72%,#2a313c_100%)] text-slate-300/88 shadow-[1px_0_0_rgba(255,255,255,0.04)_inset,4px_0_18px_-12px_rgba(15,23,42,0.14)] transition-transform duration-200 ease-out lg:static lg:z-auto lg:min-h-[100dvh] lg:w-[196px] lg:translate-x-0 lg:shadow-[1px_0_0_rgba(255,255,255,0.035)_inset] xl:w-[200px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" "),
    [mobileOpen],
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/32 backdrop-blur-[0.5px] lg:hidden"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside className={asideClass}>
        <div className="flex h-11 shrink-0 items-center border-b border-white/[0.055] px-2.5 lg:h-11">
          <Link
            href="/dashboard/configuracion/carta/productos"
            className="flex min-w-0 items-center gap-1.5 text-left"
            onClick={onCloseMobile}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.065] text-[12px] text-slate-200/90 ring-1 ring-white/[0.08]"
              aria-hidden
            >
              ⚙
            </span>
            <span className="truncate text-[12.5px] font-medium tracking-tight text-slate-100/95">
              Configuración
            </span>
          </Link>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2.5 lg:py-3"
          aria-label="Configuración"
        >
          <ul className="space-y-[1.125rem]">
            {NAV.map((item) => {
              if (isGroup(item)) {
                const anyChildActive = item.children.some((c) =>
                  pathnameMatches(pathname, c.href),
                );
                return (
                  <li key={item.id}>
                    <div
                      className={`px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${
                        anyChildActive ? "text-slate-400/88" : "text-slate-500/62"
                      }`}
                    >
                      {item.label}
                    </div>
                    <ul className="ml-1.5 space-y-px border-l border-white/[0.055] pl-2">
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
                <li key={item.href} className="px-0">
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

        <div className="shrink-0 border-t border-white/[0.05] px-2 py-2">
          <Link
            href="/dashboard"
            className="block rounded-lg px-2 py-1.5 text-[10.5px] font-medium tracking-[-0.01em] text-slate-500/88 outline-none transition-colors duration-150 hover:bg-white/[0.04] hover:text-slate-200/94 focus-visible:ring-2 focus-visible:ring-sky-400/[0.32] focus-visible:ring-offset-2 focus-visible:ring-offset-[#303845]"
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
