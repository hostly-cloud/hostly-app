"use client";

import type { ReactNode } from "react";
import { HostlyPageContainer } from "@/components/hostly/page-container";

export type HostlyPageHeaderProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  wide?: boolean;
  containerStyle?: React.CSSProperties;
  titleClassName?: string;
  subtitleClassName?: string;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
};

export function HostlyPageHeader({
  title,
  subtitle,
  left,
  right,
  wide,
  containerStyle,
  titleClassName,
  subtitleClassName,
  titleStyle,
  subtitleStyle,
}: HostlyPageHeaderProps) {
  return (
    <header className="hostly-page-header">
      <HostlyPageContainer wide={wide} style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {left}
            <div style={{ minWidth: 0 }}>
              {title != null && title !== "" ? (
                <div
                  className={["hostly-page-title", titleClassName].filter(Boolean).join(" ")}
                  style={titleStyle}
                >
                  {title}
                </div>
              ) : null}
              {subtitle != null ? (
                <div
                  className={["hostly-page-subtitle", subtitleClassName].filter(Boolean).join(" ")}
                  style={subtitleStyle}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
        </div>
      </HostlyPageContainer>
    </header>
  );
}

