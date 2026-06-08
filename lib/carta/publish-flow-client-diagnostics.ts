import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { PublishPreviewResult } from "@/lib/carta/publish-preview-types";
import type { MenuImportPublishResult } from "@/lib/carta/publish-result-types";

const LOG_PREFIX = "[HOSTLY_PUBLISH_DIAG]";

function isEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function summarizeDraftItem(item: ImportedMenuItem) {
  return {
    id: item.id,
    name: item.name,
    selectedForPublish: item.selectedForPublish,
    needsReview: item.needsReview,
    suggestedCategory: item.suggestedCategory,
    price: item.price ?? null,
  };
}

export function logClientPublishDraftState(params: {
  draftId: string;
  items: ImportedMenuItem[];
  confirmReviews: string[];
  confirmDuplicates: string[];
}) {
  if (!isEnabled()) return;
  const selected = params.items.filter((item) => item.selectedForPublish);
  console.log(`${LOG_PREFIX} [client] borrador antes de publicar`, {
    draftId: params.draftId,
    detectedCount: params.items.length,
    selectedCount: selected.length,
    selectedItems: selected.map(summarizeDraftItem),
    needsReviewCount: params.items.filter((item) => item.needsReview).length,
    confirmReviews: params.confirmReviews,
    confirmDuplicates: params.confirmDuplicates,
  });
}

export function logClientPublishPreview(params: {
  draftId: string;
  preview: PublishPreviewResult;
  publishableCount: number;
  confirmReviews: string[];
}) {
  if (!isEnabled()) return;
  console.log(`${LOG_PREFIX} [client] preview generado`, {
    draftId: params.draftId,
    previewRows: params.preview.createProducts.length,
    publishableCount: params.publishableCount,
    totals: params.preview.totals,
    rows: params.preview.createProducts.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      action: row.action,
      resolvedCategoryId: row.resolvedCategoryId,
      warnings: row.warnings,
    })),
    confirmReviews: params.confirmReviews,
  });
}

export function logClientPublishRequest(params: {
  draftId: string;
  confirmReviews: string[];
  confirmDuplicates: string[];
  publishableCount: number;
}) {
  if (!isEnabled()) return;
  console.log(`${LOG_PREFIX} [client] enviando POST /api/menu-imports/publish`, params);
}

export function logClientPublishResponse(params: {
  draftId: string;
  result: MenuImportPublishResult;
}) {
  if (!isEnabled()) return;
  console.log(`${LOG_PREFIX} [client] respuesta publicación`, {
    draftId: params.draftId,
    totals: params.result.totals,
    createdIds: params.result.created.map((row) => row.productId).filter(Boolean),
    created: params.result.created,
    skipped: params.result.skipped,
    errors: params.result.errors,
  });
}
