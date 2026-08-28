import type { Firestore } from "firebase-admin/firestore";
import {
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
  buildSalaEditorPublishedPayload,
  type SalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export async function saveSalaEditorPublishedWithAdmin(params: {
  db: Firestore;
  restaurantId: string;
  document: SalaEditorDocument;
  publishedBy: string;
  sourceDraftUpdatedAt?: number | null;
  publishedAt?: number;
}): Promise<SalaEditorPublishedDocument> {
  const payload = buildSalaEditorPublishedPayload({
    restaurantId: params.restaurantId,
    document: params.document,
    publishedAt: params.publishedAt,
    publishedBy: params.publishedBy,
    sourceDraftUpdatedAt: params.sourceDraftUpdatedAt,
  });

  await params.db
    .collection("restaurants")
    .doc(payload.restaurantId)
    .collection(SALA_EDITOR_MAPS_COLLECTION)
    .doc(SALA_EDITOR_PUBLISHED_DOC_ID)
    .set(payload, { merge: false });

  return payload;
}
