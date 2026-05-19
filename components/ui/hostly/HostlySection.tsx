import type { ComponentPropsWithoutRef } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlySectionStack = "sm" | "md" | "lg";

const STACK_CLASS: Record<HostlySectionStack, string> = {
  sm: "hostly-stack-sm",
  md: "hostly-stack-md",
  lg: "hostly-stack-lg",
};

export type HostlySectionProps = ComponentPropsWithoutRef<"div"> & {
  /** Column stack rhythm; set `false` to omit (layout via className only). @default "md" */
  stack?: HostlySectionStack | false;
};

export function HostlySection({ stack = "md", className, ...rest }: HostlySectionProps) {
  return (
    <div
      className={hostlyCx(stack !== false ? STACK_CLASS[stack] : false, "min-w-0", className)}
      {...rest}
    />
  );
}
