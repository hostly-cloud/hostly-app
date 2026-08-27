import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";

/** Tipo principal de producto de venta. Este contrato no conoce persistencia. */
export const TIPOS_PRODUCTO_VENTA = ["plato", "bebida"] as const;
export type TipoProductoVenta = (typeof TIPOS_PRODUCTO_VENTA)[number];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function isTipoProductoVenta(value: unknown): value is TipoProductoVenta {
  return value === "plato" || value === "bebida";
}

/** Normaliza valores actuales y etiquetas históricas al contrato de venta. */
export function parseTipoVentaLoose(raw: unknown): TipoProductoVenta | null {
  if (raw == null) return null;
  const value = typeof raw === "string" ? normalizeText(raw.trim()) : raw;
  if (typeof value !== "string") return isTipoProductoVenta(value) ? value : null;
  if (value === "bebida" || value === "cafe" || value === "coctel") return "bebida";
  if (value === "plato" || value === "postre" || value === "menu" || value === "otro") return "plato";
  return null;
}

/** Inferencia de compatibilidad para entradas antiguas que no guardaban tipo explícito. */
export function inferTipoVentaFromCartaText(
  categoria: string,
  nombre: string,
): TipoProductoVenta {
  const blob = normalizeText(`${categoria} ${nombre}`);
  if (
    /\b(vino|cava|champagne|champan|sangria|cerveza|refresco|zumo|jugo|agua\b|water\b|bebida|copa\b|whisky|ron\b|ginebra|vermut|licor|spritz|aperol)\b/.test(blob) ||
    /\b(vinos|bodega|destilados|licores|cervezas|refrescos|espumosos|espumante|prosecco)\b/.test(blob) ||
    /\b(rosado|rosados|tinto|tintos|blanco|blancos|wine|wines|sparkling)\b/.test(blob) ||
    /\b(cafe|expresso|espresso|cappuccino|capuchino|latte|carajillo)\b/.test(blob) ||
    /\b(cocktail|coctel|mojito|gin tonic|margarita|daiquiri)\b/.test(blob)
  ) {
    return "bebida";
  }
  return "plato";
}

/**
 * Proyección común de un producto vendible usada por UI, mapeadores y migración.
 * No implica que su fuente sea localStorage; Firestore es la fuente operativa canónica.
 */
export type PlatoCarta = {
  id: string;
  restauranteId: string;
  nombre: string;
  preparationArea?: string;
  operationStationId?: string;
  operationStationName?: string;
  operationStationType?: OperationStationType;
  tipoVenta: TipoProductoVenta;
  categoria: string;
  categoriaCartaId?: string;
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
  modifierGroupIds?: string[];
  cartaFamiliaId?: string;
  ordenEnCategoria?: number;
  sortOrder?: number;
  precioVenta: number;
  activo: boolean;
  fotoUrl?: string;
  descripcion?: string;
  tieneEscandallo?: boolean;
  estadoCoste?: "pendiente" | "ok";
  origenAlta?: "manual" | "importacion_ia";
  familyId?: string;
  admiteModificadores?: boolean;
  gruposModificadoresIds?: string[];
  escandalloSupabaseId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductoVenta = PlatoCarta;
