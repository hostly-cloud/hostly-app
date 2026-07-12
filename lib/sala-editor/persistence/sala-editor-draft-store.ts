import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { auth, db, firebaseEnvDebug, isFirebaseConfigured } from "@/lib/firebase/client";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";

export const SALA_EDITOR_MAPS_COLLECTION = "salaEditorMaps" as const;
export const SALA_EDITOR_DRAFT_DOC_ID = "draft" as const;
export const SALA_EDITOR_PUBLISHED_DOC_ID = "published" as const;

export type SalaEditorMapState =
  | typeof SALA_EDITOR_DRAFT_DOC_ID
  | typeof SALA_EDITOR_PUBLISHED_DOC_ID;

export type SalaEditorDraftDocument = {
  id: typeof SALA_EDITOR_DRAFT_DOC_ID;
  restaurantId: string;
  state: typeof SALA_EDITOR_DRAFT_DOC_ID;
  schemaVersion: typeof SALA_EDITOR_DOCUMENT_VERSION;
  document: SalaEditorDocument;
  updatedAt: number;
  updatedBy?: string;
};

function assertRestaurantId(restaurantId: string): string {
  const rid = String(restaurantId ?? "").trim();
  if (!rid) {
    throw new Error("sala-editor-draft: restaurantId no disponible");
  }
  return rid;
}

function draftDocRef(restaurantId: string) {
  return doc(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    SALA_EDITOR_MAPS_COLLECTION,
    SALA_EDITOR_DRAFT_DOC_ID,
  );
}

function firestoreErrorDetails(error: unknown): { code: string | null; message: string } {
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    message: typeof candidate.message === "string" ? candidate.message : String(error),
  };
}

function draftWriteLogContext(params: {
  operation: "setDoc";
  ref: ReturnType<typeof draftDocRef>;
  restaurantId: string;
  document: SalaEditorDocument;
  updatedBy?: string;
}) {
  return {
    source: "saveSalaEditorDraft",
    firebaseProjectId: firebaseEnvDebug.projectId,
    operation: params.operation,
    documentPath: params.ref.path,
    collectionName: params.ref.parent.path,
    restaurantId: params.restaurantId,
    uid: auth.currentUser?.uid ?? null,
    payloadRestaurantId: params.document.restaurantId,
    payload: {
      id: SALA_EDITOR_DRAFT_DOC_ID,
      restaurantId: params.restaurantId,
      state: SALA_EDITOR_DRAFT_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      updatedBy: params.updatedBy ?? null,
      counts: {
        espacios: params.document.espacios.length,
        operationalElementInstances: params.document.operationalElementInstances.length,
        zones: params.document.zones.length,
        walls: params.document.walls.length,
        structuralElements: params.document.structuralElements.length,
        landscapeElements: params.document.landscapeElements.length,
        surfaceObjects: params.document.surfaceObjects.length,
      },
    },
    ruleContext: {
      rulesFile: "firestore.rules",
      relevantMatch: "/restaurants/{restaurantId}/salaEditorMaps/{mapState}",
      writeRequirement:
        "sameRestaurant(restaurantId) && canManageSettings() && request.resource.data.restaurantId == restaurantId && request.resource.data.state == 'draft'",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeUndefinedFields<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedFields(item)) as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    clean[key] = removeUndefinedFields(entry);
  }
  return clean as T;
}

function parseSalaEditorDocument(
  raw: unknown,
  expectedRestaurantId: string,
): SalaEditorDocument {
  if (!isRecord(raw)) {
    throw new Error("sala-editor-draft: document invalido");
  }

  if (raw.version !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new Error("sala-editor-draft: version incompatible");
  }

  if (raw.restaurantId !== expectedRestaurantId) {
    throw new Error("sala-editor-draft: restaurantId no coincide");
  }

  if (
    !Array.isArray(raw.espacios) ||
    !Array.isArray(raw.walls) ||
    (raw.wallAttachments !== undefined && !Array.isArray(raw.wallAttachments)) ||
    (raw.surfaceObjects !== undefined && !Array.isArray(raw.surfaceObjects)) ||
    (raw.zones !== undefined && !Array.isArray(raw.zones)) ||
    (raw.structuralElements !== undefined && !Array.isArray(raw.structuralElements)) ||
    (raw.landscapeElements !== undefined && !Array.isArray(raw.landscapeElements)) ||
    !Array.isArray(raw.operationalElements) ||
    !Array.isArray(raw.operationalElementInstances) ||
    !isRecord(raw.navigation)
  ) {
    throw new Error("sala-editor-draft: estructura incompleta");
  }

  return normalizeSalaEditorDocument(raw as SalaEditorDocument);
}

function parseDraftDocument(
  raw: unknown,
  expectedRestaurantId: string,
): SalaEditorDraftDocument {
  if (!isRecord(raw)) {
    throw new Error("sala-editor-draft: payload invalido");
  }

  if (raw.state !== SALA_EDITOR_DRAFT_DOC_ID) {
    throw new Error("sala-editor-draft: estado no es draft");
  }

  if (raw.restaurantId !== expectedRestaurantId) {
    throw new Error("sala-editor-draft: tenant no coincide");
  }

  if (raw.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new Error("sala-editor-draft: schemaVersion incompatible");
  }

  const document = parseSalaEditorDocument(raw.document, expectedRestaurantId);
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : document.updatedAt;
  const updatedBy =
    typeof raw.updatedBy === "string" && raw.updatedBy.trim() !== ""
      ? raw.updatedBy.trim()
      : undefined;

  return {
    id: SALA_EDITOR_DRAFT_DOC_ID,
    restaurantId: expectedRestaurantId,
    state: SALA_EDITOR_DRAFT_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    document,
    updatedAt,
    ...(updatedBy !== undefined ? { updatedBy } : {}),
  };
}

export async function loadSalaEditorDraft(
  restaurantId: string,
): Promise<SalaEditorDraftDocument | null> {
  if (!isFirebaseConfigured) return null;

  const rid = assertRestaurantId(restaurantId);
  const snap = await getDoc(draftDocRef(rid));
  if (!snap.exists()) return null;

  return parseDraftDocument(snap.data(), rid);
}

export async function saveSalaEditorDraft(
  restaurantId: string,
  document: SalaEditorDocument,
  options?: { updatedBy?: string | null },
): Promise<void> {
  if (!isFirebaseConfigured) return;

  const rid = assertRestaurantId(restaurantId);
  if (document.restaurantId !== rid) {
    throw new Error("sala-editor-draft: document.restaurantId no coincide");
  }

  const updatedBy = options?.updatedBy?.trim();
  const payload: SalaEditorDraftDocument & { serverSavedAt: unknown } = {
    id: SALA_EDITOR_DRAFT_DOC_ID,
    restaurantId: rid,
    state: SALA_EDITOR_DRAFT_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    document,
    updatedAt: Date.now(),
    ...(updatedBy ? { updatedBy } : {}),
    serverSavedAt: serverTimestamp(),
  };

  const ref = draftDocRef(rid);
  const logContext = draftWriteLogContext({
    operation: "setDoc",
    ref,
    restaurantId: rid,
    document,
    updatedBy,
  });

  console.info("[SalaEditorV2][FirestoreDiag] setDoc ejecutando", logContext);
  try {
    await setDoc(
      ref,
      removeUndefinedFields(payload) as DocumentData,
      { merge: false },
    );
    console.info("[SalaEditorV2][FirestoreDiag] setDoc OK", {
      operation: logContext.operation,
      documentPath: logContext.documentPath,
      collectionName: logContext.collectionName,
      restaurantId: logContext.restaurantId,
      uid: logContext.uid,
    });
  } catch (error) {
    const details = firestoreErrorDetails(error);
    console.error("[SalaEditorV2][FirestoreDiag] setDoc ERROR", {
      operation: logContext.operation,
      documentPath: logContext.documentPath,
      collectionName: logContext.collectionName,
      restaurantId: logContext.restaurantId,
      uid: logContext.uid,
      errorCode: details.code,
      errorMessage: details.message,
      error,
      ruleContext: logContext.ruleContext,
    });
    throw error;
  }
}
