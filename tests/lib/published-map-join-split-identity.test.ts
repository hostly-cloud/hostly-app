import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  collectPublishedOperationalTables,
  resolvePublishedTableBinding,
} from "@/lib/sala-editor/persistence/resolve-published-table-binding";
import type { Table } from "@/lib/firestore/tables";
import { HOSTLY_MAP_JOIN_TARGET_SELECTOR } from "@/lib/map/join-hit-test";
import {
  HOSTLY_MAP_JOIN_DRAG_END,
  HOSTLY_MAP_JOIN_DRAG_HOVER,
} from "@/lib/map/join-drag-events";

function runtimeTable(id: string, overrides: Partial<Table> = {}): Table {
  return {
    id,
    restaurantId: "rest-a",
    name: id,
    type: "table",
    status: "free",
    seats: 4,
    x: 0,
    y: 0,
    isActive: true,
    floorPlanId: "main-floor",
    ...overrides,
  } as Table;
}

describe("published map join/split identity", () => {
  test("instance.id !== resolvedTableId cuando hay legacyTableId", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "main-floor";
    const instance = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "5",
      position: { x: 100, y: 100 },
      capacity: 4,
      metadata: {
        ...withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, "rectangular"),
          { width: 100, height: 70 },
        ),
        legacyTableId: "runtime-mesa-5",
      },
    });
    assert.notEqual(instance.id, "runtime-mesa-5");
    const binding = resolvePublishedTableBinding({
      instance,
      runtimeTablesById: new Map([
        [
          "runtime-mesa-5",
          runtimeTable("runtime-mesa-5", { floorPlanId: "main-floor" }),
        ],
      ]),
      activeSpace: espacio,
      restaurantId: "rest-a",
    });
    assert.equal(binding.resolvedTableId, "runtime-mesa-5");
    assert.equal(binding.interactive, true);
    assert.notEqual(binding.resolvedTableId, instance.id);
  });

  test("dos mesas vinculadas → IDs runtime listos para join callback", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "main-floor";
    const a = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "5",
      position: { x: 80, y: 80 },
      capacity: 2,
      metadata: {
        ...withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, "round"),
          { width: 80, height: 80 },
        ),
        legacyTableId: "t5",
      },
    });
    const b = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "16",
      position: { x: 200, y: 80 },
      capacity: 2,
      metadata: {
        ...withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, "rectangular"),
          { width: 100, height: 70 },
        ),
        legacyTableId: "t16",
      },
    });
    const result = collectPublishedOperationalTables({
      instances: [a, b],
      activeSpace: espacio,
      runtimeTables: [
        runtimeTable("t5", { floorPlanId: "main-floor" }),
        runtimeTable("t16", { floorPlanId: "main-floor" }),
      ],
      restaurantId: "rest-a",
    });
    assert.equal(result.interactiveTableIds.has("t5"), true);
    assert.equal(result.interactiveTableIds.has("t16"), true);
    assert.equal(result.interactiveTableIds.has(a.id), false);
  });

  test("unbound no entra en interactive set (no join)", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const orphan = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "X",
      position: { x: 10, y: 10 },
      capacity: 2,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "square"),
        { width: 80, height: 80 },
      ),
    });
    const result = collectPublishedOperationalTables({
      instances: [orphan],
      activeSpace: espacio,
      runtimeTables: [],
      restaurantId: "rest-a",
    });
    assert.equal(result.interactiveTableIds.size, 0);
    assert.equal(result.bindings[0]?.interactive, false);
  });

  test("grupo preexistente: secundaria hidden no cuenta; primary id runtime", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const main = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "1",
      position: { x: 40, y: 40 },
      capacity: 2,
      metadata: {
        ...withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, "round"),
          { width: 80, height: 80 },
        ),
        legacyTableId: "main-1",
      },
    });
    const sec = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "2",
      position: { x: 140, y: 40 },
      capacity: 2,
      metadata: {
        ...withOperationalInstanceCanvasSize(
          withOperationalVisualVariant({}, "round"),
          { width: 80, height: 80 },
        ),
        legacyTableId: "sec-2",
      },
    });
    const result = collectPublishedOperationalTables({
      instances: [main, sec],
      activeSpace: espacio,
      runtimeTables: [
        runtimeTable("main-1", { floorPlanId: espacio.id }),
        runtimeTable("sec-2", { floorPlanId: espacio.id }),
      ],
      restaurantId: "rest-a",
      hiddenTableIds: ["sec-2"],
    });
    assert.equal(result.interactiveTableIds.has("main-1"), true);
    assert.equal(result.interactiveTableIds.has("sec-2"), false);
    assert.equal(
      result.bindings.find((b) => b.resolvedTableId === "sec-2")
        ?.exclusionReason,
      "hidden-group-secondary",
    );
  });

  test("contrato DOM join hit-test / eventos compartidos", () => {
    assert.equal(
      HOSTLY_MAP_JOIN_TARGET_SELECTOR,
      '[data-hostly-map-join-target="1"]',
    );
    assert.equal(HOSTLY_MAP_JOIN_DRAG_HOVER, "hostly-map-join-drag-hover");
    assert.equal(HOSTLY_MAP_JOIN_DRAG_END, "hostly-map-join-drag-end");
  });
});
