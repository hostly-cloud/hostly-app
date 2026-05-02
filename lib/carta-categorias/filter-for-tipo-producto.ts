import type { TipoProductoVenta } from "@/lib/platos-local";
import type { CartaCategoria } from "./types";
import { CARTA_MENU_FAMILIA_FILTER_UNASSIGNED } from "./types";

/** Categorías de carta visibles según tipo de producto (food/drink; `general` en ambos). */
export function cartaCategoriasForTipoProducto(
  categorias: CartaCategoria[],
  tipo: TipoProductoVenta,
): CartaCategoria[] {
  return categorias.filter((c) => {
    if (c.type === "general") return true;
    if (tipo === "plato") return c.type === "food";
    return c.type === "drink";
  });
}

export function isCartaCategoriaCompatibleWithTipoProducto(
  cat: CartaCategoria | undefined,
  tipo: TipoProductoVenta,
): boolean {
  if (!cat) return true;
  if (cat.type === "general") return true;
  if (tipo === "plato") return cat.type === "food";
  return cat.type === "drink";
}

export function defaultCartaCategoriaTipoForTipoProducto(tipo: TipoProductoVenta): "food" | "drink" {
  return tipo === "plato" ? "food" : "drink";
}

/**
 * Categorías visibles según tipo de producto y filtro opcional por familia de carta.
 * - `familiaFiltroId === null`: todas las compatibles con el tipo.
 * - `familiaFiltroId === CARTA_MENU_FAMILIA_FILTER_UNASSIGNED`: solo categorías sin familia asignada.
 * - otro: solo categorías de esa familia.
 */
export function cartaCategoriasForTipoYFamiliaFiltro(
  categorias: CartaCategoria[],
  tipo: TipoProductoVenta,
  familiaFiltroId: string | null,
): CartaCategoria[] {
  const base = cartaCategoriasForTipoProducto(categorias, tipo);
  if (familiaFiltroId == null) return base;
  if (familiaFiltroId === CARTA_MENU_FAMILIA_FILTER_UNASSIGNED) {
    return base.filter((c) => !c.cartaFamiliaId?.trim());
  }
  return base.filter((c) => c.cartaFamiliaId === familiaFiltroId);
}
