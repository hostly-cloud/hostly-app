import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db, firebaseEnvDebug, isFirebaseConfigured } from "@/lib/firebase/client";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import {
  getOperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  isDecorativePlanElementType,
  TABLE_MAP_STATUS_FREE,
  type PlanElementType,
  type TableVisualShape,
} from "@/lib/firestore/tables";

export type SalaEditorV2PublicationSkippedItem = {
  id: string;
  name: string;
  reason:
    | "missing_legacy_table_id"
    | "duplicate_legacy_table_id"
    | "legacy_table_not_found"
    | "restaurant_mismatch";
};

export type SalaEditorV2PublicationFloorPlanWarning = {
  id: string;
  name: string;
  legacyTableId: string;
  floorPlanId: string;
};

export type SalaEditorV2PublicationSkippedZone = {
  id: string;
  name: string;
  reason:
    | "hidden"
    | "missing_space"
    | "unsafe_floor_plan"
    | "invalid_geometry"
    | "duplicate_zone_id"
    | "legacy_zone_not_found"
    | "restaurant_mismatch";
};

export type SalaEditorV2PublicationSkippedDecorative = {
  id: string;
  name: string;
  reason:
    | "hidden"
    | "missing_space"
    | "unsafe_floor_plan"
    | "invalid_geometry"
    | "duplicate_element_id"
    | "legacy_table_not_found"
    | "restaurant_mismatch"
    | "unsupported_type";
};

export type SalaEditorV2PublicationSkippedLegacyDecorative = {
  id: string;
  name: string;
  type: string;
  floorPlanId: string | null;
  reason:
    | "already_inactive"
    | "v2_current_decorative"
    | "invalid_restaurant"
    | "not_decorative"
    | "protected_operational_type";
};

export type SalaEditorV2PublicationDecorativeAuditItem = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  floorPlanId: string | null;
  source: string | null;
  editorV2ElementId: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  belongsToPublishedPlan: boolean;
  action: "deactivate" | "skip";
  reason:
    | "legacy_visual_replaced"
    | "already_inactive"
    | "v2_current_decorative"
    | "invalid_restaurant"
    | "not_decorative"
    | "protected_operational_type";
};

export type SalaEditorV2PublicationResult = {
  floorPlansUpdated: number;
  tablesUpdated: number;
  zonesUpdated: number;
  decorativeTablesUpdated: number;
  decorativeLegacyFound: number;
  decorativeLegacyDeactivated: number;
  skippedTables: SalaEditorV2PublicationSkippedItem[];
  skippedZones: SalaEditorV2PublicationSkippedZone[];
  skippedDecorativeTables: SalaEditorV2PublicationSkippedDecorative[];
  skippedLegacyDecorativeTables: SalaEditorV2PublicationSkippedLegacyDecorative[];
  decorativeAudit: SalaEditorV2PublicationDecorativeAuditItem[];
  unsafeFloorPlanTables: SalaEditorV2PublicationFloorPlanWarning[];
};

const FIRESTORE_BATCH_LIMIT = 450;

type PublicationWrite = {
  ref: ReturnType<typeof doc>;
  data: DocumentData;
  mode: "update" | "setMerge";
};

type DecorativePublicationDraft = {
  id: string;
  name: string;
  sourceId: string;
  sourceType: string;
  spaceId: string;
  legacyType: PlanElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
  visible?: boolean;
  locked?: boolean;
};

function assertRestaurantId(restaurantId: string): string {
  const rid = String(restaurantId ?? "").trim();
  if (!rid) {
    throw new Error("sala-editor-publication: restaurantId no disponible");
  }
  return rid;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function positiveRoundedNumber(value: unknown): number | null {
  const number = positiveFiniteNumber(value);
  return number === null ? null : Math.round(number);
}

function readLegacyTableId(metadata: Record<string, unknown>): string {
  return stringOrEmpty(metadata.legacyTableId);
}

function readLegacyFloorPlanId(metadata: Record<string, unknown>): string {
  return stringOrEmpty(metadata.legacyFloorPlanId);
}

function readLegacyZoneId(metadata: Record<string, unknown> | undefined): string {
  return stringOrEmpty(metadata?.legacyZoneId);
}

function readTableShape(metadata: Record<string, unknown>): TableVisualShape | null {
  const shape = metadata.tableShape;
  if (shape === "round" || shape === "square") return shape;
  return null;
}

function stableLegacyZoneIdFromV2Id(zoneId: string): string {
  const stable = zoneId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stable ? `v2-zone-${stable}` : "";
}

function stableLegacyDecorativeId(sourceType: string, elementId: string): string {
  const type = sourceType
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stableId = elementId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return type && stableId ? `v2-map-${type}-${stableId}` : "";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidGeometry(
  item: Pick<DecorativePublicationDraft, "x" | "y" | "width" | "height">,
): boolean {
  return (
    finiteNumber(item.x) &&
    finiteNumber(item.y) &&
    finiteNumber(item.width) &&
    finiteNumber(item.height) &&
    item.width > 0 &&
    item.height > 0
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPlainMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const metadata = data.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function readPublicationSource(data: Record<string, unknown>): string | null {
  const source = stringOrEmpty(data.source) || stringOrEmpty(readPlainMetadata(data).source);
  return source || null;
}

function readPublicationEditorV2ElementId(data: Record<string, unknown>): string | null {
  const editorV2ElementId =
    stringOrEmpty(data.editorV2ElementId) ||
    stringOrEmpty(readPlainMetadata(data).editorV2ElementId);
  return editorV2ElementId || null;
}

function isProtectedOperationalPlanElementType(type: string): boolean {
  return type === "table" || type === "sunbed" || type === "bed" || type === "custom";
}

function logPublisherTablesFirestoreAudit(params: {
  restaurantId: string;
  docs: Array<{ id: string; data: Record<string, unknown> }>;
}): void {
  console.groupCollapsed("[SalaEditorV2] Firestore audit Publisher tables");
  console.info("[SalaEditorV2] Firestore audit Publisher tables resumen", {
    firebaseProjectId: firebaseEnvDebug.projectId,
    restaurantId: params.restaurantId,
    collectionPath: "tables",
    query: `collection(db, "tables") where("restaurantId", "==", "${params.restaurantId}")`,
    totalTablesFound: params.docs.length,
  });
  console.table(
    params.docs.slice(0, 40).map(({ id, data }) => ({
      id,
      name: stringOrEmpty(data.name),
      type: stringOrEmpty(data.type) || "table",
      isActive: data.isActive !== false,
      floorPlanId: stringOrEmpty(data.floorPlanId),
      source: readPublicationSource(data) ?? "",
      x: numberOrNull(data.x) ?? "",
      y: numberOrNull(data.y) ?? "",
      width: numberOrNull(data.width) ?? "",
      height: numberOrNull(data.height) ?? "",
    })),
  );
  console.groupEnd();
}

function resolveStructuralLegacyType(kind: string): PlanElementType | null {
  if (kind === "wall" || kind === "glass" || kind === "divider" || kind === "separator") {
    return "wall";
  }
  if (kind === "bar") return "bar";
  if (kind === "door") return "door";
  if (kind === "squareColumn" || kind === "roundColumn" || kind === "decoration") {
    return "column";
  }
  if (kind === "planter") return "planter";
  return null;
}

function resolveOperationalDecorativeLegacyType(elementType: string): PlanElementType | null {
  if (elementType === "BAR_STRAIGHT" || elementType === "BAR_L") return "bar";
  return null;
}

function resolveLandscapeLegacyType(kind: string): PlanElementType | null {
  if (
    kind === "rectangularPlanter" ||
    kind === "roundPlanter" ||
    kind === "palm" ||
    kind === "olive"
  ) {
    return "planter";
  }
  return null;
}

function resolveSurfaceLegacyType(material: string): PlanElementType | null {
  if (material === "water") return "pool";
  return null;
}

function wallSegmentToDecorativeDraft(
  wall: SalaEditorDocument["walls"][number],
): DecorativePublicationDraft {
  const x = Math.min(wall.x1, wall.x2);
  const y = Math.min(wall.y1, wall.y2);
  return {
    id: readLegacyTableId(wall.metadata ?? {}) || stableLegacyDecorativeId("wall", wall.id),
    name: "Pared",
    sourceId: wall.id,
    sourceType: "wall",
    spaceId: wall.espacioId,
    legacyType: "wall",
    x,
    y,
    width: Math.max(12, Math.abs(wall.x2 - wall.x1)),
    height: Math.max(12, Math.abs(wall.y2 - wall.y1)),
    metadata: wall.metadata,
    locked: true,
  };
}

function wallAttachmentToDecorativeDraft(params: {
  attachment: SalaEditorDocument["wallAttachments"][number];
  wall: SalaEditorDocument["walls"][number];
}): DecorativePublicationDraft | null {
  const { attachment, wall } = params;
  if (
    attachment.kind !== "door" &&
    attachment.kind !== "double-door" &&
    attachment.kind !== "sliding-door" &&
    attachment.kind !== "opening" &&
    attachment.kind !== "arch"
  ) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, attachment.positionRatio));
  const centerX = wall.x1 + (wall.x2 - wall.x1) * ratio;
  const centerY = wall.y1 + (wall.y2 - wall.y1) * ratio;
  return {
    id:
      readLegacyTableId(attachment.metadata ?? {}) ||
      stableLegacyDecorativeId("wall-attachment-door", attachment.id),
    name: "Puerta",
    sourceId: attachment.id,
    sourceType: `wallAttachment:${attachment.kind}`,
    spaceId: wall.espacioId,
    legacyType: "door",
    x: Math.round(centerX - 18),
    y: Math.round(centerY - 56),
    width: 36,
    height: 112,
    metadata: attachment.metadata,
    locked: true,
  };
}

function buildDecorativeDrafts(
  document: SalaEditorDocument,
): DecorativePublicationDraft[] {
  const drafts: DecorativePublicationDraft[] = [];
  const wallsById = new Map(document.walls.map((wall) => [wall.id, wall]));

  for (const wall of document.walls) {
    drafts.push(wallSegmentToDecorativeDraft(wall));
  }

  for (const attachment of document.wallAttachments) {
    const wall = wallsById.get(attachment.wallId);
    if (!wall) continue;
    const draft = wallAttachmentToDecorativeDraft({ attachment, wall });
    if (draft) drafts.push(draft);
  }

  for (const element of document.structuralElements) {
    const legacyType = resolveStructuralLegacyType(element.kind);
    const label = stringOrEmpty(element.config?.label) || element.kind;
    drafts.push({
      id:
        readLegacyTableId(element.metadata ?? {}) ||
        (legacyType ? stableLegacyDecorativeId(element.kind, element.id) : ""),
      name: label,
      sourceId: element.id,
      sourceType: `structural:${element.kind}`,
      spaceId: element.espacioId,
      legacyType: legacyType ?? "custom",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      metadata: element.metadata,
      locked: element.locked === true,
    });
  }

  for (const instance of document.operationalElementInstances) {
    if (instance.elementType === "TABLE") continue;
    const legacyType = resolveOperationalDecorativeLegacyType(instance.elementType);
    const size = getOperationalInstanceCanvasSize(instance);
    drafts.push({
      id:
        readLegacyTableId(instance.metadata) ||
        (legacyType ? stableLegacyDecorativeId(instance.elementType, instance.id) : ""),
      name: instance.name.trim() || instance.elementType,
      sourceId: instance.id,
      sourceType: `operational:${instance.elementType}`,
      spaceId: instance.spaceId,
      legacyType: legacyType ?? "custom",
      x: Math.round(instance.position.x - size.width / 2),
      y: Math.round(instance.position.y - size.height / 2),
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
      metadata: instance.metadata,
      visible: instance.visible !== false && instance.enabled !== false,
      locked: false,
    });
  }

  for (const landscape of document.landscapeElements) {
    const legacyType = resolveLandscapeLegacyType(landscape.kind);
    drafts.push({
      id:
        readLegacyTableId(landscape.metadata ?? {}) ||
        (legacyType ? stableLegacyDecorativeId(landscape.kind, landscape.id) : ""),
      name: landscape.kind,
      sourceId: landscape.id,
      sourceType: `landscape:${landscape.kind}`,
      spaceId: landscape.espacioId,
      legacyType: legacyType ?? "custom",
      x: landscape.x,
      y: landscape.y,
      width: landscape.width,
      height: landscape.height,
      metadata: landscape.metadata,
      visible: landscape.visible !== false,
      locked: landscape.locked === true,
    });
  }

  for (const surface of document.surfaceObjects) {
    const legacyType = resolveSurfaceLegacyType(surface.material);
    drafts.push({
      id: legacyType ? stableLegacyDecorativeId(surface.material, surface.id) : "",
      name: surface.material === "water" ? "Agua" : surface.material,
      sourceId: surface.id,
      sourceType: `surface:${surface.material}`,
      spaceId: surface.espacioId,
      legacyType: legacyType ?? "custom",
      x: surface.x,
      y: surface.y,
      width: surface.width,
      height: surface.height,
      visible: surface.visible !== false,
      locked: surface.locked === true,
    });
  }

  return drafts;
}

function chunkDocumentDataWrites(
  writes: PublicationWrite[],
): PublicationWrite[][] {
  const chunks: PublicationWrite[][] = [];
  for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
    chunks.push(writes.slice(i, i + FIRESTORE_BATCH_LIMIT));
  }
  return chunks;
}

async function commitUpdateWrites(
  writes: PublicationWrite[],
): Promise<void> {
  for (const chunk of chunkDocumentDataWrites(writes)) {
    const batch = writeBatch(db);
    for (const write of chunk) {
      if (write.mode === "setMerge") {
        batch.set(write.ref, write.data, { merge: true });
      } else {
        batch.update(write.ref, write.data);
      }
    }
    await batch.commit();
  }
}

async function commitDecorativeWritesWithTrace(
  writes: PublicationWrite[],
): Promise<void> {
  console.groupCollapsed("[SalaEditorV2] Publisher decorativos: escritura Firestore");
  console.info("[SalaEditorV2] Publisher decorativos que llegan a escritura", {
    count: writes.length,
  });

  try {
    for (const write of writes) {
      const row = {
        id: write.ref.id,
        type: stringOrEmpty(write.data.type),
        floorPlanId: stringOrEmpty(write.data.floorPlanId),
        documentPath: write.ref.path,
      };
      console.info("[SalaEditorV2] Publisher decorativo setDoc intento", row);

      try {
        if (write.mode === "setMerge") {
          await setDoc(write.ref, write.data, { merge: true });
        } else {
          await updateDoc(write.ref, write.data);
        }
        console.info("[SalaEditorV2] Publisher decorativo setDoc OK", row);
      } catch (error) {
        console.error("[SalaEditorV2] Publisher decorativo setDoc ERROR", {
          ...row,
          error,
        });
        throw error;
      }
    }
  } finally {
    console.groupEnd();
  }
}

export async function publishSalaEditorV2Phase1ToLegacy(params: {
  restaurantId: string;
  document: SalaEditorDocument;
  replaceLegacyVisualMap?: boolean;
}): Promise<SalaEditorV2PublicationResult> {
  if (!isFirebaseConfigured) {
    return {
      floorPlansUpdated: 0,
      tablesUpdated: 0,
      zonesUpdated: 0,
      decorativeTablesUpdated: 0,
      decorativeLegacyFound: 0,
      decorativeLegacyDeactivated: 0,
      skippedTables: [],
      skippedZones: [],
      skippedDecorativeTables: [],
      skippedLegacyDecorativeTables: [],
      decorativeAudit: [],
      unsafeFloorPlanTables: [],
    };
  }

  const restaurantId = assertRestaurantId(params.restaurantId);
  const document = params.document;
  if (document.restaurantId !== restaurantId) {
    throw new Error("sala-editor-publication: document.restaurantId no coincide");
  }

  const floorPlanWrites: PublicationWrite[] = [];
  const tableWrites: PublicationWrite[] = [];
  const zoneWrites: PublicationWrite[] = [];
  const decorativeWrites: PublicationWrite[] = [];
  const decorativeDeactivateWrites: PublicationWrite[] = [];
  const skippedTables: SalaEditorV2PublicationSkippedItem[] = [];
  const skippedZones: SalaEditorV2PublicationSkippedZone[] = [];
  const skippedDecorativeTables: SalaEditorV2PublicationSkippedDecorative[] = [];
  const skippedLegacyDecorativeTables: SalaEditorV2PublicationSkippedLegacyDecorative[] = [];
  const decorativeAudit: SalaEditorV2PublicationDecorativeAuditItem[] = [];
  const unsafeFloorPlanTables: SalaEditorV2PublicationFloorPlanWarning[] = [];
  const spacesById = new Map(document.espacios.map((space) => [space.id, space]));
  const safeFloorPlanIds = new Set<string>();
  const spacesByLegacyFloorPlanId = new Map<string, typeof document.espacios>();
  const safeFloorPlanIdBySpaceId = new Map<string, string>();
  const replaceLegacyVisualMap = params.replaceLegacyVisualMap !== false;
  let decorativeLegacyFound = 0;

  for (const space of document.espacios) {
    const floorPlanId = stringOrEmpty(space.legacyFloorPlanId);
    if (!floorPlanId) continue;
    const list = spacesByLegacyFloorPlanId.get(floorPlanId) ?? [];
    list.push(space);
    spacesByLegacyFloorPlanId.set(floorPlanId, list);
  }

  for (const [floorPlanId, spaces] of spacesByLegacyFloorPlanId) {
    if (spaces.length !== 1) continue;
    const space = spaces[0]!;

    const ref = doc(db, "floorPlans", floorPlanId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;

    const data = snap.data() as Record<string, unknown>;
    if (stringOrEmpty(data.restaurantId) !== restaurantId) continue;

    safeFloorPlanIds.add(floorPlanId);
    safeFloorPlanIdBySpaceId.set(space.id, floorPlanId);

    const payload: DocumentData = {
      restaurantId,
      updatedAt: serverTimestamp(),
    };
    const name = space.name.trim();
    if (name) payload.name = name;

    const pixelsPerUnit = positiveFiniteNumber(space.base?.scale.pixelsPerUnit);
    const widthUnits = positiveFiniteNumber(space.base?.dimensions.width);
    const heightUnits = positiveFiniteNumber(space.base?.dimensions.height);
    if (pixelsPerUnit !== null && widthUnits !== null && heightUnits !== null) {
      payload.width = Math.max(1, Math.round(widthUnits * pixelsPerUnit));
      payload.height = Math.max(1, Math.round(heightUnits * pixelsPerUnit));
    }

    floorPlanWrites.push({ ref, data: payload, mode: "update" });
  }

  const selectedSpaceId = stringOrEmpty(document.navigation.selectedEspacioId);
  let selectedSafeFloorPlanId =
    selectedSpaceId !== "" ? safeFloorPlanIdBySpaceId.get(selectedSpaceId) ?? null : null;

  const resolveSafeFloorPlanIdForSpace = (spaceId: string): string | null => {
    const direct = safeFloorPlanIdBySpaceId.get(spaceId);
    if (direct) return direct;
    if (selectedSafeFloorPlanId) return selectedSafeFloorPlanId;
    if (safeFloorPlanIds.size === 1) {
      return [...safeFloorPlanIds][0] ?? null;
    }
    return null;
  };

  const tablesQuerySnapshot = await getDocs(
    query(collection(db, "tables"), where("restaurantId", "==", restaurantId)),
  );
  const queriedTableDocs = tablesQuerySnapshot.docs.map((tableDoc) => ({
    id: tableDoc.id,
    data: tableDoc.data() as Record<string, unknown>,
  }));
  logPublisherTablesFirestoreAudit({
    restaurantId,
    docs: queriedTableDocs,
  });

  let inferredSafeFloorPlanIdFromLinkedTables: string | null = null;
  const floorPlanIdsByLinkedLegacyTable = new Map<string, string>();
  for (const instance of document.operationalElementInstances) {
    if (instance.elementType !== "TABLE") continue;
    const legacyTableId = readLegacyTableId(instance.metadata);
    if (!legacyTableId) continue;
    const existing = queriedTableDocs.find((tableDoc) => tableDoc.id === legacyTableId);
    if (!existing) continue;
    const floorPlanId = stringOrEmpty(existing.data.floorPlanId);
    if (!floorPlanId) continue;
    floorPlanIdsByLinkedLegacyTable.set(legacyTableId, floorPlanId);
  }

  const linkedFloorPlanIds = new Set(floorPlanIdsByLinkedLegacyTable.values());
  if (linkedFloorPlanIds.size === 1) {
    inferredSafeFloorPlanIdFromLinkedTables = [...linkedFloorPlanIds][0]!;
    if (!safeFloorPlanIds.has(inferredSafeFloorPlanIdFromLinkedTables)) {
      const inferredFloorPlanId = inferredSafeFloorPlanIdFromLinkedTables;
      safeFloorPlanIds.add(inferredFloorPlanId);
      if (selectedSpaceId) {
        safeFloorPlanIdBySpaceId.set(selectedSpaceId, inferredFloorPlanId);
      } else if (document.espacios.length === 1) {
        safeFloorPlanIdBySpaceId.set(document.espacios[0]!.id, inferredFloorPlanId);
      }
    }
    selectedSafeFloorPlanId = selectedSafeFloorPlanId ?? inferredSafeFloorPlanIdFromLinkedTables;
    console.info("[SalaEditorV2] Publisher floorPlan inferido desde mesas enlazadas", {
      floorPlanId: inferredSafeFloorPlanIdFromLinkedTables,
      linkedTables: floorPlanIdsByLinkedLegacyTable.size,
    });
  } else if (linkedFloorPlanIds.size > 1) {
    console.warn("[SalaEditorV2] Publisher no infiere floorPlan: mesas enlazadas en varios planos", {
      floorPlanIds: [...linkedFloorPlanIds],
      linkedTables: floorPlanIdsByLinkedLegacyTable.size,
    });
  }

  let finalDecorativeFallbackFloorPlanId: string | null = inferredSafeFloorPlanIdFromLinkedTables;
  if (!finalDecorativeFallbackFloorPlanId) {
    const activeOperationalFloorPlanIds = new Set<string>();
    let activeOperationalTablesWithFloorPlan = 0;
    for (const tableDoc of queriedTableDocs) {
      const data = tableDoc.data;
      if (data.isActive === false) continue;
      const type = stringOrEmpty(data.type) || "table";
      if (!isProtectedOperationalPlanElementType(type)) continue;
      const floorPlanId = stringOrEmpty(data.floorPlanId);
      if (!floorPlanId) continue;
      activeOperationalTablesWithFloorPlan += 1;
      activeOperationalFloorPlanIds.add(floorPlanId);
    }

    if (activeOperationalFloorPlanIds.size === 1) {
      const candidateFloorPlanId = [...activeOperationalFloorPlanIds][0]!;
      const floorPlanSnap = await getDoc(doc(db, "floorPlans", candidateFloorPlanId));
      if (floorPlanSnap.exists()) {
        const floorPlanData = floorPlanSnap.data() as Record<string, unknown>;
        if (stringOrEmpty(floorPlanData.restaurantId) === restaurantId) {
          finalDecorativeFallbackFloorPlanId = candidateFloorPlanId;
          safeFloorPlanIds.add(candidateFloorPlanId);
          if (selectedSpaceId) {
            safeFloorPlanIdBySpaceId.set(selectedSpaceId, candidateFloorPlanId);
          } else if (document.espacios.length === 1) {
            safeFloorPlanIdBySpaceId.set(document.espacios[0]!.id, candidateFloorPlanId);
          }
          selectedSafeFloorPlanId = selectedSafeFloorPlanId ?? candidateFloorPlanId;
          console.info("[SalaEditorV2] Publisher floorPlan inferido desde mesas activas", {
            floorPlanId: candidateFloorPlanId,
            activeOperationalTables: activeOperationalTablesWithFloorPlan,
          });
        }
      }
    } else if (activeOperationalFloorPlanIds.size > 1) {
      console.warn("[SalaEditorV2] Publisher no infiere floorPlan decorativo: varios planos activos", {
        floorPlanIds: [...activeOperationalFloorPlanIds],
      });
    }
  }

  const resolveFallbackSafeFloorPlanId = (): string | null => {
    if (selectedSafeFloorPlanId) return selectedSafeFloorPlanId;
    if (inferredSafeFloorPlanIdFromLinkedTables) return inferredSafeFloorPlanIdFromLinkedTables;
    if (finalDecorativeFallbackFloorPlanId) return finalDecorativeFallbackFloorPlanId;
    if (safeFloorPlanIds.size === 1) return [...safeFloorPlanIds][0] ?? null;
    return null;
  };

  const resolveSafeFloorPlanIdForDecorative = (
    linkedSpace: SalaEditorDocument["espacios"][number] | undefined,
  ): string | null => {
    if (linkedSpace) {
      const mappedFloorPlanId = safeFloorPlanIdBySpaceId.get(linkedSpace.id);
      if (mappedFloorPlanId) return mappedFloorPlanId;

      const legacyFloorPlanId = stringOrEmpty(linkedSpace.legacyFloorPlanId);
      if (legacyFloorPlanId && safeFloorPlanIds.has(legacyFloorPlanId)) {
        return legacyFloorPlanId;
      }
    }

    return resolveFallbackSafeFloorPlanId();
  };

  const seenLegacyZoneIds = new Set<string>();
  for (const zone of document.zones) {
    if (zone.visible === false) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "hidden" });
      continue;
    }

    const linkedSpace = spacesById.get(zone.espacioId);
    if (!linkedSpace) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "missing_space" });
      continue;
    }

    const floorPlanId = resolveSafeFloorPlanIdForSpace(linkedSpace.id);
    if (!floorPlanId) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "unsafe_floor_plan" });
      continue;
    }

    if (
      !Number.isFinite(zone.x) ||
      !Number.isFinite(zone.y) ||
      !Number.isFinite(zone.width) ||
      !Number.isFinite(zone.height) ||
      zone.width <= 0 ||
      zone.height <= 0
    ) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "invalid_geometry" });
      continue;
    }

    const legacyZoneId =
      readLegacyZoneId(zone.metadata) || stableLegacyZoneIdFromV2Id(zone.id);
    if (!legacyZoneId) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "invalid_geometry" });
      continue;
    }
    if (seenLegacyZoneIds.has(legacyZoneId)) {
      skippedZones.push({ id: zone.id, name: zone.name, reason: "duplicate_zone_id" });
      continue;
    }
    seenLegacyZoneIds.add(legacyZoneId);

    const ref = doc(db, "zones", legacyZoneId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as Record<string, unknown>;
      if (stringOrEmpty(existing.restaurantId) !== restaurantId) {
        skippedZones.push({
          id: zone.id,
          name: zone.name,
          reason: "restaurant_mismatch",
        });
        continue;
      }
    } else if (readLegacyZoneId(zone.metadata)) {
      skippedZones.push({
        id: zone.id,
        name: zone.name,
        reason: "legacy_zone_not_found",
      });
      continue;
    }

    const payload: DocumentData = {
      restaurantId,
      name: zone.name.trim() || "Zona",
      floorPlanId,
      x: Math.round(zone.x),
      y: Math.round(zone.y),
      width: Math.max(1, Math.round(zone.width)),
      height: Math.max(1, Math.round(zone.height)),
      updatedAt: serverTimestamp(),
    };
    const color = zone.color.trim();
    if (color) payload.color = color;

    zoneWrites.push({ ref, data: payload, mode: "setMerge" });
  }

  const currentDecorativeIds = new Set<string>();
  const seenDecorativeIds = new Set<string>();
  const decorativeDrafts = buildDecorativeDrafts(document);
  const decorativeDiscardReasons: Partial<
    Record<SalaEditorV2PublicationSkippedDecorative["reason"], number>
  > = {};
  let decorativeAfterFilters = 0;
  const logDecorativeDiscard = (
    draft: DecorativePublicationDraft,
    reason: SalaEditorV2PublicationSkippedDecorative["reason"],
    details?: Record<string, unknown>,
  ): void => {
    const linkedSpace = spacesById.get(draft.spaceId);
    const safeFloorPlanForSpace =
      linkedSpace != null ? safeFloorPlanIdBySpaceId.get(linkedSpace.id) ?? "" : "";
    const linkedSpaceLegacyFloorPlanId = stringOrEmpty(linkedSpace?.legacyFloorPlanId);
    const fallbackSafeFloorPlanId = resolveFallbackSafeFloorPlanId();
    const resolvedFloorPlanId =
      linkedSpace != null ? resolveSafeFloorPlanIdForDecorative(linkedSpace) : fallbackSafeFloorPlanId;
    const validGeometry = hasValidGeometry(draft);

    decorativeDiscardReasons[reason] = (decorativeDiscardReasons[reason] ?? 0) + 1;
    console.warn("[SalaEditorV2] Publisher decorativo descartado", {
      reason,
      id: draft.id || draft.sourceId,
      sourceId: draft.sourceId,
      sourceType: draft.sourceType,
      type: draft.legacyType,
      spaceId: draft.spaceId,
      linkedSpaceId: linkedSpace?.id ?? "",
      linkedSpaceName: linkedSpace?.name ?? "",
      linkedSpaceLegacyFloorPlanId,
      floorPlanId: resolvedFloorPlanId,
      resolvedFloorPlanId,
      safeFloorPlanIds: [...safeFloorPlanIds],
      safeFloorPlanIdBySpaceId: [...safeFloorPlanIdBySpaceId.entries()],
      selectedSpaceId,
      selectedSafeFloorPlanId,
      inferredSafeFloorPlanIdFromLinkedTables,
      fallbackSafeFloorPlanId,
      geometry: {
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
      },
      flags: {
        isDecorativeType: isDecorativePlanElementType(draft.legacyType),
        hasValidGeometry: validGeometry,
        hasLinkedSpace: linkedSpace != null,
        hasSafeFloorPlanForSpace: safeFloorPlanForSpace !== "",
        hasLegacyFloorPlanId: linkedSpaceLegacyFloorPlanId !== "",
        legacyFloorPlanIdIsSafe:
          linkedSpaceLegacyFloorPlanId !== "" && safeFloorPlanIds.has(linkedSpaceLegacyFloorPlanId),
        hasFallbackSafeFloorPlan: fallbackSafeFloorPlanId != null,
      },
      ...details,
    });
  };

  console.groupCollapsed("[SalaEditorV2] Publisher decorativos: filtros");
  console.info("[SalaEditorV2] Publisher decorativos generados por adaptador", {
    count: decorativeDrafts.length,
  });
  console.info("[SalaEditorV2] Publisher floorPlan elegido para decorativos", {
    safeFloorPlanIds: [...safeFloorPlanIds],
    safeFloorPlanIdBySpaceId: [...safeFloorPlanIdBySpaceId.entries()],
    selectedSafeFloorPlanId,
    inferredSafeFloorPlanIdFromLinkedTables,
    fallbackSafeFloorPlanId: resolveFallbackSafeFloorPlanId(),
    chosenDecorativeFloorPlanId: resolveFallbackSafeFloorPlanId(),
  });

  for (const draft of decorativeDrafts) {
    if (draft.visible === false) {
      logDecorativeDiscard(draft, "hidden");
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "hidden",
      });
      continue;
    }
    if (!isDecorativePlanElementType(draft.legacyType)) {
      logDecorativeDiscard(draft, "unsupported_type");
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "unsupported_type",
      });
      continue;
    }

    const linkedSpace = spacesById.get(draft.spaceId);
    const floorPlanId = resolveSafeFloorPlanIdForDecorative(linkedSpace);
    if (!floorPlanId) {
      logDecorativeDiscard(draft, "unsafe_floor_plan", {
        missingSpace: linkedSpace == null,
        safeFloorPlanIds: [...safeFloorPlanIds],
        inferredSafeFloorPlanIdFromLinkedTables,
        linkedSpaceLegacyFloorPlanId: linkedSpace?.legacyFloorPlanId ?? null,
        selectedSpaceId,
      });
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "unsafe_floor_plan",
      });
      continue;
    }

    if (!draft.id || !hasValidGeometry(draft)) {
      logDecorativeDiscard(draft, "invalid_geometry", {
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
      });
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "invalid_geometry",
      });
      continue;
    }
    if (seenDecorativeIds.has(draft.id)) {
      logDecorativeDiscard(draft, "duplicate_element_id", {
        stableId: draft.id,
      });
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "duplicate_element_id",
      });
      continue;
    }
    seenDecorativeIds.add(draft.id);

    const ref = doc(db, "tables", draft.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as Record<string, unknown>;
      if (stringOrEmpty(existing.restaurantId) !== restaurantId) {
        logDecorativeDiscard(draft, "restaurant_mismatch", {
          documentPath: ref.path,
          existingRestaurantId: stringOrEmpty(existing.restaurantId),
        });
        skippedDecorativeTables.push({
          id: draft.sourceId,
          name: draft.name,
          reason: "restaurant_mismatch",
        });
        continue;
      }
    } else if (readLegacyTableId(draft.metadata ?? {})) {
      logDecorativeDiscard(draft, "legacy_table_not_found", {
        documentPath: ref.path,
      });
      skippedDecorativeTables.push({
        id: draft.sourceId,
        name: draft.name,
        reason: "legacy_table_not_found",
      });
      continue;
    }

    decorativeAfterFilters += 1;
    currentDecorativeIds.add(draft.id);
    const payload: DocumentData = {
      id: draft.id,
      restaurantId,
      name: draft.name.trim() || draft.legacyType,
      type: draft.legacyType,
      status: TABLE_MAP_STATUS_FREE,
      tableShape: "square",
      seats: 0,
      x: Math.round(draft.x),
      y: Math.round(draft.y),
      width: Math.max(1, Math.round(draft.width)),
      height: Math.max(1, Math.round(draft.height)),
      floorPlanId,
      isActive: true,
      locked: draft.locked === true,
      source: "editor-v2",
      editorV2ElementId: draft.sourceId,
      editorV2ElementType: draft.sourceType,
      metadata: {
        ...(draft.metadata ?? {}),
        source: "editor-v2",
        editorV2ElementId: draft.sourceId,
        editorV2ElementType: draft.sourceType,
      },
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) payload.createdAt = serverTimestamp();
    decorativeWrites.push({ ref, data: payload, mode: "setMerge" });
  }
  console.info("[SalaEditorV2] Publisher decorativos despues de filtros", {
    count: decorativeAfterFilters,
  });
  console.info("[SalaEditorV2] Publisher decorativos que llegan al bucle de escritura", {
    count: decorativeWrites.length,
  });
  console.info("[SalaEditorV2] Publisher decorativos descartados por motivo", {
    count: decorativeDrafts.length - decorativeAfterFilters,
    reasons: decorativeDiscardReasons,
  });
  console.groupEnd();

  if (replaceLegacyVisualMap) {
    for (const tableDoc of queriedTableDocs) {
      const data = tableDoc.data;
      const legacyTypeRaw = stringOrEmpty(data.type) || "table";
      const legacyType = legacyTypeRaw as PlanElementType;
      const name = stringOrEmpty(data.name) || legacyTypeRaw;
      const floorPlanId = stringOrEmpty(data.floorPlanId);
      const floorPlanIdForReport = floorPlanId || null;
      const source = readPublicationSource(data);
      const editorV2ElementId = readPublicationEditorV2ElementId(data);
      const belongsToPublishedPlan = true;
      if (stringOrEmpty(data.restaurantId) !== restaurantId) {
        skippedLegacyDecorativeTables.push({
          id: tableDoc.id,
          name,
          type: legacyTypeRaw,
          floorPlanId: floorPlanIdForReport,
          reason: "invalid_restaurant",
        });
        continue;
      }
      const isProtectedOperationalType =
        legacyTypeRaw === "table" ||
        legacyTypeRaw === "sunbed" ||
        legacyTypeRaw === "bed" ||
        legacyTypeRaw === "custom";
      if (!isDecorativePlanElementType(legacyType)) {
        const reason = isProtectedOperationalType
          ? "protected_operational_type"
          : "not_decorative";
        skippedLegacyDecorativeTables.push({
          id: tableDoc.id,
          name,
          type: legacyTypeRaw,
          floorPlanId: floorPlanIdForReport,
          reason,
        });
        continue;
      }
      if (currentDecorativeIds.has(tableDoc.id)) {
        if (data.isActive !== false) {
          decorativeAudit.push({
            id: tableDoc.id,
            name,
            type: legacyType,
            isActive: true,
            floorPlanId: floorPlanIdForReport,
            source,
            editorV2ElementId,
            x: numberOrNull(data.x),
            y: numberOrNull(data.y),
            width: numberOrNull(data.width),
            height: numberOrNull(data.height),
            belongsToPublishedPlan,
            action: "skip",
            reason: "v2_current_decorative",
          });
        }
        skippedLegacyDecorativeTables.push({
          id: tableDoc.id,
          name,
          type: legacyType,
          floorPlanId: floorPlanIdForReport,
          reason: "v2_current_decorative",
        });
        continue;
      }
      if (data.isActive === false) {
        decorativeAudit.push({
          id: tableDoc.id,
          name,
          type: legacyType,
          isActive: false,
          floorPlanId: floorPlanIdForReport,
          source,
          editorV2ElementId,
          x: numberOrNull(data.x),
          y: numberOrNull(data.y),
          width: numberOrNull(data.width),
          height: numberOrNull(data.height),
          belongsToPublishedPlan,
          action: "skip",
          reason: "already_inactive",
        });
        skippedLegacyDecorativeTables.push({
          id: tableDoc.id,
          name,
          type: legacyType,
          floorPlanId: floorPlanIdForReport,
          reason: "already_inactive",
        });
        continue;
      }

      decorativeLegacyFound += 1;
      decorativeAudit.push({
        id: tableDoc.id,
        name,
        type: legacyType,
        isActive: true,
        floorPlanId: floorPlanIdForReport,
        source,
        editorV2ElementId,
        x: numberOrNull(data.x),
        y: numberOrNull(data.y),
        width: numberOrNull(data.width),
        height: numberOrNull(data.height),
        belongsToPublishedPlan,
        action: "deactivate",
        reason: "legacy_visual_replaced",
      });
      decorativeDeactivateWrites.push({
        ref: doc(db, "tables", tableDoc.id),
        data: {
          restaurantId,
          isActive: false,
          updatedAt: serverTimestamp(),
        },
        mode: "update",
      });
    }
  }

  const seenLegacyTableIds = new Set<string>();
  for (const instance of document.operationalElementInstances) {
    if (instance.elementType !== "TABLE") {
      continue;
    }

    const legacyTableId = readLegacyTableId(instance.metadata);
    if (!legacyTableId) {
      skippedTables.push({
        id: instance.id,
        name: instance.name,
        reason: "missing_legacy_table_id",
      });
      continue;
    }
    if (seenLegacyTableIds.has(legacyTableId)) {
      skippedTables.push({
        id: instance.id,
        name: instance.name,
        reason: "duplicate_legacy_table_id",
      });
      continue;
    }
    seenLegacyTableIds.add(legacyTableId);

    const ref = doc(db, "tables", legacyTableId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      skippedTables.push({
        id: instance.id,
        name: instance.name,
        reason: "legacy_table_not_found",
      });
      continue;
    }

    const existing = snap.data() as Record<string, unknown>;
    if (stringOrEmpty(existing.restaurantId) !== restaurantId) {
      skippedTables.push({
        id: instance.id,
        name: instance.name,
        reason: "restaurant_mismatch",
      });
      continue;
    }

    const size = getOperationalInstanceCanvasSize(instance);
    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));
    const payload: DocumentData = {
      restaurantId,
      x: Math.round(instance.position.x - width / 2),
      y: Math.round(instance.position.y - height / 2),
      width,
      height,
      updatedAt: serverTimestamp(),
    };

    const name = instance.name.trim();
    if (name) payload.name = name;

    const capacity = positiveRoundedNumber(instance.capacity);
    if (capacity !== null) payload.seats = capacity;

    const tableShape = readTableShape(instance.metadata);
    if (tableShape) payload.tableShape = tableShape;

    const linkedSpace = spacesById.get(instance.spaceId);
    const floorPlanId = linkedSpace
      ? resolveSafeFloorPlanIdForSpace(linkedSpace.id)
      : readLegacyFloorPlanId(instance.metadata);
    if (floorPlanId && safeFloorPlanIds.has(floorPlanId)) {
      payload.floorPlanId = floorPlanId;
    } else if (floorPlanId) {
      unsafeFloorPlanTables.push({
        id: instance.id,
        name: instance.name,
        legacyTableId,
        floorPlanId,
      });
    }

    tableWrites.push({ ref, data: payload, mode: "update" });
  }

  await commitDecorativeWritesWithTrace(decorativeWrites);
  await commitUpdateWrites([
    ...floorPlanWrites,
    ...zoneWrites,
    ...decorativeDeactivateWrites,
    ...tableWrites,
  ]);

  return {
    floorPlansUpdated: floorPlanWrites.length,
    tablesUpdated: tableWrites.length,
    zonesUpdated: zoneWrites.length,
    decorativeTablesUpdated: decorativeWrites.length,
    decorativeLegacyFound,
    decorativeLegacyDeactivated: decorativeDeactivateWrites.length,
    skippedTables,
    skippedZones,
    skippedDecorativeTables,
    skippedLegacyDecorativeTables,
    decorativeAudit,
    unsafeFloorPlanTables,
  };
}
