import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "icon"
  | "tableAction"
  | "drawerAction";

export type HostlyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HostlyButtonVariant;
  icon?: ReactNode;
  iconOnlyLabel?: string;
};

const VARIANT_CLASS: Record<HostlyButtonVariant, string> = {
  primary: "hostly-button-primary",
  secondary: "hostly-button-secondary",
  ghost: "hostly-button-ghost",
  destructive: "hostly-button-primary hostly-button-danger",
  icon: "hostly-ds-button--icon",
  tableAction: "hostly-row-actions__btn hostly-row-actions__btn--text",
  drawerAction: "hostly-button-primary",
};

export function HostlyButton({
  variant = "secondary",
  icon,
  iconOnlyLabel,
  className,
  type = "button",
  children,
  ...rest
}: HostlyButtonProps) {
  const iconOnly = variant === "icon";

  return (
    <button
      type={type}
      aria-label={iconOnly ? iconOnlyLabel ?? rest["aria-label"] : rest["aria-label"]}
      className={hostlyCx(
        "hostly-ds-button hostly-type-button",
        VARIANT_CLASS[variant],
        variant === "drawerAction" && "hostly-ds-button--drawer",
        className,
      )}
      {...rest}
    >
      {icon ? <span className="hostly-ds-button__icon" aria-hidden>{icon}</span> : null}
      {children}
    </button>
  );
}
