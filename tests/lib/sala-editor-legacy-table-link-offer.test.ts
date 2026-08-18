import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Table } from "../../lib/firestore/tables";
import type { OperationalElementInstance } from "../../lib/sala-editor/ose/operational-element-instance";
import {
  computeSafeLegacyTableAutoLinks,
  isLegacyOperationalTableCandidate,
  shouldOfferLegacyTableAutoLink,
} from "../../lib/sala-editor/linking/legacy-table-linking";

function editorTable(
  id: string,
  legacyTableId?: string,
): OperationalElementInstance {
  return {
    id,
    spaceId: "floor-main",
    zoneId: null,
    elementType: "TABLE",
    name: "Mesa 1",
    position: { x: 100, y: 100 },
    rotation: 0,
    capacity: 4,
    visible: true,
    enabled: true,
    metadata: legacyTableId ? { legacyTableId } : {},
    state: "libre",
  };
}

function legacyTable(id: string, name: string): Table {
  return {
    id,
    restaurantId: "restaurant-a",
    name,
    type: "table",
    status: "free",
    tableShape: "square",
    seats: 4,
    x: 0,
    y: 0,
    isActive: true,
  };
}

describe("shouldOfferLegacyTableAutoLink", () => {
  const matchingLegacyTable = legacyTable("legacy-table-1", "Mesa 1");

  test("no muestra Enlazar en un plano sin mesas", () => {
    assert.equal(
      shouldOfferLegacyTableAutoLink({
        instances: [],
        legacyTables: [matchingLegacyTable],
        restaurantId: "restaurant-a",
      }),
      false,
    );
  });

  test("lo muestra si existe al menos un enlace seguro real", () => {
    assert.equal(
      shouldOfferLegacyTableAutoLink({
        instances: [editorTable("editor-table-1")],
        legacyTables: [matchingLegacyTable],
        restaurantId: "restaurant-a",
      }),
      true,
    );
    assert.equal(
      shouldOfferLegacyTableAutoLink({
        instances: [editorTable("editor-table-1", "legacy-table-1")],
        legacyTables: [matchingLegacyTable],
        restaurantId: "restaurant-a",
      }),
      false,
    );
  });

  test("no lo muestra si hay una mesa legacy libre pero no coincide", () => {
    assert.equal(
      shouldOfferLegacyTableAutoLink({
        instances: [editorTable("editor-table-1")],
        legacyTables: [legacyTable("legacy-table-2", "Mesa 2")],
        restaurantId: "restaurant-a",
      }),
      false,
    );
  });
});

describe("isLegacyOperationalTableCandidate", () => {
  test("acepta una mesa operativa V2 real", () => {
    assert.equal(
      isLegacyOperationalTableCandidate(
        {
          id: "v2-table-op-inst-1",
          restaurantId: "restaurant-a",
          type: "table",
          isActive: true,
          editorV2ElementType: "operational:TABLE",
          metadata: { editorV2ElementType: "operational:TABLE" },
        },
        "restaurant-a",
      ),
      true,
    );
  });

  test("mantiene una mesa legacy válida sin señales V2", () => {
    assert.equal(
      isLegacyOperationalTableCandidate(
        { id: "legacy-table", restaurantId: "restaurant-a", isActive: true },
        "restaurant-a",
      ),
      true,
    );
  });

  test("rechaza decorativos por tipo, prefijo y metadata", () => {
    const candidates = [
      {
        id: "legacy-bar",
        restaurantId: "restaurant-a",
        type: "bar",
        isActive: true,
      },
      {
        id: "v2-map-BAR_STRAIGHT-instance-1",
        restaurantId: "restaurant-a",
        type: "table",
        isActive: true,
      },
      {
        id: "legacy-with-decorative-metadata",
        restaurantId: "restaurant-a",
        type: "table",
        isActive: true,
        metadata: { editorV2ElementType: "operational:BAR_STRAIGHT" },
      },
    ];

    for (const candidate of candidates) {
      assert.equal(
        isLegacyOperationalTableCandidate(candidate, "restaurant-a"),
        false,
      );
    }
  });

  test("conserva aislamiento por restaurantId y actividad", () => {
    assert.equal(
      isLegacyOperationalTableCandidate(
        { id: "table-a", restaurantId: "restaurant-b", type: "table" },
        "restaurant-a",
      ),
      false,
    );
    assert.equal(
      isLegacyOperationalTableCandidate(
        {
          id: "table-a",
          restaurantId: "restaurant-a",
          type: "table",
          isActive: false,
        },
        "restaurant-a",
      ),
      false,
    );
  });
});

describe("enlaces automáticos y manuales", () => {
  const decorativeBar: Table = {
    ...legacyTable(
      "v2-map-BAR_STRAIGHT-op-inst-1783253154331-yfqx1np",
      "Barra recta 1",
    ),
    type: "bar",
    seats: 0,
    editorV2ElementType: "operational:BAR_STRAIGHT",
  };

  test("el autoenlace no propone una barra aunque coincida el número", () => {
    const result = computeSafeLegacyTableAutoLinks({
      instances: [editorTable("terraza-table-1")],
      legacyTables: [decorativeBar],
      restaurantId: "restaurant-a",
    });

    assert.deepEqual(result.updates, []);
    assert.equal(result.debug[0]?.reason, "ENTIDAD_NO_OPERATIVA");
  });

  test("la fuente manual no ofrece ni acepta el decorativo", () => {
    const validTable = legacyTable("legacy-table-1", "Mesa 1");
    const manualCandidates = [decorativeBar, validTable].filter((candidate) =>
      isLegacyOperationalTableCandidate(candidate, "restaurant-a"),
    );

    assert.deepEqual(manualCandidates.map((candidate) => candidate.id), [
      "legacy-table-1",
    ]);
    assert.equal(
      isLegacyOperationalTableCandidate(decorativeBar, "restaurant-a"),
      false,
    );
  });

  test("los enlaces válidos existentes siguen ocupados y no se reasignan", () => {
    const result = computeSafeLegacyTableAutoLinks({
      instances: [
        editorTable("existing", "legacy-table-1"),
        editorTable("new-table"),
      ],
      legacyTables: [legacyTable("legacy-table-1", "Mesa 1")],
      restaurantId: "restaurant-a",
    });

    assert.deepEqual(result.updates, []);
    assert.equal(result.debug[0]?.reason, "LEGACY_YA_ENLAZADA");
  });
});
