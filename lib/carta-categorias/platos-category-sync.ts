import { loadPlatos, savePlatos, type PlatoCarta } from "@/lib/platos-local";
import type { CartaCategoria } from "./types";

/** Tras borrar categoría: quita vínculo en productos locales (mantiene texto categoria por si el usuario quiere reasignar). */
export function detachPlatosFromCategory(restauranteId: string, categoryId: string): void {
  const platos = loadPlatos(restauranteId);
  const next = platos.map((p) =>
    p.categoriaCartaId === categoryId ? { ...p, categoriaCartaId: undefined, updatedAt: new Date().toISOString() } : p,
  );
  savePlatos(restauranteId, next);
}

/** Alinea el campo texto `categoria` con el nombre de la categoría enlazada. */
export function denormalizePlatoCategoriaNombre(p: PlatoCarta, categorias: CartaCategoria[]): PlatoCarta {
  if (!p.categoriaCartaId) return p;
  const c = categorias.find((x) => x.id === p.categoriaCartaId);
  if (!c) return p;
  if (p.categoria === c.name) return p;
  return { ...p, categoria: c.name, updatedAt: new Date().toISOString() };
}

export function denormalizeAllPlatosCategorias(restauranteId: string, categorias: CartaCategoria[]): void {
  const platos = loadPlatos(restauranteId);
  const next = platos.map((p) => denormalizePlatoCategoriaNombre(p, categorias));
  savePlatos(restauranteId, next);
}
