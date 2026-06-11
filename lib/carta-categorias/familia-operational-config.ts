import {
  isProductionStationType,
  type ProductionStationDocument,
  type ProductionStationType,
} from "@/lib/produccion/production-station-types";
import type { CartaCategoriaTipo, CartaFamilia } from "./types";
import { isCartaCategoriaTipo } from "./types";

/**
 * Estación sugerida de la familia.
 * Valores UI actuales; en el futuro se resolverán a `operationStations/{id}`.
 */
export type CartaFamiliaDestino =
  | "cocina"
  | "barra"
  | "cocteleria"
  | "postres"
  | "sin_destino"
  /** Legado (lectura): se normalizan a `cocina` en UI. */
  | "cocina_frio"
  | "cocina_caliente";

/** Opciones visibles en formulario Familias (5 estaciones simples). */
export const CARTA_FAMILIA_DESTINO_UI_VALUES: readonly CartaFamiliaDestino[] = [
  "cocina",
  "barra",
  "cocteleria",
  "postres",
  "sin_destino",
] as const;

/** Pase por defecto sugerido (futura herencia a productos). */
export type CartaFamiliaPase =
  | "sin_pase"
  | "entrante"
  | "primero"
  | "segundo"
  | "postre";

/** Pases seleccionables cuando la familia trabaja por pases. */
export const CARTA_FAMILIA_PASE_UI_VALUES: readonly Exclude<
  CartaFamiliaPase,
  "sin_pase"
>[] = ["entrante", "primero", "segundo", "postre"] as const;

export type CartaFamiliaOperativa = {
  familyType: CartaCategoriaTipo;
  suggestedDestination: CartaFamiliaDestino;
  trabajaPorPases: boolean;
  defaultPass: CartaFamiliaPase;
  description?: string;
  /** Campos reservados (no UI); se conservan al guardar. */
  requierePreparacion: boolean;
  marchable: boolean;
  agruparLineas: boolean;
};

export type CartaFamiliaProductionStationRef = {
  productionStationId?: string;
  productionStationName?: string;
  productionStationType?: ProductionStationType;
};

export type CartaFamiliaOperationalPatch = Partial<
  Omit<CartaFamiliaOperativa, "description">
> & {
  trabajaPorPases?: boolean;
  /** `null` o `""` borra la descripción al guardar. */
  description?: string | null;
  /** `null` o `""` desasigna la estación de producción. */
  productionStationId?: string | null;
  productionStationName?: string | null;
  productionStationType?: ProductionStationType | null;
};

export const DEFAULT_CARTA_FAMILIA_OPERATIVA: CartaFamiliaOperativa = {
  familyType: "general",
  suggestedDestination: "sin_destino",
  trabajaPorPases: false,
  defaultPass: "sin_pase",
  description: undefined,
  requierePreparacion: false,
  marchable: true,
  agruparLineas: false,
};

const LEGACY_COCINA_DESTINOS = new Set<CartaFamiliaDestino>([
  "cocina_frio",
  "cocina_caliente",
]);

export function isCartaFamiliaDestino(value: unknown): value is CartaFamiliaDestino {
  return (
    value === "cocina" ||
    value === "barra" ||
    value === "cocteleria" ||
    value === "postres" ||
    value === "sin_destino" ||
    value === "cocina_frio" ||
    value === "cocina_caliente"
  );
}

export function isCartaFamiliaPase(value: unknown): value is CartaFamiliaPase {
  return (
    value === "sin_pase" ||
    value === "entrante" ||
    value === "primero" ||
    value === "segundo" ||
    value === "postre"
  );
}

/** Normaliza destino guardado → valor canónico UI (cocina unificada). */
export function normalizeCartaFamiliaDestino(raw: unknown): CartaFamiliaDestino {
  if (raw === "cocina_frio" || raw === "cocina_caliente") return "cocina";
  if (isCartaFamiliaDestino(raw)) return raw;
  return DEFAULT_CARTA_FAMILIA_OPERATIVA.suggestedDestination;
}

export function normalizeCartaFamiliaPase(raw: unknown): CartaFamiliaPase {
  if (isCartaFamiliaPase(raw)) return raw;
  return DEFAULT_CARTA_FAMILIA_OPERATIVA.defaultPass;
}

export function normalizeCartaFamiliaType(raw: unknown): CartaCategoriaTipo {
  if (isCartaCategoriaTipo(raw)) return raw;
  return DEFAULT_CARTA_FAMILIA_OPERATIVA.familyType;
}

export function resolveTrabajaPorPases(
  familia: Partial<CartaFamilia> | CartaFamiliaOperationalPatch,
): boolean {
  if (typeof familia.trabajaPorPases === "boolean") return familia.trabajaPorPases;
  const pass = familia.defaultPass;
  if (pass === undefined) return false;
  return pass !== "sin_pase";
}

export function normalizeCartaFamiliaOperativa(
  raw: Partial<CartaFamilia> | CartaFamiliaOperationalPatch | null | undefined,
): CartaFamiliaOperativa {
  const base = DEFAULT_CARTA_FAMILIA_OPERATIVA;
  if (!raw) return { ...base };

  const trabajaPorPases = resolveTrabajaPorPases(raw);
  let defaultPass = normalizeCartaFamiliaPase(raw.defaultPass);
  if (!trabajaPorPases) {
    defaultPass = "sin_pase";
  } else if (defaultPass === "sin_pase") {
    defaultPass = "entrante";
  }

  let description: string | undefined;
  if ("description" in raw && (raw.description === null || raw.description === "")) {
    description = undefined;
  } else if (typeof raw.description === "string" && raw.description.trim()) {
    description = raw.description.trim();
  } else if (typeof raw.description === "string") {
    description = undefined;
  } else {
    description = undefined;
  }

  return {
    familyType: normalizeCartaFamiliaType(raw.familyType),
    suggestedDestination: normalizeCartaFamiliaDestino(raw.suggestedDestination),
    trabajaPorPases,
    defaultPass,
    description,
    requierePreparacion:
      typeof raw.requierePreparacion === "boolean"
        ? raw.requierePreparacion
        : base.requierePreparacion,
    marchable: typeof raw.marchable === "boolean" ? raw.marchable : base.marchable,
    agruparLineas:
      typeof raw.agruparLineas === "boolean" ? raw.agruparLineas : base.agruparLineas,
  };
}

export function getCartaFamiliaTypeLabel(type: CartaCategoriaTipo): string {
  switch (type) {
    case "food":
      return "Comida";
    case "drink":
      return "Bebida";
    case "general":
      return "Mixto";
    default:
      return "Mixto";
  }
}

export function getCartaFamiliaDestinoLabel(destino: CartaFamiliaDestino): string {
  const normalized = normalizeCartaFamiliaDestino(destino);
  switch (normalized) {
    case "cocina":
      return LEGACY_COCINA_DESTINOS.has(destino) ? "Cocina" : "Cocina";
    case "barra":
      return "Barra";
    case "cocteleria":
      return "Coctelería";
    case "postres":
      return "Postres";
    case "sin_destino":
      return "Sin destino";
    default:
      return "Sin destino";
  }
}

export function getCartaFamiliaPaseLabel(pase: CartaFamiliaPase): string {
  switch (pase) {
    case "sin_pase":
      return "Sin pases";
    case "entrante":
      return "Entrante";
    case "primero":
      return "Primero";
    case "segundo":
      return "Segundo";
    case "postre":
      return "Postre";
    default:
      return "Sin pases";
  }
}

/** Etiqueta de estación en listados: nombre real o «Sin estación asignada». */
export function getCartaFamiliaStationDisplayLabel(familia: CartaFamilia): string {
  const name = familia.productionStationName?.trim();
  if (name) return name;
  return "Sin estación asignada";
}

/** Resumen de listado: «Comida · Pizzería · Segundo» o «Bebida · Barra · Sin pases». */
export function formatCartaFamiliaListSummary(familia: CartaFamilia): string {
  const operativa = resolveCartaFamiliaOperativa(familia);
  const paseLabel = operativa.trabajaPorPases
    ? getCartaFamiliaPaseLabel(operativa.defaultPass)
    : "Sin pases";
  return [
    getCartaFamiliaTypeLabel(operativa.familyType),
    getCartaFamiliaStationDisplayLabel(familia),
    paseLabel,
  ].join(" · ");
}

/** @deprecated Usar formatCartaFamiliaListSummary */
export function formatCartaFamiliaOperativaSummary(familia: CartaFamilia): string {
  return formatCartaFamiliaListSummary(familia);
}

/**
 * Futuro: mapeo a estación operativa configurable.
 * Por ahora devuelve tipo legacy aproximado para documentar la intención.
 */
export function mapCartaFamiliaDestinoToFutureStationType(
  destino: CartaFamiliaDestino,
): "kitchen" | "bar" | "cocktail" | "none" {
  const d = normalizeCartaFamiliaDestino(destino);
  if (d === "cocina" || d === "postres") return "kitchen";
  if (d === "barra") return "bar";
  if (d === "cocteleria") return "cocktail";
  return "none";
}

/** Sincroniza destino legacy a partir del tipo de estación de producción. */
export function mapProductionStationTypeToCartaFamiliaDestino(
  type: ProductionStationType,
): CartaFamiliaDestino {
  if (type === "cocina") return "cocina";
  if (type === "barra") return "barra";
  if (type === "cocteleria") return "cocteleria";
  return "sin_destino";
}

export function buildCartaFamiliaProductionStationRef(
  station: ProductionStationDocument | null | undefined,
): CartaFamiliaProductionStationRef & { suggestedDestination: CartaFamiliaDestino } {
  if (!station) {
    return {
      productionStationId: undefined,
      productionStationName: undefined,
      productionStationType: undefined,
      suggestedDestination: "sin_destino",
    };
  }
  return {
    productionStationId: station.id,
    productionStationName: station.name,
    productionStationType: station.type,
    suggestedDestination: mapProductionStationTypeToCartaFamiliaDestino(station.type),
  };
}

export function resolveCartaFamiliaOperativa(familia: CartaFamilia): CartaFamiliaOperativa {
  return normalizeCartaFamiliaOperativa(familia);
}

export function cartaFamiliaFromFirestoreDoc(
  restauranteId: string,
  id: string,
  d: Record<string, unknown>,
): CartaFamilia {
  const familia: CartaFamilia = {
    id,
    restauranteId,
    name: typeof d.name === "string" ? d.name : "",
    sortOrder: typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
    isActive: d.isActive !== false,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
  };
  if (isCartaCategoriaTipo(d.familyType)) familia.familyType = d.familyType;
  if (isCartaFamiliaDestino(d.suggestedDestination)) {
    familia.suggestedDestination = d.suggestedDestination;
  }
  if (isCartaFamiliaPase(d.defaultPass)) familia.defaultPass = d.defaultPass;
  if (typeof d.trabajaPorPases === "boolean") familia.trabajaPorPases = d.trabajaPorPases;
  if (typeof d.description === "string" && d.description.trim()) {
    familia.description = d.description.trim();
  }
  if (typeof d.requierePreparacion === "boolean") {
    familia.requierePreparacion = d.requierePreparacion;
  }
  if (typeof d.marchable === "boolean") familia.marchable = d.marchable;
  if (typeof d.agruparLineas === "boolean") familia.agruparLineas = d.agruparLineas;
  if (typeof d.productionStationId === "string" && d.productionStationId.trim()) {
    familia.productionStationId = d.productionStationId.trim();
  }
  if (typeof d.productionStationName === "string" && d.productionStationName.trim()) {
    familia.productionStationName = d.productionStationName.trim();
  }
  if (isProductionStationType(d.productionStationType)) {
    familia.productionStationType = d.productionStationType;
  }
  return familia;
}

export function cartaFamiliaOperationalPatchFromBody(
  body: Record<string, unknown> | null | undefined,
): CartaFamiliaOperationalPatch {
  if (!body) return {};
  const patch: CartaFamiliaOperationalPatch = {};
  if ("familyType" in body) {
    patch.familyType = normalizeCartaFamiliaType(body.familyType);
  }
  if ("suggestedDestination" in body) {
    patch.suggestedDestination = normalizeCartaFamiliaDestino(body.suggestedDestination);
  }
  if ("defaultPass" in body) {
    patch.defaultPass = normalizeCartaFamiliaPase(body.defaultPass);
  }
  if ("trabajaPorPases" in body) {
    patch.trabajaPorPases = Boolean(body.trabajaPorPases);
  }
  if ("description" in body) {
    const desc = typeof body.description === "string" ? body.description.trim() : "";
    patch.description = desc || null;
  }
  if ("requierePreparacion" in body) {
    patch.requierePreparacion = Boolean(body.requierePreparacion);
  }
  if ("marchable" in body) {
    patch.marchable = Boolean(body.marchable);
  }
  if ("agruparLineas" in body) {
    patch.agruparLineas = Boolean(body.agruparLineas);
  }
  if ("productionStationId" in body) {
    const id =
      typeof body.productionStationId === "string" ? body.productionStationId.trim() : "";
    patch.productionStationId = id || null;
  }
  if ("productionStationName" in body) {
    const name =
      typeof body.productionStationName === "string" ? body.productionStationName.trim() : "";
    patch.productionStationName = name || null;
  }
  if ("productionStationType" in body) {
    const t = body.productionStationType;
    patch.productionStationType = isProductionStationType(t) ? t : null;
  }
  return patch;
}

/** Payload operativo listo para API a partir del borrador de formulario. */
export function buildCartaFamiliaOperativaPayload(
  draft: Partial<CartaFamiliaOperativa>,
  existing?: CartaFamilia | null,
): CartaFamiliaOperativa {
  const base = existing ? resolveCartaFamiliaOperativa(existing) : DEFAULT_CARTA_FAMILIA_OPERATIVA;
  return normalizeCartaFamiliaOperativa({ ...base, ...draft });
}

/** Aplica referencia de estación de producción al objeto de update Firestore. */
export function applyCartaFamiliaProductionStationPatchToUpdate(
  patch: CartaFamiliaOperationalPatch,
  update: Record<string, unknown>,
  fieldValueDelete: unknown,
): void {
  if (!("productionStationId" in patch)) return;

  const id =
    typeof patch.productionStationId === "string" ? patch.productionStationId.trim() : "";
  if (id) {
    update.productionStationId = id;
    if (typeof patch.productionStationName === "string" && patch.productionStationName.trim()) {
      update.productionStationName = patch.productionStationName.trim();
    }
    if (isProductionStationType(patch.productionStationType)) {
      update.productionStationType = patch.productionStationType;
    }
    return;
  }

  update.productionStationId = fieldValueDelete;
  update.productionStationName = fieldValueDelete;
  update.productionStationType = fieldValueDelete;
}
