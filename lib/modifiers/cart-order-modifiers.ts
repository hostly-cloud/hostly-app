import type { ModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import {
  modifierInventoryFieldsToPayload,
  normalizeModifierInventoryFields,
} from "@/lib/modifiers/modifier-inventory-consumption";
import {
  DEFAULT_DRINK_FORMAT_GROUP_ID,
  DEFAULT_DRINK_MIXER_GROUP_ID,
  sortModifierOptions,
  type ModifierGroupDocument,
  type ModifierOptionDocument,
} from "@/lib/modifiers/modifier-types";
import { resolveEffectiveModifierGroupIds } from "@/lib/modifiers/effective-product-modifiers";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { Product } from "@/types/product";

export type CartOrderLineSelectedModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  inventoryProductId?: string;
  inventoryProductName?: string;
  inventoryQuantity?: number;
  inventoryUnit?: ModifierInventoryUnit;
};

export type ModifierSelectionByGroup = Record<string, string[]>;

function readFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function sumSelectedModifiersTotal(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): number {
  if (!Array.isArray(selectedModifiers) || selectedModifiers.length === 0) return 0;
  return selectedModifiers.reduce(
    (acc, m) => acc + readFiniteNumber(m.priceDelta, 0),
    0,
  );
}

export function resolveLineModifierTotal(line: {
  modifierTotal?: number;
  selectedModifiers?: readonly CartOrderLineSelectedModifier[];
}): number {
  if (typeof line.modifierTotal === "number" && Number.isFinite(line.modifierTotal)) {
    return line.modifierTotal;
  }
  return sumSelectedModifiersTotal(line.selectedModifiers);
}

export function buildCartLineModifierLabels(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): string[] {
  if (!Array.isArray(selectedModifiers)) return [];
  return selectedModifiers
    .map((m) => String(m.optionName ?? "").trim())
    .filter((name) => name !== "");
}

export function buildCartLineDisplayName(
  productName: string,
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): string {
  const base = String(productName ?? "").trim() || "Producto";
  const labels = buildCartLineModifierLabels(selectedModifiers);
  if (labels.length === 0) return base;
  return `${base} · ${labels.join(" · ")}`;
}

export function buildCartLineModifierSubtitle(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): string | null {
  const labels = buildCartLineModifierLabels(selectedModifiers);
  if (labels.length === 0) return null;
  return labels.join(" · ");
}

/** Resumen legible de modificadores (KDS, impresión, tickets). */
export function buildModifierSummary(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): string {
  return buildCartLineModifierLabels(selectedModifiers).join(" · ");
}

export type OrderLineModifierPresentation = {
  baseProductName: string;
  displayName: string;
  modifiersLabel: string;
  /** Subtítulo KDS; vacío si ya está incluido en displayName. */
  modifiersSubtitle: string;
  note: string;
};

function modifiersContainedInDisplayName(
  displayName: string,
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): boolean {
  const labels = buildCartLineModifierLabels(selectedModifiers);
  if (labels.length === 0) return true;
  const summary = labels.join(" · ");
  if (summary && displayName.includes(summary)) return true;
  return labels.every((label) => displayName.includes(label));
}

export function resolveOrderLineModifierPresentation(params: {
  baseProductName: string;
  displayName?: string | null;
  selectedModifiers?: readonly CartOrderLineSelectedModifier[];
  lineNote?: string | null;
}): OrderLineModifierPresentation {
  const base = String(params.baseProductName ?? "").trim() || "Producto";
  const modifiersLabel = buildModifierSummary(params.selectedModifiers);
  const explicitDisplay = params.displayName?.trim();
  const displayName =
    explicitDisplay ||
    (modifiersLabel
      ? buildCartLineDisplayName(base, params.selectedModifiers)
      : base);
  const modifiersSubtitle = modifiersContainedInDisplayName(
    displayName,
    params.selectedModifiers,
  )
    ? ""
    : modifiersLabel;
  let note = params.lineNote?.trim() ?? "";
  if (note && modifiersLabel) {
    if (note === modifiersLabel) {
      note = "";
    } else if (note.endsWith(` · ${modifiersLabel}`)) {
      note = note.slice(0, -(modifiersLabel.length + 3)).trim();
    } else if (note.startsWith(`${modifiersLabel} · `)) {
      note = note.slice(modifiersLabel.length + 3).trim();
    }
  }
  return {
    baseProductName: base,
    displayName,
    modifiersLabel,
    modifiersSubtitle,
    note,
  };
}

export function cartLineModifiersMergeKey(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): string {
  if (!Array.isArray(selectedModifiers) || selectedModifiers.length === 0) return "";
  return selectedModifiers
    .map((m) => `${String(m.groupId)}:${String(m.optionId)}`)
    .join("|");
}

export function parseFirestoreSelectedModifiers(
  raw: unknown,
): CartOrderLineSelectedModifier[] {
  if (!Array.isArray(raw)) return [];
  const out: CartOrderLineSelectedModifier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const groupId = String(rec.groupId ?? "").trim();
    const groupName = String(rec.groupName ?? "").trim();
    const optionId = String(rec.optionId ?? "").trim();
    const optionName = String(rec.optionName ?? "").trim();
    if (!groupId || !optionId || !optionName) continue;
    out.push({
      groupId,
      groupName: groupName || groupId,
      optionId,
      optionName,
      priceDelta: readFiniteNumber(rec.priceDelta, 0),
      ...parseSelectedModifierInventoryFields(rec),
    });
  }
  return out;
}

function parseSelectedModifierInventoryFields(
  rec: Record<string, unknown>,
): Pick<
  CartOrderLineSelectedModifier,
  | "inventoryProductId"
  | "inventoryProductName"
  | "inventoryQuantity"
  | "inventoryUnit"
> {
  return modifierInventoryFieldsToPayload({
    inventoryProductId:
      typeof rec.inventoryProductId === "string" ? rec.inventoryProductId : null,
    inventoryProductName:
      typeof rec.inventoryProductName === "string"
        ? rec.inventoryProductName
        : null,
    inventoryQuantity:
      typeof rec.inventoryQuantity === "number" ? rec.inventoryQuantity : null,
    inventoryUnit:
      typeof rec.inventoryUnit === "string" ? rec.inventoryUnit : null,
  });
}

export function resolveCategoryForProduct(
  product: Product,
  categories: readonly CartaCategoria[],
): CartaCategoria | null {
  const categoryId = product.categoryId?.trim();
  if (!categoryId) return null;
  return categories.find((c) => c.id === categoryId) ?? null;
}

export function resolveActiveEffectiveModifierGroups(
  product: Product,
  category: CartaCategoria | null,
  allGroups: readonly ModifierGroupDocument[],
): ModifierGroupDocument[] {
  const ids = resolveEffectiveModifierGroupIds(product, category);
  const byId = new Map(allGroups.map((g) => [g.id, g] as const));
  const out: ModifierGroupDocument[] = [];
  for (const id of ids) {
    const group = byId.get(id);
    if (!group || group.active === false) continue;
    const options = sortModifierOptions(
      group.options.filter((o) => o.active !== false),
    );
    if (options.length === 0) continue;
    out.push({ ...group, options });
  }
  return out;
}

export function isMixerModifierGroup(group: ModifierGroupDocument): boolean {
  if (group.type === "mixer" || group.id === DEFAULT_DRINK_MIXER_GROUP_ID) {
    return true;
  }
  const blob = `${group.name} ${group.normalizedName}`.toLowerCase();
  return /\bmixer\b/.test(blob) || /\brefresco\b/.test(blob) || /\bmezcla\b/.test(blob);
}

export function isFormatModifierGroup(group: ModifierGroupDocument): boolean {
  if (group.type === "format" || group.id === DEFAULT_DRINK_FORMAT_GROUP_ID) {
    return true;
  }
  const blob = `${group.name} ${group.normalizedName}`.toLowerCase();
  return /\bformato\b/.test(blob);
}

export function formatOptionRequiresMixer(option: ModifierOptionDocument): boolean {
  const id = option.id.trim().toLowerCase();
  if (id === "copa-mixer" || id.includes("copa-mixer") || id.includes("copa_mixer")) {
    return true;
  }
  if (id.includes("copa") && (id.includes("refresco") || id.includes("mixer"))) {
    return true;
  }
  const name = option.name.trim().toLowerCase();
  if (/copa\s*\+\s*(mixer|refresco|mezcla)/.test(name)) return true;
  if (name.includes("copa") && name.includes("mixer")) return true;
  if (name.includes("copa") && name.includes("refresco")) return true;
  if (/\bcombinad[oa]\b/.test(name) && name.includes("copa")) return true;
  return false;
}

export function selectionRequiresMixerStep(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): boolean {
  const formatGroup =
    groups.find((g) => g.id === DEFAULT_DRINK_FORMAT_GROUP_ID) ??
    groups.find((g) => isFormatModifierGroup(g));
  if (!formatGroup) return false;
  const selectedId = (selection[formatGroup.id] ?? [])[0];
  if (!selectedId) return false;
  const option = formatGroup.options.find((o) => o.id === selectedId);
  if (!option) return false;
  return formatOptionRequiresMixer(option);
}

export function modifierSelectionFromLine(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): ModifierSelectionByGroup {
  const out: ModifierSelectionByGroup = {};
  if (!Array.isArray(selectedModifiers)) return out;
  for (const mod of selectedModifiers) {
    const groupId = String(mod.groupId ?? "").trim();
    const optionId = String(mod.optionId ?? "").trim();
    if (!groupId || !optionId) continue;
    const prev = out[groupId] ?? [];
    if (!prev.includes(optionId)) {
      out[groupId] = [...prev, optionId];
    }
  }
  return out;
}

export function lineSelectionRequiresMixerStep(
  groups: readonly ModifierGroupDocument[],
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): boolean {
  return selectionRequiresMixerStep(
    groups,
    modifierSelectionFromLine(selectedModifiers),
  );
}

export function filterVisibleModifierGroupsForSelection(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): ModifierGroupDocument[] {
  const needsMixer = selectionRequiresMixerStep(groups, selection);
  return groups.filter((group) => {
    if (isMixerModifierGroup(group)) return needsMixer;
    return true;
  });
}

export function partitionVisibleModifierGroupsForTpv(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): {
  formatGroups: ModifierGroupDocument[];
  mixerGroups: ModifierGroupDocument[];
  showMixerStep: boolean;
} {
  const visible = filterVisibleModifierGroupsForSelection(groups, selection);
  const formatGroups = visible.filter((g) => !isMixerModifierGroup(g));
  const mixerGroups = visible.filter((g) => isMixerModifierGroup(g));
  return {
    formatGroups,
    mixerGroups,
    showMixerStep: mixerGroups.length > 0,
  };
}

export function buildSelectedModifiersFromDraft(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): CartOrderLineSelectedModifier[] {
  const out: CartOrderLineSelectedModifier[] = [];
  for (const group of groups) {
    const selectedIds = selection[group.id] ?? [];
    for (const optionId of selectedIds) {
      const option = group.options.find((o) => o.id === optionId);
      if (!option) continue;
      out.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: readFiniteNumber(option.priceDelta, 0),
        ...modifierInventoryFieldsToPayload(option),
      });
    }
  }
  return out;
}

export function isModifierSelectionValid(
  visibleGroups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): boolean {
  for (const group of visibleGroups) {
    const count = (selection[group.id] ?? []).length;
    const min = group.required
      ? Math.max(1, group.minSelected)
      : Math.max(0, group.minSelected);
    const max =
      group.maxSelected > 0 ? group.maxSelected : Math.max(min, 99);
    if (count < min) return false;
    if (count > max) return false;
  }
  return true;
}

/** Hay al menos un refresco/mezcla elegido en el borrador. */
export function selectionHasChosenMixer(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): boolean {
  for (const group of groups) {
    if (!isMixerModifierGroup(group)) continue;
    if ((selection[group.id] ?? []).length > 0) return true;
  }
  return false;
}

/**
 * Validación del botón «Añadir» en el modal TPV de bebidas:
 * reglas de grupo visibles + refresco obligatorio si el formato lo exige.
 */
export function isTpvModifierModalConfirmValid(
  groups: readonly ModifierGroupDocument[],
  selection: ModifierSelectionByGroup,
): boolean {
  const visible = filterVisibleModifierGroupsForSelection(groups, selection);
  if (!isModifierSelectionValid(visible, selection)) return false;
  if (
    selectionRequiresMixerStep(groups, selection) &&
    !selectionHasChosenMixer(groups, selection)
  ) {
    return false;
  }
  return true;
}

export function selectedModifiersToFirestorePayload(
  selectedModifiers?: readonly CartOrderLineSelectedModifier[],
): CartOrderLineSelectedModifier[] {
  if (!Array.isArray(selectedModifiers) || selectedModifiers.length === 0) {
    return [];
  }
  return selectedModifiers.map((m) => ({
    groupId: String(m.groupId),
    groupName: String(m.groupName),
    optionId: String(m.optionId),
    optionName: String(m.optionName),
    priceDelta: readFiniteNumber(m.priceDelta, 0),
    ...modifierInventoryFieldsToPayload(m),
  }));
}
