import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { FloorPlan } from "@/lib/firestore/floorPlans";
import type { PlanElementType, Table } from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";

/** Tipos que cuentan como “mesa / asiento” frente a decoración (pared, barra…). */
const TABLE_LIKE_PLAN_ELEMENT_TYPES = new Set<PlanElementType>([
  "table",
  "sunbed",
  "bed",
  "custom",
]);

export const FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type FloorPlanSnapshotSource = "manual";

export type FloorPlanSnapshotKind = "preset" | "backup";

/** Contenido congelado suficiente para restaurar canvas + elementos más adelante. */
export type FloorPlanSnapshotFloorPlan = {
  /** Doc `floorPlans` tal como se conoce en el momento del snapshot. */
  plan: FloorPlan;
  /** Docs colección `tables` que pertenecen a ese plano. */
  elements: Table[];
  /** Docs colección `zones` asociadas al plano. */
  zones: Zone[];
};

export type FloorPlanSnapshotDocument = {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  source: FloorPlanSnapshotSource;
  schemaVersion: typeof FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION;
  floorPlan: FloorPlanSnapshotFloorPlan;
  /** Elementos tipo mesa/sunbed/bed/custom. */
  tableCount?: number;
  /** Total de elementos en `floorPlan.elements` (incl. decoración). */
  elementCount?: number;
  isArchived?: boolean;
  /** Denormalizado para queries por plano (`floorPlan.plan.id`). */
  floorPlanId?: string;
  /** Preset operacional vs backup automático antes de restore. */
  kind?: FloorPlanSnapshotKind;
  tags?: string[];
  /** Joins opcionales congelados con el preset (no se aplica en Fase 1). */
  tableGroups?: Record<string, string[]>;
};

export type CreateFloorPlanSnapshotInput = {
  name: string;
  description?: string;
  createdBy?: string;
  floorPlan: FloorPlanSnapshotFloorPlan;
  floorPlanId?: string;
  kind?: FloorPlanSnapshotKind;
  tags?: string[];
  tableGroups?: Record<string, string[]>;
};

/** Vista ligera para listados (sin el blob `floorPlan`). */
export type FloorPlanSnapshotSummary = Omit<FloorPlanSnapshotDocument, "floorPlan">;

export const FLOOR_PLAN_SNAPSHOTS_SUBCOLLECTION = "floorPlanSnapshots";

const SUBCOLLECTION = FLOOR_PLAN_SNAPSHOTS_SUBCOLLECTION;

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

/** Recorta texto; cadena opcional ausente si queda vacía. */
export function normalizeSnapshotDescription(description: string | undefined): string | undefined {
  if (description === undefined || description === null) return undefined;
  const t = String(description).trim();
  return t === "" ? undefined : t;
}

export function normalizeSnapshotName(name: string): string {
  const t = String(name ?? "").trim();
  return t;
}

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("floor-plan-snapshot: restaurantId obligatorio");
  }
  return rid;
}

/** Clona un layout embebido para no mutar el estado del llamador antes de persistir. */
export function cloneFloorPlanSnapshotEmbedded(
  floorPlan: FloorPlanSnapshotFloorPlan,
): FloorPlanSnapshotFloorPlan {
  return structuredClone(floorPlan);
}

function assertFloorPlanPresent(floorPlan: unknown): asserts floorPlan is FloorPlanSnapshotFloorPlan {
  if (floorPlan == null || typeof floorPlan !== "object") {
    throw new Error("floor-plan-snapshot: floorPlan obligatorio");
  }
  const fp = floorPlan as FloorPlanSnapshotFloorPlan;
  if (fp.plan == null || typeof fp.plan !== "object") {
    throw new Error("floor-plan-snapshot: floorPlan.plan inválido");
  }
  const planId =
    typeof (fp.plan as FloorPlan).id === "string" ? (fp.plan as FloorPlan).id.trim() : "";
  if (!planId) {
    throw new Error("floor-plan-snapshot: floorPlan.plan.id obligatorio");
  }
  const planRestaurantId =
    typeof (fp.plan as FloorPlan).restaurantId === "string"
      ? (fp.plan as FloorPlan).restaurantId.trim()
      : "";
  if (!planRestaurantId) {
    throw new Error("floor-plan-snapshot: floorPlan.plan.restaurantId obligatorio");
  }
  if (!Array.isArray(fp.elements)) {
    throw new Error("floor-plan-snapshot: floorPlan.elements debe ser un array");
  }
  if (!Array.isArray(fp.zones)) {
    throw new Error("floor-plan-snapshot: floorPlan.zones debe ser un array");
  }
  for (const el of fp.elements) {
    if (el == null || typeof el !== "object") {
      throw new Error("floor-plan-snapshot: elemento de plano inválido");
    }
    const tid = typeof (el as Table).id === "string" ? (el as Table).id.trim() : "";
    if (!tid) throw new Error("floor-plan-snapshot: cada elemento debe tener id");
    const er =
      typeof (el as Table).restaurantId === "string" ? (el as Table).restaurantId.trim() : "";
    if (er !== planRestaurantId) {
      throw new Error("floor-plan-snapshot: restaurantId incoherente en elementos");
    }
  }
  for (const z of fp.zones) {
    if (z == null || typeof z !== "object") {
      throw new Error("floor-plan-snapshot: zona inválida");
    }
    const zid = typeof (z as Zone).id === "string" ? (z as Zone).id.trim() : "";
    if (!zid) throw new Error("floor-plan-snapshot: cada zona debe tener id");
    const zr =
      typeof (z as Zone).restaurantId === "string" ? (z as Zone).restaurantId.trim() : "";
    if (zr !== planRestaurantId) {
      throw new Error("floor-plan-snapshot: restaurantId incoherente en zonas");
    }
  }
}

/** Comprueba coherencia de tenant entre el path del restaurante y el plan embebido. */
export function assertFloorPlanRestaurantMatch(
  restaurantId: string,
  floorPlan: FloorPlanSnapshotFloorPlan,
): void {
  assertFloorPlanPresent(floorPlan);
  const rid = assertRestaurantId(restaurantId);
  const pr =
    typeof floorPlan.plan.restaurantId === "string"
      ? floorPlan.plan.restaurantId.trim()
      : "";
  if (pr !== rid) {
    throw new Error("floor-plan-snapshot: tenant del plan distinto del restaurantId");
  }
}

export function computeFloorPlanSnapshotCounts(elements: readonly Table[]): {
  elementCount: number;
  tableCount: number;
} {
  let tableCount = 0;
  for (const el of elements) {
    if (TABLE_LIKE_PLAN_ELEMENT_TYPES.has(el.type)) tableCount++;
  }
  return { elementCount: elements.length, tableCount };
}

/**
 * Construye el cuerpo listo para `setDoc` (sin id de documento).
 * Valida name, tenant y contenido del plan.
 */
export function buildFloorPlanSnapshotPayload(
  restaurantId: string,
  input: CreateFloorPlanSnapshotInput,
): Omit<FloorPlanSnapshotDocument, "id"> {
  const rid = assertRestaurantId(restaurantId);
  const name = normalizeSnapshotName(input.name);
  if (!name) {
    throw new Error("floor-plan-snapshot: nombre vacío");
  }
  assertFloorPlanPresent(input.floorPlan);
  assertFloorPlanRestaurantMatch(rid, input.floorPlan);

  const floorPlan = cloneFloorPlanSnapshotEmbedded(input.floorPlan);
  const description = normalizeSnapshotDescription(input.description);
  const createdBy =
    typeof input.createdBy === "string" && input.createdBy.trim() !== ""
      ? input.createdBy.trim()
      : undefined;

  const now = Date.now();
  const { elementCount, tableCount } = computeFloorPlanSnapshotCounts(floorPlan.elements);

  const floorPlanId =
    typeof input.floorPlanId === "string" && input.floorPlanId.trim() !== ""
      ? input.floorPlanId.trim()
      : floorPlan.plan.id.trim();

  const kind = input.kind === "backup" ? "backup" : "preset";

  const tags =
    Array.isArray(input.tags) && input.tags.length > 0
      ? input.tags
          .map((t) => String(t ?? "").trim())
          .filter((t) => t !== "")
      : undefined;

  const tableGroups =
    input.tableGroups != null &&
    typeof input.tableGroups === "object" &&
    !Array.isArray(input.tableGroups)
      ? input.tableGroups
      : undefined;

  const base: Omit<FloorPlanSnapshotDocument, "id"> = {
    restaurantId: rid,
    name,
    ...(description !== undefined ? { description } : {}),
    createdAt: now,
    updatedAt: now,
    ...(createdBy !== undefined ? { createdBy } : {}),
    source: "manual",
    schemaVersion: FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION,
    floorPlan,
    elementCount,
    tableCount,
    isArchived: false,
    floorPlanId,
    kind,
    ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
    ...(tableGroups !== undefined ? { tableGroups } : {}),
  };
  return base;
}

function snapshotCollectionRef(restaurantId: string) {
  return collection(db, "restaurants", assertRestaurantId(restaurantId), SUBCOLLECTION);
}

/** Firestore rechaza `undefined`; omite claves opcionales (incl. objetos anidados). */
function removeUndefinedFields<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedFields(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    out[key] = removeUndefinedFields(entry);
  }
  return out as T;
}

function snapshotDocRef(restaurantId: string, snapshotId: string) {
  return doc(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    SUBCOLLECTION,
    snapshotId.trim(),
  );
}

function parseFloorPlanSnapshotFloorPlan(raw: unknown): FloorPlanSnapshotFloorPlan {
  assertFloorPlanPresent(raw);
  return raw as FloorPlanSnapshotFloorPlan;
}

/** Parseo tolerante para listeners: un doc legacy/corrupto no tumba el listado. */
export function tryParseFloorPlanSnapshotDocument(
  d: QueryDocumentSnapshot | DocumentSnapshot,
): FloorPlanSnapshotDocument | null {
  try {
    if (!d.exists()) return null;
    return parseFloorPlanSnapshotDocument(d);
  } catch {
    return null;
  }
}

export function parseFloorPlanSnapshotDocument(
  d: QueryDocumentSnapshot | DocumentSnapshot,
): FloorPlanSnapshotDocument {
  const data = d.data() as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (!restaurantId) {
    throw new Error("floor-plan-snapshot: doc sin restaurantId");
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) {
    throw new Error("floor-plan-snapshot: doc sin name");
  }
  const schemaVersion =
    typeof data.schemaVersion === "number" &&
    Number.isFinite(data.schemaVersion) &&
    Math.floor(data.schemaVersion) === data.schemaVersion
      ? Math.floor(data.schemaVersion)
      : undefined;
  if (schemaVersion !== FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`floor-plan-snapshot: schemaVersion incompatible (${schemaVersion ?? "?"})`);
  }
  const source = data.source;
  if (source !== "manual") {
    throw new Error(`floor-plan-snapshot: source desconocida (${String(source)})`);
  }
  const floorPlan = parseFloorPlanSnapshotFloorPlan(data.floorPlan);
  const description =
    typeof data.description === "string" && data.description.trim() !== ""
      ? data.description.trim()
      : undefined;

  const createdAt = readTsMs(data, "createdAt") ?? 0;
  const updatedAt = readTsMs(data, "updatedAt") ?? createdAt;

  const createdBy =
    typeof data.createdBy === "string" && data.createdBy.trim() !== ""
      ? data.createdBy.trim()
      : undefined;
  const isArchived =
    typeof data.isArchived === "boolean" ? data.isArchived : false;
  const tableCount =
    typeof data.tableCount === "number" && Number.isFinite(data.tableCount)
      ? Math.max(0, Math.floor(data.tableCount))
      : undefined;
  const elementCount =
    typeof data.elementCount === "number" && Number.isFinite(data.elementCount)
      ? Math.max(0, Math.floor(data.elementCount))
      : undefined;

  const canonicalId =
    typeof data.id === "string" && data.id.trim() !== "" ? data.id.trim() : d.id;

  const floorPlanIdRaw = data.floorPlanId;
  const floorPlanId =
    typeof floorPlanIdRaw === "string" && floorPlanIdRaw.trim() !== ""
      ? floorPlanIdRaw.trim()
      : floorPlan.plan.id.trim();

  const kindRaw = data.kind;
  const kind: FloorPlanSnapshotKind | undefined =
    kindRaw === "preset" || kindRaw === "backup" ? kindRaw : undefined;

  const tagsRaw = data.tags;
  const tags =
    Array.isArray(tagsRaw) && tagsRaw.length > 0
      ? tagsRaw
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t !== "")
      : undefined;

  const tableGroupsRaw = data.tableGroups;
  const tableGroups =
    tableGroupsRaw != null &&
    typeof tableGroupsRaw === "object" &&
    !Array.isArray(tableGroupsRaw)
      ? (tableGroupsRaw as Record<string, string[]>)
      : undefined;

  return {
    id: canonicalId,
    restaurantId,
    name,
    ...(description !== undefined ? { description } : {}),
    createdAt,
    updatedAt,
    ...(createdBy !== undefined ? { createdBy } : {}),
    source: "manual",
    schemaVersion: FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION,
    floorPlan,
    floorPlanId,
    ...(typeof tableCount === "number" ? { tableCount } : {}),
    ...(typeof elementCount === "number" ? { elementCount } : {}),
    ...(isArchived ? { isArchived: true } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
    ...(tableGroups !== undefined ? { tableGroups } : {}),
  };
}

export async function createFloorPlanSnapshot(
  restaurantId: string,
  input: CreateFloorPlanSnapshotInput,
): Promise<string> {
  buildFloorPlanSnapshotPayload(restaurantId, input); // validation only
  const payload = buildFloorPlanSnapshotPayload(restaurantId, input);
  try {
    const ref = doc(snapshotCollectionRef(restaurantId));
    await setDoc(
      ref,
      removeUndefinedFields({
        ...(payload as unknown as DocumentData),
        id: ref.id,
        restaurantId: payload.restaurantId,
        /** Server truth para auditoría; `createdAt`/`updatedAt` numéricos siguen el brief. */
        serverSavedAt: serverTimestamp(),
      }) as DocumentData,
    );
    return ref.id;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Devuelve un snapshot completo o `null` si no existe o el tenant no coincide. */
export async function getFloorPlanSnapshot(
  restaurantId: string,
  snapshotId: string,
): Promise<FloorPlanSnapshotDocument | null> {
  const rid = assertRestaurantId(restaurantId);
  const sid = String(snapshotId ?? "").trim();
  if (!sid) return null;

  try {
    const snap = await getDoc(snapshotDocRef(rid, sid));
    if (!snap.exists()) return null;
    const mapped = parseFloorPlanSnapshotDocument(snap);
    if (mapped.restaurantId !== rid) return null;
    return mapped;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export function snapshotToSummary(
  docSnap: FloorPlanSnapshotDocument,
): FloorPlanSnapshotSummary {
  const { floorPlan: _removed, ...rest } = docSnap;
  void _removed;
  return rest;
}

/**
 * Escucha snapshots ordenados por `updatedAt` descendente.
 * Pasar `snapshot` vacío ⇒ no-op unsubscribe.
 */
export function listenFloorPlanSnapshots(
  restaurantId: string,
  callback: (snapshots: FloorPlanSnapshotDocument[]) => void,
  onError?: (error: Error) => void,
): () => void {
  let unsub: () => void = () => {};

  try {
    const rid = restaurantId.trim();
    if (!rid) {
      onError?.(new Error("floor-plan-snapshot: restaurantId obligatorio para listen"));
      return () => {};
    }

    const q = query(snapshotCollectionRef(rid), orderBy("updatedAt", "desc"));
    unsub = onSnapshot(
      q,
      (snap) => {
        try {
          const list = snap.docs
            .map((d) => tryParseFloorPlanSnapshotDocument(d))
            .filter((docSnap): docSnap is FloorPlanSnapshotDocument => docSnap != null);
          callback(list);
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
  }

  return () => unsub();
}

/** Marca `isArchived: true` y refresca `updatedAt` (no borra el documento). */
export async function archiveFloorPlanSnapshot(
  restaurantId: string,
  snapshotId: string,
): Promise<void> {
  const rid = assertRestaurantId(restaurantId);
  const sid = String(snapshotId ?? "").trim();
  if (!sid) {
    throw new Error("floor-plan-snapshot: snapshotId obligatorio");
  }
  try {
    const ref = snapshotDocRef(rid, sid);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      throw new Error("floor-plan-snapshot: snapshot no encontrado");
    }
    const data = existing.data() as Record<string, unknown>;
    const docRid =
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
    if (docRid !== rid) {
      throw new Error("floor-plan-snapshot: snapshot de otro restaurante");
    }
    await updateDoc(ref, {
      isArchived: true,
      updatedAt: Date.now(),
      serverSavedAt: serverTimestamp(),
    } as DocumentData);
  } catch (e) {
    rethrowWithMessage(e);
  }
}
