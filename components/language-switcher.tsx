"use client";

import type { CSSProperties } from "react";
import type { Locale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

const wrap: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const btnBase: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.45)",
  background: "rgba(15, 23, 42, 0.6)",
  color: "#e2e8f0",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
  minWidth: 36,
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={className} style={wrap} role="group" aria-label={t("common.language")}>
      {SUPPORTED_LOCALES.map((code: Locale) => {
        const active = locale === code;
        const borderColor: string = active ? "rgba(96, 165, 250, 0.65)" : "rgba(148, 163, 184, 0.45)";
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            style={{
              ...btnBase,
              background: active ? "rgba(59, 130, 246, 0.35)" : "rgba(15, 23, 42, 0.6)",
              borderColor,
              color: active ? "#fff" : "#cbd5e1",
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
