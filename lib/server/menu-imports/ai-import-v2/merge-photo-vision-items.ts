import type { ImportedMenuItem, ImportedMenuSection } from "@/lib/carta/imported-menu-types";
import type { AiImportV2ValidatedItem } from "./types";
import { normalizeForOcrMatch } from "@/lib/server/menu-imports/validate-items-against-ocr";

const MIN_RECOVERY_CONFIDENCE = 0.65;

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

function toRecoveredItem(item: AiImportV2ValidatedItem, index: number): ImportedMenuItem {
  const confidence = Math.max(0, Math.min(1, item.confidence));
  const warnings = ["photo_vision_recovered", ...item.operationalWarnings];
  return {
    id: `photo-vision-${String(index + 1).padStart(3, "0")}`,
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
}): { items: ImportedMenuItem[]; recoveredCount: number } {
  const existingKeys = new Set(
    params.existingItems.map((item) => itemKey(item.name, item.price)),
  );
  const existingNames = new Set(
    params.existingItems.map((item) => normalizedName(item.name)).filter(Boolean),
  );

  const recovered: ImportedMenuItem[] = [];
  for (const item of params.acceptedVisionItems) {
    const name = normalizedName(item.name);
    if (!name || item.confidence < MIN_RECOVERY_CONFIDENCE) continue;
    const key = itemKey(item.name, item.price);
    if (existingKeys.has(key) || existingNames.has(name)) continue;

    const converted = toRecoveredItem(item, recovered.length);
    recovered.push(converted);
    existingKeys.add(key);
    existingNames.add(name);
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
