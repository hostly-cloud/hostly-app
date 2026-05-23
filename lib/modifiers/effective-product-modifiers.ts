import {
  normalizeModifierGroupIds,
  filterKnownActiveModifierGroupIds,
} from "@/lib/modifiers/modifier-group-ids";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";

export type ModifierGroupIdSource = {
  modifierGroupIds?: readonly string[] | null;
};

export type CategoryModifierSource = ModifierGroupIdSource | null | undefined;

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
