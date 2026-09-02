import type {
  CatalogImageAccess,
  CatalogImageCreditPeriod,
} from "@/lib/productos/catalog-image-plan";

export type CatalogImageCreditUsageSummary = {
  operations: number;
  succeeded: number;
  failed: number;
  blocked: number;
  consumedCredits: number;
  reservedCredits: number;
  releasedCredits: number;
};

export type CatalogImageCreditUsageItem = {
  id: string;
  operation: string;
  productId: string | null;
  status: string;
  result: string | null;
  creditStatus: string | null;
  creditCost: number | null;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  createdAt: number | null;
  completedAt: number | null;
};

export type CatalogImageCreditAccountSummary = {
  access: CatalogImageAccess;
  period: CatalogImageCreditPeriod | null;
  usage: CatalogImageCreditUsageSummary;
  recentUsage: CatalogImageCreditUsageItem[];
};

export type CatalogImageCreditApiError = {
  ok: false;
  error: string;
  details?: string | null;
};
