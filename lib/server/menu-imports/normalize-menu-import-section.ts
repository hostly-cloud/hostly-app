import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";

/**
 * Espejo de SECTION_HINTS en parse-menu-text.ts (orden importa: el primer match gana).
 * Permite canonicalizar cabeceras OCR sin modificar el parser.
 */
const SECTION_HINTS: Array<{
  re: RegExp;
  section: string;
  category: string;
  station: ImportedMenuSuggestedStation;
}> = [
  { re: /\bvinos?\s+tintos?\b/i, section: "Vinos tintos", category: "Vinos tintos", station: "bar" },
  { re: /\bvinos?\s+blancos?\b/i, section: "Vinos blancos", category: "Vinos blancos", station: "bar" },
  { re: /\bvinos?\b/i, section: "Vinos", category: "Vinos", station: "bar" },
  { re: /\bc[oó]cteles?\b/i, section: "Cócteles", category: "Cócteles", station: "cocktail" },
  { re: /\bcaf[eé]s?\b/i, section: "Cafés", category: "Cafés", station: "bar" },
  { re: /\bpostres?\b/i, section: "Postres", category: "Postres", station: "kitchen" },
  { re: /\bpastas?\b/i, section: "Pastas", category: "Pastas", station: "kitchen" },
  { re: /\brisott[oi]\b/i, section: "Risotti", category: "Risotti", station: "kitchen" },
  {
    re: /\bpasta\s*(?:e|y|&|and)\s*risott[oi]s?\b/i,
    section: "Pastas",
    category: "Pastas",
    station: "kitchen",
  },
  { re: /\bentrantes?\b/i, section: "Entrantes", category: "Entrantes", station: "kitchen" },
  { re: /\btapas?\b/i, section: "Entrantes", category: "Tapas", station: "kitchen" },
  { re: /\bprincipales?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bsegundos?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bprimeros?\b/i, section: "Principales", category: "Primeros", station: "kitchen" },
  { re: /\bcervezas?\b/i, section: "Bebidas", category: "Cervezas", station: "bar" },
  { re: /\brefrescos?\b/i, section: "Bebidas", category: "Refrescos", station: "bar" },
];

export type CanonicalMenuImportSection = {
  sectionName: string;
  category: string;
  station: ImportedMenuSuggestedStation;
  matchedHint: boolean;
};

/** Separadores de cabecera de sección (no incluye `/` ni `//` — usados en descripciones OCR). */
const TRILINGUAL_HEADER_SEP_RE = /\s*[-–—|]\s*/;
const PRICE_ANYWHERE_RE = /(\d{1,3}[.,]\d{2})\s*(?:€|eur)?/i;

const DESCRIPTIVE_SECTION_START_RE =
  /^(con|with|mit|served|serviert|servido|sauce|salsa|champignon|champiñones|gegrilltes|grilled)\b/i;

const DESCRIPTIVE_SECTION_PATTERN_RE =
  /\b(con salsa|with sauce|mit sauce|mit champignon|with mushroom|con champiñones|served with|serviert mit|mit pommes|con parmesano|with parmesan|und frischem|and fresh)\b/i;

/**
 * Texto descriptivo/traducción que no debe usarse como sectionName ni suggestedCategory.
 */
export function isDescriptiveMenuImportSectionName(name: string): boolean {
  const t = normalizeSectionLine(name);
  if (!t) return true;

  const words = t.split(/\s+/).filter(Boolean);
  const startsDescriptive = DESCRIPTIVE_SECTION_START_RE.test(t);

  // Líneas largas con nombre de plato son productos, no cabeceras de sección.
  if (!startsDescriptive && (words.length > 7 || t.length > 52)) return false;

  if (startsDescriptive) return true;
  if (DESCRIPTIVE_SECTION_PATTERN_RE.test(t) && words.length <= 8) return true;
  if (/^mit\s+\w/i.test(t) && /\b(sauce|champignon|champiñones|pommes|parmesan|truffel|trüffel)\b/i.test(t)) {
    return true;
  }
  if (/^with\s+\w/i.test(t) && /\b(sauce|mushroom|parmesan|truffle|fries)\b/i.test(t)) return true;
  if (/^con\s+\w/i.test(t) && /\b(salsa|parmesano|trufa|patatas)\b/i.test(t)) return true;
  return false;
}

/** Devuelve sección válida o el fallback (última sección real de carta). */
export function resolveMenuImportSectionName(
  rawSection: string | undefined | null,
  fallbackSection = "General",
): string {
  const t = normalizeSectionLine(rawSection ?? "");
  if (!t || isDescriptiveMenuImportSectionName(t)) return fallbackSection;
  return t;
}

function normalizeSectionLine(line: string): string {
  return line.replace(/[:：*]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Cabecera trilingüe: el parser conserva el primer segmento (ej. "Pasta casera").
 */
function tryTrilingualSectionHeader(line: string): CanonicalMenuImportSection | null {
  const t = normalizeSectionLine(line);
  if (!t || t.length < 8 || t.length > 140) return null;
  if (PRICE_ANYWHERE_RE.test(t)) return null;
  if (/\/\//.test(t)) return null;
  if (isDescriptiveMenuImportSectionName(t)) return null;

  const segments = t
    .split(TRILINGUAL_HEADER_SEP_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (segments.length < 2 || segments.length > 4) return null;
  if (segments.some((s) => s.length > 58)) return null;
  if (segments.some((s) => isDescriptiveMenuImportSectionName(s))) return null;

  const first = segments[0]!;
  if (!looksLikeMenuSectionHeaderText(first)) return null;
  const inferred = inferMenuImportSectionFromHeader(first);
  return {
    sectionName: first,
    category: inferred?.category ?? first,
    station: inferred?.station ?? "kitchen",
    matchedHint: true,
  };
}

/** Subsecciones concretas que no deben colapsar a "Pastas" genérico. */
function isSpecificPastaSubsection(line: string): boolean {
  return /\bpasta\s+casera\b/i.test(line);
}

/** Cabeceras combinadas pasta+risotto → taxonomía Hostly "Pastas". */
function isCombinedPastaRisottiHeader(line: string): boolean {
  return /\bpasta\s*(?:e|y|&|and)\s*risott[oi]s?\b/i.test(line);
}

/** Primer segmento de cabecera trilingüe (p. ej. "Pasta casera", "Segundos platos"). */
export function looksLikeMenuSectionHeaderText(segment: string): boolean {
  const normalized = normalizeSectionLine(segment);
  if (!normalized || normalized.length < 3) return false;
  if (isDescriptiveMenuImportSectionName(normalized)) return false;
  if (inferMenuImportSectionFromHeader(normalized)) return true;
  return (
    /\b(pasta|pizze|pastas|risott[oi]|pizza|carnes?|carne|pescados?|entrantes?|postres?|bebidas?|segundos?|platos?|principales?|vinos?|c[oó]cteles?|caf[eé]s?|tapas?)\b/i.test(
      normalized,
    ) && normalized.split(/\s+/).length <= 6
  );
}

export function inferMenuImportSectionFromHeader(line: string): CanonicalMenuImportSection | null {
  const normalized = normalizeSectionLine(line);
  if (!normalized) return null;

  for (const hint of SECTION_HINTS) {
    if (hint.re.test(normalized)) {
      return {
        sectionName: hint.section,
        category: hint.category,
        station: hint.station,
        matchedHint: true,
      };
    }
  }

  return null;
}

/**
 * Canonicaliza cabecera OCR → sectionName Hostly.
 * Sin match claro conserva el nombre original limpio.
 */
export function canonicalizeMenuImportSectionHeader(rawSection: string): CanonicalMenuImportSection {
  const normalized = normalizeSectionLine(rawSection);
  if (!normalized || isDescriptiveMenuImportSectionName(normalized)) {
    return {
      sectionName: "General",
      category: "General",
      station: "kitchen",
      matchedHint: false,
    };
  }

  const trilingual = tryTrilingualSectionHeader(normalized);
  if (trilingual) return trilingual;

  if (isCombinedPastaRisottiHeader(normalized)) {
    return {
      sectionName: "Pastas",
      category: "Pastas",
      station: "kitchen",
      matchedHint: true,
    };
  }

  if (isSpecificPastaSubsection(normalized)) {
    const inferred = inferMenuImportSectionFromHeader(normalized);
    return {
      sectionName: normalized,
      category: inferred?.category ?? "Pastas",
      station: "kitchen",
      matchedHint: true,
    };
  }

  const inferred = inferMenuImportSectionFromHeader(normalized);
  if (inferred) return inferred;

  return {
    sectionName: normalized,
    category: normalized,
    station: "kitchen",
    matchedHint: false,
  };
}
