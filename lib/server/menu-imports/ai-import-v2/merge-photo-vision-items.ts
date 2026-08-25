import type { ImportedMenuItem, ImportedMenuSection } from "@/lib/carta/imported-menu-types";
import type { AiImportV2ValidatedItem } from "./types";
import { normalizeForOcrMatch } from "@/lib/server/menu-imports/validate-items-against-ocr";

const MIN_RECOVERY_CONFIDENCE = 0.65;

export type PhotoVisionDuplicateMode = "name" | "name_price";

function normalizedName(value: string): string {
  return normalizeForOcrMatch(value).replace(/\s+/g, " ").trim();
}

function normalizedPrice(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function itemKey(name: string, price: number | undefined): string {
  return `${normalizedName(name)}::${normalizedPrice(price) ?? ""}`;
}

function toRecoveredItem(
  item: AiImportV2ValidatedItem,
  index: number,
  idPrefix: string,
  warningTags: readonly string[],
): ImportedMenuItem {
  const confidence = Math.max(0, Math.min(1, item.confidence));
  const warnings = [
    "photo_vision_recovered",
    ...warningTags.map((warning) => warning.trim()).filter(Boolean),
    ...item.operationalWarnings,
  ];
  return {
    id: `${idPrefix}-${String(index + 1).padStart(3, "0")}`,
    sourceType: "image",
    name: item.name.trim(),
    description: item.description.trim() || undefined,
    price: item.price,
    sectionName: item.sectionName.trim() || "General",
    suggestedCategory: item.sectionName.trim() || "General",
    suggestedStation: item.operationalSuggestion.suggestedStation,
    confidence: Math.round(confidence * 100),
    rawText: item.sourceEvidence.join(" · ") || undefined,
    needsReview: confidence < 0.82 || item.operationalWarnings.length > 0,
    selectedForPublish: true,
    aiWarnings: warnings,
    aiConfidence: Math.round(confidence * 100),
    aiEnriched: true,
  };
}

export function mergePhotoVisionItems(params: {
  existingItems: ImportedMenuItem[];
  acceptedVisionItems: AiImportV2ValidatedItem[];
  duplicateMode?: PhotoVisionDuplicateMode;
  idPrefix?: string;
  warningTags?: readonly string[];
}): { items: ImportedMenuItem[]; recoveredCount: number } {
  const duplicateMode = params.duplicateMode ?? "name";
  const idPrefix = params.idPrefix?.trim() || "photo-vision";
  const warningTags = params.warningTags ?? [];
  const existingKeys = new Set(
    params.existingItems.map((item) => itemKey(item.name, item.price)),
  );
  const existingNames = new Set(
    params.existingItems.map((item) => normalizedName(item.name)).filter(Boolean),
  );
  const namesWithUnknownPrice = new Set(
    params.existingItems
      .filter((item) => normalizedPrice(item.price) === null)
      .map((item) => normalizedName(item.name))
      .filter(Boolean),
  );

  const recovered: ImportedMenuItem[] = [];
  for (const item of params.acceptedVisionItems) {
    const name = normalizedName(item.name);
    if (!name || item.confidence < MIN_RECOVERY_CONFIDENCE) continue;
    const key = itemKey(item.name, item.price);
    const price = normalizedPrice(item.price);
    const duplicateByName =
      duplicateMode === "name" ||
      price === null ||
      namesWithUnknownPrice.has(name);
    if (existingKeys.has(key) || (duplicateByName && existingNames.has(name))) continue;

    const converted = toRecoveredItem(item, recovered.length, idPrefix, warningTags);
    recovered.push(converted);
    existingKeys.add(key);
    existingNames.add(name);
    if (price === null) namesWithUnknownPrice.add(name);
  }

  return {
    items: [...params.existingItems, ...recovered],
    recoveredCount: recovered.length,
  };
}

export function groupPhotoVisionMergedItemsIntoSections(
  items: ImportedMenuItem[],
): ImportedMenuSection[] {
  const sections = new Map<string, ImportedMenuItem[]>();
  for (const item of items) {
    const name = item.sectionName.trim() || item.suggestedCategory.trim() || "General";
    const current = sections.get(name) ?? [];
    current.push(item);
    sections.set(name, current);
  }

  return [...sections.entries()].map(([name, sectionItems], index) => ({
    id: `section-${index + 1}`,
    name,
    items: sectionItems,
  }));
}
