import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { ProductDocument } from "@/lib/firestore/products";

export type ImportProductDuplicateMatch = {
  productId: string;
  productName: string;
  score: number;
  reasons: string[];
};

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function approxPriceMatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= 0.5) return true;
  const denom = Math.max(1, Math.abs(a), Math.abs(b));
  return diff / denom <= 0.06;
}

function isSensitiveNameContext(item: ImportedMenuItem, menuType: string): boolean {
  const attrs = item.inferredAttributes;
  if (attrs?.wineByGlass || attrs?.bottle || attrs?.cocktail) return true;
  if (menuType === "wine" || menuType === "cocktails") return true;

  const blob = `${item.sectionName} ${item.suggestedCategory} ${item.name}`.toLowerCase();
  return (
    blob.includes("vino") ||
    blob.includes("wine") ||
    blob.includes("coctel") ||
    blob.includes("cocktail") ||
    blob.includes("cava") ||
    blob.includes("champagne")
  );
}

/**
 * Matching conservador contra catálogo central. Vinos/cócteles exigen señales más fuertes.
 */
export function findImportProductDuplicates(args: {
  item: ImportedMenuItem;
  menuType: string;
  categoryId: string | null;
  categoryNameById: Map<string, string>;
  catalog: ProductDocument[];
  maxResults?: number;
}): ImportProductDuplicateMatch[] {
  const candidateName = normalizeProductName(args.item.name);
  if (!candidateName) return [];

  const sensitive = isSensitiveNameContext(args.item, args.menuType);
  const candidatePrice = typeof args.item.price === "number" ? args.item.price : NaN;
  const candidateCat = normalizeProductName(args.item.suggestedCategory);
  const maxResults = args.maxResults ?? 3;

  const out: ImportProductDuplicateMatch[] = [];

  for (const product of args.catalog) {
    const pName = normalizeProductName(product.name);
    if (!pName) continue;

    const reasons: string[] = [];
    let score = 0;

    if (pName === candidateName) {
      reasons.push("normalized_exact");
      score = 1;
    } else {
      const sim = diceCoefficient(pName, candidateName);
      if (sensitive) {
        if (sim >= 0.96) {
          reasons.push("name_similar_strict");
          score = Math.max(score, sim);
        }
      } else if (sim >= 0.88) {
        reasons.push("name_similar");
        score = Math.max(score, sim);
      }
    }

    const pCatName =
      product.categoryName?.trim() ||
      (product.categoryId ? args.categoryNameById.get(product.categoryId) ?? "" : "");
    const pCat = normalizeProductName(pCatName);
    const catOk = candidateCat && pCat && candidateCat === pCat;
    const priceOk = approxPriceMatch(product.price ?? NaN, candidatePrice);

    if (catOk && priceOk) {
      const sim = diceCoefficient(pName, candidateName);
      const minSim = sensitive ? 0.9 : 0.72;
      if (sim >= minSim) {
        reasons.push("category_price");
        score = Math.max(score, sensitive ? Math.min(0.95, 0.7 + sim * 0.25) : 0.78);
      }
    }

    if (reasons.length === 0) continue;

    if (sensitive && !reasons.includes("normalized_exact") && score < 0.9) {
      continue;
    }

    out.push({
      productId: product.id,
      productName: product.name,
      score: Math.max(0, Math.min(1, score)),
      reasons,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
