export const SUPPORTED_LOCALES = [
  "es",
  "en",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "de-CH",
  "fr-CH",
  "it-CH",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleMeta = {
  code: Locale;
  nativeName: string;
  englishName: string;
  shortLabel: string;
  htmlLang: string;
  intlLocale: string;
  regionHint?: string;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  es: { code: "es", nativeName: "Español", englishName: "Spanish", shortLabel: "ES", htmlLang: "es", intlLocale: "es-ES" },
  en: { code: "en", nativeName: "English", englishName: "English", shortLabel: "EN", htmlLang: "en", intlLocale: "en-GB" },
  fr: { code: "fr", nativeName: "Français", englishName: "French", shortLabel: "FR", htmlLang: "fr", intlLocale: "fr-FR" },
  de: { code: "de", nativeName: "Deutsch", englishName: "German", shortLabel: "DE", htmlLang: "de", intlLocale: "de-DE" },
  it: { code: "it", nativeName: "Italiano", englishName: "Italian", shortLabel: "IT", htmlLang: "it", intlLocale: "it-IT" },
  pt: { code: "pt", nativeName: "Português", englishName: "Portuguese", shortLabel: "PT", htmlLang: "pt", intlLocale: "pt-PT" },
  nl: { code: "nl", nativeName: "Nederlands", englishName: "Dutch", shortLabel: "NL", htmlLang: "nl", intlLocale: "nl-NL" },
  "de-CH": { code: "de-CH", nativeName: "Deutsch (Schweiz)", englishName: "German (Switzerland)", shortLabel: "CH-DE", htmlLang: "de-CH", intlLocale: "de-CH", regionHint: "Schweiz" },
  "fr-CH": { code: "fr-CH", nativeName: "Français (Suisse)", englishName: "French (Switzerland)", shortLabel: "CH-FR", htmlLang: "fr-CH", intlLocale: "fr-CH", regionHint: "Suisse" },
  "it-CH": { code: "it-CH", nativeName: "Italiano (Svizzera)", englishName: "Italian (Switzerland)", shortLabel: "CH-IT", htmlLang: "it-CH", intlLocale: "it-CH", regionHint: "Svizzera" },
};

export const DEFAULT_LOCALE: Locale = "es";
export const FALLBACK_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "hostly.locale";

export type MessageTree = Record<string, unknown>;

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value));
}

export function getMessage(tree: MessageTree, key: string): string | undefined {
  const direct = tree[key];
  if (typeof direct === "string") return direct;
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur !== null && typeof cur === "object" && p in cur) cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function flattenMessages(tree: MessageTree, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[next] = value;
    else if (value && typeof value === "object" && !Array.isArray(value)) flattenMessages(value as MessageTree, next, out);
  }
  return out;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`);
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function createTranslator(messages: MessageTree, fallbackMessages?: MessageTree): TranslateFn {
  const translatedFlat = flattenMessages(messages);
  const fallbackFlat = fallbackMessages ? flattenMessages(fallbackMessages) : {};
  const translationBySource = new Map<string, string>();
  if (fallbackMessages) {
    for (const [translatedKey, translatedValue] of Object.entries(translatedFlat)) {
      const sourceValue = fallbackFlat[translatedKey];
      if (sourceValue && translatedValue && translatedValue !== sourceValue) translationBySource.set(sourceValue, translatedValue);
    }
  }

  return (key, vars) => {
    let raw = getMessage(messages, key);
    if (raw === undefined && fallbackMessages) {
      const source = fallbackFlat[key] ?? getMessage(fallbackMessages, key);
      raw = source ? translationBySource.get(source) ?? source : undefined;
    }
    if (raw === undefined) return key;
    return interpolate(raw, vars);
  };
}
