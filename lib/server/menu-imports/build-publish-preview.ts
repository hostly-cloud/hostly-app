import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type {
  PublishPreviewAction,
  PublishPreviewBadge,
  PublishPreviewBlockedItem,
  PublishPreviewCreateProduct,
  PublishPreviewMissingCategory,
  PublishPreviewPossibleDuplicate,
  PublishPreviewResult,
} from "@/lib/carta/publish-preview-types";
import type { Firestore } from "firebase-admin/firestore";
import {
  DUPLICATE_ACTION_THRESHOLD,
  evaluateImportItemForPublish,
  hasImportCategoryHint,
} from "./evaluate-import-item-for-publish";
import { getMenuImportDraftAdmin } from "./menu-import-draft-admin";
import { loadCentralProductsAdmin } from "./load-central-products-admin";
import { loadHostlyCartaCategories } from "./load-hostly-carta-categories";
import { logPublishFlowDetected, logPublishFlowSelected } from "./publish-flow-diagnostics";

export class BuildPublishPreviewError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "BuildPublishPreviewError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function buildBadges(args: {
  action: PublishPreviewAction;
  hasCategory: boolean;
  warnings: string[];
}): PublishPreviewBadge[] {
  const badges: PublishPreviewBadge[] = [];
  if (args.action === "create") badges.push("nuevo");
  if (args.action === "possible_duplicate") badges.push("duplicado");
  if (args.action === "review") badges.push("revisar");
  if (args.warnings.some((w) => w.includes("Categoría no encontrada")) || !args.hasCategory) {
    badges.push("sin_categoria");
  }
  return badges;
}

function flattenDraftItems(
  sections: { items: ImportedMenuItem[] }[],
  items: ImportedMenuItem[],
): ImportedMenuItem[] {
  if (items.length > 0) return items;
  return sections.flatMap((s) => s.items);
}

export async function buildMenuImportPublishPreview(params: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  itemIds?: string[];
}): Promise<PublishPreviewResult> {
  const { db, restaurantId } = params;
  const draftId = params.draftId.trim();
  if (!draftId) {
    throw new BuildPublishPreviewError("INVALID_DRAFT_ID", "draftId obligatorio", 400);
  }

  const draft = await getMenuImportDraftAdmin(db, restaurantId, draftId);
  if (!draft) {
    throw new BuildPublishPreviewError("DRAFT_NOT_FOUND", "Borrador no encontrado", 404);
  }
  if (draft.restaurantId !== restaurantId.trim()) {
    throw new BuildPublishPreviewError("TENANT_MISMATCH", "Borrador fuera del tenant", 403);
  }
  if (
    draft.status !== "ready" &&
    draft.status !== "published" &&
    draft.status !== "partially_published"
  ) {
    throw new BuildPublishPreviewError(
      "DRAFT_NOT_READY",
      "El borrador debe estar listo para previsualizar publicación",
      409,
    );
  }

  const allItems = flattenDraftItems(draft.sections, draft.items);
  logPublishFlowDetected({ draftId, restaurantId, allItems });

  const itemIdFilter =
    params.itemIds && params.itemIds.length > 0
      ? new Set(params.itemIds.map((id) => id.trim()).filter(Boolean))
      : null;

  const candidates = allItems.filter((item) => {
    if (!item.selectedForPublish) return false;
    if (!item.name.trim()) return false;
    if (itemIdFilter && !itemIdFilter.has(item.id)) return false;
    return true;
  });

  logPublishFlowSelected({ draftId, candidates });

  const [categories, catalog] = await Promise.all([
    loadHostlyCartaCategories(db, restaurantId),
    loadCentralProductsAdmin(db, restaurantId),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const createProducts: PublishPreviewCreateProduct[] = [];
  const possibleDuplicates: PublishPreviewPossibleDuplicate[] = [];
  const blockedItems: PublishPreviewBlockedItem[] = [];
  const missingCategoryMap = new Map<string, Set<string>>();
  const globalWarnings: string[] = [];

  if (candidates.length === 0) {
    globalWarnings.push("No hay productos seleccionados para publicar");
  }
  if (categories.length === 0) {
    globalWarnings.push("No se encontraron categorías Hostly; todas quedarán sin resolver");
  }

  for (const item of candidates) {
    const evaluation = evaluateImportItemForPublish({
      item,
      menuType: draft.menuType,
      categories,
      categoryNameById,
      catalog,
    });

    if (evaluation.previewBlockReasons.length > 0) {
      blockedItems.push({
        itemId: item.id,
        name: item.name,
        reasons: evaluation.previewBlockReasons,
      });
    }

    if (!evaluation.resolvedCategory && hasImportCategoryHint(item)) {
      const key = item.suggestedCategory.trim() || item.sectionName.trim();
      if (!missingCategoryMap.has(key)) missingCategoryMap.set(key, new Set());
      missingCategoryMap.get(key)!.add(item.id);
    }

    if (evaluation.topDuplicate && evaluation.topDuplicate.score >= DUPLICATE_ACTION_THRESHOLD) {
      possibleDuplicates.push({
        itemId: item.id,
        itemName: item.name,
        existingProductId: evaluation.topDuplicate.productId,
        existingProductName: evaluation.topDuplicate.productName,
        score: evaluation.topDuplicate.score,
        reasons: evaluation.topDuplicate.reasons,
      });
    }

    createProducts.push({
      itemId: item.id,
      name: evaluation.name,
      suggestedCategory: evaluation.suggestedCategory,
      resolvedCategoryId: evaluation.resolvedCategoryId,
      suggestedStation: item.suggestedStation,
      productStation: evaluation.productStation,
      price: evaluation.price,
      action: evaluation.action,
      badges: buildBadges({
        action: evaluation.action,
        hasCategory: evaluation.resolvedCategory != null,
        warnings: evaluation.warnings,
      }),
      warnings: evaluation.warnings,
      confidence: evaluation.confidence,
      selectedForPublish: item.selectedForPublish,
    });
  }

  const missingCategories: PublishPreviewMissingCategory[] = [...missingCategoryMap.entries()].map(
    ([categoryName, ids]) => ({
      categoryName,
      itemIds: [...ids],
    }),
  );

  if (missingCategories.length > 0) {
    globalWarnings.push(
      `${missingCategories.length} categoría(s) sugerida(s) no existen todavía en Hostly`,
    );
  }

  return {
    draftId,
    generatedAt: Date.now(),
    createProducts,
    possibleDuplicates,
    missingCategories,
    warnings: globalWarnings,
    blockedItems,
    totals: {
      createCount: createProducts.filter((r) => r.action === "create").length,
      duplicateCount: createProducts.filter((r) => r.action === "possible_duplicate").length,
      blockedCount: blockedItems.length,
      reviewCount: createProducts.filter((r) => r.action === "review").length,
    },
  };
}
