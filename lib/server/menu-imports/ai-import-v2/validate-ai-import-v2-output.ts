import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { IMPORTED_MENU_STATION_OPTIONS } from "@/lib/carta/imported-menu-types";
import { isProductFamilyType } from "@/lib/carta/product-family-types";
import {
  isProductNameSupportedByOcr,
  normalizeForOcrMatch,
} from "@/lib/server/menu-imports/validate-items-against-ocr";
import type {
  AiImportV2Extraction,
  AiImportV2OperationalSuggestion,
  AiImportV2ValidatedItem,
  AiImportV2ValidationResult,
} from "./types";

const SECTION_HEADER_RE = /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s&'’\-]{2,}$/;
const TRANSLATION_LINE_RE = /^\([^)]{4,}\)\s*$/;

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

function clampConfidence(raw: unknown, fallback = 0.5): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
}

function priceVariants(price: number): string[] {
  const rounded = roundPrice(price);
  const intPart = Math.floor(rounded);
  const cents = Math.round((rounded - intPart) * 100);
  const centsStr = String(cents).padStart(2, "0");
  const variants = new Set<string>();

  variants.add(String(rounded));
  variants.add(rounded.toFixed(2));
  variants.add(`${intPart},${centsStr}`);
  variants.add(`${intPart}.${centsStr}`);
  if (cents === 0) {
    variants.add(String(intPart));
    variants.add(`${intPart},-`);
    variants.add(`${intPart}.-`);
  }
  return [...variants];
}

export function isPriceSupportedByOcr(price: number, rawText: string): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const ocrNorm = normalizeForOcrMatch(rawText);
  if (!ocrNorm) return false;

  for (const variant of priceVariants(price)) {
    const norm = normalizeForOcrMatch(variant);
    if (norm && ocrNorm.includes(norm)) return true;
  }

  const compact = rawText.replace(/\s/g, "");
  for (const variant of priceVariants(price)) {
    const v = variant.replace(/[,\s]/g, "");
    if (v.length >= 2 && compact.includes(v)) return true;
  }

  return false;
}

export function isEvidenceInOcr(evidence: string, rawText: string): boolean {
  const snippet = evidence.trim();
  if (snippet.length < 2) return false;
  const ocrNorm = normalizeForOcrMatch(rawText);
  const evNorm = normalizeForOcrMatch(snippet);
  if (!evNorm) return false;
  if (ocrNorm.includes(evNorm)) return true;

  const ocrCompact = rawText.replace(/[^\d\p{L}]/gu, "").toLowerCase();
  const evCompact = snippet.replace(/[^\d\p{L}]/gu, "").toLowerCase();
  return evCompact.length >= 3 && ocrCompact.includes(evCompact);
}

function looksLikeSectionHeader(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 48) return false;
  if (/\d/.test(trimmed)) return false;
  return SECTION_HEADER_RE.test(trimmed);
}

function looksLikeTranslationProduct(name: string): boolean {
  const trimmed = name.trim();
  if (TRANSLATION_LINE_RE.test(trimmed)) return true;
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return true;
  return false;
}

function buildOperationalWarnings(
  suggestion: AiImportV2OperationalSuggestion,
): string[] {
  const warnings: string[] = [];

  if (suggestion.categoryType === "food" && suggestion.productFamilyType !== "food") {
    warnings.push("food_category_family_mismatch");
  }
  if (suggestion.categoryType === "drink" && suggestion.productFamilyType !== "drink") {
    warnings.push("drink_category_family_mismatch");
  }
  if (suggestion.suggestedStation === "kitchen" && suggestion.categoryType === "drink") {
    warnings.push("drink_routed_to_kitchen");
  }
  if (
    (suggestion.suggestedStation === "bar" || suggestion.suggestedStation === "cocktail") &&
    suggestion.categoryType === "food"
  ) {
    warnings.push("food_routed_to_bar");
  }
  if (suggestion.confidence < 0.55) {
    warnings.push("low_operational_confidence");
  }

  return warnings;
}

function validateItem(
  item: AiImportV2ValidatedItem,
  rawText: string,
  sectionNames: Set<string>,
): string[] {
  const reasons: string[] = [];

  if (!item.name.trim()) reasons.push("empty_name");
  if (!Number.isFinite(item.price) || item.price <= 0) reasons.push("missing_or_invalid_price");
  if (!isProductNameSupportedByOcr(item.name, rawText)) reasons.push("name_not_in_ocr");
  if (Number.isFinite(item.price) && item.price > 0 && !isPriceSupportedByOcr(item.price, rawText)) {
    reasons.push("price_not_in_ocr");
  }
  if (!Array.isArray(item.sourceEvidence) || item.sourceEvidence.length === 0) {
    reasons.push("missing_source_evidence");
  } else {
    for (const ev of item.sourceEvidence) {
      if (!isEvidenceInOcr(ev, rawText)) {
        reasons.push(`evidence_not_in_ocr:${ev.slice(0, 40)}`);
        break;
      }
    }
  }
  if (looksLikeSectionHeader(item.name)) reasons.push("section_header_as_product");
  if (sectionNames.has(normalizeForOcrMatch(item.name))) reasons.push("duplicate_section_name");
  if (looksLikeTranslationProduct(item.name)) reasons.push("translation_as_product");

  return reasons;
}

export function validateAiImportV2Output(
  extraction: AiImportV2Extraction,
  rawText: string,
): AiImportV2ValidationResult {
  const accepted: AiImportV2ValidatedItem[] = [];
  const rejected: AiImportV2ValidatedItem[] = [];
  const globalWarnings: string[] = [];

  const sectionNames = new Set(
    extraction.sections.map((s) => normalizeForOcrMatch(s.name)).filter(Boolean),
  );

  for (const section of extraction.sections) {
    for (const item of section.items) {
      const validated: AiImportV2ValidatedItem = {
        ...item,
        sectionName: section.name,
        validationStatus: "accepted",
        rejectionReasons: [],
        operationalWarnings: buildOperationalWarnings(item.operationalSuggestion),
      };
      const reasons = validateItem(validated, rawText, sectionNames);
      if (reasons.length > 0) {
        validated.validationStatus = "rejected";
        validated.rejectionReasons = reasons;
        rejected.push(validated);
      } else {
        accepted.push(validated);
      }
    }
  }

  if (accepted.length === 0 && extraction.sections.some((s) => s.items.length > 0)) {
    globalWarnings.push("Todos los items IA V2 rechazados por validación anti-invención");
  }

  const operationalReviewCount = accepted.filter((item) => item.operationalWarnings.length > 0).length;
  if (operationalReviewCount > 0) {
    globalWarnings.push(
      `${operationalReviewCount} item(s) requieren revisión de sugerencias operativas`,
    );
  }

  return { accepted, rejected, globalWarnings };
}

function parseOperationalSuggestion(raw: unknown): AiImportV2OperationalSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!isCartaCategoriaTipo(rec.categoryType)) return null;
  if (!isProductFamilyType(rec.productFamilyType)) return null;
  if (
    typeof rec.suggestedStation !== "string" ||
    !IMPORTED_MENU_STATION_OPTIONS.includes(
      rec.suggestedStation as (typeof IMPORTED_MENU_STATION_OPTIONS)[number],
    )
  ) {
    return null;
  }

  return {
    categoryType: rec.categoryType,
    productFamilyType: rec.productFamilyType,
    suggestedStation: rec.suggestedStation as AiImportV2OperationalSuggestion["suggestedStation"],
    confidence: clampConfidence(rec.confidence, 0.4),
  };
}

export function parseAiImportV2Payload(raw: unknown): AiImportV2Extraction | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.sections)) return null;

  const sections = rec.sections
    .map((sectionRaw) => {
      if (!sectionRaw || typeof sectionRaw !== "object") return null;
      const section = sectionRaw as Record<string, unknown>;
      const name = typeof section.name === "string" ? section.name.trim() : "";
      if (!Array.isArray(section.items)) return null;

      const items = section.items
        .map((itemRaw) => {
          if (!itemRaw || typeof itemRaw !== "object") return null;
          const item = itemRaw as Record<string, unknown>;
          const itemName = typeof item.name === "string" ? item.name.trim() : "";
          const price =
            typeof item.price === "number" && Number.isFinite(item.price)
              ? roundPrice(item.price)
              : typeof item.price === "string"
                ? roundPrice(Number(item.price.replace(",", ".")))
                : NaN;
          if (!itemName || !Number.isFinite(price)) return null;

          const confidence = clampConfidence(item.confidence);
          const description = typeof item.description === "string" ? item.description.trim() : "";
          const translations = Array.isArray(item.translations)
            ? item.translations
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
          const sourceEvidence = Array.isArray(item.sourceEvidence)
            ? item.sourceEvidence
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
          const operationalSuggestion = parseOperationalSuggestion(item.operationalSuggestion);
          if (!operationalSuggestion) return null;

          return {
            name: itemName,
            description,
            translations,
            price,
            confidence,
            sourceEvidence,
            operationalSuggestion,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item != null);

      return { name: name || "General", items };
    })
    .filter((section): section is NonNullable<typeof section> => section != null);

  return { sections };
}
