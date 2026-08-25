import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import { normalizeCatalogMatchText } from "@/lib/server/product-images/open-food-facts-catalog";

export type WineCatalogIdentityContext = {
  wineProducer?: string | null;
  wineAppellation?: string | null;
  wineVintage?: string | null;
};

export type WineCatalogIdentityAssessment = {
  applicable: boolean;
  accepted: boolean;
  missingEvidence: string[];
  conflictingEvidence: string[];
};

const GENERIC_WINE_TOKENS = new Set([
  "do",
  "doc",
  "doca",
  "dop",
  "vino",
  "wine",
  "wines",
  "bodega",
  "bodegas",
  "winery",
  "denominacion",
  "origen",
  "de",
  "del",
  "la",
  "el",
]);

function evidenceTokens(value: string): string[] {
  return normalizeCatalogMatchText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !GENERIC_WINE_TOKENS.has(token) &&
        !/^\d+$/.test(token),
    );
}

function tokenCoverage(expected: string, candidateText: string): number {
  const tokens = evidenceTokens(expected);
  if (tokens.length === 0) return 1;
  const haystack = new Set(evidenceTokens(candidateText));
  const matches = tokens.filter((token) => haystack.has(token)).length;
  return matches / tokens.length;
}

function candidateText(candidate: Pick<CatalogProductImageCandidate, "productName" | "brand" | "quantity">): string {
  return `${candidate.productName} ${candidate.brand ?? ""} ${candidate.quantity ?? ""}`;
}

function explicitYears(value: string): string[] {
  return [...new Set(value.match(/\b(?:19|20)\d{2}\b/g) ?? [])];
}

export function assessWineCatalogIdentity(params: {
  context: WineCatalogIdentityContext;
  candidate: Pick<CatalogProductImageCandidate, "productName" | "brand" | "quantity">;
}): WineCatalogIdentityAssessment {
  const producer = params.context.wineProducer?.trim() ?? "";
  const appellation = params.context.wineAppellation?.trim() ?? "";
  const vintage = params.context.wineVintage?.trim() ?? "";
  const applicable = Boolean(producer || appellation || vintage);
  if (!applicable) {
    return {
      applicable: false,
      accepted: true,
      missingEvidence: [],
      conflictingEvidence: [],
    };
  }

  const text = candidateText(params.candidate);
  const missingEvidence: string[] = [];
  const conflictingEvidence: string[] = [];

  if (producer && tokenCoverage(producer, text) < 0.75) {
    missingEvidence.push("wine_producer");
  }

  if (appellation && tokenCoverage(appellation, text) < 0.6) {
    missingEvidence.push("wine_appellation");
  }

  if (vintage) {
    const candidateYears = explicitYears(text);
    if (candidateYears.length === 0) {
      missingEvidence.push("wine_vintage");
    } else if (!candidateYears.includes(vintage)) {
      conflictingEvidence.push("wine_vintage");
    }
  }

  return {
    applicable: true,
    accepted: missingEvidence.length === 0 && conflictingEvidence.length === 0,
    missingEvidence,
    conflictingEvidence,
  };
}

export function filterCatalogCandidatesByWineIdentity(params: {
  context: WineCatalogIdentityContext;
  candidates: CatalogProductImageCandidate[];
}): CatalogProductImageCandidate[] {
  return params.candidates.filter(
    (candidate) => assessWineCatalogIdentity({ context: params.context, candidate }).accepted,
  );
}
