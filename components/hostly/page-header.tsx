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
  /** Menos aire entre bloques (p. ej. cabecera TPV /carta). */
  compactSpacing?: boolean;
  titleClassName?: string;
  subtitleClassName?: string;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
  /** Estilo del elemento `<header>` (p. ej. padding vertical reducido en editores a pantalla completa). */
  surfaceStyle?: React.CSSProperties;
  /**
   * Márgenes de la franja opcional (`below`): por defecto hereda de compactSpacing.
   * `ultraCompact`: menos aire antes de los controles (listados tipo inventario / config carta).
   */
  belowStripe?: "default" | "ultraCompact";
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
  compactSpacing,
  titleClassName,
  subtitleClassName,
  titleStyle,
  subtitleStyle,
  surfaceStyle,
  belowStripe = "default",
}: HostlyPageHeaderProps) {
  const rowGap =
    compactSpacing
      ? isMobileLayout && mobileStackLeftColumn
        ? 6
        : isMobileLayout
          ? 5
          : 6
      : isMobileLayout && mobileStackLeftColumn
        ? 10
        : isMobileLayout
          ? 8
          : 12;
  const leftColGap = compactSpacing ? 6 : 10;
  const rightMarginLeft = compactSpacing ? 6 : 12;

  const belowMarginTop =
    below === undefined
      ? undefined
      : compactSpacing
        ? belowStripe === "ultraCompact"
          ? 3
          : 6
        : 18;
  const belowPaddingTop =
    below === undefined
      ? undefined
      : compactSpacing
        ? belowStripe === "ultraCompact"
          ? 5
          : 8
        : 16;

  return (
    <header
      className="hostly-page-header"
      style={
        isMobileLayout
          ? {
              position: "static",
              top: "auto",
              zIndex: "auto",
              backdropFilter: "none",
              borderBottom: undefined,
              ...surfaceStyle,
            }
          : surfaceStyle
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
              gap: rowGap,
              width: "100%",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: isMobileLayout && mobileStackLeftColumn ? "stretch" : "center",
                flexDirection: isMobileLayout && mobileStackLeftColumn ? "column" : "row",
                gap: leftColGap,
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
                  marginLeft: isMobileLayout ? undefined : rightMarginLeft,
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
                marginTop: belowMarginTop,
                paddingTop: belowPaddingTop,
                borderTop: compactSpacing
                  ? belowStripe === "ultraCompact"
                    ? "1px solid rgba(148, 163, 184, 0.08)"
                    : "1px solid rgba(148, 163, 184, 0.1)"
                  : "1px solid rgba(148, 163, 184, 0.16)",
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

