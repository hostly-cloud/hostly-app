import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSalaEditorDocumentFromLegacy } from "../../lib/sala-editor/adapters/legacy-adapters";

describe("buildSalaEditorDocumentFromLegacy", () => {
  test("abre en Base un plano legacy vacio", () => {
    const result = buildSalaEditorDocumentFromLegacy({
      restaurantId: "restaurant-a",
      floorPlans: [
        {
          id: "floor-custom",
          restaurantId: "restaurant-a",
          name: "Plano personalizado",
          width: 1200,
          height: 800,
        },
      ],
      tables: [],
      zones: [],
    });

    assert.ok(result);
    assert.equal(result.document.navigation.phase, "base");
    assert.equal(result.document.navigation.selectedEspacioId, "floor-custom");
  });

  test("conserva zonas legacy como zonas editables V2", () => {
    const result = buildSalaEditorDocumentFromLegacy({
      restaurantId: "restaurant-a",
      floorPlans: [
        {
          id: "floor-main",
          restaurantId: "restaurant-a",
          name: "Principal",
          width: 1200,
          height: 800,
        },
      ],
      tables: [],
      zones: [
        {
          id: "zone-terrace",
          restaurantId: "restaurant-a",
          name: "Terraza",
          floorPlanId: "floor-main",
          color: "#547a61",
          x: 40,
          y: 60,
          width: 320,
          height: 180,
          createdAt: 10,
          updatedAt: 20,
        },
      ],
    });

    assert.ok(result);
    assert.equal(result.document.navigation.phase, "operacion");
    assert.equal(result.document.zones.length, 1);
    assert.deepEqual(result.document.zones[0], {
      id: "zone-terrace",
      espacioId: "floor-main",
      type: "dining",
      name: "Terraza",
      x: 40,
      y: 60,
      width: 320,
      height: 180,
      color: "#547a61",
      locked: false,
      visible: true,
      metadata: {
        source: "legacy",
        legacyZoneId: "zone-terrace",
        legacyFloorPlanId: "floor-main",
      },
      createdAt: 10,
      updatedAt: 20,
    });
  });

  test("crea un espacio seguro para una zona con plano huérfano", () => {
    const result = buildSalaEditorDocumentFromLegacy({
      restaurantId: "restaurant-a",
      floorPlans: [],
      tables: [],
      zones: [
        {
          id: "zone-orphan",
          restaurantId: "restaurant-a",
          name: "Reservado",
          floorPlanId: "missing-floor",
        },
      ],
    });

    assert.ok(result);
    assert.equal(result.document.zones[0]?.espacioId, "missing-floor");
    assert.ok(result.document.espacios.some((space) => space.id === "missing-floor"));
  });
});
