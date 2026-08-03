import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import {
  SALA_EDITOR_DRAFT_DOC_ID,
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-types";
import { validateSalaEditorDocumentForPublish } from "@/lib/sala-editor/persistence/validate-sala-editor-publish";
import { removeUndefinedFields } from "@/lib/sala-editor/persistence/remove-undefined-fields";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  instanceTopLeftLayout,
  resolveEspacioCanvasSize,
  resolveInstanceLegacyTableId,
} from "@/lib/sala-editor/persistence/sala-published-geometry";
import { resolveLegacyFloorPlanIdForEspacio } from "@/lib/sala-editor/persistence/sala-published-readonly-resolve";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { PlanElementType } from "@/lib/firestore/tables";
import { TABLE_MAP_STATUS_FREE } from "@/lib/firestore/tables";

export class PublishSalaEditorMapError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = "PublishSalaEditorMapError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type PublishSalaEditorMapResult = {
  published: true;
  restaurantId: string;
  publishedAt: number;
  sourceDraftUpdatedAt: number;
  floorPlanIds: string[];
  tableIds: string[];
};

function mapsDoc(db: Firestore, restaurantId: string, id: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId)
    .collection(SALA_EDITOR_MAPS_COLLECTION)
    .doc(id);
}

function parseDraftEnvelope(
  raw: Record<string, unknown> | undefined,
  restaurantId: string,
): { document: SalaEditorDocument; updatedAt: number } {
  if (!raw || typeof raw !== "object") {
    throw new PublishSalaEditorMapError("DRAFT_NOT_FOUND", "No hay draft V2", 404);
  }
  if (raw.state !== SALA_EDITOR_DRAFT_DOC_ID) {
    throw new PublishSalaEditorMapError("DRAFT_INVALID", "Estado draft inválido", 409);
  }
  if (raw.restaurantId !== restaurantId) {
    throw new PublishSalaEditorMapError(
      "TABLE_TENANT_MISMATCH",
      "Draft de otro restaurante",
      403,
    );
  }
  if (raw.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new PublishSalaEditorMapError(
      "SCHEMA_VERSION_MISMATCH",
      "schemaVersion draft incompatible",
      409,
    );
  }
  const documentRaw = raw.document;
  if (!documentRaw || typeof documentRaw !== "object") {
    throw new PublishSalaEditorMapError("DRAFT_INVALID", "document ausente", 409);
  }
  const document = normalizeSalaEditorDocument(
    documentRaw as SalaEditorDocument,
  );
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : document.updatedAt;
  return { document, updatedAt };
}

function mapOpTypeToPlanType(t: OperationalElementType): PlanElementType {
  switch (t) {
    case "SUNBED":
      return "sunbed";
    case "BALINESE_BED":
      return "bed";
    case "BAR_STRAIGHT":
    case "BAR_L":
    case "BAR_SEAT":
      return "bar";
    default:
      return "table";
  }
}

function isOrderableOperationalType(t: OperationalElementType): boolean {
  return (
    t === "TABLE" ||
    t === "HIGH_TABLE" ||
    t === "SUNBED" ||
    t === "BALINESE_BED" ||
    t === "SOFA" ||
    t === "CUSTOM"
  );
}

function tableShapeFromVariant(
  variant: string | null,
): "square" | "round" {
  return variant === "round" ? "round" : "square";
}

/** Campos de geometría/publicación — nunca sobrescriben estado operativo. */
function publishedTableGeometryFields(fields: Record<string, unknown>) {
  return removeUndefinedFields(fields);
}

/** Solo mesas nuevas: estado inicial free. Mesas existentes: omitir status/isActive. */
function publishedTableCreateDefaults(isNew: boolean) {
  if (!isNew) return {};
  return {
    status: TABLE_MAP_STATUS_FREE,
    isActive: true,
  };
}

/**
 * Publica draft → salaEditorMaps/published + sync legacy floorPlans/tables.
 * No modifica el draft. Si la validación falla, no escribe published.
 */
export async function publishSalaEditorMap(params: {
  db: Firestore;
  restaurantId: string;
  uid: string;
}): Promise<PublishSalaEditorMapResult> {
  const restaurantId = params.restaurantId.trim();
  const uid = params.uid.trim();
  if (!restaurantId) {
    throw new PublishSalaEditorMapError("RESTAURANT_ID_REQUIRED", "restaurantId requerido");
  }
  if (!uid) {
    throw new PublishSalaEditorMapError("UNAUTHORIZED", "uid requerido", 401);
  }

  const draftSnap = await mapsDoc(params.db, restaurantId, SALA_EDITOR_DRAFT_DOC_ID).get();
  if (!draftSnap.exists) {
    throw new PublishSalaEditorMapError("DRAFT_NOT_FOUND", "No hay draft V2", 404);
  }

  const { document: draftDocument, updatedAt: sourceDraftUpdatedAt } =
    parseDraftEnvelope(
      draftSnap.data() as Record<string, unknown> | undefined,
      restaurantId,
    );

  const validated = validateSalaEditorDocumentForPublish(
    draftDocument,
    restaurantId,
  );
  if (!validated.ok) {
    throw new PublishSalaEditorMapError(
      validated.error.code,
      validated.error.message,
      400,
    );
  }

  const document = validated.document;
  // Conserva / estampa vínculo operativo estable en metadata.legacyTableId.
  for (const instance of document.operationalElementInstances) {
    if (!isOrderableOperationalType(instance.elementType)) continue;
    const tableId = resolveInstanceLegacyTableId(instance);
    if (!tableId) continue;
    const meta = instance.metadata ?? {};
    const existing =
      typeof meta.legacyTableId === "string" ? meta.legacyTableId.trim() : "";
    if (!existing) {
      instance.metadata = { ...meta, legacyTableId: tableId };
    }
  }
  const publishedAt = Date.now();
  const envelope: SalaEditorPublishedDocument = {
    id: SALA_EDITOR_PUBLISHED_DOC_ID,
    state: SALA_EDITOR_PUBLISHED_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    restaurantId,
    sourceDraftUpdatedAt,
    publishedAt,
    publishedBy: uid,
    document,
  };

  const floorPlanIds: string[] = [];
  const tableIds: string[] = [];

  const floorPlanIdByEspacioId = new Map<string, string>();
  for (const espacio of document.espacios) {
    if (espacio.active === false || espacio.visible === false) continue;
    const floorPlanId = resolveLegacyFloorPlanIdForEspacio(espacio);
    if (!floorPlanId) continue;
    floorPlanIdByEspacioId.set(espacio.id, floorPlanId);
  }

  // IDs de tables a upsert (para leer existencia y no pisar estado operativo).
  const candidateTableIds: string[] = [];
  for (const instance of document.operationalElementInstances) {
    if (instance.visible === false) continue;
    if (
      isOrderableOperationalType(instance.elementType) ||
      instance.elementType === "BAR_STRAIGHT" ||
      instance.elementType === "BAR_L"
    ) {
      if (instance.enabled === false && isOrderableOperationalType(instance.elementType)) {
        continue;
      }
      const tableId = resolveInstanceLegacyTableId(instance);
      if (tableId) candidateTableIds.push(tableId);
    }
  }
  for (const el of document.structuralElements) {
    if (
      el.kind === "wall" ||
      el.kind === "bar" ||
      el.kind === "planter" ||
      el.kind === "door" ||
      el.kind === "squareColumn" ||
      el.kind === "roundColumn"
    ) {
      candidateTableIds.push(`v2-struct-${el.id}`);
    }
  }
  for (const el of document.landscapeElements) {
    candidateTableIds.push(`v2-land-${el.id}`);
  }
  const uniqueCandidateIds = [...new Set(candidateTableIds.filter(Boolean))];
  const existingTableIds = new Set<string>();
  if (uniqueCandidateIds.length > 0) {
    const refs = uniqueCandidateIds.map((id) =>
      params.db.collection("tables").doc(id),
    );
    // getAll admite hasta 10 en algunos SDKs; chunk por seguridad.
    const chunkSize = 100;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const chunk = refs.slice(i, i + chunkSize);
      const snaps = await params.db.getAll(...chunk);
      for (const snap of snaps) {
        if (snap.exists) existingTableIds.add(snap.id);
      }
    }
  }

  const batch = params.db.batch();
  batch.set(
    mapsDoc(params.db, restaurantId, SALA_EDITOR_PUBLISHED_DOC_ID),
    removeUndefinedFields({
      ...envelope,
      serverPublishedAt: FieldValue.serverTimestamp(),
    }),
    { merge: false },
  );

  for (const espacio of document.espacios) {
    if (espacio.active === false || espacio.visible === false) continue;
    const floorPlanId = resolveLegacyFloorPlanIdForEspacio(espacio);
    if (!floorPlanId) continue;
    const base = normalizeSalaEspacioBase(espacio.base);
    const canvas = resolveEspacioCanvasSize(base);
    floorPlanIds.push(floorPlanId);
    batch.set(
      params.db.collection("floorPlans").doc(floorPlanId),
      removeUndefinedFields({
        restaurantId,
        name: espacio.name || floorPlanId,
        width: canvas.width,
        height: canvas.height,
        active: true,
        showInTpv: true,
        sortOrder: espacio.sortOrder ?? 0,
        updatedAt: publishedAt,
        source: "sala-editor-v2",
        espacioId: espacio.id,
      }),
      { merge: true },
    );
  }

  for (const instance of document.operationalElementInstances) {
    if (instance.visible === false || instance.enabled === false) continue;
    if (!isOrderableOperationalType(instance.elementType)) continue;
    const tableId = resolveInstanceLegacyTableId(instance);
    if (!tableId) continue;
    const layout = instanceTopLeftLayout(instance);
    const spaceId = String(instance.spaceId ?? "").trim();
    const floorPlanId =
      floorPlanIdByEspacioId.get(spaceId) ||
      spaceId ||
      undefined;
    tableIds.push(tableId);
    const isNew = !existingTableIds.has(tableId);
    batch.set(
      params.db.collection("tables").doc(tableId),
      publishedTableGeometryFields({
        restaurantId,
        name: instance.name || tableId,
        type: mapOpTypeToPlanType(instance.elementType),
        floorPlanId,
        tableShape: tableShapeFromVariant(layout.variant),
        seats: Math.max(1, Math.floor(instance.capacity || 4)),
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        rotation: layout.rotation,
        updatedAt: publishedAt,
        source: "sala-editor-v2",
        visualVariant: layout.variant ?? undefined,
        operationalInstanceId: instance.id,
        ...publishedTableCreateDefaults(isNew),
      }),
      { merge: true },
    );
  }

  // Barras estructurales/operativas como decorativos legacy (paridad visual TPV fallback).
  for (const instance of document.operationalElementInstances) {
    if (
      instance.elementType !== "BAR_STRAIGHT" &&
      instance.elementType !== "BAR_L"
    ) {
      continue;
    }
    if (instance.visible === false) continue;
    const tableId = resolveInstanceLegacyTableId(instance);
    if (!tableId) continue;
    const layout = instanceTopLeftLayout(instance);
    const spaceId = String(instance.spaceId ?? "").trim();
    const floorPlanId =
      floorPlanIdByEspacioId.get(spaceId) || spaceId || undefined;
    tableIds.push(tableId);
    const isNew = !existingTableIds.has(tableId);
    batch.set(
      params.db.collection("tables").doc(tableId),
      publishedTableGeometryFields({
        restaurantId,
        name: instance.name || "Barra",
        type: "bar" as PlanElementType,
        floorPlanId,
        tableShape: "square" as const,
        seats: 0,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        rotation: layout.rotation,
        updatedAt: publishedAt,
        source: "sala-editor-v2",
        operationalInstanceId: instance.id,
        ...publishedTableCreateDefaults(isNew),
      }),
      { merge: true },
    );
  }

  for (const el of document.structuralElements) {
    if (el.kind !== "wall" && el.kind !== "bar" && el.kind !== "planter" && el.kind !== "door" && el.kind !== "squareColumn" && el.kind !== "roundColumn") {
      continue;
    }
    const id = `v2-struct-${el.id}`;
    const planType: PlanElementType =
      el.kind === "bar"
        ? "bar"
        : el.kind === "planter"
          ? "planter"
          : el.kind === "door"
            ? "door"
            : el.kind === "squareColumn" || el.kind === "roundColumn"
              ? "column"
              : "wall";
    tableIds.push(id);
    const isNew = !existingTableIds.has(id);
    batch.set(
      params.db.collection("tables").doc(id),
      publishedTableGeometryFields({
        restaurantId,
        name: el.kind,
        type: planType,
        floorPlanId:
          floorPlanIdByEspacioId.get(el.espacioId) || el.espacioId,
        tableShape: el.kind === "roundColumn" ? "round" : "square",
        seats: 0,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation ?? 0,
        updatedAt: publishedAt,
        source: "sala-editor-v2",
        ...publishedTableCreateDefaults(isNew),
      }),
      { merge: true },
    );
  }

  for (const el of document.landscapeElements) {
    const id = `v2-land-${el.id}`;
    tableIds.push(id);
    const isNew = !existingTableIds.has(id);
    batch.set(
      params.db.collection("tables").doc(id),
      publishedTableGeometryFields({
        restaurantId,
        name: el.kind,
        type: "planter" as PlanElementType,
        floorPlanId:
          floorPlanIdByEspacioId.get(el.espacioId) || el.espacioId,
        tableShape: el.kind === "roundPlanter" ? "round" : "square",
        seats: 0,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        updatedAt: publishedAt,
        source: "sala-editor-v2",
        landscapeKind: el.kind,
        ...publishedTableCreateDefaults(isNew),
      }),
      { merge: true },
    );
  }

  await batch.commit();

  return {
    published: true,
    restaurantId,
    publishedAt,
    sourceDraftUpdatedAt,
    floorPlanIds: [...new Set(floorPlanIds)],
    tableIds: [...new Set(tableIds)],
  };
}

export async function loadSalaEditorPublishedAdmin(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<SalaEditorPublishedDocument | null> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) return null;
  const snap = await mapsDoc(
    params.db,
    restaurantId,
    SALA_EDITOR_PUBLISHED_DOC_ID,
  ).get();
  if (!snap.exists) return null;
  const raw = snap.data();
  if (!raw || raw.state !== SALA_EDITOR_PUBLISHED_DOC_ID) return null;
  if (raw.restaurantId !== restaurantId) return null;
  if (raw.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION) return null;
  if (!raw.document || typeof raw.document !== "object") return null;
  const document = normalizeSalaEditorDocument(
    raw.document as SalaEditorDocument,
  );
  if (document.restaurantId !== restaurantId) return null;
  return {
    id: SALA_EDITOR_PUBLISHED_DOC_ID,
    state: SALA_EDITOR_PUBLISHED_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    restaurantId,
    sourceDraftUpdatedAt:
      typeof raw.sourceDraftUpdatedAt === "number"
        ? raw.sourceDraftUpdatedAt
        : document.updatedAt,
    publishedAt:
      typeof raw.publishedAt === "number" ? raw.publishedAt : Date.now(),
    publishedBy:
      typeof raw.publishedBy === "string" ? raw.publishedBy : "",
    document,
  };
}
