import { canonicalTpvVoiceSearchText, scoreTpvVoiceCandidate } from "@/lib/tpv/voice-command";
import type { Product } from "@/types/product";

export type TpvVoiceProductMatch = {
  product: Product;
  score: number;
  matchedBy:
    | "name"
    | "category"
    | "family"
    | "service_alias"
    | "catalog_context"
    | "catalog_unique";
};

const PRODUCT_MATCH_MIN_SCORE = 0.61;
const PRODUCT_MATCH_AMBIGUITY_GAP = 0.1;
const PRODUCT_NAME_CONNECTORS = new Set([
  "a",
  "al",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
]);
const SERVICE_PRESENTATION_WORDS = new Set([
  "botella",
  "botellas",
  "copa",
  "copas",
  "vaso",
  "vasos",
  "jarra",
  "jarras",
  "racion",
  "raciones",
  "unidad",
  "unidades",
  "plato",
  "platos",
]);
const NON_DISTINCTIVE_CATALOG_WORDS = new Set([
  ...PRODUCT_NAME_CONNECTORS,
  ...SERVICE_PRESENTATION_WORDS,
  "comida",
  "bebida",
  "bebidas",
  "producto",
  "productos",
]);

const SERVICE_ALIASES: Record<string, string[]> = {
  cana: ["cerveza", "cervezas", "barril", "grifo"],
  canas: ["cerveza", "cervezas", "barril", "grifo"],
  cerveza: ["cana", "canas", "barril", "grifo"],
  cervezas: ["cana", "canas", "barril", "grifo"],
  birra: ["cerveza", "cervezas", "cana"],
  birras: ["cerveza", "cervezas", "cana"],
  champan: ["champagne", "cava"],
  champagne: ["champan", "cava"],
  cava: ["champagne", "champan"],
  refresco: ["refrescos", "soda"],
  refrescos: ["refresco", "soda"],
  soda: ["refresco", "refrescos"],
};

const ZERO_VARIANT_TOKENS = new Set(["zero", "0", "light"]);
const REGULAR_VARIANT_TOKENS = new Set([
  "normal",
  "regular",
  "clasica",
  "clasico",
  "original",
]);

function phoneticSpanishToken(value: string): string {
  return canonicalTpvVoiceSearchText(value)
    .replace(/h/g, "")
    .replace(/qu/g, "k")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/[bv]/g, "b")
    .replace(/c(?=[ei])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/j/g, "g")
    .replace(/ll/g, "y")
    .replace(/ñ/g, "n")
    .replace(/rr/g, "r")
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]!;
  }

  return previous[b.length]!;
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
  const query = canonicalTpvVoiceSearchText(queryToken);
  const candidate = canonicalTpvVoiceSearchText(candidateToken);
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;

  const qPhonetic = phoneticSpanishToken(query);
  const cPhonetic = phoneticSpanishToken(candidate);
  if (qPhonetic && qPhonetic === cPhonetic) return 0.94;

  const canonicalMax = Math.max(query.length, candidate.length);
  const canonicalScore =
    canonicalMax > 0 ? 1 - editDistance(query, candidate) / canonicalMax : 0;

  const phoneticMax = Math.max(qPhonetic.length, cPhonetic.length);
  const phoneticScore =
    phoneticMax > 0
      ? 1 - editDistance(qPhonetic, cPhonetic) / phoneticMax
      : 0;

  const containmentScore =
    query.includes(candidate) || candidate.includes(query)
      ? 0.78 +
        (Math.min(query.length, candidate.length) /
          Math.max(query.length, candidate.length)) *
          0.12
      : 0;

  return Math.max(canonicalScore * 0.92, phoneticScore * 0.94, containmentScore);
}

function strongestCatalogAnchor(query: string, candidate: string): number {
  const queryTokens = canonicalTpvVoiceSearchText(query).split(" ").filter(Boolean);
  const candidateTokens = canonicalTpvVoiceSearchText(candidate).split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  const compactCandidate = candidateTokens.join("");
  let best = 0;
  for (const queryToken of queryTokens) {
    best = Math.max(best, tokenSimilarity(queryToken, compactCandidate));
    for (const candidateToken of candidateTokens) {
      best = Math.max(best, tokenSimilarity(queryToken, candidateToken));
    }
  }
  return best;
}

function contextualTokenScore(query: string, candidate: string): number {
  const queryTokens = canonicalTpvVoiceSearchText(query).split(" ").filter(Boolean);
  const candidateTokens = canonicalTpvVoiceSearchText(candidate).split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  const usedQueryIndexes = new Set<number>();
  let matched = 0;

  for (const candidateToken of candidateTokens) {
    let bestScore = 0;
    let bestIndex = -1;
    for (let index = 0; index < queryTokens.length; index += 1) {
      if (usedQueryIndexes.has(index)) continue;
      const score = tokenSimilarity(queryTokens[index]!, candidateToken);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0 && bestScore >= 0.58) {
      usedQueryIndexes.add(bestIndex);
      matched += bestScore;
    }
  }

  const candidateCoverage = matched / candidateTokens.length;
  const queryCoverage = matched / queryTokens.length;
  const extraQueryPenalty = Math.max(0, queryTokens.length - usedQueryIndexes.size) * 0.035;
  const coverageScore = Math.max(
    0,
    Math.min(1, candidateCoverage * 0.72 + queryCoverage * 0.28 - extraQueryPenalty),
  );

  const anchor = strongestCatalogAnchor(query, candidate);
  const safeAnchorScore = anchor >= 0.68 ? anchor * 0.94 : 0;
  return Math.max(coverageScore, safeAnchorScore);
}

function comparableProductName(value: string): string {
  return canonicalTpvVoiceSearchText(value)
    .split(" ")
    .filter((token) => token && !PRODUCT_NAME_CONNECTORS.has(token))
    .join(" ");
}

function stripServicePresentationWords(value: string): string {
  const tokens = canonicalTpvVoiceSearchText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !SERVICE_PRESENTATION_WORDS.has(token));

  while (tokens.length > 1 && PRODUCT_NAME_CONNECTORS.has(tokens[0]!)) {
    tokens.shift();
  }
  return tokens.join(" ");
}

function queryVariants(
  query: string,
): Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> {
  const normalized = canonicalTpvVoiceSearchText(query);
  if (!normalized) return [];

  const variants: Array<{
    value: string;
    matchedBy: TpvVoiceProductMatch["matchedBy"];
  }> = [{ value: normalized, matchedBy: "name" }];

  const withoutPresentation = stripServicePresentationWords(normalized);
  if (withoutPresentation && withoutPresentation !== normalized) {
    variants.push({ value: withoutPresentation, matchedBy: "catalog_context" });
  }

  for (const base of [...variants]) {
    const tokens = base.value.split(" ").filter(Boolean);
    for (const token of tokens) {
      for (const alias of SERVICE_ALIASES[token] ?? []) {
        variants.push({
          value: tokens.map((current) => (current === token ? alias : current)).join(" "),
          matchedBy: "service_alias",
        });
      }
    }
  }

  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = `${variant.value}:${variant.matchedBy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function catalogIdentityTokens(value: string): string[] {
  return canonicalTpvVoiceSearchText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        !NON_DISTINCTIVE_CATALOG_WORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

function buildCatalogTokenFrequency(products: Product[]): ReadonlyMap<string, number> {
  const frequency = new Map<string, number>();
  for (const product of products) {
    const seenForProduct = new Set(catalogIdentityTokens(product.nombre));
    for (const token of seenForProduct) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  return frequency;
}

function uniqueCatalogIdentityScore(
  query: string,
  product: Product,
  tokenFrequency: ReadonlyMap<string, number>,
): number {
  const queryTokens = catalogIdentityTokens(query);
  const productTokens = catalogIdentityTokens(product.nombre).filter(
    (token) => tokenFrequency.get(token) === 1,
  );
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;

  let strongest = 0;
  for (const queryToken of queryTokens) {
    for (const productToken of productTokens) {
      strongest = Math.max(strongest, tokenSimilarity(queryToken, productToken));
    }
  }
  if (strongest < 0.74) return 0;
  return Math.min(0.97, 0.72 + strongest * 0.25);
}

function productContextLabels(product: Product): Array<{
  value: string;
  weight: number;
  matchedBy: TpvVoiceProductMatch["matchedBy"];
}> {
  const labels: Array<{
    value: string;
    weight: number;
    matchedBy: TpvVoiceProductMatch["matchedBy"];
  }> = [{ value: product.nombre, weight: 1, matchedBy: "name" }];

  const category = product.categoria?.trim();
  const family = product.productFamilyName?.trim();
  const saleType = product.tipoVenta?.trim();
  const familyType = product.productFamilyType?.trim();
  const preparationArea = product.preparationArea?.trim();
  const operationStation = product.operationStationName?.trim();

  if (category) {
    labels.push(
      { value: `${product.nombre} ${category}`, weight: 0.985, matchedBy: "catalog_context" },
      { value: category, weight: 0.9, matchedBy: "category" },
    );
  }
  if (family) {
    labels.push(
      { value: `${product.nombre} ${family}`, weight: 0.98, matchedBy: "catalog_context" },
      { value: family, weight: 0.88, matchedBy: "family" },
    );
  }
  if (category && family) {
    labels.push({
      value: `${product.nombre} ${category} ${family}`,
      weight: 0.975,
      matchedBy: "catalog_context",
    });
  }
  for (const context of [saleType, familyType, preparationArea, operationStation]) {
    if (context) {
      labels.push({
        value: `${product.nombre} ${context}`,
        weight: 0.9,
        matchedBy: "catalog_context",
      });
    }
  }

  return labels;
}

type RequestedVariant = "zero" | "regular" | null;

function requestedVariant(value: string): RequestedVariant {
  const normalized = canonicalTpvVoiceSearchText(value);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if (
    [...ZERO_VARIANT_TOKENS].some((token) => tokens.has(token)) ||
    normalized.includes("sin azucar")
  ) {
    return "zero";
  }
  if ([...REGULAR_VARIANT_TOKENS].some((token) => tokens.has(token))) {
    return "regular";
  }
  return null;
}

function productVariant(productName: string): RequestedVariant {
  const normalized = canonicalTpvVoiceSearchText(productName);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if (
    [...ZERO_VARIANT_TOKENS].some((token) => tokens.has(token)) ||
    normalized.includes("sin azucar")
  ) {
    return "zero";
  }
  return null;
}

function applyVariantPreference(score: number, query: string, product: Product): number {
  const requested = requestedVariant(query);
  if (!requested) return score;
  const candidateVariant = productVariant(product.nombre);

  if (requested === "zero") {
    return candidateVariant === "zero"
      ? Math.min(1, score + 0.07)
      : score * 0.72;
  }

  return candidateVariant === "zero"
    ? score * 0.74
    : Math.min(1, score + 0.055);
}

function scoreProductVariant(
  variant: { value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] },
  product: Product,
  tokenFrequency: ReadonlyMap<string, number>,
): TpvVoiceProductMatch {
  let bestScore = 0;
  let matchedBy: TpvVoiceProductMatch["matchedBy"] = variant.matchedBy;

  for (const label of productContextLabels(product)) {
    const directScore = scoreTpvVoiceCandidate(variant.value, label.value);
    const contextualScore = contextualTokenScore(variant.value, label.value);
    const score = Math.max(directScore, contextualScore) * label.weight;
    if (score > bestScore) {
      bestScore = score;
      matchedBy =
        variant.matchedBy === "service_alias" ? "service_alias" : label.matchedBy;
    }
  }

  const uniqueScore = uniqueCatalogIdentityScore(variant.value, product, tokenFrequency);
  if (uniqueScore > bestScore) {
    bestScore = uniqueScore;
    matchedBy = "catalog_unique";
  }

  return {
    product,
    score: applyVariantPreference(bestScore, variant.value, product),
    matchedBy,
  };
}

export function chooseTpvVoiceProductCandidate(
  query: string,
  products: Product[],
): TpvVoiceProductMatch | null | "ambiguous" {
  const literalQuery = canonicalTpvVoiceSearchText(query);
  if (!literalQuery || products.length === 0) return null;

  const literalExactMatches = products.filter(
    (product) => canonicalTpvVoiceSearchText(product.nombre) === literalQuery,
  );
  if (literalExactMatches.length === 1) {
    return { product: literalExactMatches[0]!, score: 1, matchedBy: "name" };
  }
  if (literalExactMatches.length > 1) return "ambiguous";

  const comparableQuery = comparableProductName(query);
  const comparableExactMatches = products.filter(
    (product) => comparableProductName(product.nombre) === comparableQuery,
  );
  if (comparableExactMatches.length === 1) {
    return { product: comparableExactMatches[0]!, score: 0.995, matchedBy: "name" };
  }
  if (comparableExactMatches.length > 1) return "ambiguous";

  const variants = queryVariants(query);
  if (variants.length === 0) return null;

  const tokenFrequency = buildCatalogTokenFrequency(products);
  const ranked = products
    .map((product) => {
      const matches = variants.map((variant) =>
        scoreProductVariant(variant, product, tokenFrequency),
      );
      return matches.sort((a, b) => b.score - a.score)[0]!;
    })
    .filter((candidate) => candidate.score >= PRODUCT_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;

  const second = ranked[1];
  if (
    second &&
    best.product.id !== second.product.id &&
    best.score - second.score < PRODUCT_MATCH_AMBIGUITY_GAP
  ) {
    return "ambiguous";
  }

  return best;
}
