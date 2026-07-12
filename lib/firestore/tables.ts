import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";

/** @deprecated Lectura legacy; escribir `free` | `occupied` | `reserved`. */
export const TABLE_STATUS_LIBRE = "libre" as const;
/** @deprecated Lectura legacy; escribir `free` | `occupied` | `reserved`. */
export const TABLE_STATUS_OCUPADA = "ocupada" as const;

/** Estado de mesa en Firestore y en app (mapa / TPV). */
export const TABLE_MAP_STATUS_FREE = "free" as const;
export const TABLE_MAP_STATUS_OCCUPIED = "occupied" as const;
export const TABLE_MAP_STATUS_RESERVED = "reserved" as const;

export type TableMapStatus =
  | typeof TABLE_MAP_STATUS_FREE
  | typeof TABLE_MAP_STATUS_OCCUPIED
  | typeof TABLE_MAP_STATUS_RESERVED;

/** Alias de tipo para el campo `status` del documento mesa. */
export type TableStatus = TableMapStatus;

/** Forma visual en mapa (editor futuro); MVP solo tipa y persiste. */
export type TableShape = "square" | "round" | "rect";

/** Forma visual de la mesa en el plano TPV (cuadrada / redonda). */
export type TableVisualShape = "square" | "round";

/** Tipo de elemento en el plano (Firestore: campo `type`). */
export type PlanElementType =
  | "table"
  | "sunbed"
  | "bed"
  | "custom"
  | "wall"
  | "bar"
  | "column"
  | "pool"
  | "door"
  | "planter";

export const PLAN_ELEMENT_DEFAULT_SIZE: Record<
  PlanElementType,
  { width: number; height: number }
> = {
  table: { width: 116, height: 76 },
  sunbed: { width: 200, height: 52 },
  bed: { width: 160, height: 110 },
  custom: { width: 116, height: 76 },
  wall: { width: 280, height: 12 },
  bar: { width: 200, height: 48 },
  column: { width: 44, height: 44 },
  pool: { width: 260, height: 140 },
  door: { width: 36, height: 112 },
  planter: { width: 168, height: 44 },
};

/** Referencia visual en el editor; no operativo en TPV Carta. */
export function isDecorativePlanElementType(
  type: PlanElementType,
): boolean {
  return (
    type === "wall" ||
    type === "bar" ||
    type === "column" ||
    type === "pool" ||
    type === "door" ||
    type === "planter"
  );
}

export function getDefaultSizeForPlanElementType(
  planType: PlanElementType,
): { width: number; height: number } {
  return PLAN_ELEMENT_DEFAULT_SIZE[planType];
}

function parsePlanElementType(v: unknown): PlanElementType {
  if (
    v === "table" ||
    v === "sunbed" ||
    v === "bed" ||
    v === "custom" ||
    v === "wall" ||
    v === "bar" ||
    v === "column" ||
    v === "pool" ||
    v === "door" ||
    v === "planter"
  ) {
    return v;
  }
  return "table";
}

/**
 * Documento colección `tables` (multi-restaurante).
 * Campos de layout (zone, x, y, …) opcionales para compatibilidad con mesas ya creadas.
 */
export type Table = {
  id: string;
  restaurantId: string;
  /** Etiqueta en UI; Firestore `name`. */
  name: string;
  /** Tipo de elemento; Firestore `type`; si falta → `table`. */
  type: PlanElementType;
  status: TableStatus;
  zone?: string;
  zoneId?: string;
  zoneName?: string;
  /** Plano del editor (`floorPlans/{id}`); opcional para compatibilidad. */
  floorPlanId?: string;
  shape?: TableShape;
  /** Campo Firestore `tableShape`; en lectura siempre tiene valor por defecto `square`. */
  tableShape: TableVisualShape;
  /** Comensales / asientos; en Firestore puede faltar → lectura usa 4. */
  seats: number;
  /** Comensales actuales en servicio (TPV); Firestore `dinersCount` / legacy `guestCount`. */
  dinersCount?: number;
  /** Posición en el mapa TPV (px). Firestore puede omitir; lectura usa 0. */
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Editor de plano: si true, no mover/redimensionar en UI (opcional en Firestore). */
  locked?: boolean;
  /** Diagnóstico / puente Editor V2: origen del elemento publicado. */
  source?: string;
  editorV2ElementId?: string;
  editorV2InstanceId?: string;
  editorV2ElementType?: string;
  /** Si falta en Firestore, se trata como `true` en lectura. */
  isActive?: boolean;
  /** Usuario (`users/{id}`) responsable de la mesa en sala. */
  waiterId?: string;
  /** Denormalizado para mapa / listas sin join. */
  waiterName?: string;
  /** Primer operador TPV que abrió la mesa en el servicio actual (fase 1 «Mis mesas»). */
  assignedOperatorId?: string;
  assignedOperatorName?: string;
  assignedAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

/** Alias: documento de elemento de plano (colección `tables`). */
export type FloorElement = Table;

/** Contador independiente por tipo para etiquetas automáticas al crear. */
export function nextAutoLabelForPlanElementType(
  elements: Pick<Table, "type" | "name">[],
  planType: PlanElementType,
): string {
  const prefix =
    planType === "sunbed"
      ? "Hamaca"
      : planType === "bed"
        ? "Cama"
        : planType === "wall"
          ? "Pared"
          : planType === "bar"
            ? "Barra"
            : planType === "column"
              ? "Columna"
              : planType === "pool"
                ? "Piscina"
                : planType === "door"
                  ? "Puerta"
                  : planType === "planter"
                    ? "Jardinera"
                    : planType === "custom"
                      ? "Elemento"
                      : "Mesa";

  const re = new RegExp(`^${prefix}\\s+(\\d+)$`, "i");
  let max = 0;
  const used = new Set<string>();
  for (const e of elements) {
    if (e.type !== planType) continue;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (name) used.add(name.toLowerCase());
    const m = re.exec(name);
    if (!m) continue;
    const n = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(n) && n > max) max = n;
  }

  // Prefer max+1; if somehow taken, find next free.
  let next = Math.max(1, max + 1);
  for (let i = 0; i < 9999; i++) {
    const candidate = `${prefix} ${next}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
    next++;
  }

  switch (planType) {
    case "sunbed":
      return `Hamaca ${Date.now()}`;
    case "bed":
      return `Cama ${Date.now()}`;
    case "wall":
      return `Pared ${Date.now()}`;
    case "bar":
      return `Barra ${Date.now()}`;
    case "column":
      return `Columna ${Date.now()}`;
    case "pool":
      return `Piscina ${Date.now()}`;
    case "door":
      return `Puerta ${Date.now()}`;
    case "planter":
      return `Jardinera ${Date.now()}`;
    case "custom":
      return `Elemento ${Date.now()}`;
    default:
      return `Mesa ${Date.now()}`;
  }
}

export const UNAUTHORIZED_TABLE_ACCESS = "UNAUTHORIZED_TABLE_ACCESS";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readTsMs(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  return undefined;
}

function parseStatus(v: unknown): TableMapStatus {
  if (
    v === TABLE_MAP_STATUS_FREE ||
    v === TABLE_MAP_STATUS_OCCUPIED ||
    v === TABLE_MAP_STATUS_RESERVED
  ) {
    return v;
  }
  if (v === TABLE_STATUS_LIBRE) return TABLE_MAP_STATUS_FREE;
  if (v === TABLE_STATUS_OCUPADA) return TABLE_MAP_STATUS_OCCUPIED;
  return TABLE_MAP_STATUS_FREE;
}

function parseZone(v: unknown): string {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return "restaurante";
}

function parseShape(v: unknown): TableShape | undefined {
  if (v === "square" || v === "round" || v === "rect") return v;
  return undefined;
}

function parseTableShape(v: unknown): TableVisualShape {
  if (v === "round") return "round";
  return "square";
}

/** Asientos en mapa; si falta o es inválido → 4; si existe → entre 1 y 20. */
function parseSeats(v: unknown): number {
  const n = parseFiniteNumber(v);
  if (n === undefined || !Number.isFinite(n)) return 4;
  const r = Math.round(n);
  return Math.min(20, Math.max(1, r));
}

function parseFiniteNumber(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(v: unknown, defaultTrue: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return defaultTrue;
}

function assertTableTenant(
  data: Record<string, unknown>,
  activeRestaurantId: string,
): void {
  const rid = activeRestaurantId.trim();
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid !== "" && docRid === rid) return;
  throw new Error(UNAUTHORIZED_TABLE_ACCESS);
}

function parseDinersCount(data: Record<string, unknown>): number | undefined {
  const raw = data.dinersCount ?? data.guestCount;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  return undefined;
}

/** Comensales en mesa abierta; 0 si el doc no trae el campo. */
export function readTableDinersCount(
  table: Pick<Table, "dinersCount"> | null | undefined,
): number {
  if (
    table != null &&
    typeof table.dinersCount === "number" &&
    Number.isFinite(table.dinersCount)
  ) {
    return Math.max(0, Math.floor(table.dinersCount));
  }
  return 0;
}

function mapDocToTable(d: QueryDocumentSnapshot): Table {
  const data = d.data() as Record<string, unknown>;
  const nameRaw = data.name;
  const name =
    nameRaw !== undefined && nameRaw !== null && String(nameRaw).trim() !== ""
      ? String(nameRaw).trim()
      : "";
  const restaurantIdRaw = data.restaurantId;
  const restaurantId =
    typeof restaurantIdRaw === "string" && restaurantIdRaw.trim() !== ""
      ? restaurantIdRaw.trim()
      : "";
  const idField = typeof data.id === "string" && data.id.trim() !== "" ? data.id.trim() : d.id;
  const shape = parseShape(data.shape);
  const tableShape = parseTableShape(data.tableShape);
  const planElementType = parsePlanElementType(data.type);
  let seats = parseSeats(data.seats);
  if (isDecorativePlanElementType(planElementType)) {
    seats = 0;
  }
  const waiterIdRaw = data.waiterId;
  const waiterId =
    typeof waiterIdRaw === "string" && waiterIdRaw.trim() !== ""
      ? waiterIdRaw.trim()
      : undefined;
  const waiterNameRaw = data.waiterName;
  const waiterName =
    typeof waiterNameRaw === "string" && waiterNameRaw.trim() !== ""
      ? waiterNameRaw.trim()
      : undefined;
  const zoneIdRaw = data.zoneId;
  const zoneId =
    typeof zoneIdRaw === "string" && zoneIdRaw.trim() !== ""
      ? zoneIdRaw.trim()
      : undefined;
  const zoneNameRaw = data.zoneName;
  const zoneName =
    typeof zoneNameRaw === "string" && zoneNameRaw.trim() !== ""
      ? zoneNameRaw.trim()
      : undefined;
  const floorPlanIdRaw = data.floorPlanId;
  const floorPlanId =
    typeof floorPlanIdRaw === "string" && floorPlanIdRaw.trim() !== ""
      ? floorPlanIdRaw.trim()
      : undefined;
  const dinersCount = parseDinersCount(data);
  const assignedOperatorIdRaw = data.assignedOperatorId;
  const assignedOperatorId =
    typeof assignedOperatorIdRaw === "string" &&
    assignedOperatorIdRaw.trim() !== ""
      ? assignedOperatorIdRaw.trim()
      : undefined;
  const assignedOperatorNameRaw = data.assignedOperatorName;
  const assignedOperatorName =
    typeof assignedOperatorNameRaw === "string" &&
    assignedOperatorNameRaw.trim() !== ""
      ? assignedOperatorNameRaw.trim()
      : undefined;
  const assignedAt = readTsMs(data, "assignedAt");
  const source =
    typeof data.source === "string" && data.source.trim() !== ""
      ? data.source.trim()
      : undefined;
  const editorV2ElementId =
    typeof data.editorV2ElementId === "string" && data.editorV2ElementId.trim() !== ""
      ? data.editorV2ElementId.trim()
      : undefined;
  const editorV2InstanceId =
    typeof data.editorV2InstanceId === "string" && data.editorV2InstanceId.trim() !== ""
      ? data.editorV2InstanceId.trim()
      : undefined;
  const editorV2ElementType =
    typeof data.editorV2ElementType === "string" &&
    data.editorV2ElementType.trim() !== ""
      ? data.editorV2ElementType.trim()
      : undefined;
  return {
    id: idField,
    name,
    type: planElementType,
    restaurantId,
    status: parseStatus(data.status),
    zone: parseZone(data.zone),
    ...(zoneId !== undefined ? { zoneId } : {}),
    ...(zoneName !== undefined ? { zoneName } : {}),
    ...(floorPlanId !== undefined ? { floorPlanId } : {}),
    ...(shape !== undefined ? { shape } : {}),
    tableShape,
    seats,
    ...(dinersCount !== undefined ? { dinersCount } : {}),
    ...(waiterId !== undefined ? { waiterId } : {}),
    ...(waiterName !== undefined ? { waiterName } : {}),
    ...(assignedOperatorId !== undefined ? { assignedOperatorId } : {}),
    ...(assignedOperatorName !== undefined ? { assignedOperatorName } : {}),
    ...(assignedAt !== undefined ? { assignedAt } : {}),
    x: parseFiniteNumber(data.x) ?? 0,
    y: parseFiniteNumber(data.y) ?? 0,
    ...(parseFiniteNumber(data.width) !== undefined
      ? { width: parseFiniteNumber(data.width) }
      : {}),
    ...(parseFiniteNumber(data.height) !== undefined
      ? { height: parseFiniteNumber(data.height) }
      : {}),
    ...(typeof data.locked === "boolean" ? { locked: data.locked } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(editorV2ElementId !== undefined ? { editorV2ElementId } : {}),
    ...(editorV2InstanceId !== undefined ? { editorV2InstanceId } : {}),
    ...(editorV2ElementType !== undefined ? { editorV2ElementType } : {}),
    isActive: parseBool(data.isActive, true),
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
  };
}

/** Mapa TPV Carta: activos; sin elementos solo decorativos del editor (layout / no operativos). */
export function filterTablesForTpvMap(tables: Table[]): Table[] {
  return tables.filter(
    (t) => t.isActive !== false && !isDecorativePlanElementType(t.type),
  );
}

export function sortTablesForTpvMap(a: Table, b: Table): number {
  const za = (a.zone ?? "restaurante").toLowerCase();
  const zb = (b.zone ?? "restaurante").toLowerCase();
  const z = za.localeCompare(zb, "es");
  if (z !== 0) return z;
  return a.name.localeCompare(b.name, "es", { numeric: true });
}

function sortTablesByCreatedAndName(list: Table[]): Table[] {
  return [...list].sort((a, b) => {
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "es");
  });
}

export async function getTables(restaurantId: string): Promise<Table[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  if (!isAuthReady()) return [];
  try {
    const col = collection(db, "tables");
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    return sortTablesByCreatedAndName(snap.docs.map(mapDocToTable));
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/**
 * Escucha la colección `tables` del restaurante (un listener por tenant).
 * Incluye mesas inactivas; el TPV filtra con `filterTablesForTpvMap` / `isActive`.
 */
export function listenTablesByRestaurantId(
  restaurantId: string,
  callback: (tables: Table[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid) {
    onError?.(new Error("listenTables: restaurantId obligatorio"));
    callback([]);
    return () => {};
  }
  if (!isAuthReady()) {
    callback([]);
    return () => {};
  }

  try {
    const q = query(collection(db, "tables"), where("restaurantId", "==", rid));
    return onSnapshot(
      q,
      (snap) => {
        try {
          callback(sortTablesByCreatedAndName(snap.docs.map(mapDocToTable)));
        } catch (e) {
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      },
      (error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
    return () => {};
  }
}

export async function createTable(
  name: string,
  restaurantId: string,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("createTable: restaurantId no disponible");
  }
  const n = String(name ?? "").trim();
  if (!n) {
    throw new Error("createTable: nombre vacío");
  }
  const ref = doc(collection(db, "tables"));
  try {
    await setDoc(ref, {
      id: ref.id,
      restaurantId: rid,
      name: n,
      type: "table",
      status: TABLE_MAP_STATUS_FREE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as DocumentData);
    return ref.id;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function updateTableWaiter(
  tableId: string,
  restaurantId: string,
  assignment: { waiterId: string; waiterName: string } | null,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("updateTableWaiter: restaurantId no disponible");
  const ref = doc(db, "tables", tableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Mesa no encontrada");
  const existing = snap.data() as Record<string, unknown>;
  assertTableTenant(existing, rid);
  try {
    await updateDoc(
      ref,
      assignment
        ? ({
            waiterId: assignment.waiterId,
            waiterName: assignment.waiterName,
            updatedAt: serverTimestamp(),
          } as DocumentData)
        : ({
            waiterId: deleteField(),
            waiterName: deleteField(),
            updatedAt: serverTimestamp(),
          } as DocumentData),
    );
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function updateTableStatus(
  tableId: string,
  restaurantId: string,
  status: TableMapStatus,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("updateTableStatus: restaurantId no disponible");
  if (
    status !== TABLE_MAP_STATUS_FREE &&
    status !== TABLE_MAP_STATUS_OCCUPIED &&
    status !== TABLE_MAP_STATUS_RESERVED
  ) {
    throw new Error("updateTableStatus: estado no válido");
  }
  const ref = doc(db, "tables", tableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Mesa no encontrada");
  const existing = snap.data() as Record<string, unknown>;
  assertTableTenant(existing, rid);
  try {
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (e) {
    rethrowWithMessage(e);
  }
}
