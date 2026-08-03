/**
 * Emulator: publish draft → published; invalid no pisa; tenant mismatch.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import {
  SALA_EDITOR_DRAFT_DOC_ID,
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { createLocalEspacio } from "@/lib/sala-editor/preview/create-preview-espacios";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  loadSalaEditorPublishedAdmin,
  publishSalaEditorMap,
  PublishSalaEditorMapError,
} from "@/lib/server/sala-editor/publish-sala-editor-map";
import { resolveTpvMapSource } from "@/lib/sala-editor/persistence/sala-editor-published-types";

const PROJECT_ID = "demo-hostly-sala-editor-publish";

let adminApp: App;
let adminDb: AdminFirestore;

describe("sala-editor publish emulator", () => {
  before(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    }
    adminApp = initializeApp({ projectId: PROJECT_ID }, "sala-editor-publish");
    adminDb = getAdminFirestore(adminApp);
  });

  after(async () => {
    await deleteApp(adminApp);
  });

  const RID = "rest-sala-pub";

  async function seedDraft(valid: boolean) {
    const doc = createEmptySalaEditorDocument(RID);
    const espacio = createLocalEspacio({
      restaurantId: RID,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    doc.espacios = [espacio];
    if (valid) {
      doc.operationalElementInstances = [
        buildOperationalElementInstance({
          spaceId: espacio.id,
          elementType: "TABLE",
          name: "Mesa A",
          position: { x: 100, y: 100 },
          capacity: 2,
          metadata: withOperationalInstanceCanvasSize(
            withOperationalVisualVariant({}, "round"),
            { width: 80, height: 80 },
          ),
        }),
      ];
    } else {
      doc.operationalElementInstances = [
        buildOperationalElementInstance({
          spaceId: "missing-space",
          elementType: "TABLE",
          name: "Bad",
          position: { x: 10, y: 10 },
          capacity: 2,
        }),
      ];
    }

    await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .set({
        id: SALA_EDITOR_DRAFT_DOC_ID,
        state: SALA_EDITOR_DRAFT_DOC_ID,
        schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
        restaurantId: RID,
        document: doc,
        updatedAt: Date.now(),
        updatedBy: "tester",
      });
  }

  test("publish válido escribe published y sync tables", async () => {
    await seedDraft(true);
    const result = await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    assert.equal(result.published, true);
    assert.ok(result.tableIds.length >= 1);

    const published = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    assert.ok(published);
    assert.equal(resolveTpvMapSource(published), "v2-published");

    const pubSnap = await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_PUBLISHED_DOC_ID)
      .get();
    assert.equal(pubSnap.exists, true);
    assert.equal(pubSnap.data()?.state, SALA_EDITOR_PUBLISHED_DOC_ID);

    const tableId = result.tableIds[0];
    const tableSnap = await adminDb.collection("tables").doc(tableId).get();
    assert.equal(tableSnap.exists, true);
    assert.equal(tableSnap.data()?.isActive, true);
    assert.equal(tableSnap.data()?.restaurantId, RID);
  });

  test("publish con legacyFloorPlanId ≠ espacio.id sincroniza floorPlanId canónico", async () => {
    const doc = createEmptySalaEditorDocument(RID);
    const espacio = createLocalEspacio({
      restaurantId: RID,
      name: "Sala Legacy",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    espacio.legacyFloorPlanId = "legacy-main-plan";
    assert.notEqual(espacio.id, "legacy-main-plan");
    doc.espacios = [espacio];
    const table = buildOperationalElementInstance({
      spaceId: espacio.id,
      elementType: "TABLE",
      name: "Mesa L",
      position: { x: 120, y: 90 },
      capacity: 4,
      metadata: withOperationalInstanceCanvasSize(
        withOperationalVisualVariant({}, "round"),
        { width: 80, height: 80 },
      ),
    });
    doc.operationalElementInstances = [table];

    await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .set({
        id: SALA_EDITOR_DRAFT_DOC_ID,
        state: SALA_EDITOR_DRAFT_DOC_ID,
        schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
        restaurantId: RID,
        document: doc,
        updatedAt: Date.now(),
        updatedBy: "tester",
      });

    const result = await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    assert.ok(result.floorPlanIds.includes("legacy-main-plan"));
    assert.ok(!result.floorPlanIds.includes(espacio.id));

    const tableId = result.tableIds[0];
    const tableSnap = await adminDb.collection("tables").doc(tableId).get();
    assert.equal(tableSnap.data()?.floorPlanId, "legacy-main-plan");
    assert.equal(tableSnap.data()?.isActive, true);

    const published = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    const stamped = published?.document.operationalElementInstances.find(
      (i) => i.id === table.id,
    );
    assert.equal(
      String(stamped?.metadata?.legacyTableId ?? "").trim(),
      tableId,
    );
  });

  test("publish inválido no pisa published anterior", async () => {
    await seedDraft(true);
    await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    const before = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    assert.ok(before);

    await seedDraft(false);
    let threw = false;
    try {
      await publishSalaEditorMap({
        db: adminDb,
        restaurantId: RID,
        uid: "user-1",
      });
    } catch (e) {
      threw = true;
      assert.ok(e instanceof PublishSalaEditorMapError);
    }
    assert.equal(threw, true);

    const after = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    assert.ok(after);
    assert.equal(after!.publishedAt, before!.publishedAt);
  });

  test("publish no pisa status operativo de mesa existente", async () => {
    await seedDraft(true);
    const first = await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    const tableId = first.tableIds[0];
    assert.ok(tableId);

    await adminDb.collection("tables").doc(tableId).set(
      {
        status: "occupied",
        currentOrderId: "ord-keep-1",
        dinersCount: 3,
        assignedOperatorId: "op-1",
        isActive: true,
      },
      { merge: true },
    );

    // Mueve geometría en draft y republica.
    const draftSnap = await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .get();
    const draftData = draftSnap.data() as {
      document: {
        operationalElementInstances: Array<{
          id: string;
          position: { x: number; y: number };
          metadata?: Record<string, unknown>;
        }>;
      };
    };
    const instance = draftData.document.operationalElementInstances[0];
    instance.position = { x: 240, y: 180 };
    instance.metadata = {
      ...(instance.metadata ?? {}),
      legacyTableId: tableId,
    };
    await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .set({ document: draftData.document }, { merge: true });

    const beforeGeom = await adminDb.collection("tables").doc(tableId).get();
    const beforeX = Number(beforeGeom.data()?.x);
    const beforeY = Number(beforeGeom.data()?.y);

    await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });

    const after = await adminDb.collection("tables").doc(tableId).get();
    const data = after.data() ?? {};
    assert.equal(data.status, "occupied");
    assert.equal(data.currentOrderId, "ord-keep-1");
    assert.equal(data.dinersCount, 3);
    assert.equal(data.assignedOperatorId, "op-1");
    // Geometría se actualiza (top-left desde centro); status operativo intacto.
    assert.notEqual(Number(data.x), beforeX);
    assert.notEqual(Number(data.y), beforeY);
  });


  test("mesa nueva se crea free; republicar es idempotente en status", async () => {
    await seedDraft(true);
    const result = await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    const tableId = result.tableIds[0];
    const first = await adminDb.collection("tables").doc(tableId).get();
    assert.equal(first.data()?.status, "free");

    await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "user-1",
    });
    const second = await adminDb.collection("tables").doc(tableId).get();
    assert.equal(second.data()?.status, "free");
  });

  test("tenant mismatch en draft rechaza", async () => {
    await adminDb
      .collection("restaurants")
      .doc(RID)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .set({
        id: SALA_EDITOR_DRAFT_DOC_ID,
        state: SALA_EDITOR_DRAFT_DOC_ID,
        schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
        restaurantId: "other-rest",
        document: createEmptySalaEditorDocument("other-rest"),
        updatedAt: Date.now(),
      });

    await assert.rejects(
      () =>
        publishSalaEditorMap({
          db: adminDb,
          restaurantId: RID,
          uid: "user-1",
        }),
      (e: unknown) =>
        e instanceof PublishSalaEditorMapError &&
        e.code === "TABLE_TENANT_MISMATCH",
    );
  });
});
