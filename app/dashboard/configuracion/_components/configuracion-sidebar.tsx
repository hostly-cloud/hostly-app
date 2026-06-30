"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  CONFIG_NAV_GROUPS,
  configPathnameMatches,
} from "@/lib/configuracion/config-nav";
import { HostlyBrandMark } from "@/components/brand/hostly-brand";

type NavLeaf = { href: string; label: string };
type NavGroup = { id: string; label: string; children: NavLeaf[] };
type FooterLink = { href: string; label: string; outbound?: boolean };

const NAV_GROUPS = CONFIG_NAV_GROUPS as NavGroup[];

const FOOTER_LINKS: FooterLink[] = [
  { href: "/dashboard/operacion", label: "Ir a Operación →", outbound: true },
  { href: "/dashboard", label: "← Volver al dashboard" },
];

function pathnameMatches(pathname: string, href: string) {
  return configPathnameMatches(pathname, href);
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
            href="/dashboard/configuracion"
            className="hostly-config-sidebar__header-link"
            onClick={onCloseMobile}
          >
            <span className="hostly-config-sidebar__header-icon" aria-hidden>
              <HostlyBrandMark size={26} tone="app" />
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
      <HostlyBrandMark size={24} tone="app" />
      <span className="hostly-config-mobile-header__title">Configuración</span>
    </header>
  );
}
