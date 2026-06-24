"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { HostlyButton } from "@/components/ui/hostly";

export type HostlyMiniIconButtonProps = {
  children: ReactNode;
  ariaLabel: string;
  title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title">;

export function HostlyMiniIconButton({
  children,
  ariaLabel,
  title,
  ...props
}: HostlyMiniIconButtonProps) {
  return (
    <HostlyButton
      variant="icon"
      iconOnlyLabel={ariaLabel}
      title={title}
      {...props}
    >
      {children}
    </HostlyButton>
  );
}

