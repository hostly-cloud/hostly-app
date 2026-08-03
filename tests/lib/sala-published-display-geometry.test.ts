import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import {
  getOperationalInstanceCanvasSize,
  withOperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  computeEditorVisualLayout,
  getEditorCoordinateScale,
} from "@/lib/sala-editor/canvas/editor-visual-scale";
import {
  instanceTopLeftLayout,
  resolveOperationalInstanceDisplayLayout,
  resolvePublishedDisplayLayout,
  scaleLogicalElementBox,
  serializePublishedGeometry,
  serializeReadonlyDisplayGeometry,
} from "@/lib/sala-editor/persistence/sala-published-geometry";

describe("sala-published display geometry parity", () => {
  test("unidad canónica: datos lógicos; paint usa coordinateScale una vez", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const base = normalizeSalaEspacioBase(espacio.base);
    assert.equal(base.scale.pixelsPerUnit, 100);
    const display = resolvePublishedDisplayLayout(base);
    const editorLayout = computeEditorVisualLayout(base, null);
    assert.equal(display.stageWidth, editorLayout.stageWidth);
    assert.equal(display.stageHeight, editorLayout.stageHeight);
    assert.equal(
      display.coordinateScale,
      getEditorCoordinateScale(editorLayout),
    );
    assert.ok(display.coordinateScale < 1);
    assert.ok(display.coordinateScale > 0);
  });

  test("operativo: width/height no se remultiplican por pixelsPerUnit", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "19",
      position: { x: 200, y: 160 },
      capacity: 4,
      rotation: 15,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "round"),
        { width: 116, height: 116 },
      ),
    });
    const scale = resolvePublishedDisplayLayout(
      normalizeSalaEspacioBase(espacio.base),
    ).coordinateScale;
    const logical = instanceTopLeftLayout(instance);
    const display = resolveOperationalInstanceDisplayLayout(instance, scale);
    const size = getOperationalInstanceCanvasSize(instance);

    assert.equal(logical.width, size.width);
    assert.equal(logical.height, size.height);
    assert.equal(display.width, size.width);
    assert.equal(display.height, size.height);
    assert.notEqual(
      display.width,
      size.width * normalizeSalaEspacioBase(espacio.base).scale.pixelsPerUnit,
    );
    assert.equal(
      display.x,
      instance.position.x * scale - size.width / 2,
    );
    assert.equal(
      display.y,
      instance.position.y * scale - size.height / 2,
    );
    assert.equal(display.rotation, 15);
  });

  test("variantes: round / square / rectangular conservan caja paint", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const scale = resolvePublishedDisplayLayout(
      normalizeSalaEspacioBase(espacio.base),
    ).coordinateScale;
    for (const variant of ["round", "square", "rectangular"] as const) {
      const size =
        variant === "round"
          ? { width: 116, height: 116 }
          : variant === "square"
            ? { width: 96, height: 96 }
            : { width: 120, height: 70 };
      const instance = buildOperationalElementInstance({
        spaceId: espacio.id,
        elementType: "TABLE",
        name: variant,
        position: { x: 150, y: 150 },
        capacity: 4,
        metadata: withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, variant),
          size,
        ),
      });
      const display = resolveOperationalInstanceDisplayLayout(instance, scale);
      assert.equal(display.width, size.width);
      assert.equal(display.height, size.height);
      assert.equal(display.variant, variant);
    }
  });

  test("estructural/landscape/surface/zone: × coordinateScale una vez", () => {
    const scale = 0.72;
    const box = scaleLogicalElementBox(
      { x: 100, y: 50, width: 200, height: 80, rotation: 10 },
      scale,
    );
    assert.equal(box.x, 100 * scale);
    assert.equal(box.y, 50 * scale);
    assert.equal(box.width, 200 * scale);
    assert.equal(box.height, 80 * scale);
    assert.equal(box.rotation, 10);
    const again = scaleLogicalElementBox(box, 1);
    assert.deepEqual(again, box);
  });

  test("serialize display ≠ logical stage; operativo conserva tamaño glyph", () => {
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
    const table = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "5",
      position: { x: 300, y: 200 },
      capacity: 4,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "rectangular"),
        { width: 120, height: 70 },
      ),
    });
    doc.operationalElementInstances = [table];
    doc.structuralElements = [
      {
        id: "bar-1",
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
    doc.surfaceObjects = [
      {
        id: "surf-1",
        espacioId: espacio.id,
        material: "wood",
        x: 10,
        y: 10,
        width: 100,
        height: 400,
        visible: true,
        locked: false,
      },
    ];
    doc.zones = [
      {
        id: "zone-1",
        espacioId: espacio.id,
        type: "dining",
        name: "Z",
        x: 20,
        y: 20,
        width: 80,
        height: 80,
        color: "#fff",
        visible: true,
        locked: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    doc.walls = [
      {
        id: "w1",
        espacioId: espacio.id,
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 0,
      },
    ];

    const logical = serializePublishedGeometry(doc, espacio.id);
    const display = serializeReadonlyDisplayGeometry(doc, espacio.id);
    const scale = resolvePublishedDisplayLayout(
      normalizeSalaEspacioBase(espacio.base),
    ).coordinateScale;

    const logicalTable = logical.find((r) => r.id === table.id)!;
    const displayTable = display.find((r) => r.id === table.id)!;
    assert.equal(displayTable.width, logicalTable.width);
    assert.equal(displayTable.height, logicalTable.height);
    assert.notEqual(displayTable.x, logicalTable.x);

    const logicalBar = logical.find((r) => r.id === "bar-1")!;
    const displayBar = display.find((r) => r.id === "bar-1")!;
    assert.equal(displayBar.width, logicalBar.width * scale);
    assert.equal(displayBar.height, logicalBar.height * scale);

    for (const id of ["palm-1", "surf-1", "zone-1", "w1"]) {
      const L = logical.find((r) => r.id === id)!;
      const D = display.find((r) => r.id === id)!;
      assert.equal(D.width, L.width * scale);
      assert.equal(D.height, L.height * scale);
    }
  });

  test("estado/overlay no forma parte de la geometría serializada", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "busy",
      position: { x: 100, y: 100 },
      capacity: 2,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "round"),
        { width: 80, height: 80 },
      ),
    });
    const a = resolveOperationalInstanceDisplayLayout(instance, 0.72);
    const b = resolveOperationalInstanceDisplayLayout(instance, 0.72);
    assert.deepEqual(
      { x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation },
      { x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation },
    );
  });
});
