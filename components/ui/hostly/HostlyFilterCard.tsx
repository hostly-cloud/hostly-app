import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyFilterCardTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export type HostlyFilterCardProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  label: ReactNode;
  value?: ReactNode;
  active?: boolean;
  tone?: HostlyFilterCardTone;
};

/**
 * Filtro rectangular para métricas y opciones compactas.
 * El color comunica estado mediante un marcador mínimo; la selección usa azul Hostly.
 */
export function HostlyFilterCard({
  label,
  value,
  active = false,
  tone = "neutral",
  className,
  type = "button",
  ...rest
}: HostlyFilterCardProps) {
  const metric = value !== undefined && value !== null;

  return (
    <button
      type={type}
      className={hostlyCx(
        "hostly-filter-card hostly-type-button",
        metric ? "hostly-filter-card--metric" : "hostly-filter-card--choice",
        active && "is-active",
        className,
      )}
      data-tone={tone}
      aria-pressed={rest["aria-pressed"] ?? active}
      {...rest}
    >
      <span className="hostly-filter-card__label">
        <span className="hostly-filter-card__marker" aria-hidden />
        <span className="hostly-filter-card__label-text">{label}</span>
      </span>
      {metric ? <span className="hostly-filter-card__value">{value}</span> : null}
    </button>
  );
}
