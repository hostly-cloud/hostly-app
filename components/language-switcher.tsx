"use client";

import type { Locale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { HostlyButton, hostlyCx } from "@/components/ui/hostly";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={hostlyCx("hostly-language-switch", className)}
      role="group"
      aria-label={t("common.language")}
    >
      {SUPPORTED_LOCALES.map((code: Locale) => {
        const active = locale === code;
        return (
          <HostlyButton
            key={code}
            variant="chip"
            size="compact"
            active={active}
            onClick={() => setLocale(code)}
            className={hostlyCx(
              "hostly-language-switch__button",
              active && "hostly-language-switch__button--active",
            )}
          >
            {code.toUpperCase()}
          </HostlyButton>
        );
      })}
    </div>
  );
}
