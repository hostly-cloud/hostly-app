import type { PlatoCarta } from "@/lib/carta/product-sale-contract";

export type DuplicateReason = "normalized_exact" | "name_similar" | "category_price";

export type PotentialDuplicate = {
  platoId: string;
  score: number; // 0..1
  reasons: DuplicateReason[];
};

export function normalizeProductName(input: string): string {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return (2 * intersection) / ((a.length - 1) + (b.length - 1));
}

function approxPriceMatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= 0.5) return true;
  const denom = Math.max(1, Math.abs(a), Math.abs(b));
  return diff / denom <= 0.06;
}

export function findPotentialDuplicates(args: {
  restauranteId: string;
  catalog: PlatoCarta[];
  candidate: { nombre: string; categoria?: string; precio?: number };
  maxResults?: number;
}): PotentialDuplicate[] {
  const maxResults = typeof args.maxResults === "number" && args.maxResults > 0 ? Math.min(8, args.maxResults) : 5;
  const candidateName = normalizeProductName(args.candidate.nombre);
  const candidateCat = normalizeProductName(args.candidate.categoria ?? "");
  const candidatePrecio = typeof args.candidate.precio === "number" ? args.candidate.precio : NaN;

  if (!candidateName) return [];

  const out: PotentialDuplicate[] = [];

  for (const p of args.catalog) {
    if (!p || p.restauranteId !== args.restauranteId) continue;
    const reasons: DuplicateReason[] = [];
    const pName = normalizeProductName(p.nombre);
    const pCat = normalizeProductName(p.categoria ?? "");

    if (!pName) continue;

    let score = 0;

    if (pName === candidateName) {
      reasons.push("normalized_exact");
      score = Math.max(score, 1);
    } else {
      const sim = diceCoefficient(pName, candidateName);
      if (sim >= 0.88) {
        reasons.push("name_similar");
        score = Math.max(score, sim);
      }
    }

    const catOk = candidateCat && pCat && candidateCat === pCat;
    const priceOk = approxPriceMatch(p.precioVenta, candidatePrecio);
    if (catOk && priceOk) {
      reasons.push("category_price");
      score = Math.max(score, 0.78);
    }

    if (reasons.length === 0) continue;

    if (reasons.includes("category_price") && !reasons.includes("normalized_exact")) {
      const sim = diceCoefficient(pName, candidateName);
      if (sim < 0.72) continue;
      score = Math.max(score, Math.min(0.86, 0.65 + sim * 0.25));
    }

    out.push({ platoId: p.id, score: Math.max(0, Math.min(1, score)), reasons });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
