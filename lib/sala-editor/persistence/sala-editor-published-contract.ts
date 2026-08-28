import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";

export const SALA_EDITOR_MAPS_COLLECTION = "salaEditorMaps" as const;
export const SALA_EDITOR_PUBLISHED_DOC_ID = "published" as const;
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

export function assertSalaEditorPublishedRestaurantId(restaurantId: string): string {
  const rid = String(restaurantId ?? "").trim();
  if (!rid) {
    throw new Error("sala-editor-published: restaurantId no disponible");
  }
  return rid;
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

export function parseSalaEditorDocumentForPublished(
  raw: unknown,
  expectedRestaurantId: string,
): SalaEditorDocument {
  const restaurantId = assertSalaEditorPublishedRestaurantId(expectedRestaurantId);
  if (!isRecord(raw)) {
    throw new Error("sala-editor-published: document invalido");
  }
  if (raw.version !== SALA_EDITOR_DOCUMENT_VERSION) {
    throw new Error("sala-editor-published: version incompatible");
  }
  if (raw.restaurantId !== restaurantId) {
    throw new Error("sala-editor-published: restaurantId no coincide");
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
    throw new Error("sala-editor-published: estructura incompleta");
  }
  return normalizeSalaEditorDocument(raw as SalaEditorDocument);
}

export function parseSalaEditorPublishedDocument(
  raw: unknown,
  expectedRestaurantId: string,
): SalaEditorPublishedDocument {
  const restaurantId = assertSalaEditorPublishedRestaurantId(expectedRestaurantId);
  if (!isRecord(raw)) {
    throw new Error("sala-editor-published: payload invalido");
  }
  if (raw.state !== SALA_EDITOR_PUBLISHED_DOC_ID) {
    throw new Error("sala-editor-published: estado no es published");
  }
  if (raw.restaurantId !== restaurantId) {
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
    restaurantId,
    state: SALA_EDITOR_PUBLISHED_DOC_ID,
    schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
    snapshotVersion: SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION,
    document: parseSalaEditorDocumentForPublished(raw.document, restaurantId),
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
  const restaurantId = assertSalaEditorPublishedRestaurantId(params.restaurantId);
  const document = parseSalaEditorDocumentForPublished(params.document, restaurantId);
  const publishedAt =
    typeof params.publishedAt === "number" && Number.isFinite(params.publishedAt)
      ? params.publishedAt
      : Date.now();
  if (publishedAt <= 0) {
    throw new Error("sala-editor-published: publishedAt invalido");
  }

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
    document,
    publishedAt,
    publishedBy,
    sourceDraftUpdatedAt,
  });
}
