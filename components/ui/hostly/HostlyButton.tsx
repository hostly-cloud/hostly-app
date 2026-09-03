import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "icon"
  | "tableAction"
  | "drawerAction"
  | "tool"
  | "chip";

export type HostlyButtonSize = "default" | "compact" | "touch";

export type HostlyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HostlyButtonVariant;
  size?: HostlyButtonSize;
  icon?: ReactNode;
  iconOnlyLabel?: string;
  active?: boolean;
};

const VARIANT_CLASS: Record<HostlyButtonVariant, string> = {
  primary: "hostly-button-primary",
  secondary: "hostly-button-secondary",
  ghost: "hostly-button-ghost",
  destructive: "hostly-button-primary hostly-button-danger",
  icon: "hostly-ds-button--icon",
  tableAction: "hostly-row-actions__btn hostly-row-actions__btn--text",
  drawerAction: "hostly-button-primary",
  tool: "hostly-button-tool",
  chip: "hostly-button-chip",
};

const SIZE_CLASS: Record<HostlyButtonSize, string> = {
  default: "",
  compact: "hostly-button-compact",
  touch: "hostly-button-touch",
};

export function HostlyButton({
  variant = "secondary",
  size = "default",
  icon,
  iconOnlyLabel,
  active,
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
      aria-pressed={active === undefined ? rest["aria-pressed"] : active}
      data-active={active === undefined ? undefined : active ? "true" : "false"}
      className={hostlyCx(
        "hostly-ds-button hostly-type-button",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
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
