/**
 * Une catálogo de venta con costes de escandallo.
 * Fase unificada: catálogo central Firestore primero; legacy localStorage como fallback / pendiente.
 */

import { countLegacyPlatosForRestaurant } from "@/lib/carta/legacy-platos-client";
import type { OperationalCatalogSource } from "@/lib/carta/use-central-products-for-carta";
import {
  fetchCentralProductsOnce,
  type ProductDocument,
} from "@/lib/firestore/products";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { estimateRecipeCostTotal } from "@/lib/recipes/product-recipe-helpers";
import { loadPlatos, type PlatoCarta } from "@/lib/platos-local";

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

export type EscandalloCatalogSource = OperationalCatalogSource;

export type EscandalloMergedRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

export type EscandalloMergedFetchResult = {
  rows: EscandalloMergedRow[];
  error: string | null;
  source: EscandalloCatalogSource;
  /** Platos en `hostly.platos.v1` cuando el catálogo central ya está activo. */
  legacyPendingCount: number;
  centralProductCount: number;
};

function readCosteOverridesBrowser(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function resolveCosteTotal(
  rowKey: string,
  overrides: Record<string, number>,
  recipeCost: number | null,
): number | null {
  const ov = overrides[rowKey];
  if (typeof ov === "number" && Number.isFinite(ov)) return ov;
  return recipeCost;
}

function centralDocsToEscandalloRows(
  docs: ProductDocument[],
  overrides: Record<string, number>,
): EscandalloMergedRow[] {
  const rows: EscandalloMergedRow[] = [];

  for (const doc of docs) {
    if (doc.active === false) continue;
    const key = doc.id;
    const precioVenta =
      typeof doc.price === "number" && Number.isFinite(doc.price) ? doc.price : null;
    const recipeCost = estimateRecipeCostTotal(doc.recipe);
    rows.push({
      id: key,
      nombre_plato: doc.name?.trim() || "Sin nombre",
      coste_total: resolveCosteTotal(key, overrides, recipeCost),
      precio_venta: precioVenta,
    });
  }

  rows.sort((a, b) =>
    (a.nombre_plato ?? "").localeCompare(b.nombre_plato ?? "", undefined, {
      sensitivity: "base",
    }),
  );
  return rows;
}

function legacyPlatosToEscandalloRows(
  platos: PlatoCarta[],
  overrides: Record<string, number>,
): EscandalloMergedRow[] {
  const activeLinked = platos.filter(
    (p) => p.activo && p.escandalloSupabaseId != null,
  ) as (PlatoCarta & { escandalloSupabaseId: number })[];

  const rows: EscandalloMergedRow[] = activeLinked.map((p) => {
    const sid = p.escandalloSupabaseId;
    const key = String(sid);
    return {
      id: sid,
      nombre_plato: p.nombre,
      coste_total: resolveCosteTotal(key, overrides, null),
      precio_venta: p.precioVenta,
    };
  });

  rows.sort((a, b) =>
    (a.nombre_plato ?? "").localeCompare(b.nombre_plato ?? "", undefined, {
      sensitivity: "base",
    }),
  );
  return rows;
}

export type FetchEscandalloMergedOptions = {
  restaurantId?: string | null;
  profileRestaurantId?: string | null;
  /** Si ya hay listener central (p. ej. useCentralProductsForCarta), evitar getDocs duplicado. */
  centralProducts?: ProductDocument[] | null;
  catalogSource?: EscandalloCatalogSource | null;
};

/** Si la carta está vacía, no hay importación remota: solo catálogo local. */
export async function bootstrapPlatosFromEscandallosIfEmpty(restauranteId: string): Promise<PlatoCarta[]> {
  return loadPlatos(restauranteId);
}

/**
 * Sin backend SQL: no se crean filas remotas; se devuelve el mismo listado.
 */
export async function ensureEscandalloRowsForPlatos(platos: PlatoCarta[]): Promise<{ next: PlatoCarta[]; error: string | null }> {
  return { next: [...platos], error: null };
}

/**
 * Listado unificado para Escandallos / KPIs.
 * Prioridad: catálogo central (`restaurants/{id}/products`); legacy solo si central vacío o sin auth.
 */
export async function fetchEscandalloMergedRowsForRestaurant(
  options: FetchEscandalloMergedOptions = {},
): Promise<EscandalloMergedFetchResult> {
  const restauranteId = resolveOperationalRestaurantId(
    options.profileRestaurantId ?? options.restaurantId ?? null,
  ).trim();

  if (!restauranteId) {
    return {
      rows: [],
      error: null,
      source: "legacy_local",
      legacyPendingCount: 0,
      centralProductCount: 0,
    };
  }

  const overrides = readCosteOverridesBrowser();
  let fetchError: string | null = null;

  if (options.catalogSource === "central") {
    const docs = options.centralProducts ?? [];
    return {
      rows: centralDocsToEscandalloRows(docs, overrides),
      error: fetchError,
      source: "central",
      legacyPendingCount: countLegacyPlatosForRestaurant(restauranteId),
      centralProductCount: docs.length,
    };
  }

  let centralDocs = options.centralProducts ?? null;
  let source: EscandalloCatalogSource = options.catalogSource ?? "legacy_local";

  if (centralDocs == null) {
    const fetched = await fetchCentralProductsOnce(restauranteId);
    centralDocs = fetched.docs;
    fetchError = fetched.error;
    if (centralDocs.length > 0) {
      source = "central";
    }
  } else if (centralDocs.length > 0) {
    source = "central";
  }

  if (source === "central" && centralDocs.length > 0) {
    const legacyPendingCount = countLegacyPlatosForRestaurant(restauranteId);
    return {
      rows: centralDocsToEscandalloRows(centralDocs, overrides),
      error: fetchError,
      source: "central",
      legacyPendingCount,
      centralProductCount: centralDocs.length,
    };
  }

  const platos = loadPlatos(restauranteId);
  return {
    rows: legacyPlatosToEscandalloRows(platos, overrides),
    error: fetchError,
    source: fetchError ? "legacy_fallback" : "legacy_local",
    legacyPendingCount: 0,
    centralProductCount: 0,
  };
}

/** Compatibilidad: resuelve tenant operativo (perfil → localStorage). */
export async function fetchEscandalloMergedRowsForBrowser(
  options?: FetchEscandalloMergedOptions,
): Promise<EscandalloMergedFetchResult> {
  return fetchEscandalloMergedRowsForRestaurant(options);
}

/** Sin tabla remota: no-op. */
export async function mirrorPlatoToEscandalloRow(_plato: PlatoCarta): Promise<{ error: string | null }> {
  return { error: null };
}

export type EscandalloMetaEntry = { tieneEscandallo: boolean; costeTotal: number | null };

export type EscandalloMetaMap = Map<number, EscandalloMetaEntry>;

/** Alineado con la pantalla Escandallos: margen «bueno» desde 65%. */
export const HOSTLY_MARGIN_OK_MIN_PCT = 65;

export function computeMarginPercent(costeTotal: number | null, precioVenta: number | null): number | null {
  if (precioVenta == null || precioVenta === 0) return null;
  if (costeTotal == null) return null;
  const m = ((precioVenta - costeTotal) / precioVenta) * 100;
  return Number.isFinite(m) ? m : null;
}

export type CartaRowEconomicsTier = "danger" | "warning" | "ok";

/**
 * Estado económico por fila de carta: sin escandallo → danger; con escandallo y margen &lt; umbral o desconocido → warning; margen ≥ umbral → ok.
 */
export function cartaRowEconomicsTier(input: {
  tieneEscandallo: boolean;
  escandalloSupabaseId: number | null;
  precioVenta: number;
  meta: EscandalloMetaMap;
}): CartaRowEconomicsTier {
  if (!input.tieneEscandallo) return "danger";
  const sid = input.escandalloSupabaseId;
  if (sid == null) return "warning";
  const coste = input.meta.get(sid)?.costeTotal ?? null;
  const m = computeMarginPercent(coste, input.precioVenta);
  if (m == null) return "warning";
  if (m >= HOSTLY_MARGIN_OK_MIN_PCT) return "ok";
  return "warning";
}

/** Metadatos desde override local (legacy ids numéricos). */
export async function fetchEscandalloMetaForIds(ids: number[]): Promise<EscandalloMetaMap> {
  const out: EscandalloMetaMap = new Map();
  if (ids.length === 0) return out;

  const overrides = readCosteOverridesBrowser();
  for (const id of ids) {
    const ov = overrides[String(id)];
    const costeNum = typeof ov === "number" && Number.isFinite(ov) ? ov : null;
    out.set(id, { tieneEscandallo: costeNum != null, costeTotal: costeNum });
  }

  return out;
}

export { ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY };
