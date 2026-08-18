import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  executeSalaEditorPublicationWritePhases,
  preflightSalaEditorV2Publication,
  SalaEditorV2PublicationPreflightError,
  stableEditorV2FloorPlanId,
} from "../../lib/sala-editor/persistence/sala-editor-v2-publication";
import {
  createEmptySalaEditorDocument,
  type SalaEditorDocument,
} from "../../lib/sala-editor/types/editor-document";

function createSpace(params: {
  id: string;
  name: string;
  restaurantId?: string;
  legacyFloorPlanId?: string;
}): SalaEditorDocument["espacios"][number] {
  return {
    id: params.id,
    restaurantId: params.restaurantId ?? "restaurant-a",
    name: params.name,
    tipo: "sala",
    color: "#315f7d",
    sortOrder: 10,
    visible: true,
    active: true,
    ...(params.legacyFloorPlanId
      ? { legacyFloorPlanId: params.legacyFloorPlanId }
      : {}),
  };
}

function createDocument(
  spaces: SalaEditorDocument["espacios"],
): SalaEditorDocument {
  return {
    ...createEmptySalaEditorDocument("restaurant-a"),
    espacios: spaces,
    navigation: {
      phase: "operacion",
      selectedEspacioId: spaces[0]?.id ?? null,
    },
  };
}

describe("stableEditorV2FloorPlanId", () => {
  test("reutiliza el mismo plano en reintentos de publicacion", () => {
    const first = stableEditorV2FloorPlanId("restaurant-a", "local-space-1");
    const retry = stableEditorV2FloorPlanId("restaurant-a", "local-space-1");

    assert.equal(retry, first);
    assert.match(first, /^editor-v2-floor-[a-z0-9]+-[a-z0-9]+$/);
  });

  test("aísla el id global de floorPlans por restaurante y espacio", () => {
    const base = stableEditorV2FloorPlanId("restaurant-a", "local-space-1");

    assert.notEqual(
      stableEditorV2FloorPlanId("restaurant-b", "local-space-1"),
      base,
    );
    assert.notEqual(
      stableEditorV2FloorPlanId("restaurant-a", "local-space-2"),
      base,
    );
  });
});

describe("executeSalaEditorPublicationWritePhases", () => {
  test("confirma floorPlans y constructivos antes de las desactivaciones", async () => {
    const calls: string[] = [];

    await executeSalaEditorPublicationWritePhases({
      preflight: () => {},
      commitFloorPlans: async () => void calls.push("floorPlans"),
      commitDecoratives: async () => void calls.push("decoratives"),
      commitOperational: async () => void calls.push("zones+tables"),
      commitDeactivations: async () => void calls.push("deactivations"),
    });

    assert.deepEqual(calls, [
      "floorPlans",
      "decoratives",
      "zones+tables",
      "deactivations",
    ]);
  });

  test("un fallo en el segundo chunk constructivo impide toda desactivacion", async () => {
    const calls: string[] = [];

    await assert.rejects(
      executeSalaEditorPublicationWritePhases({
        preflight: () => {},
        commitFloorPlans: async () => void calls.push("floorPlans"),
        commitDecoratives: async () => void calls.push("decoratives"),
        commitOperational: async () => {
          calls.push("constructive-chunk-1");
          calls.push("constructive-chunk-2:error");
          throw new Error("simulated chunk 2 failure after more than 450 writes");
        },
        commitDeactivations: async () => void calls.push("deactivations"),
      }),
      /chunk 2 failure/,
    );

    assert.deepEqual(calls, [
      "floorPlans",
      "decoratives",
      "constructive-chunk-1",
      "constructive-chunk-2:error",
    ]);
    assert.equal(calls.includes("deactivations"), false);
  });

  test("todos los conflictos de preflight impiden invocar cualquier escritura", async () => {
    const sharedDocument = createDocument([
      createSpace({ id: "space-sala", name: "Sala", legacyFloorPlanId: "shared" }),
      createSpace({ id: "space-one", name: "1", legacyFloorPlanId: "shared" }),
    ]);
    const orphanDocument = createDocument([
      createSpace({ id: "selected", name: "QA" }),
    ]);
    orphanDocument.operationalElementInstances = [
      {
        id: "orphan",
        spaceId: "missing",
        zoneId: null,
        elementType: "TABLE",
        name: "Mesa huérfana",
        position: { x: 10, y: 10 },
        rotation: 0,
        capacity: 4,
        visible: true,
        enabled: true,
        metadata: {},
        state: "libre",
      },
    ];
    const generatedId = stableEditorV2FloorPlanId("restaurant-a", "new-space");
    const collisionDocument = createDocument([
      createSpace({ id: "new-space", name: "Nuevo" }),
      createSpace({
        id: "linked-space",
        name: "Enlazado",
        legacyFloorPlanId: generatedId,
      }),
    ]);
    const ownershipDocument = createDocument([
      createSpace({ id: "owned", name: "Sala", legacyFloorPlanId: "plan-a" }),
    ]);
    const preflights = [
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document: sharedDocument,
        }),
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document: orphanDocument,
        }),
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document: collisionDocument,
        }),
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document: ownershipDocument,
          ownership: [
            { floorPlanId: "plan-a", exists: true, restaurantId: "restaurant-b" },
          ],
        }),
    ];

    for (const preflight of preflights) {
      const calls: string[] = [];
      await assert.rejects(
        executeSalaEditorPublicationWritePhases({
          preflight,
          commitFloorPlans: async () => void calls.push("floorPlans"),
          commitDecoratives: async () => void calls.push("decoratives"),
          commitOperational: async () => void calls.push("operational"),
          commitDeactivations: async () => void calls.push("deactivations"),
        }),
        SalaEditorV2PublicationPreflightError,
      );
      assert.deepEqual(calls, []);
    }
  });
});

describe("preflightSalaEditorV2Publication", () => {
  test("bloquea dos espacios enlazados al mismo floorPlan con error accionable", () => {
    const document = createDocument([
      createSpace({ id: "space-sala", name: "Sala", legacyFloorPlanId: "shared" }),
      createSpace({ id: "space-one", name: "1", legacyFloorPlanId: "shared" }),
    ]);

    assert.throws(
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SalaEditorV2PublicationPreflightError);
        assert.equal(error.code, "SALA_EDITOR_V2_PUBLICATION_PREFLIGHT_FAILED");
        assert.match(error.message, /Sala/);
        assert.match(error.message, /1/);
        assert.match(error.message, /Corrige los enlaces/);
        assert.equal(error.issues[0]?.code, "shared_legacy_floor_plan");
        return true;
      },
    );
  });

  test("permite un espacio nuevo con plano determinista propio y propiedad explícita", () => {
    const document = createDocument([
      createSpace({ id: "new-space", name: "Nueva terraza" }),
    ]);
    const floorPlanId = stableEditorV2FloorPlanId("restaurant-a", "new-space");

    const result = preflightSalaEditorV2Publication({
      restaurantId: "restaurant-a",
      document,
      ownership: [{ floorPlanId, exists: false, restaurantId: null }],
    });

    assert.deepEqual(result.assignments, [
      {
        spaceId: "new-space",
        spaceName: "Nueva terraza",
        floorPlanId,
        source: "generated",
      },
    ]);
  });

  test("acepta enlaces unívocos pertenecientes al restaurante activo", () => {
    const document = createDocument([
      createSpace({ id: "space-a", name: "Sala", legacyFloorPlanId: "plan-a" }),
      createSpace({ id: "space-b", name: "Terraza", legacyFloorPlanId: "plan-b" }),
    ]);

    const result = preflightSalaEditorV2Publication({
      restaurantId: "restaurant-a",
      document,
      ownership: [
        { floorPlanId: "plan-a", exists: true, restaurantId: "restaurant-a" },
        { floorPlanId: "plan-b", exists: true, restaurantId: "restaurant-a" },
      ],
    });

    assert.deepEqual(
      result.assignments.map(({ spaceId, floorPlanId }) => ({ spaceId, floorPlanId })),
      [
        { spaceId: "space-a", floorPlanId: "plan-a" },
        { spaceId: "space-b", floorPlanId: "plan-b" },
      ],
    );
  });

  test("la selección no funciona como fallback para contenido de otro espacio", () => {
    const document = createDocument([
      createSpace({ id: "selected", name: "QA" }),
    ]);
    document.navigation.selectedEspacioId = "selected";
    document.operationalElementInstances = [
      {
        id: "orphan-table",
        spaceId: "missing-space",
        zoneId: null,
        elementType: "TABLE",
        name: "Mesa huérfana",
        position: { x: 100, y: 100 },
        rotation: 0,
        capacity: 4,
        visible: true,
        enabled: true,
        metadata: {},
        state: "libre",
      },
    ];

    assert.throws(
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SalaEditorV2PublicationPreflightError);
        assert.equal(error.issues[0]?.code, "unresolved_content_space");
        assert.match(error.issues[0]?.detail ?? "", /plano seleccionado como fallback/);
        return true;
      },
    );
  });

  test("bloquea una colisión entre un ID estable y otro espacio", () => {
    const generatedId = stableEditorV2FloorPlanId("restaurant-a", "new-space");
    const document = createDocument([
      createSpace({ id: "new-space", name: "Nuevo" }),
      createSpace({
        id: "linked-space",
        name: "Enlazado",
        legacyFloorPlanId: generatedId,
      }),
    ]);

    assert.throws(
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SalaEditorV2PublicationPreflightError);
        assert.equal(error.issues[0]?.code, "stable_floor_plan_id_collision");
        return true;
      },
    );
  });

  test("bloquea planos sin propiedad demostrable", () => {
    const document = createDocument([
      createSpace({ id: "space-a", name: "Sala", legacyFloorPlanId: "plan-a" }),
    ]);

    assert.throws(
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document,
          ownership: [
            { floorPlanId: "plan-a", exists: true, restaurantId: "restaurant-b" },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof SalaEditorV2PublicationPreflightError);
        assert.equal(error.issues[0]?.code, "unsafe_floor_plan_ownership");
        return true;
      },
    );
  });

  test("bloquea el legacyTableId decorativo real de Terraza con detalle accionable", () => {
    const document = createDocument([
      createSpace({
        id: "local-1783175150311-o845z",
        name: "Terraza",
        legacyFloorPlanId: "ehAfo3nxU5yNxcgSbS2A",
      }),
    ]);
    document.operationalElementInstances = [
      {
        id: "op-inst-1786064098233-af9lx0w",
        spaceId: "local-1783175150311-o845z",
        zoneId: null,
        elementType: "TABLE",
        name: "Mesa 1",
        position: { x: 88, y: 424 },
        rotation: 0,
        capacity: 4,
        visible: true,
        enabled: true,
        metadata: {
          legacyTableId:
            "v2-map-BAR_STRAIGHT-op-inst-1783253154331-yfqx1np",
        },
        state: "libre",
      },
    ];

    assert.throws(
      () =>
        preflightSalaEditorV2Publication({
          restaurantId: "restaurant-a",
          document,
          legacyTableDocuments: [
            {
              id: "v2-map-BAR_STRAIGHT-op-inst-1783253154331-yfqx1np",
              restaurantId: "restaurant-a",
              type: "bar",
              isActive: true,
              editorV2ElementType: "operational:BAR_STRAIGHT",
              metadata: {
                editorV2ElementType: "operational:BAR_STRAIGHT",
              },
            },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof SalaEditorV2PublicationPreflightError);
        assert.equal(
          error.issues[0]?.code,
          "invalid_operational_legacy_table_link",
        );
        assert.deepEqual(error.issues[0]?.spaceNames, ["Terraza"]);
        assert.deepEqual(error.issues[0]?.instanceIds, [
          "op-inst-1786064098233-af9lx0w",
        ]);
        assert.deepEqual(error.issues[0]?.legacyTableIds, [
          "v2-map-BAR_STRAIGHT-op-inst-1783253154331-yfqx1np",
        ]);
        assert.match(error.message, /Terraza/);
        assert.match(error.message, /op-inst-1786064098233-af9lx0w/);
        assert.match(
          error.message,
          /v2-map-BAR_STRAIGHT-op-inst-1783253154331-yfqx1np/,
        );
        return true;
      },
    );
  });

  test("el ejecutor realiza cero escrituras cuando preflight detecta la colisión", async () => {
    const document = createDocument([
      createSpace({ id: "terraza", name: "Terraza", legacyFloorPlanId: "plan" }),
    ]);
    document.operationalElementInstances = [
      {
        id: "table-instance",
        spaceId: "terraza",
        zoneId: null,
        elementType: "TABLE",
        name: "Mesa 1",
        position: { x: 88, y: 424 },
        rotation: 0,
        capacity: 4,
        visible: true,
        enabled: true,
        metadata: { legacyTableId: "v2-map-bar-1" },
        state: "libre",
      },
    ];
    const calls: string[] = [];

    await assert.rejects(
      executeSalaEditorPublicationWritePhases({
        preflight: () =>
          void preflightSalaEditorV2Publication({
            restaurantId: "restaurant-a",
            document,
            legacyTableDocuments: [
              {
                id: "v2-map-bar-1",
                restaurantId: "restaurant-a",
                type: "bar",
                isActive: true,
              },
            ],
          }),
        commitFloorPlans: async () => void calls.push("floorPlans"),
        commitDecoratives: async () => void calls.push("decoratives"),
        commitOperational: async () => void calls.push("operational"),
        commitDeactivations: async () => void calls.push("deactivations"),
      }),
      SalaEditorV2PublicationPreflightError,
    );
    assert.deepEqual(calls, []);
  });

  test("mantiene enlaces operativos válidos del mismo restaurante", () => {
    const document = createDocument([
      createSpace({ id: "sala", name: "Sala", legacyFloorPlanId: "plan" }),
    ]);
    document.operationalElementInstances = [
      {
        id: "table-instance",
        spaceId: "sala",
        zoneId: null,
        elementType: "TABLE",
        name: "Mesa 2",
        position: { x: 100, y: 100 },
        rotation: 0,
        capacity: 4,
        visible: true,
        enabled: true,
        metadata: { legacyTableId: "v2-table-table-instance" },
        state: "libre",
      },
    ];

    const result = preflightSalaEditorV2Publication({
      restaurantId: "restaurant-a",
      document,
      legacyTableDocuments: [
        {
          id: "v2-table-table-instance",
          restaurantId: "restaurant-a",
          type: "table",
          isActive: true,
          editorV2ElementType: "operational:TABLE",
        },
      ],
    });

    assert.equal(result.assignments[0]?.spaceId, "sala");
  });
});
