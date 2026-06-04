import type { ProductKind } from "@/lib/carta/product-kind-options";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { ProductDocument } from "@/lib/firestore/products";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import { isOperationStationType } from "@/lib/operacion/operation-station-types";
import { parseTipoVentaLoose, type PlatoCarta } from "@/lib/platos-local";

/** Filtro compacto Bebidas / Comida (sin UI pesada). */
export type ProductServiceGroup = "all" | "drinks" | "food" | "unknown";

export type ProductServiceGroupFilter = "all" | "drinks" | "food";

export type ProductServiceGroupInput = {
  tipoVenta?: string | null;
  productFamilyType?: ProductFamilyType | null;
  productKind?: ProductKind | string | null;
  preparationArea?: string | null;
  operationStationType?: OperationStationType | string | null;
  categoria?: string | null;
  categoryName?: string | null;
};

const DRINK_STATION_TYPES = new Set<OperationStationType>(["bar", "cocktail"]);
const FOOD_STATION_TYPES = new Set<OperationStationType>(["kitchen"]);

function normText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function textHintsDrinks(blob: string): boolean {
  return (
    /\b(bebida|bebidas|barra|bar\b|coctel|cocteleria|cocktail|vino|vinos|cerveza|refresco|destilado|licor|cafe|expresso|espresso)\b/.test(
      blob,
    ) || blob.includes("bar ")
  );
}

function textHintsFood(blob: string): boolean {
  return (
    /\b(plato|platos|comida|cocina|entrante|principal|postre|menu|racion|tapa|pasta|pizza|carne|pescado)\b/.test(
      blob,
    ) || blob.includes("cocina")
  );
}

/**
 * Clasifica un producto en drinks / food / unknown usando campos ya existentes.
 * Prioridad: productFamilyType → tipoVenta → estación → área → texto categoría/nombre.
 */
export function resolveProductServiceGroup(
  input: ProductServiceGroupInput,
): ProductServiceGroup {
  const family = input.productFamilyType;
  if (family === "drink") return "drinks";
  if (family === "food") return "food";

  const tipo = parseTipoVentaLoose(input.tipoVenta);
  if (tipo === "bebida") return "drinks";
  if (tipo === "plato") return "food";

  const station = input.operationStationType;
  if (isOperationStationType(station)) {
    if (DRINK_STATION_TYPES.has(station)) return "drinks";
    if (FOOD_STATION_TYPES.has(station)) return "food";
  }

  const area = normText(input.preparationArea);
  if (area.includes("barra") || area.includes("coctel") || area === "bar") {
    return "drinks";
  }
  if (area.includes("cocina") || area.includes("kitchen")) return "food";

  const blob = normText(`${input.categoryName ?? ""} ${input.categoria ?? ""}`);
  if (textHintsDrinks(blob)) return "drinks";
  if (textHintsFood(blob)) return "food";

  return "unknown";
}

export function matchesProductServiceGroupFilter(
  group: ProductServiceGroup,
  filter: ProductServiceGroupFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "drinks") return group === "drinks";
  if (filter === "food") return group === "food";
  return true;
}

export function productServiceGroupFromPlato(p: PlatoCarta): ProductServiceGroup {
  return resolveProductServiceGroup({
    tipoVenta: p.tipoVenta,
    productFamilyType: p.productFamilyType ?? null,
    preparationArea: p.preparationArea ?? null,
    operationStationType: p.operationStationType ?? null,
    categoria: p.categoria ?? null,
  });
}

export function productServiceGroupFromCentralDoc(doc: ProductDocument): ProductServiceGroup {
  return resolveProductServiceGroup({
    tipoVenta: doc.tipoVenta ?? null,
    productFamilyType: doc.productFamilyType ?? null,
    productKind: doc.productKind ?? null,
    preparationArea: doc.preparationArea ?? doc.station ?? null,
    operationStationType: doc.operationStationType ?? null,
    categoryName: doc.categoryName ?? null,
  });
}
