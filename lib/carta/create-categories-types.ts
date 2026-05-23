export type CreateMenuImportCategoryOutcome = "created" | "reused_existing";

export type CreateMenuImportCategoryResultItem = {
  inputName: string;
  normalizedName: string;
  categoryId: string;
  categoryName: string;
  outcome: CreateMenuImportCategoryOutcome;
};

export type CreateMenuImportCategoriesSkipped = {
  inputName: string;
  reason: string;
};

export type CreateMenuImportCategoriesResult = {
  draftId: string;
  created: CreateMenuImportCategoryResultItem[];
  reused: CreateMenuImportCategoryResultItem[];
  skipped: CreateMenuImportCategoriesSkipped[];
  totals: {
    createdCount: number;
    reusedCount: number;
    skippedCount: number;
  };
};

export type CategoryOutcomeMap = Record<string, "created" | "reused">;
