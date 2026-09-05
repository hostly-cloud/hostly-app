import type { ProductAllergen, ProductWineProfile } from "@/types/product";

export type SommelierPairingSource = "ai" | "heuristic";

export type SommelierCatalogItem = {
  id: string;
  name: string;
  categoryName: string;
  familyName: string;
  price: number | null;
  description: string | null;
  kind: "wine" | "dish";
  /** Canonical restaurant-confirmed product context. */
  ingredients?: string[];
  allergens?: ProductAllergen[];
  /** Distinguishes explicit [] from unknown/missing allergen information. */
  hasAllergenInformation?: boolean;
  caloriesKcal?: number | null;
  wine?: ProductWineProfile;
};

export type SommelierWineProfile = {
  style: "red" | "white" | "rose" | "sparkling" | "sweet" | "fortified" | "unknown";
  body: "light" | "medium" | "full" | "unknown";
  sweetness: "dry" | "off_dry" | "sweet" | "unknown";
  grapes: string[];
  notes: string[];
  confidence: number;
};

export type SommelierPairing = {
  id: string;
  wineProductId: string;
  wineName: string;
  dishProductId: string;
  dishName: string;
  score: number;
  reason: string;
  tags: string[];
  source: SommelierPairingSource;
};

export type SommelierSnapshot = {
  catalogHash: string;
  generatedAtMs: number | null;
  generatedBy: string | null;
  model: string | null;
  source: SommelierPairingSource | null;
  wines: SommelierCatalogItem[];
  dishes: SommelierCatalogItem[];
  pairings: SommelierPairing[];
  wineProfiles: Record<string, SommelierWineProfile>;
};

export type SommelierApiSuccess = {
  ok: true;
  effectivePlan: "basic" | "pro" | "ultra";
  entitled: boolean;
  canRegenerate: boolean;
  snapshot: SommelierSnapshot;
};

export type SommelierApiError = {
  ok: false;
  error: string;
};

export type SommelierApiResponse = SommelierApiSuccess | SommelierApiError;
