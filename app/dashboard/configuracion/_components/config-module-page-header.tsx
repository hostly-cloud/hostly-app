"use client";

import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";

type ConfigModulePageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Línea superior opcional (p. ej. «Operación · Configuración»). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * Cabecera compacta de módulos Configuración V3.
 * El contexto vive en el selector contextual superior; aquí solo destaca la tarea.
 */
export function ConfigModulePageHeader({
  title,
  description,
  actions,
  secondaryActions,
  children,
  className = "",
}: ConfigModulePageHeaderProps) {
  return (
    <header
      className={[
        "hostly-config-module-header mx-auto mb-4 w-full max-w-[var(--hostly-config-content-max)] sm:mb-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="hostly-config-module-header__title-row">
        <div className="hostly-config-module-header__title-block min-w-0">
          <h1 className="hostly-config-module-header__title">{title}</h1>
        </div>
      </div>
      {description ? (
        <p className="hostly-config-module-header__description">{description}</p>
      ) : null}
      <div className="hostly-config-module-header__actions">
        <div className="hostly-config-module-header__actions-primary">
          {actions}
        </div>
        <div className="hostly-config-module-header__actions-secondary">
          {secondaryActions}
          <LanguageSwitcher />
        </div>
      </div>
      {children}
    </header>
  );
}
