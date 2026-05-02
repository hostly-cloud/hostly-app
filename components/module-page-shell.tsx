"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { HostlyBackButton } from "@/components/hostly/back-button";
import { HostlyPageContainer } from "@/components/hostly/page-container";
import { HostlyPageHeader } from "@/components/hostly/page-header";

export type ModulePageShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Ancho máximo del bloque (px). Por defecto 1120. */
  maxWidth?: number;
  /** Acciones alineadas a la derecha del título (p. ej. Recargar). */
  headerRight?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  /** Suma px al padding superior del &lt;main&gt; (más aire bajo el borde de ventana). */
  mainPaddingTopExtraPx?: number;
  /** Menos aire en cabecera y antes del contenido (p. ej. vistas tipo TPV). */
  compactLayout?: boolean;
  /** Cabecera y separación aún más bajas (mesa de trabajo horizontal / listado + panel). */
  denseWorkbench?: boolean;
  /** Ocupa el viewport sin scroll del documento; el contenido hijo debe gestionar scroll interno. */
  lockViewport?: boolean;
  /** Oculta el enlace superior (p. ej. en la raíz `/dashboard`). El selector de idioma se mantiene alineado a la derecha. */
  hideBackLink?: boolean;
  /** Prioriza el bloque operativo: cabecera de módulo más discreta, más aire útil abajo. */
  operationalFocus?: boolean;
  /** Con lockViewport: menos padding y márgenes verticales para caber en portátil horizontal (p. ej. importar carta). */
  fitLaptopViewport?: boolean;
};

const DEFAULT_MAX = 1180;

export default function ModulePageShell({
  title,
  subtitle,
  children,
  maxWidth = DEFAULT_MAX,
  headerRight,
  backHref = "/dashboard",
  backLabel,
  mainPaddingTopExtraPx,
  compactLayout,
  denseWorkbench,
  lockViewport,
  hideBackLink,
  operationalFocus,
  fitLaptopViewport,
}: ModulePageShellProps) {
  const { t } = useI18n();
  const resolvedBack = backLabel ?? t("common.backToDashboard");
  const laptopFit = Boolean(lockViewport && fitLaptopViewport && compactLayout && operationalFocus);
  const pad = laptopFit
    ? "clamp(4px, 0.8vw, 10px)"
    : compactLayout && operationalFocus
      ? "clamp(8px, 1.2vw, 16px)"
      : compactLayout
        ? "clamp(14px, 2.2vw, 26px)"
        : "clamp(24px, 4vw, 40px)";
  const padTop =
    mainPaddingTopExtraPx != null && mainPaddingTopExtraPx > 0
      ? `calc(${pad} + ${mainPaddingTopExtraPx}px)`
      : pad;

  const isWide = maxWidth > DEFAULT_MAX;

  return (
    <main
      style={{
        minHeight: lockViewport ? "100dvh" : "100vh",
        height: lockViewport ? (laptopFit ? "calc(100dvh - 2px)" : "100dvh") : undefined,
        maxHeight: lockViewport ? (laptopFit ? "calc(100dvh - 2px)" : "100dvh") : undefined,
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#f8fafc",
        paddingTop: padTop,
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: pad,
        fontFamily: "Arial, sans-serif",
        overflow: lockViewport ? "hidden" : undefined,
        display: lockViewport ? "flex" : undefined,
        flexDirection: lockViewport ? "column" : undefined,
      }}
    >
      <HostlyPageHeader
        wide={isWide}
        containerStyle={maxWidth !== DEFAULT_MAX ? { maxWidth } : undefined}
        left={
          hideBackLink ? null : (
            <HostlyBackButton href={backHref} label={resolvedBack} ariaLabel={String(resolvedBack)} />
          )
        }
        title={title}
        subtitle={subtitle}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {headerRight}
            <LanguageSwitcher compact={Boolean(compactLayout && operationalFocus)} />
          </div>
        }
        titleStyle={{
          fontSize:
            compactLayout && operationalFocus
              ? "clamp(13px, 1.65vw, 17px)"
              : compactLayout && denseWorkbench
                ? "clamp(18px, 2.3vw, 24px)"
                : compactLayout
                  ? "clamp(20px, 2.8vw, 28px)"
                  : "clamp(28px, 4vw, 42px)",
          fontWeight: compactLayout && operationalFocus ? 600 : 700,
          lineHeight: compactLayout ? (operationalFocus ? 1.08 : 1.12) : 1.15,
          color: compactLayout && operationalFocus ? "#8b9aad" : undefined,
        }}
        subtitleStyle={{
          color: compactLayout && operationalFocus ? "#5c6570" : "#94a3b8",
          fontSize: compactLayout ? (operationalFocus ? 11 : denseWorkbench ? 12 : 13) : 17,
          lineHeight: compactLayout ? (operationalFocus ? 1.32 : denseWorkbench ? 1.3 : 1.35) : 1.45,
          maxWidth: compactLayout ? (operationalFocus ? 440 : denseWorkbench ? 520 : 560) : 640,
        }}
      />

      <HostlyPageContainer
        wide={isWide}
        style={{
          ...(maxWidth !== DEFAULT_MAX ? { maxWidth } : null),
          marginTop: laptopFit ? 10 : compactLayout ? (operationalFocus ? 10 : denseWorkbench ? 14 : 16) : 24,
          flexGrow: lockViewport ? 1 : undefined,
          flexShrink: lockViewport ? 1 : undefined,
          flexBasis: lockViewport ? 0 : undefined,
          minHeight: lockViewport ? 0 : undefined,
          overflow: lockViewport ? "hidden" : undefined,
          display: lockViewport ? "flex" : undefined,
          flexDirection: lockViewport ? "column" : undefined,
        }}
      >
        {children}
      </HostlyPageContainer>
    </main>
  );
}
