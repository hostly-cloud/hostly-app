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
  /** En móvil: volver arriba y título debajo (columna izquierda). Excepción legacy (p. ej. Carta TPV). */
  mobileStackLeftColumn?: boolean;
  /** Cabecera unificada de módulos dashboard (`ModulePageShell` + `compactLayout`). */
  dashboardModule?: boolean;
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

function headerClassName(
  isMobileLayout: boolean | undefined,
  compactSpacing: boolean | undefined,
  dashboardModule: boolean | undefined,
  mobileStackLeftColumn?: boolean,
): string {
  return [
    "hostly-page-header",
    isMobileLayout ? "hostly-page-header--mobile" : "",
    isMobileLayout && !mobileStackLeftColumn ? "hostly-mobile-page-header" : "",
    compactSpacing ? "hostly-page-header--compact" : "",
    dashboardModule ? "hostly-page-header--dashboard-module" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function belowClassName(compactSpacing: boolean | undefined, belowStripe: "default" | "ultraCompact"): string {
  return [
    "hostly-module-header-below",
    compactSpacing
      ? belowStripe === "ultraCompact"
        ? "hostly-module-header-below--ultra-compact"
        : "hostly-module-header-below--compact"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function TitleBlock({
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  titleStyle,
  subtitleStyle,
  wrapperClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  titleClassName?: string;
  subtitleClassName?: string;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
  wrapperClassName?: string;
}) {
  if ((title == null || title === "") && subtitle == null) return null;

  return (
    <div className={wrapperClassName}>
      {title != null && title !== "" ? (
        <div className={["hostly-page-title", titleClassName].filter(Boolean).join(" ")} style={titleStyle}>
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
  );
}

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
  dashboardModule,
  titleClassName,
  subtitleClassName,
  titleStyle,
  subtitleStyle,
  surfaceStyle,
  belowStripe = "default",
}: HostlyPageHeaderProps) {
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

  if (isMobileLayout && !mobileStackLeftColumn) {
    return (
      <header className={headerClassName(isMobileLayout, compactSpacing, dashboardModule, mobileStackLeftColumn)} style={surfaceStyle}>
        <HostlyPageContainer wide={wide} style={containerStyle}>
          <div className="hostly-mobile-page-header-inner">
            {left || right ? (
              <div className="hostly-mobile-page-header-top">
                {left ? <div className="hostly-mobile-page-header-nav">{left}</div> : null}
                {right ? <div className="hostly-mobile-page-actions">{right}</div> : null}
              </div>
            ) : null}
            <TitleBlock
              title={title}
              subtitle={subtitle}
              titleClassName={titleClassName}
              subtitleClassName={subtitleClassName}
              titleStyle={titleStyle}
              subtitleStyle={subtitleStyle}
              wrapperClassName="hostly-mobile-page-title-block"
            />
            {below ? (
              <div className={belowClassName(compactSpacing, belowStripe)}>{below}</div>
            ) : null}
          </div>
        </HostlyPageContainer>
      </header>
    );
  }

  const rowGap = compactSpacing ? (isMobileLayout && mobileStackLeftColumn ? 6 : isMobileLayout ? 5 : 6) : isMobileLayout && mobileStackLeftColumn ? 10 : isMobileLayout ? 8 : 12;
  const leftColGap = compactSpacing ? 6 : 10;
  const rightMarginLeft = compactSpacing ? 6 : 12;

  return (
    <header className={headerClassName(isMobileLayout, compactSpacing, dashboardModule, mobileStackLeftColumn)} style={surfaceStyle}>
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
              <TitleBlock
                title={title}
                subtitle={subtitle}
                titleClassName={titleClassName}
                subtitleClassName={subtitleClassName}
                titleStyle={titleStyle}
                subtitleStyle={subtitleStyle}
              />
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
              className={belowClassName(compactSpacing, belowStripe)}
              style={
                compactSpacing
                  ? undefined
                  : {
                      marginTop: belowMarginTop,
                      paddingTop: belowPaddingTop,
                      borderTop: "1px solid rgba(148, 163, 184, 0.16)",
                    }
              }
            >
              {below}
            </div>
          ) : null}
        </div>
      </HostlyPageContainer>
    </header>
  );
}
