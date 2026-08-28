import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { loadSalaEditorDraft } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { loadSalaEditorPublished } from "@/lib/sala-editor/persistence/sala-editor-published-store";

export type TpvEditorV2OperationalMapSource =
  | "published"
  | "draft-migration";

export type TpvEditorV2OperationalMap = {
  source: TpvEditorV2OperationalMapSource;
  document: SalaEditorDocument;
  publishedAt: number | null;
  sourceDraftUpdatedAt: number | null;
};

/**
 * Temporary migration loader for the TPV Editor V2 map.
 *
 * `published` is authoritative as soon as it exists. Draft is consulted only
 * when the restaurant has never produced a published V2 snapshot yet. Errors
 * while reading/validating an existing published snapshot are deliberately not
 * swallowed, so a broken published contract cannot silently fall back to an
 * editable draft and become a second source of truth.
 */
export async function loadTpvEditorV2OperationalMap(
  restaurantId: string,
): Promise<TpvEditorV2OperationalMap | null> {
  const published = await loadSalaEditorPublished(restaurantId);
  if (published) {
    return {
      source: "published",
      document: published.document,
      publishedAt: published.publishedAt,
      sourceDraftUpdatedAt: published.sourceDraftUpdatedAt ?? null,
    };
  }

  const draft = await loadSalaEditorDraft(restaurantId);
  if (!draft) return null;

  return {
    source: "draft-migration",
    document: draft.document,
    publishedAt: null,
    sourceDraftUpdatedAt: draft.updatedAt,
  };
}
