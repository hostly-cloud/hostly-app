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
}: ModulePageShellProps) {
  const { t } = useI18n();
  const resolvedBack = backLabel ?? t("common.backToDashboard");

  return (
    <main
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#f8fafc",
        padding: "clamp(24px, 4vw, 40px)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth, margin: "0 auto", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={backHref}
            style={{
              color: "#60a5fa",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: 17,
              display: "inline-block",
            }}
          >
            {resolvedBack}
          </Link>
          <LanguageSwitcher />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            marginTop: 22,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <h1
              style={{
                fontSize: "clamp(28px, 4vw, 42px)",
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {title}
            </h1>
            {subtitle != null ? (
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: 17,
                  marginTop: 10,
                  marginBottom: 0,
                  lineHeight: 1.45,
                  maxWidth: 640,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {headerRight ? <div style={{ flexShrink: 0 }}>{headerRight}</div> : null}
        </div>

        <div style={{ marginTop: 28 }}>{children}</div>
      </div>
    </main>
  );
}
