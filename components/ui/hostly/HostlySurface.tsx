import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";
import type { HostlySurfaceVariant } from "./hostly-surface-types";

/**
 * Superficie con borde, radio grande y jerarquía de sombras/fondos desde tokens globales.
 * Variantes equivalen a `.hostly-surface-{variant}` en `globals.css`.
 */
const VARIANT_CLASS: Record<HostlySurfaceVariant, string> = {
  flat: "hostly-surface-flat",
  soft: "hostly-surface-soft",
  ice: "hostly-surface-ice",
  elevated: "hostly-surface-elevated",
};

export type HostlySurfaceProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  variant: HostlySurfaceVariant;
  interactive?: boolean;
  children?: ReactNode;
};

export function HostlySurface({
  variant,
  interactive,
  className,
  children,
  ...rest
}: HostlySurfaceProps) {
  return (
    <div
      className={hostlyCx(
        VARIANT_CLASS[variant],
        interactive ? "hostly-surface--interactive" : false,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
