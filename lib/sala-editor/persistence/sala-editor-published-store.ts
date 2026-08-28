import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
  assertSalaEditorPublishedRestaurantId,
  parseSalaEditorPublishedDocument,
  type SalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";

function publishedDocRef(restaurantId: string) {
  return doc(
    db,
    "restaurants",
    assertSalaEditorPublishedRestaurantId(restaurantId),
    SALA_EDITOR_MAPS_COLLECTION,
    SALA_EDITOR_PUBLISHED_DOC_ID,
  );
}

/**
 * Loader cliente de solo lectura para el snapshot V2 publicado.
 *
 * El cliente nunca escribe `published`. Las Firestore Rules pueden mantener
 * create/update bloqueados; la escritura se realiza exclusivamente mediante
 * Firebase Admin en servidor después de una publicación operativa válida.
 */
export async function loadSalaEditorPublished(
  restaurantId: string,
): Promise<SalaEditorPublishedDocument | null> {
  if (!isFirebaseConfigured) return null;
  const rid = assertSalaEditorPublishedRestaurantId(restaurantId);
  const snap = await getDoc(publishedDocRef(rid));
  if (!snap.exists()) return null;
  return parseSalaEditorPublishedDocument(snap.data(), rid);
}

export type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-contract";
export {
  SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION,
  buildSalaEditorPublishedPayload,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
