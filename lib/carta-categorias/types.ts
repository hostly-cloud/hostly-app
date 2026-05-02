export type CartaCategoriaTipo = "food" | "drink" | "general";

/** Valor de filtro UI: categorías sin `cartaFamiliaId` (datos legados o sin agrupar). */
export const CARTA_MENU_FAMILIA_FILTER_UNASSIGNED = "__carta_menu_fam_unassigned__";

/** Familia de menú (ej. Platos, Bebidas). Agrupa categorías de carta. No confundir con `familyId` en producto (modificadores). */
export type CartaFamilia = {
  id: string;
  restauranteId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CartaCategoria = {
  id: string;
  restauranteId: string;
  name: string;
  slug: string;
  type: CartaCategoriaTipo;
  /** Familia de carta a la que pertenece esta categoría (una sola). */
  cartaFamiliaId?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isCartaCategoriaTipo(v: unknown): v is CartaCategoriaTipo {
  return v === "food" || v === "drink" || v === "general";
}
