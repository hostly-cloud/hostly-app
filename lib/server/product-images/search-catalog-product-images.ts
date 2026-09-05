import type { Firestore } from "firebase-admin/firestore";
import type {
  CatalogProductImageCandidate,
  CatalogProductImageSearchResult,
} from "@/lib/productos/catalog-product-image-contract";
import {
  normalizeCatalogMatchText,
  searchOpenFoodFactsCatalog,
  type CatalogProductMatchContext,
} from "@/lib/server/product-images/open-food-facts-catalog";
import {
  filterCatalogCandidatesByExactIdentity,
  getOpenFoodFactsCandidateByExactBarcode,
  normalizeCatalogBarcode,
} from "@/lib/server/product-images/open-food-facts-exact-product";
import {
  filterCatalogCandidatesByWineIdentity,
  type WineCatalogIdentityContext,
} from "@/lib/server/product-images/wine-catalog-identity";

export type HostlyCatalogProductMatchContext = CatalogProductMatchContext &
  WineCatalogIdentityContext;

export class SearchCatalogProductImagesError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "SearchCatalogProductImagesError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new SearchCatalogProductImagesError(
      "INVALID_CATALOG_SEARCH_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function readString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function catalogMatchContextFromProduct(
  data: Record<string, unknown>,
): HostlyCatalogProductMatchContext {
  return {
    name: readString(data, ["name", "nombre"]) ?? "",
    categoryName: readString(data, ["categoryName", "categoria"]),
    description: readString(data, ["description", "descripcion"]),
    brand: readString(data, ["brand", "brands", "marca", "manufacturer"]),
    quantity: readString(data, ["quantity", "format", "formato", "size"]),
    barcode: readString(data, ["barcode", "ean", "ean13", "gtin"]),
    wineProducer: readString(data, ["wineProducer", "winery", "bodega"]),
    wineAppellation: readString(data, [
      "wineAppellation",
      "appellation",
      "denominacionOrigen",
    ]),
    wineVintage: readString(data, ["wineVintage", "vintage", "anada"]),
  };
}

function quantityTokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/,/g, ".");
  const tokens: string[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg)\b/g;
  for (const match of normalized.matchAll(pattern)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (unit === "l") tokens.push(`${Math.round(amount * 1000)}ml`);
    else if (unit === "cl") tokens.push(`${Math.round(amount * 10)}ml`);
    else if (unit === "kg") tokens.push(`${Math.round(amount * 1000)}g`);
    else tokens.push(`${Math.round(amount)}${unit}`);
  }
  return [...new Set(tokens)];
}

function candidateQuantityMatches(
  context: HostlyCatalogProductMatchContext,
  candidate: CatalogProductImageCandidate,
): boolean {
  const expected = quantityTokens(`${context.name} ${context.quantity ?? ""}`);
  if (expected.length === 0) return false;
  const actual = quantityTokens(candidate.quantity ?? "");
  return actual.some((token) => expected.includes(token));
}

function candidateBrandMatches(
  context: HostlyCatalogProductMatchContext,
  candidate: CatalogProductImageCandidate,
): boolean {
  const expected = normalizeCatalogMatchText(
    context.brand ?? context.name,
  );
  const actual = normalizeCatalogMatchText(candidate.brand ?? "");
  if (!actual || !expected) return false;
  return expected.includes(actual) || actual.includes(expected);
}

function applyIdentityFilters(
  context: HostlyCatalogProductMatchContext,
  candidates: CatalogProductImageSearchResult["candidates"],
) {
  const filtered = filterCatalogCandidatesByWineIdentity({
    context,
    candidates: filterCatalogCandidatesByExactIdentity({
      context,
      candidates,
    }),
  });

  return [...filtered].sort((a, b) => {
    const quantityDelta =
      Number(candidateQuantityMatches(context, b)) -
      Number(candidateQuantityMatches(context, a));
    if (quantityDelta !== 0) return quantityDelta;

    const brandDelta =
      Number(candidateBrandMatches(context, b)) -
      Number(candidateBrandMatches(context, a));
    if (brandDelta !== 0) return brandDelta;

    return b.confidence - a.confidence;
  });
}

function addQueryPart(parts: string[], value: string | null | undefined): void {
  const part = value?.trim();
  if (!part) return;
  const normalizedPart = normalizeCatalogMatchText(part);
  const normalizedCurrent = normalizeCatalogMatchText(parts.join(" "));
  if (!normalizedPart || normalizedCurrent.includes(normalizedPart)) return;
  parts.push(part);
}

export function buildCatalogSearchQueries(
  context: HostlyCatalogProductMatchContext,
  requestedQuery: string,
): string[] {
  const fallback = (requestedQuery.trim() || context.name.trim()).slice(0, 160);
  const preciseParts = [fallback];
  addQueryPart(preciseParts, context.brand);
  addQueryPart(preciseParts, context.quantity);
  const precise = preciseParts.join(" ").trim().slice(0, 160);

  return [...new Set([precise, fallback].filter((value) => value.length >= 2))];
}

function mergeCandidates(
  context: HostlyCatalogProductMatchContext,
  results: CatalogProductImageSearchResult[],
): CatalogProductImageSearchResult["candidates"] {
  const unique = new Map<string, CatalogProductImageCandidate>();
  for (const result of results) {
    for (const candidate of result.candidates) {
      const current = unique.get(candidate.externalReference);
      if (!current || candidate.confidence > current.confidence) {
        unique.set(candidate.externalReference, candidate);
      }
    }
  }
  return applyIdentityFilters(context, [...unique.values()]).slice(0, 6);
}

export async function searchCatalogProductImages(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<CatalogProductImageSearchResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);
  const snap = await productRef.get();
  if (!snap.exists) {
    throw new SearchCatalogProductImagesError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
      404,
    );
  }

  const context = catalogMatchContextFromProduct(
    snap.data() as Record<string, unknown>,
  );
  if (!context.name) {
    throw new SearchCatalogProductImagesError(
      "INVALID_PRODUCT_NAME",
      "El producto necesita un nombre antes de buscar una imagen",
      409,
    );
  }

  const barcode = normalizeCatalogBarcode(context.barcode);
  if (barcode) {
    const exact = await getOpenFoodFactsCandidateByExactBarcode({
      barcode,
      context,
      fetchImpl: params.fetchImpl,
    });
    return {
      query: barcode,
      candidates: applyIdentityFilters(context, exact ? [exact] : []),
      provider: "open_food_facts",
      attribution: "Open Food Facts contributors",
      license: "CC BY-SA 3.0",
    };
  }

  const queries = buildCatalogSearchQueries(context, params.query);
  const results: CatalogProductImageSearchResult[] = [];

  for (const query of queries) {
    const result = await searchOpenFoodFactsCatalog({
      query,
      context,
      fetchImpl: params.fetchImpl,
    });
    results.push(result);

    const filtered = mergeCandidates(context, results);
    if (filtered.some((candidate) => candidate.matchLevel === "strong")) {
      return { ...result, query: queries[0] ?? query, candidates: filtered };
    }
  }

  const base = results[0] ?? {
    query: queries[0] ?? context.name,
    candidates: [],
    provider: "open_food_facts" as const,
    attribution: "Open Food Facts contributors" as const,
    license: "CC BY-SA 3.0" as const,
  };

  return {
    ...base,
    query: queries[0] ?? base.query,
    candidates: mergeCandidates(context, results),
  };
}
