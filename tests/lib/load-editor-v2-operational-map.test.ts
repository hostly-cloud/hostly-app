import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadTpvEditorV2OperationalMap,
  restorePublishedOperationalIdentityLinks,
} from "@/lib/tpv/load-editor-v2-operational-map";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

const publishedDocument = {
  id: "published-map",
  espacios: [],
  operationalElementInstances: [],
} as unknown as SalaEditorDocument;
const draftDocument = {
  id: "draft-map",
  espacios: [],
  operationalElementInstances: [],
} as unknown as SalaEditorDocument;

describe("loadTpvEditorV2OperationalMap", () => {
  it("usa siempre la geometría publicada", async () => {
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
    assert.equal(draftReads, 1);
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

  it("inicia published y draft en paralelo para evitar una cascada de red", async () => {
    let resolvePublished!: (
      value: Awaited<
        ReturnType<
          (typeof import("@/lib/sala-editor/persistence/sala-editor-published-store"))["loadSalaEditorPublished"]
        >
      >,
    ) => void;
    let draftStarted = false;
    const publishedPending = new Promise<
      Awaited<
        ReturnType<
          (typeof import("@/lib/sala-editor/persistence/sala-editor-published-store"))["loadSalaEditorPublished"]
        >
      >
    >((resolve) => {
      resolvePublished = resolve;
    });

    const resultPending = loadTpvEditorV2OperationalMap("restaurant-1", {
      loadPublished: () => publishedPending,
      loadDraft: async () => {
        draftStarted = true;
        return {
          document: draftDocument,
          updatedAt: 300,
        } as Awaited<
          ReturnType<
            (typeof import("@/lib/sala-editor/persistence/sala-editor-draft-store"))["loadSalaEditorDraftSource"]
          >
        >;
      },
    });

    await Promise.resolve();
    assert.equal(draftStarted, true);

    resolvePublished(null);
    const result = await resultPending;
    assert.equal(result?.source, "draft-migration");
  });

  it("restaura solo el enlace operativo perdido sin importar geometría draft", () => {
    const published = {
      espacios: [],
      operationalElementInstances: [
        {
          id: "mesa-2",
          position: { x: 120, y: 240 },
          metadata: {},
        },
      ],
    } as unknown as SalaEditorDocument;
    const draft = {
      espacios: [],
      operationalElementInstances: [
        {
          id: "mesa-2",
          position: { x: 999, y: 999 },
          metadata: { legacyTableId: "legacy-mesa-2" },
        },
      ],
    } as unknown as SalaEditorDocument;

    const repaired = restorePublishedOperationalIdentityLinks(published, draft);
    assert.deepEqual(repaired.operationalElementInstances[0]?.position, {
      x: 120,
      y: 240,
    });
    assert.equal(
      repaired.operationalElementInstances[0]?.metadata.legacyTableId,
      "legacy-mesa-2",
    );
  });
});
