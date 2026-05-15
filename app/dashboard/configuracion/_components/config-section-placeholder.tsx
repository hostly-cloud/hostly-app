import type { ReactNode } from "react";

type ConfigSectionPlaceholderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

/**
 * Contenedor mínimo para secciones de configuración aún sin vista dedicada.
 * Solo UX; no sustituye tablas ni formularios reales.
 */
export function ConfigSectionPlaceholder({
  title,
  description,
  children,
}: ConfigSectionPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0 px-5 py-8 sm:px-8 lg:px-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            {description}
          </p>
        ) : null}
      </header>
      {children ? (
        <div className="max-w-xl rounded-2xl bg-white/80 px-6 py-8 shadow-sm ring-1 ring-slate-200/80">
          {children}
        </div>
      ) : null}
    </div>
  );
}
