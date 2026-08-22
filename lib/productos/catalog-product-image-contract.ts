export type CatalogProductImageMatchLevel = "strong" | "review";

export type CatalogProductImageCandidate = {
  provider: "open_food_facts";
  externalReference: string;
  productName: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  confidence: number;
  matchLevel: CatalogProductImageMatchLevel;
  warnings: string[];
  license: "CC BY-SA 3.0";
  attribution: "Open Food Facts contributors";
};

export type CatalogProductImageSearchResult = {
  query: string;
  candidates: CatalogProductImageCandidate[];
  provider: "open_food_facts";
  attribution: "Open Food Facts contributors";
  license: "CC BY-SA 3.0";
};

export type CatalogProductImageAttachResult = {
  productId: string;
  imageUrl: string;
  imagePath: string;
  candidate: CatalogProductImageCandidate;
};

export type CatalogProductImageSearchApiResponse =
  | { ok: true; result: CatalogProductImageSearchResult }
  | { ok: false; error: string; details?: string | null };

export type CatalogProductImageAttachApiResponse =
  | { ok: true; result: CatalogProductImageAttachResult }
  | { ok: false; error: string; details?: string | null };
