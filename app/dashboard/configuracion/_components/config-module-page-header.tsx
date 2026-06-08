"use client";

import type { ReactNode } from "react";
import { HostlyBackButton } from "@/components/hostly/back-button";

type ConfigModulePageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Línea superior opcional (p. ej. «Operación · Configuración»). */
  eyebrow?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * Cabecera compacta de módulos Configuración: salida táctil al Dashboard integrada
 * en la misma fila que el título (sin línea extra de breadcrumb).
 */
export function ConfigModulePageHeader({
  title,
  description,
  eyebrow,
  children,
  className = "",
}: ConfigModulePageHeaderProps) {
  return (
    <header
      className={[
        "hostly-config-module-header mx-auto mb-6 w-full max-w-[var(--hostly-config-content-max)] sm:mb-7",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="hostly-config-module-header__title-row">
        <HostlyBackButton
          href="/dashboard"
          label="Dashboard"
          ariaLabel="Volver al dashboard"
          tone="light"
          moduleChrome
        />
        <div className="hostly-config-module-header__title-block min-w-0">
          {eyebrow ? (
            <p className="hostly-config-module-header__eyebrow">{eyebrow}</p>
          ) : null}
          <h1 className="hostly-config-module-header__title">{title}</h1>
        </div>
      </div>
      {description ? (
        <p className="hostly-config-module-header__description">{description}</p>
      ) : null}
      {children}
    </header>
  );
}
