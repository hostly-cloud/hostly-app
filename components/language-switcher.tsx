"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { LOCALE_META, SUPPORTED_LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { hostlyCx } from "@/components/ui/hostly";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = LOCALE_META[locale];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={hostlyCx("relative z-30", className)}
      data-hostly-language-switcher
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--hostly-line)] bg-white/90 px-3 text-xs font-semibold text-[color:var(--hostly-ink)] shadow-[var(--hostly-shadow-card)] transition hover:bg-white focus:outline-none focus-visible:shadow-[var(--hostly-focus-ring)]"
        aria-label={t("common.language")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden className="text-[15px]">🌐</span>
        <span>{active.shortLabel}</span>
        <span className="hidden max-w-28 truncate sm:inline">{active.nativeName}</span>
        <span aria-hidden className="text-[10px] text-[color:var(--hostly-ink-muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("common.language")}
          className="absolute right-0 top-[calc(100%+8px)] w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[var(--hostly-line)] bg-white p-2 shadow-[var(--hostly-shadow-float)]"
        >
          <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--hostly-ink-faint)]">
            {t("common.language")}
          </div>
          <div className="max-h-[min(60vh,430px)] overflow-y-auto">
            {SUPPORTED_LOCALES.map((code: Locale) => {
              const option = LOCALE_META[code];
              const selected = locale === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={hostlyCx(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    selected
                      ? "bg-[var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]"
                      : "text-[color:var(--hostly-ink)] hover:bg-[var(--hostly-surface-page-soft)]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{option.nativeName}</span>
                    <span className="block truncate text-[10px] text-[color:var(--hostly-ink-muted)]">{option.englishName}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-[color:var(--hostly-ink-faint)]">
                    {selected ? "✓" : option.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
