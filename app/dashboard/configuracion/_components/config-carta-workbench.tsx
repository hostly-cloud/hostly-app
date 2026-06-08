"use client";

import type { ReactNode } from "react";
import ModulePageShell from "@/components/module-page-shell";

type ConfigCartaWorkbenchProps = {
  title: string;
  description: string;
  children?: ReactNode;
  /** Acciones alineadas a la derecha del título (p. ej. importar / nuevo). */
  headerActions?: ReactNode;
  lockViewport?: boolean;
  lockViewportFillParent?: boolean;
  fitLaptopViewport?: boolean;
};

/** Tarjeta / panel estándar en Carta · Configuración. */
export function ConfigCard({
  children,
  className = "",
  flush = false,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  /** Sin padding exterior (p. ej. tablas edge-to-edge). */
  flush?: boolean;
  compact?: boolean;
}) {
  const variant = flush ? "hostly-carta-config-card--flush" : compact ? "hostly-carta-config-card--compact" : "";
  return (
    <div className={["hostly-carta-config-card", variant, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function ConfigBtnPrimary({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type="button"
      className={["hostly-button-primary hostly-button-compact", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ConfigBtnSecondary({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type="button"
      className={["hostly-button-secondary hostly-button-compact", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Destructivo discreto (ajustes, no alarmismo). */
export function ConfigBtnDanger({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type="button"
      className={["hostly-button-danger hostly-button-compact", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Marco visual unificado para secciones Carta en Configuración (ritmo operacional compacto).
 */
export function ConfigCartaWorkbench({
  title,
  description,
  children,
  headerActions,
  lockViewport,
  lockViewportFillParent,
  fitLaptopViewport,
}: ConfigCartaWorkbenchProps) {
  return (
    <ModulePageShell
      title={title}
      subtitle={description}
      maxWidth={1280}
      compactLayout
      operationalFocus
      denseWorkbench
      denseInventoryHeader
      lockViewport={lockViewport}
      lockViewportFillParent={lockViewportFillParent}
      fitLaptopViewport={fitLaptopViewport}
      shellSurface="configLight"
      backHref="/dashboard"
      backLabel="Dashboard"
      headerRight={
        headerActions ? (
          <div className="hostly-carta-config-header-actions">{headerActions}</div>
        ) : undefined
      }
    >
      <div className="hostly-carta-config-stack">{children}</div>
    </ModulePageShell>
  );
}
