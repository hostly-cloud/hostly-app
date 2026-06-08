import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { findCartaCategoriaByNameLoose } from "@/lib/modificadores/default-modifier-family";
import { categoryNamesEquivalent } from "./normalize-category-name";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { PublishPreviewAction } from "@/lib/carta/publish-preview-types";
import type { ProductDocument } from "@/lib/firestore/products";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import {
  findImportProductDuplicates,
  type ImportProductDuplicateMatch,
} from "./match-import-product-duplicates";
import { mapImportStationToProduct } from "./map-import-station";

export const LOW_CONFIDENCE_THRESHOLD = 75;
export const BLOCK_CONFIDENCE_THRESHOLD = 55;
export const PUBLISH_MIN_CONFIDENCE = 40;
export const DUPLICATE_ACTION_THRESHOLD = 0.88;
/** Umbral mínimo para auto-seleccionar bloques multilingüe (needsReview puede seguir true). */
export const MULTILINGUAL_AUTO_SELECT_MIN_CONFIDENCE = 70;

export type ItemPublishEvaluation = {
  itemId: string;
  item: ImportedMenuItem;
  name: string;
  suggestedCategory: string;
  resolvedCategory: CartaCategoria | undefined;
  resolvedCategoryId: string | null;
  productStation: string | null;
  price: number | null;
  confidence: number;
  warnings: string[];
  previewBlockReasons: string[];
  publishBlockReasons: string[];
  duplicateMatches: ImportProductDuplicateMatch[];
  topDuplicate: ImportProductDuplicateMatch | undefined;
  action: PublishPreviewAction;
};

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function resolveImportCategory(
  suggestedCategory: string,
  categories: CartaCategoria[],
): CartaCategoria | undefined {
  const trimmed = suggestedCategory.trim();
  if (!trimmed) return undefined;

  const loose = findCartaCategoriaByNameLoose(categories, trimmed);
  if (loose) return loose;

  const n = norm(trimmed);
  return categories.find((c) => {
    if (categoryNamesEquivalent(c.name, trimmed)) return true;
    const cn = norm(c.name);
    return cn.includes(n) || n.includes(cn);
  });
}

/**
 * Resuelve categoría Hostly para un ítem importado.
 * Prioridad: suggestedCategory (IA/parser) → sectionName (cabecera OCR) si la primera no matchea.
 */
export function resolveImportCategoryForItem(
  item: Pick<ImportedMenuItem, "suggestedCategory" | "sectionName">,
  categories: CartaCategoria[],
): CartaCategoria | undefined {
  const fromSuggested = resolveImportCategory(item.suggestedCategory, categories);
  if (fromSuggested) return fromSuggested;

  const sectionName = item.sectionName.trim();
  const suggestedCategory = item.suggestedCategory.trim();
  if (!sectionName || sectionName === suggestedCategory) return undefined;

  return resolveImportCategory(item.sectionName, categories);
}

export function itemConfidence(item: ImportedMenuItem): number {
  return item.aiConfidence ?? item.confidence;
}

function isSuspiciousPrice(price: number | undefined): string | null {
  if (price == null || !Number.isFinite(price)) return "Precio ausente";
  if (price <= 0) return "Precio cero o negativo";
  if (price > 500) return "Precio inusualmente alto";
  return null;
}

export function isValidPublishPrice(price: number | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export function hasImportCategoryHint(
  item: Pick<ImportedMenuItem, "suggestedCategory" | "sectionName">,
): boolean {
  return Boolean(item.suggestedCategory.trim() || item.sectionName.trim());
}

/** Bloqueo duro: no auto-seleccionar ni publicar. */
export function isCriticalImportPublishBlock(
  item: Pick<
    ImportedMenuItem,
    "name" | "price" | "confidence" | "aiConfidence" | "duplicateOf"
  >,
): boolean {
  if (!item.name.trim()) return true;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(item.name.trim())) return true;
  if (!isValidPublishPrice(item.price)) return true;
  const conf = item.aiConfidence ?? item.confidence;
  if (conf < BLOCK_CONFIDENCE_THRESHOLD) return true;
  if (item.duplicateOf) return true;
  return false;
}

/** Auto-selección por defecto para ítems del parser visual (needsReview sigue true). */
export function shouldAutoSelectVisualImportItem(
  item: Pick<
    ImportedMenuItem,
    "name" | "price" | "confidence" | "aiConfidence" | "duplicateOf" | "suggestedCategory" | "sectionName"
  >,
): boolean {
  if (isCriticalImportPublishBlock(item)) return false;
  if (!hasImportCategoryHint(item)) return false;
  return true;
}

/** Auto-selección para bloques multilingüe V1/V2: nombre, precio y categoría válidos; confianza ≥ 70. */
export function shouldAutoSelectMultilingualImportItem(
  item: Pick<
    ImportedMenuItem,
    "name" | "price" | "confidence" | "aiConfidence" | "duplicateOf" | "suggestedCategory" | "sectionName"
  >,
): boolean {
  if (!item.name.trim()) return false;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(item.name.trim())) return false;
  if (!isValidPublishPrice(item.price)) return false;
  if (!hasImportCategoryHint(item)) return false;
  const conf = item.aiConfidence ?? item.confidence;
  if (conf < MULTILINGUAL_AUTO_SELECT_MIN_CONFIDENCE) return false;
  if (item.duplicateOf) return false;
  return true;
}

/** Tras enriquecimiento IA: conservar selección visual si no hay bloqueo crítico. */
export function resolveImportSelectedForPublish(
  item: ImportedMenuItem,
  needsReview: boolean,
  extraCritical = false,
): boolean {
  if (extraCritical || isCriticalImportPublishBlock(item)) return false;
  if (!hasImportCategoryHint(item)) return false;
  if (item.selectedForPublish) return true;
  return !needsReview;
}

function collectItemWarnings(
  item: ImportedMenuItem,
  resolvedCategory: CartaCategoria | undefined,
): string[] {
  const warnings: string[] = [];
  const conf = itemConfidence(item);

  if (conf < LOW_CONFIDENCE_THRESHOLD) warnings.push(`Confianza baja (${conf}%)`);
  if (item.needsReview) warnings.push("Marcado para revisión humana");
  if (item.duplicateOf) warnings.push("Duplicado detectado en el borrador");
  if (item.aiWarnings?.length) warnings.push(...item.aiWarnings.slice(0, 3));

  const priceWarning = isSuspiciousPrice(item.price);
  if (priceWarning) warnings.push(priceWarning);

  if (hasImportCategoryHint(item) && !resolvedCategory) {
    warnings.push("Categoría no encontrada en Hostly");
  }
  if (item.suggestedStation === "none") {
    warnings.push("Sin estación operativa asignada");
  }

  return warnings;
}

function previewBlockReasons(item: ImportedMenuItem, warnings: string[]): string[] {
  const reasons: string[] = [];
  if (!item.name.trim()) reasons.push("Nombre vacío");
  if (itemConfidence(item) < BLOCK_CONFIDENCE_THRESHOLD) {
    reasons.push(`Confianza crítica (${itemConfidence(item)}%)`);
  }
  if (item.duplicateOf) reasons.push("Duplicado interno del borrador");
  if (warnings.some((w) => w === "Precio cero o negativo")) {
    reasons.push("Precio inválido");
  }
  return reasons;
}

function publishBlockReasons(
  item: ImportedMenuItem,
  resolvedCategory: CartaCategoria | undefined,
  topDuplicate: ImportProductDuplicateMatch | undefined,
  confirmDuplicates: Set<string>,
): string[] {
  const reasons: string[] = [];
  if (!item.name.trim()) reasons.push("Nombre vacío");
  if (!isValidPublishPrice(item.price)) reasons.push("Precio inválido o ausente");
  if (!resolvedCategory) reasons.push("Categoría inexistente");
  if (itemConfidence(item) < PUBLISH_MIN_CONFIDENCE) {
    reasons.push(`Confianza demasiado baja (${itemConfidence(item)}%)`);
  }
  if (item.duplicateOf) reasons.push("Duplicado interno del borrador");
  if (topDuplicate && topDuplicate.score >= DUPLICATE_ACTION_THRESHOLD && !confirmDuplicates.has(item.id)) {
    reasons.push("Duplicado de catálogo sin confirmar");
  }
  return reasons;
}

export function evaluateImportItemForPublish(args: {
  item: ImportedMenuItem;
  menuType: MenuImportMenuType;
  categories: CartaCategoria[];
  categoryNameById: Map<string, string>;
  catalog: ProductDocument[];
  confirmDuplicates?: Set<string>;
}): ItemPublishEvaluation {
  const confirmDuplicates = args.confirmDuplicates ?? new Set<string>();
  const resolvedCategory = resolveImportCategoryForItem(args.item, args.categories);
  const warnings = collectItemWarnings(args.item, resolvedCategory);
  const previewBlocks = previewBlockReasons(args.item, warnings);

  const duplicateMatches = findImportProductDuplicates({
    item: args.item,
    menuType: args.menuType,
    categoryId: resolvedCategory?.id ?? null,
    categoryNameById: args.categoryNameById,
    catalog: args.catalog,
  });
  const topDuplicate = duplicateMatches[0];

  const pubBlocks = publishBlockReasons(args.item, resolvedCategory, topDuplicate, confirmDuplicates);

  let action: PublishPreviewAction = "create";
  if (previewBlocks.length > 0) {
    action = "review";
  } else if (topDuplicate && topDuplicate.score >= DUPLICATE_ACTION_THRESHOLD) {
    action = "possible_duplicate";
  } else if (
    args.item.needsReview ||
    itemConfidence(args.item) < LOW_CONFIDENCE_THRESHOLD ||
    !resolvedCategory ||
    warnings.some((w) => w.startsWith("Precio"))
  ) {
    action = "review";
  }

  const price =
    typeof args.item.price === "number" && Number.isFinite(args.item.price) ? args.item.price : null;

  return {
    itemId: args.item.id,
    item: args.item,
    name: args.item.name.trim(),
    suggestedCategory:
      args.item.suggestedCategory.trim() || args.item.sectionName.trim() || "General",
    resolvedCategory,
    resolvedCategoryId: resolvedCategory?.id ?? null,
    productStation: mapImportStationToProduct(args.item.suggestedStation),
    price,
    confidence: itemConfidence(args.item),
    warnings,
    previewBlockReasons: previewBlocks,
    publishBlockReasons: pubBlocks,
    duplicateMatches,
    topDuplicate,
    action,
  };
}

export type PublishConfirmationSets = {
  confirmDuplicates: Set<string>;
  confirmReviews: Set<string>;
};

export function isReviewConfirmedForPublish(
  evaluation: ItemPublishEvaluation,
  confirmations: PublishConfirmationSets,
): boolean {
  if (confirmations.confirmReviews.has(evaluation.itemId)) return true;
  return evaluation.item.selectedForPublish === true;
}

export function canPublishEvaluation(
  evaluation: ItemPublishEvaluation,
  confirmations: PublishConfirmationSets,
): boolean {
  if (evaluation.publishBlockReasons.length > 0) return false;
  if (evaluation.action === "create") return true;
  if (
    evaluation.action === "possible_duplicate" &&
    confirmations.confirmDuplicates.has(evaluation.itemId)
  ) {
    return true;
  }
  if (evaluation.action === "review" && isReviewConfirmedForPublish(evaluation, confirmations)) {
    return true;
  }
  return false;
}

export function publishSkipMessage(
  evaluation: ItemPublishEvaluation,
  confirmations: PublishConfirmationSets,
): string {
  if (evaluation.publishBlockReasons.length > 0) {
    return evaluation.publishBlockReasons.join("; ");
  }
  if (evaluation.action === "review" && !isReviewConfirmedForPublish(evaluation, confirmations)) {
    return "Revisión humana sin confirmar";
  }
  if (
    evaluation.action === "possible_duplicate" &&
    !confirmations.confirmDuplicates.has(evaluation.itemId)
  ) {
    return "Duplicado de catálogo sin confirmar";
  }
  return "No apto para publicación";
}

export { normalizeProductName };
