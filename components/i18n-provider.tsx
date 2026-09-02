"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
  type MessageTree,
  type TranslateFn,
} from "@/lib/i18n";
import { en } from "@/locales/en";
import { es } from "@/locales/es";

const CATALOG: Record<Locale, MessageTree> = {
  es,
  en,
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
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
      document.documentElement.lang = locale === "en" ? "en" : "es";
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

  const t = useMemo(() => createTranslator(CATALOG[locale]), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
