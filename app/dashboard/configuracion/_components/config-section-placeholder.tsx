import type { ReactNode } from "react";

type ConfigSectionPlaceholderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

/**
 * Contenedor mínimo para secciones de configuración aún sin vista dedicada.
 * Configuration Compact Layout: sin cabecera duplicada.
 */
export function ConfigSectionPlaceholder({
  title: _title,
  description,
  children,
}: ConfigSectionPlaceholderProps) {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-auto">
      {description ? (
        <p className="hostly-config-page-body__lead mx-auto w-full max-w-xl text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mx-auto mt-4 max-w-xl rounded-2xl bg-white/80 px-6 py-8 shadow-sm ring-1 ring-slate-200/80">
          {children}
        </div>
      ) : null}
    </div>
  );
}
