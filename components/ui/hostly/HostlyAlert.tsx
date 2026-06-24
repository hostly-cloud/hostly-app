import type { HTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyAlertTone = "success" | "warning" | "danger" | "info" | "neutral";

export type HostlyAlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: HostlyAlertTone;
  title?: ReactNode;
};

export function HostlyAlert({
  tone = "neutral",
  title,
  className,
  children,
  role,
  ...rest
}: HostlyAlertProps) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={hostlyCx("hostly-ds-alert", `hostly-ds-alert--${tone}`, className)}
      {...rest}
    >
      {title ? <div className="hostly-ds-alert__title">{title}</div> : null}
      <div className="hostly-ds-alert__content">{children}</div>
    </div>
  );
}
