"use client";

import type { CSSProperties } from "react";
import type { Locale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

const wrap: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  flexShrink: 0,
};

const btnBase: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(15, 23, 42, 0.6)",
  color: "#e2e8f0",
  padding: "12px 18px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1.15,
  minWidth: 52,
  minHeight: 52,
  boxSizing: "border-box",
};

const btnCompactDark: CSSProperties = {
  ...btnBase,
  padding: "6px 9px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  minWidth: 36,
  minHeight: 36,
  border: "1px solid rgba(71, 85, 105, 0.55)",
  background: "rgba(15, 23, 42, 0.45)",
  color: "#94a3b8",
};

const btnCompactLight: CSSProperties = {
  ...btnBase,
  padding: "6px 9px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  minWidth: 36,
  minHeight: 36,
  border: "1px solid rgba(203, 213, 225, 0.95)",
  background: "rgba(255, 255, 255, 0.85)",
  color: "#64748b",
};

export function LanguageSwitcher({
  className,
  compact,
  surface = "dark",
}: {
  className?: string;
  compact?: boolean;
  /** `light`: botones legibles sobre cabecera clara (Configuración). */
  surface?: "dark" | "light";
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={className} style={{ ...wrap, gap: compact ? 8 : 12 }} role="group" aria-label={t("common.language")}>
      {SUPPORTED_LOCALES.map((code: Locale) => {
        const active = locale === code;
        const base = compact ? (surface === "light" ? btnCompactLight : btnCompactDark) : btnBase;
        const borderColor: string = active
          ? "rgba(56, 189, 248, 0.55)"
          : surface === "light"
            ? "rgba(148, 163, 184, 0.55)"
            : compact
              ? "rgba(71, 85, 105, 0.55)"
              : "rgba(148, 163, 184, 0.45)";
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            style={{
              ...base,
              background: active
                ? surface === "light"
                  ? "rgba(224, 242, 254, 0.95)"
                  : compact
                    ? "rgba(59, 130, 246, 0.22)"
                    : "rgba(59, 130, 246, 0.35)"
                : compact
                  ? surface === "light"
                    ? "rgba(255, 255, 255, 0.75)"
                    : "rgba(15, 23, 42, 0.35)"
                  : "rgba(15, 23, 42, 0.6)",
              borderColor,
              color: active
                ? surface === "light"
                  ? "#0369a1"
                  : compact
                    ? "#e2e8f0"
                    : "#fff"
                : compact
                  ? surface === "light"
                    ? "#475569"
                    : "#7c8a9e"
                  : "#cbd5e1",
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
