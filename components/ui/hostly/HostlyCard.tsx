import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyCardFamily = "operation" | "configuration" | "kpi" | "action";

export type HostlyCardProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  family?: HostlyCardFamily;
  children?: ReactNode;
};

export function HostlyCard({
  family = "operation",
  className,
  children,
  ...rest
}: HostlyCardProps) {
  return (
    <div
      className={hostlyCx("hostly-ds-card", `hostly-ds-card--${family}`, className)}
      {...rest}
    >
      {children}
    </div>
  );
}
