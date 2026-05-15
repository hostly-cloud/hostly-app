import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
export const TABLE_GROUPS_DOC_SEGMENTS = ["config", "tableGroups"] as const;

/** `restaurants/{restaurantId}/config/tableGroups` */
export function tableGroupsDocRef(restaurantId: string) {
  return doc(db, "restaurants", restaurantId, ...TABLE_GROUPS_DOC_SEGMENTS);
}

/**
 * Normaliza el mapa `mainTableId -> mesas unidas` desde Firestore o memoria local.
 */
export function normalizeTableGroups(rawGroups: unknown): Record<string, string[]> {
  if (
    rawGroups == null ||
    typeof rawGroups !== "object" ||
    Array.isArray(rawGroups)
  ) {
    return {};
  }

  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawGroups as Record<string, unknown>)) {
    const mainId = String(key ?? "").trim();
    if (!mainId) continue;
    if (!Array.isArray(value)) continue;

    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of value) {
      const sid = String(item ?? "").trim();
      if (!sid || sid === mainId) continue;
      if (seen.has(sid)) continue;
      seen.add(sid);
      list.push(sid);
    }

    if (list.length === 0) continue;
    out[mainId] = list;
  }

  return out;
}

/**
 * Persiste grupos tras actualización optimista en cliente.
 * IMPORTANTE: `groups` debe sustituirse entero en Firestore. Con `setDoc(..., { merge: true })`
 * un valor `groups: {}` NO borra claves anidadas que ya existían en el mapa.
 * Por eso aquí usamos `merge: false` y el documento queda solo en `{ groups, updatedAt }`.
 * Fallos solo se registran en consola; no relanza.
 */
export async function persistTableGroups(
  restaurantId: string,
  groups: Record<string, string[]>,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) return;
  if (!isAuthReady()) return;

  try {
    const normalized = normalizeTableGroups(groups);
    await setDoc(
      tableGroupsDocRef(rid),
      {
        groups: normalized,
        updatedAt: Date.now(),
      },
      { merge: false },
    );
  } catch (e) {
    console.error("persistTableGroups", e);
  }
}