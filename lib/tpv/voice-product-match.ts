import { canonicalTpvVoiceSearchText, scoreTpvVoiceCandidate } from "@/lib/tpv/voice-command";
import type { Product } from "@/types/product";

export type TpvVoiceProductMatch = {
  product: Product;
  score: number;
  matchedBy: "name" | "category" | "service_alias";
};

const PRODUCT_MATCH_MIN_SCORE = 0.64;
const PRODUCT_MATCH_AMBIGUITY_GAP = 0.1;

const SERVICE_ALIASES: Record<string, string[]> = {
  cana: ["cerveza", "cervezas", "barril", "grifo"],
  canas: ["cerveza", "cervezas", "barril", "grifo"],
  cerveza: ["cana", "canas"],
  cervezas: ["cana", "canas"],
  birra: ["cerveza", "cervezas", "cana"],
  birras: ["cerveza", "cervezas", "cana"],
};

const HEARING_NORMALIZATIONS: Record<string, string> = {
  kana: "cana",
  canna: "cana",
  cania: "cana",
  cagna: "cana",
};

function normalizeServiceQuery(value: string): string {
  const canonical = canonicalTpvVoiceSearchText(value);
  return canonical
    .split(" ")
    .filter(Boolean)
    .map((token) => HEARING_NORMALIZATIONS[token] ?? token)
    .join(" ");
}

function queryVariants(query: string): Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> {
  const normalized = normalizeServiceQuery(query);
  if (!normalized) return [];

  const variants: Array<{ value: string; matchedBy: TpvVoiceProductMatch["matchedBy"] }> = [
    { value: normalized, matchedBy: "name" },
  ];

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
  const nameScore = scoreTpvVoiceCandidate(variant.value, product.nombre);
  const categoryScore = product.categoria
    ? scoreTpvVoiceCandidate(variant.value, product.categoria)
    : 0;
  const combinedScore = product.categoria
    ? scoreTpvVoiceCandidate(variant.value, `${product.nombre} ${product.categoria}`)
    : 0;

  if (nameScore >= categoryScore && nameScore >= combinedScore) {
    return { product, score: nameScore, matchedBy: variant.matchedBy };
  }

  return {
    product,
    score: Math.max(categoryScore, combinedScore) * 0.94,
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
    best.score < 0.985 &&
    best.score - second.score < PRODUCT_MATCH_AMBIGUITY_GAP
  ) {
    return "ambiguous";
  }

  return best;
}
