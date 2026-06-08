import type {
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
  ImportedMenuSuggestedStation,
} from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import type { ParseMenuLineEvent } from "@/lib/carta/menu-import-debug-report-types";
import type { OcrLayoutLine } from "./menu-import-ocr-layout-types";
import {
  parseVisualMenuLayout,
  type VisualMenuLayoutDiagnostics,
} from "./visual-menu-layout-parser";
import {
  shouldAutoSelectMultilingualImportItem,
  shouldAutoSelectVisualImportItem,
} from "./evaluate-import-item-for-publish";
import {
  isDescriptiveMenuImportSectionName,
  looksLikeMenuSectionHeaderText,
} from "./normalize-menu-import-section";
import { resolveImportedItemDestination } from "./resolve-imported-item-destination";

const PRICE_TRAILING_RE =
  /^(.+?)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|eur|EUR)?\s*$/i;
const PRICE_LEADING_RE =
  /^(?:€|eur|EUR)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s+(.+)$/i;
const PRICE_ANYWHERE_RE = /(\d{1,3}[.,]\d{2})\s*(?:€|eur)?/i;

const SECTION_HINTS: Array<{ re: RegExp; section: string; category: string; station: ImportedMenuSuggestedStation }> = [
  { re: /\bvinos?\s+tintos?\b/i, section: "Vinos tintos", category: "Vinos tintos", station: "bar" },
  { re: /\bvinos?\s+blancos?\b/i, section: "Vinos blancos", category: "Vinos blancos", station: "bar" },
  { re: /\bvinos?\b/i, section: "Vinos", category: "Vinos", station: "bar" },
  { re: /\bc[oó]cteles?\b/i, section: "Cócteles", category: "Cócteles", station: "cocktail" },
  { re: /\bcaf[eé]s?\b/i, section: "Cafés", category: "Cafés", station: "bar" },
  { re: /\bpostres?\b/i, section: "Postres", category: "Postres", station: "kitchen" },
  { re: /\bpastas?\b/i, section: "Pastas", category: "Pastas", station: "kitchen" },
  { re: /\brisott[oi]\b/i, section: "Risotti", category: "Risotti", station: "kitchen" },
  { re: /\bpasta\s+e\s+risott[oi]\b/i, section: "Pasta e Risotti", category: "Pastas", station: "kitchen" },
  { re: /\bentrantes?\b/i, section: "Entrantes", category: "Entrantes", station: "kitchen" },
  { re: /\btapas?\b/i, section: "Entrantes", category: "Tapas", station: "kitchen" },
  { re: /\bprincipales?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bsegundos?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bprimeros?\b/i, section: "Principales", category: "Primeros", station: "kitchen" },
  { re: /\bcervezas?\b/i, section: "Bebidas", category: "Cervezas", station: "bar" },
  { re: /\brefrescos?\b/i, section: "Bebidas", category: "Refrescos", station: "bar" },
];

const NOISE_LINE_RE =
  /\b(iv[aá]|iva incluido|suplemento|al[eé]rgeno|horario|tel[eé]fono|www\.|https?:\/\/|booking|reservar)\b/i;

/** Ruido de reservas de mesa; no confundir con vinos «Ribera Reserva», «Gran Reserva», etc. */
const RESERVATION_NOISE_RE =
  /\b(reservas|reserva\s+(tu|de|en|al|por)\s+(mesa|mesas)|reserva\s+telef[oó]nica|tel[eé]fono\s+reservas?)\b/i;

function isParserNoiseLine(line: string): boolean {
  const t = normalizeMenuLine(line);
  if (!t) return false;
  if (NOISE_LINE_RE.test(t)) return true;
  if (RESERVATION_NOISE_RE.test(t)) return true;
  if (/^reservas?\s*[:：*]/i.test(t) && !PRICE_ANYWHERE_RE.test(t)) return true;
  return false;
}

/** Cabeceras de sección que no deben emparejarse como producto. */
const SECTION_BLOCKLIST_RE =
  /^(?:pizze\s+(?:gourmet|clasico|classico)|entrantes|postres|principales?|bebidas?|carta|menu|menú)$/i;

const NAME_CONNECTORS = new Set(["e", "y", "de", "del", "la", "el", "con", "&", "al", "alla"]);

/** Marcadores típicos de traducción (EN / DE / FR) — no se usan como nombre final. */
const TRANSLATION_EN_RE =
  /\b(with|and|style|sauce|spicy|cream|cheese|mushroom|mushrooms|shrimp|shrimps|cherry|cherries|seafood|tomato|served|style)\b/i;
const TRANSLATION_DE_RE =
  /\b(mit|und|scharfer|scharfe|Tomatensauce|pilz|pilze|Pilzen|Meeresfrüchte|Garnelen|Kirschen|stil|prosecco|serviert|kirschtomaten|büffel|salbei|steinpilz|frische|frisch|frischem|salbeibutter|gemischten|sahne|spinat|lauch|garnelen|geräuchertem|trüffel)\b/i;
const TRANSLATION_FR_RE =
  /\b(avec|et|crème|champignon|champignons|tomate|crevettes|fruits|mer)\b/i;

/** Marcadores de nombre principal (ES / IT) en cartas multilingües. */
const PRIMARY_ES_IT_RE =
  /\b(con|de|la|el|los|las|salsa|tomate|picante|estilo|langostinos|setas|frutos|mar|bo[lñ]o[nñ]esa|carbonara|arrabiata|porcini|prosecco|risotto|all[aá]|pizza|pizze|margherita|prosciutto|bufala|mozzarella|salmone|tonno|branzino|orata|manzo|vitello|pollo|entrec[oô]t|filetto|gamberi|calamari|tarta|tiramis[uù]|croquetas|jam[oó]n|queso|ensalada|postre|tapa|coctel|c[oó]ctel)\b/i;

/** Máximo de líneas de traducción (EN/DE/FR) tras el nombre principal antes del precio. */
const MULTILINGUAL_TRANSLATION_LINES = 3;

const TRILINGUAL_HEADER_SEP_RE = /\s*[-–—|]\s*/;

const V2_EN_DISH_START_RE =
  /^(gnocchi|ravioli|tagliatelle|lasagna|lasagne|cannelloni|orecchiette|porcini|mushrooms|fresh|smoked|ricotta)\b/i;
const V2_DE_DISH_START_RE =
  /^(gnocchi|ravioli|tagliatelle|steinpilz|frische|frisch|ricotta)\b/i;

/** Prefijos OCR de artículo/idioma en línea aislada (LA / THE / DIE …). */
const V2_LANGUAGE_PREFIX_ONLY_RE =
  /^(?:LA|EL|LOS|LAS|THE|A|AN|DIE|DER|DAS|LE|LES|UN|UNE)$/i;
const V2_LANGUAGE_PREFIX_INLINE_RE = /^(?:LA|EL|LOS|LAS|THE|A|AN|DIE|DER|DAS|LE|LES|UN|UNE)\s+/i;

/** Fragmentos de ingrediente/plato que no deben quedar como producto suelto. */
const V2_ORPHAN_SINGLE_WORD_RE =
  /^(?:ricotta|gnocchi|porcini|mozzarella|basil|sage|truffle|trüffel|spinach|espinacas|lachs|salmon|salmón|mascarpone|puerros|gambas)$/i;

/** Máximo de líneas OCR crudas consumidas por un bloque multilingüe (incluye prefijos partidos). */
const V2_MAX_RAW_LINES_PER_BLOCK = 14;

const ORPHAN_PRICE_ONE_LINE_RE = /^(\d{1,3}[.,]\d{1,2})\s*(?:€|eur)?\s*$/i;
const ORPHAN_PRICE_EURO_PREFIX_RE = /^(?:€|eur)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/i;
const ORPHAN_PRICE_INT_RE = /^(\d{1,3})\s*$/;
const ORPHAN_PRICE_DECIMAL_PART_RE = /^(\d{2})\s*(?:€|eur)?\s*$/i;

type PriceParseStrength = "strong" | "ambiguous_integer";

type PriceParseResult = {
  price: number;
  linesConsumed: number;
  strength: PriceParseStrength;
};

type PriceBlockEntry = {
  price: number;
  lineIndex: number;
  linesConsumed: number;
  strength: PriceParseStrength;
};

type SkippedAmbiguousPrice = {
  lineIndex: number;
  text: string;
  reason: string;
};

type ColumnBlockPairing = {
  name: string;
  price: number;
  nameLineIndex: number;
  priceLineIndex: number;
  priceStrength: PriceParseStrength;
};

type MultilingualBlockPairing = {
  primaryName: string;
  price: number;
  primaryLineIndex: number;
  priceLineIndex: number;
  translationLines: string[];
  translationLineIndexes: number[];
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Texto OCR normalizado antes del parser heurístico (solo lectura/diagnóstico). */
export function normalizeMenuImportOcrText(rawText: string): string {
  return rawText
    .replace(/\r/g, "\n")
    .replace(/[|¦]/g, "I")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeOcrText(rawText: string): string {
  return normalizeMenuImportOcrText(rawText);
}

function parsePriceToken(raw: string): number | undefined {
  const t = raw.replace(",", ".").trim();
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 999) return undefined;
  return Math.round(n * 100) / 100;
}

function looksLikeSectionHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (PRICE_ANYWHERE_RE.test(t)) return false;
  if (isParserNoiseLine(t)) return false;
  if (/[:：]$/.test(t)) return true;
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t) && t.length >= 4 && t.length <= 48) return true;
  // Títulos de sección cortos; evita confundir platos ("Risotto con setas…") con cabeceras.
  if (t.length <= 36 && SECTION_HINTS.some((h) => h.re.test(t))) return true;
  return false;
}

function inferSectionFromLine(line: string): { sectionName: string; category: string; station: ImportedMenuSuggestedStation } | null {
  for (const hint of SECTION_HINTS) {
    if (hint.re.test(line)) {
      return { sectionName: hint.section, category: hint.category, station: hint.station };
    }
  }
  return null;
}


function extractNameAndPrice(line: string): { name: string; price?: number; confidence: number } | null {
  const trimmed = line.replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;

  const trailing = trimmed.match(PRICE_TRAILING_RE);
  if (trailing?.[1] && trailing[2]) {
    const price = parsePriceToken(trailing[2]);
    const name = trailing[1].trim().replace(/[-–—]\s*$/, "");
    if (name.length >= 2) {
      return { name, price, confidence: price != null ? 86 : 62 };
    }
  }

  const leading = trimmed.match(PRICE_LEADING_RE);
  if (leading?.[2] && leading[1]) {
    const price = parsePriceToken(leading[1]);
    const name = leading[2].trim();
    if (name.length >= 2) {
      return { name, price, confidence: price != null ? 84 : 60 };
    }
  }

  const anywhere = trimmed.match(/^(.+?)\s+(\d{1,3}[.,]\d{2})\b/u);
  if (anywhere?.[1] && anywhere[2]) {
    const price = parsePriceToken(anywhere[2]);
    const name = anywhere[1].trim();
    if (name.length >= 2) {
      return { name, price, confidence: price != null ? 78 : 58 };
    }
  }

  return null;
}

function isBlockedSectionLabel(line: string): boolean {
  const t = line.replace(/[:：*]/g, "").trim();
  return SECTION_BLOCKLIST_RE.test(t);
}

/** Parsea una línea (o par de líneas) como precio con señal fuerte o ambigua. */
function parseSinglePriceLine(line: string, nextLine?: string): PriceParseResult | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const full = trimmed.match(ORPHAN_PRICE_ONE_LINE_RE);
  if (full?.[1]) {
    const price = parsePriceToken(full[1]);
    if (price != null) return { price, linesConsumed: 1, strength: "strong" };
  }

  const euroPrefix = trimmed.match(ORPHAN_PRICE_EURO_PREFIX_RE);
  if (euroPrefix?.[1]) {
    const price = parsePriceToken(euroPrefix[1]);
    if (price != null) return { price, linesConsumed: 1, strength: "strong" };
  }

  const intPart = trimmed.match(ORPHAN_PRICE_INT_RE);
  const next = nextLine?.trim();
  if (intPart?.[1] && next) {
    const decPart = next.match(ORPHAN_PRICE_DECIMAL_PART_RE);
    if (decPart?.[1]) {
      const price = parsePriceToken(`${intPart[1]}.${decPart[1]}`);
      if (price != null) return { price, linesConsumed: 2, strength: "strong" };
    }
  }

  if (intPart?.[1]) {
    const digits = intPart[1];
    const price = parsePriceToken(digits);
    if (price == null) return null;
    // Enteros 1–2 dígitos sin decimal: número de plato/código, no precio suelto.
    if (digits.length <= 2) {
      return { price, linesConsumed: 1, strength: "ambiguous_integer" };
    }
    // Enteros ≥3 sin decimal ni €: solo válidos en bloque con contexto (no sueltos).
    return { price, linesConsumed: 1, strength: "ambiguous_integer" };
  }

  return null;
}

/** Precio huérfano aceptable para emparejamiento 1:1 (solo señal fuerte). */
function parseStrongOrphanPriceAt(
  lines: string[],
  index: number,
): { price: number; linesConsumed: number } | null {
  if (index < 0 || index >= lines.length) return null;
  const parsed = parseSinglePriceLine(lines[index] ?? "", lines[index + 1]);
  if (!parsed || parsed.strength !== "strong") return null;
  return { price: parsed.price, linesConsumed: parsed.linesConsumed };
}

/**
 * Recoge un bloque consecutivo de precios fuertes, omitiendo enteros ambiguos
 * (p. ej. 10, 11, 17) que suelen ser índices de carta.
 */
function collectStrongPriceBlockFrom(
  lines: string[],
  startIndex: number,
): { strong: PriceBlockEntry[]; skipped: SkippedAmbiguousPrice[]; nextIndex: number } {
  const strong: PriceBlockEntry[] = [];
  const skipped: SkippedAmbiguousPrice[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i]?.trim();
    if (!line) {
      i++;
      continue;
    }
    if (isParserNoiseLine(line)) break;
    if (looksLikeSectionHeader(line) || isBlockedSectionLabel(line)) break;
    if (extractNameAndPrice(line)) break;
    if (looksLikeProductNameCandidate(line)) break;

    const parsed = parseSinglePriceLine(line, lines[i + 1]);
    if (!parsed) break;

    if (parsed.strength === "ambiguous_integer") {
      skipped.push({
        lineIndex: i,
        text: line,
        reason: "entero_sin_decimal_ni_euro",
      });
      i += parsed.linesConsumed;
      continue;
    }

    strong.push({
      price: parsed.price,
      lineIndex: i,
      linesConsumed: parsed.linesConsumed,
      strength: parsed.strength,
    });
    i += parsed.linesConsumed;
  }

  return { strong, skipped, nextIndex: i };
}

function isOrphanPriceLine(line: string): boolean {
  return parseSinglePriceLine(line) != null;
}

function normalizeMenuLine(line: string): string {
  return line.replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim();
}

function isV2LanguagePrefixOnlyLine(line: string): boolean {
  return V2_LANGUAGE_PREFIX_ONLY_RE.test(normalizeMenuLine(line));
}

function stripV2LanguagePrefix(text: string): string {
  const t = normalizeMenuLine(text);
  if (V2_LANGUAGE_PREFIX_ONLY_RE.test(t)) return "";
  return t.replace(V2_LANGUAGE_PREFIX_INLINE_RE, "").trim();
}

type ResolvedV2Line = {
  effectiveText: string;
  startIndex: number;
  endIndex: number;
  prefixJoined: boolean;
};

/** Une prefijo OCR (LA/THE/DIE) con la línea siguiente para formar nombre/traducción. */
function resolveV2LineAt(lines: string[], index: number): ResolvedV2Line | null {
  const raw = lines[index]?.trim();
  if (!raw) return null;

  if (isV2LanguagePrefixOnlyLine(raw)) {
    const next = lines[index + 1]?.trim();
    if (!next || isOrphanPriceLine(next)) return null;
    const effectiveText = stripV2LanguagePrefix(`${raw} ${next}`);
    if (effectiveText.length < 4) return null;
    return {
      effectiveText,
      startIndex: index,
      endIndex: index + 1,
      prefixJoined: true,
    };
  }

  const effectiveText = stripV2LanguagePrefix(raw);
  if (effectiveText.length < 2) return null;
  return {
    effectiveText,
    startIndex: index,
    endIndex: index,
    prefixJoined: V2_LANGUAGE_PREFIX_INLINE_RE.test(raw),
  };
}

function isV2OrphanNameFragment(line: string): boolean {
  const effective = stripV2LanguagePrefix(normalizeMenuLine(line));
  if (!effective) return isV2LanguagePrefixOnlyLine(line);
  const words = effective.split(/\s+/).filter(Boolean);
  if (words.length === 1 && V2_ORPHAN_SINGLE_WORD_RE.test(words[0]!)) return true;
  if (words.length === 1 && effective.length < 10 && !/[ñáéíóúü]/i.test(effective)) return true;
  if (V2_EN_DISH_START_RE.test(effective) && TRANSLATION_EN_RE.test(effective) && !/[ñáéíóúü]/i.test(effective)) {
    return true;
  }
  if (V2_DE_DISH_START_RE.test(effective) && TRANSLATION_DE_RE.test(effective) && !/[ñáéíóúü]/i.test(effective)) {
    return true;
  }
  return false;
}

/** Nombre principal completo (sin truncar ingredientes ni traducciones). */
function primaryProductNameFromLine(line: string): string | null {
  let trimmed = normalizeMenuLine(line);
  if (trimmed.includes("*")) {
    trimmed = trimmed.split("*")[0]?.trim() ?? trimmed;
  }
  if (trimmed.length < 4) return null;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñÄÖÜäöü]/.test(trimmed)) return null;
  return trimmed;
}

function firstToken(line: string): string {
  return normalizeMenuLine(line).split(/\s+/)[0]?.toLowerCase() ?? "";
}

function isLikelyTranslationLine(line: string, primaryLine?: string): boolean {
  const t = normalizeMenuLine(line);
  if (t.length < 4) return false;
  if (TRANSLATION_EN_RE.test(t) || TRANSLATION_DE_RE.test(t) || TRANSLATION_FR_RE.test(t)) {
    return true;
  }
  if (primaryLine) {
    const p0 = firstToken(primaryLine);
    const l0 = firstToken(t);
    if (p0.length >= 4 && l0.length >= 4 && p0 === l0) {
      return true;
    }
  }
  return false;
}

function isLikelyPrimaryLanguageLine(line: string): boolean {
  const t = normalizeMenuLine(line);
  if (/[ñáéíóúü]/i.test(t)) return true;
  if (PRIMARY_ES_IT_RE.test(t)) return true;
  if (isLikelyTranslationLine(t) && !PRIMARY_ES_IT_RE.test(t)) return false;
  return t.length >= 6;
}

function isMultilingualCompanionLine(line: string, primaryLine: string): boolean {
  const t = stripV2LanguagePrefix(line);
  const p = stripV2LanguagePrefix(primaryLine);
  if (t.length < 4) return false;
  if (looksLikeSectionHeader(line) || isBlockedSectionLabel(line)) return false;
  if (isParserNoiseLine(line)) return false;
  if (parseSinglePriceLine(line)) return false;
  if (extractNameAndPrice(line)) return false;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñÄÖÜäöü]/.test(t)) return false;
  if (p && t === p) return true;
  return isLikelyTranslationLine(t, p) || isV2TranslationLine(t, p);
}

function isMultilingualPrimaryCandidate(line: string): boolean {
  if (isV2LanguagePrefixOnlyLine(line) || isV2OrphanNameFragment(line)) return false;
  if (isBlockedSectionLabel(line) || looksLikeSectionHeader(line)) return false;
  if (isParserNoiseLine(line) || extractNameAndPrice(line) || isOrphanPriceLine(line)) return false;
  const effective = stripV2LanguagePrefix(line);
  const primary = primaryProductNameFromLine(effective);
  if (!primary || primary.length < 4) return false;
  if (isV2OrphanNameFragment(primary)) return false;
  return isLikelyPrimaryLanguageLine(effective);
}

function tryParseMultilingualProductBlock(
  lines: string[],
  startIndex: number,
): {
  primaryName: string;
  translationLines: string[];
  translationLineIndexes: number[];
  price: number;
  priceLineIndex: number;
  priceLinesConsumed: number;
  linesConsumed: number;
  prefixJoins: Array<{ prefixLineIndex: number; joinedLineIndex: number; effectiveText: string }>;
} | null {
  const resolvedPrimary = resolveV2LineAt(lines, startIndex);
  if (!resolvedPrimary) return null;

  const primaryLine = resolvedPrimary.effectiveText;
  if (!isMultilingualPrimaryCandidate(primaryLine)) return null;

  const primaryName = primaryProductNameFromLine(primaryLine);
  if (!primaryName) return null;

  const translationLines: string[] = [];
  const translationLineIndexes: number[] = [];
  const prefixJoins: Array<{ prefixLineIndex: number; joinedLineIndex: number; effectiveText: string }> = [];
  if (resolvedPrimary.prefixJoined) {
    prefixJoins.push({
      prefixLineIndex: resolvedPrimary.startIndex,
      joinedLineIndex: resolvedPrimary.endIndex,
      effectiveText: primaryLine,
    });
  }

  let cursor = resolvedPrimary.endIndex + 1;

  while (
    translationLines.length < MULTILINGUAL_TRANSLATION_LINES &&
    cursor - startIndex < V2_MAX_RAW_LINES_PER_BLOCK
  ) {
    if (parseStrongOrphanPriceAt(lines, cursor)) break;

    const resolvedCompanion = resolveV2LineAt(lines, cursor);
    if (!resolvedCompanion) {
      cursor++;
      continue;
    }
    const companionLine = resolvedCompanion.effectiveText;
    if (!isMultilingualCompanionLine(companionLine, primaryLine)) break;
    translationLines.push(normalizeMenuLine(companionLine));
    translationLineIndexes.push(resolvedCompanion.startIndex);
    if (resolvedCompanion.prefixJoined) {
      prefixJoins.push({
        prefixLineIndex: resolvedCompanion.startIndex,
        joinedLineIndex: resolvedCompanion.endIndex,
        effectiveText: companionLine,
      });
    }
    cursor = resolvedCompanion.endIndex + 1;
  }

  if (translationLines.length === 0) return null;

  const priceParsed = parseStrongOrphanPriceAt(lines, cursor);
  if (!priceParsed) return null;

  return {
    primaryName,
    translationLines,
    translationLineIndexes,
    price: priceParsed.price,
    priceLineIndex: cursor,
    priceLinesConsumed: priceParsed.linesConsumed,
    linesConsumed: cursor - startIndex + priceParsed.linesConsumed,
    prefixJoins,
  };
}

/** Traducción huérfana: no crear producto si sigue a un nombre principal pendiente. */
function shouldSkipOrphanTranslationLine(
  line: string,
  pendingNames: Array<{ rawText: string }>,
): boolean {
  if (!isLikelyTranslationLine(line)) return false;
  if (isMultilingualPrimaryCandidate(line)) return false;
  const lastPending = pendingNames[pendingNames.length - 1];
  if (!lastPending) return false;
  return isLikelyTranslationLine(line, lastPending.rawText);
}

/**
 * Cabecera trilingüe tipo "Pasta casera - Homemade Pasta - Hausgemachte Pasta".
 * Actualiza sección; nunca es producto.
 */
function detectTrilingualSectionHeader(
  line: string,
): { sectionName: string; category: string } | null {
  const t = normalizeMenuLine(line);
  if (!t || t.length < 8 || t.length > 140) return null;
  if (PRICE_ANYWHERE_RE.test(t)) return null;
  if (isParserNoiseLine(t)) return null;
  if (extractNameAndPrice(t)) return null;
  if (isBlockedSectionLabel(line)) return null;
  if (/\/\//.test(t)) return null;
  if (isDescriptiveMenuImportSectionName(t)) return null;

  const segments = t
    .split(TRILINGUAL_HEADER_SEP_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (segments.length < 2 || segments.length > 4) return null;
  if (segments.some((s) => s.length > 58)) return null;
  if (segments.some((s) => isDescriptiveMenuImportSectionName(s))) return null;

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 10 && /,/.test(t)) return null;
  if (/\b(servido|served|serviert)\b/i.test(t) && /,/.test(t)) return null;

  const first = segments[0]!;
  if (!looksLikeMenuSectionHeaderText(first)) return null;

  const rest = segments.slice(1);
  const hasEnOrDeSegment = rest.some(
    (s) =>
      /\b(homemade|hausgemachte|hausgemacht|fresh|frische|pasta|pizza|risotto)\b/i.test(s) ||
      TRANSLATION_EN_RE.test(s) ||
      TRANSLATION_DE_RE.test(s) ||
      /^[A-Za-z\s]{3,40}$/.test(s) && !/[ñáéíóúü]/i.test(s),
  );

  if (!hasEnOrDeSegment) return null;
  if (segments.length === 2 && segments.every((s) => s.split(/\s+/).length > 6)) return null;

  const sectionName = first.replace(/[:：*]/g, "").trim();
  if (sectionName.length < 3) return null;

  const inferred = inferSectionFromLine(first);
  return {
    sectionName,
    category: inferred?.category ?? sectionName,
  };
}

/** Línea principal ES/IT (excluye cabeceras y traducciones). */
function isV2PrimaryProductLine(line: string): boolean {
  if (isV2LanguagePrefixOnlyLine(line)) return false;
  if (detectTrilingualSectionHeader(line)) return false;
  if (isBlockedSectionLabel(line) || looksLikeSectionHeader(line)) return false;
  if (isParserNoiseLine(line) || extractNameAndPrice(line) || isOrphanPriceLine(line)) return false;

  const t = stripV2LanguagePrefix(line);
  if (!t || isV2OrphanNameFragment(t)) return false;
  const primary = primaryProductNameFromLine(t);
  if (!primary || primary.length < 6) return false;

  const hasEsIt =
    /[ñáéíóúü]/i.test(t) ||
    /\b(con|de|la|el|los|las|al|alla|y|e|servido|setas|tomates|boloñesa|española?|ñoquis|lasaña|canelones)\b/i.test(
      t,
    ) ||
    PRIMARY_ES_IT_RE.test(t);

  if (!hasEsIt) return false;

  if (V2_EN_DISH_START_RE.test(t) && TRANSLATION_EN_RE.test(t) && !/[ñáéíóúü]/i.test(t)) {
    return false;
  }
  if (V2_DE_DISH_START_RE.test(t) && TRANSLATION_DE_RE.test(t) && !/[ñáéíóúü]/i.test(t)) {
    return false;
  }
  if (/^(porcini|mushrooms|steinpilz)\b/i.test(t) && !hasEsIt) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && t.length < 14) return false;

  return true;
}

/** Línea de traducción EN/DE/FR asociada a un bloque multilingüe. */
function isV2TranslationLine(line: string, primaryLine?: string): boolean {
  const t = stripV2LanguagePrefix(line);
  if (t.length < 4) return false;
  if (detectTrilingualSectionHeader(line)) return false;
  if (looksLikeSectionHeader(line) || isBlockedSectionLabel(line)) return false;
  if (isParserNoiseLine(line)) return false;
  if (parseSinglePriceLine(line)) return false;
  if (extractNameAndPrice(line)) return false;

  if (primaryLine) {
    const p = stripV2LanguagePrefix(primaryLine);
    if (p && t === p) return true;
    if (isLikelyTranslationLine(t, p)) return true;
  }

  if (isV2PrimaryProductLine(t)) return false;

  if (isLikelyTranslationLine(t, primaryLine ? stripV2LanguagePrefix(primaryLine) : undefined)) {
    return true;
  }

  if (!/[ñáéíóúü]/i.test(t)) {
    if (/\b(with|and|served|cherry|tomatoes|mozzarella|basil|butter|sage|mushrooms|buffalo|spinach|cream|truffle|smoked|salmon|leeks|prawn)\b/i.test(t)) {
      return true;
    }
    if (/\b(mit|und|serviert|kirschtomaten|büffel|salbei|steinpilz|salbeibutter|frischem|frische|gemischten|sahne|spinat|lauch|garnelen|geräuchertem)\b/i.test(t)) {
      return true;
    }
    if (V2_EN_DISH_START_RE.test(t) || V2_DE_DISH_START_RE.test(t)) return true;
    if (primaryLine && isV2PrimaryProductLine(stripV2LanguagePrefix(primaryLine))) return true;
  }

  return false;
}

export type MultilingualBlockV2Result = {
  primaryName: string;
  translationLines: string[];
  translationLineIndexes: number[];
  price: number;
  priceLineIndex: number;
  priceLinesConsumed: number;
  linesConsumed: number;
  prefixJoins: Array<{ prefixLineIndex: number; joinedLineIndex: number; effectiveText: string }>;
};

/** Multilingual Block Parser V2: cabecera trilingüe + principal ES/IT + traducciones + precio. */
export function tryParseMultilingualBlockV2(
  lines: string[],
  startIndex: number,
): MultilingualBlockV2Result | null {
  const resolvedPrimary = resolveV2LineAt(lines, startIndex);
  if (!resolvedPrimary) return null;

  const primaryLine = resolvedPrimary.effectiveText;
  if (!isV2PrimaryProductLine(primaryLine)) return null;

  const primaryName = primaryProductNameFromLine(primaryLine);
  if (!primaryName) return null;

  const translationLines: string[] = [];
  const translationLineIndexes: number[] = [];
  const prefixJoins: MultilingualBlockV2Result["prefixJoins"] = [];
  if (resolvedPrimary.prefixJoined) {
    prefixJoins.push({
      prefixLineIndex: resolvedPrimary.startIndex,
      joinedLineIndex: resolvedPrimary.endIndex,
      effectiveText: primaryLine,
    });
  }

  let cursor = resolvedPrimary.endIndex + 1;

  while (
    cursor < lines.length &&
    translationLines.length < MULTILINGUAL_TRANSLATION_LINES &&
    cursor - startIndex < V2_MAX_RAW_LINES_PER_BLOCK
  ) {
    if (parseStrongOrphanPriceAt(lines, cursor)) break;

    const resolvedNext = resolveV2LineAt(lines, cursor);
    if (!resolvedNext) {
      cursor++;
      continue;
    }
    const nextLine = resolvedNext.effectiveText;
    if (isV2PrimaryProductLine(nextLine)) break;
    if (detectTrilingualSectionHeader(nextLine)) break;
    if (looksLikeSectionHeader(nextLine) || isBlockedSectionLabel(nextLine)) break;

    if (isV2TranslationLine(nextLine, primaryLine)) {
      translationLines.push(normalizeMenuLine(nextLine));
      translationLineIndexes.push(resolvedNext.startIndex);
      if (resolvedNext.prefixJoined) {
        prefixJoins.push({
          prefixLineIndex: resolvedNext.startIndex,
          joinedLineIndex: resolvedNext.endIndex,
          effectiveText: nextLine,
        });
      }
      cursor = resolvedNext.endIndex + 1;
      continue;
    }
    break;
  }

  const priceParsed = parseStrongOrphanPriceAt(lines, cursor);
  if (!priceParsed) return null;

  return {
    primaryName,
    translationLines,
    translationLineIndexes,
    price: priceParsed.price,
    priceLineIndex: cursor,
    priceLinesConsumed: priceParsed.linesConsumed,
    linesConsumed: cursor - startIndex + priceParsed.linesConsumed,
    prefixJoins,
  };
}

function classifyV2OrphanLine(
  line: string,
  pendingNames: Array<{ rawText: string }>,
): "fragment_orphan_blocked" | "fragment_translation_consumed" | null {
  if (isV2LanguagePrefixOnlyLine(line)) return "fragment_orphan_blocked";
  if (detectTrilingualSectionHeader(line)) return "fragment_orphan_blocked";
  if (isV2OrphanNameFragment(line)) return "fragment_orphan_blocked";

  const effective = stripV2LanguagePrefix(line);
  const lastPending = pendingNames[pendingNames.length - 1];
  if (lastPending) {
    const pendingEffective = stripV2LanguagePrefix(lastPending.rawText);
    if (isV2TranslationLine(effective, pendingEffective) && !isV2PrimaryProductLine(effective)) {
      return "fragment_translation_consumed";
    }
    if (shouldSkipOrphanTranslationLine(line, pendingNames)) return "fragment_translation_consumed";
  }

  if (!isV2PrimaryProductLine(effective)) {
    if (V2_EN_DISH_START_RE.test(effective) || V2_DE_DISH_START_RE.test(effective)) {
      if (isV2TranslationLine(effective) || isLikelyTranslationLine(effective)) {
        return "fragment_translation_consumed";
      }
    }
    if (isV2TranslationLine(effective)) return "fragment_translation_consumed";
  }

  if (shouldSkipOrphanTranslationLine(line, pendingNames)) return "fragment_translation_consumed";
  return null;
}

function shouldSkipV2OrphanTranslationLine(
  line: string,
  pendingNames: Array<{ rawText: string }>,
): boolean {
  return classifyV2OrphanLine(line, pendingNames) != null;
}

/**
 * Extrae nombre corto de producto antes de ingredientes OCR.
 * Ej: "Margherita* tomate-mozzarella..." → "Margherita"
 *     "Tonno e Cipolle" → "Tonno e Cipolle"
 */
function extractProductNameFromLine(line: string): string | null {
  const trimmed = line.replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim();
  if (trimmed.length < 3) return null;

  if (trimmed.includes("*")) {
    const before = trimmed.split("*")[0]?.trim() ?? "";
    if (before.length >= 3) return before;
  }

  const words = trimmed.split(/\s+/);
  const nameWords: string[] = [];
  for (const rawWord of words) {
    const word = rawWord.replace(/[,;:.]+$/g, "");
    if (!word) continue;

    if (nameWords.length === 0) {
      if (/^[\d]+[.,]\d+$/.test(word)) return null;
      nameWords.push(word);
      continue;
    }

    if (NAME_CONNECTORS.has(word.toLowerCase())) {
      nameWords.push(word);
      continue;
    }

    if (/^[A-ZÁÉÍÓÚÑ0-9]/.test(word) && !/^[\d]+[.,]\d+$/.test(word)) {
      nameWords.push(word);
      continue;
    }

    break;
  }

  const name = nameWords.join(" ").trim();
  return name.length >= 3 ? name : null;
}

function looksLikeProductNameCandidate(line: string): boolean {
  if (isV2LanguagePrefixOnlyLine(line) || isV2OrphanNameFragment(line)) return false;
  if (isBlockedSectionLabel(line)) return false;
  if (looksLikeSectionHeader(line)) return false;
  if (isParserNoiseLine(line)) return false;
  if (extractNameAndPrice(line)) return false;
  if (isOrphanPriceLine(line)) return false;

  const effective = stripV2LanguagePrefix(line);
  if (isV2TranslationLine(effective) && !isV2PrimaryProductLine(effective)) return false;

  const name = extractProductNameFromLine(effective);
  if (!name || name.length < 4) return false;
  if (isV2OrphanNameFragment(name)) return false;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(name)) return false;
  return true;
}

function pushParsedItem(args: {
  items: ImportedMenuItem[];
  input: ParseMenuTextInput;
  name: string;
  price: number | undefined;
  confidence: number;
  rawText: string;
  description?: string;
  currentSection: string;
  currentCategory: string;
  currentStation: ImportedMenuSuggestedStation;
  forceNeedsReview?: boolean;
  visualLayoutDetected?: boolean;
  multilingualBlockDetected?: boolean;
}): void {
  const station = resolveImportedItemDestination({
    name: args.name,
    sectionName: args.currentSection,
    suggestedCategory: args.currentCategory,
    fallbackStation: args.currentStation,
  });
  const needsReview =
    args.forceNeedsReview ||
    args.price == null ||
    args.confidence < 75 ||
    args.name.length < 4;

  const autoSelectCandidate = {
    name: args.name,
    price: args.price,
    confidence: args.confidence,
    suggestedCategory: args.currentCategory,
    sectionName: args.currentSection,
  };
  const selectedForPublish = args.visualLayoutDetected
    ? shouldAutoSelectVisualImportItem(autoSelectCandidate)
    : args.multilingualBlockDetected
      ? shouldAutoSelectMultilingualImportItem(autoSelectCandidate)
      : !needsReview;

  args.items.push({
    id: uid("item"),
    sourceType: args.input.sourceType,
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    price: args.price,
    sectionName: args.currentSection,
    suggestedCategory: args.currentCategory,
    suggestedStation: station,
    confidence: args.confidence,
    rawText: args.rawText,
    needsReview,
    selectedForPublish,
  });
}

export type { ParseMenuLineEvent, ParseMenuLineOutcome } from "@/lib/carta/menu-import-debug-report-types";

export type ParseMenuTextDiagnostics = {
  ocrLineCount: number;
  lineEvents: ParseMenuLineEvent[];
  unparsedPendingNames: Array<{ name: string; rawText: string; section: string }>;
  columnBlockPairings: ColumnBlockPairing[];
  multilingualBlockPairings: MultilingualBlockPairing[];
  skippedAmbiguousPrices: SkippedAmbiguousPrice[];
  visualLayout?: VisualMenuLayoutDiagnostics;
  parserMode?: "visual_layout" | "text_heuristic";
  /** Líneas OCR con coordenadas recibidas del extractor (solo imágenes). */
  layoutLinesCount?: number;
  /** Bloques producto detectados por parseVisualMenuLayout (aunque no se active visual). */
  visualBlocksCount?: number;
  /** Modo elegido tras evaluar el gate visual. */
  selectedParserMode?: "visual_layout" | "text_heuristic";
  /** Motivo del fallback a text_heuristic (solo diagnóstico). */
  visualParserGateReason?: string;
  /** Productos detectados por parser textual (comparación dual). */
  textItemsCount?: number;
  /** Productos detectados por parser visual candidato. */
  visualItemsCount?: number;
  /** Visual descartado por regla anti-regresión. */
  visualCandidateRejectedReason?: string;
  ocrPageWidth?: number;
};

export type ParseMenuTextInput = {
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
  ocrLayoutLines?: OcrLayoutLine[];
  ocrPageWidth?: number;
  ocrPageHeight?: number;
};

export type ParseMenuTextResult = {
  items: ImportedMenuItem[];
  warnings: string[];
  diagnostics?: ParseMenuTextDiagnostics;
};

function parseMenuTextFromVisualLayout(
  visual: VisualMenuLayoutDiagnostics,
  input: ParseMenuTextInput,
): ParseMenuTextResult {
  const items: ImportedMenuItem[] = [];
  const warnings: string[] = [
    `${visual.visualBlocks.length} producto(s) detectados por layout visual OCR (coordenadas)`,
  ];
  if (visual.discardedTranslationLines.length > 0) {
    warnings.push(
      `${visual.discardedTranslationLines.length} línea(s) de traducción descartadas (layout visual)`,
    );
  }
  if (visual.unpairedTextLines.length > 0) {
    warnings.push(`${visual.unpairedTextLines.length} línea(s) de texto sin emparejar en layout visual`);
  }

  for (const block of visual.visualBlocks) {
    const section = block.sectionName ?? "General";
    pushParsedItem({
      items,
      input,
      name: block.nameLine,
      ...(block.descriptionFromName ? { description: block.descriptionFromName } : {}),
      price: block.price ?? undefined,
      confidence: block.confidence,
      rawText: block.rawLines.join("\n"),
      currentSection: section,
      currentCategory: section,
      currentStation: "kitchen",
      forceNeedsReview: block.needsReview,
      visualLayoutDetected: true,
    });
  }

  const collectDiag = isMenuImportParseDiagnosticsEnabled();
  const layoutLinesCount = input.ocrLayoutLines?.length ?? visual.ocrLinesWithCoords.length;
  return {
    items,
    warnings,
    ...(collectDiag
      ? {
          diagnostics: {
            ocrLineCount: visual.ocrLinesWithCoords.length,
            lineEvents: [],
            unparsedPendingNames: visual.unpairedTextLines.map((l) => ({
              name: l.text,
              rawText: l.text,
              section: "General",
            })),
            columnBlockPairings: [],
            multilingualBlockPairings: [],
            skippedAmbiguousPrices: [],
            visualLayout: visual,
            parserMode: "visual_layout",
            layoutLinesCount,
            visualBlocksCount: visual.visualBlocks.length,
            selectedParserMode: "visual_layout",
            ocrPageWidth: input.ocrPageWidth,
          },
        }
      : {}),
  };
}

export function isMenuImportParseDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.HOSTLY_MENU_IMPORT_DEBUG === "1";
}

/** Visual solo si alcanza mínimo absoluto o no pierde frente al parser textual. */
function shouldSelectVisualParser(visualItemsCount: number, textItemsCount: number): boolean {
  if (visualItemsCount >= 5) return true;
  if (textItemsCount > 0 && visualItemsCount >= textItemsCount * 0.7) return true;
  return false;
}

function attachParserComparisonDiagnostics(
  diagnostics: ParseMenuTextDiagnostics,
  textItemsCount: number,
  visualItemsCount: number,
  selectedParserMode: "visual_layout" | "text_heuristic",
  visualCandidateRejectedReason?: string,
): ParseMenuTextDiagnostics {
  return {
    ...diagnostics,
    textItemsCount,
    visualItemsCount,
    selectedParserMode,
    parserMode: selectedParserMode,
    ...(visualCandidateRejectedReason ? { visualCandidateRejectedReason } : {}),
  };
}

export function parseMenuText(rawText: string, input: ParseMenuTextInput): ParseMenuTextResult {
  const collectDiag = isMenuImportParseDiagnosticsEnabled();
  const layoutLinesCount = input.ocrLayoutLines?.length ?? 0;
  let visualBlocksCount = 0;
  let visualParserGateReason: string | undefined;
  let visualAttempt: VisualMenuLayoutDiagnostics | undefined;

  if (!input.ocrLayoutLines || layoutLinesCount === 0) {
    visualParserGateReason = "no_ocr_layout_lines";
  } else if (layoutLinesCount < 4) {
    visualParserGateReason = "layout_lines_lt_4";
  } else if (typeof input.ocrPageWidth !== "number" || input.ocrPageWidth <= 0) {
    visualParserGateReason = "page_width_invalid";
  } else {
    visualAttempt = parseVisualMenuLayout(
      input.ocrLayoutLines,
      input.ocrPageWidth,
      input.ocrPageHeight ?? 0,
    );
    visualBlocksCount = visualAttempt.visualBlocks.length;
    if (visualBlocksCount < 2) {
      visualParserGateReason = "visual_blocks_lt_2";
    }
  }

  const warnings: string[] = [];
  const lineEvents: ParseMenuLineEvent[] = [];
  const recordLine = (event: ParseMenuLineEvent) => {
    if (collectDiag) lineEvents.push(event);
  };

  const normalized = normalizeOcrText(rawText);
  if (!normalized) {
    return { items: [], warnings: ["Texto vacío tras normalización OCR"] };
  }

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  let currentSection = "General";
  let currentCategory = "General";
  let currentStation: ImportedMenuSuggestedStation = "kitchen";
  const items: ImportedMenuItem[] = [];
  let skippedNoise = 0;
  let orphanPricePairs = 0;
  let orphanPriceColumnPairs = 0;
  let columnBlockPairCount = 0;
  let multilingualBlockCount = 0;
  let multilingualBlockV2Count = 0;
  const columnBlockPairings: ColumnBlockPairing[] = [];
  const multilingualBlockPairings: MultilingualBlockPairing[] = [];
  const skippedAmbiguousPrices: SkippedAmbiguousPrice[] = [];

  type PendingName = {
    name: string;
    rawText: string;
    nameLineIndex: number;
    currentSection: string;
    currentCategory: string;
    currentStation: ImportedMenuSuggestedStation;
  };
  const pendingNames: PendingName[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isParserNoiseLine(line)) {
      skippedNoise++;
      recordLine({ lineIndex: i, text: line, outcome: "noise_skipped", detail: "legal/noise" });
      continue;
    }

    const trilingualHeader = detectTrilingualSectionHeader(line);
    if (trilingualHeader) {
      currentSection = trilingualHeader.sectionName;
      currentCategory = trilingualHeader.category;
      currentStation = resolveImportedItemDestination({
        name: trilingualHeader.sectionName,
        sectionName: trilingualHeader.sectionName,
        suggestedCategory: trilingualHeader.category,
        fallbackStation: "kitchen",
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "multilingual_v2_section_header",
        detail: trilingualHeader.sectionName,
      });
      continue;
    }

    if (looksLikeSectionHeader(line) || isBlockedSectionLabel(line)) {
      const inferred = inferSectionFromLine(line) ?? {
        sectionName: line.replace(/[:：*]/g, "").trim(),
        category: line.replace(/[:：*]/g, "").trim(),
        station: "kitchen" as ImportedMenuSuggestedStation,
      };
      currentSection = inferred.sectionName;
      currentCategory = inferred.category;
      currentStation = inferred.station;
      recordLine({
        lineIndex: i,
        text: line,
        outcome: isBlockedSectionLabel(line) ? "blocked_section" : "section_header",
        detail: inferred.sectionName,
      });
      continue;
    }

    const extracted = extractNameAndPrice(line);
    if (extracted) {
      pushParsedItem({
        items,
        input,
        name: extracted.name,
        price: extracted.price,
        confidence: extracted.confidence,
        rawText: line,
        currentSection,
        currentCategory,
        currentStation,
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "name_price_inline",
        productName: extracted.name,
        price: extracted.price ?? null,
      });
      continue;
    }

    const multilingualBlockV2 = tryParseMultilingualBlockV2(lines, i);
    const v2StealsColumnPairing =
      multilingualBlockV2 != null &&
      pendingNames.length > 0 &&
      multilingualBlockV2.translationLines.length === 0;
    if (multilingualBlockV2 && !v2StealsColumnPairing) {
      const rawParts = lines.slice(i, i + multilingualBlockV2.linesConsumed);
      pushParsedItem({
        items,
        input,
        name: multilingualBlockV2.primaryName,
        price: multilingualBlockV2.price,
        confidence: 76,
        rawText: rawParts.join("\n"),
        currentSection,
        currentCategory,
        currentStation,
        forceNeedsReview: true,
        multilingualBlockDetected: true,
      });
      multilingualBlockPairings.push({
        primaryName: multilingualBlockV2.primaryName,
        price: multilingualBlockV2.price,
        primaryLineIndex: i,
        priceLineIndex: multilingualBlockV2.priceLineIndex,
        translationLines: multilingualBlockV2.translationLines,
        translationLineIndexes: multilingualBlockV2.translationLineIndexes,
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "multilingual_v2_block_matched",
        productName: multilingualBlockV2.primaryName,
        price: multilingualBlockV2.price,
        detail: `translations=${multilingualBlockV2.translationLines.length}`,
      });
      for (const join of multilingualBlockV2.prefixJoins) {
        recordLine({
          lineIndex: join.prefixLineIndex,
          text: lines[join.prefixLineIndex] ?? "",
          outcome: "multilingual_v2_fragment_prefix_joined",
          detail: join.effectiveText,
        });
      }
      for (let t = 0; t < multilingualBlockV2.translationLineIndexes.length; t++) {
        const tIdx = multilingualBlockV2.translationLineIndexes[t]!;
        recordLine({
          lineIndex: tIdx,
          text: lines[tIdx] ?? "",
          outcome: "multilingual_v2_translation_consumed",
          detail: multilingualBlockV2.translationLines[t],
        });
      }
      recordLine({
        lineIndex: multilingualBlockV2.priceLineIndex,
        text: lines[multilingualBlockV2.priceLineIndex] ?? "",
        outcome: "multilingual_v2_block_matched",
        productName: multilingualBlockV2.primaryName,
        price: multilingualBlockV2.price,
        detail: "price_line",
      });
      multilingualBlockV2Count++;
      multilingualBlockCount++;
      i += multilingualBlockV2.linesConsumed - 1;
      continue;
    }

    const multilingualBlock = tryParseMultilingualProductBlock(lines, i);
    if (multilingualBlock) {
      const rawParts = lines.slice(i, i + multilingualBlock.linesConsumed);
      pushParsedItem({
        items,
        input,
        name: multilingualBlock.primaryName,
        price: multilingualBlock.price,
        confidence: 74,
        rawText: rawParts.join("\n"),
        currentSection,
        currentCategory,
        currentStation,
        forceNeedsReview: true,
        multilingualBlockDetected: true,
      });
      multilingualBlockPairings.push({
        primaryName: multilingualBlock.primaryName,
        price: multilingualBlock.price,
        primaryLineIndex: i,
        priceLineIndex: multilingualBlock.priceLineIndex,
        translationLines: multilingualBlock.translationLines,
        translationLineIndexes: multilingualBlock.translationLineIndexes,
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "multilingual_block_matched",
        productName: multilingualBlock.primaryName,
        price: multilingualBlock.price,
        detail: `translations=${multilingualBlock.translationLines.length}`,
      });
      for (let t = 0; t < multilingualBlock.translationLineIndexes.length; t++) {
        const tIdx = multilingualBlock.translationLineIndexes[t]!;
        recordLine({
          lineIndex: tIdx,
          text: lines[tIdx] ?? "",
          outcome: "translation_line_skipped",
          detail: multilingualBlock.translationLines[t],
        });
      }
      recordLine({
        lineIndex: multilingualBlock.priceLineIndex,
        text: lines[multilingualBlock.priceLineIndex] ?? "",
        outcome: "multilingual_block_matched",
        productName: multilingualBlock.primaryName,
        price: multilingualBlock.price,
        detail: "price_line",
      });
      multilingualBlockCount++;
      i += multilingualBlock.linesConsumed - 1;
      continue;
    }

    const priceBlockScan = collectStrongPriceBlockFrom(lines, i);
    for (const skip of priceBlockScan.skipped) {
      skippedAmbiguousPrices.push(skip);
      recordLine({
        lineIndex: skip.lineIndex,
        text: skip.text,
        outcome: "ambiguous_price_skipped",
        detail: skip.reason,
      });
    }

    if (priceBlockScan.strong.length >= 2 && pendingNames.length > 0) {
      const pairCount = Math.min(pendingNames.length, priceBlockScan.strong.length);
      for (let k = 0; k < pairCount; k++) {
        const pending = pendingNames.shift()!;
        const priceEntry = priceBlockScan.strong[k]!;
        const rawParts = [
          pending.rawText,
          ...lines.slice(
            priceEntry.lineIndex,
            priceEntry.lineIndex + priceEntry.linesConsumed,
          ),
        ];
        pushParsedItem({
          items,
          input,
          name: pending.name,
          price: priceEntry.price,
          confidence: 68,
          rawText: rawParts.join("\n"),
          currentSection: pending.currentSection,
          currentCategory: pending.currentCategory,
          currentStation: pending.currentStation,
          forceNeedsReview: true,
        });
        columnBlockPairings.push({
          name: pending.name,
          price: priceEntry.price,
          nameLineIndex: pending.nameLineIndex,
          priceLineIndex: priceEntry.lineIndex,
          priceStrength: priceEntry.strength,
        });
        recordLine({
          lineIndex: priceEntry.lineIndex,
          text: lines[priceEntry.lineIndex] ?? "",
          outcome: "column_block_matched",
          productName: pending.name,
          price: priceEntry.price,
          detail: `block_pair_${k + 1}_of_${pairCount}`,
        });
      }
      columnBlockPairCount += pairCount;
      orphanPriceColumnPairs += pairCount;
      const lastPaired = priceBlockScan.strong[pairCount - 1]!;
      i = lastPaired.lineIndex + lastPaired.linesConsumed - 1;
      continue;
    }

    const orphanPrice = parseStrongOrphanPriceAt(lines, i);
    const deferOrphanForColumnBlock =
      orphanPrice != null &&
      pendingNames.length >= 2 &&
      priceBlockScan.strong.length >= 2;
    if (orphanPrice && pendingNames.length > 0 && !deferOrphanForColumnBlock) {
      const pending = pendingNames.shift()!;
      pushParsedItem({
        items,
        input,
        name: pending.name,
        price: orphanPrice.price,
        confidence: 70,
        rawText: `${pending.rawText}\n${lines.slice(i, i + orphanPrice.linesConsumed).join("\n")}`,
        currentSection: pending.currentSection,
        currentCategory: pending.currentCategory,
        currentStation: pending.currentStation,
        forceNeedsReview: true,
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "orphan_price_matched",
        productName: pending.name,
        price: orphanPrice.price,
        detail: `paired_with_line_${i - 1}`,
      });
      orphanPricePairs++;
      orphanPriceColumnPairs++;
      i += orphanPrice.linesConsumed - 1;
      continue;
    }

    const orphanClass = classifyV2OrphanLine(line, pendingNames);
    if (orphanClass) {
      recordLine({
        lineIndex: i,
        text: line,
        outcome:
          orphanClass === "fragment_orphan_blocked"
            ? "multilingual_v2_fragment_orphan_blocked"
            : "multilingual_v2_fragment_translation_consumed",
        detail: "orphan_translation",
      });
      continue;
    }

    if (looksLikeProductNameCandidate(line) || isMultilingualPrimaryCandidate(line)) {
      const name = isMultilingualPrimaryCandidate(line)
        ? primaryProductNameFromLine(line)
        : extractProductNameFromLine(line);
      if (!name) {
        recordLine({ lineIndex: i, text: line, outcome: "ignored", detail: "name_extract_failed" });
        continue;
      }

      pendingNames.push({
        name,
        rawText: line,
        nameLineIndex: i,
        currentSection,
        currentCategory,
        currentStation,
      });
      recordLine({
        lineIndex: i,
        text: line,
        outcome: "product_name_pending",
        productName: name,
        detail: "awaiting_price_block_or_orphan",
      });
      continue;
    }

    recordLine({ lineIndex: i, text: line, outcome: "ignored", detail: "no_parser_rule" });
  }

  if (skippedNoise > 0) {
    warnings.push(`${skippedNoise} líneas de ruido/legal ignoradas`);
  }
  if (orphanPricePairs > 0) {
    warnings.push(`${orphanPricePairs} producto(s) emparejados por precio huérfano`);
  }
  if (orphanPriceColumnPairs > 0) {
    warnings.push(`${orphanPriceColumnPairs} producto(s) emparejados por columna nombre→precio`);
  }
  if (columnBlockPairCount > 0) {
    warnings.push(`${columnBlockPairCount} producto(s) emparejados por bloque columnar de precios`);
  }
  if (multilingualBlockCount > 0) {
    warnings.push(`${multilingualBlockCount} producto(s) detectados en bloque multilenguaje (nombre principal + traducciones + precio)`);
  }
  if (multilingualBlockV2Count > 0) {
    warnings.push(`${multilingualBlockV2Count} producto(s) detectados por parser multilenguaje V2`);
  }
  if (skippedAmbiguousPrices.length > 0) {
    warnings.push(`${skippedAmbiguousPrices.length} línea(s) numérica(s) omitida(s) como precio ambiguo`);
  }
  if (pendingNames.length > 0) {
    warnings.push(`${pendingNames.length} nombre(s) sin precio emparejado al final del OCR`);
  }
  if (items.length === 0) {
    warnings.push("No se detectaron líneas con precio; revisa rawText manualmente");
  } else if (items.length < 3) {
    warnings.push("Pocos productos detectados; conviene revisar la foto o el OCR");
  }

  void input.menuType;

  if (visualAttempt && visualBlocksCount >= 2) {
    const visualResult = parseMenuTextFromVisualLayout(visualAttempt, input);
    const visualCount = visualResult.items.length;
    const textCount = items.length;

    if (shouldSelectVisualParser(visualCount, textCount)) {
      if (collectDiag && visualResult.diagnostics) {
        visualResult.diagnostics = attachParserComparisonDiagnostics(
          visualResult.diagnostics,
          textCount,
          visualCount,
          "visual_layout",
        );
      }
      return visualResult;
    }

    warnings.push(
      `Parser visual descartado (${visualCount} producto(s) vs ${textCount} heurístico(s)); usando text_heuristic`,
    );

    return {
      items,
      warnings,
      ...(collectDiag
        ? {
            diagnostics: attachParserComparisonDiagnostics(
              {
                ocrLineCount: lines.length,
                lineEvents,
                unparsedPendingNames: pendingNames.map((p) => ({
                  name: p.name,
                  rawText: p.rawText,
                  section: p.currentSection,
                })),
                columnBlockPairings,
                multilingualBlockPairings,
                skippedAmbiguousPrices,
                visualLayout: visualAttempt,
                layoutLinesCount,
                visualBlocksCount,
                visualParserGateReason,
                ocrPageWidth: input.ocrPageWidth,
              },
              textCount,
              visualCount,
              "text_heuristic",
              "visual_underperforms_text",
            ),
          }
        : {}),
    };
  }

  return {
    items,
    warnings,
    ...(collectDiag
      ? {
          diagnostics: {
            ocrLineCount: lines.length,
            lineEvents,
            unparsedPendingNames: pendingNames.map((p) => ({
              name: p.name,
              rawText: p.rawText,
              section: p.currentSection,
            })),
            columnBlockPairings,
            multilingualBlockPairings,
            skippedAmbiguousPrices,
            parserMode: "text_heuristic",
            layoutLinesCount,
            visualBlocksCount,
            selectedParserMode: "text_heuristic",
            visualParserGateReason,
            textItemsCount: items.length,
            visualItemsCount: visualBlocksCount > 0 ? visualBlocksCount : undefined,
            ocrPageWidth: input.ocrPageWidth,
            ...(visualAttempt ? { visualLayout: visualAttempt } : {}),
          },
        }
      : {}),
  };
}

export function groupParsedItemsIntoSections(items: ImportedMenuItem[]): ImportedMenuSection[] {
  const bySection = new Map<string, ImportedMenuItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const name = item.sectionName?.trim() || "General";
    if (!bySection.has(name)) {
      bySection.set(name, []);
      order.push(name);
    }
    bySection.get(name)!.push(item);
  }
  return order.map((name, index) => ({
    id: uid(`section-${index}`),
    name,
    items: bySection.get(name) ?? [],
  }));
}
