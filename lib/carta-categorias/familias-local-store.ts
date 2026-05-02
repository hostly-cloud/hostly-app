/**
 * Familias de carta (menú) en localStorage cuando Firestore no está disponible.
 */

import type { CartaFamilia } from "./types";

export const CARTA_FAMILIAS_STORAGE_KEY = "hostly.cartaFamilias.v1";

type Root = Record<string, CartaFamilia[]>;

function readRoot(): Root {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CARTA_FAMILIAS_STORAGE_KEY);
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
    window.localStorage.setItem(CARTA_FAMILIAS_STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* noop */
  }
}

export function loadCartaFamiliasLocal(restauranteId: string): CartaFamilia[] {
  const list = readRoot()[restauranteId];
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function saveCartaFamiliasLocal(restauranteId: string, familias: CartaFamilia[]): void {
  const root = readRoot();
  root[restauranteId] = familias;
  writeRoot(root);
}
