import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

export type HostlyRowActionsProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
  compact?: boolean;
};

export function HostlyRowActions({
  children,
  className,
  align = "end",
  compact = true,
}: HostlyRowActionsProps) {
  return (
    <div
      className={hostlyCx(
        "hostly-row-actions",
        compact && "hostly-row-actions--compact",
        align === "start" && "hostly-row-actions--start",
        align === "center" && "hostly-row-actions--center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type HostlyRowActionTone = "default" | "primary" | "success" | "warning" | "danger";

export type HostlyRowActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "icon" | "text";
  tone?: HostlyRowActionTone;
};

export function HostlyRowActionButton({
  variant = "text",
  tone = "default",
  className,
  type = "button",
  ...rest
}: HostlyRowActionButtonProps) {
  return (
    <button
      type={type}
      className={hostlyCx(
        "hostly-row-actions__btn",
        variant === "icon" && "hostly-row-actions__btn--icon",
        variant === "text" && "hostly-row-actions__btn--text",
        tone !== "default" && `hostly-row-actions__btn--${tone}`,
        className,
      )}
      {...rest}
    />
  );
}
