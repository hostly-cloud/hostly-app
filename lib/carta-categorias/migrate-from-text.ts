"use client";

import { loadPlatos, savePlatos, type PlatoCarta } from "@/lib/platos-local";
import { createCartaCategoriaApi, fetchCartaCategorias } from "./api-client";
import type { CartaCategoria } from "./types";

/**
 * Crea categorías a partir de textos únicos en productos y asigna categoriaCartaId.
 * Idempotente: no duplica por nombre (comparación normalizada).
 */
export async function migrateTextCategoriesToManaged(
  restauranteId: string,
): Promise<{ created: number; updatedProducts: number; categories: CartaCategoria[] }> {
  let categorias = await fetchCartaCategorias(restauranteId);
  const platos = loadPlatos(restauranteId);
  const byNorm = new Map<string, CartaCategoria>();
  for (const c of categorias) {
    byNorm.set(normName(c.name), c);
  }

  const uniqueTexts = new Set<string>();
  for (const p of platos) {
    const t = (p.categoria ?? "").trim();
    if (t) uniqueTexts.add(t);
  }

  let created = 0;
  for (const name of uniqueTexts) {
    const key = normName(name);
    if (byNorm.has(key)) continue;
    const res = await createCartaCategoriaApi(restauranteId, {
      name,
      type: "general",
      isActive: true,
    });
    if (!res.ok) continue;
    byNorm.set(key, res.item);
    categorias = [...categorias, res.item].sort((a, b) => a.sortOrder - b.sortOrder);
    created += 1;
  }

  let updatedProducts = 0;
  const nextPlatos: PlatoCarta[] = platos.map((p) => {
    if (p.categoriaCartaId) return p;
    const t = (p.categoria ?? "").trim();
    if (!t) return p;
    const cat = byNorm.get(normName(t));
    if (!cat) return p;
    updatedProducts += 1;
    return {
      ...p,
      categoriaCartaId: cat.id,
      categoria: cat.name,
      updatedAt: new Date().toISOString(),
    };
  });

  if (updatedProducts > 0) {
    savePlatos(restauranteId, nextPlatos);
  }

  categorias = await fetchCartaCategorias(restauranteId);
  return { created, updatedProducts, categories: categorias };
}

function normName(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
