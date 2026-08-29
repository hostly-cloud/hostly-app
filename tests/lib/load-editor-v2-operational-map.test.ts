import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTpvEditorV2OperationalMap } from "@/lib/tpv/load-editor-v2-operational-map";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

const publishedDocument = {
  id: "published-map",
} as unknown as SalaEditorDocument;
const draftDocument = { id: "draft-map" } as unknown as SalaEditorDocument;

describe("loadTpvEditorV2OperationalMap", () => {
  it("usa siempre el snapshot publicado y no consulta el borrador", async () => {
    let draftReads = 0;
    const result = await loadTpvEditorV2OperationalMap("restaurant-1", {
      loadPublished: async () =>
        ({
          document: publishedDocument,
          publishedAt: 200,
          sourceDraftUpdatedAt: 150,
        }) as Awaited<
          ReturnType<
            (typeof import("@/lib/sala-editor/persistence/sala-editor-published-store"))["loadSalaEditorPublished"]
          >
        >,
      loadDraft: async () => {
        draftReads += 1;
        return {
          document: draftDocument,
          updatedAt: 300,
        } as Awaited<
          ReturnType<
            (typeof import("@/lib/sala-editor/persistence/sala-editor-draft-store"))["loadSalaEditorDraft"]
          >
        >;
      },
    });

    assert.equal(result?.source, "published");
    assert.equal(result?.document, publishedDocument);
    assert.equal(draftReads, 0);
  });

  it("solo usa el borrador como migración si nunca se publicó un plano", async () => {
    const result = await loadTpvEditorV2OperationalMap("restaurant-1", {
      loadPublished: async () => null,
      loadDraft: async () =>
        ({ document: draftDocument, updatedAt: 300 }) as Awaited<
          ReturnType<
            (typeof import("@/lib/sala-editor/persistence/sala-editor-draft-store"))["loadSalaEditorDraft"]
          >
        >,
    });

    assert.equal(result?.source, "draft-migration");
    assert.equal(result?.document, draftDocument);
  });
});
