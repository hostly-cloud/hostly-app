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

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeOcrText(rawText: string): string {
  return rawText
    .replace(/\r/g, "\n")
    .replace(/[|¦]/g, "I")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  for (const line of lines) {
    if (NOISE_LINE_RE.test(line)) {
      skippedNoise++;
      continue;
    }

    if (looksLikeSectionHeader(line)) {
      const inferred = inferSectionFromLine(line) ?? {
        sectionName: line.replace(/[:：]$/, "").trim(),
        category: line.replace(/[:：]$/, "").trim(),
        station: "kitchen" as ImportedMenuSuggestedStation,
      };
      currentSection = inferred.sectionName;
      currentCategory = inferred.category;
      currentStation = inferred.station;
      continue;
    }

    const extracted = extractNameAndPrice(line);
    if (!extracted) continue;

    const station = inferStationFromName(extracted.name, currentStation);
    const needsReview = extracted.price == null || extracted.confidence < 75 || extracted.name.length < 4;

    items.push({
      id: uid("item"),
      sourceType: input.sourceType,
      name: extracted.name,
      price: extracted.price,
      sectionName: currentSection,
      suggestedCategory: currentCategory,
      suggestedStation: station,
      confidence: extracted.confidence,
      rawText: line,
      needsReview,
      selectedForPublish: !needsReview,
    });
  }

  if (skippedNoise > 0) {
    warnings.push(`${skippedNoise} líneas de ruido/legal ignoradas`);
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
