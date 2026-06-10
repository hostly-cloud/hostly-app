"use client";

import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import {
  normalizeCategoryOperationalBehavior,
  type CategoryOperationalBehavior,
} from "./category-operational-behavior";
import type { CartaCategoria, CartaCategoriaTipo, CartaFamilia } from "./types";
import { isCartaCategoriaTipo } from "./types";
import {
  loadCartaFamiliasLocal,
  saveCartaFamiliasLocal,
} from "./familias-local-store";
import {
  CARTA_CATEGORIAS_CHANGED_EVENT,
  loadCartaCategoriasLocal,
  saveCartaCategoriasLocal,
} from "./local-store";
import { slugifyCartaCategoria } from "./slug";
import { normalizeModifierGroupIds } from "@/lib/modifiers/modifier-group-ids";

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newLocalFamId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emitCartaDataChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
}

function trimRestauranteId(restauranteId: string): string {
  return typeof restauranteId === "string" ? restauranteId.trim() : "";
}

export async function fetchCartaFamilias(restauranteId: string): Promise<CartaFamilia[]> {
  const rid = trimRestauranteId(restauranteId);
  if (!rid) return [];
  const res = await fetch(`/api/carta-familias?restauranteId=${encodeURIComponent(rid)}`);
  const data = await parseJson<{ ok?: boolean; items?: CartaFamilia[]; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    return loadCartaFamiliasLocal(rid);
  }
  if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
    return loadCartaFamiliasLocal(rid);
  }
  return data.items;
}

export async function createCartaFamiliaApi(
  restauranteId: string,
  input: { name: string; isActive?: boolean; sortOrder?: number },
): Promise<{ ok: true; item: CartaFamilia } | { ok: false; error: string }> {
  const res = await fetch("/api/carta-familias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restauranteId,
      name: input.name,
      isActive: input.isActive !== false,
      sortOrder: input.sortOrder,
    }),
  });
  const data = await parseJson<{ ok?: boolean; item?: CartaFamilia; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaFamiliasLocal(restauranteId);
    const now = new Date().toISOString();
    const id = newLocalFamId();
    const sortOrder =
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? input.sortOrder
        : list.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1;
    const item: CartaFamilia = {
      id,
      restauranteId,
      name: input.name.trim(),
      sortOrder,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    saveCartaFamiliasLocal(restauranteId, [...list, item].sort((a, b) => a.sortOrder - b.sortOrder));
    emitCartaDataChanged();
    return { ok: true, item };
  }
  if (!res.ok || !data?.ok || !data.item) {
    return { ok: false, error: data?.error ?? "CREATE_FAILED" };
  }
  emitCartaDataChanged();
  return { ok: true, item: data.item };
}

export async function patchCartaFamiliaApi(
  restauranteId: string,
  id: string,
  patch: Partial<{ name: string; sortOrder: number; isActive: boolean }>,
): Promise<{ ok: true; item: CartaFamilia } | { ok: false; error: string }> {
  const res = await fetch(`/api/carta-familias/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restauranteId, patch }),
  });
  const data = await parseJson<{ ok?: boolean; item?: CartaFamilia; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaFamiliasLocal(restauranteId);
    const idx = list.findIndex((f) => f.id === id);
    if (idx < 0) return { ok: false, error: "NOT_FOUND" };
    const now = new Date().toISOString();
    const cur = list[idx];
    const nextName = patch.name != null ? patch.name.trim() : cur.name;
    const item: CartaFamilia = {
      ...cur,
      name: nextName || cur.name,
      sortOrder: patch.sortOrder != null && Number.isFinite(patch.sortOrder) ? patch.sortOrder : cur.sortOrder,
      isActive: patch.isActive != null ? Boolean(patch.isActive) : cur.isActive,
      updatedAt: now,
    };
    const next = [...list];
    next[idx] = item;
    saveCartaFamiliasLocal(restauranteId, next.sort((a, b) => a.sortOrder - b.sortOrder));
    emitCartaDataChanged();
    return { ok: true, item };
  }
  if (!res.ok || !data?.ok || !data.item) {
    return { ok: false, error: data?.error ?? "PATCH_FAILED" };
  }
  emitCartaDataChanged();
  return { ok: true, item: data.item };
}

export async function deleteCartaFamiliaApi(
  restauranteId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/carta-familias/${encodeURIComponent(id)}?restauranteId=${encodeURIComponent(restauranteId)}`,
    { method: "DELETE" },
  );
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const cats = loadCartaCategoriasLocal(restauranteId);
    if (cats.some((c) => c.cartaFamiliaId === id)) {
      return { ok: false, error: "FAMILY_IN_USE" };
    }
    const list = loadCartaFamiliasLocal(restauranteId);
    saveCartaFamiliasLocal(
      restauranteId,
      list.filter((f) => f.id !== id),
    );
    emitCartaDataChanged();
    return { ok: true };
  }
  if (res.status === 409 || data?.error === "FAMILY_IN_USE") {
    return { ok: false, error: "FAMILY_IN_USE" };
  }
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "DELETE_FAILED" };
  }
  emitCartaDataChanged();
  return { ok: true };
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchCartaCategorias(restauranteId: string): Promise<CartaCategoria[]> {
  const rid = trimRestauranteId(restauranteId);
  if (!rid) return [];
  const res = await fetch(`/api/carta-categorias?restauranteId=${encodeURIComponent(rid)}`);
  const data = await parseJson<{ ok?: boolean; items?: CartaCategoria[]; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    return loadCartaCategoriasLocal(rid);
  }
  if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
    return loadCartaCategoriasLocal(rid);
  }
  return data.items;
}

export async function createCartaCategoriaApi(
  restauranteId: string,
  input: {
    name: string;
    type?: CartaCategoriaTipo;
    cartaFamiliaId?: string | null;
    productFamilyId?: string | null;
    productFamilyName?: string | null;
    productFamilyType?: ProductFamilyType | null;
    modifierGroupIds?: string[] | null;
    categoryOperationalBehavior?: CategoryOperationalBehavior;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<{ ok: true; item: CartaCategoria } | { ok: false; error: string }> {
  const fam =
    typeof input.cartaFamiliaId === "string" && input.cartaFamiliaId.trim() ? input.cartaFamiliaId.trim() : undefined;
  const pfId =
    typeof input.productFamilyId === "string" ? input.productFamilyId.trim() : "";
  const modifierGroupIds = normalizeModifierGroupIds(input.modifierGroupIds);
  const categoryOperationalBehavior = normalizeCategoryOperationalBehavior(
    input.categoryOperationalBehavior,
  );
  const res = await fetch("/api/carta-categorias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restauranteId,
      name: input.name,
      type: input.type ?? "general",
      cartaFamiliaId: fam ?? null,
      productFamilyId: pfId || null,
      productFamilyName: input.productFamilyName?.trim() || null,
      productFamilyType: input.productFamilyType ?? null,
      modifierGroupIds: normalizeModifierGroupIds(input.modifierGroupIds),
      categoryOperationalBehavior,
      isActive: input.isActive !== false,
      sortOrder: input.sortOrder,
    }),
  });
  const data = await parseJson<{ ok?: boolean; item?: CartaCategoria; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaCategoriasLocal(restauranteId);
    const now = new Date().toISOString();
    const id = newLocalId();
    const type: CartaCategoriaTipo = input.type && isCartaCategoriaTipo(input.type) ? input.type : "general";
    const sortOrder =
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? input.sortOrder
        : list.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
    const item: CartaCategoria = {
      id,
      restauranteId,
      name: input.name.trim(),
      slug: `${slugifyCartaCategoria(input.name)}-${id.slice(0, 8)}`,
      type,
      ...(fam ? { cartaFamiliaId: fam } : {}),
      ...(pfId && input.productFamilyName && input.productFamilyType
        ? {
            productFamilyId: pfId,
            productFamilyName: input.productFamilyName.trim(),
            productFamilyType: input.productFamilyType,
          }
        : {}),
      ...(modifierGroupIds.length > 0 ? { modifierGroupIds } : {}),
      categoryOperationalBehavior,
      sortOrder,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    saveCartaCategoriasLocal(restauranteId, [...list, item].sort((a, b) => a.sortOrder - b.sortOrder));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
    return { ok: true, item };
  }
  if (!res.ok || !data?.ok || !data.item) {
    return { ok: false, error: data?.error ?? "CREATE_FAILED" };
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
  return { ok: true, item: data.item };
}

export async function patchCartaCategoriaApi(
  restauranteId: string,
  id: string,
  patch: Partial<{
    name: string;
    type: CartaCategoriaTipo;
    cartaFamiliaId: string | null;
    productFamilyId: string | null;
    productFamilyName: string | null;
    productFamilyType: ProductFamilyType | null;
    modifierGroupIds?: string[] | null;
    categoryOperationalBehavior?: CategoryOperationalBehavior;
    sortOrder: number;
    isActive: boolean;
  }>,
): Promise<{ ok: true; item: CartaCategoria } | { ok: false; error: string }> {
  const res = await fetch(`/api/carta-categorias/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restauranteId, patch }),
  });
  const data = await parseJson<{ ok?: boolean; item?: CartaCategoria; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaCategoriasLocal(restauranteId);
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return { ok: false, error: "NOT_FOUND" };
    const now = new Date().toISOString();
    const cur = list[idx];
    const nextName = patch.name != null ? patch.name.trim() : cur.name;
    let nextFamiliaId = cur.cartaFamiliaId;
    if ("cartaFamiliaId" in patch) {
      if (patch.cartaFamiliaId == null || patch.cartaFamiliaId === "") {
        nextFamiliaId = undefined;
      } else if (typeof patch.cartaFamiliaId === "string") {
        const f = patch.cartaFamiliaId.trim();
        nextFamiliaId = f || undefined;
      }
    }
    const item: CartaCategoria = {
      ...cur,
      name: nextName || cur.name,
      slug: patch.name != null ? `${slugifyCartaCategoria(nextName)}-${id.slice(0, 8)}` : cur.slug,
      type: patch.type != null && isCartaCategoriaTipo(patch.type) ? patch.type : cur.type,
      sortOrder: patch.sortOrder != null && Number.isFinite(patch.sortOrder) ? patch.sortOrder : cur.sortOrder,
      isActive: patch.isActive != null ? Boolean(patch.isActive) : cur.isActive,
      updatedAt: now,
    };
    if (nextFamiliaId) item.cartaFamiliaId = nextFamiliaId;
    else delete item.cartaFamiliaId;
    if ("productFamilyId" in patch) {
      if (patch.productFamilyId == null || patch.productFamilyId === "") {
        delete item.productFamilyId;
        delete item.productFamilyName;
        delete item.productFamilyType;
      } else {
        item.productFamilyId = patch.productFamilyId.trim();
        if (patch.productFamilyName?.trim()) {
          item.productFamilyName = patch.productFamilyName.trim();
        }
        if (patch.productFamilyType) {
          item.productFamilyType = patch.productFamilyType;
        }
      }
    }
    if ("modifierGroupIds" in patch) {
      const ids = normalizeModifierGroupIds(patch.modifierGroupIds);
      if (ids.length > 0) item.modifierGroupIds = ids;
      else delete item.modifierGroupIds;
    }
    if ("categoryOperationalBehavior" in patch) {
      item.categoryOperationalBehavior = normalizeCategoryOperationalBehavior(
        patch.categoryOperationalBehavior,
      );
    }
    const next = [...list];
    next[idx] = item;
    saveCartaCategoriasLocal(restauranteId, next.sort((a, b) => a.sortOrder - b.sortOrder));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
    return { ok: true, item };
  }
  if (!res.ok || !data?.ok || !data.item) {
    return { ok: false, error: data?.error ?? "PATCH_FAILED" };
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
  return { ok: true, item: data.item };
}

export async function deleteCartaCategoriaApi(
  restauranteId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/carta-categorias/${encodeURIComponent(id)}?restauranteId=${encodeURIComponent(restauranteId)}`,
    { method: "DELETE" },
  );
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaCategoriasLocal(restauranteId);
    saveCartaCategoriasLocal(
      restauranteId,
      list.filter((c) => c.id !== id),
    );
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
    return { ok: true };
  }
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "DELETE_FAILED" };
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
  return { ok: true };
}

export async function reorderCartaCategoriasApi(
  restauranteId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/carta-categorias/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restauranteId, orderedIds }),
  });
  const data = await parseJson<{ ok?: boolean; error?: string }>(res);
  if (res.status === 501 || data?.error === "FIRESTORE_NOT_CONFIGURED") {
    const list = loadCartaCategoriasLocal(restauranteId);
    const byId = new Map(list.map((c) => [c.id, c] as const));
    const reordered: CartaCategoria[] = [];
    orderedIds.forEach((id, idx) => {
      const c = byId.get(id);
      if (c) reordered.push({ ...c, sortOrder: idx, updatedAt: new Date().toISOString() });
    });
    for (const c of list) {
      if (!orderedIds.includes(c.id)) reordered.push(c);
    }
    saveCartaCategoriasLocal(restauranteId, reordered.sort((a, b) => a.sortOrder - b.sortOrder));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
    return { ok: true };
  }
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "REORDER_FAILED" };
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
  return { ok: true };
}
