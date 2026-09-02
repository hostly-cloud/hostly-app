import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  Timestamp,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import {
  bootstrapUserProfile,
  UserProfileBootstrapError,
} from "@/lib/server/auth/bootstrap-user-profile";
import {
  evaluateProfileAuthorization,
  normalizeAuthorizationRole,
} from "@/lib/auth/profile-authorization-policy";
import {
  hasCapability,
  listCapabilitiesForRole,
} from "@/lib/auth/hostly-capabilities";
import { hashInviteToken } from "@/lib/staff-invites/token";
import {
  mapOnboardingRoleToStaffInviteRole,
  normalizeStaffInviteInputRole,
} from "@/lib/staff-invites/map-onboarding-role";
import { handleProfileBootstrapRequest } from "@/app/api/auth/profile-bootstrap/handler";
import { handleCreateStaffInviteRequest } from "@/app/api/staff-invites/create/handler";
import {
  handleListStaffInvitesRequest,
  handleRevokeStaffInviteRequest,
} from "@/app/api/staff-invites/manage/handler";
import {
  handleListManagedUsersRequest,
  handleUpdateManagedUserRequest,
} from "@/app/api/users/manage/handler";
import {
  handleListRestaurantUserRosterRequest,
  type RosterRouteDependencies,
} from "@/lib/server/users/handle-list-restaurant-user-roster-request";
import {
  handleProcessMenuImportRequest,
  type ProcessRouteDependencies,
} from "@/app/api/menu-imports/process/handler";
import {
  handlePublishMenuImportRequest,
  type PublishRouteDependencies,
} from "@/app/api/menu-imports/publish/handler";
import {
  handlePublishMenuImportPreviewRequest,
  type PreviewRouteDependencies,
} from "@/app/api/menu-imports/publish-preview/handler";
import {
  handleCreateMenuImportCategoriesRequest,
  type CreateCategoriesRouteDependencies,
} from "@/app/api/menu-imports/create-categories/handler";
import {
  handleExtractSupplierInvoiceRequest,
  type SupplierInvoiceExtractDependencies,
} from "@/app/api/supplier-invoices/extract/handler";
import { copyInviteLink } from "@/lib/staff-invites/copy-invite-link";
import {
  supplierInvoiceFileSignatureMatches,
  validateSupplierInvoiceUploadFile,
} from "@/lib/server/supplier-invoices/upload-supplier-invoice-file";
import {
  parseUsuariosStoragePayload,
  sanitizeUsuarioForPersistence,
  type UsuarioLocal,
} from "@/lib/usuarios-local";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  validateProductImageCandidate,
} from "@/lib/firebase/product-image-contract";
import { assertMenuImportStoragePathForDraft } from "@/lib/server/menu-imports/download-storage-file";
import {
  handleUpdateMenuImportReviewRequest,
  updateMenuImportReview,
} from "@/lib/server/menu-imports/handle-update-menu-import-review-request";
import { resolveHostlyAiTenant } from "@/lib/ai/hostly-ai-context";
import {
  handleImportMenuRequest,
  type ImportMenuRouteDependencies,
} from "@/app/api/ai/import-menu/handler";
import {
  handleManagerSummaryRequest,
  type ManagerSummaryRouteDependencies,
} from "@/app/api/ai/manager-summary/handler";
import type {
  AuthenticatedRestaurantDependencies,
  AuthTokenVerifier,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";
import { handleMigrateLegacyRequest } from "@/lib/server/catalog/handle-migrate-legacy-request";
import { handleMigrationPreviewRequest } from "@/lib/server/catalog/handle-migration-preview-request";
import { handleSyncOrderItemsRequest } from "@/lib/server/tpv/handle-sync-order-items-request";

const PROJECT_ID = "demo-hostly-rules";
const RESTAURANT_A = "restaurant-a";
const RESTAURANT_B = "restaurant-b";
const OWNER_A = "owner-a";
const ADMIN_A = "admin-a";
const MANAGER_A = "manager-a";
const WAITER_A = "waiter-a";
const VIEWER_A = "viewer-a";
const DISABLED_A = "disabled-a";
const LEGACY_A = "legacy-a";
const OWNER_B = "owner-b";

const IDENTITIES = {
  [OWNER_A]: "owner-a@example.test",
  [ADMIN_A]: "admin-a@example.test",
  [MANAGER_A]: "manager-a@example.test",
  [WAITER_A]: "waiter-a@example.test",
  [VIEWER_A]: "viewer-a@example.test",
  [DISABLED_A]: "disabled-a@example.test",
  [LEGACY_A]: "legacy-a@example.test",
  [OWNER_B]: "owner-b@example.test",
} as const;

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

function profile(input: {
  uid: string;
  restaurantId: string;
  role: string;
  status?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    uid: input.uid,
    email: IDENTITIES[input.uid as keyof typeof IDENTITIES] ??
      `${input.uid}@example.test`,
    restaurantId: input.restaurantId,
    restaurantName:
      input.restaurantId === RESTAURANT_A ? "Restaurante A" : "Restaurante B",
    role: input.role,
    ...(input.status ? { status: input.status } : {}),
    ...input.extra,
  };
}

async function seedProfilePair(
  uid: string,
  canonical: Record<string, unknown>,
  mirror: Record<string, unknown> = canonical,
) {
  await Promise.all([
    adminDb.collection("users").doc(uid).set(canonical),
    adminDb.collection("usuarios").doc(uid).set(mirror),
  ]);
}

async function seedBaseData() {
  await Promise.all([
    adminDb.collection("restaurants").doc(RESTAURANT_A).set({
      name: "Restaurante A",
      createdAt: 1,
    }),
    adminDb.collection("restaurants").doc(RESTAURANT_B).set({
      name: "Restaurante B",
      createdAt: 1,
    }),
    seedProfilePair(
      OWNER_A,
      profile({
        uid: OWNER_A,
        restaurantId: RESTAURANT_A,
        role: "owner",
        status: "active",
      }),
    ),
    seedProfilePair(
      ADMIN_A,
      profile({
        uid: ADMIN_A,
        restaurantId: RESTAURANT_A,
        role: "admin",
        status: "active",
      }),
    ),
    seedProfilePair(
      MANAGER_A,
      profile({
        uid: MANAGER_A,
        restaurantId: RESTAURANT_A,
        role: "manager",
        status: "active",
      }),
    ),
    seedProfilePair(
      WAITER_A,
      profile({
        uid: WAITER_A,
        restaurantId: RESTAURANT_A,
        role: "waiter",
        status: "active",
      }),
    ),
    seedProfilePair(
      VIEWER_A,
      profile({
        uid: VIEWER_A,
        restaurantId: RESTAURANT_A,
        role: "viewer",
        status: "active",
      }),
    ),
    seedProfilePair(
      DISABLED_A,
      profile({
        uid: DISABLED_A,
        restaurantId: RESTAURANT_A,
        role: "admin",
        status: "disabled",
      }),
    ),
    seedProfilePair(
      LEGACY_A,
      profile({
        uid: LEGACY_A,
        restaurantId: RESTAURANT_A,
        role: "staff",
        status: "active",
      }),
    ),
    seedProfilePair(
      OWNER_B,
      profile({
        uid: OWNER_B,
        restaurantId: RESTAURANT_B,
        role: "owner",
        status: "active",
      }),
    ),
  ]);
}

function rulesDb(uid: keyof typeof IDENTITIES) {
  return testEnv
    .authenticatedContext(uid, { email: IDENTITIES[uid] })
    .firestore();
}

function menuImportDraftCreatePayload(uid: string, draftId: string) {
  const now = Date.now();
  return {
    id: draftId,
    restaurantId: RESTAURANT_A,
    sourceType: "image",
    menuType: "food",
    status: "draft",
    sections: [],
    items: [],
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
    serverSavedAt: serverTimestamp(),
  };
}

function supplierAliasCreatePayload(restaurantId = RESTAURANT_A) {
  return {
    restaurantId,
    rawText: "Tomate triturado",
    normalizedText: "tomate triturado",
    inventoryProductId: "inventory-product-a",
    inventoryProductName: "Tomate",
    usageCount: 1,
    active: true,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastUsedAt: serverTimestamp(),
    matchSource: "auto",
  };
}

function request(
  method: string,
  token?: string,
  body?: Record<string, unknown>,
): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function formReadSpyRequest(token?: string) {
  const req = request("POST", token);
  let reads = 0;
  Object.defineProperty(req, "formData", {
    value: async () => {
      reads += 1;
      return new FormData();
    },
  });
  return { req, reads: () => reads };
}

function jsonReadSpyRequest(token?: string) {
  const req = request("POST", token, { draftId: "draft-a" });
  let reads = 0;
  Object.defineProperty(req, "json", {
    value: async () => {
      reads += 1;
      return { draftId: "draft-a" };
    },
  });
  return { req, reads: () => reads };
}

function multipartRequest(token: string, file: File, restaurantId?: string) {
  const form = new FormData();
  form.append("file", file);
  if (restaurantId) form.append("restaurantId", restaurantId);
  return new Request("http://localhost/api/ai/import-menu", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

function authVerifier(
  tokens: Record<
    string,
    { uid: string; email: string; email_verified?: boolean }
  >,
): AuthTokenVerifier {
  return {
    async verifyIdToken(token, checkRevoked) {
      assert.equal(checkRevoked, true);
      if (token === "invalid" || token === "revoked" || !tokens[token]) {
        throw new Error(token === "revoked" ? "TOKEN_REVOKED" : "INVALID_TOKEN");
      }
      return tokens[token];
    },
  };
}

function dependencies(
  tokens: Record<
    string,
    { uid: string; email: string; email_verified?: boolean }
  >,
): AuthenticatedRestaurantDependencies {
  return { auth: authVerifier(tokens), db: adminDb };
}

async function responseBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function createInvite(input: {
  id: string;
  token: string;
  email: string;
  role?: "admin" | "manager" | "waiter" | "staff" | "owner";
  status?: string;
  restaurantId?: string;
  creatorUid?: string;
  expiresAt?: Timestamp;
}) {
  await adminDb.collection("restaurant_invites").doc(input.id).set({
    email: input.email,
    restaurantId: input.restaurantId ?? RESTAURANT_A,
    restaurantName: "Restaurante A",
    role: input.role ?? "staff",
    status: input.status ?? "pending",
    tokenHash: hashInviteToken(input.token),
    createdByUid: input.creatorUid ?? OWNER_A,
    createdAt: Timestamp.now(),
    expiresAt:
      input.expiresAt ?? Timestamp.fromMillis(Date.now() + 60_000),
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
  adminApp = initializeApp({ projectId: PROJECT_ID }, "profile-hardening-tests");
  adminDb = getAdminFirestore(adminApp);
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseData();
});

after(async () => {
  await testEnv.cleanup();
  await deleteApp(adminApp);
});

describe("Política de roles operativos", () => {
  test("normaliza aliases conocidos y deniega roles inválidos", () => {
    for (const [storedRole, expected] of [
      ["owner", "owner"],
      ["propietario", "owner"],
      ["admin", "admin"],
      ["administrator", "admin"],
      ["manager", "manager"],
      ["gerente", "manager"],
      ["encargado", "manager"],
      ["staff", "waiter"],
      ["operativo", "waiter"],
      ["operational", "waiter"],
      ["employee", "waiter"],
      ["empleado", "waiter"],
      ["waiter", "waiter"],
      ["camarero", "waiter"],
      ["camarera", "waiter"],
      ["staff_tpv", "waiter"],
      ["kitchen", "kitchen"],
      ["cocina", "kitchen"],
      ["cook", "kitchen"],
      ["viewer", "viewer"],
      ["readonly", "viewer"],
      ["read_only", "viewer"],
    ] as const) {
      assert.equal(normalizeAuthorizationRole(storedRole), expected);
    }
    for (const invalid of ["", "unknown-role", null, undefined]) {
      assert.equal(normalizeAuthorizationRole(invalid), null);
      assert.deepEqual(listCapabilitiesForRole(invalid), []);
    }
  });

  test("staff histórico conserva solo capacidades TPV mínimas", () => {
    for (const capability of [
      "tpv.sell",
      "tpv.cancel_line",
      "tpv.charge",
    ] as const) {
      assert.equal(hasCapability("staff", capability), true);
    }
    for (const capability of [
      "tpv.discount",
      "tpv.refund",
      "tpv.join_tables",
      "kds.manage",
      "inventory.view",
      "inventory.edit",
      "purchases.view",
      "purchases.manage",
      "supplier_invoices.manage",
      "analytics.view",
      "settings.manage",
      "users.manage",
    ] as const) {
      assert.equal(hasCapability("staff", capability), false);
    }
  });

  test("perfiles staff coherentes son waiter y aliases equivalentes entre mirrors", () => {
    const canonical = profile({
      uid: LEGACY_A,
      restaurantId: RESTAURANT_A,
      role: "staff",
      status: "active",
    });
    const authorized = evaluateProfileAuthorization({
      uid: LEGACY_A,
      email: IDENTITIES[LEGACY_A],
      canonical,
      mirror: { ...canonical, role: "waiter" },
    });
    assert.equal(authorized.ok, true);
    if (authorized.ok) assert.equal(authorized.profile.role, "waiter");

    for (const [canonicalRole, mirrorRole] of [
      ["staff", "waiter"],
      ["waiter", "staff"],
      ["operativo", "waiter"],
      ["employee", "waiter"],
      ["encargado", "manager"],
      ["readonly", "viewer"],
    ] as const) {
      const base = profile({
        uid: LEGACY_A,
        restaurantId: RESTAURANT_A,
        role: canonicalRole,
        status: "active",
      });
      const equivalent = evaluateProfileAuthorization({
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        canonical: base,
        mirror: { ...base, role: mirrorRole },
      });
      assert.equal(equivalent.ok, true, `${canonicalRole}/${mirrorRole}`);
    }

    for (const [name, canonicalRole, mirrorRole, expectedIssue] of [
      ["staff/manager", "staff", "manager", "PROFILE_ROLE_CONFLICT"],
      ["waiter/admin", "waiter", "admin", "PROFILE_ROLE_CONFLICT"],
      ["kitchen/waiter", "kitchen", "waiter", "PROFILE_ROLE_CONFLICT"],
      ["viewer/manager", "viewer", "manager", "PROFILE_ROLE_CONFLICT"],
      ["rol desconocido", "unknown", "unknown", "PROFILE_ROLE_INVALID"],
    ] as const) {
      const base = profile({
        uid: LEGACY_A,
        restaurantId: RESTAURANT_A,
        role: canonicalRole,
        status: "active",
      });
      const result = evaluateProfileAuthorization({
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        canonical: base,
        mirror: { ...base, role: mirrorRole },
      });
      assert.equal(result.ok, false, name);
      if (!result.ok) assert.equal(result.issue, expectedIssue, name);
    }

    for (const [name, changed, expectedIssue] of [
      ["inactive", { status: "inactive" }, "PROFILE_DISABLED"],
      ["disabled", { status: "disabled" }, "PROFILE_DISABLED"],
      ["suspended", { status: "suspended" }, "PROFILE_DISABLED"],
      ["status ausente", { status: undefined }, "PROFILE_STATUS_INVALID"],
      ["status vacío", { status: "" }, "PROFILE_STATUS_INVALID"],
      ["status desconocido", { status: "unknown" }, "PROFILE_STATUS_INVALID"],
    ] as const) {
      const changedProfile = profile({
        uid: LEGACY_A,
        restaurantId: RESTAURANT_A,
        role: "staff",
        status: "active",
        extra: changed,
      });
      if (changed.status === undefined) {
        delete (changedProfile as { status?: string }).status;
      }
      const result = evaluateProfileAuthorization({
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        canonical: changedProfile,
        mirror: changedProfile,
      });
      assert.equal(result.ok, false, name);
      if (!result.ok) assert.equal(result.issue, expectedIssue, name);
    }

    for (const role of ["owner", "admin", "manager", "waiter", "staff"] as const) {
      const missingStatus = profile({
        uid: LEGACY_A,
        restaurantId: RESTAURANT_A,
        role,
      });
      delete (missingStatus as { status?: string }).status;
      const denied = evaluateProfileAuthorization({
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        canonical: missingStatus,
        mirror: missingStatus,
      });
      assert.equal(denied.ok, false, `${role} sin status`);
      if (!denied.ok) {
        assert.equal(denied.issue, "PROFILE_STATUS_INVALID", `${role} sin status`);
      }
    }

    const missingRole = { ...canonical };
    delete (missingRole as Partial<typeof missingRole>).role;
    const missing = evaluateProfileAuthorization({
      uid: LEGACY_A,
      email: IDENTITIES[LEGACY_A],
      canonical: missingRole,
      mirror: missingRole,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.issue, "PROFILE_ROLE_MISSING");
  });

  test("invitaciones convierten staff y operativo en waiter sin fallback desconocido", () => {
    for (const role of ["staff", "operativo", "waiter", "camarero"] as const) {
      const inputRole = normalizeStaffInviteInputRole(role);
      assert.ok(inputRole);
      assert.equal(mapOnboardingRoleToStaffInviteRole(inputRole), "waiter");
    }
    assert.equal(
      mapOnboardingRoleToStaffInviteRole("encargado"),
      "manager",
    );
    assert.equal(normalizeStaffInviteInputRole("unknown"), null);
    assert.equal(normalizeStaffInviteInputRole(""), null);
  });
});

describe("Rules: autoridad canónica, mirrors y status", () => {
  test("permite leer el perfil propio pero no perfiles ajenos", async () => {
    const db = rulesDb(VIEWER_A);
    await assertSucceeds(getDoc(doc(db, "users", VIEWER_A)));
    await assertSucceeds(getDoc(doc(db, "usuarios", VIEWER_A)));
    await assertFails(getDoc(doc(db, "users", ADMIN_A)));
  });

  test("permite solo restaurantName personal a un perfil activo", async () => {
    const db = rulesDb(VIEWER_A);
    await assertSucceeds(
      updateDoc(doc(db, "users", VIEWER_A), {
        restaurantName: "Nombre visible",
      }),
    );
    for (const patch of [
      { role: "owner" },
      { restaurantId: RESTAURANT_B },
      { restaurantIds: [RESTAURANT_A, RESTAURANT_B] },
      { permissions: { admin: true } },
      { capabilities: ["*"] },
      { status: "disabled" },
    ]) {
      await assertFails(updateDoc(doc(db, "users", VIEWER_A), patch));
    }
  });

  test("status disabled permite lectura propia pero bloquea tenant y escrituras", async () => {
    const db = rulesDb(DISABLED_A);
    await assertSucceeds(getDoc(doc(db, "users", DISABLED_A)));
    await assertFails(getDoc(doc(db, "restaurants", RESTAURANT_A)));
    await assertFails(
      updateDoc(doc(db, "users", DISABLED_A), {
        restaurantName: "No permitido",
      }),
    );
  });

  test("status ausente o inválido falla cerrado en Rules", async () => {
    await seedProfilePair(
      "no-status-a",
      profile({
        uid: "no-status-a",
        restaurantId: RESTAURANT_A,
        role: "owner",
      }),
    );
    const db = testEnv
      .authenticatedContext("no-status-a", { email: "no-status-a@example.test" })
      .firestore();
    await assertFails(getDoc(doc(db, "restaurants", RESTAURANT_A)));
  });

  test("mirrors con roles alias equivalentes conservan acceso operativo", async () => {
    await seedProfilePair(
      "alias-waiter-a",
      profile({
        uid: "alias-waiter-a",
        restaurantId: RESTAURANT_A,
        role: "staff",
        status: "active",
      }),
      profile({
        uid: "alias-waiter-a",
        restaurantId: RESTAURANT_A,
        role: "waiter",
        status: "active",
      }),
    );
    const db = testEnv
      .authenticatedContext("alias-waiter-a", {
        email: "alias-waiter-a@example.test",
      })
      .firestore();
    await assertSucceeds(getDoc(doc(db, "restaurants", RESTAURANT_A)));
  });

  test("staff histórico opera TPV pero no hereda escrituras gerenciales", async () => {
    const db = rulesDb(LEGACY_A);
    await assertFails(
      setDoc(doc(db, "orders", "staff-order"), {
        restaurantId: RESTAURANT_A,
        tableId: "mesa-1",
        status: "open",
      }),
    );
    await assertFails(
      setDoc(doc(db, "payments", "staff-payment"), {
        restaurantId: RESTAURANT_A,
        amount: 12,
        status: "paid",
        type: "table_amount",
      }),
    );

    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("staff-product")
      .set({ restaurantId: RESTAURANT_A, name: "Producto" });
    await adminDb.collection("orders").doc("foreign-order").set({
      restaurantId: RESTAURANT_B,
      status: "open",
    });

    await assertFails(
      deleteDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "products",
          "staff-product",
        ),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "products",
          "staff-product-create",
        ),
        { restaurantId: RESTAURANT_A, name: "No permitido" },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "products",
          "staff-product",
          "stockMovements",
          "staff-stock",
        ),
        { restaurantId: RESTAURANT_A, quantity: 1 },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "purchaseOrders",
          "staff-purchase",
        ),
        { restaurantId: RESTAURANT_A },
      ),
    );
    for (const [collectionName, documentId] of [
      ["inventoryReceipts", "staff-receipt"],
      ["stockMovements", "staff-stock-root"],
      ["purchaseDrafts", "staff-draft"],
      ["operationStations", "staff-operation-station"],
      ["productionStations", "staff-production-station"],
      ["productFamilies", "staff-family"],
      ["modifierGroups", "staff-modifier-group"],
    ] as const) {
      await assertFails(
        setDoc(
          doc(
            db,
            "restaurants",
            RESTAURANT_A,
            collectionName,
            documentId,
          ),
          { restaurantId: RESTAURANT_A, name: "No permitido" },
        ),
      );
    }
    await assertFails(
      setDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "supplierInvoices",
          "staff-invoice",
        ),
        { restaurantId: RESTAURANT_A },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "config",
          "tableGroups",
        ),
        { groups: [] },
      ),
    );
    await assertFails(getDoc(doc(db, "users", ADMIN_A)));
    await assertFails(getDoc(doc(db, "orders", "foreign-order")));

    for (const [collectionName, documentId] of [
      ["inventoryProducts", "staff-inventory"],
      ["purchaseDrafts", "staff-draft-read"],
      ["purchaseOrders", "staff-purchase-read"],
      ["purchaseReceipts", "staff-receipt-read"],
      ["supplierInvoices", "staff-invoice-read"],
      ["supplierProductAliases", "staff-alias-read"],
    ] as const) {
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection(collectionName)
        .doc(documentId)
        .set({ restaurantId: RESTAURANT_A, name: "Seed" });
      await assertFails(
        getDoc(
          doc(
            db,
            "restaurants",
            RESTAURANT_A,
            collectionName,
            documentId,
          ),
        ),
      );
    }
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("inventoryReceipts")
      .doc("staff-root-receipt")
      .set({ restaurantId: RESTAURANT_A });
    await assertFails(
      getDoc(
        doc(
          db,
          "restaurants",
          RESTAURANT_A,
          "inventoryReceipts",
          "staff-root-receipt",
        ),
      ),
    );

    await assertSucceeds(
      setDoc(
        doc(
          rulesDb(OWNER_A),
          "restaurants",
          RESTAURANT_A,
          "productFamilies",
          "owner-family",
        ),
        { restaurantId: RESTAURANT_A, name: "Familia" },
      ),
    );
  });

  for (const scenario of [
    {
      name: "tenant diferente",
      canonical: { restaurantId: RESTAURANT_B },
      mirror: {},
    },
    {
      name: "rol diferente",
      canonical: { role: "admin" },
      mirror: {},
    },
    {
      name: "status diferente",
      canonical: { status: "disabled" },
      mirror: {},
    },
    {
      name: "rol en un mirror y tenant en el otro",
      canonical: { role: "admin" },
      mirror: { restaurantId: RESTAURANT_B },
    },
    {
      name: "restaurantIds históricos incompatibles",
      canonical: { restaurantIds: [RESTAURANT_A] },
      mirror: { restaurantIds: [RESTAURANT_A, RESTAURANT_B] },
    },
    {
      name: "capabilities incompatibles",
      canonical: { capabilities: ["analytics.view"] },
      mirror: { capabilities: ["users.manage"] },
    },
  ]) {
    test(`falla cerrado ante ${scenario.name}`, async () => {
      const base = profile({
        uid: VIEWER_A,
        restaurantId: RESTAURANT_A,
        role: "viewer",
        status: "active",
      });
      await seedProfilePair(
        VIEWER_A,
        { ...base, ...scenario.canonical },
        { ...base, ...scenario.mirror },
      );
      await assertFails(
        getDoc(doc(rulesDb(VIEWER_A), "restaurants", RESTAURANT_A)),
      );
    });
  }

  test("un mirror ausente no autoriza ni se repara", async () => {
    await adminDb.collection("usuarios").doc(VIEWER_A).delete();
    await assertFails(
      getDoc(doc(rulesDb(VIEWER_A), "restaurants", RESTAURANT_A)),
    );
    assert.equal(
      (await adminDb.collection("usuarios").doc(VIEWER_A).get()).exists,
      false,
    );
  });

  test("campos arbitrarios iguales o cosméticos no amplían autorización", async () => {
    const base = profile({
      uid: VIEWER_A,
      restaurantId: RESTAURANT_A,
      role: "viewer",
      status: "active",
      extra: { favoriteColor: "blue" },
    });
    await seedProfilePair(VIEWER_A, base);
    await assertSucceeds(
      getDoc(doc(rulesDb(VIEWER_A), "restaurants", RESTAURANT_A)),
    );
  });

  test("restaurantIds no amplía el tenant canónico", async () => {
    const base = profile({
      uid: VIEWER_A,
      restaurantId: RESTAURANT_A,
      role: "viewer",
      status: "active",
      extra: { restaurantIds: [RESTAURANT_A, RESTAURANT_B] },
    });
    await seedProfilePair(VIEWER_A, base);
    await assertFails(
      getDoc(doc(rulesDb(VIEWER_A), "restaurants", RESTAURANT_B)),
    );
  });

  test("toda gestión cliente de invitaciones está denegada", async () => {
    const db = rulesDb(OWNER_A);
    const ref = doc(db, "restaurant_invites", "legacy-client");
    await assertFails(
      setDoc(ref, {
        email: "target@example.test",
        restaurantId: RESTAURANT_A,
        role: "staff",
        status: "pending",
      }),
    );
    await createInvite({
      id: "server-invite",
      token: "secret",
      email: "target@example.test",
    });
    await assertFails(getDoc(doc(db, "restaurant_invites", "server-invite")));
    await assertFails(
      updateDoc(doc(db, "restaurant_invites", "server-invite"), {
        status: "accepted",
      }),
    );
  });

  test("menuImportDrafts acepta create canónico y rechaza campos extra o tenant ajeno", async () => {
    const ownerRef = doc(
      rulesDb(OWNER_A),
      "restaurants",
      RESTAURANT_A,
      "menuImportDrafts",
      "owner-draft",
    );
    const viewerRef = doc(
      rulesDb(VIEWER_A),
      "restaurants",
      RESTAURANT_A,
      "menuImportDrafts",
      "viewer-draft",
    );
    await assertSucceeds(
      setDoc(ownerRef, menuImportDraftCreatePayload(OWNER_A, "owner-draft")),
    );
    await assertSucceeds(getDoc(ownerRef));
    await assertFails(
      setDoc(
        doc(
          rulesDb(OWNER_A),
          "restaurants",
          RESTAURANT_A,
          "menuImportDrafts",
          "extra-field",
        ),
        {
          ...menuImportDraftCreatePayload(OWNER_A, "extra-field"),
          publishInProgress: false,
        },
      ),
    );
    await assertFails(
      setDoc(
        viewerRef,
        menuImportDraftCreatePayload(VIEWER_A, "viewer-draft"),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          rulesDb(VIEWER_A),
          "restaurants",
          RESTAURANT_A,
          "menuImportDrafts",
          "owner-draft",
        ),
      ),
    );
    const crossTenantRef = doc(
      rulesDb(OWNER_A),
      "restaurants",
      RESTAURANT_B,
      "menuImportDrafts",
      "cross-tenant",
    );
    await assertFails(
      setDoc(crossTenantRef, {
        ...menuImportDraftCreatePayload(OWNER_A, "cross-tenant"),
        restaurantId: RESTAURANT_B,
      }),
    );
  });

  test("menuImportDrafts limita cliente a fuente canónica y deniega revisión directa", async () => {
    const ownerDb = rulesDb(OWNER_A);
    const draftRef = doc(
      ownerDb,
      "restaurants",
      RESTAURANT_A,
      "menuImportDrafts",
      "review-draft",
    );
    await assertSucceeds(
      setDoc(
        draftRef,
        menuImportDraftCreatePayload(OWNER_A, "review-draft"),
      ),
    );
    await assertSucceeds(
      updateDoc(draftRef, {
        storagePath: `restaurants/${RESTAURANT_A}/menu-imports/review-draft/menu.png`,
        originalFileName: "menu.png",
        updatedAt: Date.now() + 1,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        storagePath: `restaurants/${RESTAURANT_A}/menu-imports/review-draft/menu-b.png`,
        originalFileName: "menu-b.png",
        updatedAt: Date.now() + 2,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        storagePath: deleteField(),
        updatedAt: Date.now() + 3,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        originalFileName: deleteField(),
        updatedAt: Date.now() + 4,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        originalFileName: "renamed.png",
        updatedAt: Date.now() + 5,
        updatedBy: OWNER_A,
      }),
    );

    for (const [storagePath, offset] of [
      [
        `restaurants/${RESTAURANT_B}/menu-imports/review-draft/menu.png`,
        2,
      ],
      [
        `restaurants/${RESTAURANT_A}/menu-imports/other-draft/menu.png`,
        3,
      ],
      [
        `restaurants/${RESTAURANT_A}/menu-imports/review-draft/nested/menu.png`,
        4,
      ],
      [
        ` restaurants/${RESTAURANT_A}/menu-imports/review-draft/menu.png`,
        5,
      ],
      [
        `restaurants/${RESTAURANT_A}/menu-imports/review-draft/menu%2Fother.png`,
        6,
      ],
      [
        `restaurants/${RESTAURANT_A}/menu-imports/review-draft/.`,
        7,
      ],
    ] as const) {
      await assertFails(
        updateDoc(draftRef, {
          storagePath,
          updatedAt: Date.now() + offset,
          updatedBy: OWNER_A,
        }),
      );
    }
    for (const [fileName, offset] of [
      ["menu..png", 11],
      ["..menu.png", 12],
      ["menu...pdf", 13],
    ] as const) {
      const invalidDraftId = `invalid-dots-${offset}`;
      const invalidRef = doc(
        ownerDb,
        "restaurants",
        RESTAURANT_A,
        "menuImportDrafts",
        invalidDraftId,
      );
      await assertSucceeds(
        setDoc(
          invalidRef,
          menuImportDraftCreatePayload(OWNER_A, invalidDraftId),
        ),
      );
      await assertFails(
        updateDoc(invalidRef, {
          storagePath:
            `restaurants/${RESTAURANT_A}/menu-imports/${invalidDraftId}/${fileName}`,
          originalFileName: fileName,
          updatedAt: Date.now() + offset,
          updatedBy: OWNER_A,
        }),
      );
    }
    await assertFails(
      updateDoc(draftRef, {
        status: "analyzing",
        updatedAt: Date.now() + 8,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        publishInProgress: true,
        updatedAt: Date.now() + 9,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        restaurantId: RESTAURANT_B,
        updatedAt: Date.now() + 10,
        updatedBy: OWNER_A,
      }),
    );

    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("menuImportDrafts")
      .doc("ready-review")
      .set({
        ...menuImportDraftCreatePayload(OWNER_A, "ready-review"),
        status: "ready",
        sections: [{
          id: "section-a",
          name: "General",
          items: [{
            id: "item-a",
            name: "Producto",
            confidence: 25,
            selectedForPublish: true,
          }],
        }],
        items: [{
          id: "item-a",
          name: "Producto",
          confidence: 25,
          selectedForPublish: true,
        }],
        publishInProgress: false,
        serverSavedAt: Timestamp.now(),
      });
    const readyRef = doc(
      ownerDb,
      "restaurants",
      RESTAURANT_A,
      "menuImportDrafts",
      "ready-review",
    );
    await assertFails(
      updateDoc(readyRef, {
        sections: [{
          id: "section-a",
          name: "General",
          items: [{
            id: "item-a",
            name: "Producto manipulado",
            confidence: 100,
            aiConfidence: 100,
            selectedForPublish: true,
          }],
        }],
        items: [{
          id: "item-a",
          name: "Producto manipulado",
          publishStatus: "published",
          publishedProductId: "forged-product",
          selectedForPublish: true,
        }],
        updatedAt: Date.now() + 11,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(
      updateDoc(readyRef, {
        lastPublishPreview: { totals: { createCount: 1 } },
        updatedAt: Date.now() + 6,
        updatedBy: OWNER_A,
      }),
    );
    await assertFails(deleteDoc(readyRef));
  });

  test("products conserva restaurantId inmutable y aislado por tenant", async () => {
    const ownerARef = doc(rulesDb(OWNER_A), "products", "legacy-product-a");
    await assertSucceeds(
      setDoc(ownerARef, {
        restaurantId: RESTAURANT_A,
        name: "Producto A",
        active: true,
      }),
    );
    await assertSucceeds(updateDoc(ownerARef, { name: "Producto A editado" }));
    await assertFails(
      updateDoc(ownerARef, { restaurantId: RESTAURANT_B }),
    );
    await assertFails(
      getDoc(doc(rulesDb(OWNER_B), "products", "legacy-product-a")),
    );
    assert.equal((await getDoc(ownerARef)).data()?.restaurantId, RESTAURANT_A);
  });

  test("el plan comercial del restaurante es server-only", async () => {
    const restaurantPath = `restaurants/${RESTAURANT_A}`;
    await adminDb.doc(restaurantPath).set(
      {
        subscription: { plan: "pro", status: "active" },
        billing: { plan: "pro" },
        plan: "pro",
      },
      { merge: true },
    );

    const ownerRef = doc(rulesDb(OWNER_A), restaurantPath);
    await assertSucceeds(
      updateDoc(ownerRef, {
        name: "Restaurante A actualizado",
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(updateDoc(ownerRef, { subscription: { plan: "ultra" } }));
    await assertFails(updateDoc(ownerRef, { billing: { plan: "ultra" } }));
    await assertFails(updateDoc(ownerRef, { plan: "ultra" }));
    await assertFails(
      updateDoc(ownerRef, {
        subscription: deleteField(),
        billing: deleteField(),
        plan: deleteField(),
      }),
    );

    const legacyTenantRef = doc(
      rulesDb(OWNER_B),
      "restaurants",
      RESTAURANT_B,
    );
    await assertFails(
      updateDoc(legacyTenantRef, { subscription: { plan: "ultra" } }),
    );
    await assertFails(
      updateDoc(
        doc(rulesDb(OWNER_A), "restaurants", RESTAURANT_B),
        { name: "Acceso cruzado" },
      ),
    );

    const stored = (await adminDb.doc(restaurantPath).get()).data();
    assert.deepEqual(stored?.subscription, { plan: "pro", status: "active" });
    assert.deepEqual(stored?.billing, { plan: "pro" });
    assert.equal(stored?.plan, "pro");
  });

  test("supplierProductAliases exige capability, tenant, mirrors y allowlist", async () => {
    for (const uid of [OWNER_A, ADMIN_A, MANAGER_A] as const) {
      const aliasId = `alias-${uid}`;
      await assertSucceeds(
        setDoc(
          doc(
            rulesDb(uid),
            "restaurants",
            RESTAURANT_A,
            "supplierProductAliases",
            aliasId,
          ),
          supplierAliasCreatePayload(),
        ),
      );
    }

    for (const uid of [VIEWER_A, WAITER_A, DISABLED_A] as const) {
      await assertFails(
        setDoc(
          doc(
            rulesDb(uid),
            "restaurants",
            RESTAURANT_A,
            "supplierProductAliases",
            `denied-${uid}`,
          ),
          supplierAliasCreatePayload(),
        ),
      );
    }

    await assertFails(
      setDoc(
        doc(
          rulesDb(OWNER_A),
          "restaurants",
          RESTAURANT_B,
          "supplierProductAliases",
          "cross-tenant",
        ),
        supplierAliasCreatePayload(RESTAURANT_B),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          rulesDb(OWNER_A),
          "restaurants",
          RESTAURANT_A,
          "supplierProductAliases",
          "extra-field",
        ),
        { ...supplierAliasCreatePayload(), arbitrary: true },
      ),
    );

    const managerProfile = profile({
      uid: MANAGER_A,
      restaurantId: RESTAURANT_A,
      role: "manager",
      status: "active",
    });
    await seedProfilePair(MANAGER_A, managerProfile, {
      ...managerProfile,
      role: "viewer",
    });
    await assertFails(
      setDoc(
        doc(
          rulesDb(MANAGER_A),
          "restaurants",
          RESTAURANT_A,
          "supplierProductAliases",
          "mirror-conflict",
        ),
        supplierAliasCreatePayload(),
      ),
    );
  });

  test("supplierProductAliases preserva tenant, identidad y deniega delete", async () => {
    const aliasRef = doc(
      rulesDb(MANAGER_A),
      "restaurants",
      RESTAURANT_A,
      "supplierProductAliases",
      "managed-alias",
    );
    await assertSucceeds(setDoc(aliasRef, supplierAliasCreatePayload()));
    await assertSucceeds(
      updateDoc(aliasRef, {
        inventoryProductId: "inventory-product-b",
        inventoryProductName: "Tomate premium",
        matchSource: "manual",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(aliasRef, {
        restaurantId: RESTAURANT_B,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(aliasRef, {
        normalizedText: "otro alias",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(aliasRef));
  });

  test("trabajos y consumo de imágenes masivas son server-only incluso dentro del mismo tenant", async () => {
    const jobPath = `restaurants/${RESTAURANT_A}/catalogImageJobs/bulk-job-rules`;
    const itemPath = `${jobPath}/items/product-a`;
    const usagePath = `restaurants/${RESTAURANT_A}/catalogImageUsage/bulk-usage-rules`;
    await Promise.all([
      adminDb.doc(jobPath).set({
        restaurantId: RESTAURANT_A,
        status: "queued",
      }),
      adminDb.doc(itemPath).set({
        restaurantId: RESTAURANT_A,
        productId: "product-a",
        status: "pending",
      }),
      adminDb.doc(usagePath).set({
        restaurantId: RESTAURANT_A,
        productId: "product-a",
        status: "succeeded",
      }),
    ]);

    const ownerDb = rulesDb(OWNER_A);
    const otherDb = rulesDb(OWNER_B);
    for (const path of [jobPath, itemPath, usagePath]) {
      await assertFails(getDoc(doc(ownerDb, path)));
      await assertFails(getDoc(doc(otherDb, path)));
      await assertFails(setDoc(doc(ownerDb, `${path}-client`), { status: "queued" }));
    }
  });
});

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_BYTES = new TextEncoder().encode("RIFF0000WEBP");
const GIF_BYTES = new TextEncoder().encode("GIF89a");
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%");

describe("Storage Rules: contenido, capability y operaciones", () => {
  test("acepta solo JPEG, PNG, WebP y GIF como imágenes", async () => {
    const storage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    for (const [extension, contentType, bytes] of [
      ["jpg", "image/jpeg", JPEG_BYTES],
      ["png", "image/png", PNG_BYTES],
      ["webp", "image/webp", WEBP_BYTES],
      ["gif", "image/gif", GIF_BYTES],
    ] as const) {
      await assertSucceeds(
        uploadBytes(
          storageRef(
            storage,
            `restaurants/${RESTAURANT_A}/products/product-a/image.${extension}`,
          ),
          bytes,
          { contentType },
        ),
      );
    }
    for (const [extension, contentType] of [
      ["avif", "image/avif"],
      ["bmp", "image/bmp"],
      ["heic", "image/heic"],
      ["heif", "image/heif"],
      ["svg", "image/svg+xml"],
      ["html", "text/html"],
    ] as const) {
      await assertFails(
        uploadBytes(
          storageRef(
            storage,
            `restaurants/${RESTAURANT_A}/products/product-a/image.${extension}`,
          ),
          new TextEncoder().encode("unsupported"),
          { contentType },
        ),
      );
    }
  });

  test("owner puede crear imágenes y PDF válidos solo en su tenant", async () => {
    const storage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const otherTenantStorage = testEnv
      .authenticatedContext(OWNER_B, { email: IDENTITIES[OWNER_B] })
      .storage();
    await assertSucceeds(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/image.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    await assertSucceeds(
      uploadBytes(
        storageRef(storage, `restaurant-logos/${RESTAURANT_A}/logo.png`),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    await assertSucceeds(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/menu-imports/draft/menu.pdf`,
        ),
        PDF_BYTES,
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_B}/products/product-b/image.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    const otherPath = `restaurants/${RESTAURANT_B}/products/product-b/owned.png`;
    await assertSucceeds(
      uploadBytes(storageRef(otherTenantStorage, otherPath), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertFails(getBytes(storageRef(storage, otherPath)));
  });

  test("viewer no puede crear, sobrescribir ni borrar contenido", async () => {
    const ownerStorage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const viewerStorage = testEnv
      .authenticatedContext(VIEWER_A, { email: IDENTITIES[VIEWER_A] })
      .storage();
    const path = `restaurants/${RESTAURANT_A}/products/product-a/shared.png`;
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          viewerStorage,
          `restaurants/${RESTAURANT_A}/products/product-a/viewer.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(storageRef(viewerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertFails(deleteObject(storageRef(viewerStorage, path)));
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertSucceeds(deleteObject(storageRef(ownerStorage, path)));
  });

  test("logo conserva update/delete administrativo y los deniega a viewer", async () => {
    const ownerStorage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const viewerStorage = testEnv
      .authenticatedContext(VIEWER_A, { email: IDENTITIES[VIEWER_A] })
      .storage();
    const path = `restaurant-logos/${RESTAURANT_A}/logo.png`;
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertFails(
      uploadBytes(storageRef(viewerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertFails(deleteObject(storageRef(viewerStorage, path)));
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PNG_BYTES, {
        contentType: "image/png",
      }),
    );
    await assertSucceeds(deleteObject(storageRef(ownerStorage, path)));
  });

  test("importación permite create/update válido y deniega MIME, viewer y delete", async () => {
    const ownerStorage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const viewerStorage = testEnv
      .authenticatedContext(VIEWER_A, { email: IDENTITIES[VIEWER_A] })
      .storage();
    const path =
      `restaurants/${RESTAURANT_A}/menu-imports/draft/menu.pdf`;
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PDF_BYTES, {
        contentType: "application/pdf",
      }),
    );
    await assertSucceeds(
      uploadBytes(storageRef(ownerStorage, path), PDF_BYTES, {
        contentType: "application/pdf",
      }),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          ownerStorage,
          `restaurants/${RESTAURANT_A}/menu-imports/draft/menu.txt`,
        ),
        new TextEncoder().encode("plain"),
        { contentType: "text/plain" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          viewerStorage,
          `restaurants/${RESTAURANT_A}/menu-imports/draft/viewer.pdf`,
        ),
        PDF_BYTES,
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(deleteObject(storageRef(ownerStorage, path)));
  });

  test("rechaza MIME inválido, archivo vacío y tamaños excedidos", async () => {
    const storage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/file.txt`,
        ),
        new TextEncoder().encode("not-image"),
        { contentType: "text/plain" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/vector.svg`,
        ),
        new TextEncoder().encode("<svg></svg>"),
        { contentType: "image/svg+xml" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/document.pdf`,
        ),
        PDF_BYTES,
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/empty.png`,
        ),
        new Uint8Array(),
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/products/product-a/large.png`,
        ),
        new Uint8Array(3 * 1024 * 1024 + 1),
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(
          storage,
          `restaurants/${RESTAURANT_A}/menu-imports/draft/large.pdf`,
        ),
        new Uint8Array(12 * 1024 * 1024 + 1),
        { contentType: "application/pdf" },
      ),
    );
  });

  test("disabled, mirror ausente y perfil solo legacy no escriben", async () => {
    const disabledStorage = testEnv
      .authenticatedContext(DISABLED_A, { email: IDENTITIES[DISABLED_A] })
      .storage();
    await assertFails(
      uploadBytes(
        storageRef(
          disabledStorage,
          `restaurants/${RESTAURANT_A}/menu-imports/draft/file.pdf`,
        ),
        PDF_BYTES,
        { contentType: "application/pdf" },
      ),
    );

    await adminDb.collection("usuarios").doc(ADMIN_A).delete();
    const missingMirrorStorage = testEnv
      .authenticatedContext(ADMIN_A, { email: IDENTITIES[ADMIN_A] })
      .storage();
    await assertFails(
      uploadBytes(
        storageRef(
          missingMirrorStorage,
          `restaurant-logos/${RESTAURANT_A}/logo.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    const adminProfile = profile({
      uid: ADMIN_A,
      restaurantId: RESTAURANT_A,
      role: "admin",
      status: "active",
    });
    await seedProfilePair(ADMIN_A, adminProfile, {
      ...adminProfile,
      role: "owner",
    });
    await assertFails(
      uploadBytes(
        storageRef(
          missingMirrorStorage,
          `restaurant-logos/${RESTAURANT_A}/conflict.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );

    await adminDb.collection("users").doc(LEGACY_A).delete();
    const legacyOnlyStorage = testEnv
      .authenticatedContext(LEGACY_A, { email: IDENTITIES[LEGACY_A] })
      .storage();
    await assertFails(
      uploadBytes(
        storageRef(legacyOnlyStorage, `productos/${LEGACY_A}/image.png`),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
  });

  test("staff no escribe assets administrativos y conserva lecturas TPV", async () => {
    const storage = testEnv
      .authenticatedContext(LEGACY_A, { email: IDENTITIES[LEGACY_A] })
      .storage();
    const productPath =
      `restaurants/${RESTAURANT_A}/products/product-visible/image.png`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(
        storageRef(context.storage(), productPath),
        PNG_BYTES,
        { contentType: "image/png" },
      );
    });
    await assertSucceeds(getBytes(storageRef(storage, productPath)));

    for (const [path, contentType, bytes] of [
      [`productos/${LEGACY_A}/image.png`, "image/png", PNG_BYTES],
      [
        `restaurants/${RESTAURANT_A}/menu-imports/draft-staff/menu.png`,
        "image/png",
        PNG_BYTES,
      ],
      [
        `restaurants/${RESTAURANT_A}/products/product-staff/image.png`,
        "image/png",
        PNG_BYTES,
      ],
      [`restaurant-logos/${RESTAURANT_A}/logo.png`, "image/png", PNG_BYTES],
      [
        `restaurants/${RESTAURANT_A}/supplier-invoice-uploads/invoice.png`,
        "image/png",
        PNG_BYTES,
      ],
      [
        `restaurants/${RESTAURANT_A}/administrative/config.json`,
        "application/json",
        new TextEncoder().encode("{}"),
      ],
    ] as const) {
      await assertFails(
        uploadBytes(storageRef(storage, path), bytes, { contentType }),
      );
    }
  });

  test("storage acepta mirrors alias equivalentes y deniega status ausente", async () => {
    await seedProfilePair(
      "alias-storage-a",
      profile({
        uid: "alias-storage-a",
        restaurantId: RESTAURANT_A,
        role: "staff",
        status: "active",
      }),
      profile({
        uid: "alias-storage-a",
        restaurantId: RESTAURANT_A,
        role: "waiter",
        status: "active",
      }),
    );
    const ownerStorage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const productImagePath = `restaurants/${RESTAURANT_A}/products/product-alias/image.png`;
    await uploadBytes(storageRef(ownerStorage, productImagePath), PNG_BYTES, {
      contentType: "image/png",
    });
    const aliasStorage = testEnv
      .authenticatedContext("alias-storage-a", {
        email: "alias-storage-a@example.test",
      })
      .storage();
    await assertSucceeds(getBytes(storageRef(aliasStorage, productImagePath)));

    await seedProfilePair(
      "no-status-storage-a",
      profile({
        uid: "no-status-storage-a",
        restaurantId: RESTAURANT_A,
        role: "owner",
      }),
    );
    const deniedStorage = testEnv
      .authenticatedContext("no-status-storage-a", {
        email: "no-status-storage-a@example.test",
      })
      .storage();
    await assertFails(
      uploadBytes(
        storageRef(
          deniedStorage,
          `restaurants/${RESTAURANT_A}/products/product-a/denied.png`,
        ),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
  });

  test("ruta legacy exige uid propio, perfil autorizado y capability", async () => {
    const ownerStorage = testEnv
      .authenticatedContext(OWNER_A, { email: IDENTITIES[OWNER_A] })
      .storage();
    const managerStorage = testEnv
      .authenticatedContext(LEGACY_A, { email: IDENTITIES[LEGACY_A] })
      .storage();
    await assertSucceeds(
      uploadBytes(
        storageRef(ownerStorage, `productos/${OWNER_A}/image.png`),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        storageRef(managerStorage, `productos/${LEGACY_A}/image.png`),
        PNG_BYTES,
        { contentType: "image/png" },
      ),
    );
  });
});

describe("Bootstrap e invitaciones", () => {
  test("register_owner y usuario sin invitación fallan cerrados", async () => {
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "public-owner",
        email: "public-owner@example.test",
        emailVerified: true,
        intent: "register_owner",
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "OWNER_SELF_SERVICE_DISABLED",
    );
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "without-invite",
        email: "without-invite@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "INVITE_REQUIRED",
    );
  });

  test("email no verificado no consume la invitación", async () => {
    await createInvite({
      id: "unverified",
      token: "unverified-token",
      email: "new@example.test",
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "new-user",
        email: "new@example.test",
        emailVerified: false,
        intent: "accept_invite_only",
        inviteTokenHash: hashInviteToken("unverified-token"),
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "EMAIL_NOT_VERIFIED",
    );
    assert.equal(
      (await adminDb.collection("restaurant_invites").doc("unverified").get())
        .data()?.status,
      "pending",
    );
  });

  test("invitación válida crea ambos perfiles limitados e idempotentes", async () => {
    await createInvite({
      id: "valid",
      token: "valid-token",
      email: "new@example.test",
      role: "admin",
    });
    const params = {
      db: adminDb,
      uid: "new-user",
      email: "new@example.test",
      emailVerified: true,
      intent: "accept_invite_only" as const,
      inviteTokenHash: hashInviteToken("valid-token"),
    };
    const first = await bootstrapUserProfile(params);
    const second = await bootstrapUserProfile(params);
    const [canonical, mirror, invite] = await Promise.all([
      adminDb.collection("users").doc("new-user").get(),
      adminDb.collection("usuarios").doc("new-user").get(),
      adminDb.collection("restaurant_invites").doc("valid").get(),
    ]);
    assert.equal(first.source, "invite");
    assert.equal(second.source, "existing");
    assert.equal(canonical.data()?.role, "admin");
    assert.equal(canonical.data()?.status, "active");
    assert.deepEqual(canonical.data()?.restaurantId, mirror.data()?.restaurantId);
    assert.equal(invite.data()?.status, "accepted");
  });

  test("bootstrap rechaza roles de invitación desconocidos", async () => {
    await adminDb.collection("restaurant_invites").doc("unknown-role").set({
      email: "unknown-role@example.test",
      restaurantId: RESTAURANT_A,
      restaurantName: "Restaurante A",
      role: "supervisor",
      status: "pending",
      tokenHash: hashInviteToken("unknown-role-token"),
      createdByUid: OWNER_A,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "unknown-role-user",
        email: "unknown-role@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
        inviteTokenHash: hashInviteToken("unknown-role-token"),
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "INVITE_ROLE_INVALID",
    );
    assert.equal(
      (
        await adminDb.collection("users").doc("unknown-role-user").get()
      ).exists,
      false,
    );
  });

  test("bootstrap exige que una invitación admin siga respaldada por un owner", async () => {
    await createInvite({
      id: "admin-created-admin",
      token: "admin-created-admin-token",
      email: "admin-target@example.test",
      role: "admin",
      creatorUid: ADMIN_A,
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "admin-target",
        email: "admin-target@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
        inviteTokenHash: hashInviteToken("admin-created-admin-token"),
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "INVITE_CREATOR_UNAUTHORIZED",
    );
    assert.equal(
      (await adminDb.collection("users").doc("admin-target").get()).exists,
      false,
    );
  });

  for (const scenario of [
    {
      name: "expirada",
      status: "pending",
      expiresAt: Timestamp.fromMillis(Date.now() - 1_000),
      expected: "INVITE_EXPIRED",
    },
    {
      name: "revocada",
      status: "cancelled",
      expected: "INVITE_REVOKED",
    },
    {
      name: "ya usada",
      status: "accepted",
      expected: "INVITE_ALREADY_USED",
    },
  ]) {
    test(`rechaza invitación ${scenario.name}`, async () => {
      await createInvite({
        id: `invite-${scenario.name}`,
        token: `token-${scenario.name}`,
        email: `${scenario.name}@example.test`,
        status: scenario.status,
        expiresAt: scenario.expiresAt,
      });
      await assert.rejects(
        bootstrapUserProfile({
          db: adminDb,
          uid: `user-${scenario.name}`,
          email: `${scenario.name}@example.test`,
          emailVerified: true,
          intent: "accept_invite_only",
          inviteTokenHash: hashInviteToken(`token-${scenario.name}`),
        }),
        (error) =>
          error instanceof UserProfileBootstrapError &&
          error.code === scenario.expected,
      );
    });
  }

  test("rechaza email distinto y token duplicado", async () => {
    await createInvite({
      id: "email-bound",
      token: "shared-token",
      email: "intended@example.test",
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "attacker",
        email: "attacker@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
        inviteTokenHash: hashInviteToken("shared-token"),
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "INVITE_EMAIL_MISMATCH",
    );
    await createInvite({
      id: "duplicate-token",
      token: "shared-token",
      email: "intended@example.test",
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "intended",
        email: "intended@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
        inviteTokenHash: hashInviteToken("shared-token"),
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "INVITE_TOKEN_AMBIGUOUS",
    );
  });

  test("uso concurrente del token produce un único perfil autorizado", async () => {
    await createInvite({
      id: "concurrent",
      token: "concurrent-token",
      email: "concurrent@example.test",
    });
    const common = {
      db: adminDb,
      email: "concurrent@example.test",
      emailVerified: true,
      intent: "accept_invite_only" as const,
      inviteTokenHash: hashInviteToken("concurrent-token"),
    };
    const results = await Promise.allSettled([
      bootstrapUserProfile({ ...common, uid: "concurrent-a" }),
      bootstrapUserProfile({ ...common, uid: "concurrent-b" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const profiles = await adminDb
      .collection("users")
      .where("email", "==", "concurrent@example.test")
      .get();
    assert.equal(profiles.size, 1);
  });

  test("no combina mirrors conflictivos ni repara mirror ausente", async () => {
    const canonical = profile({
      uid: "conflict",
      restaurantId: RESTAURANT_A,
      role: "admin",
      status: "active",
    });
    await seedProfilePair("conflict", canonical, {
      ...canonical,
      restaurantId: RESTAURANT_B,
    });
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "conflict",
        email: "conflict@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "PROFILE_TENANT_CONFLICT",
    );

    const missing = profile({
      uid: "missing-mirror",
      restaurantId: RESTAURANT_A,
      role: "staff",
      status: "active",
    });
    await adminDb.collection("users").doc("missing-mirror").set(missing);
    await assert.rejects(
      bootstrapUserProfile({
        db: adminDb,
        uid: "missing-mirror",
        email: "missing-mirror@example.test",
        emailVerified: true,
        intent: "accept_invite_only",
      }),
      (error) =>
        error instanceof UserProfileBootstrapError &&
        error.code === "PROFILE_MIRROR_REVIEW_REQUIRED",
    );
    assert.equal(
      (await adminDb.collection("usuarios").doc("missing-mirror").get()).exists,
      false,
    );
  });
});

describe("Handlers reales de Auth, invitaciones y empleados", () => {
  test("legacy Admin APIs exigen Bearer, capability y tenant canónico", async () => {
    const deps = dependencies({
      owner: {
        uid: OWNER_A,
        email: IDENTITIES[OWNER_A],
        email_verified: true,
      },
      waiter: {
        uid: WAITER_A,
        email: IDENTITIES[WAITER_A],
        email_verified: true,
      },
      staff: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
    });

    const unauthenticated = await requireLegacyRestaurantApi(
      request("GET"),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(unauthenticated), true);
    if (isAuthErrorResponse(unauthenticated)) {
      assert.equal(unauthenticated.status, 401);
    }

    const denied = await requireLegacyRestaurantApi(
      request("GET", "waiter"),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(denied), true);
    if (isAuthErrorResponse(denied)) {
      assert.equal(denied.status, 403);
      assert.equal((await responseBody(denied)).error, "CAPABILITY_REQUIRED");
    }
    const staffDenied = await requireLegacyRestaurantApi(
      request("GET", "staff"),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(staffDenied), true);
    if (isAuthErrorResponse(staffDenied)) {
      assert.equal(staffDenied.status, 403);
      assert.equal(
        (await responseBody(staffDenied)).error,
        "CAPABILITY_REQUIRED",
      );
    }

    const contradictoryBody = await requireLegacyRestaurantApi(
      request("POST", "owner", { restauranteId: RESTAURANT_B }),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(contradictoryBody), true);
    if (isAuthErrorResponse(contradictoryBody)) {
      assert.equal(contradictoryBody.status, 403);
      assert.equal(
        (await responseBody(contradictoryBody)).error,
        "RESTAURANT_ID_MISMATCH",
      );
    }

    const contradictoryQuery = await requireLegacyRestaurantApi(
      new Request(
        `http://localhost/api/test?restaurantId=${RESTAURANT_B}`,
        { headers: { Authorization: "Bearer owner" } },
      ),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(contradictoryQuery), true);
    if (isAuthErrorResponse(contradictoryQuery)) {
      assert.equal(contradictoryQuery.status, 403);
    }

    const authorized = await requireLegacyRestaurantApi(
      request("POST", "owner", { restauranteId: RESTAURANT_A }),
      "settings.manage",
      deps,
    );
    assert.equal(isAuthErrorResponse(authorized), false);
    if (!isAuthErrorResponse(authorized)) {
      assert.equal(authorized.restaurantId, RESTAURANT_A);
      assert.equal(authorized.uid, OWNER_A);
    }
  });

  test("storagePath del import queda vinculado al tenant y borrador", () => {
    const valid =
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu.png`;
    assert.equal(
      assertMenuImportStoragePathForDraft(valid, {
        restaurantId: RESTAURANT_A,
        draftId: "draft-a",
      }),
      valid,
    );
    for (const invalid of [
      `restaurants/${RESTAURANT_B}/menu-imports/draft-a/menu.png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-b/menu.png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/nested/menu.png`,
      ` restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu.png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu.png `,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu%2Fother.png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/.`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/..`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu..png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/..menu.png`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu...pdf`,
      `restaurants/${RESTAURANT_A}/menu-imports/draft-a/menu.png?x=1`,
    ]) {
      assert.throws(() =>
        assertMenuImportStoragePathForDraft(invalid, {
          restaurantId: RESTAURANT_A,
          draftId: "draft-a",
        }),
      );
    }
  });

  test("revisión Admin conserva metadata y rechaza campos server-owned del cliente", async () => {
    const item = {
      id: "item-a",
      sourceType: "image",
      name: "Producto",
      price: 10,
      sectionName: "General",
      suggestedCategory: "Otros",
      suggestedStation: "kitchen",
      confidence: 25,
      rawText: "PRODUCTO 10",
      needsReview: true,
      selectedForPublish: true,
      duplicateOf: "item-original",
      aiConfidence: 30,
      aiEnriched: true,
    };
    const ref = adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("menuImportDrafts")
      .doc("review-admin");
    await ref.set({
      ...menuImportDraftCreatePayload(OWNER_A, "review-admin"),
      status: "ready",
      sections: [{ id: "section-a", name: "General", items: [item] }],
      items: [item],
      publishInProgress: false,
      serverSavedAt: Timestamp.now(),
    });

    await updateMenuImportReview({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      draftId: "review-admin",
      userId: OWNER_A,
      patches: [{
        id: "item-a",
        name: "Producto revisado",
        price: 12.5,
        selectedForPublish: false,
      }],
    });
    const saved = (await ref.get()).data()!;
    for (const savedItem of [
      saved.items[0],
      saved.sections[0].items[0],
    ] as Array<Record<string, unknown>>) {
      assert.equal(savedItem.name, "Producto revisado");
      assert.equal(savedItem.price, 12.5);
      assert.equal(savedItem.selectedForPublish, false);
      assert.equal(savedItem.confidence, 25);
      assert.equal(savedItem.aiConfidence, 30);
      assert.equal(savedItem.duplicateOf, "item-original");
      assert.equal(savedItem.rawText, "PRODUCTO 10");
    }

    let updateCalls = 0;
    const deps = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
      }),
      updateReview: async () => {
        updateCalls += 1;
      },
    };
    const malicious = await handleUpdateMenuImportReviewRequest(
      request("POST", "owner", {
        draftId: "review-admin",
        items: [{
          id: "item-a",
          name: "Manipulado",
          aiConfidence: 100,
          publishStatus: "published",
        }],
      }),
      deps,
    );
    assert.equal(malicious.status, 400);
    assert.equal((await responseBody(malicious)).error, "INVALID_REVIEW_PATCH");
    assert.equal(updateCalls, 0);
  });

  test("bootstrap rechaza Bearer ausente, inválido y revocado", async () => {
    const deps = dependencies({});
    for (const [token, expected] of [
      [undefined, "UNAUTHORIZED"],
      ["invalid", "UNAUTHORIZED"],
      ["revoked", "UNAUTHORIZED"],
    ] as const) {
      const response = await handleProfileBootstrapRequest(
        request("POST", token, {
          intent: "accept_invite_only",
          inviteToken: "token",
        }),
        deps,
      );
      assert.equal(response.status, 401);
      assert.equal((await responseBody(response)).error, expected);
    }
  });

  test("bootstrap endpoint exige email verificado y bloquea register_owner", async () => {
    const unverified = dependencies({
      unverified: {
        uid: "unverified-handler",
        email: "unverified-handler@example.test",
        email_verified: false,
      },
    });
    const emailResponse = await handleProfileBootstrapRequest(
      request("POST", "unverified", {
        intent: "accept_invite_only",
        inviteToken: "token",
      }),
      unverified,
    );
    assert.equal(emailResponse.status, 403);
    assert.equal((await responseBody(emailResponse)).error, "EMAIL_NOT_VERIFIED");

    const ownerResponse = await handleProfileBootstrapRequest(
      request("POST", "owner", { intent: "register_owner" }),
      dependencies({
        owner: {
          uid: "public-owner-handler",
          email: "public-owner-handler@example.test",
          email_verified: true,
        },
      }),
    );
    assert.equal(ownerResponse.status, 403);
    assert.equal(
      (await responseBody(ownerResponse)).error,
      "OWNER_SELF_SERVICE_DISABLED",
    );
  });

  test("bootstrap endpoint acepta una invitación verificada válida", async () => {
    await createInvite({
      id: "handler-valid",
      token: "handler-valid-token",
      email: "handler-valid@example.test",
      role: "staff",
    });
    const response = await handleProfileBootstrapRequest(
      request("POST", "valid-handler", {
        intent: "accept_invite_only",
        inviteToken: "handler-valid-token",
      }),
      dependencies({
        "valid-handler": {
          uid: "handler-valid-user",
          email: "handler-valid@example.test",
          email_verified: true,
        },
      }),
    );
    assert.equal(response.status, 200);
    const [canonical, mirror] = await adminDb.getAll(
      adminDb.collection("users").doc("handler-valid-user"),
      adminDb.collection("usuarios").doc("handler-valid-user"),
    );
    assert.equal(canonical.data()?.restaurantId, RESTAURANT_A);
    assert.equal(canonical.data()?.role, "waiter");
    assert.equal(mirror.data()?.role, "waiter");
  });

  test("import-menu rechaza auth y capability antes de leer multipart", async () => {
    await Promise.all([
      seedProfilePair(
        "waiter-a",
        profile({
          uid: "waiter-a",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
      ),
      seedProfilePair(
        "kitchen-a",
        profile({
          uid: "kitchen-a",
          restaurantId: RESTAURANT_A,
          role: "kitchen",
          status: "active",
        }),
      ),
    ]);
    const tokens = {
      disabled: {
        uid: DISABLED_A,
        email: IDENTITIES[DISABLED_A],
        email_verified: true,
      },
      viewer: {
        uid: VIEWER_A,
        email: IDENTITIES[VIEWER_A],
        email_verified: true,
      },
      staff: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
      waiter: {
        uid: "waiter-a",
        email: "waiter-a@example.test",
        email_verified: true,
      },
      kitchen: {
        uid: "kitchen-a",
        email: "kitchen-a@example.test",
        email_verified: true,
      },
      admin: {
        uid: ADMIN_A,
        email: IDENTITIES[ADMIN_A],
        email_verified: true,
      },
    };
    const deps: ImportMenuRouteDependencies = {
      ...dependencies(tokens),
      processFile: async () => {
        throw new Error("PROCESSOR_MUST_NOT_RUN");
      },
    };
    for (const [token, expectedStatus, expectedError] of [
      [undefined, 401, "UNAUTHORIZED"],
      ["invalid", 401, "UNAUTHORIZED"],
      ["revoked", 401, "UNAUTHORIZED"],
      ["disabled", 403, "PROFILE_DISABLED"],
      ["viewer", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["waiter", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["kitchen", 403, "SETTINGS_MANAGE_REQUIRED"],
    ] as const) {
      const spy = formReadSpyRequest(token);
      const response = await handleImportMenuRequest(spy.req, deps);
      assert.equal(response.status, expectedStatus);
      assert.equal((await responseBody(response)).error, expectedError);
      assert.equal(spy.reads(), 0);
    }

    await adminDb.collection("usuarios").doc(ADMIN_A).delete();
    const missingMirrorSpy = formReadSpyRequest("admin");
    const missingMirror = await handleImportMenuRequest(
      missingMirrorSpy.req,
      deps,
    );
    assert.equal(missingMirror.status, 403);
    assert.equal(
      (await responseBody(missingMirror)).error,
      "PROFILE_AUTHORIZATION_FAILED",
    );
    assert.equal(missingMirrorSpy.reads(), 0);

    const adminProfile = profile({
      uid: ADMIN_A,
      restaurantId: RESTAURANT_A,
      role: "admin",
      status: "active",
    });
    await seedProfilePair(ADMIN_A, adminProfile, {
      ...adminProfile,
      role: "owner",
    });
    const conflictSpy = formReadSpyRequest("admin");
    const conflict = await handleImportMenuRequest(conflictSpy.req, deps);
    assert.equal(conflict.status, 403);
    assert.equal(
      (await responseBody(conflict)).error,
      "PROFILE_AUTHORIZATION_FAILED",
    );
    assert.equal(conflictSpy.reads(), 0);
  });

  test("import-menu usa tenant server-side y procesador inyectado", async () => {
    let processed = false;
    let processedTenant = "";
    let processedUid = "";
    const response = await handleImportMenuRequest(
      multipartRequest(
        "owner",
        new File([PNG_BYTES], "menu.png", { type: "image/png" }),
        RESTAURANT_B,
      ),
      {
        ...dependencies({
          owner: {
            uid: OWNER_A,
            email: IDENTITIES[OWNER_A],
            email_verified: true,
          },
        }),
        processFile: async ({ trace }) => {
          processed = true;
          processedTenant = trace.restaurantId;
          processedUid = trace.uid;
          return { items: [], ocrTextLength: 120 };
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(processed, true);
    assert.equal(processedTenant, RESTAURANT_A);
    assert.equal(processedUid, OWNER_A);
  });

  test("import-menu valida firma antes de invocar OCR o OpenAI", async () => {
    let processed = false;
    const response = await handleImportMenuRequest(
      multipartRequest(
        "owner",
        new File(["not-a-real-png"], "menu.png", { type: "image/png" }),
      ),
      {
        ...dependencies({
          owner: {
            uid: OWNER_A,
            email: IDENTITIES[OWNER_A],
            email_verified: true,
          },
        }),
        processFile: async () => {
          processed = true;
          return { items: [], ocrTextLength: 0 };
        },
      },
    );
    assert.equal(response.status, 415);
    assert.equal(
      (await responseBody(response)).error,
      "FILE_SIGNATURE_MISMATCH",
    );
    assert.equal(processed, false);
  });

  test("import-menu rechaza vacío, MIME inválido y tamaño excedido", async () => {
    let processed = 0;
    const deps: ImportMenuRouteDependencies = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
      }),
      processFile: async () => {
        processed += 1;
        return { items: [], ocrTextLength: 0 };
      },
    };
    for (const [file, expectedStatus, expectedError] of [
      [
        new File([], "empty.png", { type: "image/png" }),
        400,
        "EMPTY_FILE",
      ],
      [
        new File(["plain"], "menu.txt", { type: "text/plain" }),
        415,
        "UNSUPPORTED_TYPE",
      ],
      [
        new File(
          [PNG_BYTES, new Uint8Array(12 * 1024 * 1024)],
          "large.png",
          { type: "image/png" },
        ),
        413,
        "FILE_TOO_LARGE",
      ],
    ] as const) {
      const response = await handleImportMenuRequest(
        multipartRequest("owner", file),
        deps,
      );
      assert.equal(response.status, expectedStatus);
      assert.equal((await responseBody(response)).error, expectedError);
    }
    assert.equal(processed, 0);
  });

  test("import-menu sanitiza errores y logs del procesador", async () => {
    const logs: unknown[][] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const response = await handleImportMenuRequest(
        multipartRequest(
          "super-secret-bearer",
          new File([PNG_BYTES], "menu.png", { type: "image/png" }),
        ),
        {
          ...dependencies({
            "super-secret-bearer": {
              uid: OWNER_A,
              email: IDENTITIES[OWNER_A],
              email_verified: true,
            },
          }),
          processFile: async () => {
            throw new Error(
              "OPENAI_500 token=super-secret-bearer OCR=CARTA_COMPLETA",
            );
          },
        },
      );
      assert.equal(response.status, 500);
      const body = await responseBody(response);
      assert.equal(body.error, "AI_IMPORT_FAILED");
      assert.equal(body.details, null);
      const serializedLogs = JSON.stringify(logs);
      assert.equal(serializedLogs.includes("super-secret-bearer"), false);
      assert.equal(serializedLogs.includes("CARTA_COMPLETA"), false);
      assert.equal(serializedLogs.includes("OPENAI_500 token="), false);
    } finally {
      console.info = originalInfo;
    }
  });

  test("manager-summary exige analytics.view gerencial y tenant server-side", async () => {
    await Promise.all([
      seedProfilePair(
        "waiter-summary",
        profile({
          uid: "waiter-summary",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
      ),
      seedProfilePair(
        "kitchen-summary",
        profile({
          uid: "kitchen-summary",
          restaurantId: RESTAURANT_A,
          role: "kitchen",
          status: "active",
        }),
      ),
    ]);
    let summaryCalls = 0;
    let summaryTenant = "";
    const deps: ManagerSummaryRouteDependencies = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
        viewer: {
          uid: VIEWER_A,
          email: IDENTITIES[VIEWER_A],
          email_verified: true,
        },
        staff: {
          uid: LEGACY_A,
          email: IDENTITIES[LEGACY_A],
          email_verified: true,
        },
        disabled: {
          uid: DISABLED_A,
          email: IDENTITIES[DISABLED_A],
          email_verified: true,
        },
        waiter: {
          uid: "waiter-summary",
          email: "waiter-summary@example.test",
          email_verified: true,
        },
        kitchen: {
          uid: "kitchen-summary",
          email: "kitchen-summary@example.test",
          email_verified: true,
        },
      }),
      getSummary: async ({ restaurantId }) => {
        summaryCalls += 1;
        summaryTenant = restaurantId;
        return {
          date: "2026-07-13",
          restaurantId,
          reservations: {
            total: 0,
            booked: 0,
            seated: 0,
            completed: 0,
            noShow: 0,
          },
          orders: {
            active: 0,
            pendingItems: 0,
            preparingItems: 0,
            readyItems: 0,
          },
          sales: { total: 0, payments: 0 },
          alerts: [],
          insights: [],
        };
      },
    };

    const noToken = await handleManagerSummaryRequest(
      request("POST"),
      deps,
    );
    assert.equal(noToken.status, 401);
    for (const token of ["viewer", "staff", "waiter", "kitchen"] as const) {
      const response = await handleManagerSummaryRequest(
        request("POST", token),
        deps,
      );
      assert.equal(response.status, 403);
      assert.equal(
        (await responseBody(response)).error,
        "ANALYTICS_VIEW_REQUIRED",
      );
    }
    const disabled = await handleManagerSummaryRequest(
      request("POST", "disabled"),
      deps,
    );
    assert.equal(disabled.status, 403);
    assert.equal((await responseBody(disabled)).error, "PROFILE_DISABLED");
    assert.equal(summaryCalls, 0);

    const owner = await handleManagerSummaryRequest(
      request("POST", "owner", { restaurantId: RESTAURANT_B }),
      deps,
    );
    assert.equal(owner.status, 200);
    assert.equal(summaryCalls, 1);
    assert.equal(summaryTenant, RESTAURANT_A);
  });

  test("manager-summary sanitiza errores internos", async () => {
    const logs: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const response = await handleManagerSummaryRequest(
        request("POST", "owner"),
        {
          ...dependencies({
            owner: {
              uid: OWNER_A,
              email: IDENTITIES[OWNER_A],
              email_verified: true,
            },
          }),
          getSummary: async () => {
            throw new Error("DATABASE_SECRET_INTERNAL_DETAIL");
          },
        },
      );
      assert.equal(response.status, 500);
      assert.equal(
        (await responseBody(response)).error,
        "MANAGER_SUMMARY_FAILED",
      );
      const serializedLogs = JSON.stringify(logs);
      assert.equal(
        serializedLogs.includes("DATABASE_SECRET_INTERNAL_DETAIL"),
        false,
      );
      assert.equal(serializedLogs.includes(OWNER_A), true);
      assert.equal(serializedLogs.includes(RESTAURANT_A), true);
    } finally {
      console.error = originalError;
    }
  });

  test("endpoint de invitaciones permite owner/admin, deniega viewer y no persiste token claro", async () => {
    const tokens = {
      owner: {
        uid: OWNER_A,
        email: IDENTITIES[OWNER_A],
        email_verified: true,
      },
      admin: {
        uid: ADMIN_A,
        email: IDENTITIES[ADMIN_A],
        email_verified: true,
      },
      viewer: {
        uid: VIEWER_A,
        email: IDENTITIES[VIEWER_A],
        email_verified: true,
      },
    };
    for (const token of ["owner", "admin"] as const) {
      const response = await handleCreateStaffInviteRequest(
        request("POST", token, {
          email: `${token}-invite@example.test`,
          role: token === "owner" ? "admin" : "staff",
        }),
        { ...dependencies(tokens), sendEmail: false },
      );
      assert.equal(response.status, 200);
      const body = await responseBody(response);
      const invite = body.invite as Record<string, unknown>;
      assert.equal(typeof invite.inviteUrl, "string");
      const stored = await adminDb
        .collection("restaurant_invites")
        .doc(String(invite.inviteId))
        .get();
      assert.equal(typeof stored.data()?.tokenHash, "string");
      assert.equal(stored.data()?.inviteUrl, undefined);
      assert.equal(
        stored.data()?.role,
        token === "owner" ? "admin" : "waiter",
      );
    }
    const denied = await handleCreateStaffInviteRequest(
      request("POST", "viewer", {
        email: "viewer-created@example.test",
        role: "staff",
      }),
      { ...dependencies(tokens), sendEmail: false },
    );
    assert.equal(denied.status, 403);

    const adminEscalation = await handleCreateStaffInviteRequest(
      request("POST", "admin", {
        email: "admin-created-admin@example.test",
        role: "admin",
      }),
      { ...dependencies(tokens), sendEmail: false },
    );
    assert.equal(adminEscalation.status, 403);

    const ownerInvite = await handleCreateStaffInviteRequest(
      request("POST", "owner", {
        email: "owner-role@example.test",
        role: "owner",
      }),
      { ...dependencies(tokens), sendEmail: false },
    );
    assert.equal(ownerInvite.status, 403);

    const unknownRole = await handleCreateStaffInviteRequest(
      request("POST", "owner", {
        email: "unknown-role@example.test",
        role: "supervisor",
      }),
      { ...dependencies(tokens), sendEmail: false },
    );
    assert.equal(unknownRole.status, 400);
    assert.equal((await responseBody(unknownRole)).error, "INVITE_ROLE_INVALID");

    const staffEscalation = await handleCreateStaffInviteRequest(
      request("POST", "staff", {
        email: "staff-manager@example.test",
        role: "manager",
      }),
      {
        ...dependencies({
          staff: {
            uid: LEGACY_A,
            email: IDENTITIES[LEGACY_A],
            email_verified: true,
          },
        }),
        sendEmail: false,
      },
    );
    assert.equal(staffEscalation.status, 403);
  });

  test("creación concurrente conserva una sola invitación pendiente", async () => {
    const deps = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
      }),
      sendEmail: false,
    };
    const responses = await Promise.all([
      handleCreateStaffInviteRequest(
        request("POST", "owner", {
          email: "concurrent-invite@example.test",
          role: "staff",
        }),
        deps,
      ),
      handleCreateStaffInviteRequest(
        request("POST", "owner", {
          email: "concurrent-invite@example.test",
          role: "staff",
        }),
        deps,
      ),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409],
    );
    const pending = await adminDb
      .collection("restaurant_invites")
      .where("restaurantId", "==", RESTAURANT_A)
      .where("email", "==", "concurrent-invite@example.test")
      .where("status", "==", "pending")
      .get();
    assert.equal(pending.size, 1);
    const successfulResponse = responses.find(
      (response) => response.status === 200,
    );
    assert.ok(successfulResponse);
    const successfulBody = await responseBody(successfulResponse);
    const invite = successfulBody.invite as Record<string, unknown>;
    const inviteUrl = new URL(String(invite.inviteUrl));
    const clearToken = decodeURIComponent(
      inviteUrl.pathname.split("/").filter(Boolean).at(-1) ?? "",
    );
    assert.equal(
      pending.docs[0]?.data().tokenHash,
      hashInviteToken(clearToken),
    );
  });

  test("listado y revocación son tenant-scoped y sanitizados", async () => {
    await adminDb.collection("restaurant_invites").doc("legacy-secret").set({
      email: "legacy@example.test",
      restaurantId: RESTAURANT_A,
      role: "staff",
      status: "pending",
      tokenHash: "hash",
      inviteUrl: "https://example.test/invite/plain-secret",
      createdByUid: OWNER_A,
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    });
    const deps = dependencies({
      owner: {
        uid: OWNER_A,
        email: IDENTITIES[OWNER_A],
        email_verified: true,
      },
    });
    const listResponse = await handleListStaffInvitesRequest(
      request("GET", "owner"),
      deps,
    );
    const listBody = await responseBody(listResponse);
    const listed = (listBody.invites as Record<string, unknown>[])[0];
    assert.equal(listed.tokenHash, undefined);
    assert.equal(listed.inviteUrl, undefined);

    const revokeResponse = await handleRevokeStaffInviteRequest(
      request("DELETE", "owner", { inviteId: "legacy-secret" }),
      deps,
    );
    assert.equal(revokeResponse.status, 200);
    assert.equal(
      (await adminDb.collection("restaurant_invites").doc("legacy-secret").get())
        .data()?.status,
      "cancelled",
    );

    await createInvite({
      id: "foreign-invite",
      token: "foreign",
      email: "foreign@example.test",
      restaurantId: RESTAURANT_B,
      creatorUid: OWNER_B,
    });
    await assert.rejects(
      handleRevokeStaffInviteRequest(
        request("DELETE", "owner", { inviteId: "foreign-invite" }),
        deps,
      ),
      /INVITE_TENANT_MISMATCH/,
    );
  });

  test("disabled y viewer quedan bloqueados en APIs autenticadas", async () => {
    const deps = dependencies({
      disabled: {
        uid: DISABLED_A,
        email: IDENTITIES[DISABLED_A],
        email_verified: true,
      },
      viewer: {
        uid: VIEWER_A,
        email: IDENTITIES[VIEWER_A],
        email_verified: true,
      },
      staff: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
    });
    const disabled = await handleListManagedUsersRequest(
      request("GET", "disabled"),
      deps,
    );
    assert.equal(disabled.status, 403);
    assert.equal((await responseBody(disabled)).error, "PROFILE_DISABLED");

    const viewer = await handleListManagedUsersRequest(
      request("GET", "viewer"),
      deps,
    );
    assert.equal(viewer.status, 403);
    assert.equal((await responseBody(viewer)).error, "USERS_MANAGE_REQUIRED");

    const staff = await handleListManagedUsersRequest(
      request("GET", "staff"),
      deps,
    );
    assert.equal(staff.status, 403);
    assert.equal((await responseBody(staff)).error, "USERS_MANAGE_REQUIRED");
  });

  test("resolver IA reutiliza status y autoridad canónica", async () => {
    const deps = dependencies({
      disabled: {
        uid: DISABLED_A,
        email: IDENTITIES[DISABLED_A],
        email_verified: true,
      },
      legacyOnly: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
    });
    const disabled = await resolveHostlyAiTenant(
      request("POST", "disabled"),
      deps,
    );
    assert.equal(disabled.ok, false);
    if (!disabled.ok) assert.equal(disabled.error, "PROFILE_DISABLED");

    await adminDb.collection("users").doc(LEGACY_A).delete();
    const legacyOnly = await resolveHostlyAiTenant(
      request("POST", "legacyOnly"),
      deps,
    );
    assert.equal(legacyOnly.ok, false);
    if (!legacyOnly.ok) {
      assert.equal(legacyOnly.error, "PROFILE_CANONICAL_MISSING");
    }
  });

  test("mutación administrativa actualiza mirrors y aplica jerarquía", async () => {
    const deps = dependencies({
      owner: {
        uid: OWNER_A,
        email: IDENTITIES[OWNER_A],
        email_verified: true,
      },
      admin: {
        uid: ADMIN_A,
        email: IDENTITIES[ADMIN_A],
        email_verified: true,
      },
    });
    const ownerUpdate = await handleUpdateManagedUserRequest(
      request("PATCH", "owner", {
        userId: VIEWER_A,
        role: "admin",
        status: "disabled",
      }),
      deps,
    );
    assert.equal(ownerUpdate.status, 200);
    const [canonical, mirror] = await adminDb.getAll(
      adminDb.collection("users").doc(VIEWER_A),
      adminDb.collection("usuarios").doc(VIEWER_A),
    );
    assert.equal(canonical.data()?.role, "admin");
    assert.equal(mirror.data()?.role, "admin");
    assert.equal(canonical.data()?.status, "disabled");
    assert.equal(mirror.data()?.status, "disabled");

    const operationalUpdate = await handleUpdateManagedUserRequest(
      request("PATCH", "owner", {
        userId: LEGACY_A,
        role: "staff",
      }),
      deps,
    );
    assert.equal(operationalUpdate.status, 200);
    const [operationalCanonical, operationalMirror] = await adminDb.getAll(
      adminDb.collection("users").doc(LEGACY_A),
      adminDb.collection("usuarios").doc(LEGACY_A),
    );
    assert.equal(operationalCanonical.data()?.role, "waiter");
    assert.equal(operationalMirror.data()?.role, "waiter");

    const selfElevation = await handleUpdateManagedUserRequest(
      request("PATCH", "admin", {
        userId: ADMIN_A,
        role: "admin",
      }),
      deps,
    );
    assert.equal(selfElevation.status, 403);

    const peerAdminMutation = await handleUpdateManagedUserRequest(
      request("PATCH", "admin", {
        userId: VIEWER_A,
        status: "active",
      }),
      deps,
    );
    assert.equal(peerAdminMutation.status, 403);

    const superiorRole = await handleUpdateManagedUserRequest(
      request("PATCH", "admin", {
        userId: LEGACY_A,
        role: "admin",
      }),
      deps,
    );
    assert.equal(superiorRole.status, 403);

    const crossTenant = await handleUpdateManagedUserRequest(
      request("PATCH", "owner", {
        userId: OWNER_B,
        status: "disabled",
      }),
      deps,
    );
    assert.equal(crossTenant.status, 403);
  });

  test("inviteUrl solo existe en create, se copia exacto y la UI no simula email", async () => {
    const deps = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
      }),
      sendEmail: false,
    };
    const created = await handleCreateStaffInviteRequest(
      request("POST", "owner", {
        email: "copy-link@example.test",
        role: "staff",
      }),
      deps,
    );
    assert.equal(created.status, 200);
    const invite = (await responseBody(created)).invite as Record<string, unknown>;
    const inviteUrl = String(invite.inviteUrl);
    let copied = "";
    await copyInviteLink(inviteUrl, async (text) => {
      copied = text;
    });
    assert.equal(copied, inviteUrl);

    const stored = await adminDb
      .collection("restaurant_invites")
      .doc(String(invite.inviteId))
      .get();
    assert.equal(stored.data()?.inviteUrl, undefined);
    assert.equal(typeof stored.data()?.tokenHash, "string");

    const listed = await handleListStaffInvitesRequest(
      request("GET", "owner"),
      deps,
    );
    const rows = (await responseBody(listed)).invites as Record<string, unknown>[];
    assert.equal(rows[0]?.inviteUrl, undefined);
    assert.equal(rows[0]?.tokenHash, undefined);

    const source = readFileSync(
      "app/dashboard/invitaciones/page.tsx",
      "utf8",
    );
    assert.equal(source.includes("Invitación creada. Copia y comparte el enlace."), true);
    assert.equal(source.includes('t("invites.invitationSent")'), false);
  });

  test("usuarios-local elimina secretos de invitación al persistir y leer legacy", () => {
    const user: UsuarioLocal = {
      id: "local-user",
      nombre: "Camarera",
      email: "camarera@example.test",
      rol: "operativo",
      activo: true,
      modulos: {
        stock: true,
        compras: false,
        mermas: true,
        escandallos: false,
      },
      inviteStatus: "pending",
      inviteId: "invite-id",
      inviteUrl: "https://example.test/invite/plain-secret",
      inviteError: "INTERNAL_ERROR",
    };
    const sanitized = sanitizeUsuarioForPersistence(user);
    assert.equal(sanitized.inviteUrl, undefined);
    assert.equal(sanitized.inviteError, undefined);
    assert.equal(sanitized.inviteId, "invite-id");

    const parsed = parseUsuariosStoragePayload([
      {
        ...user,
        inviteToken: "legacy-token",
        token: "legacy-token",
        secret: "legacy-secret",
      },
    ]);
    const serialized = JSON.stringify(parsed);
    assert.equal(serialized.includes("plain-secret"), false);
    assert.equal(serialized.includes("legacy-token"), false);
    assert.equal(serialized.includes("legacy-secret"), false);
    assert.equal(parsed[0]?.inviteId, "invite-id");
  });

  test("contrato cliente de imagen coincide con MIME y límite de Storage", () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]) {
      assert.doesNotThrow(() =>
        validateProductImageCandidate({
          name: `image.${type.split("/")[1]}`,
          type,
          size: MAX_PRODUCT_IMAGE_BYTES,
        }),
      );
    }
    for (const type of [
      "",
      "image/bmp",
      "image/heic",
      "image/heif",
      "image/avif",
      "image/svg+xml",
      "image/tiff",
    ]) {
      assert.throws(() =>
        validateProductImageCandidate({
          name: "image.invalid",
          type,
          size: 100,
        }),
      );
    }
    assert.throws(() =>
      validateProductImageCandidate({
        name: "empty.png",
        type: "image/png",
        size: 0,
      }),
    );
    assert.throws(() =>
      validateProductImageCandidate({
        name: "large.png",
        type: "image/png",
        size: MAX_PRODUCT_IMAGE_BYTES + 1,
      }),
    );
  });

  test("revocar una invitación permite crear otra con un enlace nuevo", async () => {
    const deps = {
      ...dependencies({
        owner: {
          uid: OWNER_A,
          email: IDENTITIES[OWNER_A],
          email_verified: true,
        },
      }),
      sendEmail: false,
    };
    const first = await handleCreateStaffInviteRequest(
      request("POST", "owner", {
        email: "recreate@example.test",
        role: "staff",
      }),
      deps,
    );
    const firstInvite = (await responseBody(first)).invite as Record<string, unknown>;
    await handleRevokeStaffInviteRequest(
      request("DELETE", "owner", { inviteId: firstInvite.inviteId }),
      deps,
    );
    const second = await handleCreateStaffInviteRequest(
      request("POST", "owner", {
        email: "recreate@example.test",
        role: "staff",
      }),
      deps,
    );
    assert.equal(second.status, 200);
    const secondInvite = (await responseBody(second)).invite as Record<string, unknown>;
    assert.notEqual(secondInvite.inviteUrl, firstInvite.inviteUrl);
  });

  test("roster operativo es completo, tenant-scoped y sanitizado", async () => {
    await Promise.all([
      seedProfilePair(
        "waiter-roster",
        profile({
          uid: "waiter-roster",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
          extra: { displayName: "Camarera Uno" },
        }),
      ),
      seedProfilePair(
        "kitchen-roster",
        profile({
          uid: "kitchen-roster",
          restaurantId: RESTAURANT_A,
          role: "kitchen",
          status: "active",
          extra: { displayName: "Cocina Uno" },
        }),
      ),
      adminDb.collection("users").doc("missing-mirror-roster").set(
        profile({
          uid: "missing-mirror-roster",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
      ),
      seedProfilePair(
        "conflict-roster",
        profile({
          uid: "conflict-roster",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
        profile({
          uid: "conflict-roster",
          restaurantId: RESTAURANT_B,
          role: "waiter",
          status: "active",
        }),
      ),
    ]);
    const tokenMap = {
      owner: {
        uid: OWNER_A,
        email: IDENTITIES[OWNER_A],
        email_verified: true,
      },
      admin: {
        uid: ADMIN_A,
        email: IDENTITIES[ADMIN_A],
        email_verified: true,
      },
      waiter: {
        uid: "waiter-roster",
        email: "waiter-roster@example.test",
        email_verified: true,
      },
      kitchen: {
        uid: "kitchen-roster",
        email: "kitchen-roster@example.test",
        email_verified: true,
      },
      viewer: {
        uid: VIEWER_A,
        email: IDENTITIES[VIEWER_A],
        email_verified: true,
      },
    };
    const deps: RosterRouteDependencies = dependencies(tokenMap);
    for (const token of ["owner", "admin", "waiter", "kitchen"] as const) {
      const response = await handleListRestaurantUserRosterRequest(
        new Request(
          `http://localhost/api/users/roster?restaurantId=${RESTAURANT_B}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        deps,
      );
      assert.equal(response.status, 200);
      const rows = (await responseBody(response)).users as Record<string, unknown>[];
      const ids = rows.map((row) => row.id);
      assert.equal(ids.includes("waiter-roster"), true);
      assert.equal(ids.includes(OWNER_A), true);
      assert.equal(ids.includes(OWNER_B), false);
      assert.equal(ids.includes(DISABLED_A), false);
      assert.equal(ids.includes(VIEWER_A), false);
      assert.equal(ids.includes("kitchen-roster"), false);
      assert.equal(ids.includes("missing-mirror-roster"), false);
      assert.equal(ids.includes("conflict-roster"), false);
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), ["displayName", "id"]);
      }
    }
    const denied = await handleListRestaurantUserRosterRequest(
      request("GET", "viewer"),
      deps,
    );
    assert.equal(denied.status, 403);
    assert.equal((await responseBody(denied)).error, "ROSTER_READ_REQUIRED");
  });

  test("todas las APIs hermanas exigen settings.manage antes del body", async () => {
    await Promise.all([
      seedProfilePair(
        "waiter-menu",
        profile({
          uid: "waiter-menu",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
      ),
      seedProfilePair(
        "kitchen-menu",
        profile({
          uid: "kitchen-menu",
          restaurantId: RESTAURANT_A,
          role: "kitchen",
          status: "active",
        }),
      ),
      adminDb.collection("users").doc("missing-menu").set(
        profile({
          uid: "missing-menu",
          restaurantId: RESTAURANT_A,
          role: "admin",
          status: "active",
        }),
      ),
      seedProfilePair(
        "conflict-menu",
        profile({
          uid: "conflict-menu",
          restaurantId: RESTAURANT_A,
          role: "admin",
          status: "active",
        }),
        profile({
          uid: "conflict-menu",
          restaurantId: RESTAURANT_B,
          role: "admin",
          status: "active",
        }),
      ),
    ]);
    const tokens = {
      owner: { uid: OWNER_A, email: IDENTITIES[OWNER_A], email_verified: true },
      admin: { uid: ADMIN_A, email: IDENTITIES[ADMIN_A], email_verified: true },
      viewer: { uid: VIEWER_A, email: IDENTITIES[VIEWER_A], email_verified: true },
      manager: {
        uid: MANAGER_A,
        email: IDENTITIES[MANAGER_A],
        email_verified: true,
      },
      staff: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
      waiter: {
        uid: "waiter-menu",
        email: "waiter-menu@example.test",
        email_verified: true,
      },
      kitchen: {
        uid: "kitchen-menu",
        email: "kitchen-menu@example.test",
        email_verified: true,
      },
      disabled: {
        uid: DISABLED_A,
        email: IDENTITIES[DISABLED_A],
        email_verified: true,
      },
      missing: {
        uid: "missing-menu",
        email: "missing-menu@example.test",
        email_verified: true,
      },
      conflict: {
        uid: "conflict-menu",
        email: "conflict-menu@example.test",
        email_verified: true,
      },
    };
    const base = dependencies(tokens);
    let serviceCalls = 0;
    const processDeps: ProcessRouteDependencies = {
      ...base,
      processDraft: async ({ restaurantId }) => {
        serviceCalls += 1;
        assert.equal(restaurantId, RESTAURANT_A);
        return {
          draftId: "draft-a",
          status: "ready",
          alreadyProcessed: false,
          itemCount: 0,
        };
      },
    };
    const publishDeps: PublishRouteDependencies = {
      ...base,
      publishDraft: async ({ restaurantId }) => {
        serviceCalls += 1;
        assert.equal(restaurantId, RESTAURANT_A);
        return {} as never;
      },
    };
    const previewDeps: PreviewRouteDependencies = {
      ...base,
      buildPreview: async ({ restaurantId }) => {
        serviceCalls += 1;
        assert.equal(restaurantId, RESTAURANT_A);
        return {} as never;
      },
      updateDraft: async () => undefined,
    };
    const categoriesDeps: CreateCategoriesRouteDependencies = {
      ...base,
      createCategories: async ({ restaurantId }) => {
        serviceCalls += 1;
        assert.equal(restaurantId, RESTAURANT_A);
        return {} as never;
      },
    };
    const deniedHandlers = [
      (req: Request) => handleProcessMenuImportRequest(req, processDeps),
      (req: Request) => handlePublishMenuImportRequest(req, publishDeps),
      (req: Request) => handlePublishMenuImportPreviewRequest(req, previewDeps),
      (req: Request) =>
        handleCreateMenuImportCategoriesRequest(req, categoriesDeps),
    ];
    for (const handler of deniedHandlers) {
      for (const [token, expectedStatus] of [
        [undefined, 401],
        ["invalid", 401],
        ["revoked", 401],
        ["disabled", 403],
        ["viewer", 403],
        ["manager", 403],
        ["staff", 403],
        ["waiter", 403],
        ["kitchen", 403],
        ["missing", 409],
        ["conflict", 409],
      ] as const) {
        const spy = jsonReadSpyRequest(token);
        const response = await handler(spy.req);
        assert.equal(response.status, expectedStatus);
        assert.equal(spy.reads(), 0);
      }
    }
    assert.equal(serviceCalls, 0);

    for (const token of ["owner", "admin"] as const) {
      assert.equal(
        (
          await handleProcessMenuImportRequest(
            request("POST", token, {
              draftId: "draft-a",
              restaurantId: RESTAURANT_B,
            }),
            processDeps,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await handlePublishMenuImportRequest(
            request("POST", token, {
              draftId: "draft-a",
              restaurantId: RESTAURANT_B,
            }),
            publishDeps,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await handlePublishMenuImportPreviewRequest(
            request("POST", token, {
              draftId: "draft-a",
              restaurantId: RESTAURANT_B,
            }),
            previewDeps,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await handleCreateMenuImportCategoriesRequest(
            request("POST", token, {
              draftId: "draft-a",
              restaurantId: RESTAURANT_B,
              categories: [{ name: "Entrantes" }],
            }),
            categoriesDeps,
          )
        ).status,
        200,
      );
    }
    assert.equal(serviceCalls, 8);
  });

  test("facturas exige capability antes de multipart, upload y Vision", async () => {
    await Promise.all([
      seedProfilePair(
        "waiter-invoice",
        profile({
          uid: "waiter-invoice",
          restaurantId: RESTAURANT_A,
          role: "waiter",
          status: "active",
        }),
      ),
      adminDb.collection("users").doc("missing-invoice").set(
        profile({
          uid: "missing-invoice",
          restaurantId: RESTAURANT_A,
          role: "manager",
          status: "active",
        }),
      ),
      seedProfilePair(
        "conflict-invoice",
        profile({
          uid: "conflict-invoice",
          restaurantId: RESTAURANT_A,
          role: "manager",
          status: "active",
        }),
        profile({
          uid: "conflict-invoice",
          restaurantId: RESTAURANT_B,
          role: "manager",
          status: "active",
        }),
      ),
    ]);
    let uploadCalls = 0;
    let visionCalls = 0;
    let uploadTenant = "";
    const deps: SupplierInvoiceExtractDependencies = {
      ...dependencies({
        owner: { uid: OWNER_A, email: IDENTITIES[OWNER_A], email_verified: true },
        manager: {
          uid: MANAGER_A,
          email: IDENTITIES[MANAGER_A],
          email_verified: true,
        },
        staff: {
          uid: LEGACY_A,
          email: IDENTITIES[LEGACY_A],
          email_verified: true,
        },
        viewer: { uid: VIEWER_A, email: IDENTITIES[VIEWER_A], email_verified: true },
        waiter: {
          uid: "waiter-invoice",
          email: "waiter-invoice@example.test",
          email_verified: true,
        },
        disabled: {
          uid: DISABLED_A,
          email: IDENTITIES[DISABLED_A],
          email_verified: true,
        },
        missing: {
          uid: "missing-invoice",
          email: "missing-invoice@example.test",
          email_verified: true,
        },
        conflict: {
          uid: "conflict-invoice",
          email: "conflict-invoice@example.test",
          email_verified: true,
        },
      }),
      uploadFile: async ({ restaurantId, userId, mimeType }) => {
        uploadCalls += 1;
        uploadTenant = restaurantId;
        return {
          storagePath: `restaurants/${restaurantId}/supplier-invoice-uploads/file.png`,
          filename: "file.png",
          mimeType,
          uploadedAt: "2026-07-13T00:00:00.000Z",
          uploadedBy: userId,
        };
      },
      extractInvoice: async () => {
        visionCalls += 1;
        return {
          draft: {} as never,
          warnings: [],
          source: "mock_fallback",
        };
      },
    };
    for (const [token, expectedStatus] of [
      [undefined, 401],
      ["invalid", 401],
      ["revoked", 401],
      ["disabled", 403],
      ["viewer", 403],
      ["staff", 403],
      ["waiter", 403],
      ["missing", 409],
      ["conflict", 409],
    ] as const) {
      const spy = formReadSpyRequest(token);
      const response = await handleExtractSupplierInvoiceRequest(spy.req, deps);
      assert.equal(response.status, expectedStatus);
      assert.equal(spy.reads(), 0);
    }
    assert.equal(uploadCalls, 0);
    assert.equal(visionCalls, 0);

    for (const token of ["owner", "manager"] as const) {
      const response = await handleExtractSupplierInvoiceRequest(
        multipartRequest(
          token,
          new File([PNG_BYTES], "invoice.png", { type: "image/png" }),
          RESTAURANT_B,
        ),
        deps,
      );
      assert.equal(response.status, 200);
    }
    assert.equal(uploadCalls, 2);
    assert.equal(visionCalls, 2);
    assert.equal(uploadTenant, RESTAURANT_A);

    const invalid = await handleExtractSupplierInvoiceRequest(
      multipartRequest(
        "owner",
        new File([new TextEncoder().encode("not-a-png")], "invoice.png", {
          type: "image/png",
        }),
      ),
      deps,
    );
    assert.equal(invalid.status, 415);
    assert.equal((await responseBody(invalid)).error, "FILE_SIGNATURE_MISMATCH");
    assert.equal(uploadCalls, 2);
    assert.equal(visionCalls, 2);

    const logs: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const failed = await handleExtractSupplierInvoiceRequest(
        multipartRequest(
          "owner",
          new File([PNG_BYTES], "invoice.png", { type: "image/png" }),
        ),
        {
          ...deps,
          extractInvoice: async () => {
            throw new Error("VISION_SECRET_INVOICE_CONTENT");
          },
        },
      );
      assert.equal(failed.status, 500);
      const body = await responseBody(failed);
      assert.equal(body.error, "EXTRACT_FAILED");
      assert.equal(JSON.stringify(body).includes("VISION_SECRET"), false);
      assert.equal(JSON.stringify(logs).includes("VISION_SECRET"), false);
    } finally {
      console.error = originalError;
    }
  });

  test("validación de factura exige MIME, tamaño y firma coherentes", () => {
    assert.equal(
      supplierInvoiceFileSignatureMatches(PNG_BYTES, "image/png"),
      true,
    );
    assert.throws(
      () =>
        validateSupplierInvoiceUploadFile({
          fileName: "invoice.txt",
          mimeType: "text/plain",
          size: 5,
          bytes: new TextEncoder().encode("plain"),
        }),
      /UNSUPPORTED_FILE_TYPE/,
    );
    assert.throws(
      () =>
        validateSupplierInvoiceUploadFile({
          fileName: "invoice.png",
          mimeType: "image/png",
          size: 0,
          bytes: new Uint8Array(),
        }),
      /FILE_EMPTY/,
    );
    assert.throws(
      () =>
        validateSupplierInvoiceUploadFile({
          fileName: "invoice.png",
          mimeType: "image/png",
          size: 9,
          bytes: new TextEncoder().encode("not-a-png"),
        }),
      /FILE_SIGNATURE_MISMATCH/,
    );
  });

  test("sync-order-items API exige TPV y valida líneas embebidas server-side", async () => {
    const deps = dependencies({
      waiter: { uid: WAITER_A, email: IDENTITIES[WAITER_A], email_verified: true },
      viewer: { uid: VIEWER_A, email: IDENTITIES[VIEWER_A], email_verified: true },
    });

    const unauthorized = await handleSyncOrderItemsRequest(
      request("POST", undefined, {
        operation: "create_open",
        tableId: "mesa-api",
        items: [],
      }),
      deps,
    );
    assert.equal(unauthorized.status, 401);

    const privileged = await handleSyncOrderItemsRequest(
      request("POST", "waiter", {
        operation: "create_open",
        tableId: "mesa-api",
        tableLabel: "Mesa API",
        items: [
          {
            id: "line-kds",
            productId: "prod-1",
            name: "Plato",
            qty: 1,
            status: "prepared",
            price: 10,
            total: 10,
          },
        ],
      }),
      deps,
    );
    assert.equal(privileged.status, 400);
    assert.equal((await responseBody(privileged)).error, "INVALID_ITEMS");

    const created = await handleSyncOrderItemsRequest(
      request("POST", "waiter", {
        operation: "create_open",
        tableId: "mesa-api",
        tableLabel: "Mesa API",
        items: [
          {
            id: "line-1",
            productId: "prod-1",
            name: "Cafe",
            qty: 1,
            status: "pending",
            price: 2,
            total: 2,
          },
        ],
      }),
      deps,
    );
    assert.equal(created.status, 200);
    const createdBody = await responseBody(created);
    assert.equal(createdBody.ok, true);
    assert.equal(typeof createdBody.orderId, "string");

    const viewerDenied = await handleSyncOrderItemsRequest(
      request("POST", "viewer", {
        operation: "persist_items",
        orderId: String(createdBody.orderId),
        items: [
          {
            id: "line-1",
            productId: "prod-1",
            name: "Cafe",
            qty: 2,
            status: "pending",
            price: 2,
            total: 4,
          },
        ],
      }),
      deps,
    );
    assert.equal(viewerDenied.status, 403);
  });
});

describe("Rules: lecturas administrativas y mutaciones TPV", () => {
  test("manager lee inventario/compras y waiter/staff quedan denegados", async () => {
    for (const [collectionName, documentId] of [
      ["inventoryProducts", "manager-inventory"],
      ["purchaseDrafts", "manager-draft"],
      ["purchaseOrders", "manager-purchase"],
      ["purchaseReceipts", "manager-receipt"],
      ["supplierInvoices", "manager-invoice"],
      ["supplierProductAliases", "manager-alias"],
    ] as const) {
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection(collectionName)
        .doc(documentId)
        .set({ restaurantId: RESTAURANT_A, name: "Seed" });
    }
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("inventoryReceipts")
      .doc("manager-root-receipt")
      .set({ restaurantId: RESTAURANT_A });

    const managerDb = rulesDb(MANAGER_A);
    const waiterDb = rulesDb(WAITER_A);
    const staffDb = rulesDb(LEGACY_A);

    for (const [collectionName, documentId] of [
      ["inventoryProducts", "manager-inventory"],
      ["purchaseDrafts", "manager-draft"],
      ["purchaseOrders", "manager-purchase"],
      ["purchaseReceipts", "manager-receipt"],
      ["supplierInvoices", "manager-invoice"],
      ["supplierProductAliases", "manager-alias"],
    ] as const) {
      await assertSucceeds(
        getDoc(
          doc(
            managerDb,
            "restaurants",
            RESTAURANT_A,
            collectionName,
            documentId,
          ),
        ),
      );
      await assertFails(
        getDoc(
          doc(
            waiterDb,
            "restaurants",
            RESTAURANT_A,
            collectionName,
            documentId,
          ),
        ),
      );
      await assertFails(
        getDoc(
          doc(
            staffDb,
            "restaurants",
            RESTAURANT_A,
            collectionName,
            documentId,
          ),
        ),
      );
    }
    await assertSucceeds(
      getDoc(
        doc(
          managerDb,
          "restaurants",
          RESTAURANT_A,
          "inventoryReceipts",
          "manager-root-receipt",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          waiterDb,
          "restaurants",
          RESTAURANT_A,
          "inventoryReceipts",
          "manager-root-receipt",
        ),
      ),
    );
  });

  test("orders y orderItems acotan mutaciones por capability", async () => {
    await seedProfilePair(
      "kitchen-a",
      profile({
        uid: "kitchen-a",
        restaurantId: RESTAURANT_A,
        role: "kitchen",
        status: "active",
      }),
    );

    const waiterDb = rulesDb(WAITER_A);
    const viewerDb = rulesDb(VIEWER_A);
    const kitchenDb = testEnv
      .authenticatedContext("kitchen-a", { email: "kitchen-a@example.test" })
      .firestore();

    await assertFails(
      setDoc(doc(waiterDb, "orders", "waiter-order-create"), {
        restaurantId: RESTAURANT_A,
        tableId: "mesa-1",
        status: "open",
      }),
    );
    await adminDb.collection("orders").doc("waiter-order-update").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [{ id: "line-1", quantity: 1 }],
      total: 10,
    });
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        items: [{ id: "line-1", quantity: 2, preparedAt: Date.now() }],
        total: 20,
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        paymentRequestedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        cancelledLineIds: ["line-1"],
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        discountTotal: 5,
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        tableId: "mesa-2",
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        tableGroupMergeOriginalStatus: "open",
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        items: [{ id: "line-1", quantity: 2, preparedAt: Date.now() }],
        discountTotal: 3,
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "waiter-order-update"), {
        restaurantId: RESTAURANT_B,
      }),
    );
    await assertFails(
      setDoc(doc(viewerDb, "orders", "viewer-order-create"), {
        restaurantId: RESTAURANT_A,
        status: "open",
      }),
    );

    await assertFails(
      setDoc(doc(waiterDb, "orderItems", "waiter-line-create"), {
        restaurantId: RESTAURANT_A,
        orderId: "waiter-order-update",
        status: "sent",
        quantity: 1,
      }),
    );
    await adminDb.collection("orderItems").doc("waiter-line-kds").set({
      restaurantId: RESTAURANT_A,
      orderId: "waiter-order-update",
      status: "sent",
      quantity: 1,
    });
    await assertFails(
      updateDoc(doc(waiterDb, "orderItems", "waiter-line-kds"), {
        status: "prepared",
        preparedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(kitchenDb, "orderItems", "waiter-line-kds"), {
        status: "prepared",
        preparedAt: Date.now(),
      }),
    );
    await adminDb.collection("orderItems").doc("waiter-line-cancel").set({
      restaurantId: RESTAURANT_A,
      orderId: "waiter-order-update",
      status: "sent",
      quantity: 1,
    });
    await assertFails(
      updateDoc(doc(waiterDb, "orderItems", "waiter-line-cancel"), {
        status: "cancelled",
        cancelledAt: Date.now(),
        quantity: 0,
      }),
    );
  });

  test("orderItems hardening: deniega deleteDoc a cliente Web válido", async () => {
    const orderItemId = "order-item-delete-denied";
    const fixtureRef = adminDb.collection("orderItems").doc(orderItemId);

    // Admin SDK se usa únicamente para preparar y verificar el fixture.
    await fixtureRef.set({
      restaurantId: RESTAURANT_A,
      orderId: "order-delete-denied",
      status: "sent",
      quantity: 1,
    });
    assert.equal((await fixtureRef.get()).exists, true);

    await assertFails(
      deleteDoc(doc(rulesDb(WAITER_A), "orderItems", orderItemId)),
    );
    assert.equal((await fixtureRef.get()).exists, true);
  });

  test("orderItems hardening: permite lectura Web del mismo tenant", async () => {
    const orderItemId = "order-item-same-tenant-read";
    const fixtureRef = adminDb.collection("orderItems").doc(orderItemId);

    // Admin SDK se usa únicamente para preparar y verificar el fixture.
    await fixtureRef.set({
      restaurantId: RESTAURANT_A,
      orderId: "order-same-tenant-read",
      status: "sent",
      quantity: 1,
    });
    assert.equal((await fixtureRef.get()).exists, true);

    const snapshot = await assertSucceeds(
      getDoc(doc(rulesDb(WAITER_A), "orderItems", orderItemId)),
    );
    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.data()?.restaurantId, RESTAURANT_A);
  });

  test("orderItems hardening: deniega lectura Web cross-tenant", async () => {
    const orderItemId = "order-item-cross-tenant-read";
    const fixtureRef = adminDb.collection("orderItems").doc(orderItemId);

    // Admin SDK se usa únicamente para preparar y verificar el fixture.
    await fixtureRef.set({
      restaurantId: RESTAURANT_A,
      orderId: "order-cross-tenant-read",
      status: "sent",
      quantity: 1,
    });
    assert.equal((await fixtureRef.get()).exists, true);

    await assertFails(
      getDoc(doc(rulesDb(OWNER_B), "orderItems", orderItemId)),
    );
  });

  test("orderItems hardening: deniega lectura Web a perfil disabled", async () => {
    const orderItemId = "order-item-disabled-read";
    const fixtureRef = adminDb.collection("orderItems").doc(orderItemId);

    // Admin SDK se usa únicamente para preparar y verificar el fixture.
    await fixtureRef.set({
      restaurantId: RESTAURANT_A,
      orderId: "order-disabled-read",
      status: "sent",
      quantity: 1,
    });
    assert.equal((await fixtureRef.get()).exists, true);

    await assertFails(
      getDoc(doc(rulesDb(DISABLED_A), "orderItems", orderItemId)),
    );
  });

  test("orders, orderItems y payments bloquean bypass TPV y privilegios preinyectados", async () => {
    await seedProfilePair(
      "kitchen-a",
      profile({
        uid: "kitchen-a",
        restaurantId: RESTAURANT_A,
        role: "kitchen",
        status: "active",
      }),
    );
    const waiterDb = rulesDb(WAITER_A);
    const kitchenDb = testEnv
      .authenticatedContext("kitchen-a", { email: "kitchen-a@example.test" })
      .firestore();

    const privilegedEmbeddedLine = {
      id: "line-kds",
      productId: "prod-1",
      name: "Plato",
      qty: 1,
      status: "prepared",
      preparedAt: Date.now(),
      price: 99,
      total: 99,
    };

    for (const [label, payload] of [
      ["discountTotal", { restaurantId: RESTAURANT_A, tableId: "m1", status: "open", total: 0, discountTotal: 5 }],
      ["merged status", { restaurantId: RESTAURANT_A, tableId: "m1", status: "merged", total: 0 }],
      ["mergedIntoOrderId", { restaurantId: RESTAURANT_A, tableId: "m1", status: "open", total: 0, mergedIntoOrderId: "x" }],
      ["items kds", { restaurantId: RESTAURANT_A, tableId: "m1", status: "open", total: 10, items: [privilegedEmbeddedLine] }],
      ["unknown field", { restaurantId: RESTAURANT_A, tableId: "m1", status: "open", total: 0, hackerField: true }],
    ] as const) {
      await assertFails(
        setDoc(doc(waiterDb, "orders", `deny-create-${label}`), payload),
      );
    }

    await adminDb.collection("orders").doc("bypass-order").set({
      restaurantId: RESTAURANT_A,
      tableId: "m1",
      status: "open",
      items: [{ id: "line-1", qty: 1, status: "sent" }],
      total: 10,
    });

    for (const [, payload] of [
      ["items kds", { items: [{ id: "line-1", qty: 1, status: "prepared", preparedAt: Date.now() }], updatedAt: Date.now() }],
      ["items discount", { items: [{ id: "line-1", qty: 1, status: "sent", discount: 5 }], updatedAt: Date.now() }],
      ["mergedIntoTableId", { mergedIntoTableId: "m2", updatedAt: Date.now() }],
      ["mixed allowed+denied", { paymentRequestedAt: Date.now(), discountTotal: 3, updatedAt: Date.now() }],
      ["unknown field", { note: "ok", rogue: true, updatedAt: Date.now() }],
    ] as const) {
      await assertFails(
        updateDoc(doc(waiterDb, "orders", "bypass-order"), payload),
      );
    }

    await assertFails(
      updateDoc(doc(kitchenDb, "orders", "bypass-order"), {
        items: [{ id: "line-1", qty: 1, status: "prepared", preparedAt: Date.now() }],
        updatedAt: Date.now(),
      }),
    );

    await assertFails(
      updateDoc(doc(waiterDb, "orders", "bypass-order"), {
        paymentRequestedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    for (const [label, payload] of [
      ["prepared", { restaurantId: RESTAURANT_A, orderId: "bypass-order", status: "prepared", quantity: 1 }],
      ["cancelled", { restaurantId: RESTAURANT_A, orderId: "bypass-order", status: "cancelled", quantity: 1 }],
      ["kds timestamp", { restaurantId: RESTAURANT_A, orderId: "bypass-order", status: "sent", quantity: 1, preparedAt: Date.now() }],
      ["unknown", { restaurantId: RESTAURANT_A, orderId: "bypass-order", status: "sent", quantity: 1, rogue: 1 }],
    ] as const) {
      await assertFails(
        setDoc(doc(waiterDb, "orderItems", `deny-oi-create-${label}`), payload),
      );
    }

    await adminDb.collection("orderItems").doc("bypass-oi").set({
      restaurantId: RESTAURANT_A,
      orderId: "bypass-order",
      productId: "prod-1",
      status: "sent",
      quantity: 1,
    });

    for (const [, payload] of [
      ["orderId", { orderId: "other-order", updatedAt: Date.now() }],
      ["productId", { productId: "other-prod", updatedAt: Date.now() }],
      ["price", { price: 50, updatedAt: Date.now() }],
      ["kds", { status: "prepared", preparedAt: Date.now() }],
      ["unknown", { note: "x", rogue: 1, updatedAt: Date.now() }],
    ] as const) {
      await assertFails(
        updateDoc(doc(waiterDb, "orderItems", "bypass-oi"), payload),
      );
    }

    await assertFails(
      updateDoc(doc(kitchenDb, "orderItems", "bypass-oi"), {
        status: "prepared",
        preparedAt: Date.now(),
      }),
    );

    for (const [label, payload] of [
      ["refund status", { restaurantId: RESTAURANT_A, amount: 10, status: "refunded", type: "table_amount" }],
      ["refund type", { restaurantId: RESTAURANT_A, amount: 10, status: "paid", type: "refund" }],
      ["refund flag", { restaurantId: RESTAURANT_A, amount: 10, status: "paid", type: "table_amount", refund: true }],
      ["negative amount", { restaurantId: RESTAURANT_A, amount: -1, status: "paid", type: "table_amount" }],
      ["unknown", { restaurantId: RESTAURANT_A, amount: 10, status: "paid", type: "table_amount", rogue: 1 }],
    ] as const) {
      await assertFails(
        setDoc(doc(waiterDb, "payments", `deny-pay-${label}`), payload),
      );
    }

    await assertFails(
      setDoc(doc(waiterDb, "payments", "pay-ok"), {
        restaurantId: RESTAURANT_A,
        amount: 12,
        status: "paid",
        type: "table_amount",
      }),
    );
  });

  test("orders 1B: server-write-only — matriz de roles, campos y lecturas", async () => {
    await seedProfilePair(
      "kitchen-a",
      profile({
        uid: "kitchen-a",
        restaurantId: RESTAURANT_A,
        role: "kitchen",
        status: "active",
      }),
    );

    const roleDbs = [
      ["owner", rulesDb(OWNER_A)],
      ["admin", rulesDb(ADMIN_A)],
      ["manager", rulesDb(MANAGER_A)],
      ["waiter", rulesDb(WAITER_A)],
      ["kitchen", testEnv.authenticatedContext("kitchen-a", { email: "kitchen-a@example.test" }).firestore()],
      ["viewer", rulesDb(VIEWER_A)],
    ] as const;

    await adminDb.collection("orders").doc("mb1b-base").set({
      restaurantId: RESTAURANT_A,
      tableId: "m1",
      status: "open",
      items: [{ id: "line-1", qty: 1, status: "sent" }],
      total: 10,
      note: "base",
      assignedOperatorId: "op-1",
      assignedOperatorName: "Operador 1",
    });

    for (const [role, db] of roleDbs) {
      await assertFails(
        setDoc(doc(db, "orders", `mb1b-create-${role}`), {
          restaurantId: RESTAURANT_A,
          tableId: "m1",
          status: "open",
        }),
      );
      await assertFails(deleteDoc(doc(db, "orders", "mb1b-base")));
    }

    const updateCases = [
      ["note", { note: "cambio", updatedAt: Date.now() }],
      ["paymentRequestedAt", { paymentRequestedAt: Date.now(), updatedAt: Date.now() }],
      [
        "assignment",
        {
          assignedOperatorId: "op-2",
          assignedOperatorName: "Operador 2",
          assignedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      ["tableId", { tableId: "m2", updatedAt: Date.now() }],
      ["status", { status: "sent", updatedAt: Date.now() }],
      ["items", { items: [{ id: "line-1", qty: 2, status: "sent" }], updatedAt: Date.now() }],
      ["total", { total: 99, updatedAt: Date.now() }],
      ["discountPercent", { discountPercent: 10, updatedAt: Date.now() }],
    ] as const;

    for (const [, db] of roleDbs) {
      for (const [, payload] of updateCases) {
        await assertFails(updateDoc(doc(db, "orders", "mb1b-base"), payload));
      }
    }

    await assertSucceeds(getDoc(doc(rulesDb(WAITER_A), "orders", "mb1b-base")));
    await assertFails(getDoc(doc(rulesDb(OWNER_B), "orders", "mb1b-base")));
    await assertFails(getDoc(doc(rulesDb(DISABLED_A), "orders", "mb1b-base")));
  });

  test("orders 1B: deniega overwrite cliente sin evaluation errors", async () => {
    const waiterDb = rulesDb(WAITER_A);
    await adminDb.collection("orders").doc("mb1b-shape").set({
      restaurantId: RESTAURANT_A,
      tableId: "m1",
      status: "open",
      items: [{ id: "line-1", qty: 1, status: "sent" }],
      total: 10,
      note: "base",
    });

    await assertFails(
      setDoc(doc(waiterDb, "orders", "mb1b-shape"), {
        restaurantId: RESTAURANT_A,
        tableId: "m1",
        status: "open",
        items: [{ id: "line-1", qty: 1, status: "prepared", preparedAt: Date.now() }],
        total: 99,
      }),
    );
    await assertFails(
      setDoc(
        doc(waiterDb, "orders", "mb1b-shape"),
        { note: "merge", updatedAt: Date.now() },
        { merge: true },
      ),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "mb1b-shape"), {
        total: deleteField(),
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "mb1b-shape"), {
        total: increment(1),
        updatedAt: Date.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(waiterDb, "orders", "mb1b-shape"), {
        paidAt: serverTimestamp(),
        updatedAt: Date.now(),
      }),
    );
  });
});

describe("APIs de migración de catálogo", () => {
  const legacyPlatos = [
    {
      id: "legacy-1",
      nombre: "Plato demo",
      categoria: "Principal",
      precio: 12,
    },
  ];

  function catalogJsonSpyRequest(token?: string) {
    const req = request("POST", token, { legacyPlatos });
    let reads = 0;
    Object.defineProperty(req, "json", {
      value: async () => {
        reads += 1;
        return { legacyPlatos };
      },
    });
    return { req, reads: () => reads };
  }

  test("migrate-legacy y migration-preview exigen settings.manage antes del body", async () => {
    await seedProfilePair(
      "kitchen-a",
      profile({
        uid: "kitchen-a",
        restaurantId: RESTAURANT_A,
        role: "kitchen",
        status: "active",
      }),
    );
    const tokens = {
      owner: { uid: OWNER_A, email: IDENTITIES[OWNER_A], email_verified: true },
      admin: { uid: ADMIN_A, email: IDENTITIES[ADMIN_A], email_verified: true },
      manager: {
        uid: MANAGER_A,
        email: IDENTITIES[MANAGER_A],
        email_verified: true,
      },
      waiter: {
        uid: WAITER_A,
        email: IDENTITIES[WAITER_A],
        email_verified: true,
      },
      staff: {
        uid: LEGACY_A,
        email: IDENTITIES[LEGACY_A],
        email_verified: true,
      },
      kitchen: {
        uid: "kitchen-a",
        email: "kitchen-a@example.test",
        email_verified: true,
      },
      viewer: { uid: VIEWER_A, email: IDENTITIES[VIEWER_A], email_verified: true },
      disabled: {
        uid: DISABLED_A,
        email: IDENTITIES[DISABLED_A],
        email_verified: true,
      },
    };
    for (const [token, expectedStatus, expectedError] of [
      [undefined, 401, "UNAUTHORIZED"],
      ["invalid", 401, "UNAUTHORIZED"],
      ["disabled", 403, "PROFILE_DISABLED"],
      ["viewer", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["waiter", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["staff", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["kitchen", 403, "SETTINGS_MANAGE_REQUIRED"],
      ["manager", 403, "SETTINGS_MANAGE_REQUIRED"],
    ] as const) {
      const migrateSpy = catalogJsonSpyRequest(token);
      const migrateResponse = await handleMigrateLegacyRequest(
        migrateSpy.req,
        dependencies(tokens),
      );
      assert.equal(migrateResponse.status, expectedStatus, `migrate ${token}`);
      assert.equal(migrateSpy.reads(), 0, `migrate body ${token}`);
      if (expectedError) {
        assert.equal((await responseBody(migrateResponse)).error, expectedError);
      }

      const previewSpy = catalogJsonSpyRequest(token);
      const previewResponse = await handleMigrationPreviewRequest(
        previewSpy.req,
        dependencies(tokens),
      );
      assert.equal(previewResponse.status, expectedStatus, `preview ${token}`);
      assert.equal(previewSpy.reads(), 0, `preview body ${token}`);
      if (expectedError) {
        assert.equal((await responseBody(previewResponse)).error, expectedError);
      }
    }

    const tenantDenied = await handleMigrationPreviewRequest(
      request("POST", "owner", {
        legacyPlatos,
        restaurantId: RESTAURANT_B,
      }),
      dependencies({
        owner: { uid: OWNER_A, email: IDENTITIES[OWNER_A], email_verified: true },
      }),
    );
    assert.equal(tenantDenied.status, 400);
    assert.equal((await responseBody(tenantDenied)).error, "RESTAURANT_ID_NOT_ALLOWED");
  });
});
