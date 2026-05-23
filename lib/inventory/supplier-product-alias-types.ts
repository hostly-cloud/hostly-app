export type SupplierProductAliasMatchSource = "auto" | "manual";

export type SupplierProductAliasDocument = {
  id: string;
  restaurantId: string;
  rawText: string;
  normalizedText: string;
  inventoryProductId: string;
  inventoryProductName: string;
  supplierName?: string | null;
  usageCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number | null;
  deletedAt?: number | null;
  learnedFromInvoiceId?: string | null;
  matchSource?: SupplierProductAliasMatchSource;
};

export type SupplierProductAliasMatchCandidate = {
  normalizedText: string;
  inventoryProductId: string;
  inventoryProductName: string;
};

export type SupplierProductAliasUpdatePatch = {
  inventoryProductId?: string;
  inventoryProductName?: string;
  active?: boolean;
  usageCount?: number;
  matchSource?: SupplierProductAliasMatchSource;
  deletedAt?: number | null;
};
