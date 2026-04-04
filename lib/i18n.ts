export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_STORAGE_KEY = "hostly.locale";

/** Catálogo anidado por sección (p. ej. common.backToDashboard). */
export type MessageTree = Record<string, unknown>;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "es" || value === "en";
}

export function getMessage(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur !== null && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`,
  );
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function createTranslator(messages: MessageTree): TranslateFn {
  return (key, vars) => {
    const raw = getMessage(messages, key);
    if (raw === undefined) return key;
    return interpolate(raw, vars);
  };
}
