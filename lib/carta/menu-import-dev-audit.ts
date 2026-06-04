import type { MenuImportDraftSummary } from "@/lib/firestore/menu-import-drafts";

/** Logs de auditoría solo en desarrollo; no usar en producción. */
export function logMenuImportDevAudit(args: {
  restaurantId: string;
  drafts: readonly MenuImportDraftSummary[];
  centralProductCount: number | null;
  centralFetchError?: string | null;
}): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;

  console.group("[Hostly][Importación IA] auditoría dev");
  console.log("restaurantId", args.restaurantId);
  console.log("centralProducts.count", args.centralProductCount);
  if (args.centralFetchError) {
    console.warn("centralProducts.error", args.centralFetchError);
  }
  if (args.drafts.length === 0) {
    console.log("menuImportDrafts", "(sin borradores)");
  } else {
    for (const draft of args.drafts) {
      console.log({
        draftId: draft.id,
        fileName: draft.originalFileName?.trim() || draft.sourceUrl?.trim() || null,
        status: draft.status,
        "items.length": draft.itemsCount,
        "sections.length": draft.sectionsCount,
        publishedItemsCount: draft.publishedItemsCount ?? 0,
        updatedAt: draft.updatedAt,
        errorMessage: draft.errorMessage ?? null,
      });
    }
  }
  console.groupEnd();
}
