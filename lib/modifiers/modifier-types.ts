import { normalizeProductName } from "@/lib/carta/duplicate-detection";

export const MODIFIER_GROUP_TYPES = [
  "format",
  "mixer",
  "addon",
  "custom",
] as const;

export type ModifierGroupType = (typeof MODIFIER_GROUP_TYPES)[number];

export const MODIFIER_GROUP_TYPE_LABELS: Record<ModifierGroupType, string> = {
  format: "Formato de venta",
  mixer: "Mixer / refresco",
  addon: "Extra / suplemento",
  custom: "Personalizado",
};

export type ModifierOptionDocument = {
  id: string;
  name: string;
  normalizedName: string;
  priceDelta: number;
  active: boolean;
  sortOrder: number;
  /** Producto de inventario a descontar cuando se elige esta opción (futuro). */
  inventoryProductId?: string;
  inventoryProductName?: string;
  inventoryQuantity?: number;
  inventoryUnit?: ModifierInventoryUnit;
};

export const MODIFIER_INVENTORY_UNITS = [
  "unit",
  "ml",
  "cl",
  "l",
  "g",
  "kg",
] as const;

export type ModifierInventoryUnit = (typeof MODIFIER_INVENTORY_UNITS)[number];

export const MODIFIER_INVENTORY_UNIT_LABELS: Record<ModifierInventoryUnit, string> = {
  unit: "Unidad",
  ml: "ml",
  cl: "cl",
  l: "l",
  g: "g",
  kg: "kg",
};

export function isModifierInventoryUnit(
  value: unknown,
): value is ModifierInventoryUnit {
  return (
    value === "unit" ||
    value === "ml" ||
    value === "cl" ||
    value === "l" ||
    value === "g" ||
    value === "kg"
  );
}

/** `restaurants/{restaurantId}/modifierGroups/{groupId}` */
export type ModifierGroupDocument = {
  id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  type: ModifierGroupType;
  active: boolean;
  required: boolean;
  minSelected: number;
  maxSelected: number;
  sortOrder: number;
  appliesToProductFamilyId?: string;
  appliesToCategoryId?: string;
  appliesToProductKind?: string;
  options: ModifierOptionDocument[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
};

export type ModifierOptionInput = {
  id?: string;
  name: string;
  priceDelta?: number;
  active?: boolean;
  sortOrder?: number;
  inventoryProductId?: string | null;
  inventoryProductName?: string | null;
  inventoryQuantity?: number | null;
  inventoryUnit?: ModifierInventoryUnit | string | null;
};

export type ModifierGroupInput = {
  name: string;
  type: ModifierGroupType;
  active?: boolean;
  required?: boolean;
  minSelected?: number;
  maxSelected?: number;
  sortOrder?: number;
  appliesToProductFamilyId?: string;
  appliesToCategoryId?: string;
  appliesToProductKind?: string;
  options?: ModifierOptionInput[];
};

export function isModifierGroupType(value: unknown): value is ModifierGroupType {
  return (
    value === "format" ||
    value === "mixer" ||
    value === "addon" ||
    value === "custom"
  );
}

export function normalizeModifierName(name: string): string {
  return normalizeProductName(name);
}

export function slugifyModifierOptionId(name: string): string {
  const base = normalizeModifierName(name)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .slice(0, 48);
  return base || "option";
}

export function sortModifierGroups(
  groups: ModifierGroupDocument[],
): ModifierGroupDocument[] {
  return groups.slice().sort((a, b) => {
    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "es");
  });
}

export function sortModifierOptions(
  options: ModifierOptionDocument[],
): ModifierOptionDocument[] {
  return options.slice().sort((a, b) => {
    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "es");
  });
}

export const DEFAULT_DRINK_FORMAT_GROUP_ID = "default-drink-format";
export const DEFAULT_DRINK_MIXER_GROUP_ID = "default-drink-mixer";

export const DEFAULT_DRINK_MODIFIER_GROUP_SPECS: readonly {
  id: string;
  name: string;
  type: ModifierGroupType;
  appliesToProductKind: "bebida";
  required: boolean;
  minSelected: number;
  maxSelected: number;
  sortOrder: number;
  options: readonly {
    id: string;
    name: string;
    priceDelta: number;
    sortOrder: number;
  }[];
}[] = [
  {
    id: DEFAULT_DRINK_FORMAT_GROUP_ID,
    name: "Formato bebida",
    type: "format",
    appliesToProductKind: "bebida",
    required: true,
    minSelected: 1,
    maxSelected: 1,
    sortOrder: 0,
    options: [
      { id: "chupito", name: "Chupito", priceDelta: 0, sortOrder: 0 },
      { id: "copa-sola", name: "Copa sola", priceDelta: 0, sortOrder: 1 },
      { id: "copa-mixer", name: "Copa + mixer", priceDelta: 0, sortOrder: 2 },
    ],
  },
  {
    id: DEFAULT_DRINK_MIXER_GROUP_ID,
    name: "Mixer",
    type: "mixer",
    appliesToProductKind: "bebida",
    required: false,
    minSelected: 0,
    maxSelected: 1,
    sortOrder: 10,
    options: [
      { id: "tonica", name: "Tónica", priceDelta: 0, sortOrder: 0 },
      { id: "sprite", name: "Sprite", priceDelta: 0, sortOrder: 1 },
      { id: "coca-cola", name: "Coca-Cola", priceDelta: 0, sortOrder: 2 },
      {
        id: "refresco-limon",
        name: "Refresco limón",
        priceDelta: 0,
        sortOrder: 3,
      },
      {
        id: "refresco-naranja",
        name: "Refresco naranja",
        priceDelta: 0,
        sortOrder: 4,
      },
      { id: "red-bull", name: "Red Bull", priceDelta: 0, sortOrder: 5 },
    ],
  },
] as const;
