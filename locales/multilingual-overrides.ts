import type { Locale, MessageTree } from "@/lib/i18n";
import core from "@/locales/multilingual/core.json";

type BaseMultilingualLocale = "fr" | "de" | "it" | "pt" | "nl";
type TranslationTuple = [string, string, string, string, string];
type TranslationBundle = Record<string, TranslationTuple>;

const BASE_LOCALES: readonly BaseMultilingualLocale[] = ["fr", "de", "it", "pt", "nl"];

function baseLocale(locale: Locale): BaseMultilingualLocale | null {
  if (locale === "fr" || locale === "fr-CH") return "fr";
  if (locale === "de" || locale === "de-CH") return "de";
  if (locale === "it" || locale === "it-CH") return "it";
  if (locale === "pt") return "pt";
  if (locale === "nl") return "nl";
  return null;
}

function buildBundleForLocale(bundle: TranslationBundle, locale: BaseMultilingualLocale): MessageTree {
  const index = BASE_LOCALES.indexOf(locale);
  const out: MessageTree = {};
  for (const [key, values] of Object.entries(bundle)) {
    const translated = values[index];
    if (typeof translated === "string" && translated.length > 0) out[key] = translated;
  }
  return out;
}

const coreBundle = core as TranslationBundle;
const byBaseLocale = Object.fromEntries(
  BASE_LOCALES.map((locale) => [locale, buildBundleForLocale(coreBundle, locale)]),
) as Record<BaseMultilingualLocale, MessageTree>;

export function getMultilingualOverrides(locale: Locale): MessageTree {
  const base = baseLocale(locale);
  return base ? byBaseLocale[base] : {};
}
