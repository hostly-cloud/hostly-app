import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  listOperationStations,
  listenOperationStations,
  type OperationStationDocument,
} from "@/lib/firestore/operation-stations";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import {
  DEFAULT_PRODUCTION_STATION_COLOR,
  normalizeProductionStationColor,
  normalizeProductionStationName,
  sortProductionStations,
  type ProductionStationDocument,
  type ProductionStationInput,
  type ProductionStationType,
} from "@/lib/produccion/production-station-types";

/**
 * Colección legacy mantenida únicamente para migración/espejo temporal.
 * Los lectores funcionales de Hostly deben consumir `operationStations`.
 */
export function productionStationsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "productionStations");
}

export function productionStationDocRef(restaurantId: string, stationId: string) {
  return doc(productionStationsCollectionRef(restaurantId), stationId.trim());
}

function authUidOrThrow(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

export function parseProductionStationDocument(
  stationId: string,
  raw: unknown,
  restaurantId: string,
): ProductionStationDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) return null;
  const type = data.type;
  if (
    type !== "cocina" &&
    type !== "barra" &&
    type !== "cocteleria" &&
    type !== "otro"
  ) {
    return null;
  }
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : Date.now();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : undefined;

  return {
    id: stationId,
    restaurantId: rid,
    name,
    normalizedName:
      typeof data.normalizedName === "string" && data.normalizedName.trim()
        ? data.normalizedName.trim()
        : normalizeProductionStationName(name),
    type,
    color: normalizeProductionStationColor(data.color),
    active: data.active !== false,
    ...(sortOrder != null ? { sortOrder } : {}),
    createdAt,
    updatedAt,
  };
}

function operationTypeToProductionType(
  type: OperationStationType,
): ProductionStationType {
  if (type === "kitchen") return "cocina";
  if (type === "bar") return "barra";
  if (type === "cocktail") return "cocteleria";
  return "otro";
}

function productionTypeToOperationType(
  type: ProductionStationType,
): OperationStationType {
  if (type === "cocina") return "kitchen";
  if (type === "barra") return "bar";
  if (type === "cocteleria") return "cocktail";
  return "custom";
}

/** Adaptador de lectura: operación canónica -> forma legacy que todavía usa Carta/Familias. */
export function productionStationFromOperationStation(
  station: OperationStationDocument,
): ProductionStationDocument {
  return {
    id: station.id,
    restaurantId: station.restaurantId,
    name: station.name,
    normalizedName: station.normalizedName,
    type: operationTypeToProductionType(station.type),
    color: normalizeProductionStationColor(
      station.color ?? DEFAULT_PRODUCTION_STATION_COLOR,
    ),
    active: station.active,
    sortOrder: station.sortOrder,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
  };
}

/**
 * Fuente funcional única: lee `operationStations` y adapta la forma para
 * consumidores legacy. La colección `productionStations` ya no se consulta aquí.
 */
export async function listProductionStations(
  restaurantId: string,
): Promise<ProductionStationDocument[]> {
  if (!isAuthReady()) return [];
  const canonical = await listOperationStations(restaurantId);
  return sortProductionStations(canonical.map(productionStationFromOperationStation));
}

export function listenProductionStations(
  restaurantId: string,
  onData: (stations: ProductionStationDocument[]) => void,
  onListenError?: (error: unknown) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }
  return listenOperationStations(
    rid,
    (stations) =>
      onData(
        sortProductionStations(
          stations.map(productionStationFromOperationStation),
        ),
      ),
    onListenError,
  );
}

/**
 * Escrituras legacy conservadas para compatibilidad excepcional.
 * Se redirigen al modelo canónico mediante dynamic import para evitar ciclos.
 */
export async function createProductionStation(
  restaurantId: string,
  input: ProductionStationInput,
): Promise<ProductionStationDocument> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  authUidOrThrow();
  const { createOperationStation, listOperationStations } = await import(
    "@/lib/firestore/operation-stations"
  );
  const id = await createOperationStation(rid, {
    name: input.name,
    type: productionTypeToOperationType(input.type),
    color: input.color,
    active: input.active,
  });
  const created = (await listOperationStations(rid)).find((s) => s.id === id);
  if (!created) throw new Error("CREATE_FAILED");
  return productionStationFromOperationStation(created);
}

export async function updateProductionStation(
  restaurantId: string,
  stationId: string,
  input: Partial<ProductionStationInput>,
): Promise<void> {
  const { updateOperationStation } = await import(
    "@/lib/firestore/operation-stations"
  );
  await updateOperationStation(restaurantId, stationId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.type !== undefined
      ? { type: productionTypeToOperationType(input.type) }
      : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  });
}

export async function setProductionStationActive(
  restaurantId: string,
  stationId: string,
  active: boolean,
): Promise<void> {
  const { updateOperationStation } = await import(
    "@/lib/firestore/operation-stations"
  );
  await updateOperationStation(restaurantId, stationId, { active });
}

/**
 * Lectura explícita de documentos legacy para la migración inicial.
 * No usar en UI ni routing operativo.
 */
export async function listLegacyProductionStationsForMigration(
  restaurantId: string,
): Promise<ProductionStationDocument[]> {
  if (!isAuthReady()) return [];
  const rid = restaurantId.trim();
  const snap = await getDocs(
    query(productionStationsCollectionRef(rid), orderBy("name", "asc")),
  );
  const list: ProductionStationDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseProductionStationDocument(docSnap.id, docSnap.data(), rid);
    if (parsed) list.push(parsed);
  });
  return sortProductionStations(list);
}

/**
 * Sombra temporal para documentos legacy aún referenciados fuera del routing.
 * No es fuente de lectura funcional.
 */
export async function syncProductionStationShadowFromOperationStation(
  restaurantId: string,
  station: {
    id: string;
    name: string;
    type: OperationStationType;
    color?: string;
    active: boolean;
    sortOrder?: number;
  },
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = station.id.trim();
  if (!rid || !sid) return;
  authUidOrThrow();
  const ref = productionStationDocRef(rid, sid);
  const current = await getDoc(ref);
  const now = Date.now();
  const createdAt = current.exists()
    ? parseProductionStationDocument(sid, current.data(), rid)?.createdAt ?? now
    : now;
  await setDoc(
    ref,
    {
      restaurantId: rid,
      name: station.name.trim(),
      normalizedName: normalizeProductionStationName(station.name),
      type: operationTypeToProductionType(station.type),
      color: normalizeProductionStationColor(station.color),
      active: station.active,
      ...(typeof station.sortOrder === "number" && Number.isFinite(station.sortOrder)
        ? { sortOrder: Math.floor(station.sortOrder) }
        : {}),
      createdAt,
      updatedAt: now,
    },
    { merge: true },
  );
}
