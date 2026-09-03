import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlySegmentedControlProps = {
  children: ReactNode;
  /** Accessible name for the tablist. */
  "aria-label": string;
  className?: string;
  /** Horizontal scroll when tabs overflow (default on mobile dashboards). */
  scrollable?: boolean;
};

export type HostlySegmentedButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-selected"
> & {
  selected: boolean;
};

/**
 * Contenedor unificado para tabs / filtros / segmented controls.
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

/**
 * Opción canónica para controles segmentados Hostly.
 * Conserva semántica de `button` + `role=tab` y el estado seleccionado.
 */
export function HostlySegmentedButton({
  selected,
  className,
  type = "button",
  ...props
}: HostlySegmentedButtonProps) {
  return (
    <button
      {...props}
      type={type}
      role="tab"
      aria-selected={selected}
      className={hostlySegmentTabClassName(className)}
    />
  );
}

export function hostlySegmentTabClassName(extra?: string): string {
  return hostlyCx("hostly-tab hostly-tab--unified", extra);
}

export function hostlySegmentPillClassName(extra?: string): string {
  return hostlyCx("hostly-pill hostly-pill--unified", extra);
}
