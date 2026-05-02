"use client";

import type { ReactNode } from "react";

export type HostlyPageContainerProps = {
  children: ReactNode;
  /** Use wider max width (TPV/workbench). */
  wide?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function HostlyPageContainer({
  children,
  wide,
  className,
  style,
}: HostlyPageContainerProps) {
  const base = wide ? "hostly-container-wide" : "hostly-container";
  return (
    <div className={[base, className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}

