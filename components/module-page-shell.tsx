"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

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
  /** Ocupa el viewport sin scroll del documento; el contenido hijo debe gestionar scroll interno. */
  lockViewport?: boolean;
  /** Oculta el enlace superior (p. ej. en la raíz `/dashboard`). El selector de idioma se mantiene alineado a la derecha. */
  hideBackLink?: boolean;
};

const DEFAULT_MAX = 1120;

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
  lockViewport,
  hideBackLink,
}: ModulePageShellProps) {
  const { t } = useI18n();
  const resolvedBack = backLabel ?? t("common.backToDashboard");
  const pad = compactLayout ? "clamp(14px, 2.2vw, 26px)" : "clamp(24px, 4vw, 40px)";
  const padTop =
    mainPaddingTopExtraPx != null && mainPaddingTopExtraPx > 0
      ? `calc(${pad} + ${mainPaddingTopExtraPx}px)`
      : pad;

  return (
    <main
      style={{
        minHeight: lockViewport ? "100dvh" : "100vh",
        height: lockViewport ? "100dvh" : undefined,
        maxHeight: lockViewport ? "100dvh" : undefined,
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#f8fafc",
        paddingTop: padTop,
        paddingLeft: pad,
        paddingRight: pad,
        paddingBottom: pad,
        fontFamily: "Arial, sans-serif",
        overflow: lockViewport ? "hidden" : undefined,
        display: lockViewport ? "flex" : undefined,
        flexDirection: lockViewport ? "column" : undefined,
      }}
    >
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          width: "100%",
          flex: lockViewport ? 1 : undefined,
          minHeight: lockViewport ? 0 : undefined,
          display: lockViewport ? "flex" : undefined,
          flexDirection: lockViewport ? "column" : undefined,
          overflow: lockViewport ? "hidden" : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: hideBackLink ? "flex-end" : "space-between",
            gap: 12,
            flexWrap: "wrap",
            flexShrink: lockViewport ? 0 : undefined,
            width: "100%",
          }}
        >
          {hideBackLink ? null : (
            <Link
              href={backHref}
              style={{
                color: "#60a5fa",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: compactLayout ? 14 : 17,
                display: "inline-block",
                lineHeight: compactLayout ? 1.2 : undefined,
              }}
            >
              {resolvedBack}
            </Link>
          )}
          <LanguageSwitcher />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: compactLayout ? 12 : 20,
            marginTop: compactLayout ? 8 : 22,
            flexWrap: "wrap",
            flexShrink: lockViewport ? 0 : undefined,
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <h1
              style={{
                fontSize: compactLayout ? "clamp(20px, 2.8vw, 28px)" : "clamp(28px, 4vw, 42px)",
                fontWeight: 700,
                margin: 0,
                lineHeight: compactLayout ? 1.12 : 1.15,
              }}
            >
              {title}
            </h1>
            {subtitle != null ? (
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: compactLayout ? 13 : 17,
                  marginTop: compactLayout ? 4 : 10,
                  marginBottom: 0,
                  lineHeight: compactLayout ? 1.35 : 1.45,
                  maxWidth: compactLayout ? 560 : 640,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {headerRight ? <div style={{ flexShrink: 0, alignSelf: compactLayout ? "center" : undefined }}>{headerRight}</div> : null}
        </div>

        <div
          style={{
            marginTop: compactLayout ? 14 : 28,
            flex: lockViewport ? 1 : undefined,
            minHeight: lockViewport ? 0 : undefined,
            overflow: lockViewport ? "hidden" : undefined,
            display: lockViewport ? "flex" : undefined,
            flexDirection: lockViewport ? "column" : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
