"use client";

import type { ReactNode } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton, HostlyCard } from "@/components/ui/hostly";

type ConfigCartaWorkbenchProps = {
  title: ReactNode;
  description?: string;
  children?: ReactNode;
  /** Acciones alineadas a la derecha del título (p. ej. importar / nuevo). */
  headerActions?: ReactNode;
  lockViewport?: boolean;
  lockViewportFillParent?: boolean;
  fitLaptopViewport?: boolean;
  visualVariant?: "productos";
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
    <HostlyCard
      family="configuration"
      className={["hostly-carta-config-card", variant, className].filter(Boolean).join(" ")}
    >
      {children}
    </HostlyCard>
  );
}

export function ConfigBtnPrimary({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return <HostlyButton variant="primary" className={className} {...rest}>{children}</HostlyButton>;
}

export function ConfigBtnSecondary({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return <HostlyButton variant="secondary" className={className} {...rest}>{children}</HostlyButton>;
}

/** Destructivo discreto (ajustes, no alarmismo). */
export function ConfigBtnDanger({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return <HostlyButton variant="destructive" className={className} {...rest}>{children}</HostlyButton>;
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
  visualVariant,
}: ConfigCartaWorkbenchProps) {
  const isProductosVariant = visualVariant === "productos";

  return (
    <ModulePageShell
      title={title}
      subtitle={description}
      maxWidth={1280}
      compactLayout
      operationalFocus
      denseWorkbench
      denseInventoryHeader
      headerActionsPlacement={isProductosVariant ? "right" : "below"}
      lockViewport={lockViewport}
      lockViewportFillParent={lockViewportFillParent}
      fitLaptopViewport={fitLaptopViewport}
      shellSurface="configLight"
      hideBackLink
      hideLogoutButton
      hideLanguageSwitcher
      headerRight={
        headerActions ? (
          <div
            className={[
              "hostly-carta-config-header-actions",
              isProductosVariant ? "hostly-carta-config-header-actions--productos" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {headerActions}
          </div>
        ) : undefined
      }
    >
      <div
        className={[
          "hostly-carta-config-stack",
          isProductosVariant ? "hostly-carta-config-stack--productos" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </ModulePageShell>
  );
}
