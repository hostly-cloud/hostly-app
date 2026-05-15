import type { ReactNode } from "react";

type ConfigCartaWorkbenchProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

const cardBaseClass =
  "rounded-[var(--hostly-config-radius)] border border-[var(--hostly-config-card-border)] bg-white shadow-[var(--hostly-config-card-shadow)]";

const btnHeightClass = "h-8 min-h-8 px-3.5 text-xs font-medium";

/** Tarjeta / panel estándar en Carta · Configuración (papel fino, sin glass fuerte). */
export function ConfigCard({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** Sin padding exterior (p. ej. tablas edge-to-edge). */
  flush?: boolean;
}) {
  return (
    <div
      className={`${cardBaseClass} ${flush ? "overflow-hidden" : "p-4 sm:p-5"} ${className}`.trim()}
    >
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
      className={`inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] bg-sky-700 ${btnHeightClass} text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
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
      className={`inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-slate-200 bg-white ${btnHeightClass} text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
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
      className={`inline-flex items-center justify-center rounded-[var(--hostly-config-radius)] border border-red-200/90 bg-red-50/90 ${btnHeightClass} text-red-900/90 shadow-sm transition hover:bg-red-100/90 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Marco visual unificado para secciones Carta en Configuración (ritmo tipo Shopify Admin).
 */
export function ConfigCartaWorkbench({
  eyebrow = "Carta · Configuración",
  title,
  description,
  children,
}: ConfigCartaWorkbenchProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <header className="mx-auto mb-6 w-full max-w-[var(--hostly-config-content-max)] sm:mb-7">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-normal leading-relaxed text-slate-500">
          {description}
        </p>
      </header>
      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-1 flex-col gap-6 min-h-0">
        {children}
      </div>
    </div>
  );
}
