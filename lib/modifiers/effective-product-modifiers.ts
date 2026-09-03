import type { TipoProductoVenta } from "@/lib/carta/product-sale-contract";
import {
  normalizeModifierGroupIds,
  filterKnownActiveModifierGroupIds,
} from "@/lib/modifiers/modifier-group-ids";
import {
  DEFAULT_DRINK_FORMAT_GROUP_ID,
  DEFAULT_DRINK_MIXER_GROUP_ID,
  type ModifierGroupDocument,
} from "@/lib/modifiers/modifier-types";

export type ModifierGroupIdSource = {
  modifierGroupIds?: readonly string[] | null;
};

export type CategoryModifierSource = ModifierGroupIdSource | null | undefined;

const DEFAULT_DRINK_ONLY_MODIFIER_GROUP_IDS = new Set([
  DEFAULT_DRINK_FORMAT_GROUP_ID,
  DEFAULT_DRINK_MIXER_GROUP_ID,
]);

function normalizeModifierProductKind(
  value: string | undefined,
): TipoProductoVenta | null | undefined {
  const normalized = value?.trim().toLocaleLowerCase("es-ES");
  if (!normalized) return null;
  if (normalized === "bebida" || normalized === "drink" || normalized === "beverage") {
    return "bebida";
  }
  if (normalized === "plato" || normalized === "food" || normalized === "dish") {
    return "plato";
  }
  return undefined;
}

/**
 * Compatibilidad de un grupo con el tipo de venta del producto.
 *
 * - Los grupos sin ámbito siguen siendo universales para no romper configuraciones existentes.
 * - Los mixers son siempre de bebida.
 * - Los dos grupos predeterminados históricos de bebida se reconocen por id aunque todavía no
 *   tengan `appliesToProductKind` persistido.
 * - Un ámbito explícito desconocido falla cerrado para no mostrar modificadores fuera de contexto.
 */
export function modifierGroupAppliesToProductKind(
  group: Pick<ModifierGroupDocument, "id" | "type" | "appliesToProductKind">,
  productKind: TipoProductoVenta,
): boolean {
  if (group.type === "mixer" || DEFAULT_DRINK_ONLY_MODIFIER_GROUP_IDS.has(group.id)) {
    return productKind === "bebida";
  }

  const scopedKind = normalizeModifierProductKind(group.appliesToProductKind);
  if (scopedKind === null) return true;
  if (scopedKind === undefined) return false;
  return scopedKind === productKind;
}

export function filterModifierGroupsForProductKind<
  T extends Pick<ModifierGroupDocument, "id" | "type" | "appliesToProductKind">,
>(groups: readonly T[], productKind: TipoProductoVenta): T[] {
  return groups.filter((group) => modifierGroupAppliesToProductKind(group, productKind));
}

/**
 * Modificadores efectivos: categoría (base) + producto (añade/sobrescribe por id único).
 * Sin categoría ni producto → [].
 */
export function resolveEffectiveModifierGroupIds(
  product: ModifierGroupIdSource | null | undefined,
  category: CategoryModifierSource,
): string[] {
  const categoryIds = normalizeModifierGroupIds(category?.modifierGroupIds);
  const productIds = normalizeModifierGroupIds(product?.modifierGroupIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...categoryIds, ...productIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function getModifierGroupLabels(
  ids: readonly string[],
  groups: readonly Pick<ModifierGroupDocument, "id" | "name" | "active">[],
): string[] {
  const byId = new Map(groups.map((g) => [g.id, g] as const));
  const labels: string[] = [];
  for (const id of normalizeModifierGroupIds(ids)) {
    const group = byId.get(id);
    if (!group || group.active === false) continue;
    const name = group.name.trim();
    if (name) labels.push(name);
  }
  return labels;
}

export function resolveEffectiveModifierGroupLabels(
  product: ModifierGroupIdSource | null | undefined,
  category: CategoryModifierSource,
  groups: readonly Pick<ModifierGroupDocument, "id" | "name" | "active">[],
): string[] {
  return getModifierGroupLabels(
    resolveEffectiveModifierGroupIds(product, category),
    groups,
  );
}

export function sanitizeModifierGroupIdsForSave(
  ids: readonly string[],
  groups: readonly Pick<ModifierGroupDocument, "id" | "active">[],
): string[] {
  const activeIds = new Set(
    groups.filter((g) => g.active !== false).map((g) => g.id),
  );
  return filterKnownActiveModifierGroupIds(ids, activeIds);
}

/**
 * Variante de guardado consciente del tipo de producto. Impide que un plato conserve por error
 * grupos de bebida (Mixer / Formato bebida) y respeta grupos universales o explícitamente acotados.
 */
export function sanitizeModifierGroupIdsForProductKind(
  ids: readonly string[],
  groups: readonly Pick<
    ModifierGroupDocument,
    "id" | "active" | "type" | "appliesToProductKind"
  >[],
  productKind: TipoProductoVenta,
): string[] {
  const compatibleGroups = groups.filter(
    (group) => group.active !== false && modifierGroupAppliesToProductKind(group, productKind),
  );
  return sanitizeModifierGroupIdsForSave(ids, compatibleGroups);
}
