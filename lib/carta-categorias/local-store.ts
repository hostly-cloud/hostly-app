/**
 * Fallback cuando Firestore no está configurado: mismas entidades en localStorage por restaurante.
 */

import type { CartaCategoria } from "./types";

export const CARTA_CATEGORIAS_STORAGE_KEY = "hostly.cartaCategorias.v1";
export const CARTA_CATEGORIAS_CHANGED_EVENT = "hostly-carta-categorias-changed";

type Root = Record<string, CartaCategoria[]>;

function readRoot(): Root {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CARTA_CATEGORIAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Root;
  } catch {
    return {};
  }
}

function writeRoot(root: Root): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CARTA_CATEGORIAS_STORAGE_KEY, JSON.stringify(root));
    window.dispatchEvent(new Event(CARTA_CATEGORIAS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function loadCartaCategoriasLocal(restauranteId: string): CartaCategoria[] {
  const list = readRoot()[restauranteId];
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function saveCartaCategoriasLocal(restauranteId: string, categorias: CartaCategoria[]): void {
  const root = readRoot();
  root[restauranteId] = categorias;
  writeRoot(root);
}
