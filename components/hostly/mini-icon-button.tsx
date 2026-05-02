"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type HostlyMiniIconButtonProps = {
  children: ReactNode;
  ariaLabel: string;
  title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title">;

export function HostlyMiniIconButton({
  children,
  ariaLabel,
  title,
  style,
  ...props
}: HostlyMiniIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      {...props}
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        border: "1px solid rgba(15,23,42,0.14)",
        background: "rgba(255,255,255,0.65)",
        color: "#0f172a",
        fontWeight: 900,
        lineHeight: 1,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

