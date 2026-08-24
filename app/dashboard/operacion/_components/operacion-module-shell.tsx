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
  color: "var(--hostly-ink)",
  minHeight: "100dvh",
  height: "100dvh",
  maxHeight: "100dvh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: 0,
};

const topBarStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: "var(--hostly-op-gap-md)",
  padding: "var(--hostly-op-gap-sm) var(--hostly-op-gap-lg)",
  borderBottom: "1px solid var(--hostly-line)",
  background: "rgba(247, 252, 255, 0.92)",
};

const moduleLabelStyle: CSSProperties = {
  marginLeft: "auto",
  color: "var(--hostly-ink-muted)",
  fontSize: "var(--hostly-type-caption)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const filterBarWrapStyle: CSSProperties = {
  flexShrink: 0,
  padding: "var(--hostly-op-gap-sm) var(--hostly-op-gap-lg) 0",
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
  /** Contenido alineado a la derecha de la barra superior (p. ej. operador activo en TPV). */
  topBarEnd?: ReactNode;
  /** Oculta la barra superior para ganar altura (p. ej. TPV dentro de mesa). */
  hideTopBar?: boolean;
  children: ReactNode;
};

export function OperacionModuleShell({
  title,
  showFilterBar,
  topBarEnd,
  hideTopBar,
  children,
}: OperacionModuleShellProps) {
  const moduleKey = title.trim().toLowerCase();

  return (
    <main
      className="hostly-operation-shell"
      data-operation-module={moduleKey}
      style={shellStyle}
    >
      {!hideTopBar ? (
        <div className="hostly-operation-topbar" style={topBarStyle}>
          <HostlyBackButton
            href="/dashboard/operacion"
            label="Volver a Operación"
            ariaLabel="Volver a Operación"
            tone="light"
          />
          {topBarEnd ? (
            <div
              className="hostly-operation-topbar-end"
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                minWidth: 0,
              }}
            >
              {topBarEnd}
            </div>
          ) : (
            <span style={moduleLabelStyle}>{title}</span>
          )}
        </div>
      ) : null}

      {showFilterBar ? (
        <div style={filterBarWrapStyle}>
          <OperationFilterBar />
        </div>
      ) : null}

      <div style={contentStyle}>{children}</div>
      <style>{`
        .hostly-operation-shell[data-operation-module="tpv"] .hostly-operation-topbar {
          min-height: 26px;
          padding: 2px 8px;
          gap: 4px;
          border-bottom-color: rgba(148, 163, 184, 0.12);
          background: rgba(247, 252, 255, 0.55);
        }

        .hostly-operation-shell[data-operation-module="tpv"]
          .hostly-operation-topbar
          .hostly-nav-aux {
          opacity: 0.68;
          border-color: rgba(148, 163, 184, 0.2) !important;
          background: rgba(255, 255, 255, 0.5) !important;
          color: #64748b !important;
          font-size: 11px;
          font-weight: 600;
        }

        .hostly-operation-shell[data-operation-module="tpv"]
          .hostly-operation-topbar
          > span {
          opacity: 0.55;
          font-size: 10px;
        }

        .hostly-operation-shell[data-operation-module="tpv"]
          .hostly-tpv-active-operator-btn {
          min-height: 28px;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          border-color: rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.82);
          box-shadow: none;
        }

        .hostly-operation-shell[data-operation-module="tpv"]
          .hostly-tpv-active-operator-btn__name {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 767.98px) {
          .hostly-operation-shell[data-operation-module="tpv"] {
            background: var(--hostly-surface-page) !important;
          }
          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar {
            min-height: 44px !important;
            padding: 2px 6px !important;
            gap: 6px !important;
            border-bottom-color: rgba(148, 163, 184, 0.1) !important;
            background: rgba(247, 252, 255, 0.45) !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux {
            flex: 0 1 auto !important;
            min-width: 0 !important;
            min-height: 40px !important;
            gap: 5px !important;
            padding: 5px 8px !important;
            border-radius: 9px !important;
            border-color: rgba(148, 163, 184, 0.22) !important;
            background: rgba(255, 255, 255, 0.66) !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux
            span:first-child {
            width: 18px !important;
            height: 18px !important;
            flex: 0 0 18px !important;
            border-radius: 6px !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            .hostly-nav-aux
            span:last-child {
            max-width: none !important;
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: nowrap !important;
            font-size: 10px !important;
            line-height: 1 !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar-end {
            flex: 0 1 auto !important;
            min-width: 0 !important;
            max-width: calc(100% - 126px) !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-operation-topbar
            > span {
            font-size: 10px !important;
            letter-spacing: 0.04em !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-tpv-active-operator-btn {
            min-height: 40px !important;
            min-width: 40px !important;
            max-width: 100% !important;
            padding: 5px 8px !important;
            font-size: 11px !important;
          }

          .hostly-operation-shell[data-operation-module="tpv"]
            .hostly-tpv-active-operator-btn__name {
            max-width: min(96px, 24vw) !important;
          }

          .hostly-operation-shell[data-operation-module="reservas"]
            .hostly-operation-topbar,
          .hostly-operation-shell[data-operation-module="cocina"]
            .hostly-operation-topbar,
          .hostly-operation-shell[data-operation-module="barra"]
            .hostly-operation-topbar,
          .hostly-operation-shell[data-operation-module="cocteleria"]
            .hostly-operation-topbar,
          .hostly-operation-shell[data-operation-module="sala"]
            .hostly-operation-topbar {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
