import type { ModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import { isModifierInventoryUnit } from "@/lib/modifiers/modifier-types";

export type ModifierInventoryFieldSource = {
  inventoryProductId?: string | null;
  inventoryProductName?: string | null;
  inventoryQuantity?: number | null;
  inventoryUnit?: string | null;
};

export type NormalizedModifierInventoryFields = {
  inventoryProductId: string;
  inventoryProductName?: string;
  inventoryQuantity: number;
  inventoryUnit: ModifierInventoryUnit;
};

export type ModifierInventoryPayloadFields = {
  inventoryProductId?: string;
  inventoryProductName?: string;
  inventoryQuantity?: number;
  inventoryUnit?: ModifierInventoryUnit;
};

export type ModifierInventoryConsumptionSource = ModifierInventoryFieldSource & {
  groupId: string;
  groupName?: string;
  optionId: string;
  optionName?: string;
};

export type ModifierInventoryConsumptionLine = NormalizedModifierInventoryFields & {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
};

function readPositiveQuantity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

/** Normaliza campos de consumo de inventario embebidos en una opción de modificador. */
export function normalizeModifierInventoryFields(
  source: ModifierInventoryFieldSource | null | undefined,
): Partial<NormalizedModifierInventoryFields> {
  if (!source || typeof source !== "object") return {};
  const inventoryProductId =
    typeof source.inventoryProductId === "string"
      ? source.inventoryProductId.trim()
      : "";
  if (!inventoryProductId) return {};

  const inventoryProductName =
    typeof source.inventoryProductName === "string" &&
    source.inventoryProductName.trim()
      ? source.inventoryProductName.trim()
      : undefined;
  const inventoryQuantity = readPositiveQuantity(source.inventoryQuantity);
  const inventoryUnit = isModifierInventoryUnit(source.inventoryUnit)
    ? source.inventoryUnit
    : undefined;

  if (inventoryQuantity == null || !inventoryUnit) {
    return {
      inventoryProductId,
      ...(inventoryProductName ? { inventoryProductName } : {}),
    };
  }

  return {
    inventoryProductId,
    ...(inventoryProductName ? { inventoryProductName } : {}),
    inventoryQuantity,
    inventoryUnit,
  };
}

/** Convierte unidad de stock del inventario central a unidad de consumo de modificador. */
export function inventoryStockUnitToModifierUnit(
  unit: string | null | undefined,
): ModifierInventoryUnit | "" {
  const raw = String(unit ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "ud" || raw === "unit" || raw === "unidad" || raw === "u") {
    return "unit";
  }
  if (isModifierInventoryUnit(raw)) return raw;
  return "";
}

export function modifierInventoryFieldsToPayload(
  fields: ModifierInventoryFieldSource | null | undefined,
): ModifierInventoryPayloadFields {
  const normalized = normalizeModifierInventoryFields(fields);
  if (!normalized.inventoryProductId) return {};
  return {
    inventoryProductId: normalized.inventoryProductId,
    ...(normalized.inventoryProductName
      ? { inventoryProductName: normalized.inventoryProductName }
      : {}),
    ...(normalized.inventoryQuantity != null
      ? { inventoryQuantity: normalized.inventoryQuantity }
      : {}),
    ...(normalized.inventoryUnit ? { inventoryUnit: normalized.inventoryUnit } : {}),
  };
}

/**
 * Líneas de consumo futuro a partir de modifiers elegidos en TPV.
 * Solo incluye opciones con producto + cantidad + unidad completos.
 */
export function buildModifierInventoryConsumption(
  selectedModifiers?: readonly ModifierInventoryConsumptionSource[],
): ModifierInventoryConsumptionLine[] {
  if (!Array.isArray(selectedModifiers) || selectedModifiers.length === 0) {
    return [];
  }
  const out: ModifierInventoryConsumptionLine[] = [];
  for (const modifier of selectedModifiers) {
    const normalized = normalizeModifierInventoryFields(modifier);
    if (
      !normalized.inventoryProductId ||
      normalized.inventoryQuantity == null ||
      !normalized.inventoryUnit
    ) {
      continue;
    }
    out.push({
      groupId: String(modifier.groupId),
      groupName: String(modifier.groupName ?? ""),
      optionId: String(modifier.optionId),
      optionName: String(modifier.optionName ?? ""),
      inventoryProductId: normalized.inventoryProductId,
      ...(normalized.inventoryProductName
        ? { inventoryProductName: normalized.inventoryProductName }
        : {}),
      inventoryQuantity: normalized.inventoryQuantity,
      inventoryUnit: normalized.inventoryUnit,
    });
  }
  return out;
}
