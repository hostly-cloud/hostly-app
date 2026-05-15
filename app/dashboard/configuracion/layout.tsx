"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ConfiguracionMobileHeader,
  ConfiguracionSidebar,
} from "./_components/configuracion-sidebar";

const MAP_EDITOR_CONFIG_PATH = "/dashboard/configuracion/espacios/mesas";

export default function ConfiguracionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname() ?? "";

  const isMapEspaciosMesasEditor = useMemo(
    () =>
      pathname === MAP_EDITOR_CONFIG_PATH ||
      pathname.endsWith("/configuracion/espacios/mesas"),
    [pathname],
  );

  return (
    <div
      data-hostly-config-shell=""
      className="hostly-config-shell flex min-h-[100dvh] w-full text-slate-900"
    >
      {!isMapEspaciosMesasEditor ? (
        <ConfiguracionSidebar
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div
        className={
          isMapEspaciosMesasEditor
            ? "flex min-w-0 flex-1 flex-col"
            : "flex min-w-0 flex-1 flex-col lg:pl-0"
        }
      >
        {isMapEspaciosMesasEditor ? (
          <header className="flex h-11 shrink-0 items-center gap-3 border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-sm lg:hidden">
            <Link
              href="/dashboard/configuracion/carta/productos"
              className="text-[13px] font-medium text-sky-800 hover:text-sky-950"
            >
              ← Configuración
            </Link>
            <span className="min-w-0 truncate text-xs font-medium text-slate-500">
              Editor de plano
            </span>
          </header>
        ) : (
          <ConfiguracionMobileHeader
            navOpen={mobileNavOpen}
            onOpenNav={() => setMobileNavOpen(true)}
          />
        )}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
            isMapEspaciosMesasEditor ? "p-1 sm:p-1.5 lg:p-2" : ""
          }`}
        >
          {isMapEspaciosMesasEditor ? (
            <div className="hostly-config-map-frame-shell" data-hostly-map-editor-chrome="">
              <div className="hostly-config-map-frame flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-slate-200">
                {children}
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
