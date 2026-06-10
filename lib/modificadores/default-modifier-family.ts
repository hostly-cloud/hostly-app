/**
 * Autoasignación de familia de modificadores (familyId en PlatoCarta) desde categoría de carta.
 * Busca familias cuyo nombre normalizado sea "bebidas"/"bebida" o "platos"/"plato".
 */

import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { inferFamilyFromCategory } from "@/lib/catalog/familyAutoAssign";
import type { PlatoCarta } from "@/lib/platos-local";

export type ModifierFamilyRow = { id: string; nombre?: string };

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type ModifierFamilyBlock = "bebidas" | "platos";

const BASE_MODIFIER_FAMILIES: { block: ModifierFamilyBlock; nombre: string }[] = [
  { block: "bebidas", nombre: "Bebidas" },
  { block: "platos", nombre: "Platos" },
];

async function loadModifierFamiliesFromApi(restauranteId: string): Promise<{ ok: boolean; items: ModifierFamilyRow[] }> {
  const rid = typeof restauranteId === "string" ? restauranteId.trim() : "";
  if (!rid) return { ok: false, items: [] };
  const res = await fetch(`/api/modifiers/families?restauranteId=${encodeURIComponent(rid)}`);
  const j = (await res.json().catch(() => ({}))) as { items?: unknown };
  if (!res.ok) return { ok: false, items: [] };
  const items = Array.isArray(j.items) ? (j.items as ModifierFamilyRow[]) : [];
  return { ok: true, items };
}

/**
 * Crea en servidor las familias canónicas "Bebidas" y "Platos" si no hay ya una familia
 * cuyo nombre normalizado sea bebidas|bebida o platos|plato (misma regla que `findModifierFamilyIdForBlock`).
 * Tras un 409 por nombre duplicado, vuelve a leer la colección para no devolver lista obsoleta.
 */
export async function ensureBaseModifierFamilies<T extends ModifierFamilyRow = ModifierFamilyRow>(
  restauranteId: string,
  currentList?: T[],
): Promise<T[]> {
  let list: T[] = currentList ? [...currentList] : [];
  if (!currentList) {
    const loaded = await loadModifierFamiliesFromApi(restauranteId);
    if (!loaded.ok) return [];
    list = loaded.items as T[];
  }

  let needRefresh = false;
  for (const spec of BASE_MODIFIER_FAMILIES) {
    if (findModifierFamilyIdForBlock(list, spec.block)) continue;
    const res = await fetch("/api/modifiers/families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restauranteId,
        nombre: spec.nombre,
        activo: true,
        modifiersEnabledByDefault: true,
        defaultModifierGroupIds: [],
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { item?: T & { id: string }; error?: string };
    if (res.ok && j.item?.id) {
      list.push(j.item);
    } else if (res.status === 409) {
      needRefresh = true;
    }
  }

  if (needRefresh) {
    const again = await loadModifierFamiliesFromApi(restauranteId);
    if (again.ok) return again.items as T[];
  }
  return list;
}

export async function fetchModifierFamiliesForRestaurante(
  restauranteId: string,
  options?: { ensureBase?: boolean },
): Promise<ModifierFamilyRow[]> {
  const loaded = await loadModifierFamiliesFromApi(restauranteId);
  if (!loaded.ok) return [];
  if (options?.ensureBase === false) return loaded.items;
  return ensureBaseModifierFamilies(restauranteId, loaded.items);
}

/** Coincidencia laxa por nombre de categoría de carta (import / texto libre). */
export function findCartaCategoriaByNameLoose(categorias: CartaCategoria[], categoriaText: string): CartaCategoria | undefined {
  const n = norm(categoriaText);
  if (!n) return undefined;
  return categorias.find((c) => norm(c.name) === n);
}

export function findModifierFamilyIdForBlock(families: ModifierFamilyRow[], block: ModifierFamilyBlock): string | undefined {
  for (const f of families) {
    const n = norm(f.nombre ?? "");
    if (block === "bebidas" && (n === "bebidas" || n === "bebida")) return f.id;
    if (block === "platos" && (n === "platos" || n === "plato")) return f.id;
  }
  return undefined;
}

export function hasValidModifierFamilyId(platoFamilyId: string | undefined, families: ModifierFamilyRow[]): boolean {
  const id = platoFamilyId?.trim();
  if (!id) return false;
  return families.some((f) => f.id === id);
}

export function applyDefaultModifierFamilyIfEligible(
  plato: PlatoCarta,
  opts: {
    selectedCartaCategoria?: CartaCategoria | undefined;
    cartaMenuFamiliaName?: string | undefined;
    modifierFamilies: ModifierFamilyRow[];
  },
): PlatoCarta {
  if (hasValidModifierFamilyId(plato.familyId, opts.modifierFamilies)) return plato;

  const catLabel = (opts.selectedCartaCategoria?.name ?? plato.categoria ?? "").trim();
  const inferred = inferFamilyFromCategory(catLabel);
  if (!inferred) return plato;

  const block: ModifierFamilyBlock = inferred === "Bebidas" ? "bebidas" : "platos";
  const fid = findModifierFamilyIdForBlock(opts.modifierFamilies, block);
  if (!fid) return plato;
  return { ...plato, familyId: fid, updatedAt: new Date().toISOString() };
}
