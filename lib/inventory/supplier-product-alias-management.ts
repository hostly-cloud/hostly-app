import { calculateProductMatchConfidence } from "@/lib/inventory/invoice-product-matching";
import type { SupplierProductAliasDocument } from "@/lib/inventory/supplier-product-alias-types";
import { isSupplierProductAliasActiveForMatching } from "@/lib/firestore/supplier-product-aliases";

export type SupplierAliasStatusFilter = "all" | "active" | "inactive";

export type SupplierAliasSortFilter = "recent" | "most_used" | "stale";

export type SupplierAliasListFilters = {
  query: string;
  supplierName: string;
  status: SupplierAliasStatusFilter;
  sort: SupplierAliasSortFilter;
};

export const SUPPLIER_ALIAS_STALE_MS = 1000 * 60 * 60 * 24 * 30;

export function formatAliasDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAliasRelative(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "Sin uso";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Hace un momento";
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 86_400_000 * 30) return `Hace ${Math.floor(diff / 86_400_000)} d`;
  return formatAliasDateTime(ms);
}

export function getAliasOperationalStatus(
  alias: SupplierProductAliasDocument,
): "active" | "inactive" {
  if (alias.deletedAt != null && alias.deletedAt > 0) return "inactive";
  if (alias.active === false) return "inactive";
  return "active";
}

export function getAliasMatchTypeLabel(alias: SupplierProductAliasDocument): string {
  return alias.matchSource === "manual"
    ? "Corregido manualmente"
    : "Aprendido automáticamente";
}

export function listUniqueSupplierNames(aliases: readonly SupplierProductAliasDocument[]): string[] {
  const names = new Set<string>();
  for (const alias of aliases) {
    const name = alias.supplierName?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "es"));
}

export function filterSupplierProductAliases(
  aliases: readonly SupplierProductAliasDocument[],
  filters: SupplierAliasListFilters,
): SupplierProductAliasDocument[] {
  const q = filters.query.trim().toLowerCase();

  let rows = aliases.filter((alias) => {
    if (filters.supplierName && (alias.supplierName?.trim() ?? "") !== filters.supplierName) {
      return false;
    }

    const status = getAliasOperationalStatus(alias);
    if (filters.status === "active" && status !== "active") return false;
    if (filters.status === "inactive" && status !== "inactive") return false;

    if (filters.sort === "stale") {
      const last = alias.lastUsedAt ?? alias.updatedAt;
      if (Date.now() - last < SUPPLIER_ALIAS_STALE_MS) return false;
    }

    if (!q) return true;

    const haystack = [
      alias.rawText,
      alias.normalizedText,
      alias.inventoryProductName,
      alias.supplierName ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });

  if (filters.sort === "most_used") {
    rows = [...rows].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt);
  } else if (filters.sort === "stale") {
    rows = [...rows].sort(
      (a, b) =>
        (a.lastUsedAt ?? a.updatedAt) - (b.lastUsedAt ?? b.updatedAt),
    );
  } else {
    rows = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return rows;
}

export type SimilarAliasMatch = {
  alias: SupplierProductAliasDocument;
  confidence: number;
};

export function findSimilarSupplierProductAliases(
  source: SupplierProductAliasDocument,
  aliases: readonly SupplierProductAliasDocument[],
  minConfidence = 0.72,
  maxResults = 8,
): SimilarAliasMatch[] {
  const matches: SimilarAliasMatch[] = [];

  for (const alias of aliases) {
    if (alias.id === source.id) continue;
    if (!isSupplierProductAliasActiveForMatching(alias)) continue;

    const confidence = calculateProductMatchConfidence(source.rawText, alias.rawText);
    if (confidence >= minConfidence) {
      matches.push({ alias, confidence });
    }
  }

  return matches
    .sort((a, b) => b.confidence - a.confidence || b.alias.usageCount - a.alias.usageCount)
    .slice(0, maxResults);
}

export function countActiveAliases(aliases: readonly SupplierProductAliasDocument[]): number {
  return aliases.filter((alias) => isSupplierProductAliasActiveForMatching(alias)).length;
}
