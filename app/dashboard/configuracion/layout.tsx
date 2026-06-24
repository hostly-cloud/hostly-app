"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ConfiguracionCapabilityShell } from "@/components/auth/configuracion-capability-shell";
import {
  ConfiguracionMobileHeader,
  ConfiguracionSidebar,
} from "./_components/configuracion-sidebar";

const MAP_EDITOR_CONFIG_PATH = "/dashboard/configuracion/espacios/mesas";
const EMPRESA_CONFIG_PATH = "/dashboard/configuracion/empresa";

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

  const isEmpresaPage = useMemo(
    () =>
      pathname === EMPRESA_CONFIG_PATH ||
      pathname.endsWith("/configuracion/empresa"),
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
        data-hostly-config-workspace=""
        className={
          isMapEspaciosMesasEditor
            ? "flex min-w-0 flex-1 flex-col"
            : "flex min-w-0 flex-1 flex-col lg:pl-0"
        }
      >
        {!isMapEspaciosMesasEditor ? (
          <ConfiguracionMobileHeader
            navOpen={mobileNavOpen}
            onOpenNav={() => setMobileNavOpen(true)}
          />
        ) : null}
        <div
          data-hostly-config-content=""
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
          ) : isEmpresaPage ? (
            children
          ) : (
            <ConfiguracionCapabilityShell>{children}</ConfiguracionCapabilityShell>
          )}
        </div>
      </div>
    </div>
  );
}
