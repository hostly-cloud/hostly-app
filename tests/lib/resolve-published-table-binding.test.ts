import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { Table } from "@/lib/firestore/tables";
import {
  collectPublishedOperationalTables,
  resolvePublishedTableBinding,
  runtimeTableMatchesPublishedEspacio,
} from "@/lib/sala-editor/persistence/resolve-published-table-binding";
import { shouldShowLegacyMapEmptyState } from "@/lib/sala-editor/persistence/sala-published-readonly-resolve";

function makeTableInstance(
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

function runtimeTable(
  id: string,
  overrides: Partial<Table> = {},
): Table {
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

describe("resolvePublishedTableBinding", () => {
  test("5 mesas con legacyTableId → 5 bindings interactivos", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "main-floor";
    const instances = Array.from({ length: 5 }, (_, i) =>
      makeTableInstance(espacio.id, `M${i + 1}`, {
        legacyTableId: `tbl-${i + 1}`,
      }),
    );
    const runtime = instances.map((_, i) =>
      runtimeTable(`tbl-${i + 1}`, { floorPlanId: "main-floor" }),
    );
    const result = collectPublishedOperationalTables({
      instances,
      activeSpace: espacio,
      runtimeTables: runtime,
      restaurantId: "rest-a",
    });
    assert.equal(result.boundTables.length, 5);
    assert.equal(result.interactiveTableIds.size, 5);
    assert.equal(
      result.bindings.filter((b) => b.interactive).length,
      5,
    );
  });

  test("fallback instance.id vincula si existe runtime table", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = makeTableInstance(espacio.id, "Legacy", {
      id: "mesa-19",
    });
    const byId = new Map([["mesa-19", runtimeTable("mesa-19", {
      floorPlanId: espacio.id,
    })]]);
    const binding = resolvePublishedTableBinding({
      instance,
      runtimeTablesById: byId,
      activeSpace: espacio,
      restaurantId: "rest-a",
    });
    assert.equal(binding.legacyTableId, null);
    assert.equal(binding.resolvedTableId, "mesa-19");
    assert.equal(binding.interactive, true);
    assert.equal(binding.exclusionReason, null);
  });

  test("sin vínculo → no interactiva, no entra en boundTables", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = makeTableInstance(espacio.id, "Huérfana", {
      id: "op-orphan",
    });
    const result = collectPublishedOperationalTables({
      instances: [instance],
      activeSpace: espacio,
      runtimeTables: [],
      restaurantId: "rest-a",
    });
    assert.equal(result.boundTables.length, 0);
    assert.equal(result.bindings[0]?.exclusionReason, "missing-runtime-table");
    assert.equal(result.bindings[0]?.interactive, false);
  });

  test("espacio.id !== legacyFloorPlanId → binding válido", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "main-floor";
    assert.notEqual(espacio.id, "main-floor");
    assert.equal(
      runtimeTableMatchesPublishedEspacio(
        { floorPlanId: "main-floor" },
        espacio,
      ),
      true,
    );
    assert.equal(
      runtimeTableMatchesPublishedEspacio(
        { floorPlanId: espacio.id },
        espacio,
      ),
      true,
    );
    const instance = makeTableInstance(espacio.id, "M1", {
      legacyTableId: "t1",
    });
    const binding = resolvePublishedTableBinding({
      instance,
      runtimeTablesById: new Map([
        ["t1", runtimeTable("t1", { floorPlanId: "main-floor" })],
      ]),
      activeSpace: espacio,
      restaurantId: "rest-a",
    });
    assert.equal(binding.interactive, true);
  });

  test("runtime de otro restaurante → no vinculada", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = makeTableInstance(espacio.id, "M1", {
      legacyTableId: "t1",
    });
    const binding = resolvePublishedTableBinding({
      instance,
      runtimeTablesById: new Map([
        ["t1", runtimeTable("t1", { restaurantId: "rest-b" })],
      ]),
      activeSpace: espacio,
      restaurantId: "rest-a",
    });
    assert.equal(binding.interactive, false);
    assert.equal(binding.exclusionReason, "tenant-mismatch");
  });

  test("dos instancias → misma runtime: duplicate, contador 1", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const a = makeTableInstance(espacio.id, "A", { legacyTableId: "shared" });
    const b = makeTableInstance(espacio.id, "B", { legacyTableId: "shared" });
    const result = collectPublishedOperationalTables({
      instances: [a, b],
      activeSpace: espacio,
      runtimeTables: [runtimeTable("shared", { floorPlanId: espacio.id })],
      restaurantId: "rest-a",
    });
    assert.equal(result.boundTables.length, 1);
    assert.equal(
      result.bindings.filter((x) => x.exclusionReason === "duplicate-binding")
        .length,
      1,
    );
  });

  test("secundaria agrupada → hidden-group-secondary, no cuenta", () => {
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    const instance = makeTableInstance(espacio.id, "Sec", {
      legacyTableId: "sec-1",
    });
    const result = collectPublishedOperationalTables({
      instances: [instance],
      activeSpace: espacio,
      runtimeTables: [runtimeTable("sec-1", { floorPlanId: espacio.id })],
      restaurantId: "rest-a",
      hiddenTableIds: ["sec-1"],
    });
    assert.equal(result.boundTables.length, 0);
    assert.equal(
      result.bindings[0]?.exclusionReason,
      "hidden-group-secondary",
    );
  });

  test("v2-published no usa empty-state legacy", () => {
    assert.equal(shouldShowLegacyMapEmptyState("v2-published", 0), false);
  });

  test("documento vacío no inventa mesas", () => {
    const doc = createEmptySalaEditorDocument("rest-a");
    const espacio = createLocalEspacio({
      restaurantId: "rest-a",
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    doc.espacios = [espacio];
    const result = collectPublishedOperationalTables({
      instances: doc.operationalElementInstances,
      activeSpace: espacio,
      runtimeTables: [runtimeTable("orphan")],
      restaurantId: "rest-a",
    });
    assert.equal(result.boundTables.length, 0);
  });
});
