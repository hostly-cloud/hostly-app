import {
  doc,
  getDoc,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  SALA_EDITOR_DRAFT_DOC_ID,
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";

export const SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION = 1 as const;

export type SalaEditorPublishedDocument = {
  id: typeof SALA_EDITOR_PUBLISHED_DOC_ID;
  restaurantId: string;
  state: typeof SALA_EDITOR_PUBLISHED_DOC_ID;
  schemaVersion: typeof SALA_EDITOR_DOCUMENT_VERSION;
  snapshotVersion: typeof SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION;
  document: SalaEditorDocument;
  publishedAt: number;
  publishedBy?: string;
  sourceDraftUpdatedAt?: number;
};

function assertRestaurantId(restaurantId: string): string {
  const rid = String(restaurantId ?? "").trim();
  if (!rid) {
    throw new Error("sala-editor-published: restaurantId no disponible");
  }
  return rid;
}

function publishedDocRef(restaurantId: string) {
  return doc(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    SALA_EDITOR_MAPS_COLLECTION,
    SALA_EDITOR_PUBLISHED_DOC_ID,
  );
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

function parseEditorDocument(
  raw: unknown,
  expectedRestaurantId: string,
): SalaEditorDocument {
  if (!isRecord(raw)) {
    throw new Error("sala-editor-published: document invalido");
  }
  if (raw.version !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new Error("sala-editor-published: version incompatible");
  }
  if (raw.restaurantId !== expectedRestaurantId) {
    throw new Error("sala-editor-published: restaurantId no coincide");
  }
  return normalizeSalaEditorDocument(raw as SalaEditorDocument);
}

function parsePublishedDocument(
  raw: DocumentData,
  expectedRestaurantId: string,
): SalaEditorPublishedDocument {
  if (raw.state !== SALA_EDITOR_PUBLISHED_DOC_ID) {
    throw new Error("sala-editor-published: estado no es published");
  }
  if (raw.restaurantId !== expectedRestaurantId) {
    throw new Error("sala-editor-published: tenant no coincide");
  }
  if (raw.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new Error("sala-editor-published: schemaVersion incompatible");
  }
  if (raw.snapshotVersion !== SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION) {
    throw new Error("sala-editor-published: snapshotVersion incompatible");
  }

  const publishedAt =
    typeof raw.publishedAt === "number" && Number.isFinite(raw.publishedAt)
      ? raw.publishedAt
      : 0;
  if (publishedAt <= 0) {
    throw new Error("sala-editor-published: publishedAt invalido");
  }

  const publishedBy =
    typeof raw.publishedBy === "string" && raw.publishedBy.trim() !== ""
      ? raw.publishedBy.trim()
      : undefined;
  const sourceDraftUpdatedAt =
    typeof raw.sourceDraftUpdatedAt === "number" &&
    Number.isFinite(raw.sourceDraftUpdatedAt) &&
    raw.sourceDraftUpdatedAt > 0
      ? raw.sourceDraftUpdatedAt
      : undefined;

  return {
    id: SALA_EDITOR_PUBLISHED_DOC_ID,
    restaurantId: expectedRestaurantId,
    state: SALA_EDITOR_PUBLISHED_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    snapshotVersion: SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION,
    document: parseEditorDocument(raw.document, expectedRestaurantId),
    publishedAt,
    ...(publishedBy ? { publishedBy } : {}),
    ...(sourceDraftUpdatedAt ? { sourceDraftUpdatedAt } : {}),
  };
}

export function buildSalaEditorPublishedPayload(params: {
  restaurantId: string;
  document: SalaEditorDocument;
  publishedAt?: number;
  publishedBy?: string | null;
  sourceDraftUpdatedAt?: number | null;
}): SalaEditorPublishedDocument {
  const restaurantId = assertRestaurantId(params.restaurantId);
  if (params.document.restaurantId !== restaurantId) {
    throw new Error("sala-editor-published: document.restaurantId no coincide");
  }

  const publishedAt =
    typeof params.publishedAt === "number" && Number.isFinite(params.publishedAt)
      ? params.publishedAt
      : Date.now();
  const publishedBy = params.publishedBy?.trim() || undefined;
  const sourceDraftUpdatedAt =
    typeof params.sourceDraftUpdatedAt === "number" &&
    Number.isFinite(params.sourceDraftUpdatedAt) &&
    params.sourceDraftUpdatedAt > 0
      ? params.sourceDraftUpdatedAt
      : undefined;

  return removeUndefinedFields({
    id: SALA_EDITOR_PUBLISHED_DOC_ID,
    restaurantId,
    state: SALA_EDITOR_PUBLISHED_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    snapshotVersion: SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION,
    document: normalizeSalaEditorDocument(params.document),
    publishedAt,
    publishedBy,
    sourceDraftUpdatedAt,
  });
}

export async function loadSalaEditorPublished(
  restaurantId: string,
): Promise<SalaEditorPublishedDocument | null> {
  if (!isFirebaseConfigured) return null;
  const rid = assertRestaurantId(restaurantId);
  const snap = await getDoc(publishedDocRef(rid));
  if (!snap.exists()) return null;
  return parsePublishedDocument(snap.data(), rid);
}

/**
 * Writer del snapshot V2 completo.
 *
 * No se debe invocar hasta que las Firestore Rules habiliten explícitamente el
 * estado `published` y el publicador haya completado correctamente la proyección
 * operativa. El TPV tampoco debe leer este documento hasta completar ese cutover.
 */
export async function saveSalaEditorPublished(params: {
  restaurantId: string;
  document: SalaEditorDocument;
  publishedAt?: number;
  publishedBy?: string | null;
  sourceDraftUpdatedAt?: number | null;
}): Promise<SalaEditorPublishedDocument | null> {
  if (!isFirebaseConfigured) return null;
  const payload = buildSalaEditorPublishedPayload(params);
  await setDoc(publishedDocRef(payload.restaurantId), payload, { merge: false });
  return payload;
}

export function currentSalaEditorPublisherUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

// Keep the draft identifier imported intentionally so accidental attempts to
// serialize a draft through this module are easy to guard in tests/refactors.
export const SALA_EDITOR_NON_PUBLISHED_STATE = SALA_EDITOR_DRAFT_DOC_ID;
