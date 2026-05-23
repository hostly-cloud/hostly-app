/**
 * Conversión runtime entre unidades de inventario compatibles.
 * No muta unidades almacenadas en Firestore; solo normaliza en apply.
 */

export type InventoryUnitGroup = "volume" | "weight" | "unit" | "unknown";

export type ConvertInventoryQuantityParams = {
  quantity: number;
  fromUnit: unknown;
  toUnit: unknown;
};

const VOLUME_CANONICAL = new Set(["ml", "cl", "l"]);
const WEIGHT_CANONICAL = new Set(["g", "kg"]);

const VOLUME_ALIASES: Record<string, "ml" | "cl" | "l"> = {
  ml: "ml",
  cl: "cl",
  l: "l",
  mililitro: "ml",
  mililitros: "ml",
  centilitro: "cl",
  centilitros: "cl",
  litro: "l",
  litros: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  lt: "l",
};

const WEIGHT_ALIASES: Record<string, "g" | "kg"> = {
  g: "g",
  kg: "kg",
  gramo: "g",
  gramos: "g",
  gram: "g",
  grams: "g",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  kilogramos: "kg",
  kilogram: "kg",
  kilograms: "kg",
};

const UNIT_ALIASES: Record<string, "unit"> = {
  ud: "unit",
  unit: "unit",
  unidad: "unit",
  u: "unit",
  uds: "unit",
};

/** Redondeo estable para stock (3 decimales). */
export function roundInventoryQuantity(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1000) / 1000;
}

/**
 * Alias → unidad canónica del grupo (ml/cl/l, g/kg, unit).
 * Compatible con códigos ya usados en inventario central (`ud`, `l`, …).
 */
export function normalizeInventoryUnitAlias(unit: unknown): string {
  const raw = String(unit ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (VOLUME_ALIASES[raw]) return VOLUME_ALIASES[raw];
  if (WEIGHT_ALIASES[raw]) return WEIGHT_ALIASES[raw];
  if (UNIT_ALIASES[raw]) return UNIT_ALIASES[raw];
  if (VOLUME_CANONICAL.has(raw)) return raw;
  if (WEIGHT_CANONICAL.has(raw)) return raw;
  return raw;
}

export function resolveInventoryUnitGroup(unit: unknown): InventoryUnitGroup {
  const norm = normalizeInventoryUnitAlias(unit);
  if (norm === "ml" || norm === "cl" || norm === "l") return "volume";
  if (norm === "g" || norm === "kg") return "weight";
  if (norm === "unit") return "unit";
  return "unknown";
}

export function areInventoryUnitsCompatible(a: unknown, b: unknown): boolean {
  const normA = normalizeInventoryUnitAlias(a);
  const normB = normalizeInventoryUnitAlias(b);
  if (!normA || !normB) return false;
  const groupA = resolveInventoryUnitGroup(normA);
  const groupB = resolveInventoryUnitGroup(normB);
  if (groupA === "unknown" || groupB === "unknown") return false;
  return groupA === groupB;
}

function quantityToBase(quantity: number, normalizedUnit: string): number | null {
  switch (normalizedUnit) {
    case "ml":
      return quantity;
    case "cl":
      return quantity * 10;
    case "l":
      return quantity * 1000;
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "unit":
      return quantity;
    default:
      return null;
  }
}

function quantityFromBase(baseQuantity: number, normalizedUnit: string): number | null {
  switch (normalizedUnit) {
    case "ml":
      return baseQuantity;
    case "cl":
      return baseQuantity / 10;
    case "l":
      return baseQuantity / 1000;
    case "g":
      return baseQuantity;
    case "kg":
      return baseQuantity / 1000;
    case "unit":
      return baseQuantity;
    default:
      return null;
  }
}

/**
 * Convierte cantidad entre unidades compatibles del mismo grupo.
 * Devuelve null si unidades desconocidas, incompatibles o cantidad inválida.
 */
export function convertInventoryQuantity(
  params: ConvertInventoryQuantityParams,
): number | null {
  const { quantity } = params;
  if (!Number.isFinite(quantity)) return null;

  const from = normalizeInventoryUnitAlias(params.fromUnit);
  const to = normalizeInventoryUnitAlias(params.toUnit);
  if (!from || !to) return null;
  if (!areInventoryUnitsCompatible(from, to)) return null;

  const base = quantityToBase(quantity, from);
  if (base == null || !Number.isFinite(base)) return null;

  const converted = quantityFromBase(base, to);
  if (converted == null || !Number.isFinite(converted)) return null;

  return roundInventoryQuantity(converted);
}
