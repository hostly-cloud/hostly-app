import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
  buildSalaEditorPublishedPayload,
  type SalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

const DEACTIVATABLE_DECORATIVE_TYPES = new Set([
  "wall",
  "bar",
  "column",
  "pool",
  "door",
  "planter",
]);

export class UnsafePublishedDecorativeDeactivationError extends Error {
  constructor(readonly decorativeId: string) {
    super(`Decorativo no válido para retirada segura: ${decorativeId}`);
    this.name = "UnsafePublishedDecorativeDeactivationError";
  }
}

export function isSafePublishedDecorativeDeactivation(params: {
  data: unknown;
  restaurantId: string;
}): boolean {
  if (typeof params.data !== "object" || params.data === null) return false;
  const data = params.data as Record<string, unknown>;
  return (
    data.restaurantId === params.restaurantId &&
    typeof data.type === "string" &&
    DEACTIVATABLE_DECORATIVE_TYPES.has(data.type)
  );
}

export async function publishSalaEditorSnapshotWithAdmin(params: {
  db: Firestore;
  restaurantId: string;
  document: SalaEditorDocument;
  publishedBy: string;
  sourceDraftUpdatedAt?: number | null;
  publishedAt?: number;
  decorativeDeactivationIds?: string[];
}): Promise<{
  published: SalaEditorPublishedDocument;
  deactivatedDecoratives: number;
}> {
  const payload = buildSalaEditorPublishedPayload({
    restaurantId: params.restaurantId,
    document: params.document,
    publishedAt: params.publishedAt,
    publishedBy: params.publishedBy,
    sourceDraftUpdatedAt: params.sourceDraftUpdatedAt,
  });
  const decorativeIds = [...new Set(params.decorativeDeactivationIds ?? [])];
  const publishedRef = params.db
    .collection("restaurants")
    .doc(payload.restaurantId)
    .collection(SALA_EDITOR_MAPS_COLLECTION)
    .doc(SALA_EDITOR_PUBLISHED_DOC_ID);
  const decorativeRefs = decorativeIds.map((id) =>
    params.db.collection("tables").doc(id),
  );
  let deactivatedDecoratives = 0;

  await params.db.runTransaction(async (transaction) => {
    const snapshots =
      decorativeRefs.length > 0
        ? await transaction.getAll(...decorativeRefs)
        : [];

    for (const snapshot of snapshots) {
      if (
        !snapshot.exists ||
        !isSafePublishedDecorativeDeactivation({
          data: snapshot.data(),
          restaurantId: params.restaurantId,
        })
      ) {
        throw new UnsafePublishedDecorativeDeactivationError(snapshot.id);
      }
    }

    for (const snapshot of snapshots) {
      if (snapshot.data()?.isActive === false) continue;
      transaction.update(snapshot.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      deactivatedDecoratives += 1;
    }
    transaction.set(publishedRef, payload, { merge: false });
  });

  return {
    published: payload,
    deactivatedDecoratives,
  };
}

export async function saveSalaEditorPublishedWithAdmin(params: {
  db: Firestore;
  restaurantId: string;
  document: SalaEditorDocument;
  publishedBy: string;
  sourceDraftUpdatedAt?: number | null;
  publishedAt?: number;
}): Promise<SalaEditorPublishedDocument> {
  const result = await publishSalaEditorSnapshotWithAdmin(params);
  return result.published;
}
