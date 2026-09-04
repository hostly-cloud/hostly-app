import { canonicalTpvVoiceSearchText, scoreTpvVoiceCandidate } from "@/lib/tpv/voice-command";
import type { Product } from "@/types/product";

export type TpvVoiceProductMatch = {
  product: Product;
  score: number;
  matchedBy: "name" | "category" | "service_alias" | "catalog_context";
};

const PRODUCT_MATCH_MIN_SCORE = 0.61;
const PRODUCT_MATCH_AMBIGUITY_GAP = 0.1;

const SERVICE_ALIASES: Record<string, string[]> = {
  cana: ["cerveza", "cervezas", "barril", "grifo"],
  canas: ["cerveza", "cervezas", "barril", "grifo"],
  cerveza: ["cana", "canas", "barril", "grifo"],
  cervezas: ["cana", "canas", "barril", "grifo"],
  birra: ["cerveza", "cervezas", "cana"],
  birras: ["cerveza", "cervezas", "cana"],
};

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

function queryVariants(
  query: string,
): Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> {
  const normalized = canonicalTpvVoiceSearchText(query);
  if (!normalized) return [];

  const variants: Array<{
    value: string;
    matchedBy: TpvVoiceProductMatch["matchedBy"];
  }> = [{ value: normalized, matchedBy: "name" }];

  const tokens = normalized.split(" ").filter(Boolean);
  for (const token of tokens) {
    for (const alias of SERVICE_ALIASES[token] ?? []) {
      variants.push({
        value: tokens.map((current) => (current === token ? alias : current)).join(" "),
        matchedBy: "service_alias",
      });
    }
  }

  return variants;
}

function scoreProductVariant(
  variant: { value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] },
  product: Product,
): TpvVoiceProductMatch {
  const directNameScore = scoreTpvVoiceCandidate(variant.value, product.nombre);
  const contextualNameScore = contextualTokenScore(variant.value, product.nombre);
  const nameScore = Math.max(directNameScore, contextualNameScore);

  const categoryScore = product.categoria
    ? Math.max(
        scoreTpvVoiceCandidate(variant.value, product.categoria),
        contextualTokenScore(variant.value, product.categoria),
      )
    : 0;

  const combinedLabel = product.categoria
    ? `${product.nombre} ${product.categoria}`
    : product.nombre;
  const contextualCombinedScore = contextualTokenScore(variant.value, combinedLabel);

  if (nameScore >= categoryScore && nameScore >= contextualCombinedScore) {
    return {
      product,
      score: nameScore,
      matchedBy:
        variant.matchedBy === "service_alias"
          ? "service_alias"
          : directNameScore >= contextualNameScore
            ? "name"
            : "catalog_context",
    };
  }

  if (contextualCombinedScore >= categoryScore) {
    return {
      product,
      score: contextualCombinedScore * 0.97,
      matchedBy:
        variant.matchedBy === "service_alias" ? "service_alias" : "catalog_context",
    };
  }

  return {
    product,
    score: categoryScore * 0.94,
    matchedBy: variant.matchedBy === "service_alias" ? "service_alias" : "category",
  };
}

export function chooseTpvVoiceProductCandidate(
  query: string,
  products: Product[],
): TpvVoiceProductMatch | null | "ambiguous" {
  const variants = queryVariants(query);
  if (variants.length === 0) return null;

  const ranked = products
    .map((product) => {
      const matches = variants.map((variant) => scoreProductVariant(variant, product));
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
