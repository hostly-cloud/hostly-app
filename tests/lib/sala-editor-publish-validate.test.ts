import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { validateSalaEditorDocumentForPublish } from "@/lib/sala-editor/persistence/validate-sala-editor-publish";
import { serializePublishedGeometry } from "@/lib/sala-editor/persistence/sala-published-geometry";
import {
  resolveTpvMapSource,
  type SalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-types";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_PUBLISHED_DOC_ID } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { removeUndefinedFields } from "@/lib/sala-editor/persistence/remove-undefined-fields";

describe("sala-editor publish validate + parity", () => {
  test("draft válido pasa validación", () => {
    const rid = "rest-a";
    const doc = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    doc.espacios = [espacio];
    const round = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "Mesa 1",
      position: { x: 120, y: 100 },
      capacity: 4,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "round"),
        { width: 80, height: 80 },
      ),
    });
    const rect = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "Mesa 2",
      position: { x: 280, y: 100 },
      capacity: 4,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "rectangular"),
        { width: 120, height: 70 },
      ),
    });
    doc.operationalElementInstances = [round, rect];
    doc.structuralElements = [
      {
        id: "wall-1",
        espacioId: espacio.id,
        kind: "bar",
        x: 40,
        y: 200,
        width: 180,
        height: 48,
        rotation: 0,
      },
    ];
    doc.landscapeElements = [
      {
        id: "palm-1",
        espacioId: espacio.id,
        kind: "palm",
        x: 400,
        y: 40,
        width: 72,
        height: 72,
        locked: false,
        visible: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const result = validateSalaEditorDocumentForPublish(doc, rid);
    assert.equal(result.ok, true);

    const geo = serializePublishedGeometry(doc, espacio.id);
    const types = geo.map((g) => g.type);
    assert.ok(types.includes("TABLE"));
    assert.ok(types.includes("structural:bar"));
    assert.ok(types.includes("landscape:palm"));
    const roundRow = geo.find((g) => g.id === round.id);
    assert.equal(roundRow?.variant, "round");
    const rectRow = geo.find((g) => g.id === rect.id);
    assert.equal(rectRow?.variant, "rectangular");
    assert.notEqual(roundRow?.width, rectRow?.width);
  });

  test("tenant mismatch rechaza", () => {
    const doc = createEmptySalaEditorDocument("rest-a");
    const result = validateSalaEditorDocumentForPublish(doc, "rest-b");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "TABLE_TENANT_MISMATCH");
  });

  test("removeUndefinedFields elimina undefined y conserva null/0", () => {
    const cleaned = removeUndefinedFields({
      a: 0,
      b: null,
      c: undefined,
      d: { e: undefined, f: false },
    });
    assert.deepEqual(cleaned, { a: 0, b: null, d: { f: false } });
  });

  test("resolveTpvMapSource: published válido vs fallback", () => {
    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: "rest-a",
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document: createEmptySalaEditorDocument("rest-a"),
    };
    assert.equal(resolveTpvMapSource(published), "v2-published");
    assert.equal(resolveTpvMapSource(null), "legacy-fallback");
    assert.equal(
      resolveTpvMapSource({ ...published, schemaVersion: 99 as never }),
      "legacy-fallback",
    );
  });

  test("paridad geométrica: mismos campos tras serialize", () => {
    const rid = "rest-a";
    const doc = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    doc.espacios = [espacio];
    const square = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "19",
      position: { x: 200, y: 160 },
      capacity: 4,
      rotation: 15,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "square"),
        { width: 90, height: 90 },
      ),
    });
    doc.operationalElementInstances = [square];
    const a = serializePublishedGeometry(doc, espacio.id);
    const b = serializePublishedGeometry(doc, espacio.id);
    assert.deepEqual(a, b);
    assert.equal(a[0]?.rotation, 15);
    assert.equal(a[0]?.variant, "square");
  });
});
