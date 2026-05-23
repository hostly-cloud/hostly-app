import type { ImportedMenuSuggestedStation } from "./imported-menu-types";

export type PublishPreviewAction = "create" | "review" | "possible_duplicate";

export type PublishPreviewBadge = "nuevo" | "duplicado" | "revisar" | "sin_categoria";

export type PublishPreviewCreateProduct = {
  itemId: string;
  name: string;
  suggestedCategory: string;
  resolvedCategoryId: string | null;
  suggestedStation: ImportedMenuSuggestedStation;
  productStation: string | null;
  price: number | null;
  action: PublishPreviewAction;
  badges: PublishPreviewBadge[];
  warnings: string[];
  confidence: number;
};

export type PublishPreviewPossibleDuplicate = {
  itemId: string;
  itemName: string;
  existingProductId: string;
  existingProductName: string;
  score: number;
  reasons: string[];
};

export type PublishPreviewMissingCategory = {
  categoryName: string;
  itemIds: string[];
};

export type PublishPreviewBlockedItem = {
  itemId: string;
  name: string;
  reasons: string[];
};

export type PublishPreviewTotals = {
  createCount: number;
  duplicateCount: number;
  blockedCount: number;
  reviewCount: number;
};

export type PublishPreviewResult = {
  draftId: string;
  generatedAt: number;
  createProducts: PublishPreviewCreateProduct[];
  possibleDuplicates: PublishPreviewPossibleDuplicate[];
  missingCategories: PublishPreviewMissingCategory[];
  warnings: string[];
  blockedItems: PublishPreviewBlockedItem[];
  totals: PublishPreviewTotals;
};
