"use client";

import type { CSSProperties, ReactNode } from "react";
import { HostlyBackButton } from "@/components/hostly/back-button";
import OperationFilterBar from "@/components/kds/operation-filter-bar";

/**
 * Marco común de los módulos hijos de `/dashboard/operacion/*`.
 * Sustituye al antiguo sistema de tabs internas: cada módulo es ahora una ruta
 * con su propia pantalla, encabezada por "Volver a Operación" y el título.
 *
 * El shell ocupa siempre el viewport (`100dvh`) y deja al hijo todo el alto
 * disponible vía un slot flex (`flex: 1; min-height: 0; overflow: hidden`).
 *
 * No contiene `OperationFilterProvider` porque ya lo aporta el `layout.tsx`
 * de `/dashboard/operacion`, así los filtros se preservan al navegar entre
 * módulos hermanos.
 */
const shellStyle: CSSProperties = {
  boxSizing: "border-box",
  background:
    "linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-surface-page) 48%, #dbeefa 100%)",
  color: "#1f2933",
  minHeight: "100dvh",
  height: "100dvh",
  maxHeight: "100dvh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: 0,
  fontFamily: "Arial, sans-serif",
};

const topBarStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: "1px solid var(--hostly-line)",
  background: "rgba(247, 252, 255, 0.92)",
};

const moduleLabelStyle: CSSProperties = {
  marginLeft: "auto",
  color: "#667085",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const filterBarWrapStyle: CSSProperties = {
  flexShrink: 0,
  padding: "10px 16px 0 16px",
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export type OperacionModuleShellProps = {
  /** Etiqueta del módulo (TPV, Cocina, Barra, Sala, Reservas). */
  title: string;
  /** Renderiza la `OperationFilterBar` justo debajo de la cabecera. */
  showFilterBar?: boolean;
  children: ReactNode;
};

export function OperacionModuleShell({
  title,
  showFilterBar,
  children,
}: OperacionModuleShellProps) {
  const moduleKey = title.trim().toLowerCase();

  return (
    <main
      className="hostly-operation-shell"
      data-operation-module={moduleKey}
      style={shellStyle}
    >
      <div className="hostly-operation-topbar" style={topBarStyle}>
        <HostlyBackButton
          href="/dashboard/operacion"
          label="Volver a Operación"
          ariaLabel="Volver a Operación"
          tone="light"
        />
        <span style={moduleLabelStyle}>{title}</span>
      </div>

      {showFilterBar ? (
        <div style={filterBarWrapStyle}>
          <OperationFilterBar />
        </div>
      ) : null}

      <div style={contentStyle}>{children}</div>
      <style>{`
        @media (max-width: 767.98px) {
          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar {
            min-height: 26px !important;
            padding: 2px 5px !important;
            gap: 4px !important;
            border-bottom-color: rgba(148, 163, 184, 0.14) !important;
            background: rgba(247, 252, 255, 0.72) !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux {
            min-height: 22px !important;
            gap: 4px !important;
            padding: 2px 6px !important;
            border-radius: 8px !important;
            border-color: rgba(148, 163, 184, 0.22) !important;
            background: rgba(255, 255, 255, 0.66) !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux
            span:first-child {
            width: 15px !important;
            height: 15px !important;
            border-radius: 5px !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux
            span:last-child {
            max-width: 44px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 10px !important;
            line-height: 1 !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            > span {
            font-size: 10px !important;
            letter-spacing: 0.04em !important;
          }
        }
      `}</style>
    </main>
  );
}
