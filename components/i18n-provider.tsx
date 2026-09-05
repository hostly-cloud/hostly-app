"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  isLocale,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  type Locale,
  type MessageTree,
  type TranslateFn,
} from "@/lib/i18n";
import { en } from "@/locales/en";
import { es } from "@/locales/es";
import { fr } from "@/locales/fr";
import { de } from "@/locales/de";
import { it } from "@/locales/it";
import { pt } from "@/locales/pt";
import { nl } from "@/locales/nl";
import { getMultilingualOverrides } from "@/locales/multilingual-overrides";

const CATALOG: Record<Locale, MessageTree> = {
  es,
  en,
  fr,
  de,
  it,
  pt,
  nl,
  "de-CH": de,
  "fr-CH": fr,
  "it-CH": it,
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  intlLocale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCALE_CHANGE_EVENT = "hostly:locale-change";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribeLocale(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    readStoredLocale,
    () => DEFAULT_LOCALE,
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = LOCALE_META[locale].htmlLang;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  const effectiveCatalog = useMemo<MessageTree>(
    () => ({
      ...CATALOG[locale],
      ...getMultilingualOverrides(locale),
    }),
    [locale],
  );

  const t = useMemo(
    () => createTranslator(effectiveCatalog, CATALOG[FALLBACK_LOCALE]),
    [effectiveCatalog],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      intlLocale: LOCALE_META[locale].intlLocale,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
