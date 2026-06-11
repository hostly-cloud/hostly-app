import {
  getCartaFamiliaPaseLabel,
  resolveCartaFamiliaOperativa,
} from "@/lib/carta-categorias/familia-operational-config";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";

export type ProductMenuFamilyInheritedHintView =
  | { status: "hidden" }
  | { status: "no-menu-family" }
  | {
      status: "inherited";
      menuFamilyName: string;
      categoryName: string;
      suggestedStation: string;
      suggestedPass: string;
    };

export type BuildProductMenuFamilyInheritedHintInput = {
  selectedCategory: CartaCategoria | null | undefined;
  cartaFamilias: readonly CartaFamilia[];
  /** Fase 2: cargar `productionStations` y pasar al resolver unificado. */
  productionStations?: readonly ProductionStationDocument[];
  operationStations?: readonly OperationStationDocument[];
};

/**
 * Ayuda visual: sugerencias operativas heredadas desde la familia de menú de la categoría.
 * Solo lectura; no modifica datos del producto.
 */
export function buildProductMenuFamilyInheritedHintView(
  input: BuildProductMenuFamilyInheritedHintInput,
): ProductMenuFamilyInheritedHintView {
  const { selectedCategory, cartaFamilias } = input;
  if (!selectedCategory) return { status: "hidden" };

  const familiaId = selectedCategory.cartaFamiliaId?.trim();
  if (!familiaId) return { status: "no-menu-family" };

  const family = cartaFamilias.find((f) => f.id === familiaId);
  if (!family) return { status: "no-menu-family" };

  const operativa = resolveCartaFamiliaOperativa(family);
  const stationName = family.productionStationName?.trim();
  const suggestedStation = stationName || "Sin estación sugerida";
  const suggestedPass = operativa.trabajaPorPases
    ? getCartaFamiliaPaseLabel(operativa.defaultPass)
    : "Sin pases";

  // Fase 2: cuando `productionStations` esté disponible en el formulario, usar:
  // resolveEffectiveProductionStation({
  //   product: editingProductDoc,
  //   family: {
  //     productionStationId: family.productionStationId,
  //     productionStationName: family.productionStationName,
  //     productionStationType: family.productionStationType,
  //   },
  //   productionStations: input.productionStations ?? [],
  //   operationStations: input.operationStations ?? [],
  // });

  return {
    status: "inherited",
    menuFamilyName: family.name,
    categoryName: selectedCategory.name.trim() || selectedCategory.name,
    suggestedStation,
    suggestedPass,
  };
}
