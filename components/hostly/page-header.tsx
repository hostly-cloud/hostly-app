"use client";

import type { ReactNode } from "react";
import { HostlyPageContainer } from "@/components/hostly/page-container";

export type HostlyPageHeaderProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Fila opcional bajo título/derecha: contexto secundario, ancho completo. */
  below?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  wide?: boolean;
  /** Cabecera apilada y sin sticky (p. ej. móvil). */
  isMobileLayout?: boolean;
  /** En móvil: volver arriba y título debajo (columna izquierda). */
  mobileStackLeftColumn?: boolean;
  containerStyle?: React.CSSProperties;
  titleClassName?: string;
  subtitleClassName?: string;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
};

export function HostlyPageHeader({
  title,
  subtitle,
  below,
  left,
  right,
  wide,
  isMobileLayout,
  mobileStackLeftColumn,
  containerStyle,
  titleClassName,
  subtitleClassName,
  titleStyle,
  subtitleStyle,
}: HostlyPageHeaderProps) {
  return (
    <header
      className="hostly-page-header"
      style={
        isMobileLayout
          ? { position: "static", top: "auto", zIndex: "auto", backdropFilter: "none", borderBottom: undefined }
          : undefined
      }
    >
      <HostlyPageContainer wide={wide} style={containerStyle}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            gap: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                isMobileLayout && mobileStackLeftColumn ? "stretch" : isMobileLayout ? "flex-start" : "center",
              justifyContent: isMobileLayout ? "flex-start" : "space-between",
              flexDirection: isMobileLayout ? "column" : "row",
              gap:
                isMobileLayout && mobileStackLeftColumn ? 10 : isMobileLayout ? "0.5rem" : 12,
              width: "100%",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: isMobileLayout && mobileStackLeftColumn ? "stretch" : "center",
                flexDirection: isMobileLayout && mobileStackLeftColumn ? "column" : "row",
                gap: 10,
                minWidth: 0,
                width: isMobileLayout ? "100%" : undefined,
                flex: isMobileLayout ? undefined : "1 1 0%",
              }}
            >
              {left}
              <div style={{ minWidth: 0, flex: isMobileLayout ? undefined : "1 1 0%" }}>
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
            {right ? (
              <div
                style={{
                  flexShrink: 0,
                  alignSelf: isMobileLayout ? "stretch" : undefined,
                  width: isMobileLayout ? "100%" : undefined,
                  marginLeft: isMobileLayout ? undefined : 12,
                }}
              >
                {right}
              </div>
            ) : null}
          </div>
          {below ? (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              {below}
            </div>
          ) : null}
        </div>
      </HostlyPageContainer>
    </header>
  );
}

