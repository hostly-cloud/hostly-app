import type { CSSProperties, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";
import type { HostlySurfaceVariant } from "./hostly-surface-types";
import { HostlySurface } from "./HostlySurface";

export type HostlyKpiCardProps = {
  title: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  icon?: ReactNode;
  /** Surface style; @default "ice" */
  variant?: HostlySurfaceVariant;
  /** Optional top accent bar (e.g. KPI tone). */
  accentColor?: string;
  className?: string;
  valueClassName?: string;
  /** Native tooltip on the value row. */
  valueTitle?: string;
  style?: CSSProperties;
};

export function HostlyKpiCard({
  title,
  value,
  helper,
  icon,
  variant = "ice",
  accentColor,
  className,
  valueClassName,
  valueTitle,
  style,
}: HostlyKpiCardProps) {
  const mergedStyle: CSSProperties | undefined =
    accentColor != null ? { ...style, borderTop: `2px solid ${accentColor}` } : style;

  return (
    <HostlySurface variant={variant} className={hostlyCx("hostly-kpi-card min-w-0", className)} style={mergedStyle}>
      <div className="flex items-start justify-between gap-[var(--hostly-stack-gap-sm)]">
        <span className="hostly-kpi-label min-w-0">{title}</span>
        {icon ? (
          <span className="hostly-kpi-icon pointer-events-none shrink-0 text-[var(--hostly-ink-soft)]">
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={hostlyCx(
          "hostly-kpi-value hostly-type-kpi-value overflow-hidden text-ellipsis whitespace-nowrap",
          valueClassName,
        )}
        title={valueTitle}
      >
        {value}
      </div>
      {helper != null ? (
        <div className="hostly-kpi-helper line-clamp-2 font-medium">{helper}</div>
      ) : null}
    </HostlySurface>
  );
}
