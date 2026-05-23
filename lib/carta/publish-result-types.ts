export type MenuImportPublishItemOutcome =
  | "created"
  | "already_published"
  | "skipped"
  | "confirmed_duplicate"
  | "error";

export type MenuImportPublishItemResult = {
  itemId: string;
  itemName: string;
  outcome: MenuImportPublishItemOutcome;
  productId?: string;
  message?: string;
  /** Producto en catálogo central (`restaurants/{id}/products`); TPV lo lee vía listener. */
  visibleInTpv?: boolean;
};

export type MenuImportPublishResult = {
  draftId: string;
  publishedAt: number;
  draftStatus: "ready" | "partially_published" | "published";
  created: MenuImportPublishItemResult[];
  skipped: MenuImportPublishItemResult[];
  alreadyPublished: MenuImportPublishItemResult[];
  confirmedDuplicates: MenuImportPublishItemResult[];
  errors: MenuImportPublishItemResult[];
  totals: {
    createdCount: number;
    skippedCount: number;
    alreadyPublishedCount: number;
    confirmedDuplicateCount: number;
    errorCount: number;
  };
};

export type MenuImportPublishLogEntry = {
  at: number;
  by: string;
  createdCount: number;
  skippedCount: number;
  alreadyPublishedCount: number;
  confirmedDuplicateCount: number;
  errorCount: number;
  itemIds: string[];
};
