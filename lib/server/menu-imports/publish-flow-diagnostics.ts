import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { ItemPublishEvaluation } from "./evaluate-import-item-for-publish";

const LOG_PREFIX = "[HOSTLY_PUBLISH_DIAG]";

export function isPublishFlowDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.HOSTLY_MENU_IMPORT_DEBUG === "1";
}

function summarizeItem(item: ImportedMenuItem) {
  return {
    id: item.id,
    name: item.name,
    price: item.price ?? null,
    needsReview: item.needsReview,
    selectedForPublish: item.selectedForPublish,
    publishStatus: item.publishStatus ?? null,
    suggestedCategory: item.suggestedCategory,
  };
}

function summarizeEvaluation(evaluation: ItemPublishEvaluation) {
  return {
    action: evaluation.action,
    resolvedCategoryId: evaluation.resolvedCategoryId,
    publishBlockReasons: evaluation.publishBlockReasons,
    warnings: evaluation.warnings.slice(0, 5),
  };
}

export function logPublishFlowDetected(params: {
  draftId: string;
  restaurantId: string;
  allItems: ImportedMenuItem[];
}) {
  if (!isPublishFlowDiagnosticsEnabled()) return;
  console.log(`${LOG_PREFIX} productos detectados`, {
    draftId: params.draftId,
    restaurantId: params.restaurantId,
    detectedCount: params.allItems.length,
    selectedForPublishCount: params.allItems.filter((item) => item.selectedForPublish).length,
    needsReviewCount: params.allItems.filter((item) => item.needsReview).length,
    count: params.allItems.length,
    items: params.allItems.map(summarizeItem),
  });
}

export function logPublishFlowSelected(params: {
  draftId: string;
  candidates: ImportedMenuItem[];
}) {
  if (!isPublishFlowDiagnosticsEnabled()) return;
  console.log(`${LOG_PREFIX} productos seleccionados (selectedForPublish=true)`, {
    draftId: params.draftId,
    count: params.candidates.length,
    items: params.candidates.map(summarizeItem),
  });
}

export function logPublishFlowCandidateEvaluation(params: {
  draftId: string;
  item: ImportedMenuItem;
  evaluation: ItemPublishEvaluation;
  canPublish: boolean;
  skipMessage?: string;
}) {
  if (!isPublishFlowDiagnosticsEnabled()) return;
  console.log(`${LOG_PREFIX} evaluación candidato`, {
    draftId: params.draftId,
    item: summarizeItem(params.item),
    evaluation: summarizeEvaluation(params.evaluation),
    canPublish: params.canPublish,
    skipMessage: params.skipMessage ?? null,
  });
}

export function logPublishFlowPendingWrites(params: {
  draftId: string;
  count: number;
  itemIds: string[];
  names: string[];
}) {
  if (!isPublishFlowDiagnosticsEnabled()) return;
  console.log(`${LOG_PREFIX} productos enviados a publicar (pendingWrites)`, {
    draftId: params.draftId,
    pendingWritesCount: params.count,
    count: params.count,
    itemIds: params.itemIds,
    names: params.names,
  });
}

export function logPublishFlowCreated(params: {
  draftId: string;
  created: Array<{ itemId: string; itemName: string; productId: string }>;
  skipped: Array<{ itemId: string; itemName: string; message?: string }>;
  alreadyPublished: number;
  errors: number;
  confirmReviews: string[];
  confirmDuplicates: string[];
}) {
  if (!isPublishFlowDiagnosticsEnabled()) return;
  console.log(`${LOG_PREFIX} resultado publicación`, {
    draftId: params.draftId,
    createdCount: params.created.length,
    createdProductIds: params.created.map((r) => r.productId),
    skippedReasons: params.skipped.map((row) => ({
      itemId: row.itemId,
      name: row.itemName,
      message: row.message ?? null,
    })),
    created: params.created,
    skippedCount: params.skipped.length,
    skipped: params.skipped,
    alreadyPublishedCount: params.alreadyPublished,
    errorCount: params.errors,
    confirmReviews: params.confirmReviews,
    confirmDuplicates: params.confirmDuplicates,
  });
}
