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

const PRODUCT_MATCH_MIN_SCORE = 0.62;
const PRODUCT_MATCH_AMBIGUITY_GAP = 0.075;
const PRODUCT_STRONG_UNIQUE_SCORE = 0.91;
const PRODUCT_UNIQUE_MATCH_AMBIGUITY_GAP = 0.025;
const CATALOG_COUNT_KEY = "__hostly_catalog_product_count__";

const PRODUCT_NAME_CONNECTORS = new Set([
  "a", "al", "de", "del", "la", "el", "los", "las", "con", "di", "da", "do", "du",
]);
const SERVICE_PRESENTATION_WORDS = new Set([
  "botella", "botellas", "copa", "copas", "vaso", "vasos", "jarra", "jarras",
  "racion", "raciones", "unidad", "unidades", "plato", "platos",
]);
const NON_DISTINCTIVE_CATALOG_WORDS = new Set([
  ...PRODUCT_NAME_CONNECTORS,
  ...SERVICE_PRESENTATION_WORDS,
  "comida", "bebida", "bebidas", "producto", "productos",
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
const REGULAR_VARIANT_TOKENS = new Set(["normal", "regular", "clasica", "clasico", "original"]);
type RequestedVariant = "zero" | "regular" | null;

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
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]!;
  }
  return previous[b.length]!;
}

function compactPhonetic(value: string): string {
  return canonicalTpvVoiceSearchText(value)
    .replace(/\s+/g, "")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/ck/g, "k")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/[bv]/g, "b")
    .replace(/c(?=[ei])/g, "s")
    .replace(/[ckq]/g, "k")
    .replace(/z/g, "s")
    .replace(/j/g, "g")
    .replace(/ll/g, "y")
    .replace(/ñ/g, "n")
    .replace(/rr/g, "r")
    .replace(/([a-z])\1+/g, "$1");
}

function diceBigrams(a: string, b: string): number {
  const left = canonicalTpvVoiceSearchText(a).replace(/\s+/g, "");
  const right = canonicalTpvVoiceSearchText(b).replace(/\s+/g, "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length - 1 + right.length - 1);
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
  const query = canonicalTpvVoiceSearchText(queryToken).replace(/\s+/g, "");
  const candidate = canonicalTpvVoiceSearchText(candidateToken).replace(/\s+/g, "");
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  const maxLength = Math.max(query.length, candidate.length);
  const editScore = maxLength > 0 ? 1 - editDistance(query, candidate) / maxLength : 0;
  const qPhonetic = compactPhonetic(query);
  const cPhonetic = compactPhonetic(candidate);
  const phoneticMax = Math.max(qPhonetic.length, cPhonetic.length);
  const phoneticEdit = phoneticMax > 0 ? 1 - editDistance(qPhonetic, cPhonetic) / phoneticMax : 0;
  const bigram = diceBigrams(query, candidate);
  const containment = query.includes(candidate) || candidate.includes(query)
    ? 0.8 + (Math.min(query.length, candidate.length) / maxLength) * 0.16
    : 0;
  return Math.max(editScore * 0.94, phoneticEdit * 0.95, bigram * 0.94, containment);
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
  while (tokens.length > 1 && PRODUCT_NAME_CONNECTORS.has(tokens[0]!)) tokens.shift();
  return tokens.join(" ");
}

function queryVariants(query: string): Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> {
  const normalized = canonicalTpvVoiceSearchText(query);
  if (!normalized) return [];
  const variants: Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> = [
    { value: normalized, matchedBy: "name" },
  ];
  const withoutPresentation = stripServicePresentationWords(normalized);
  if (withoutPresentation && withoutPresentation !== normalized) {
    variants.push({ value: withoutPresentation, matchedBy: "catalog_context" });
  }
  for (const base of [...variants]) {
    const tokens = base.value.split(" ").filter(Boolean);
    for (const token of tokens) {
      for (const alias of SERVICE_ALIASES[token] ?? []) {
        variants.push({
          value: tokens.map((current) => current === token ? alias : current).join(" "),
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
    .filter((token) => token.length >= 3 && !NON_DISTINCTIVE_CATALOG_WORDS.has(token) && !/^\d+$/.test(token));
}

function buildCatalogTokenFrequency(products: Product[]): ReadonlyMap<string, number> {
  const frequency = new Map<string, number>();
  frequency.set(CATALOG_COUNT_KEY, products.length);
  for (const product of products) {
    for (const token of new Set(catalogIdentityTokens(product.nombre))) {
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
  if ((tokenFrequency.get(CATALOG_COUNT_KEY) ?? 0) < 2) return 0;
  const queryTokens = catalogIdentityTokens(query);
  const productTokens = catalogIdentityTokens(product.nombre).filter((token) => tokenFrequency.get(token) === 1);
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;
  let best = 0;
  for (const queryToken of queryTokens) {
    for (const productToken of productTokens) best = Math.max(best, tokenSimilarity(queryToken, productToken));
  }
  if (best < 0.67) return 0;
  return Math.min(0.985, 0.74 + best * 0.25);
}

function tokenCoverageScore(query: string, candidate: string): number {
  const queryTokens = canonicalTpvVoiceSearchText(query).split(" ").filter(Boolean);
  const candidateTokens = canonicalTpvVoiceSearchText(candidate).split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const used = new Set<number>();
  let total = 0;
  let strongMatches = 0;
  for (const candidateToken of candidateTokens) {
    let best = 0;
    let bestIndex = -1;
    for (let i = 0; i < queryTokens.length; i += 1) {
      if (used.has(i)) continue;
      const score = tokenSimilarity(queryTokens[i]!, candidateToken);
      if (score > best) { best = score; bestIndex = i; }
    }
    if (bestIndex >= 0 && best >= 0.58) {
      used.add(bestIndex);
      total += best;
      if (best >= 0.76) strongMatches += 1;
    }
  }
  if (strongMatches === 0) return 0;
  const candidateCoverage = total / candidateTokens.length;
  const queryCoverage = total / queryTokens.length;
  const extraPenalty = Math.max(0, queryTokens.length - used.size) * 0.025;
  return Math.max(0, Math.min(1, candidateCoverage * 0.7 + queryCoverage * 0.3 - extraPenalty));
}

function bestNameWindowScore(query: string, candidate: string): number {
  const queryTokens = canonicalTpvVoiceSearchText(query).split(" ").filter(Boolean);
  const candidateTokens = canonicalTpvVoiceSearchText(candidate).split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  let best = Math.max(scoreTpvVoiceCandidate(query, candidate), tokenCoverageScore(query, candidate));
  const lengths = new Set([Math.max(1, candidateTokens.length - 1), candidateTokens.length, candidateTokens.length + 1]);
  for (const length of lengths) {
    if (length > queryTokens.length) continue;
    for (let start = 0; start + length <= queryTokens.length; start += 1) {
      const window = queryTokens.slice(start, start + length).join(" ");
      best = Math.max(best, scoreTpvVoiceCandidate(window, candidate), tokenCoverageScore(window, candidate));
    }
  }
  return best;
}

function hasSharedPrefixConflict(query: string, productName: string): boolean {
  const queryTokens = catalogIdentityTokens(query);
  const productTokens = catalogIdentityTokens(productName);
  if (queryTokens.length < 2 || productTokens.length < 2) return false;

  const shared = queryTokens.filter((token) => productTokens.includes(token));
  if (shared.length === 0) return false;

  const queryRemainder = queryTokens.filter((token) => !productTokens.includes(token));
  const productRemainder = productTokens.filter((token) => !queryTokens.includes(token));
  if (queryRemainder.length === 0 || productRemainder.length === 0) return false;

  let bestRemainderSimilarity = 0;
  for (const queryToken of queryRemainder) {
    for (const productToken of productRemainder) {
      bestRemainderSimilarity = Math.max(
        bestRemainderSimilarity,
        tokenSimilarity(queryToken, productToken),
      );
    }
  }

  return bestRemainderSimilarity < 0.58;
}

function requestedVariant(value: string): RequestedVariant {
  const normalized = canonicalTpvVoiceSearchText(value);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if ([...ZERO_VARIANT_TOKENS].some((token) => tokens.has(token)) || normalized.includes("sin azucar")) return "zero";
  if ([...REGULAR_VARIANT_TOKENS].some((token) => tokens.has(token))) return "regular";
  return null;
}

function productVariant(productName: string): RequestedVariant {
  const normalized = canonicalTpvVoiceSearchText(productName);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if ([...ZERO_VARIANT_TOKENS].some((token) => tokens.has(token)) || normalized.includes("sin azucar")) return "zero";
  return null;
}

function applyVariantPreference(score: number, query: string, product: Product): number {
  const requested = requestedVariant(query);
  if (!requested) return score;
  const candidateVariant = productVariant(product.nombre);
  if (requested === "zero") return candidateVariant === "zero" ? Math.min(1, score + 0.07) : score * 0.7;
  return candidateVariant === "zero" ? score * 0.72 : Math.min(1, score + 0.055);
}

function scoreProduct(
  variant: { value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] },
  product: Product,
  tokenFrequency: ReadonlyMap<string, number>,
): TpvVoiceProductMatch {
  let bestScore = bestNameWindowScore(variant.value, product.nombre);
  let matchedBy: TpvVoiceProductMatch["matchedBy"] = variant.matchedBy;
  const contexts: Array<{ value: string; weight: number; matchedBy: TpvVoiceProductMatch["matchedBy"] }> = [];
  const category = product.categoria?.trim();
  const family = product.productFamilyName?.trim();
  if (category) contexts.push(
    { value: `${product.nombre} ${category}`, weight: 0.96, matchedBy: "catalog_context" },
    { value: category, weight: 0.82, matchedBy: "category" },
  );
  if (family) contexts.push(
    { value: `${product.nombre} ${family}`, weight: 0.95, matchedBy: "catalog_context" },
    { value: family, weight: 0.8, matchedBy: "family" },
  );
  for (const context of contexts) {
    const score = bestNameWindowScore(variant.value, context.value) * context.weight;
    if (score > bestScore) { bestScore = score; matchedBy = context.matchedBy; }
  }
  const unique = uniqueCatalogIdentityScore(variant.value, product, tokenFrequency);
  if (unique > bestScore) { bestScore = unique; matchedBy = "catalog_unique"; }
  if (variant.matchedBy === "service_alias" && bestScore >= PRODUCT_MATCH_MIN_SCORE) matchedBy = "service_alias";

  let finalScore = applyVariantPreference(bestScore, variant.value, product);
  if (matchedBy !== "service_alias" && hasSharedPrefixConflict(variant.value, product.nombre)) {
    finalScore = Math.min(finalScore, PRODUCT_MATCH_MIN_SCORE - 0.01);
  }
  return { product, score: finalScore, matchedBy };
}

export function chooseTpvVoiceProductCandidate(
  query: string,
  products: Product[],
): TpvVoiceProductMatch | null | "ambiguous" {
  const literalQuery = canonicalTpvVoiceSearchText(query);
  if (!literalQuery || products.length === 0) return null;

  const literalExactMatches = products.filter((product) => canonicalTpvVoiceSearchText(product.nombre) === literalQuery);
  if (literalExactMatches.length === 1) return { product: literalExactMatches[0]!, score: 1, matchedBy: "name" };
  if (literalExactMatches.length > 1) return "ambiguous";

  const comparableQuery = comparableProductName(query);
  const comparableExactMatches = products.filter((product) => comparableProductName(product.nombre) === comparableQuery);
  if (comparableExactMatches.length === 1) return { product: comparableExactMatches[0]!, score: 0.995, matchedBy: "name" };
  if (comparableExactMatches.length > 1) return "ambiguous";

  const variants = queryVariants(query);
  const tokenFrequency = buildCatalogTokenFrequency(products);
  const ranked = products
    .map((product) => variants.map((variant) => scoreProduct(variant, product, tokenFrequency)).sort((a, b) => b.score - a.score)[0]!)
    .filter((candidate) => candidate.score >= PRODUCT_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];
  if (second && best.product.id !== second.product.id) {
    const gap = best.matchedBy === "catalog_unique" && best.score >= PRODUCT_STRONG_UNIQUE_SCORE
      ? PRODUCT_UNIQUE_MATCH_AMBIGUITY_GAP
      : PRODUCT_MATCH_AMBIGUITY_GAP;
    if (best.score - second.score < gap) return "ambiguous";
  }
  return best;
}
