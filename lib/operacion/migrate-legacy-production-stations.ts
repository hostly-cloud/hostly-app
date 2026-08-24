import { listLegacyProductionStationsForMigration } from "@/lib/firestore/production-stations";
import {
  ensureOperationStationWithId,
  listOperationStations,
} from "@/lib/firestore/operation-stations";
import { normalizeOperationStationName } from "@/lib/operacion/operation-station-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import type { ProductionStationType } from "@/lib/produccion/production-station-types";

function mapLegacyType(type: ProductionStationType): OperationStationType {
  if (type === "cocina") return "kitchen";
  if (type === "barra") return "bar";
  if (type === "cocteleria") return "cocktail";
  return "custom";
}

/**
 * Compatibilidad idempotente entre la primera configuración de estaciones
 * (`productionStations`) y la colección canónica `operationStations`.
 *
 * - Lee explícitamente la colección legacy, no el adaptador canónico.
 * - No borra ni modifica documentos legacy.
 * - No duplica una estación si ya existe por nombre normalizado.
 * - Cuando una estación legacy es única, conserva su id para que referencias
 *   históricas puedan seguir resolviéndose durante la transición.
 */
export async function migrateLegacyProductionStationsToOperationStations(
  restaurantId: string,
): Promise<number> {
  const rid = restaurantId.trim();
  if (!rid) return 0;

  const [legacy, canonical] = await Promise.all([
    listLegacyProductionStationsForMigration(rid),
    listOperationStations(rid),
  ]);
  if (legacy.length === 0) return 0;

  const canonicalNames = new Set(
    canonical.map((station) => normalizeOperationStationName(station.name)),
  );
  const canonicalIds = new Set(canonical.map((station) => station.id));
  let sortOrder = canonical.reduce(
    (max, station) => Math.max(max, station.sortOrder),
    -10,
  );
  let created = 0;

  for (const station of legacy) {
    const normalizedName = normalizeOperationStationName(station.name);
    if (!normalizedName || canonicalNames.has(normalizedName) || canonicalIds.has(station.id)) {
      continue;
    }
    sortOrder += 10;
    const didCreate = await ensureOperationStationWithId(rid, station.id, {
      name: station.name,
      type: mapLegacyType(station.type),
      active: station.active,
      color: station.color,
      sortOrder,
    });
    if (didCreate) {
      created += 1;
      canonicalNames.add(normalizedName);
      canonicalIds.add(station.id);
    }
  }

  return created;
}
