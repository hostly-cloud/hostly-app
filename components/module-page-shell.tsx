"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
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
  /** Segunda franja bajo título/subtítulo: contexto o controles a ancho completo. */
  headerBelow?: ReactNode;
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
  /** Con lockViewport: altura 100% del contenedor en lugar de 100dvh (p. ej. bajo franja de navegación). */
  lockViewportFillParent?: boolean;
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
  headerBelow,
  backHref = "/dashboard",
  backLabel,
  mainPaddingTopExtraPx,
  compactLayout,
  denseWorkbench,
  lockViewport,
  lockViewportFillParent,
  hideBackLink,
  operationalFocus,
  fitLaptopViewport,
}: ModulePageShellProps) {
  const { t } = useI18n();
  const [isMobile, setIsMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const resolvedBack = backLabel ?? t("common.backToDashboard");
  const effectiveLockViewport = Boolean(lockViewport && !isMobile);
  const laptopFit = Boolean(effectiveLockViewport && fitLaptopViewport && compactLayout && operationalFocus);
  const lockFill = Boolean(effectiveLockViewport && lockViewportFillParent);
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
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#f8fafc",
        paddingTop: padTop,
        paddingLeft: 0,
        paddingRight: 0,
        fontFamily: "Arial, sans-serif",
        ...(isMobile
          ? {
              minHeight: "100dvh",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "6rem",
            }
          : {
              paddingBottom: pad,
              minHeight: effectiveLockViewport ? (lockFill ? 0 : "100dvh") : "100vh",
              height: effectiveLockViewport
                ? lockFill
                  ? laptopFit
                    ? "calc(100% - 2px)"
                    : "100%"
                  : laptopFit
                    ? "calc(100dvh - 2px)"
                    : "100dvh"
                : undefined,
              maxHeight: effectiveLockViewport
                ? lockFill
                  ? laptopFit
                    ? "calc(100% - 2px)"
                    : "100%"
                  : laptopFit
                    ? "calc(100dvh - 2px)"
                    : "100dvh"
                : undefined,
              overflow: effectiveLockViewport ? "hidden" : undefined,
              display: effectiveLockViewport ? "flex" : undefined,
              flexDirection: effectiveLockViewport ? "column" : undefined,
            }),
      }}
    >
      <HostlyPageHeader
        wide={isWide}
        isMobileLayout={isMobile}
        containerStyle={maxWidth !== DEFAULT_MAX ? { maxWidth } : undefined}
        left={
          hideBackLink ? null : (
            <HostlyBackButton href={backHref} label={resolvedBack} ariaLabel={String(resolvedBack)} />
          )
        }
        title={title}
        subtitle={subtitle}
        below={headerBelow}
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
          ...(isMobile
            ? {}
            : {
                flexGrow: effectiveLockViewport ? 1 : undefined,
                flexShrink: effectiveLockViewport ? 1 : undefined,
                flexBasis: effectiveLockViewport ? 0 : undefined,
                minHeight: effectiveLockViewport ? 0 : undefined,
                overflow: effectiveLockViewport ? "hidden" : undefined,
                display: effectiveLockViewport ? "flex" : undefined,
                flexDirection: effectiveLockViewport ? "column" : undefined,
              }),
        }}
      >
        {children}
      </HostlyPageContainer>
    </main>
  );
}
