"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ConfiguracionCapabilityShell } from "@/components/auth/configuracion-capability-shell";
import { resolveConfigScrollOwner } from "@/lib/configuracion/config-nav";
import { ConfiguracionContextSelector } from "./_components/configuracion-context-selector";

const MAP_EDITOR_CONFIG_PATH = "/dashboard/configuracion/espacios/editor-v2";
const EMPRESA_CONFIG_PATH = "/dashboard/configuracion/empresa";
const CONFIG_HUB_PATH = "/dashboard/configuracion";
const PRODUCTOS_CONFIG_PATH = "/dashboard/configuracion/carta/productos";

function isConfigHubPath(pathname: string): boolean {
  return pathname === CONFIG_HUB_PATH;
}

function isProductosConfigPath(pathname: string): boolean {
  return (
    pathname === PRODUCTOS_CONFIG_PATH ||
    pathname.startsWith(`${PRODUCTOS_CONFIG_PATH}/`)
  );
}

export default function ConfiguracionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  const isConfigHub = useMemo(() => isConfigHubPath(pathname), [pathname]);
  const scrollOwner = useMemo(() => resolveConfigScrollOwner(pathname), [pathname]);
  const isProductosPage = useMemo(
    () => isProductosConfigPath(pathname),
    [pathname],
  );

  const isMapEditor = useMemo(
    () =>
      pathname === MAP_EDITOR_CONFIG_PATH ||
      pathname.endsWith("/configuracion/espacios/editor-v2"),
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
      data-hostly-config-scroll-owner={scrollOwner}
      className={`hostly-config-shell flex min-h-[100dvh] w-full text-slate-900${
        isConfigHub ? " hostly-config-shell--hub" : ""
      }${isProductosPage ? " hostly-config-shell--productos" : ""}`}
    >
      <div
        data-hostly-config-workspace=""
        className={
          isMapEditor
            ? "flex min-w-0 flex-1 flex-col"
            : isConfigHub
              ? "flex min-w-0 flex-1 flex-col"
              : isProductosPage
                ? "flex min-w-0 flex-1 flex-col"
                : "flex min-w-0 flex-1 flex-col lg:pl-0"
        }
      >
        {!isConfigHub ? <ConfiguracionContextSelector /> : null}
        <div
          data-hostly-config-content=""
          className={`flex flex-1 flex-col ${
            isConfigHub
              ? "min-h-0 overflow-visible"
              : scrollOwner === "content"
                ? "min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain"
                : `min-h-0 overflow-hidden ${isMapEditor ? "p-1 sm:p-1.5 lg:p-2" : ""}`
          }`}
        >
          {isMapEditor ? (
            <div
              className="hostly-config-map-frame-shell"
              data-hostly-map-editor-chrome=""
            >
              <div className="hostly-config-map-frame flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-slate-200">
                {children}
              </div>
            </div>
          ) : isEmpresaPage ? (
            children
          ) : (
            <ConfiguracionCapabilityShell>
              {children}
            </ConfiguracionCapabilityShell>
          )}
        </div>
      </div>
    </div>
  );
}
