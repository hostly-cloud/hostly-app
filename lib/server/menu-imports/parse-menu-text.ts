import type {
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
  ImportedMenuSuggestedStation,
} from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";

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
  { re: /\bentrantes?\b/i, section: "Entrantes", category: "Entrantes", station: "kitchen" },
  { re: /\btapas?\b/i, section: "Entrantes", category: "Tapas", station: "kitchen" },
  { re: /\bprincipales?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bsegundos?\b/i, section: "Principales", category: "Principales", station: "kitchen" },
  { re: /\bprimeros?\b/i, section: "Principales", category: "Primeros", station: "kitchen" },
  { re: /\bcervezas?\b/i, section: "Bebidas", category: "Cervezas", station: "bar" },
  { re: /\brefrescos?\b/i, section: "Bebidas", category: "Refrescos", station: "bar" },
];

const NOISE_LINE_RE =
  /\b(iv[aá]|iva incluido|suplemento|al[eé]rgeno|horario|reservas?|tel[eé]fono|www\.|https?:\/\/)\b/i;

/** Cabeceras de sección que no deben emparejarse como producto. */
const SECTION_BLOCKLIST_RE =
  /^(?:pizze\s+(?:gourmet|clasico|classico)|entrantes|postres|principales?|bebidas?|carta|menu|menú)$/i;

const NAME_CONNECTORS = new Set(["e", "y", "de", "del", "la", "el", "con", "&"]);

const ORPHAN_PRICE_ONE_LINE_RE = /^(\d{1,3}[.,]\d{1,2})\s*(?:€|eur)?\s*$/i;
const ORPHAN_PRICE_INT_RE = /^(\d{1,3})\s*$/;
const ORPHAN_PRICE_DECIMAL_PART_RE = /^(\d{2})\s*(?:€|eur)?\s*$/i;

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
  if (NOISE_LINE_RE.test(t)) return false;
  if (/[:：]$/.test(t)) return true;
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t) && t.length >= 4) return true;
  return SECTION_HINTS.some((h) => h.re.test(t));
}

function inferSectionFromLine(line: string): { sectionName: string; category: string; station: ImportedMenuSuggestedStation } | null {
  for (const hint of SECTION_HINTS) {
    if (hint.re.test(line)) {
      return { sectionName: hint.section, category: hint.category, station: hint.station };
    }
  }
  return null;
}

function inferStationFromName(name: string, fallback: ImportedMenuSuggestedStation): ImportedMenuSuggestedStation {
  const n = name.toLowerCase();
  if (/\b(gin|mojito|negroni|margarita|spritz|vermut|cocktail|c[oó]ctel)\b/.test(n)) return "cocktail";
  if (/\b(vino|copa|cerveza|refresco|agua|zumo|caf[eé]|t[eé]|whisky|ron|ginebra)\b/.test(n)) return "bar";
  return fallback;
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

/** Línea con solo precio (13,90 / 15.50) o entero+decimal en dos líneas (14 + 50). */
function parseOrphanPriceAt(
  lines: string[],
  index: number,
): { price: number; linesConsumed: number } | null {
  if (index < 0 || index >= lines.length) return null;
  const line = lines[index]?.trim();
  if (!line) return null;

  const full = line.match(ORPHAN_PRICE_ONE_LINE_RE);
  if (full?.[1]) {
    const price = parsePriceToken(full[1]);
    if (price != null) return { price, linesConsumed: 1 };
  }

  const intPart = line.match(ORPHAN_PRICE_INT_RE);
  const next = lines[index + 1]?.trim();
  if (intPart?.[1] && next) {
    const decPart = next.match(ORPHAN_PRICE_DECIMAL_PART_RE);
    if (decPart?.[1]) {
      const price = parsePriceToken(`${intPart[1]}.${decPart[1]}`);
      if (price != null) return { price, linesConsumed: 2 };
    }
  }

  return null;
}

function isOrphanPriceLine(line: string): boolean {
  return parseOrphanPriceAt([line], 0) != null;
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
  if (isBlockedSectionLabel(line)) return false;
  if (looksLikeSectionHeader(line)) return false;
  if (NOISE_LINE_RE.test(line)) return false;
  if (extractNameAndPrice(line)) return false;
  if (isOrphanPriceLine(line)) return false;

  const name = extractProductNameFromLine(line);
  if (!name || name.length < 4) return false;
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
  currentSection: string;
  currentCategory: string;
  currentStation: ImportedMenuSuggestedStation;
  forceNeedsReview?: boolean;
}): void {
  const station = inferStationFromName(args.name, args.currentStation);
  const needsReview =
    args.forceNeedsReview ||
    args.price == null ||
    args.confidence < 75 ||
    args.name.length < 4;

  args.items.push({
    id: uid("item"),
    sourceType: args.input.sourceType,
    name: args.name,
    price: args.price,
    sectionName: args.currentSection,
    suggestedCategory: args.currentCategory,
    suggestedStation: station,
    confidence: args.confidence,
    rawText: args.rawText,
    needsReview,
    selectedForPublish: !needsReview,
  });
}

export type ParseMenuTextInput = {
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
};

export type ParseMenuTextResult = {
  items: ImportedMenuItem[];
  warnings: string[];
};

export function parseMenuText(rawText: string, input: ParseMenuTextInput): ParseMenuTextResult {
  const warnings: string[] = [];
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

  type PendingName = {
    name: string;
    rawText: string;
    currentSection: string;
    currentCategory: string;
    currentStation: ImportedMenuSuggestedStation;
  };
  const pendingNames: PendingName[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (NOISE_LINE_RE.test(line)) {
      skippedNoise++;
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
      continue;
    }

    const orphanPrice = parseOrphanPriceAt(lines, i);
    if (orphanPrice && pendingNames.length > 0) {
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
      orphanPricePairs++;
      orphanPriceColumnPairs++;
      i += orphanPrice.linesConsumed - 1;
      continue;
    }

    if (looksLikeProductNameCandidate(line)) {
      const name = extractProductNameFromLine(line);
      if (!name) continue;

      const priceAt = parseOrphanPriceAt(lines, i + 1);
      if (priceAt) {
        const rawParts = [line, ...lines.slice(i + 1, i + 1 + priceAt.linesConsumed)];
        pushParsedItem({
          items,
          input,
          name,
          price: priceAt.price,
          confidence: 72,
          rawText: rawParts.join("\n"),
          currentSection,
          currentCategory,
          currentStation,
          forceNeedsReview: true,
        });
        orphanPricePairs++;
        i += priceAt.linesConsumed;
        continue;
      }

      pendingNames.push({
        name,
        rawText: line,
        currentSection,
        currentCategory,
        currentStation,
      });
    }
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
  if (pendingNames.length > 0) {
    warnings.push(`${pendingNames.length} nombre(s) sin precio emparejado al final del OCR`);
  }
  if (items.length === 0) {
    warnings.push("No se detectaron líneas con precio; revisa rawText manualmente");
  } else if (items.length < 3) {
    warnings.push("Pocos productos detectados; conviene revisar la foto o el OCR");
  }

  void input.menuType;
  return { items, warnings };
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
