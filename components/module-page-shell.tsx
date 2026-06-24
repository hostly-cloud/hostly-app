"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoutButton } from "@/components/auth/logout-button";
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
  /** Contenedor principal casi a ancho completo (editor canvas); prioridad sobre maxWidth numérico. */
  stretchContentWidth?: boolean;
  /** Editor de mapa en configuración: menos padding/márgenes para maximizar lienzo. */
  mapEditorDenseChrome?: boolean;
  /** Shell claro alineado con Configuración (gradiente global visible; cabecera tipo glass). */
  shellSurface?: "default" | "configLight";
  /** Oculta logout en herramientas inmersivas donde ya existe navegación global. */
  hideLogoutButton?: boolean;
  /** Listado inventario/config carta: cabecera y franja bajo-título más bajos (solo presentación). */
  denseInventoryHeader?: boolean;
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
  stretchContentWidth,
  mapEditorDenseChrome,
  shellSurface = "default",
  hideLogoutButton,
  denseInventoryHeader,
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
  const effectiveLockViewport = Boolean(lockViewport && (!isMobile || lockViewportFillParent));
  const laptopFit = Boolean(effectiveLockViewport && fitLaptopViewport && compactLayout && operationalFocus);
  const lockFill = Boolean(effectiveLockViewport && lockViewportFillParent);
  const pad =
    mapEditorDenseChrome && laptopFit && stretchContentWidth
      ? "clamp(0px, 0.12vw, 3px)"
      : laptopFit && stretchContentWidth
      ? "clamp(2px, 0.45vw, 8px)"
      : laptopFit
        ? "clamp(4px, 0.8vw, 10px)"
        : compactLayout && operationalFocus
          ? denseWorkbench
            ? "clamp(6px, 1vw, 12px)"
            : "clamp(8px, 1.2vw, 16px)"
          : compactLayout
            ? "clamp(14px, 2.2vw, 26px)"
            : "clamp(24px, 4vw, 40px)";
  const padTop =
    mainPaddingTopExtraPx != null && mainPaddingTopExtraPx > 0
      ? `calc(${pad} + ${mainPaddingTopExtraPx}px)`
      : pad;

  const isWide = maxWidth > DEFAULT_MAX || Boolean(stretchContentWidth);
  const configLight = shellSurface === "configLight";
  const dashboardModuleChrome = Boolean(compactLayout);
  const effectiveDenseInventory = Boolean(
    denseInventoryHeader && compactLayout && operationalFocus && denseWorkbench && headerBelow && shellSurface === "configLight",
  );

  const headerSurface =
    dashboardModuleChrome && !mapEditorDenseChrome
      ? undefined
      : mapEditorDenseChrome && laptopFit
      ? {
          paddingTop: 2,
          paddingBottom: 2,
          borderBottom: "1px solid var(--hostly-line)",
        }
      : {
          paddingTop:
            effectiveDenseInventory && !laptopFit
              ? 5
              : denseWorkbench
                ? 6
                : 10,
          paddingBottom:
            effectiveDenseInventory && !laptopFit
              ? 5
              : denseWorkbench
                ? 6
                : 10,
          borderBottom: "1px solid var(--hostly-line)",
          background: "rgba(247, 252, 255, 0.92)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        };

  const titleStyleResolved = {
    fontSize: laptopFit
      ? configLight && mapEditorDenseChrome
        ? "clamp(11px, 1.12vw, 13px)"
        : "clamp(11px, 1.25vw, 14px)"
      : compactLayout && operationalFocus && effectiveDenseInventory && !laptopFit
        ? "clamp(15px, 1.85vw, 19px)"
        : compactLayout && operationalFocus
          ? "clamp(13px, 1.65vw, 17px)"
          : compactLayout && denseWorkbench
            ? "clamp(18px, 2.3vw, 24px)"
            : compactLayout
              ? "clamp(20px, 2.8vw, 28px)"
              : "clamp(28px, 4vw, 42px)",
    fontWeight: laptopFit
      ? configLight && mapEditorDenseChrome
        ? 500
        : 600
      : compactLayout && operationalFocus
        ? effectiveDenseInventory
          ? 650
          : 600
        : 700,
    lineHeight:
      compactLayout && operationalFocus ? (effectiveDenseInventory ? 1.06 : 1.08) : compactLayout ? 1.12 : 1.15,
    letterSpacing: compactLayout ? (operationalFocus ? "-0.012em" : "-0.015em") : "-0.018em",
    color: "var(--hostly-ink-strong)",
  };

  const subtitleStyleResolved = {
    color: "var(--hostly-ink-soft)",
    fontSize: compactLayout
      ? operationalFocus
        ? effectiveDenseInventory
          ? 10
          : 11
        : denseWorkbench
          ? 12
          : 13
      : 17,
    lineHeight: compactLayout
      ? operationalFocus
        ? effectiveDenseInventory
          ? 1.28
          : 1.32
        : denseWorkbench
          ? 1.3
          : 1.35
      : 1.45,
    maxWidth: compactLayout ? (operationalFocus ? (effectiveDenseInventory ? 460 : 480) : denseWorkbench ? 520 : 560) : 640,
  };

  const moduleTitleClassName = [
    isMobile ? "hostly-page-title--module-mobile" : null,
    !isMobile && dashboardModuleChrome ? "hostly-page-title--dashboard-module" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const moduleSubtitleClassName = [
    isMobile ? "hostly-page-subtitle--module-mobile" : null,
    !isMobile && dashboardModuleChrome ? "hostly-page-subtitle--dashboard-module" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={[
        "hostly-module-shell",
        isMobile ? "hostly-module-shell--mobile" : "",
        isMobile && effectiveDenseInventory ? "hostly-mobile-operational-layout" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        boxSizing: "border-box",
        background:
          "linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-surface-page) 46%, #dbeefa 100%)",
        color: "var(--hostly-ink)",
        paddingTop: padTop,
        paddingLeft: 0,
        paddingRight: 0,
        ...(isMobile
          ? effectiveLockViewport && lockFill
            ? {
                flex: "1 1 0",
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }
            : {}
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
        compactSpacing={dashboardModuleChrome}
        dashboardModule={dashboardModuleChrome}
        containerStyle={
          stretchContentWidth
            ? {
                maxWidth: "100%",
                width: "100%",
                paddingLeft: 4,
                paddingRight: 4,
                boxSizing: "border-box",
              }
            : maxWidth !== DEFAULT_MAX
              ? { maxWidth }
              : undefined
        }
        surfaceStyle={headerSurface}
        titleClassName={moduleTitleClassName || undefined}
        subtitleClassName={moduleSubtitleClassName || undefined}
        left={
          hideBackLink ? null : (
            <HostlyBackButton
              href={backHref}
              label={resolvedBack}
              ariaLabel={String(resolvedBack)}
              tone="light"
              moduleChrome={dashboardModuleChrome}
            />
          )
        }
        title={title}
        subtitle={subtitle}
        below={headerBelow}
        right={
          <div className="hostly-module-header-actions">
            {headerRight}
            {!hideLogoutButton && hideBackLink && backHref === "/dashboard" ? (
              <LogoutButton
                compact={Boolean(compactLayout && operationalFocus)}
                surface="light"
              />
            ) : null}
            <LanguageSwitcher />
          </div>
        }
        titleStyle={dashboardModuleChrome || isMobile ? undefined : titleStyleResolved}
        subtitleStyle={dashboardModuleChrome || isMobile ? undefined : subtitleStyleResolved}
        belowStripe={effectiveDenseInventory ? "ultraCompact" : "default"}
      />

      <HostlyPageContainer
        wide={isWide}
        className={
          [
            dashboardModuleChrome
              ? isMobile
                ? "hostly-module-content--mobile"
                : "hostly-module-content--dashboard"
              : isMobile
                ? "hostly-module-content--mobile"
                : undefined,
            isMobile && effectiveDenseInventory ? "hostly-mobile-operational-content" : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        style={{
          ...(stretchContentWidth
            ? {
                maxWidth: "100%",
                width: "100%",
                paddingLeft: 4,
                paddingRight: 4,
                boxSizing: "border-box",
              }
            : maxWidth !== DEFAULT_MAX
              ? { maxWidth }
              : null),
          marginTop: dashboardModuleChrome
            ? 0
            : stretchContentWidth
            ? mapEditorDenseChrome
              ? 0
              : 4
            : laptopFit
              ? 8
              : compactLayout
              ? operationalFocus
                ? denseWorkbench
                  ? effectiveDenseInventory
                    ? 4
                    : 5
                  : 7
                : denseWorkbench
                  ? 12
                  : 14
              : 24,
          ...(effectiveLockViewport
            ? {
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }
            : {}),
        }}
      >
        {children}
      </HostlyPageContainer>
    </main>
  );
}
