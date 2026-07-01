"use client";

import type { ReactNode } from "react";

type ConfigModulePageHeaderProps = {
  /** Omitir si el context selector ya indica la sección (Configuration Compact Layout). */
  title?: ReactNode;
  description?: ReactNode;
  /** @deprecated El contexto vive en el selector superior. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * Cabecera compacta de módulos Configuración.
 * Configuration Compact Layout: breadcrumb → acciones útiles → contenido.
 */
export function ConfigModulePageHeader({
  title,
  description,
  actions,
  secondaryActions,
  children,
  className = "",
}: ConfigModulePageHeaderProps) {
  const hasTitle = title != null && title !== "";
  const hasDescription = description != null && description !== "";
  const hasActions = Boolean(actions || secondaryActions);
  const hasBody = hasTitle || hasDescription || hasActions || children;

  if (!hasBody) return null;

  const actionsOnly = !hasTitle && !hasDescription && !children && hasActions;

  return (
    <header
      className={[
        "hostly-config-module-header hostly-config-module-header--compact mx-auto w-full max-w-[var(--hostly-config-content-max)]",
        actionsOnly ? "hostly-config-module-header--actions-only" : "",
        !hasTitle && !hasDescription ? "hostly-config-module-header--no-title" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasTitle ? (
        <div className="hostly-config-module-header__title-row">
          <div className="hostly-config-module-header__title-block min-w-0">
            <h1 className="hostly-config-module-header__title">{title}</h1>
          </div>
        </div>
      ) : null}
      {hasDescription ? (
        <p className="hostly-config-module-header__description">{description}</p>
      ) : null}
      {hasActions ? (
        <div className="hostly-config-module-header__actions">
          <div className="hostly-config-module-header__actions-primary">
            {actions}
          </div>
          <div className="hostly-config-module-header__actions-secondary">
            {secondaryActions}
          </div>
        </div>
      ) : null}
      {children}
    </header>
  );
}
