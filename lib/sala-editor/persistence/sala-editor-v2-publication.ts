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
import { auth, db, firebaseEnvDebug, isFirebaseConfigured } from "@/lib/firebase/client";
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
    | "unsafe_floor_plan"
    | "invalid_name"
    | "duplicate_table_number"
    | "duplicate_legacy_table_id"
    | "legacy_table_not_found"
    | "restaurant_mismatch";
};

export type SalaEditorV2PublishedOperationalTableLink = {
  instanceId: string;
  legacyTableIdBefore: string | null;
  legacyTableIdAfter: string;
  floorPlanId: string;
  action: "create" | "reuse";
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

export type SalaEditorV2LegacyTableDeactivationSkipReason =
  | "invalid_restaurant"
  | "already_inactive"
  | "not_table"
  | "expected_by_v2"
  | "published_by_editor_v2"
  | "outside_published_scope"
  | "unsafe_status"
  | "operational_signal";

export type SalaEditorV2PublicationResult = {
  floorPlansUpdated: number;
  tablesUpdated: number;
  zonesUpdated: number;
  decorativeTablesUpdated: number;
  decorativeLegacyFound: number;
  decorativeLegacyDeactivated: number;
  legacyTablesAudited: number;
  legacyTablesExpected: number;
  legacyTablesDeactivated: number;
  legacyTablesSkippedByReason: Partial<Record<SalaEditorV2LegacyTableDeactivationSkipReason, number>>;
  skippedTables: SalaEditorV2PublicationSkippedItem[];
  skippedZones: SalaEditorV2PublicationSkippedZone[];
  skippedDecorativeTables: SalaEditorV2PublicationSkippedDecorative[];
  skippedLegacyDecorativeTables: SalaEditorV2PublicationSkippedLegacyDecorative[];
  decorativeAudit: SalaEditorV2PublicationDecorativeAuditItem[];
  unsafeFloorPlanTables: SalaEditorV2PublicationFloorPlanWarning[];
  newOperationalTableLinks: SalaEditorV2PublishedOperationalTableLink[];
};

const FIRESTORE_BATCH_LIMIT = 450;

type PublicationWrite = {
  ref: ReturnType<typeof doc>;
  data: DocumentData;
  mode: "update" | "setMerge";
  diagnosticLabel?: string;
  existingRestaurantId?: string | null;
};

type PublicationWriteDiagnostic = {
  label: string;
  operation: "batch.set" | "batch.update" | "setDoc" | "updateDoc";
  mode: PublicationWrite["mode"];
  documentPath: string;
  collectionPath: string;
  documentId: string;
  topLevelCollection: string;
  restaurantId: string;
  uid: string | null;
  payloadRestaurantId: string | null;
  existingRestaurantId: string | null;
  payloadRestaurantMatchesExpected: boolean | null;
  existingRestaurantMatchesExpected: boolean | null;
  publisherPathExpected: boolean;
  payload: Record<string, unknown>;
};

export type SalaEditorV2LastFirestoreOperation = {
  operation: string;
  documentPath: string | null;
  collectionName: string | null;
  restaurantId: string | null;
  uid: string | null;
  payloadRestaurantId: string | null;
  existingRestaurantId: string | null;
  payloadKeys: string[];
  writes?: Array<{
    operation: string;
    documentPath: string;
    collectionName: string;
    payloadRestaurantId: string | null;
    existingRestaurantId: string | null;
    payloadKeys: string[];
  }>;
};

let lastSalaEditorV2FirestoreOperation: SalaEditorV2LastFirestoreOperation | null = null;

export type SalaEditorPublisherLastFirestoreOperation = {
  operation: string;
  documentPath: string | null;
  collectionName: string | null;
  restaurantId: string | null;
  uid: string | null;
  payloadRestaurantId: string | null;
  existingRestaurantId: string | null;
  payloadKeys: string[];
};

const PUBLISHER_FIRESTORE_COLLECTIONS = new Set(["floorPlans", "tables", "zones"]);
const SAFE_WRITE_PAYLOAD_KEYS = [
  "id",
  "restaurantId",
  "floorPlanId",
  "type",
  "status",
  "isActive",
  "tableShape",
  "seats",
  "x",
  "y",
  "width",
  "height",
  "source",
  "editorV2ElementId",
  "editorV2InstanceId",
  "editorV2ElementType",
  "locked",
] as const;

let lastFirestoreOperation: SalaEditorPublisherLastFirestoreOperation | null = null;

export function getLastSalaEditorV2PublisherFirestoreOperation():
  | SalaEditorPublisherLastFirestoreOperation
  | null {
  return lastFirestoreOperation;
}

function rememberLastFirestoreOperation(
  operation: SalaEditorPublisherLastFirestoreOperation,
): void {
  lastFirestoreOperation = operation;
  lastSalaEditorV2FirestoreOperation = {
    operation: operation.operation,
    documentPath: operation.documentPath,
    collectionName: operation.collectionName,
    restaurantId: operation.restaurantId,
    uid: operation.uid,
    payloadRestaurantId: operation.payloadRestaurantId,
    existingRestaurantId: operation.existingRestaurantId,
    payloadKeys: operation.payloadKeys,
  };
}

function payloadKeysFromData(data: DocumentData | null | undefined): string[] {
  if (!data) return [];
  return Object.keys(data).sort();
}

function rememberLastFirestoreReadOperation(params: {
  operation: string;
  documentPath: string | null;
  collectionName: string | null;
  restaurantId: string;
}): void {
  rememberLastFirestoreOperation({
    operation: params.operation,
    documentPath: params.documentPath,
    collectionName: params.collectionName,
    restaurantId: params.restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId: null,
    existingRestaurantId: null,
    payloadKeys: [],
  });
}

function rememberLastFirestoreWriteOperation(params: {
  row: PublicationWriteDiagnostic;
  operation?: string;
}): void {
  const { row } = params;
  rememberLastFirestoreOperation({
    operation: params.operation ?? row.operation,
    documentPath: row.documentPath,
    collectionName: row.collectionPath,
    restaurantId: row.restaurantId,
    uid: row.uid,
    payloadRestaurantId: row.payloadRestaurantId,
    existingRestaurantId: row.existingRestaurantId,
    payloadKeys: Array.isArray(row.payload.fieldKeys)
      ? row.payload.fieldKeys.filter((key): key is string => typeof key === "string")
      : [],
  });
}

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

function currentPublisherUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

export function getLastSalaEditorV2FirestoreOperation(): SalaEditorV2LastFirestoreOperation | null {
  return lastSalaEditorV2FirestoreOperation;
}

function setLastSalaEditorV2FirestoreOperation(
  operation: SalaEditorV2LastFirestoreOperation,
): void {
  lastSalaEditorV2FirestoreOperation = operation;
}

function writePayloadKeys(data: DocumentData | null | undefined): string[] {
  return data ? Object.keys(data).sort() : [];
}

function rememberDocumentFirestoreOperation(params: {
  operation: string;
  ref: ReturnType<typeof doc>;
  restaurantId: string;
  data?: DocumentData;
  existingRestaurantId?: string | null;
}): void {
  setLastSalaEditorV2FirestoreOperation({
    operation: params.operation,
    documentPath: params.ref.path,
    collectionName: params.ref.parent.path,
    restaurantId: params.restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId: stringOrEmpty(params.data?.restaurantId) || null,
    existingRestaurantId: params.existingRestaurantId ?? null,
    payloadKeys: writePayloadKeys(params.data),
  });
}

function rememberQueryFirestoreOperation(params: {
  operation: string;
  collectionName: string;
  documentPath: string;
  restaurantId: string;
}): void {
  setLastSalaEditorV2FirestoreOperation({
    operation: params.operation,
    documentPath: params.documentPath,
    collectionName: params.collectionName,
    restaurantId: params.restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId: null,
    existingRestaurantId: null,
    payloadKeys: [],
  });
}

function rememberBatchCommitFirestoreOperation(params: {
  restaurantId: string;
  rows: PublicationWriteDiagnostic[];
}): void {
  const collectionNames = [...new Set(params.rows.map((row) => row.collectionPath))];
  setLastSalaEditorV2FirestoreOperation({
    operation: "batch.commit",
    documentPath:
      params.rows.length === 1
        ? params.rows[0]?.documentPath ?? "batch:0:documents"
        : `batch:${params.rows.length}:documents`,
    collectionName:
      params.rows.length === 1 ? params.rows[0]?.collectionPath ?? "" : collectionNames.join(", "),
    restaurantId: params.restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId:
      params.rows.length === 1 ? params.rows[0]?.payloadRestaurantId ?? null : null,
    existingRestaurantId:
      params.rows.length === 1 ? params.rows[0]?.existingRestaurantId ?? null : null,
    payloadKeys: [...new Set(params.rows.flatMap((row) => Object.keys(row.payload)))].sort(),
    writes: params.rows.map((row) => ({
      operation: row.operation,
      documentPath: row.documentPath,
      collectionName: row.collectionPath,
      payloadRestaurantId: row.payloadRestaurantId,
      existingRestaurantId: row.existingRestaurantId,
      payloadKeys: Array.isArray(row.payload.fieldKeys)
        ? (row.payload.fieldKeys as string[])
        : Object.keys(row.payload).sort(),
    })),
  });
}

function describeFirestoreError(error: unknown): Record<string, unknown> {
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    name: typeof candidate.name === "string" ? candidate.name : null,
    message: typeof candidate.message === "string" ? candidate.message : String(error),
  };
}

function safeWritePayload(data: DocumentData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of SAFE_WRITE_PAYLOAD_KEYS) {
    const value = data[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      payload[key] = value;
    }
  }
  payload.fieldKeys = Object.keys(data).sort();
  payload.hasMetadata = typeof data.metadata === "object" && data.metadata !== null;
  payload.metadataKeys =
    typeof data.metadata === "object" && data.metadata !== null && !Array.isArray(data.metadata)
      ? Object.keys(data.metadata as Record<string, unknown>).sort()
      : [];
  payload.hasCreatedAt = data.createdAt !== undefined;
  payload.hasUpdatedAt = data.updatedAt !== undefined;
  return payload;
}

function describePublicationWrite(params: {
  write: PublicationWrite;
  restaurantId: string;
  operation: PublicationWriteDiagnostic["operation"];
}): PublicationWriteDiagnostic {
  const { write, restaurantId, operation } = params;
  const pathSegments = write.ref.path.split("/").filter(Boolean);
  const collectionPath = pathSegments.slice(0, -1).join("/");
  const topLevelCollection = pathSegments[0] ?? "";
  const payloadRestaurantId = stringOrEmpty(write.data.restaurantId) || null;
  const existingRestaurantId = write.existingRestaurantId ?? null;
  return {
    label: write.diagnosticLabel ?? topLevelCollection,
    operation,
    mode: write.mode,
    documentPath: write.ref.path,
    collectionPath,
    documentId: write.ref.id,
    topLevelCollection,
    restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId,
    existingRestaurantId,
    payloadRestaurantMatchesExpected:
      payloadRestaurantId === null ? null : payloadRestaurantId === restaurantId,
    existingRestaurantMatchesExpected:
      existingRestaurantId === null ? null : existingRestaurantId === restaurantId,
    publisherPathExpected: PUBLISHER_FIRESTORE_COLLECTIONS.has(topLevelCollection),
    payload: safeWritePayload(write.data),
  };
}

function summarizePublicationWriteForTable(row: PublicationWriteDiagnostic): Record<string, unknown> {
  return {
    label: row.label,
    op: row.operation,
    path: row.documentPath,
    restaurantId: row.restaurantId,
    uid: row.uid,
    payloadRestaurantId: row.payloadRestaurantId,
    existingRestaurantId: row.existingRestaurantId,
    payloadRidOk: row.payloadRestaurantMatchesExpected,
    existingRidOk: row.existingRestaurantMatchesExpected,
    expectedPath: row.publisherPathExpected,
  };
}

function inferPermissionDiagnostics(row: PublicationWriteDiagnostic): string[] {
  const diagnostics: string[] = [];
  if (!row.uid) {
    diagnostics.push("auth.currentUser.uid ausente: las reglas sameRestaurant() rechazaran la escritura");
  }
  if (!row.publisherPathExpected) {
    diagnostics.push("ruta fuera de las colecciones esperadas por el publisher");
  }
  if (row.payloadRestaurantMatchesExpected === false) {
    diagnostics.push("restaurantId del payload distinto del restaurantId del publisher");
  }
  if (row.existingRestaurantMatchesExpected === false) {
    diagnostics.push("restaurantId existente del documento distinto del restaurantId del publisher");
  }
  if (row.mode === "update" && row.existingRestaurantId === null) {
    diagnostics.push("update sin restaurantId existente conocido: revisar si el documento existe y pertenece al restaurante");
  }
  if (diagnostics.length === 0) {
    diagnostics.push("si Firebase devuelve permission-denied, revisar perfil users/usuarios del uid frente a este restaurantId");
  }
  return diagnostics;
}

function logPermissionDeniedWriteDiagnostics(params: {
  title: string;
  error: unknown;
  rows: PublicationWriteDiagnostic[];
}): void {
  const first = params.rows[0] ?? null;
  const error = describeFirestoreError(params.error);
  console.error(params.title, {
    operation: first?.operation ?? "batch.commit",
    documentPath:
      params.rows.length === 1
        ? first?.documentPath ?? null
        : `batch:${params.rows.length}:documents`,
    collectionName:
      params.rows.length === 1
        ? first?.collectionPath ?? null
        : [...new Set(params.rows.map((row) => row.collectionPath))].join(", "),
    restaurantId: first?.restaurantId ?? null,
    uid: first?.uid ?? currentPublisherUid(),
    errorCode: typeof error.code === "string" ? error.code : null,
    errorMessage: typeof error.message === "string" ? error.message : String(params.error),
    error,
    failedWrites: params.rows,
    ruleContext: {
      rulesFile: "firestore.rules",
      relevantMatches: ["/tables/{tableId}", "/zones/{zoneId}", "/floorPlans/{floorPlanId}"],
      updateRequirement:
        "sameRestaurant(resource.data.restaurantId) && request.resource.data.restaurantId == resource.data.restaurantId",
      createRequirement: "sameRestaurant(request.resource.data.restaurantId)",
    },
    likelyDiagnostics: params.rows.map((row) => ({
      documentPath: row.documentPath,
      operation: row.operation,
      diagnostics: inferPermissionDiagnostics(row),
    })),
  });
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

function isPermissionDeniedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "permission-denied"
  );
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

function isGeneratedV2ZoneId(zoneId: string): boolean {
  return zoneId.startsWith("v2-zone-");
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

function isGeneratedV2DecorativeId(tableId: string): boolean {
  return tableId.startsWith("v2-map-");
}

function stableLegacyOperationalTableIdFromV2Instance(instanceId: string): string {
  const stable = instanceId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stable ? `v2-table-${stable}` : "";
}

function isGeneratedV2OperationalTableId(tableId: string): boolean {
  return tableId.startsWith("v2-table-");
}

function normalizeOperationalTableIdentityKey(name: string): string {
  const normalized = name
    .trim()
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ");
  const numeric = /^mesa\s+(\d+)$/.exec(normalized)?.[1] ?? /^#?(\d+)$/.exec(normalized)?.[1];
  return numeric ? `mesa:${numeric}` : `name:${normalized}`;
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

function isLegacyTableStatusSafeToDeactivate(status: unknown): boolean {
  const value = stringOrEmpty(status).toLowerCase();
  return value === "" || value === "free";
}

function hasPositiveCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasMeaningfulOperationalSignal(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function hasSensitiveTableOperationSignal(data: Record<string, unknown>): boolean {
  if (
    hasMeaningfulOperationalSignal(data.orders) ||
    hasMeaningfulOperationalSignal(data.orderId) ||
    hasMeaningfulOperationalSignal(data.activeOrderId) ||
    hasMeaningfulOperationalSignal(data.payment) ||
    hasMeaningfulOperationalSignal(data.paymentId) ||
    hasMeaningfulOperationalSignal(data.reservationId) ||
    hasMeaningfulOperationalSignal(data.groupId) ||
    hasMeaningfulOperationalSignal(data.tableGroupId) ||
    hasPositiveCount(data.dinersCount) ||
    hasPositiveCount(data.guestCount) ||
    data.occupied === true
  ) {
    return true;
  }

  return !isLegacyTableStatusSafeToDeactivate(data.status);
}

function belongsToPublishedLegacyTableScope(
  data: Record<string, unknown>,
  safeFloorPlanIds: ReadonlySet<string>,
): boolean {
  const floorPlanId = stringOrEmpty(data.floorPlanId);
  if (!floorPlanId) return true;
  return safeFloorPlanIds.has(floorPlanId);
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
  params: { restaurantId: string },
): Promise<void> {
  const chunks = chunkDocumentDataWrites(writes);
  if (chunks.length === 0) {
    console.info("[SalaEditorV2][FirestoreDiag] batch.commit omitido", {
      operation: "batch.commit",
      reason: "no-writes",
      restaurantId: params.restaurantId,
      uid: currentPublisherUid(),
    });
    return;
  }
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const rows = chunk.map((write) =>
      describePublicationWrite({
        write,
        restaurantId: params.restaurantId,
        operation: write.mode === "setMerge" ? "batch.set" : "batch.update",
      }),
    );
    console.groupCollapsed(
      `[SalaEditorV2][FirestoreDiag] batch.commit intento ${chunkIndex + 1}/${chunks.length}`,
    );
    console.info("[SalaEditorV2][FirestoreDiag] batch.commit resumen", {
      firebaseProjectId: firebaseEnvDebug.projectId,
      restaurantId: params.restaurantId,
      uid: currentPublisherUid(),
      writeCount: rows.length,
    });
    console.table(rows.map(summarizePublicationWriteForTable));
    console.info("[SalaEditorV2][FirestoreDiag] batch.commit payload seguro", rows);
    const batch = writeBatch(db);
    for (const write of chunk) {
      if (write.mode === "setMerge") {
        batch.set(write.ref, write.data, { merge: true });
      } else {
        batch.update(write.ref, write.data);
      }
    }
    try {
      rememberLastFirestoreOperation({
        operation: "batch.commit",
        documentPath:
          rows.length === 1 ? rows[0]?.documentPath ?? null : `batch:${rows.length}:documents`,
        collectionName:
          rows.length === 1
            ? rows[0]?.collectionPath ?? null
            : [...new Set(rows.map((row) => row.collectionPath))].join(", "),
        restaurantId: params.restaurantId,
        uid: currentPublisherUid(),
        payloadRestaurantId: rows.length === 1 ? rows[0]?.payloadRestaurantId ?? null : null,
        existingRestaurantId: rows.length === 1 ? rows[0]?.existingRestaurantId ?? null : null,
        payloadKeys: [
          ...new Set(
            rows.flatMap((row) =>
              Array.isArray(row.payload.fieldKeys)
                ? row.payload.fieldKeys.filter((key): key is string => typeof key === "string")
                : [],
            ),
          ),
        ].sort(),
      });
      console.info("[SalaEditorV2][FirestoreDiag] batch.commit ejecutando", {
        operation: "batch.commit",
        documentPath:
          rows.length === 1 ? rows[0]?.documentPath ?? null : `batch:${rows.length}:documents`,
        collectionName:
          rows.length === 1
            ? rows[0]?.collectionPath ?? null
            : [...new Set(rows.map((row) => row.collectionPath))].join(", "),
        restaurantId: params.restaurantId,
        uid: currentPublisherUid(),
        writes: rows.map(summarizePublicationWriteForTable),
      });
      await batch.commit();
      console.info("[SalaEditorV2][FirestoreDiag] batch.commit OK", {
        writeCount: rows.length,
      });
    } catch (error) {
      logPermissionDeniedWriteDiagnostics({
        title: "[SalaEditorV2][FirestoreDiag] batch.commit ERROR",
        error,
        rows,
      });
      throw error;
    } finally {
      console.groupEnd();
    }
  }
}

async function commitDecorativeWritesWithTrace(
  writes: PublicationWrite[],
  params: { restaurantId: string },
): Promise<void> {
  console.groupCollapsed("[SalaEditorV2] Publisher decorativos: escritura Firestore");
  console.info("[SalaEditorV2] Publisher decorativos que llegan a escritura", {
    firebaseProjectId: firebaseEnvDebug.projectId,
    restaurantId: params.restaurantId,
    uid: currentPublisherUid(),
    count: writes.length,
  });

  try {
    for (const write of writes) {
      const row = describePublicationWrite({
        write,
        restaurantId: params.restaurantId,
        operation: write.mode === "setMerge" ? "setDoc" : "updateDoc",
      });

      try {
        if (write.mode === "setMerge") {
          rememberLastFirestoreWriteOperation({ row });
          console.info("[SalaEditorV2][FirestoreDiag] setDoc ejecutando", {
            operation: row.operation,
            documentPath: row.documentPath,
            collectionName: row.collectionPath,
            restaurantId: row.restaurantId,
            uid: row.uid,
            payload: row.payload,
          });
          await setDoc(write.ref, write.data, { merge: true });
        } else {
          rememberLastFirestoreWriteOperation({ row });
          console.info("[SalaEditorV2][FirestoreDiag] updateDoc ejecutando", {
            operation: row.operation,
            documentPath: row.documentPath,
            collectionName: row.collectionPath,
            restaurantId: row.restaurantId,
            uid: row.uid,
            payload: row.payload,
          });
          await updateDoc(write.ref, write.data);
        }
        console.info("[SalaEditorV2][FirestoreDiag] decorativo OK", {
          documentPath: row.documentPath,
          operation: row.operation,
        });
      } catch (error) {
        logPermissionDeniedWriteDiagnostics({
          title: "[SalaEditorV2][FirestoreDiag] decorativo ERROR",
          error,
          rows: [row],
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
      legacyTablesAudited: 0,
      legacyTablesExpected: 0,
      legacyTablesDeactivated: 0,
      legacyTablesSkippedByReason: {},
      skippedTables: [],
      skippedZones: [],
      skippedDecorativeTables: [],
      skippedLegacyDecorativeTables: [],
      decorativeAudit: [],
      unsafeFloorPlanTables: [],
      newOperationalTableLinks: [],
    };
  }

  const restaurantId = assertRestaurantId(params.restaurantId);
  const document = params.document;
  rememberLastFirestoreOperation({
    operation: "publishSalaEditorV2Phase1ToLegacy",
    documentPath: null,
    collectionName: null,
    restaurantId,
    uid: currentPublisherUid(),
    payloadRestaurantId: null,
    existingRestaurantId: null,
    payloadKeys: [],
  });
  console.info("[SalaEditorV2][FirestoreDiag] publisher TPV alcanzado", {
    operation: "publishSalaEditorV2Phase1ToLegacy",
    restaurantId,
    uid: currentPublisherUid(),
    documentRestaurantId: document.restaurantId,
    espacios: document.espacios.length,
    operationalElementInstances: document.operationalElementInstances.length,
    zones: document.zones.length,
  });
  if (document.restaurantId !== restaurantId) {
    throw new Error("sala-editor-publication: document.restaurantId no coincide");
  }

  const floorPlanWrites: PublicationWrite[] = [];
  const tableWrites: PublicationWrite[] = [];
  const zoneWrites: PublicationWrite[] = [];
  const decorativeWrites: PublicationWrite[] = [];
  const decorativeDeactivateWrites: PublicationWrite[] = [];
  const legacyTableDeactivateWrites: PublicationWrite[] = [];
  const skippedTables: SalaEditorV2PublicationSkippedItem[] = [];
  const skippedZones: SalaEditorV2PublicationSkippedZone[] = [];
  const skippedDecorativeTables: SalaEditorV2PublicationSkippedDecorative[] = [];
  const skippedLegacyDecorativeTables: SalaEditorV2PublicationSkippedLegacyDecorative[] = [];
  const decorativeAudit: SalaEditorV2PublicationDecorativeAuditItem[] = [];
  const unsafeFloorPlanTables: SalaEditorV2PublicationFloorPlanWarning[] = [];
  const newOperationalTableLinks: SalaEditorV2PublishedOperationalTableLink[] = [];
  const spacesById = new Map(document.espacios.map((space) => [space.id, space]));
  const safeFloorPlanIds = new Set<string>();
  const spacesByLegacyFloorPlanId = new Map<string, typeof document.espacios>();
  const safeFloorPlanIdBySpaceId = new Map<string, string>();
  const replaceLegacyVisualMap = params.replaceLegacyVisualMap !== false;
  let decorativeLegacyFound = 0;
  let legacyTablesAudited = 0;
  const legacyTablesSkippedByReason: Partial<
    Record<SalaEditorV2LegacyTableDeactivationSkipReason, number>
  > = {};

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
    rememberLastFirestoreReadOperation({
      operation: "getDoc",
      documentPath: ref.path,
      collectionName: "floorPlans",
      restaurantId,
    });
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

    floorPlanWrites.push({
      ref,
      data: payload,
      mode: "update",
      diagnosticLabel: "floorPlan:update",
      existingRestaurantId: stringOrEmpty(data.restaurantId) || null,
    });
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

  rememberLastFirestoreReadOperation({
    operation: "getDocs",
    documentPath: `tables where restaurantId == ${restaurantId}`,
    collectionName: "tables",
    restaurantId,
  });
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
      const floorPlanRef = doc(db, "floorPlans", candidateFloorPlanId);
      rememberLastFirestoreReadOperation({
        operation: "getDoc",
        documentPath: floorPlanRef.path,
        collectionName: "floorPlans",
        restaurantId,
      });
      const floorPlanSnap = await getDoc(floorPlanRef);
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

  const expectedLegacyTableIds = new Set(
    document.operationalElementInstances
      .filter((instance) => instance.elementType === "TABLE")
      .map((instance) => readLegacyTableId(instance.metadata))
      .filter((legacyTableId) => legacyTableId !== ""),
  );

  const skipLegacyTableDeactivation = (
    reason: SalaEditorV2LegacyTableDeactivationSkipReason,
  ): void => {
    legacyTablesSkippedByReason[reason] =
      (legacyTablesSkippedByReason[reason] ?? 0) + 1;
  };

  for (const tableDoc of queriedTableDocs) {
    const data = tableDoc.data;
    const name = stringOrEmpty(data.name) || tableDoc.id;
    const type = stringOrEmpty(data.type) || "table";
    const source = readPublicationSource(data);
    const editorV2ElementId = readPublicationEditorV2ElementId(data);

    if (stringOrEmpty(data.restaurantId) !== restaurantId) {
      skipLegacyTableDeactivation("invalid_restaurant");
      continue;
    }
    if (data.isActive === false) {
      skipLegacyTableDeactivation("already_inactive");
      continue;
    }
    if (type !== "table") {
      skipLegacyTableDeactivation("not_table");
      continue;
    }
    if (source === "editor-v2" || editorV2ElementId) {
      skipLegacyTableDeactivation("published_by_editor_v2");
      continue;
    }

    legacyTablesAudited += 1;

    if (expectedLegacyTableIds.has(tableDoc.id)) {
      skipLegacyTableDeactivation("expected_by_v2");
      continue;
    }
    if (!belongsToPublishedLegacyTableScope(data, safeFloorPlanIds)) {
      skipLegacyTableDeactivation("outside_published_scope");
      continue;
    }
    if (!isLegacyTableStatusSafeToDeactivate(data.status)) {
      skipLegacyTableDeactivation("unsafe_status");
      continue;
    }
    if (hasSensitiveTableOperationSignal(data)) {
      skipLegacyTableDeactivation("operational_signal");
      continue;
    }

    legacyTableDeactivateWrites.push({
      ref: doc(db, "tables", tableDoc.id),
      data: {
        restaurantId,
        isActive: false,
        updatedAt: serverTimestamp(),
      },
      mode: "update",
      diagnosticLabel: "legacyTable:deactivate",
      existingRestaurantId: stringOrEmpty(data.restaurantId) || null,
    });
    console.info("[SalaEditorV2] Publisher mesa legacy no esperada desactivable", {
      id: tableDoc.id,
      name,
      floorPlanId: stringOrEmpty(data.floorPlanId) || null,
      status: stringOrEmpty(data.status) || null,
    });
  }

  console.info("[SalaEditorV2] Publisher legacy tables cleanup resumen", {
    legacyTablesAudited,
    legacyTablesExpected: expectedLegacyTableIds.size,
    legacyTablesDeactivated: legacyTableDeactivateWrites.length,
    legacyTablesSkippedByReason,
    safeFloorPlanIds: [...safeFloorPlanIds],
  });

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

    const explicitLegacyZoneId = readLegacyZoneId(zone.metadata);
    const legacyZoneId = explicitLegacyZoneId || stableLegacyZoneIdFromV2Id(zone.id);
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
    let existingZoneRestaurantId: string | null = null;
    const isNewGeneratedV2Zone = !explicitLegacyZoneId && isGeneratedV2ZoneId(legacyZoneId);

    if (!isNewGeneratedV2Zone) {
      try {
        rememberLastFirestoreReadOperation({
          operation: "getDoc",
          documentPath: ref.path,
          collectionName: "zones",
          restaurantId,
        });
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const existing = snap.data() as Record<string, unknown>;
          existingZoneRestaurantId = stringOrEmpty(existing.restaurantId) || null;
          if (existingZoneRestaurantId !== restaurantId) {
            skippedZones.push({
              id: zone.id,
              name: zone.name,
              reason: "restaurant_mismatch",
            });
            continue;
          }
        } else if (explicitLegacyZoneId) {
          skippedZones.push({
            id: zone.id,
            name: zone.name,
            reason: "legacy_zone_not_found",
          });
          continue;
        }
      } catch (error) {
        if (!isPermissionDeniedError(error) || explicitLegacyZoneId) {
          throw error;
        }
        console.warn("[SalaEditorV2][FirestoreDiag] zona V2 nueva sin lectura previa", {
          operation: "zones.getDoc.permissionDeniedSkipped",
          documentPath: ref.path,
          collectionName: "zones",
          restaurantId,
          uid: currentPublisherUid(),
          zoneId: zone.id,
          legacyZoneId,
          payloadRestaurantId: restaurantId,
          reason: "generated_v2_zone_will_use_set_merge",
        });
      }
    } else {
      rememberLastFirestoreOperation({
        operation: "zones.getDoc.skippedForGeneratedV2Zone",
        documentPath: ref.path,
        collectionName: "zones",
        restaurantId,
        uid: currentPublisherUid(),
        payloadRestaurantId: restaurantId,
        existingRestaurantId: null,
        payloadKeys: [],
      });
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

    zoneWrites.push({
      ref,
      data: payload,
      mode: "setMerge",
      diagnosticLabel: "zone:setMerge",
      existingRestaurantId: existingZoneRestaurantId,
    });
  }

  const currentDecorativeIds = new Set<string>();
  const seenDecorativeIds = new Set<string>();
  const decorativeDrafts = buildDecorativeDrafts(document);
  const selectedSpace = selectedSpaceId ? spacesById.get(selectedSpaceId) : undefined;
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
  console.info("[SalaEditorV2] Publisher audit espacios antes de filtrar decorativos", {
    selectedSpaceId,
    selectedSpaceLegacyFloorPlanId: selectedSpace?.legacyFloorPlanId ?? null,
    safeFloorPlanIds: [...safeFloorPlanIds],
    safeFloorPlanIdBySpaceId: [...safeFloorPlanIdBySpaceId.entries()],
  });
  console.table(
    [...spacesById.entries()].map(([spaceId, space]) => ({
      spaceId,
      name: space.name,
      legacyFloorPlanId: space.legacyFloorPlanId ?? "",
      mappedSafeFloorPlanId: safeFloorPlanIdBySpaceId.get(spaceId) ?? "",
      selected: spaceId === selectedSpaceId,
      active: space.active,
      visible: space.visible,
    })),
  );
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
    const explicitLegacyTableId = readLegacyTableId(draft.metadata ?? {});
    const isNewGeneratedV2Decorative =
      !explicitLegacyTableId && isGeneratedV2DecorativeId(draft.id);
    let existingDecorativeRestaurantId: string | null = null;

    if (!isNewGeneratedV2Decorative) {
      try {
        rememberLastFirestoreReadOperation({
          operation: "getDoc",
          documentPath: ref.path,
          collectionName: "tables",
          restaurantId,
        });
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const existing = snap.data() as Record<string, unknown>;
          existingDecorativeRestaurantId = stringOrEmpty(existing.restaurantId) || null;
          if (existingDecorativeRestaurantId !== restaurantId) {
            logDecorativeDiscard(draft, "restaurant_mismatch", {
              documentPath: ref.path,
              existingRestaurantId: existingDecorativeRestaurantId,
            });
            skippedDecorativeTables.push({
              id: draft.sourceId,
              name: draft.name,
              reason: "restaurant_mismatch",
            });
            continue;
          }
        } else if (explicitLegacyTableId) {
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
      } catch (error) {
        if (
          !isPermissionDeniedError(error) ||
          explicitLegacyTableId ||
          !isGeneratedV2DecorativeId(draft.id)
        ) {
          throw error;
        }
        console.warn("[SalaEditorV2][FirestoreDiag] decorativo V2 nuevo sin lectura previa", {
          operation: "tables.getDoc.permissionDeniedSkipped",
          documentPath: ref.path,
          collectionName: "tables",
          restaurantId,
          uid: currentPublisherUid(),
          decorativeId: draft.id,
          payloadRestaurantId: restaurantId,
          reason: "generated_v2_decorative_will_use_set_merge",
        });
      }
    } else {
      rememberLastFirestoreOperation({
        operation: "tables.getDoc.skippedForGeneratedV2Decorative",
        documentPath: ref.path,
        collectionName: "tables",
        restaurantId,
        uid: currentPublisherUid(),
        payloadRestaurantId: restaurantId,
        existingRestaurantId: null,
        payloadKeys: [],
      });
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
    if (!isNewGeneratedV2Decorative && existingDecorativeRestaurantId === null) {
      payload.createdAt = serverTimestamp();
    }
    if (isNewGeneratedV2Decorative) {
      console.info("[SalaEditorV2][FirestoreDiag] tables.setDoc generated V2 decorative", {
        operation: "tables.setDoc generated V2 decorative",
        documentPath: ref.path,
        collectionName: "tables",
        restaurantId,
        uid: currentPublisherUid(),
        payloadRestaurantId: restaurantId,
        payloadKeys: Object.keys(payload).sort(),
      });
    }
    decorativeWrites.push({
      ref,
      data: payload,
      mode: "setMerge",
      diagnosticLabel: "decorativeTable:setMerge",
      existingRestaurantId: existingDecorativeRestaurantId,
    });
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
        diagnosticLabel: "decorativeLegacy:deactivate",
        existingRestaurantId: stringOrEmpty(data.restaurantId) || null,
      });
    }
  }

  const seenLegacyTableIds = new Set<string>();
  const newOperationalTablePublishLogs: Array<{
    spaceId: string | null;
    floorPlanId: string | null;
    instanceId: string;
    tableNumber: string | null;
    generatedDocumentId: string | null;
    action: "create" | "reuse" | "conflict" | "skip";
    legacyTableIdBefore: string | null;
    legacyTableIdAfter: string | null;
    reason?: string;
  }> = [];

  for (const instance of document.operationalElementInstances) {
    if (instance.elementType !== "TABLE") {
      continue;
    }

    let legacyTableId = readLegacyTableId(instance.metadata);
    const linkedSpace = spacesById.get(instance.spaceId);
    const resolvedFloorPlanId = linkedSpace
      ? resolveSafeFloorPlanIdForSpace(linkedSpace.id)
      : readLegacyFloorPlanId(instance.metadata);
    const tableName = instance.name.trim();

    if (!legacyTableId) {
      const generatedTableId = stableLegacyOperationalTableIdFromV2Instance(instance.id);
      const logBase = {
        spaceId: linkedSpace?.id ?? null,
        floorPlanId: resolvedFloorPlanId ?? null,
        instanceId: instance.id,
        tableNumber: tableName || null,
        generatedDocumentId: generatedTableId || null,
        legacyTableIdBefore: null,
      };

      if (!tableName) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "invalid_name",
        });
        newOperationalTablePublishLogs.push({
          ...logBase,
          action: "skip",
          legacyTableIdAfter: null,
          reason: "invalid_name",
        });
        continue;
      }

      if (!generatedTableId) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "missing_legacy_table_id",
        });
        newOperationalTablePublishLogs.push({
          ...logBase,
          action: "skip",
          legacyTableIdAfter: null,
          reason: "invalid_generated_id",
        });
        continue;
      }

      if (!resolvedFloorPlanId || !safeFloorPlanIds.has(resolvedFloorPlanId)) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "unsafe_floor_plan",
        });
        if (resolvedFloorPlanId) {
          unsafeFloorPlanTables.push({
            id: instance.id,
            name: instance.name,
            legacyTableId: generatedTableId,
            floorPlanId: resolvedFloorPlanId,
          });
        }
        newOperationalTablePublishLogs.push({
          ...logBase,
          action: "skip",
          legacyTableIdAfter: null,
          reason: "unsafe_floor_plan",
        });
        continue;
      }

      const generatedIdExisting = queriedTableDocs.find(
        (tableDoc) => tableDoc.id === generatedTableId,
      );
      const isSameEditorV2Instance = (data: Record<string, unknown>) =>
        stringOrEmpty(data.source) === "editor-v2" &&
        (stringOrEmpty(data.editorV2ElementId) === instance.id ||
          stringOrEmpty(data.editorV2InstanceId) === instance.id ||
          stringOrEmpty((data.metadata as Record<string, unknown> | undefined)?.editorV2InstanceId) ===
            instance.id);

      if (generatedIdExisting && !isSameEditorV2Instance(generatedIdExisting.data)) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "duplicate_legacy_table_id",
        });
        newOperationalTablePublishLogs.push({
          ...logBase,
          action: "conflict",
          legacyTableIdAfter: null,
          reason: `generated_id_collision:${generatedTableId}`,
        });
        continue;
      }

      const sameInstanceExisting = queriedTableDocs.find((tableDoc) => {
        const data = tableDoc.data;
        return isSameEditorV2Instance(data);
      });
      if (sameInstanceExisting) {
        if (stringOrEmpty(sameInstanceExisting.data.restaurantId) !== restaurantId) {
          skippedTables.push({
            id: instance.id,
            name: instance.name,
            reason: "restaurant_mismatch",
          });
          newOperationalTablePublishLogs.push({
            ...logBase,
            action: "skip",
            legacyTableIdAfter: null,
            reason: "restaurant_mismatch",
          });
          continue;
        }
        legacyTableId = sameInstanceExisting.id;
        newOperationalTableLinks.push({
          instanceId: instance.id,
          legacyTableIdBefore: null,
          legacyTableIdAfter: legacyTableId,
          floorPlanId: resolvedFloorPlanId,
          action: "reuse",
        });
        newOperationalTablePublishLogs.push({
          ...logBase,
          generatedDocumentId: legacyTableId,
          action: "reuse",
          legacyTableIdAfter: legacyTableId,
        });
      } else {
        const identityKey = normalizeOperationalTableIdentityKey(tableName);
        const conflictingTable = queriedTableDocs.find((tableDoc) => {
          const data = tableDoc.data;
          if (stringOrEmpty(data.restaurantId) !== restaurantId) return false;
          if (data.isActive === false) return false;
          if ((stringOrEmpty(data.type) || "table") !== "table") return false;
          if (stringOrEmpty(data.floorPlanId) !== resolvedFloorPlanId) return false;
          return normalizeOperationalTableIdentityKey(stringOrEmpty(data.name)) === identityKey;
        });
        if (conflictingTable) {
          skippedTables.push({
            id: instance.id,
            name: instance.name,
            reason: "duplicate_table_number",
          });
          newOperationalTablePublishLogs.push({
            ...logBase,
            action: "conflict",
            legacyTableIdAfter: null,
            reason: `same_floor_plan_table:${conflictingTable.id}`,
          });
          continue;
        }

        legacyTableId = generatedTableId;
        newOperationalTableLinks.push({
          instanceId: instance.id,
          legacyTableIdBefore: null,
          legacyTableIdAfter: legacyTableId,
          floorPlanId: resolvedFloorPlanId,
          action: "create",
        });
        newOperationalTablePublishLogs.push({
          ...logBase,
          action: "create",
          legacyTableIdAfter: legacyTableId,
        });
      }
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
    const isGeneratedNewOperationalTable =
      isGeneratedV2OperationalTableId(legacyTableId) &&
      newOperationalTableLinks.some(
        (link) => link.instanceId === instance.id && link.legacyTableIdAfter === legacyTableId,
      );
    let existing: Record<string, unknown> | null = null;
    if (!isGeneratedNewOperationalTable) {
      rememberLastFirestoreReadOperation({
        operation: "getDoc",
        documentPath: ref.path,
        collectionName: "tables",
        restaurantId,
      });
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "legacy_table_not_found",
        });
        continue;
      }

      existing = snap.data() as Record<string, unknown>;
      if (stringOrEmpty(existing.restaurantId) !== restaurantId) {
        skippedTables.push({
          id: instance.id,
          name: instance.name,
          reason: "restaurant_mismatch",
        });
        continue;
      }
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

    const floorPlanId = resolvedFloorPlanId;
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

    if (isGeneratedNewOperationalTable) {
      payload.id = legacyTableId;
      payload.type = "table";
      payload.status = TABLE_MAP_STATUS_FREE;
      payload.isActive = true;
      payload.source = "editor-v2";
      payload.editorV2ElementId = instance.id;
      payload.editorV2InstanceId = instance.id;
      payload.editorV2ElementType = "operational:TABLE";
      payload.metadata = {
        legacyTableId,
        source: "editor-v2",
        editorV2ElementId: instance.id,
        editorV2InstanceId: instance.id,
        editorV2ElementType: "operational:TABLE",
      };
      if (!payload.tableShape) payload.tableShape = "square";
      if (!payload.seats) payload.seats = Math.max(1, Math.round(instance.capacity || 1));
    }

    tableWrites.push({
      ref,
      data: payload,
      mode: isGeneratedNewOperationalTable ? "setMerge" : "update",
      diagnosticLabel: "operationalTable:update",
      existingRestaurantId: existing ? stringOrEmpty(existing.restaurantId) || null : null,
    });
  }

  if (newOperationalTablePublishLogs.length > 0) {
    console.groupCollapsed("[SalaEditorV2][NewOperationalTablePublish]");
    console.table(newOperationalTablePublishLogs);
    console.groupEnd();
  }

  const writeFloorPlanId = (write: PublicationWrite | undefined): string | null => {
    if (!write) return null;
    return stringOrEmpty(write.data.floorPlanId) || null;
  };
  const uniqueFloorPlanIds = (ids: (string | null)[]): string[] =>
    [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const tableWriteById = new Map(tableWrites.map((write) => [write.ref.id, write]));
  const zoneWriteById = new Map(zoneWrites.map((write) => [write.ref.id, write]));
  const decorativeWriteById = new Map(
    decorativeWrites.map((write) => [write.ref.id, write]),
  );
  const newOperationalTableLinkByInstanceId = new Map(
    newOperationalTableLinks.map((link) => [link.instanceId, link]),
  );

  const publishSpaceAudit = document.espacios.map((space) => {
    const tableWritesForSpace = document.operationalElementInstances
      .filter((instance) => instance.elementType === "TABLE" && instance.spaceId === space.id)
      .map((instance) => {
        const newLink = newOperationalTableLinkByInstanceId.get(instance.id);
        const legacyTableId =
          readLegacyTableId(instance.metadata) || newLink?.legacyTableIdAfter || "";
        const write = legacyTableId ? tableWriteById.get(legacyTableId) : undefined;
        return {
          id: instance.id,
          name: instance.name,
          legacyTableId: legacyTableId || null,
          written: Boolean(write),
          floorPlanId: writeFloorPlanId(write),
        };
      })
      .filter((row) => row.written);

    const zoneWritesForSpace = document.zones
      .filter((zone) => zone.espacioId === space.id)
      .map((zone) => {
        const legacyZoneId =
          readLegacyZoneId(zone.metadata) || stableLegacyZoneIdFromV2Id(zone.id);
        const write = legacyZoneId ? zoneWriteById.get(legacyZoneId) : undefined;
        return {
          id: zone.id,
          name: zone.name,
          legacyZoneId: legacyZoneId || null,
          written: Boolean(write),
          floorPlanId: writeFloorPlanId(write),
        };
      })
      .filter((row) => row.written);

    const decorativeWritesForSpace = decorativeDrafts
      .filter((draft) => draft.spaceId === space.id)
      .map((draft) => {
        const write = draft.id ? decorativeWriteById.get(draft.id) : undefined;
        return {
          id: draft.sourceId,
          name: draft.name,
          legacyTableId: draft.id || null,
          type: draft.legacyType,
          sourceType: draft.sourceType,
          written: Boolean(write),
          floorPlanId: writeFloorPlanId(write),
        };
      })
      .filter((row) => row.written);

    const floorPlanIdsUsed = uniqueFloorPlanIds([
      ...tableWritesForSpace.map((row) => row.floorPlanId),
      ...zoneWritesForSpace.map((row) => row.floorPlanId),
      ...decorativeWritesForSpace.map((row) => row.floorPlanId),
    ]);

    return {
      spaceId: space.id,
      spaceName: space.name,
      legacyFloorPlanId: stringOrEmpty(space.legacyFloorPlanId) || null,
      publishedTables: tableWritesForSpace.length,
      publishedZones: zoneWritesForSpace.length,
      publishedDecoratives: decorativeWritesForSpace.length,
      floorPlanIdsUsed,
      consistentFloorPlanId:
        floorPlanIdsUsed.length === 1 ? floorPlanIdsUsed[0]! : null,
      allWritesUseSameFloorPlan: floorPlanIdsUsed.length <= 1,
      writes: {
        tables: tableWritesForSpace,
        zones: zoneWritesForSpace,
        decoratives: decorativeWritesForSpace,
      },
    };
  });

  console.groupCollapsed("[SalaEditorV2][PublishToTpvFloorPlanAudit]");
  console.info("Resumen por espacio", {
    restaurantId,
    uid: currentPublisherUid(),
    spaces: publishSpaceAudit.map((space) => ({
      spaceId: space.spaceId,
      spaceName: space.spaceName,
      legacyFloorPlanId: space.legacyFloorPlanId,
      publishedTables: space.publishedTables,
      publishedZones: space.publishedZones,
      publishedDecoratives: space.publishedDecoratives,
      floorPlanIdsUsed: space.floorPlanIdsUsed,
      allWritesUseSameFloorPlan: space.allWritesUseSameFloorPlan,
    })),
  });
  console.table(
    publishSpaceAudit.map((space) => ({
      spaceId: space.spaceId,
      spaceName: space.spaceName,
      legacyFloorPlanId: space.legacyFloorPlanId ?? "",
      publishedTables: space.publishedTables,
      publishedZones: space.publishedZones,
      publishedDecoratives: space.publishedDecoratives,
      floorPlanIdsUsed: space.floorPlanIdsUsed.join(", "),
      allWritesUseSameFloorPlan: space.allWritesUseSameFloorPlan,
    })),
  );
  console.info("Detalle de escrituras por espacio", publishSpaceAudit);
  console.groupEnd();

  console.info("[SalaEditorV2][FirestoreDiag] publisher TPV escrituras preparadas", {
    operation: "publishSalaEditorV2Phase1ToLegacy.prepareWrites",
    restaurantId,
    uid: currentPublisherUid(),
    counts: {
      decorativeWrites: decorativeWrites.length,
      floorPlanWrites: floorPlanWrites.length,
      zoneWrites: zoneWrites.length,
      decorativeDeactivateWrites: decorativeDeactivateWrites.length,
      legacyTableDeactivateWrites: legacyTableDeactivateWrites.length,
      tableWrites: tableWrites.length,
    },
  });

  await commitDecorativeWritesWithTrace(decorativeWrites, { restaurantId });
  await commitUpdateWrites(
    [
      ...floorPlanWrites,
      ...zoneWrites,
      ...decorativeDeactivateWrites,
      ...legacyTableDeactivateWrites,
      ...tableWrites,
    ],
    { restaurantId },
  );

  return {
    floorPlansUpdated: floorPlanWrites.length,
    tablesUpdated: tableWrites.length,
    zonesUpdated: zoneWrites.length,
    decorativeTablesUpdated: decorativeWrites.length,
    decorativeLegacyFound,
    decorativeLegacyDeactivated: decorativeDeactivateWrites.length,
    legacyTablesAudited,
    legacyTablesExpected: expectedLegacyTableIds.size,
    legacyTablesDeactivated: legacyTableDeactivateWrites.length,
    legacyTablesSkippedByReason,
    skippedTables,
    skippedZones,
    skippedDecorativeTables,
    skippedLegacyDecorativeTables,
    decorativeAudit,
    unsafeFloorPlanTables,
    newOperationalTableLinks,
  };
}
