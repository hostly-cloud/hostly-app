/**
 * Emulator/auth: publish route exige settings.manage; 403 no muta datos.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { NextResponse } from "next/server";
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
} from "@/lib/server/sala-editor/publish-sala-editor-map";
import { readFileSync } from "node:fs";
import { handlePublishSalaEditorMapRequest } from "@/app/api/sala-editor/publish/route";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";

const PROJECT_ID = "demo-hostly-sala-editor-publish-auth";

let adminApp: App;
let adminDb: AdminFirestore;

const RID = "rest-sala-pub-auth";
const OTHER_RID = "rest-sala-pub-other";

describe("sala-editor publish auth emulator", () => {
  before(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    }
    adminApp = initializeApp(
      { projectId: PROJECT_ID },
      "sala-editor-publish-auth",
    );
    adminDb = getAdminFirestore(adminApp);
  });

  after(async () => {
    await deleteApp(adminApp);
  });

  async function seedUser(uid: string, role: string, restaurantId = RID) {
    const profile = {
      uid,
      email: `${uid}@test.hostly`,
      restaurantId,
      role,
      status: "active",
    };
    await adminDb.collection("users").doc(uid).set(profile);
    await adminDb.collection("usuarios").doc(uid).set(profile);
  }

  async function seedValidDraft(restaurantId = RID) {
    const doc = createEmptySalaEditorDocument(restaurantId);
    const espacio = createLocalEspacio({
      restaurantId,
      name: "Sala",
      tipo: "sala",
      color: "#3b82f6",
      sortOrder: 0,
    });
    doc.espacios = [espacio];
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

    await adminDb
      .collection("restaurants")
      .doc(restaurantId)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .set({
        id: SALA_EDITOR_DRAFT_DOC_ID,
        state: SALA_EDITOR_DRAFT_DOC_ID,
        schemaVersion: SALA_EDITOR_DOCUMENT_VERSION,
        restaurantId,
        document: doc,
        updatedAt: Date.now(),
        updatedBy: "tester",
      });
  }

  function authAs(
    uid: string,
    restaurantId = RID,
  ): AuthenticatedRestaurantContext {
    return {
      uid,
      restaurantId,
      db: adminDb,
    };
  }

  async function callPublish(params: {
    uid: string;
    restaurantId?: string;
    body?: Record<string, unknown>;
    authenticate?: (
      req: Request,
    ) => Promise<AuthenticatedRestaurantContext | NextResponse>;
  }) {
    const body = params.body ?? {};
    const req = new Request("https://hostly.test/api/sala-editor/publish", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return handlePublishSalaEditorMapRequest(req, {
      authenticate:
        params.authenticate ??
        (async () => authAs(params.uid, params.restaurantId ?? RID)),
    });
  }

  async function snapshotTenant(restaurantId = RID) {
    const draft = await adminDb
      .collection("restaurants")
      .doc(restaurantId)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_DRAFT_DOC_ID)
      .get();
    const published = await adminDb
      .collection("restaurants")
      .doc(restaurantId)
      .collection(SALA_EDITOR_MAPS_COLLECTION)
      .doc(SALA_EDITOR_PUBLISHED_DOC_ID)
      .get();
    const tables = await adminDb
      .collection("restaurants")
      .doc(restaurantId)
      .collection("tables")
      .get();
    const floorPlans = await adminDb
      .collection("restaurants")
      .doc(restaurantId)
      .collection("floorPlans")
      .get();
    return {
      draft: draft.exists ? draft.data() : null,
      published: published.exists ? published.data() : null,
      tableIds: tables.docs.map((d) => d.id).sort(),
      tablePayloads: tables.docs.map((d) => d.data()),
      floorPlanIds: floorPlans.docs.map((d) => d.id).sort(),
      floorPlanPayloads: floorPlans.docs.map((d) => d.data()),
    };
  }

  test("owner puede publicar", async () => {
    await seedValidDraft();
    await seedUser("owner-1", "owner");
    const res = await callPublish({ uid: "owner-1" });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok?: boolean };
    assert.equal(json.ok, true);
    const published = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    assert.ok(published);
  });

  test("admin puede publicar", async () => {
    await seedValidDraft();
    await seedUser("admin-1", "admin");
    const res = await callPublish({ uid: "admin-1" });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok?: boolean };
    assert.equal(json.ok, true);
  });

  test("manager/encargado denegados (sin settings.manage)", async () => {
    await seedValidDraft();
    for (const [uid, role] of [
      ["mgr-1", "manager"],
      ["enc-1", "encargado"],
    ] as const) {
      await seedUser(uid, role);
      const before = await snapshotTenant();
      const res = await callPublish({ uid });
      assert.equal(res.status, 403, role);
      const json = (await res.json()) as { ok?: boolean; error?: string };
      assert.equal(json.ok, false);
      assert.equal(json.error, "SETTINGS_MANAGE_REQUIRED");
      const after = await snapshotTenant();
      assert.deepEqual(after, before, role);
    }
  });

  test("waiter/kitchen/bar denegados y no mutan", async () => {
    await seedValidDraft();
    // Baseline published previo (owner).
    await seedUser("owner-seed", "owner");
    const seedRes = await callPublish({ uid: "owner-seed" });
    assert.equal(seedRes.status, 200);
    const before = await snapshotTenant();
    assert.ok(before.published);

    for (const [uid, role] of [
      ["waiter-1", "waiter"],
      ["kitchen-1", "kitchen"],
      ["bar-1", "bar"],
    ] as const) {
      await seedUser(uid, role);
      const res = await callPublish({ uid });
      assert.equal(res.status, 403, role);
      const json = (await res.json()) as { error?: string };
      assert.equal(json.error, "SETTINGS_MANAGE_REQUIRED", role);
      const after = await snapshotTenant();
      assert.deepEqual(after.published, before.published, role);
      assert.deepEqual(after.draft, before.draft, role);
      assert.deepEqual(after.tableIds, before.tableIds, role);
      assert.deepEqual(after.tablePayloads, before.tablePayloads, role);
      assert.deepEqual(after.floorPlanIds, before.floorPlanIds, role);
      assert.deepEqual(after.floorPlanPayloads, before.floorPlanPayloads, role);
    }
  });

  test("usuario de otro restaurante no publica el tenant A", async () => {
    await seedValidDraft(RID);
    await seedValidDraft(OTHER_RID);
    await seedUser("owner-a", "owner", RID);
    await seedUser("owner-b", "owner", OTHER_RID);

    // Publicar B no debe crear published en A.
    const beforeA = await snapshotTenant(RID);
    const res = await callPublish({ uid: "owner-b", restaurantId: OTHER_RID });
    assert.equal(res.status, 200);
    const afterA = await snapshotTenant(RID);
    assert.deepEqual(afterA.published, beforeA.published);
    const publishedB = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: OTHER_RID,
    });
    assert.ok(publishedB);
  });

  test("sin autenticación → 401", async () => {
    const res = await callPublish({
      uid: "x",
      authenticate: async () =>
        NextResponse.json(
          { ok: false, error: "UNAUTHORIZED", details: "Falta token Bearer" },
          { status: 401 },
        ),
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, "UNAUTHORIZED");
  });

  test("body con restaurantId se rechaza (conservado)", async () => {
    await seedUser("owner-body", "owner");
    const res = await callPublish({
      uid: "owner-body",
      body: { restaurantId: "evil-tenant" },
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, "RESTAURANT_ID_NOT_ALLOWED");
  });

  test("GET published no exige settings.manage (operativo puede leer)", async () => {
    await seedValidDraft();
    await seedUser("owner-get", "owner");
    const pub = await callPublish({ uid: "owner-get" });
    assert.equal(pub.status, 200);

    await seedUser("waiter-get", "waiter");
    // Waiter denegado en publish…
    const deny = await callPublish({ uid: "waiter-get" });
    assert.equal(deny.status, 403);

    // …pero el documento published del tenant sigue legible (mismo contrato Admin del GET).
    const published = await loadSalaEditorPublishedAdmin({
      db: adminDb,
      restaurantId: RID,
    });
    assert.ok(published);

    const publishedRoute = readFileSync(
      "app/api/sala-editor/published/route.ts",
      "utf8",
    );
    assert.match(publishedRoute, /requireAuthenticatedRestaurant/);
    assert.doesNotMatch(
      publishedRoute,
      /SETTINGS_MANAGE|settings\.manage|canPublishSalaEditorMap/,
    );
  });

  test("publish core sigue usable por owner tras seed (smoke no-regresión)", async () => {
    await seedValidDraft();
    const result = await publishSalaEditorMap({
      db: adminDb,
      restaurantId: RID,
      uid: "direct-core",
    });
    assert.equal(result.published, true);
  });
});
