/**
 * Compatibilidad de escandallo sobre el catálogo central.
 *
 * Regla vigente: Firestore (`restaurants/{restaurantId}/products`) es la única
 * fuente operativa. El antiguo catálogo `hostly.platos.v1` puede contarse para
 * mostrar una migración/archivo explícitos, pero nunca se usa como fallback de
 * lectura ni como fuente de costes.
 */

import { countLegacyPlatosForRestaurant } from "@/lib/carta/legacy-platos-client";
import type { OperationalCatalogSource } from "@/lib/carta/use-central-products-for-carta";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import {
  fetchCentralProductsOnce,
  type ProductDocument,
} from "@/lib/firestore/products";
import { estimateRecipeCostTotal } from "@/lib/recipes/product-recipe-helpers";

/** Key histórica conservada únicamente para herramientas explícitas de recuperación/migración. */
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
  /** Registros legacy detectados únicamente para migración/archivo explícitos. */
  legacyPendingCount: number;
  centralProductCount: number;
};

function centralDocsToEscandalloRows(docs: ProductDocument[]): EscandalloMergedRow[] {
  const rows: EscandalloMergedRow[] = [];

  for (const doc of docs) {
    if (doc.active === false) continue;
    rows.push({
      id: doc.id,
      nombre_plato: doc.name?.trim() || "Sin nombre",
      coste_total: estimateRecipeCostTotal(doc.recipe),
      precio_venta:
        typeof doc.price === "number" && Number.isFinite(doc.price) ? doc.price : null,
    });
  }

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
  /** Si ya hay listener central, evita un getDocs duplicado. */
  centralProducts?: ProductDocument[] | null;
  catalogSource?: EscandalloCatalogSource | null;
};

/**
 * Compatibilidad temporal con consumidores antiguos.
 * Ya no bootstrappea desde localStorage: el catálogo central vacío es válido.
 */
export async function bootstrapPlatosFromEscandallosIfEmpty(
  _restauranteId: string,
): Promise<PlatoCarta[]> {
  return [];
}

/**
 * Compatibilidad temporal: no existe una tabla SQL de escandallos que sincronizar.
 */
export async function ensureEscandalloRowsForPlatos(
  platos: PlatoCarta[],
): Promise<{ next: PlatoCarta[]; error: string | null }> {
  return { next: platos, error: null };
}

/**
 * Listado de compatibilidad para Escandallos/KPIs.
 * Firestore central es autoritativo incluso cuando está vacío o falla la lectura.
 * Nunca se reactiva `hostly.platos.v1` como fallback operativo.
 */
export async function fetchEscandalloMergedRowsForRestaurant(
  options: FetchEscandalloMergedOptions = {},
): Promise<EscandalloMergedFetchResult> {
  const restauranteId = String(
    options.profileRestaurantId ?? options.restaurantId ?? "",
  ).trim();

  if (!restauranteId) {
    return {
      rows: [],
      error: null,
      source: "central",
      legacyPendingCount: 0,
      centralProductCount: 0,
    };
  }

  if (options.catalogSource === "central") {
    const docs = options.centralProducts ?? [];
    return {
      rows: centralDocsToEscandalloRows(docs),
      error: null,
      source: "central",
      legacyPendingCount: countLegacyPlatosForRestaurant(restauranteId),
      centralProductCount: docs.length,
    };
  }

  const fetched =
    options.centralProducts == null
      ? await fetchCentralProductsOnce(restauranteId)
      : { docs: options.centralProducts, error: null };
  const docs = fetched.docs ?? [];

  return {
    rows: centralDocsToEscandalloRows(docs),
    error: fetched.error,
    source: "central",
    legacyPendingCount: countLegacyPlatosForRestaurant(restauranteId),
    centralProductCount: docs.length,
  };
}

/** Alias de compatibilidad; ya no resuelve tenant desde el navegador. */
export async function fetchEscandalloMergedRowsForBrowser(
  options?: FetchEscandalloMergedOptions,
): Promise<EscandalloMergedFetchResult> {
  return fetchEscandalloMergedRowsForRestaurant(options);
}

/** Sin tabla remota adicional: no-op. */
export async function mirrorPlatoToEscandalloRow(
  _plato: PlatoCarta,
): Promise<{ error: string | null }> {
  return { error: null };
}

export type EscandalloMetaEntry = {
  tieneEscandallo: boolean;
  costeTotal: number | null;
};

export type EscandalloMetaMap = Map<number, EscandalloMetaEntry>;

/** Alineado con la pantalla Escandallos: margen «bueno» desde 65 %. */
export const HOSTLY_MARGIN_OK_MIN_PCT = 65;

export function computeMarginPercent(
  costeTotal: number | null,
  precioVenta: number | null,
): number | null {
  if (precioVenta == null || precioVenta === 0 || costeTotal == null) return null;
  const margin = ((precioVenta - costeTotal) / precioVenta) * 100;
  return Number.isFinite(margin) ? margin : null;
}

export type CartaRowEconomicsTier = "danger" | "warning" | "ok";

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
  const margin = computeMarginPercent(coste, input.precioVenta);
  if (margin == null) return "warning";
  return margin >= HOSTLY_MARGIN_OK_MIN_PCT ? "ok" : "warning";
}

/**
 * Los costes manuales locales dejaron de ser fuente operativa.
 * Se conserva la forma de retorno mientras se retiran los consumidores legacy.
 */
export async function fetchEscandalloMetaForIds(ids: number[]): Promise<EscandalloMetaMap> {
  return new Map(
    ids.map((id) => [id, { tieneEscandallo: false, costeTotal: null }]),
  );
}

export { ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY };
