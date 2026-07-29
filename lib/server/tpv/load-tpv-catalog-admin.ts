import type { Firestore } from "firebase-admin/firestore";
import type { ProductDocument } from "@/lib/firestore/products";
import type { ModifierSelectionIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import type { ModifierGroupDocument, ModifierOptionDocument } from "@/lib/modifiers/modifier-types";
import {
  isModifierGroupType,
  normalizeModifierName,
  slugifyModifierOptionId,
  sortModifierOptions,
} from "@/lib/modifiers/modifier-types";
import { normalizeModifierInventoryFields, modifierInventoryFieldsToPayload, type ModifierInventoryPayloadFields } from "@/lib/modifiers/modifier-inventory-consumption";
import {
  resolveEffectiveModifierGroupIds,
  type CategoryModifierSource,
} from "@/lib/modifiers/effective-product-modifiers";
import { readModifierGroupIdsFromRecord } from "@/lib/modifiers/modifier-group-ids";

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function mapAdminProductDoc(docId: string, data: Record<string, unknown>): ProductDocument | null {
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : typeof data.nombre === "string" && data.nombre.trim()
        ? data.nombre.trim()
        : "";
  if (!name) return null;
  const inventoryRaw =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  return {
    id: docId,
    name,
    categoryId:
      typeof data.categoryId === "string" && data.categoryId.trim()
        ? data.categoryId.trim()
        : null,
    categoryName:
      typeof data.categoryName === "string" && data.categoryName.trim()
        ? data.categoryName.trim()
        : typeof data.categoria === "string" && data.categoria.trim()
          ? data.categoria.trim()
          : null,
    price: readFiniteNumber(data.price) ?? readFiniteNumber(data.precio),
    active: data.active !== false,
    station:
      typeof data.station === "string" && data.station.trim()
        ? data.station.trim()
        : null,
    type: typeof data.type === "string" ? data.type : null,
    tipoVenta:
      typeof data.tipoVenta === "string" && data.tipoVenta.trim()
        ? data.tipoVenta.trim()
        : null,
    visibleOnMenu:
      typeof data.visibleOnMenu === "boolean" ? data.visibleOnMenu : undefined,
    modifierGroupIds: Array.isArray(data.modifierGroupIds)
      ? data.modifierGroupIds.filter((id): id is string => typeof id === "string")
      : null,
    course:
      typeof data.course === "number" && Number.isFinite(data.course)
        ? data.course
        : null,
    operationStationId:
      typeof data.operationStationId === "string"
        ? data.operationStationId
        : null,
    operationStationName:
      typeof data.operationStationName === "string"
        ? data.operationStationName
        : null,
    inventory: {
      enabled: inventoryRaw.enabled === true,
      unit: "ud",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
    },
    recipe: { enabled: false, ingredients: [] },
  };
}

export type ResolvedSaleModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
} & ModifierInventoryPayloadFields;

export async function loadSaleProductAdmin(
  db: Firestore,
  restaurantId: string,
  productId: string,
): Promise<ProductDocument | null> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) return null;
  const snap = await db
    .collection("restaurants")
    .doc(rid)
    .collection("products")
    .doc(pid)
    .get();
  if (!snap.exists) return null;
  return mapAdminProductDoc(snap.id, snap.data() as Record<string, unknown>);
}

function readFiniteNumberWithFallback(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function clampSelectionCount(value: number, min = 0, max = 99): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseModifierOption(raw: unknown, index: number): ModifierOptionDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  if (!name) return null;
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim()
      : slugifyModifierOptionId(name);
  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeModifierName(name);
  const priceDelta = readFiniteNumberWithFallback(data.priceDelta, 0);
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : index;
  const inventoryFields = normalizeModifierInventoryFields(data);
  return {
    id,
    name,
    normalizedName,
    priceDelta: Math.round(priceDelta * 100) / 100,
    active: data.active !== false,
    sortOrder,
    ...inventoryFields,
  };
}

/** Mirrors client `parseModifierGroupDocument` for Firestore Admin reads. */
export function parseModifierGroupDocAdmin(
  groupId: string,
  raw: unknown,
  restaurantId: string,
): ModifierGroupDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  const type = data.type;
  if (!name || !isModifierGroupType(type)) return null;

  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeModifierName(name);
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : 0;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : 0;
  const minSelected = clampSelectionCount(readFiniteNumberWithFallback(data.minSelected, 0));
  const maxSelected = clampSelectionCount(
    readFiniteNumberWithFallback(data.maxSelected, 1),
    0,
    99,
  );

  const optionsRaw = Array.isArray(data.options) ? data.options : [];
  const options = sortModifierOptions(
    optionsRaw
      .map((row, index) => parseModifierOption(row, index))
      .filter((row): row is ModifierOptionDocument => row != null),
  );

  return {
    id: groupId,
    restaurantId: rid,
    name,
    normalizedName,
    type,
    active: data.active !== false,
    required: data.required === true,
    minSelected,
    maxSelected: Math.max(minSelected, maxSelected),
    sortOrder,
    options,
    createdAt,
    updatedAt,
  };
}

async function loadProductCategoryModifierSource(
  db: Firestore,
  restaurantId: string,
  product: ProductDocument,
): Promise<CategoryModifierSource> {
  const categoryId = product.categoryId?.trim();
  const rid = restaurantId.trim();
  if (!categoryId || !rid) return null;

  const snap = await db
    .collection("restaurantes")
    .doc(rid)
    .collection("cartaCategorias")
    .doc(categoryId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (data.isActive === false) return null;
  return { modifierGroupIds: readModifierGroupIdsFromRecord(data) };
}

function isOperationalModifierGroup(group: ModifierGroupDocument | null): group is ModifierGroupDocument {
  if (!group || group.active === false) return false;
  return group.options.some((option) => option.active !== false);
}

export async function resolveModifierSelectionsAdmin(
  db: Firestore,
  restaurantId: string,
  product: ProductDocument,
  selections: readonly ModifierSelectionIntent[],
): Promise<ResolvedSaleModifier[] | { error: string }> {
  const category = await loadProductCategoryModifierSource(db, restaurantId, product);
  const effectiveGroupIds = resolveEffectiveModifierGroupIds(product, category);
  if (selections.length > 0 && effectiveGroupIds.length === 0) {
    return { error: "MODIFIER_NOT_ALLOWED_FOR_PRODUCT" };
  }

  const byGroup = new Map<string, ModifierSelectionIntent[]>();
  for (const sel of selections) {
    if (!effectiveGroupIds.includes(sel.groupId)) {
      return { error: "MODIFIER_GROUP_NOT_ALLOWED" };
    }
    const list = byGroup.get(sel.groupId) ?? [];
    if (list.some((x) => x.optionId === sel.optionId)) {
      return { error: "MODIFIER_OPTION_DUPLICATE" };
    }
    list.push(sel);
    byGroup.set(sel.groupId, list);
  }

  const resolved: ResolvedSaleModifier[] = [];
  const rid = restaurantId.trim();

  for (const groupId of effectiveGroupIds) {
    const picks = byGroup.get(groupId) ?? [];
    const groupSnap = await db
      .collection("restaurants")
      .doc(rid)
      .collection("modifierGroups")
      .doc(groupId)
      .get();
    const group = groupSnap.exists
      ? parseModifierGroupDocAdmin(groupId, groupSnap.data(), rid)
      : null;

    if (picks.length > 0) {
      if (!groupSnap.exists || !group) return { error: "MODIFIER_GROUP_NOT_FOUND" };
      if (group.active === false) return { error: "MODIFIER_GROUP_INACTIVE" };
      if (!group.options.some((option) => option.active !== false)) {
        return { error: "MODIFIER_OPTION_NOT_FOUND" };
      }
    }

    if (!isOperationalModifierGroup(group)) {
      continue;
    }

    if (group.required && picks.length === 0) return { error: "MODIFIER_GROUP_REQUIRED" };
    if (picks.length < group.minSelected) return { error: "MODIFIER_MIN_NOT_MET" };
    if (picks.length > group.maxSelected) return { error: "MODIFIER_MAX_EXCEEDED" };

    for (const sel of picks) {
      const option = group.options.find((o) => o.id === sel.optionId && o.active !== false);
      if (!option) return { error: "MODIFIER_OPTION_NOT_FOUND" };
      resolved.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: option.priceDelta,
        ...modifierInventoryFieldsToPayload(option),
      });
    }
  }

  return resolved;
}

export function assertProductSellable(product: ProductDocument): string | null {
  if (product.active === false) return "PRODUCT_INACTIVE";
  if (product.visibleOnMenu === false) return "PRODUCT_NOT_ON_MENU";
  const price = product.price;
  if (price == null || !Number.isFinite(price) || price < 0) {
    return "PRODUCT_PRICE_NOT_CANONICAL";
  }
  return null;
}
