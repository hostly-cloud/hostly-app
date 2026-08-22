import type {
  CatalogProductImageCandidate,
  CatalogProductImageSearchResult,
} from "@/lib/productos/catalog-product-image-contract";

const OPEN_FOOD_FACTS_SEARCH_URL = "https://search.openfoodfacts.org/search";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/product";
const OPEN_FOOD_FACTS_TIMEOUT_MS = 12_000;
const OPEN_FOOD_FACTS_MAX_RESULTS = 12;
const CANDIDATE_LIMIT = 6;
const OPEN_FOOD_FACTS_LICENSE = "CC BY-SA 3.0" as const;
const OPEN_FOOD_FACTS_ATTRIBUTION = "Open Food Facts contributors" as const;

export type CatalogProductMatchContext = {
  name: string;
  categoryName?: string | null;
  description?: string | null;
  brand?: string | null;
  quantity?: string | null;
  barcode?: string | null;
};

export type OpenFoodFactsRawCandidate = {
  code: string;
  productName: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string;
  thumbnailUrl: string;
};

export class CatalogProductImageProviderError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CatalogProductImageProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readFirstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const read = readFirstString(item);
      if (read) return read;
    }
  }
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    for (const key of ["es", "en", "value", "name"]) {
      const read = readFirstString(raw[key]);
      if (read) return read;
    }
  }
  return null;
}

export function normalizeCatalogMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATCH_STOP_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "con",
  "sin",
  "y",
  "en",
  "the",
  "and",
  "with",
  "bottle",
  "botella",
  "lata",
  "can",
  "pack",
  "ml",
  "cl",
  "l",
  "g",
  "kg",
]);

function meaningfulTokens(value: string): string[] {
  return normalizeCatalogMatchText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !/^\d+(?:\.\d+)?$/.test(token) &&
        !MATCH_STOP_WORDS.has(token),
    );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function tokenCoverage(source: string[], target: string[]): number {
  if (source.length === 0 || target.length === 0) return 0;
  const targetSet = new Set(target);
  const hits = source.filter((token) => targetSet.has(token)).length;
  return hits / source.length;
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
  return unique(tokens);
}

function vintageYears(value: string): string[] {
  return unique(value.match(/\b(?:19|20)\d{2}\b/g) ?? []);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function parseRawCandidate(hit: unknown): OpenFoodFactsRawCandidate | null {
  if (!hit || typeof hit !== "object" || Array.isArray(hit)) return null;
  const hitRecord = hit as Record<string, unknown>;
  const source =
    hitRecord._source &&
    typeof hitRecord._source === "object" &&
    !Array.isArray(hitRecord._source)
      ? (hitRecord._source as Record<string, unknown>)
      : hitRecord.fields &&
          typeof hitRecord.fields === "object" &&
          !Array.isArray(hitRecord.fields)
        ? (hitRecord.fields as Record<string, unknown>)
        : hitRecord;

  const code = readFirstString(source.code) ?? readFirstString(hitRecord._id) ?? "";
  const productName =
    readFirstString(source.product_name_es) ??
    readFirstString(source.product_name) ??
    readFirstString(source.product_name_en) ??
    "";
  const imageUrl =
    readFirstString(source.image_front_url) ??
    readFirstString(source.image_url) ??
    "";
  const thumbnailUrl =
    readFirstString(source.image_front_small_url) ??
    readFirstString(source.image_small_url) ??
    imageUrl;

  if (!/^\d{4,24}$/.test(code) || !productName || !imageUrl) return null;
  if (!isAllowedOpenFoodFactsImageUrl(imageUrl)) return null;
  if (!isAllowedOpenFoodFactsImageUrl(thumbnailUrl)) return null;

  return {
    code,
    productName,
    brand: readFirstString(source.brands),
    quantity: readFirstString(source.quantity),
    imageUrl,
    thumbnailUrl,
  };
}

export function isAllowedOpenFoodFactsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "images.openfoodfacts.org" ||
        url.hostname.endsWith(".images.openfoodfacts.org")) &&
      url.pathname.startsWith("/images/products/")
    );
  } catch {
    return false;
  }
}

export function rankOpenFoodFactsCandidate(
  candidate: OpenFoodFactsRawCandidate,
  context: CatalogProductMatchContext,
  searchQuery: string,
): CatalogProductImageCandidate | null {
  const localName = context.name.trim();
  const query = searchQuery.trim() || localName;
  const localNorm = normalizeCatalogMatchText(localName);
  const queryNorm = normalizeCatalogMatchText(query);
  const candidateNameNorm = normalizeCatalogMatchText(candidate.productName);
  const brandNorm = normalizeCatalogMatchText(candidate.brand ?? "");
  const candidateCompositeNorm = normalizeCatalogMatchText(
    `${candidate.brand ?? ""} ${candidate.productName} ${candidate.quantity ?? ""}`,
  );

  if (!localNorm || !candidateNameNorm) return null;

  const localTokens = meaningfulTokens(localName);
  const candidateTokens = meaningfulTokens(
    `${candidate.productName} ${candidate.brand ?? ""}`,
  );
  const localCoverage = tokenCoverage(localTokens, candidateTokens);
  const candidateCoverage = tokenCoverage(candidateTokens, localTokens);

  let score = 0;
  const warnings: string[] = [];

  if (candidateNameNorm === localNorm || candidateCompositeNorm === localNorm) {
    score = 0.72;
  } else if (
    candidateCompositeNorm.includes(localNorm) ||
    localNorm.includes(candidateNameNorm)
  ) {
    score = 0.6;
  } else {
    score = 0.22 + Math.max(localCoverage, candidateCoverage) * 0.48;
  }

  if (localCoverage < 0.55 && candidateCoverage < 0.55) return null;
  if (localCoverage < 0.78) {
    warnings.push("El nombre no coincide por completo; revisa la variante.");
  }

  if (brandNorm) {
    const localAndQuery = normalizeCatalogMatchText(`${localName} ${query}`);
    if (localAndQuery.includes(brandNorm)) {
      score += 0.14;
    } else {
      const brandTokens = meaningfulTokens(candidate.brand ?? "");
      const brandCoverage = tokenCoverage(brandTokens, meaningfulTokens(localAndQuery));
      if (brandCoverage >= 0.75) score += 0.08;
      else warnings.push("La marca del catálogo no aparece claramente en el producto.");
    }
  }

  const localQuantity = quantityTokens(
    `${localName} ${context.quantity ?? ""} ${context.description ?? ""}`,
  );
  const candidateQuantity = quantityTokens(candidate.quantity ?? "");
  if (localQuantity.length > 0 && candidateQuantity.length > 0) {
    if (localQuantity.some((value) => candidateQuantity.includes(value))) {
      score += 0.12;
    } else {
      score -= 0.18;
      warnings.push("La cantidad o formato no coincide.");
    }
  } else if (localQuantity.length > 0) {
    score -= 0.06;
    warnings.push("El catálogo no confirma la cantidad indicada.");
  }

  const localYears = vintageYears(`${localName} ${context.description ?? ""}`);
  const candidateYears = vintageYears(
    `${candidate.productName} ${candidate.brand ?? ""} ${candidate.quantity ?? ""}`,
  );
  if (localYears.length > 0) {
    if (localYears.some((year) => candidateYears.includes(year))) {
      score += 0.12;
    } else if (candidateYears.length > 0) {
      return null; // Never offer a visibly different vintage.
    } else {
      score -= 0.12;
      warnings.push("La añada no está confirmada en el catálogo.");
    }
  }

  const barcode = context.barcode?.trim();
  if (barcode && barcode === candidate.code) score += 0.28;
  if (/^\d{4,24}$/.test(queryNorm) && queryNorm === candidate.code) score += 0.22;

  score += 0.04; // A front image exists and passed host validation.
  const confidence = clampConfidence(score);
  if (confidence < 0.55) return null;

  return {
    provider: "open_food_facts",
    externalReference: candidate.code,
    productName: candidate.productName,
    brand: candidate.brand,
    quantity: candidate.quantity,
    imageUrl: candidate.imageUrl,
    thumbnailUrl: candidate.thumbnailUrl,
    sourceUrl: `${OPEN_FOOD_FACTS_PRODUCT_URL}/${encodeURIComponent(candidate.code)}`,
    confidence,
    matchLevel:
      confidence >= 0.88 && warnings.length === 0 ? "strong" : "review",
    warnings: unique(warnings),
    license: OPEN_FOOD_FACTS_LICENSE,
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
  };
}

function openFoodFactsUserAgent(): string {
  return (
    process.env.HOSTLY_OPENFOODFACTS_USER_AGENT?.trim() ||
    "Hostly/1.0 (contact@hostlyapp.app)"
  );
}

async function queryOpenFoodFacts(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenFoodFactsRawCandidate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_TIMEOUT_MS);
  try {
    const response = await fetchImpl(OPEN_FOOD_FACTS_SEARCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": openFoodFactsUserAgent(),
      },
      signal: controller.signal,
      body: JSON.stringify({
        q: query,
        langs: ["es", "en"],
        page: 1,
        page_size: OPEN_FOOD_FACTS_MAX_RESULTS,
        boost_phrase: true,
        fields: [
          "code",
          "product_name",
          "product_name_es",
          "product_name_en",
          "brands",
          "quantity",
          "image_front_url",
          "image_front_small_url",
        ],
      }),
    });

    if (response.status === 429) {
      throw new CatalogProductImageProviderError(
        "CATALOG_PROVIDER_RATE_LIMITED",
        "Open Food Facts ha limitado temporalmente las búsquedas",
        429,
      );
    }
    if (!response.ok) {
      throw new CatalogProductImageProviderError(
        "CATALOG_PROVIDER_FAILED",
        `Open Food Facts search failed (${response.status})`,
        502,
      );
    }

    const body = (await response.json().catch(() => null)) as
      | { hits?: unknown[] }
      | null;
    if (!body || !Array.isArray(body.hits)) {
      throw new CatalogProductImageProviderError(
        "CATALOG_PROVIDER_INVALID_RESPONSE",
        "Open Food Facts devolvió una respuesta inválida",
        502,
      );
    }

    return body.hits
      .map(parseRawCandidate)
      .filter((candidate): candidate is OpenFoodFactsRawCandidate => Boolean(candidate));
  } catch (error) {
    if (error instanceof CatalogProductImageProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CatalogProductImageProviderError(
        "CATALOG_PROVIDER_TIMEOUT",
        "La búsqueda de catálogo agotó el tiempo disponible",
        504,
      );
    }
    throw new CatalogProductImageProviderError(
      "CATALOG_PROVIDER_FAILED",
      "No se pudo consultar el catálogo real",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function searchOpenFoodFactsCatalog(params: {
  query: string;
  context: CatalogProductMatchContext;
  fetchImpl?: typeof fetch;
}): Promise<CatalogProductImageSearchResult> {
  const query = params.query.trim().slice(0, 160);
  if (query.length < 2) {
    throw new CatalogProductImageProviderError(
      "CATALOG_QUERY_TOO_SHORT",
      "Escribe al menos dos caracteres para buscar",
      400,
    );
  }

  const rawCandidates = await queryOpenFoodFacts(query, params.fetchImpl);
  const candidates = rawCandidates
    .map((candidate) =>
      rankOpenFoodFactsCandidate(candidate, params.context, query),
    )
    .filter((candidate): candidate is CatalogProductImageCandidate => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence)
    .filter(
      (candidate, index, list) =>
        list.findIndex(
          (item) => item.externalReference === candidate.externalReference,
        ) === index,
    )
    .slice(0, CANDIDATE_LIMIT);

  return {
    query,
    candidates,
    provider: "open_food_facts",
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
    license: OPEN_FOOD_FACTS_LICENSE,
  };
}

export async function getOpenFoodFactsCandidateByCode(params: {
  code: string;
  context: CatalogProductMatchContext;
  fetchImpl?: typeof fetch;
}): Promise<CatalogProductImageCandidate> {
  const code = params.code.trim();
  if (!/^\d{4,24}$/.test(code)) {
    throw new CatalogProductImageProviderError(
      "INVALID_CATALOG_REFERENCE",
      "Referencia de catálogo inválida",
      400,
    );
  }

  const rawCandidates = await queryOpenFoodFacts(
    `code:\"${code}\"`,
    params.fetchImpl,
  );
  const raw = rawCandidates.find((candidate) => candidate.code === code);
  if (!raw) {
    throw new CatalogProductImageProviderError(
      "CATALOG_CANDIDATE_NOT_FOUND",
      "El producto ya no está disponible en el catálogo",
      404,
    );
  }

  const ranked = rankOpenFoodFactsCandidate(raw, params.context, params.context.name);
  if (!ranked) {
    throw new CatalogProductImageProviderError(
      "CATALOG_CANDIDATE_MISMATCH",
      "La coincidencia ya no es suficientemente segura para este producto",
      409,
    );
  }
  return ranked;
}
