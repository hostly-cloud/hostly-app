"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";

type NavLeaf = { href: string; label: string };
type NavGroup = { id: string; label: string; children: NavLeaf[] };
type FooterLink = { href: string; label: string; outbound?: boolean };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "carta",
    label: "Carta",
    children: [
      { href: "/dashboard/configuracion/carta/productos", label: "Productos" },
      { href: "/dashboard/configuracion/carta/categorias", label: "Categorías" },
      { href: "/dashboard/configuracion/carta/familias", label: "Familias" },
      { href: "/dashboard/configuracion/carta/escandallos", label: "Escandallos" },
      {
        href: "/dashboard/configuracion/carta/importacion",
        label: "IA / Importación",
      },
      { href: "/dashboard/configuracion/modificadores", label: "Modificadores" },
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
  {
    id: "produccion",
    label: "Producción",
    children: [
      { href: "/dashboard/configuracion/estaciones", label: "Estaciones" },
      { href: "/dashboard/configuracion/impresoras", label: "Impresoras" },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    children: [
      {
        href: "/dashboard/configuracion/familias-producto",
        label: "Familias de producto",
      },
    ],
  },
  {
    id: "equipo",
    label: "Equipo",
    children: [{ href: "/dashboard/configuracion/empleados", label: "Empleados" }],
  },
  {
    id: "empresa",
    label: "Empresa",
    children: [
      { href: "/dashboard/configuracion/empresa", label: "Empresa" },
      {
        href: "/dashboard/configuracion/integraciones",
        label: "Integraciones",
      },
    ],
  },
];

const FOOTER_LINKS: FooterLink[] = [
  { href: "/dashboard/operacion", label: "Ir a Operación →", outbound: true },
  { href: "/dashboard", label: "← Volver al dashboard" },
];

function pathnameMatches(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

function navLinkClass(active: boolean) {
  return active
    ? "hostly-config-sidebar__link is-active"
    : "hostly-config-sidebar__link";
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
        "hostly-config-sidebar",
        mobileOpen
          ? "hostly-config-sidebar--open"
          : "hostly-config-sidebar--closed",
      ].join(" "),
    [mobileOpen],
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="hostly-config-sidebar-overlay lg:hidden"
          aria-label="Cerrar menú"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside className={asideClass}>
        <div className="hostly-config-sidebar__header">
          <Link
            href="/dashboard/configuracion/carta/productos"
            className="hostly-config-sidebar__header-link"
            onClick={onCloseMobile}
          >
            <span className="hostly-config-sidebar__header-icon" aria-hidden>
              ⚙
            </span>
            <span className="hostly-config-sidebar__header-title">
              Configuración
            </span>
          </Link>
        </div>

        <nav
          className="hostly-config-sidebar__nav"
          aria-label="Configuración"
        >
          <ul className="hostly-config-sidebar__groups">
            {NAV_GROUPS.map((group) => {
              const anyChildActive = group.children.some((c) =>
                pathnameMatches(pathname, c.href),
              );
              return (
                <li key={group.id} className="hostly-config-sidebar__group">
                  <div
                    className={`hostly-config-sidebar__group-label${
                      anyChildActive ? " is-active-group" : ""
                    }`}
                  >
                    {group.label}
                  </div>
                  <ul className="hostly-config-sidebar__list">
                    {group.children.map((c) => {
                      const active = pathnameMatches(pathname, c.href);
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            className={navLinkClass(active)}
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
            })}
          </ul>
        </nav>

        <div className="hostly-config-sidebar__footer">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                link.outbound
                  ? "hostly-config-sidebar__footer-link hostly-config-sidebar__footer-link--outbound"
                  : "hostly-config-sidebar__footer-link"
              }
              onClick={onCloseMobile}
            >
              {link.label}
            </Link>
          ))}
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
    <header className="hostly-config-mobile-header lg:hidden">
      <button
        type="button"
        className="hostly-config-mobile-header__menu-btn"
        aria-expanded={navOpen}
        aria-label="Abrir menú de configuración"
        onClick={onOpenNav}
      >
        <span className="text-lg leading-none" aria-hidden>
          ☰
        </span>
      </button>
      <span className="hostly-config-mobile-header__title">Configuración</span>
    </header>
  );
}
