import { FirebaseError } from "firebase/app";
import {
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  collection,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  archiveFloorPlanSnapshot,
  cloneFloorPlanSnapshotEmbedded,
  createFloorPlanSnapshot,
  getFloorPlanSnapshot,
  listenFloorPlanSnapshots,
  normalizeSnapshotName,
  snapshotToSummary,
  tryParseFloorPlanSnapshotDocument,
  FLOOR_PLAN_SNAPSHOTS_SUBCOLLECTION,
  type CreateFloorPlanSnapshotInput,
  type FloorPlanSnapshotDocument,
  type FloorPlanSnapshotFloorPlan,
  type FloorPlanSnapshotKind,
  type FloorPlanSnapshotSummary,
} from "@/lib/firestore/floor-plan-snapshots";
import { getFloorPlans, entityBelongsToFloorPlan } from "@/lib/firestore/floorPlans";
import {
  TABLE_MAP_STATUS_FREE,
  getTables,
} from "@/lib/firestore/tables";
import { getZones } from "@/lib/firestore/zones";
import {
  orderDocHasActiveLinesForMapOccupancy,
} from "@/lib/firestore/order-table-occupancy";
import {
  computeLayoutRestorePlan,
  countLayoutRestoreWriteOps,
  type LayoutRestorePlan,
} from "@/lib/map/layout-restore-plan";

export const FLOOR_PLAN_LAYOUT_ACTIVATE_BLOCKED_MESSAGE =
  "No puedes activar este layout mientras hay mesas con servicio activo en este plano." as const;

export const FLOOR_PLAN_LAYOUT_ACTIVATE_PRECHECK_HINT =
  "Hay mesas con servicio activo. Cierra el servicio antes de activar este layout." as const;

/** Máximo de operaciones por batch Firestore (límite 500; margen operacional). */
export const FLOOR_PLAN_LAYOUT_BATCH_CHUNK_SIZE = 400 as const;

export const FLOOR_PLAN_LAYOUTS_CONFIG_DOC_ID = "floorPlanLayouts" as const;

export type ActiveFloorPlanLayoutEntry = {
  snapshotId: string | null;
  snapshotName: string;
  activatedAt: number;
  activatedBy?: string;
};

export type FloorPlanLayoutsConfig = {
  activeByFloorPlan: Record<string, ActiveFloorPlanLayoutEntry>;
  updatedAt: number;
};

export type SaveLayoutPresetInput = {
  name: string;
  description?: string;
  createdBy?: string;
  floorPlan: FloorPlanSnapshotFloorPlan;
  tags?: string[];
  tableGroups?: Record<string, string[]>;
  kind?: FloorPlanSnapshotKind;
};

export type DuplicateLayoutPresetInput = {
  sourceSnapshotId: string;
  name?: string;
  createdBy?: string;
};

export type ApplyFloorPlanLayoutOptions = {
  restaurantId: string;
  snapshotId: string;
  activatedBy?: string;
  /** Congela el live state actual antes de publicar el preset (kind: backup). */
  createBackupBefore?: boolean;
};

export type ApplyFloorPlanLayoutResult = {
  floorPlanId: string;
  snapshotId: string;
  writeOps: number;
  backupSnapshotId?: string;
};

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("floor-plan-layout: restaurantId obligatorio");
  }
  return rid;
}

function floorPlanLayoutsConfigRef(restaurantId: string) {
  return doc(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    "config",
    FLOOR_PLAN_LAYOUTS_CONFIG_DOC_ID,
  );
}

function parseActiveFloorPlanLayoutEntry(
  raw: unknown,
): ActiveFloorPlanLayoutEntry | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const snapshotIdRaw = data.snapshotId;
  const snapshotId =
    snapshotIdRaw === null
      ? null
      : typeof snapshotIdRaw === "string" && snapshotIdRaw.trim() !== ""
        ? snapshotIdRaw.trim()
        : null;
  const snapshotName =
    typeof data.snapshotName === "string" ? data.snapshotName.trim() : "";
  const activatedAt =
    typeof data.activatedAt === "number" && Number.isFinite(data.activatedAt)
      ? data.activatedAt
      : 0;
  const activatedBy =
    typeof data.activatedBy === "string" && data.activatedBy.trim() !== ""
      ? data.activatedBy.trim()
      : undefined;

  if (!snapshotName && snapshotId === null) {
    return null;
  }

  return {
    snapshotId,
    snapshotName: snapshotName || "Sin preset",
    activatedAt,
    ...(activatedBy !== undefined ? { activatedBy } : {}),
  };
}

function parseFloorPlanLayoutsConfig(
  data: Record<string, unknown> | undefined,
): FloorPlanLayoutsConfig {
  const activeByFloorPlan: Record<string, ActiveFloorPlanLayoutEntry> = {};
  const rawMap = data?.activeByFloorPlan;
  if (rawMap != null && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [key, value] of Object.entries(rawMap as Record<string, unknown>)) {
      const planId = String(key ?? "").trim();
      if (!planId) continue;
      const entry = parseActiveFloorPlanLayoutEntry(value);
      if (entry) activeByFloorPlan[planId] = entry;
    }
  }
  const updatedAt =
    typeof data?.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : 0;
  return { activeByFloorPlan, updatedAt };
}

/** Resuelve el `floorPlanId` de un snapshot (denormalizado o embebido). */
export function resolveSnapshotFloorPlanId(
  snapshot: Pick<FloorPlanSnapshotDocument, "floorPlanId" | "floorPlan">,
): string {
  const denorm =
    typeof snapshot.floorPlanId === "string" ? snapshot.floorPlanId.trim() : "";
  if (denorm) return denorm;
  return String(snapshot.floorPlan.plan.id ?? "").trim();
}

/**
 * ¿Hay servicio activo (misma regla que ocupación TPV) en mesas de este plano?
 * Lectura puntual: tables + floorPlans + orders por restaurantId, filtro cliente.
 */
export async function floorPlanHasActiveTableService(
  restaurantId: string,
  floorPlanId: string,
): Promise<boolean> {
  const rid = restaurantId.trim();
  const pid = floorPlanId.trim();
  if (!rid || !pid) return false;

  const [tables, plans] = await Promise.all([getTables(rid), getFloorPlans(rid)]);

  const planTableIds = new Set<string>();
  for (const table of tables) {
    if (table.isActive === false) continue;
    if (!entityBelongsToFloorPlan(table, pid, plans)) continue;
    const id = String(table.id ?? "").trim();
    if (id) planTableIds.add(id);
  }

  if (planTableIds.size === 0) return false;

  const ordersSnap = await getDocs(
    query(collection(db, "orders"), where("restaurantId", "==", rid)),
  );

  for (const orderDoc of ordersSnap.docs) {
    const data = orderDoc.data() as {
      restaurantId?: string;
      tableId?: string | null;
      status?: unknown;
      items?: unknown;
      total?: unknown;
    };
    const orderRid =
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
    if (orderRid && orderRid !== rid) continue;
    if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
    const tableId =
      typeof data.tableId === "string" ? data.tableId.trim() : "";
    if (tableId && planTableIds.has(tableId)) return true;
  }

  return false;
}

/** Lanza si el plano tiene comandas/servicio activo (guardarraíl antes de activate). */
export async function assertFloorPlanLayoutCanActivate(
  restaurantId: string,
  floorPlanId: string,
): Promise<void> {
  const blocked = await floorPlanHasActiveTableService(restaurantId, floorPlanId);
  if (blocked) {
    throw new Error(FLOOR_PLAN_LAYOUT_ACTIVATE_BLOCKED_MESSAGE);
  }
}

function assertSnapshotForLayoutApply(
  restaurantId: string,
  snapshot: FloorPlanSnapshotDocument,
): string {
  const rid = assertRestaurantId(restaurantId);
  if (snapshot.restaurantId !== rid) {
    throw new Error("floor-plan-layout: snapshot de otro restaurante");
  }
  if (snapshot.isArchived === true) {
    throw new Error("floor-plan-layout: snapshot archivado");
  }
  const floorPlanId = resolveSnapshotFloorPlanId(snapshot);
  if (!floorPlanId) {
    throw new Error("floor-plan-layout: snapshot sin floorPlanId");
  }
  const embeddedPlanId = String(snapshot.floorPlan.plan.id ?? "").trim();
  if (embeddedPlanId && embeddedPlanId !== floorPlanId) {
    throw new Error("floor-plan-layout: floorPlanId incoherente con plan embebido");
  }
  return floorPlanId;
}

function buildElementWritePayload(
  op: LayoutRestorePlan["elementCreates"][number] | LayoutRestorePlan["elementUpdates"][number],
  mode: "create" | "update",
): DocumentData {
  const { payload, clearZone } = op;
  const docPayload: DocumentData = {
    id: op.id,
    restaurantId: "restaurantId" in payload ? payload.restaurantId : undefined,
    name: payload.name,
    type: payload.type,
    tableShape: payload.tableShape,
    seats: payload.seats,
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height,
    isActive: true,
    locked: payload.locked === true,
    updatedAt: serverTimestamp(),
  };

  if (mode === "create") {
    docPayload.status = TABLE_MAP_STATUS_FREE;
    docPayload.createdAt = serverTimestamp();
  }

  if (payload.floorPlanId && payload.floorPlanId.trim()) {
    docPayload.floorPlanId = payload.floorPlanId.trim();
  } else if (mode === "update") {
    docPayload.floorPlanId = deleteField();
  }

  if (!clearZone && payload.zoneId && payload.zoneName) {
    docPayload.zoneId = payload.zoneId;
    docPayload.zoneName = payload.zoneName;
    docPayload.zone = payload.zone ?? payload.zoneName;
  } else if (mode === "update") {
    docPayload.zoneId = deleteField();
    docPayload.zoneName = deleteField();
    docPayload.zone = deleteField();
  }

  return docPayload;
}

function buildZoneWritePayload(
  op: LayoutRestorePlan["zoneCreates"][number] | LayoutRestorePlan["zoneUpdates"][number],
  mode: "create" | "update",
): DocumentData {
  const { payload } = op;
  const docPayload: DocumentData = {
    name: payload.name,
    updatedAt: serverTimestamp(),
  };

  if (mode === "create") {
    const createOp = op as LayoutRestorePlan["zoneCreates"][number];
    docPayload.id = createOp.id;
    docPayload.restaurantId = createOp.payload.restaurantId;
    docPayload.createdAt = serverTimestamp();
  }

  if (payload.floorPlanId && payload.floorPlanId.trim()) {
    docPayload.floorPlanId = payload.floorPlanId.trim();
  } else if (mode === "update") {
    docPayload.floorPlanId = deleteField();
  }

  if (payload.color && payload.color.trim()) {
    docPayload.color = payload.color.trim();
  } else if (mode === "update") {
    docPayload.color = deleteField();
  }

  const geomKeys = ["x", "y", "width", "height"] as const;
  for (const key of geomKeys) {
    const v = payload[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      docPayload[key] = Math.round(v);
    } else if (mode === "update") {
      docPayload[key] = deleteField();
    }
  }

  return docPayload;
}

type RestoreBatchOp =
  | { kind: "floorPlan"; ref: ReturnType<typeof doc>; data: DocumentData; merge?: boolean }
  | { kind: "elementCreate"; ref: ReturnType<typeof doc>; data: DocumentData }
  | { kind: "elementUpdate"; ref: ReturnType<typeof doc>; data: DocumentData }
  | { kind: "elementSoftDisable"; ref: ReturnType<typeof doc>; data: DocumentData }
  | { kind: "zoneCreate"; ref: ReturnType<typeof doc>; data: DocumentData }
  | { kind: "zoneUpdate"; ref: ReturnType<typeof doc>; data: DocumentData };

function collectRestoreBatchOps(plan: LayoutRestorePlan): RestoreBatchOp[] {
  const ops: RestoreBatchOp[] = [];

  if (plan.floorPlanUpdate) {
    const data: DocumentData = { updatedAt: serverTimestamp() };
    if (plan.floorPlanUpdate.width !== undefined) {
      data.width = plan.floorPlanUpdate.width;
    }
    if (plan.floorPlanUpdate.height !== undefined) {
      data.height = plan.floorPlanUpdate.height;
    }
    ops.push({
      kind: "floorPlan",
      ref: doc(db, "floorPlans", plan.floorPlanUpdate.floorPlanId),
      data,
      merge: true,
    });
  }

  for (const create of plan.elementCreates) {
    ops.push({
      kind: "elementCreate",
      ref: doc(db, "tables", create.id),
      data: buildElementWritePayload(create, "create"),
    });
  }

  for (const update of plan.elementUpdates) {
    ops.push({
      kind: "elementUpdate",
      ref: doc(db, "tables", update.id),
      data: buildElementWritePayload(update, "update"),
    });
  }

  for (const disable of plan.elementSoftDisables) {
    ops.push({
      kind: "elementSoftDisable",
      ref: doc(db, "tables", disable.id),
      data: {
        isActive: false,
        updatedAt: serverTimestamp(),
      },
    });
  }

  for (const create of plan.zoneCreates) {
    ops.push({
      kind: "zoneCreate",
      ref: doc(db, "zones", create.id),
      data: buildZoneWritePayload(create, "create"),
    });
  }

  for (const update of plan.zoneUpdates) {
    ops.push({
      kind: "zoneUpdate",
      ref: doc(db, "zones", update.id),
      data: buildZoneWritePayload(update, "update"),
    });
  }

  return ops;
}

async function commitRestoreBatchOps(ops: RestoreBatchOp[]): Promise<void> {
  if (ops.length === 0) return;

  for (let i = 0; i < ops.length; i += FLOOR_PLAN_LAYOUT_BATCH_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + FLOOR_PLAN_LAYOUT_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === "floorPlan") {
        batch.set(op.ref, op.data, { merge: op.merge ?? true });
      } else if (op.kind === "elementCreate") {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.kind === "elementUpdate") {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.kind === "elementSoftDisable") {
        batch.update(op.ref, op.data);
      } else if (op.kind === "zoneCreate") {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.kind === "zoneUpdate") {
        batch.update(op.ref, op.data);
      }
    }
    await batch.commit();
  }
}

function buildLiveSnapshotFloorPlan(
  floorPlanId: string,
  allPlans: Awaited<ReturnType<typeof getFloorPlans>>,
  liveElements: Awaited<ReturnType<typeof getTables>>,
  liveZones: Awaited<ReturnType<typeof getZones>>,
): FloorPlanSnapshotFloorPlan {
  const plan = allPlans.find((p) => p.id === floorPlanId);
  if (!plan) {
    throw new Error("floor-plan-layout: plano live no encontrado");
  }

  const elements = liveElements.filter((el) =>
    entityBelongsToFloorPlan(el, floorPlanId, allPlans),
  );

  const zones = liveZones.filter((z) =>
    entityBelongsToFloorPlan(z, floorPlanId, allPlans),
  );

  return {
    plan: { ...plan },
    elements: elements.map((el) => ({ ...el })),
    zones: zones.map((z) => ({ ...z })),
  };
}

/** Guarda un preset de layout (snapshot reutilizable, sin publicar). */
export async function saveLayoutPreset(
  restaurantId: string,
  input: SaveLayoutPresetInput,
): Promise<string> {
  const rid = assertRestaurantId(restaurantId);
  const floorPlanId = String(input.floorPlan.plan.id ?? "").trim();
  if (!floorPlanId) {
    throw new Error("floor-plan-layout: floorPlan.plan.id obligatorio");
  }

  const payload: CreateFloorPlanSnapshotInput = {
    name: input.name,
    description: input.description,
    createdBy: input.createdBy,
    floorPlan: cloneFloorPlanSnapshotEmbedded(input.floorPlan),
    floorPlanId,
    kind: input.kind ?? "preset",
    tags: input.tags,
    tableGroups: input.tableGroups,
  };

  try {
    return await createFloorPlanSnapshot(rid, payload);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Duplica un preset existente (nuevo doc, mismo blob embebido). */
export async function duplicateLayoutPreset(
  restaurantId: string,
  input: DuplicateLayoutPresetInput,
): Promise<string> {
  const rid = assertRestaurantId(restaurantId);
  const sourceId = String(input.sourceSnapshotId ?? "").trim();
  if (!sourceId) {
    throw new Error("floor-plan-layout: sourceSnapshotId obligatorio");
  }

  try {
    const source = await getFloorPlanSnapshot(rid, sourceId);
    if (!source) {
      throw new Error("floor-plan-layout: preset origen no encontrado");
    }
    if (source.isArchived === true) {
      throw new Error("floor-plan-layout: preset origen archivado");
    }

    const baseName = normalizeSnapshotName(input.name ?? `Copia de ${source.name}`);
    const name = baseName || `Copia de ${source.name}`;

    return await createFloorPlanSnapshot(rid, {
      name,
      description: source.description,
      createdBy: input.createdBy,
      floorPlan: cloneFloorPlanSnapshotEmbedded(source.floorPlan),
      floorPlanId: resolveSnapshotFloorPlanId(source),
      kind: source.kind === "backup" ? "backup" : "preset",
      tags: source.tags,
      tableGroups: source.tableGroups,
    });
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Archiva un preset (soft-delete; delega en floor-plan-snapshots). */
export async function archiveLayoutPreset(
  restaurantId: string,
  snapshotId: string,
): Promise<void> {
  try {
    await archiveFloorPlanSnapshot(assertRestaurantId(restaurantId), snapshotId);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Lee el preset activo de un plano; `null` si no hay config o entrada. */
export async function getActiveLayout(
  restaurantId: string,
  floorPlanId: string,
): Promise<ActiveFloorPlanLayoutEntry | null> {
  const rid = assertRestaurantId(restaurantId);
  const planId = String(floorPlanId ?? "").trim();
  if (!planId) return null;

  try {
    const snap = await getDoc(floorPlanLayoutsConfigRef(rid));
    if (!snap.exists()) return null;
    const config = parseFloorPlanLayoutsConfig(snap.data() as Record<string, unknown>);
    return config.activeByFloorPlan[planId] ?? null;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Lee la config completa de layouts activos del restaurante. */
export async function getFloorPlanLayoutsConfig(
  restaurantId: string,
): Promise<FloorPlanLayoutsConfig> {
  const rid = assertRestaurantId(restaurantId);
  try {
    const snap = await getDoc(floorPlanLayoutsConfigRef(rid));
    if (!snap.exists()) {
      return { activeByFloorPlan: {}, updatedAt: 0 };
    }
    return parseFloorPlanLayoutsConfig(snap.data() as Record<string, unknown>);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Marca el preset activo para un plano (sin publicar geometría). */
export async function setActiveLayout(
  restaurantId: string,
  floorPlanId: string,
  entry: ActiveFloorPlanLayoutEntry,
): Promise<void> {
  const rid = assertRestaurantId(restaurantId);
  const planId = String(floorPlanId ?? "").trim();
  if (!planId) {
    throw new Error("floor-plan-layout: floorPlanId obligatorio");
  }

  const snapshotName = String(entry.snapshotName ?? "").trim() || "Sin preset";
  const activatedAt =
    typeof entry.activatedAt === "number" && Number.isFinite(entry.activatedAt)
      ? entry.activatedAt
      : Date.now();
  const activatedBy =
    typeof entry.activatedBy === "string" && entry.activatedBy.trim() !== ""
      ? entry.activatedBy.trim()
      : undefined;

  const normalizedEntry: ActiveFloorPlanLayoutEntry = {
    snapshotId:
      entry.snapshotId === null
        ? null
        : typeof entry.snapshotId === "string" && entry.snapshotId.trim() !== ""
          ? entry.snapshotId.trim()
          : null,
    snapshotName,
    activatedAt,
    ...(activatedBy !== undefined ? { activatedBy } : {}),
  };

  try {
    const existing = await getFloorPlanLayoutsConfig(rid);
    await setDoc(
      floorPlanLayoutsConfigRef(rid),
      {
        activeByFloorPlan: {
          ...existing.activeByFloorPlan,
          [planId]: normalizedEntry,
        },
        updatedAt: Date.now(),
      } as DocumentData,
      { merge: true },
    );
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/**
 * Publica un preset sobre el live state (restore in-place por id).
 * No modifica status, waiter, orders ni tableGroups.
 */
export async function applyFloorPlanLayout(
  options: ApplyFloorPlanLayoutOptions,
): Promise<ApplyFloorPlanLayoutResult> {
  const rid = assertRestaurantId(options.restaurantId);
  const snapshotId = String(options.snapshotId ?? "").trim();
  if (!snapshotId) {
    throw new Error("floor-plan-layout: snapshotId obligatorio");
  }

  try {
    const snapshot = await getFloorPlanSnapshot(rid, snapshotId);
    if (!snapshot) {
      throw new Error("floor-plan-layout: preset no encontrado");
    }

    const floorPlanId = assertSnapshotForLayoutApply(rid, snapshot);

    const [allPlans, liveElements, liveZones] = await Promise.all([
      getFloorPlans(rid),
      getTables(rid),
      getZones(rid),
    ]);

    let backupSnapshotId: string | undefined;

    if (options.createBackupBefore === true) {
      const liveFloorPlan = buildLiveSnapshotFloorPlan(
        floorPlanId,
        allPlans,
        liveElements,
        liveZones,
      );
      backupSnapshotId = await saveLayoutPreset(rid, {
        name: `Antes de ${snapshot.name}`,
        createdBy: options.activatedBy,
        floorPlan: liveFloorPlan,
        kind: "backup",
      });
    }

    const plan = computeLayoutRestorePlan({
      snapshot: snapshot.floorPlan,
      liveElements,
      liveZones,
      allFloorPlans: allPlans,
    });

    const batchOps = collectRestoreBatchOps(plan);
    await commitRestoreBatchOps(batchOps);

    await setActiveLayout(rid, floorPlanId, {
      snapshotId,
      snapshotName: snapshot.name,
      activatedAt: Date.now(),
      ...(options.activatedBy ? { activatedBy: options.activatedBy } : {}),
    });

    return {
      floorPlanId,
      snapshotId,
      writeOps: countLayoutRestoreWriteOps(plan),
      ...(backupSnapshotId !== undefined ? { backupSnapshotId } : {}),
    };
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/** Expone el cálculo puro del restore plan (útil para tests / preview). */
export { computeLayoutRestorePlan, countLayoutRestoreWriteOps };

function isFirestoreIndexError(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "failed-precondition";
}

function isFirestorePermissionError(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "permission-denied";
}

function mapSnapshotDocs(docs: QueryDocumentSnapshot[]): FloorPlanSnapshotDocument[] {
  return docs
    .map((d) => tryParseFloorPlanSnapshotDocument(d))
    .filter((docSnap): docSnap is FloorPlanSnapshotDocument => docSnap != null);
}

function filterLayoutPresetSummaries(
  snapshots: FloorPlanSnapshotDocument[],
  floorPlanId: string,
): FloorPlanSnapshotSummary[] {
  const pid = floorPlanId.trim();
  return snapshots
    .filter((snap) => {
      if (snap.isArchived === true) return false;
      if (snap.kind === "backup") return false;
      return resolveSnapshotFloorPlanId(snap) === pid;
    })
    .map((snap) => snapshotToSummary(snap));
}

function snapshotCollectionRef(restaurantId: string) {
  return collection(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    FLOOR_PLAN_SNAPSHOTS_SUBCOLLECTION,
  );
}

/**
 * Escucha presets de layout del plano (sin blob embebido).
 * Intenta query filtrada; si falta índice Firestore, cae a listen global + filtro cliente.
 */
export function listenFloorPlanLayoutPresets(
  restaurantId: string,
  floorPlanId: string,
  callback: (presets: FloorPlanSnapshotSummary[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  const pid = floorPlanId.trim();
  if (!rid || !pid) {
    return () => {};
  }

  let fallbackUnsub: (() => void) | null = null;
  let filteredUnsub: (() => void) | null = null;
  let cancelled = false;

  const emitFiltered = (docs: FloorPlanSnapshotDocument[]) => {
    if (cancelled) return;
    callback(filterLayoutPresetSummaries(docs, pid));
  };

  const startFallbackListen = () => {
    if (cancelled || fallbackUnsub) return;
    fallbackUnsub = listenFloorPlanSnapshots(
      rid,
      (docs) => emitFiltered(docs),
      (err) => {
        if (!cancelled) {
          onError?.(
            new Error(
              "No se pudieron cargar los layouts. Comprueba permisos o crea el índice Firestore floorPlanId + isArchived + updatedAt.",
              { cause: err },
            ),
          );
        }
      },
    );
  };

  try {
    const q = query(
      snapshotCollectionRef(rid),
      where("floorPlanId", "==", pid),
      where("isArchived", "==", false),
      orderBy("updatedAt", "desc"),
    );
    filteredUnsub = onSnapshot(
      q,
      (snap) => {
        emitFiltered(mapSnapshotDocs(snap.docs));
      },
      (err) => {
        if (isFirestoreIndexError(err)) {
          filteredUnsub?.();
          filteredUnsub = null;
          startFallbackListen();
          onError?.(
            new Error(
              "Índice Firestore pendiente para layouts; usando listado filtrado en cliente.",
              { cause: err },
            ),
          );
          return;
        }
        if (isFirestorePermissionError(err) && !fallbackUnsub) {
          filteredUnsub?.();
          filteredUnsub = null;
          startFallbackListen();
        }
        onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    );
  } catch (e) {
    startFallbackListen();
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  return () => {
    cancelled = true;
    filteredUnsub?.();
    fallbackUnsub?.();
  };
}

/** Escucha la config de layout activo del restaurante. */
export function listenFloorPlanLayoutsConfig(
  restaurantId: string,
  callback: (config: FloorPlanLayoutsConfig) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid) return () => {};

  return onSnapshot(
    floorPlanLayoutsConfigRef(rid),
    (snap) => {
      if (!snap.exists()) {
        callback({ activeByFloorPlan: {}, updatedAt: 0 });
        return;
      }
      callback(parseFloorPlanLayoutsConfig(snap.data() as Record<string, unknown>));
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
}
