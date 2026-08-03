import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { SALA_EDITOR_PUBLISHED_DOC_ID } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-types";
import {
  buildReadonlyMapPublishedDiag,
  resolveLegacyFloorPlanIdForEspacio,
  resolvePublishedEspacioForTpvPlan,
  shouldShowLegacyMapEmptyState,
} from "@/lib/sala-editor/persistence/sala-published-readonly-resolve";

function makeTable(
  spaceId: string,
  name: string,
  opts?: { legacyTableId?: string; id?: string },
) {
  const instance = buildOperationalElementInstance({
    spaceId,
    elementType: "TABLE",
    name,
    position: { x: 100, y: 100 },
    capacity: 4,
    metadata: {
      ...withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "rectangular"),
        { width: 100, height: 70 },
      ),
      ...(opts?.legacyTableId
        ? { legacyTableId: opts.legacyTableId }
        : {}),
    },
  });
  if (opts?.id) instance.id = opts.id;
  return instance;
}

describe("sala-published-readonly-resolve", () => {
  test("espacio.id !== legacyFloorPlanId → selección por legacy", () => {
    const rid = "rest-a";
    const doc = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "main-floor";
    doc.espacios = [espacio];
    assert.notEqual(espacio.id, "main-floor");
    assert.equal(resolveLegacyFloorPlanIdForEspacio(espacio), "main-floor");
    const resolved = resolvePublishedEspacioForTpvPlan(doc, "main-floor");
    assert.equal(resolved?.id, espacio.id);
  });

  test("published.document envelope: diag lee document, no el wrapper", () => {
    const rid = "rest-a";
    const document = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    document.espacios = [espacio];
    const tables = Array.from({ length: 5 }, (_, i) =>
      makeTable(espacio.id, `M${i + 1}`, { legacyTableId: `tbl-${i + 1}` }),
    );
    document.operationalElementInstances = tables;
    document.structuralElements = [
      {
        id: "bar-1",
        espacioId: espacio.id,
        kind: "bar",
        x: 10,
        y: 10,
        width: 120,
        height: 40,
        rotation: 0,
      },
    ];

    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: rid,
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document,
    };

    const linkedIds = tables.map((_, i) => `tbl-${i + 1}`);
    const diag = buildReadonlyMapPublishedDiag({
      source: "v2-published",
      published,
      selectedPlanId: espacio.id,
      selectedSpaceId: espacio.id,
      legacyActiveTableIds: linkedIds,
      legacyKnownTableIds: linkedIds,
      legacyActiveTableCount: 0,
    });

    assert.equal(diag.publishedExists, true);
    assert.equal(diag.publishedTableCount, 5);
    assert.equal(diag.linkedTableCount, 5);
    assert.equal(diag.unboundTableCount, 0);
    assert.ok(diag.resolvedReadonlyElementCount >= 6);
    assert.equal(diag.legacyActiveTableCount, 0);
  });

  test("5 TABLE vinculadas → linkedTableCount 5", () => {
    const rid = "rest-a";
    const document = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    document.espacios = [espacio];
    document.operationalElementInstances = Array.from({ length: 5 }, (_, i) =>
      makeTable(espacio.id, `M${i + 1}`, { legacyTableId: `t-${i}` }),
    );
    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: rid,
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document,
    };
    const diag = buildReadonlyMapPublishedDiag({
      source: "v2-published",
      published,
      selectedPlanId: "other-legacy-id",
      selectedSpaceId: null,
      legacyActiveTableIds: ["t-0", "t-1", "t-2", "t-3", "t-4"],
      legacyActiveTableCount: 5,
    });
    // selectedPlanId no coincide → fallback primer espacio
    assert.equal(diag.selectedSpaceId, espacio.id);
    assert.equal(diag.linkedTableCount, 5);
  });

  test("TABLE sin vínculo → unbound, sigue en resolved", () => {
    const rid = "rest-a";
    const document = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    document.espacios = [espacio];
    const unbound = makeTable(espacio.id, "Huérfana", {
      id: "op-orphan",
    });
    document.operationalElementInstances = [unbound];
    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: rid,
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document,
    };
    const diag = buildReadonlyMapPublishedDiag({
      source: "v2-published",
      published,
      selectedPlanId: espacio.id,
      selectedSpaceId: espacio.id,
      legacyActiveTableIds: [],
      legacyKnownTableIds: [],
      legacyActiveTableCount: 0,
    });
    assert.equal(diag.publishedTableCount, 1);
    assert.equal(diag.linkedTableCount, 0);
    assert.equal(diag.unboundTableCount, 1);
    assert.ok(diag.resolvedReadonlyElementCount >= 1);
    assert.ok(
      diag.discarded.some(
        (d) => d.id === unbound.id && d.reason === "missing-link",
      ),
    );
  });

  test("0 mesas + paredes/barra → resolved > 0 (no empty-state V2)", () => {
    const rid = "rest-a";
    const document = createEmptySalaEditorDocument(rid);
    const espacio = createLocalEspacio({
      restaurantId: rid,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    document.espacios = [espacio];
    document.operationalElementInstances = [];
    document.walls = [
      {
        id: "w1",
        espacioId: espacio.id,
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 0,
      },
    ];
    document.structuralElements = [
      {
        id: "bar-1",
        espacioId: espacio.id,
        kind: "bar",
        x: 20,
        y: 40,
        width: 160,
        height: 48,
        rotation: 0,
      },
    ];
    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: rid,
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document,
    };
    const diag = buildReadonlyMapPublishedDiag({
      source: "v2-published",
      published,
      selectedPlanId: espacio.id,
      selectedSpaceId: espacio.id,
      legacyActiveTableIds: [],
      legacyActiveTableCount: 0,
    });
    assert.equal(diag.publishedTableCount, 0);
    assert.ok(diag.resolvedReadonlyElementCount >= 2);
    assert.equal(shouldShowLegacyMapEmptyState("v2-published", 0), false);
  });

  test("legacy-fallback con 0 mesas → empty-state sí", () => {
    assert.equal(shouldShowLegacyMapEmptyState("legacy-fallback", 0), true);
    assert.equal(shouldShowLegacyMapEmptyState("legacy-fallback", 3), false);
  });

  test("space-mismatch no mezcla instancias de otro espacio", () => {
    const rid = "rest-a";
    const document = createEmptySalaEditorDocument(rid);
    const a = createLocalEspacio({
      restaurantId: rid,
      name: "A",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const b = createLocalEspacio({
      restaurantId: rid,
      name: "B",
      tipo: "terraza",
      color: "#22c55e",
      sortOrder: 1,
    });
    document.espacios = [a, b];
    document.operationalElementInstances = [
      makeTable(a.id, "A1", { legacyTableId: "ta1" }),
      makeTable(b.id, "B1", { legacyTableId: "tb1" }),
    ];
    const published: SalaEditorPublishedDocument = {
      id: SALA_EDITOR_PUBLISHED_DOC_ID,
      state: SALA_EDITOR_PUBLISHED_DOC_ID,
      schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
      restaurantId: rid,
      sourceDraftUpdatedAt: 1,
      publishedAt: 2,
      publishedBy: "u1",
      document,
    };
    const diag = buildReadonlyMapPublishedDiag({
      source: "v2-published",
      published,
      selectedPlanId: a.id,
      selectedSpaceId: a.id,
      legacyActiveTableIds: ["ta1", "tb1"],
      legacyActiveTableCount: 1,
    });
    assert.equal(diag.linkedTableCount, 1);
    assert.ok(
      diag.discarded.some(
        (d) => d.reason === "space-mismatch" && d.id.includes(""),
      ),
    );
    assert.equal(
      diag.discarded.filter((d) => d.reason === "space-mismatch").length,
      1,
    );
  });
});
