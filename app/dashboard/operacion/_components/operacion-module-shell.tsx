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
  return (
    <main style={shellStyle}>
      <div style={topBarStyle}>
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
    </main>
  );
}
