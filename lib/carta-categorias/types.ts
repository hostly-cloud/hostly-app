import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { ProductionStationType } from "@/lib/produccion/production-station-types";
import type { CategoryOperationalBehavior } from "./category-operational-behavior";
import type { CartaFamiliaDestino, CartaFamiliaPase } from "./familia-operational-config";

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
  /** Tipo operativo: comida, bebida o mixto (`general`). Ausente en legado → `general`. */
  familyType?: CartaCategoriaTipo;
  /** Destino / estación sugerida para productos de esta familia (legado; se sincroniza al guardar estación). */
  suggestedDestination?: CartaFamiliaDestino;
  /** Estación de producción configurable (`productionStations/{id}`). */
  productionStationId?: string;
  /** Nombre denormalizado para listados sin join. */
  productionStationName?: string;
  /** Tipo denormalizado de la estación asignada. */
  productionStationType?: ProductionStationType;
  /** Pase por defecto sugerido. */
  defaultPass?: CartaFamiliaPase;
  /** Si la familia usa pases de servicio (entrante, primero…). */
  trabajaPorPases?: boolean;
  /** Nota interna opcional para el encargado. */
  description?: string;
  /** Si los productos suelen requerir preparación en cocina/barra. */
  requierePreparacion?: boolean;
  /** Si las líneas suelen poder marcharse por pase. */
  marchable?: boolean;
  /** Si conviene agrupar líneas iguales al enviar. */
  agruparLineas?: boolean;
};

export type CartaCategoria = {
  id: string;
  restauranteId: string;
  name: string;
  slug: string;
  type: CartaCategoriaTipo;
  /**
   * Comportamiento operativo por defecto de la categoría.
   * Ausente en documentos antiguos → tratar como `simple`.
   */
  categoryOperationalBehavior?: CategoryOperationalBehavior;
  /** Familia de carta a la que pertenece esta categoría (una sola). */
  cartaFamiliaId?: string;
  /** Familia de producto (`productFamilies`): bebidas / comida / otros. */
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
  /** Grupos de modificadores asignados a la categoría (formato, mixer, etc.). */
  modifierGroupIds?: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isCartaCategoriaTipo(v: unknown): v is CartaCategoriaTipo {
  return v === "food" || v === "drink" || v === "general";
}
