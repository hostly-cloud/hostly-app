import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

export type HostlyStatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "muted";

export type HostlyStatusBadgeProps = {
  children: ReactNode;
  tone?: HostlyStatusBadgeTone;
  dot?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

export function HostlyStatusBadge({
  children,
  tone = "neutral",
  dot = true,
  className,
  title,
  "aria-label": ariaLabel,
}: HostlyStatusBadgeProps) {
  return (
    <span
      role="status"
      title={title}
      aria-label={ariaLabel ?? title}
      className={hostlyCx(
        "hostly-status-badge",
        `hostly-status-badge--${tone}`,
        className,
      )}
    >
      {dot ? <span className="hostly-status-badge__dot" aria-hidden /> : null}
      <span className="hostly-status-badge__label">{children}</span>
    </span>
  );
}
