/**
 * Une el catálogo de venta local con costes (override local en navegador).
 */

import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, type PlatoCarta } from "@/lib/platos-local";

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

function readCosteOverridesBrowser(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export type EscandalloMergedRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
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
 * Listado unificado para Escandallos / KPIs: productos activos con vínculo numérico legacy y coste desde override local.
 */
export async function fetchEscandalloMergedRowsForBrowser(): Promise<{ rows: EscandalloMergedRow[]; error: string | null }> {
  const restauranteId = getBrowserRestauranteId();
  const platos = await bootstrapPlatosFromEscandallosIfEmpty(restauranteId);
  const overrides = readCosteOverridesBrowser();

  const activeLinked = platos.filter((p) => p.activo && p.escandalloSupabaseId != null) as (PlatoCarta & {
    escandalloSupabaseId: number;
  })[];

  const rows: EscandalloMergedRow[] = activeLinked.map((p) => {
    const sid = p.escandalloSupabaseId;
    const ov = overrides[String(sid)];
    const coste_total = typeof ov === "number" && Number.isFinite(ov) ? ov : null;
    return {
      id: sid,
      nombre_plato: p.nombre,
      coste_total,
      precio_venta: p.precioVenta,
    };
  });

  rows.sort((a, b) =>
    (a.nombre_plato ?? "").localeCompare(b.nombre_plato ?? "", undefined, { sensitivity: "base" }),
  );

  return { rows, error: null };
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

/** Metadatos solo desde override local / ausencia de datos remotos. */
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
