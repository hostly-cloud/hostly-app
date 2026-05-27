import type { ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlySegmentedControlProps = {
  children: ReactNode;
  /** Accessible name for the tablist. */
  "aria-label": string;
  className?: string;
  /** Horizontal scroll when tabs overflow (default on mobile dashboards). */
  scrollable?: boolean;
};

/**
 * Contenedor unificado para tabs / filtros / segmented controls.
 * Solo presentación — los hijos siguen siendo `button`, `a` o `Link` con `hostly-tab`.
 */
export function HostlySegmentedControl({
  children,
  "aria-label": ariaLabel,
  className,
  scrollable = true,
}: HostlySegmentedControlProps) {
  return (
    <div className={hostlyCx(scrollable && "hostly-segmented-scroll", className)}>
      <div role="tablist" aria-label={ariaLabel} className="hostly-segmented hostly-segmented--unified">
        {children}
      </div>
    </div>
  );
}

export function hostlySegmentTabClassName(extra?: string): string {
  return hostlyCx("hostly-tab hostly-tab--unified", extra);
}

export function hostlySegmentPillClassName(extra?: string): string {
  return hostlyCx("hostly-pill hostly-pill--unified", extra);
}
