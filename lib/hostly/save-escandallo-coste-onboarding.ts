/**
 * Guarda coste total del primer escandallo en onboarding (Supabase + fallback override local).
 */

import { ensureEscandalloRowsForPlatos } from "@/lib/platos-escandallo-bridge";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, savePlatos } from "@/lib/platos-local";
import { supabase } from "@/lib/supabase";

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

function writeCosteOverride(escandalloId: number, costeTotal: number): void {
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[String(escandalloId)] = costeTotal;
    localStorage.setItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* noop */
  }
}

function clearCosteOverride(escandalloId: number): void {
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const key = String(escandalloId);
    if (parsed[key] != null) {
      delete parsed[key];
      localStorage.setItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    /* noop */
  }
}

export async function saveEscandalloCosteForPlato(
  platoId: string,
  costeTotal: number,
): Promise<{ ok: boolean; error: string | null; escandalloId: number | null }> {
  const rid = getBrowserRestauranteId();
  let platos = loadPlatos(rid);
  const plato = platos.find((p) => p.id === platoId);
  if (!plato) return { ok: false, error: "PRODUCT_NOT_FOUND", escandalloId: null };

  const ensured = await ensureEscandalloRowsForPlatos(platos);
  if (ensured.error) {
    return { ok: false, error: ensured.error, escandalloId: null };
  }
  if (ensured.next !== platos) {
    savePlatos(rid, ensured.next);
    platos = ensured.next;
  }

  const linked = platos.find((p) => p.id === platoId);
  const sid = linked?.escandalloSupabaseId;
  if (sid == null) {
    return { ok: false, error: "NO_ESCANDALLO_LINK", escandalloId: null };
  }

  const { error } = await supabase.from("escandallos").update({ coste_total: costeTotal }).eq("id", sid);

  if (error) {
    writeCosteOverride(sid, costeTotal);
    return { ok: true, error: null, escandalloId: sid };
  }

  clearCosteOverride(sid);
  return { ok: true, error: null, escandalloId: sid };
}
