import {
  SALA_EDITOR_DOCUMENT_VERSION,
  type SalaEditorDocument,
} from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_PUBLISHED_DOC_ID } from "@/lib/sala-editor/persistence/sala-editor-draft-store";

export type SalaEditorPublishedDocument = {
  id: typeof SALA_EDITOR_PUBLISHED_DOC_ID;
  state: typeof SALA_EDITOR_PUBLISHED_DOC_ID;
  schemaVersion: typeof SALA_EDITOR_DOCUMENT_VERSION;
  restaurantId: string;
  sourceDraftUpdatedAt: number;
  publishedAt: number;
  publishedBy: string;
  document: SalaEditorDocument;
};

export type TpvMapSource = "v2-published" | "legacy-fallback";

export function resolveTpvMapSource(
  published: SalaEditorPublishedDocument | null | undefined,
): TpvMapSource {
  if (!published) return "legacy-fallback";
  if (published.state !== SALA_EDITOR_PUBLISHED_DOC_ID) return "legacy-fallback";
  if (published.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION) {
    return "legacy-fallback";
  }
  if (!published.document || published.document.version !== SALA_EDITOR_DOCUMENT_VERSION) {
    return "legacy-fallback";
  }
  return "v2-published";
}

export function logReadonlyMapSource(
  source: TpvMapSource,
  extra?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  console.log(`[Hostly:ReadonlyMap] source=${source}`, extra ?? {});
}
