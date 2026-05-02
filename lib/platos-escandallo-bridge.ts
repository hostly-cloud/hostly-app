/**
 * Une el catálogo de venta local con filas Supabase `escandallos` (costes / ingredientes).
 */

import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, savePlatos, type PlatoCarta } from "@/lib/platos-local";
import { supabase } from "@/lib/supabase";

export type EscandalloMergedRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

type EscandalloDbRow = {
  id: number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

/** Si la carta está vacía pero ya hay escandallos en Supabase, importa una vez (migración suave). */
export async function bootstrapPlatosFromEscandallosIfEmpty(restauranteId: string): Promise<PlatoCarta[]> {
  const platos = loadPlatos(restauranteId);
  if (platos.length > 0) return platos;

  const { data, error } = await supabase
    .from("escandallos")
    .select("id, nombre_plato, precio_venta")
    .order("nombre_plato", { ascending: true, nullsFirst: false });

  console.log("CARTA_DATOS:", data);
  console.log("CARTA_ERROR:", error);

  if (error || !data?.length) return platos;

  const now = new Date().toISOString();
  const imported: PlatoCarta[] = [];
  for (const row of data) {
    const id = typeof row.id === "number" ? row.id : Number(row.id);
    if (!Number.isFinite(id)) continue;
    const pv =
      row.precio_venta != null && Number.isFinite(Number(row.precio_venta)) ? Number(row.precio_venta) : 0;
    imported.push({
      id: newId(),
      restauranteId,
      nombre:
        typeof row.nombre_plato === "string" && row.nombre_plato.trim() ? row.nombre_plato.trim() : "Producto",
      tipoVenta: "plato",
      categoria: "General",
      precioVenta: Math.max(0, pv),
      activo: true,
      escandalloSupabaseId: id,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (imported.length === 0) return platos;

  savePlatos(restauranteId, imported);
  return imported;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Crea fila mínima en `escandallos` para cada producto de venta activo sin vínculo.
 */
export async function ensureEscandalloRowsForPlatos(platos: PlatoCarta[]): Promise<{ next: PlatoCarta[]; error: string | null }> {
  let error: string | null = null;
  const next = [...platos];
  for (let i = 0; i < next.length; i++) {
    const p = next[i];
    if (!p.activo || p.escandalloSupabaseId != null) continue;

    const { data, error: insErr } = await supabase
      .from("escandallos")
      .insert({
        nombre_plato: p.nombre,
        precio_venta: p.precioVenta,
      })
      .select("id")
      .single();

    if (insErr) {
      error = insErr.message;
      break;
    }
    const rawId = data?.id;
    const sid = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(sid)) {
      error = "escandallos.insert: id inválido";
      break;
    }
    next[i] = { ...p, escandalloSupabaseId: sid, updatedAt: new Date().toISOString() };
  }
  return { next, error };
}

/**
 * Listado unificado para Escandallos / KPIs: solo productos de venta activos del catálogo con fila remota.
 */
export async function fetchEscandalloMergedRowsForBrowser(): Promise<{ rows: EscandalloMergedRow[]; error: string | null }> {
  const restauranteId = getBrowserRestauranteId();
  let platos = await bootstrapPlatosFromEscandallosIfEmpty(restauranteId);

  const ensured = await ensureEscandalloRowsForPlatos(platos);
  if (ensured.error) {
    return { rows: [], error: ensured.error };
  }
  if (ensured.next !== platos) {
    savePlatos(restauranteId, ensured.next);
    platos = ensured.next;
  }

  const activeLinked = platos.filter((p) => p.activo && p.escandalloSupabaseId != null) as (PlatoCarta & {
    escandalloSupabaseId: number;
  })[];

  if (activeLinked.length === 0) {
    return { rows: [], error: null };
  }

  const ids = activeLinked.map((p) => p.escandalloSupabaseId);
  const { data, error: qErr } = await supabase
    .from("escandallos")
    .select("id, nombre_plato, coste_total, precio_venta")
    .in("id", ids);

  if (qErr) {
    return { rows: [], error: qErr.message };
  }

  const byId = new Map<number, EscandalloDbRow>();
  for (const r of data ?? []) {
    const id = typeof r.id === "number" ? r.id : Number(r.id);
    if (Number.isFinite(id)) {
      byId.set(id, r as EscandalloDbRow);
    }
  }

  const rows: EscandalloMergedRow[] = activeLinked.map((p) => {
    const db = byId.get(p.escandalloSupabaseId);
    return {
      id: p.escandalloSupabaseId,
      nombre_plato: p.nombre,
      coste_total: db?.coste_total ?? null,
      precio_venta: p.precioVenta,
    };
  });

  rows.sort((a, b) =>
    (a.nombre_plato ?? "").localeCompare(b.nombre_plato ?? "", undefined, { sensitivity: "base" }),
  );

  return { rows, error: null };
}

/** Refleja nombre y PVP de carta en Supabase (reports / coherencia). */
export async function mirrorPlatoToEscandalloRow(plato: PlatoCarta): Promise<{ error: string | null }> {
  if (!plato.escandalloSupabaseId || !plato.activo) {
    return { error: null };
  }
  const { error } = await supabase
    .from("escandallos")
    .update({
      nombre_plato: plato.nombre,
      precio_venta: plato.precioVenta,
    })
    .eq("id", plato.escandalloSupabaseId);
  return { error: error?.message ?? null };
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

/** `tieneEscandallo`: ingredientes o coste total definido en remoto. `costeTotal` numérico remoto si existe. */
export async function fetchEscandalloMetaForIds(ids: number[]): Promise<EscandalloMetaMap> {
  const out: EscandalloMetaMap = new Map();
  if (ids.length === 0) return out;

  const { data: escRows, error: escMetaErr } = await supabase.from("escandallos").select("id, coste_total").in("id", ids);

  console.log("CARTA_DATOS:", escRows);
  console.log("CARTA_ERROR:", escMetaErr);

  const { data: ingRows, error: ingMetaErr } = await supabase
    .from("escandallo_ingredientes")
    .select("escandallo_id")
    .in("escandallo_id", ids);

  console.log("CARTA_DATOS:", ingRows);
  console.log("CARTA_ERROR:", ingMetaErr);

  const ingCount = new Map<number, number>();
  for (const r of ingRows ?? []) {
    const eid = typeof r.escandallo_id === "number" ? r.escandallo_id : Number(r.escandallo_id);
    if (!Number.isFinite(eid)) continue;
    ingCount.set(eid, (ingCount.get(eid) ?? 0) + 1);
  }

  for (const id of ids) {
    const esc = (escRows ?? []).find((row) => Number(row.id) === id);
    const costeRaw = esc?.coste_total;
    const costeNum = costeRaw != null && Number.isFinite(Number(costeRaw)) ? Number(costeRaw) : null;
    const hasCoste = costeNum != null;
    const nIng = ingCount.get(id) ?? 0;
    out.set(id, { tieneEscandallo: nIng > 0 || hasCoste, costeTotal: costeNum });
  }

  return out;
}
