import type { Firestore } from "firebase-admin/firestore";
import {
  isProductionStationType,
  normalizeProductionStationColor,
  normalizeProductionStationName,
  sortProductionStations,
  type ProductionStationDocument,
} from "@/lib/produccion/production-station-types";

function readMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.getTime();
  }
  return Date.now();
}

function mapStationDoc(
  restaurantId: string,
  docId: string,
  data: Record<string, unknown>,
): ProductionStationDocument | null {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const type = data.type;
  if (!name || !isProductionStationType(type)) return null;

  const createdAt = readMs(data.createdAt);
  const updatedAt = readMs(data.updatedAt);

  return {
    id: docId,
    restaurantId: restaurantId.trim(),
    name,
    normalizedName:
      typeof data.normalizedName === "string" && data.normalizedName.trim()
        ? data.normalizedName.trim()
        : normalizeProductionStationName(name),
    type,
    color: normalizeProductionStationColor(data.color),
    active: data.active !== false,
    createdAt,
    updatedAt,
  };
}

/**
 * Carga estaciones de producción por tenant usando Admin Firestore.
 * Solo lectura: no crea defaults ni modifica configuración.
 */
export async function loadHostlyProductionStations(
  db: Firestore,
  restaurantId: string,
): Promise<ProductionStationDocument[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];

  const byId = new Map<string, ProductionStationDocument>();
  const paths = [
    ["restaurants", rid, "productionStations"],
    ["restaurantes", rid, "productionStations"],
  ] as const;

  for (const [root, docId, sub] of paths) {
    try {
      const snap = await db.collection(root).doc(docId).collection(sub).get();
      for (const d of snap.docs) {
        const parsed = mapStationDoc(rid, d.id, d.data() as Record<string, unknown>);
        if (parsed) byId.set(parsed.id, parsed);
      }
    } catch {
      /* Shadow context is non-blocking; ignore unavailable legacy/current path. */
    }
  }

  return sortProductionStations([...byId.values()]);
}
