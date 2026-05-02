/**
 * Hostly — Base funcional (MVP) de Familias + Modificadores.
 *
 * Objetivo:
 * - Configurar reglas 1 vez por familia (p. ej. "Whisky" => grupo "Refrescos")
 * - Permitir overrides por producto sin romper el flujo de catálogo/importación
 * - Mantenerlo simple pero escalable a TPV (selección de modificadores en venta)
 *
 * Persistencia:
 * - LocalStorage multi-tenant (restauranteId) como el resto del MVP local.
 * - Firestore: ver estructura recomendada en la respuesta del agente.
 */

import type { ProductoVenta } from "@/lib/platos-local";

export const HOSTLY_MODIFIERS_STORAGE_KEY = "hostly.modifiers.v1";
export const HOSTLY_MODIFIERS_CHANGED_EVENT = "hostly-modifiers-changed";

export type ProductFamily = {
  id: string;
  restauranteId: string;
  nombre: string;
  /** Grupos de modificadores que se aplican por defecto a toda la familia. */
  defaultModifierGroupIds: string[];
  /** Si false, por defecto los productos de esta familia no admiten modificadores salvo override. */
  modifiersEnabledByDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ModifierGroup = {
  id: string;
  restauranteId: string;
  nombre: string;
  /** Orden sugerido en UI (TPV futuro / editor). */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ModifierOption = {
  id: string;
  restauranteId: string;
  groupId: string;
  nombre: string;
  /** Delta opcional al precio base del producto (p. ej. +0.50€ por tónica premium). */
  priceDelta: number;
  activo: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Política de modificadores a nivel producto:
 * - enabled: fuerza activar/desactivar modificadores para el producto
 * - inherit: si true, hereda grupos desde la familia (si hay familia)
 * - groupIds: grupos extra explícitos del producto (además de herencia)
 */
export type ProductModifierPolicy = {
  enabled?: boolean;
  inherit?: boolean;
  groupIds?: string[];
};

export type ModifierModel = {
  families: Record<string, ProductFamily[]>;
  groups: Record<string, ModifierGroup[]>;
  options: Record<string, ModifierOption[]>;
};

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readRoot(): ModifierModel {
  if (typeof window === "undefined") return { families: {}, groups: {}, options: {} };
  try {
    const raw = localStorage.getItem(HOSTLY_MODIFIERS_STORAGE_KEY);
    if (!raw) return { families: {}, groups: {}, options: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { families: {}, groups: {}, options: {} };
    const m = parsed as Partial<ModifierModel>;
    return {
      families: m.families && typeof m.families === "object" ? (m.families as ModifierModel["families"]) : {},
      groups: m.groups && typeof m.groups === "object" ? (m.groups as ModifierModel["groups"]) : {},
      options: m.options && typeof m.options === "object" ? (m.options as ModifierModel["options"]) : {},
    };
  } catch {
    return { families: {}, groups: {}, options: {} };
  }
}

function writeRoot(root: ModifierModel): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOSTLY_MODIFIERS_STORAGE_KEY, JSON.stringify(root));
    window.dispatchEvent(new Event(HOSTLY_MODIFIERS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function loadFamilies(restauranteId: string): ProductFamily[] {
  const root = readRoot();
  return Array.isArray(root.families[restauranteId]) ? root.families[restauranteId] : [];
}

export function loadModifierGroups(restauranteId: string): ModifierGroup[] {
  const root = readRoot();
  const list = Array.isArray(root.groups[restauranteId]) ? root.groups[restauranteId] : [];
  return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.nombre.localeCompare(b.nombre));
}

export function loadModifierOptions(restauranteId: string): ModifierOption[] {
  const root = readRoot();
  const list = Array.isArray(root.options[restauranteId]) ? root.options[restauranteId] : [];
  return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.nombre.localeCompare(b.nombre));
}

export function upsertFamily(restauranteId: string, patch: Partial<ProductFamily> & Pick<ProductFamily, "nombre"> & { id?: string }): ProductFamily {
  const root = readRoot();
  const list = Array.isArray(root.families[restauranteId]) ? root.families[restauranteId] : [];
  const now = nowIso();
  const id = patch.id ?? newId("fam");
  const existing = list.find((x) => x.id === id);
  const next: ProductFamily = {
    id,
    restauranteId,
    nombre: (patch.nombre ?? existing?.nombre ?? "").trim(),
    defaultModifierGroupIds: patch.defaultModifierGroupIds ?? existing?.defaultModifierGroupIds ?? [],
    modifiersEnabledByDefault: patch.modifiersEnabledByDefault ?? existing?.modifiersEnabledByDefault ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const out = existing ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
  root.families[restauranteId] = out;
  writeRoot(root);
  return next;
}

export function upsertModifierGroup(
  restauranteId: string,
  patch: Partial<ModifierGroup> & Pick<ModifierGroup, "nombre"> & { id?: string; sortOrder?: number },
): ModifierGroup {
  const root = readRoot();
  const list = Array.isArray(root.groups[restauranteId]) ? root.groups[restauranteId] : [];
  const now = nowIso();
  const id = patch.id ?? newId("grp");
  const existing = list.find((x) => x.id === id);
  const next: ModifierGroup = {
    id,
    restauranteId,
    nombre: (patch.nombre ?? existing?.nombre ?? "").trim(),
    sortOrder: patch.sortOrder ?? existing?.sortOrder ?? list.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const out = existing ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
  root.groups[restauranteId] = out;
  writeRoot(root);
  return next;
}

export function upsertModifierOption(
  restauranteId: string,
  patch: Partial<ModifierOption> &
    Pick<ModifierOption, "groupId" | "nombre"> & {
      id?: string;
      sortOrder?: number;
      priceDelta?: number;
      activo?: boolean;
    },
): ModifierOption {
  const root = readRoot();
  const list = Array.isArray(root.options[restauranteId]) ? root.options[restauranteId] : [];
  const now = nowIso();
  const id = patch.id ?? newId("opt");
  const existing = list.find((x) => x.id === id);
  const next: ModifierOption = {
    id,
    restauranteId,
    groupId: patch.groupId ?? existing?.groupId ?? "",
    nombre: (patch.nombre ?? existing?.nombre ?? "").trim(),
    priceDelta: typeof patch.priceDelta === "number" && Number.isFinite(patch.priceDelta) ? patch.priceDelta : existing?.priceDelta ?? 0,
    activo: patch.activo ?? existing?.activo ?? true,
    sortOrder: patch.sortOrder ?? existing?.sortOrder ?? list.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const out = existing ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
  root.options[restauranteId] = out;
  writeRoot(root);
  return next;
}

export type ResolvedModifierGroups = {
  enabled: boolean;
  groupIds: string[];
  sources: { fromFamily: string[]; fromProduct: string[] };
};

/**
 * Resuelve (MVP) los grupos efectivos de modificadores de un producto (modelo simple).
 * Reglas:
 * - Si product.admiteModificadores === false => disabled total
 * - Si admiteModificadores === true => enabled (aunque la familia default sea false)
 * - Si admiteModificadores es undefined:
 *   - usa `family.modifiersEnabledByDefault` si hay familia
 *   - si no hay familia => false
 * - Grupo efectivo = union( family.defaultModifierGroupIds , product.gruposModificadoresIds )
 */
export function resolveModifierGroupsForProduct(args: {
  product: ProductoVenta & { familyId?: string; admiteModificadores?: boolean; gruposModificadoresIds?: string[] };
  familiesById: Map<string, ProductFamily>;
}): ResolvedModifierGroups {
  const { product, familiesById } = args;
  const family = product.familyId ? familiesById.get(product.familyId) : undefined;

  const familyGroups = family ? family.defaultModifierGroupIds ?? [] : [];
  const productGroups = product.gruposModificadoresIds ?? [];

  const enabled =
    product.admiteModificadores != null
      ? Boolean(product.admiteModificadores)
      : family
        ? Boolean(family.modifiersEnabledByDefault)
        : false;

  const groupIds = enabled ? [...new Set([...familyGroups, ...productGroups])].filter(Boolean) : [];
  return { enabled, groupIds, sources: { fromFamily: familyGroups, fromProduct: productGroups } };
}

