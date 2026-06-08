import { comparePlatoCarta } from "@/lib/carta/product-sort-order";
import type { PlatoCarta } from "@/lib/platos-local";
import type { CartaCategoria } from "./types";

export type CartaGroupedSection = {
  /** Firestore/local id, or "__uncat" or "__orphan_inactive" or "text:…" */
  sectionKey: string;
  label: string;
  sortOrder: number;
  items: PlatoCarta[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sortPlatosInSection(rows: PlatoCarta[]): PlatoCarta[] {
  return [...rows].sort(comparePlatoCarta);
}

/**
 * Asigna cada producto a una sección de agrupación respetando categorías gestionadas y texto legado.
 */
export function buildCartaGroupedSections(
  platos: PlatoCarta[],
  categorias: CartaCategoria[],
  opts: { activeProductsOnly: boolean; activeCategoriesOnly: boolean },
): CartaGroupedSection[] {
  const byId = new Map(categorias.map((c) => [c.id, c] as const));
  const byName = new Map<string, CartaCategoria>();
  for (const c of categorias) {
    byName.set(norm(c.name), c);
  }

  const rows = opts.activeProductsOnly ? platos.filter((p) => p.activo) : [...platos];

  type Bucket = { label: string; sortOrder: number; items: PlatoCarta[] };
  const buckets = new Map<string, Bucket>();

  function add(key: string, label: string, sortOrder: number, p: PlatoCarta) {
    const b = buckets.get(key) ?? { label, sortOrder, items: [] };
    b.items.push(p);
    b.label = label;
    b.sortOrder = sortOrder;
    buckets.set(key, b);
  }

  for (const p of rows) {
    let cat: CartaCategoria | undefined;
    if (p.categoriaCartaId && byId.has(p.categoriaCartaId)) {
      cat = byId.get(p.categoriaCartaId);
    } else {
      const t = (p.categoria ?? "").trim();
      if (t) cat = byName.get(norm(t));
    }

    if (cat) {
      if (opts.activeCategoriesOnly && !cat.isActive) {
        add("__orphan_inactive", "Otros", 50_000, p);
        continue;
      }
      add(cat.id, cat.name, cat.sortOrder, p);
      continue;
    }

    const t = (p.categoria ?? "").trim();
    if (!t) {
      add("__uncat", "— Sin categoría —", 60_000, p);
    } else {
      add(`text:${t}`, t, 55_000, p);
    }
  }

  const sections: CartaGroupedSection[] = [...buckets.entries()].map(([sectionKey, b]) => ({
    sectionKey,
    label: b.label,
    sortOrder: b.sortOrder,
    items: sortPlatosInSection(b.items),
  }));

  sections.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });

  return sections;
}
