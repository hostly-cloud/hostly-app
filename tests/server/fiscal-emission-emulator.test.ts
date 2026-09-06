import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, type Firestore } from "firebase-admin/firestore";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { buildFiscalConfiguration } from "@/lib/fiscal/configuration";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { handleChargeOrder } from "@/lib/server/tpv/handle-tpv-payment-mutations";

const PROJECT_ID = "demo-hostly-fiscal";
const RESTAURANT_A = "fiscal-rest-a";
const RESTAURANT_B = "fiscal-rest-b";
let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: Firestore;

function managerContext(restaurantId = RESTAURANT_A): AuthenticatedRestaurantContext {
  return {
    uid: `manager-${restaurantId}`,
    email: `${restaurantId}@example.test`,
    emailVerified: true,
    restaurantId,
    role: "manager",
    canManageUsers: false,
    db: adminDb,
  };
}

function activeTestConfiguration(restaurantId: string) {
  const config = buildFiscalConfiguration({
    restaurantId,
    value: {
      mode: "test",
      taxpayerLegalName: restaurantId === RESTAURANT_A ? "Restaurante Fiscal A SL" : "Restaurante Fiscal B SL",
      taxpayerNif: restaurantId === RESTAURANT_A ? "B12345674" : "A58818501",
      taxpayerAddress: { line1: "Calle Fiscal 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
      establishmentName: `Local ${restaurantId}`,
      establishmentAddress: { line1: "Calle Fiscal 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
      timezone: "Europe/Madrid",
      defaultVatRateBps: 1_000,
    },
  });
  config.status = "active";
  config.software.producerLegalName = "Hostly Cloud SL";
  config.software.producerNif = "B12345674";
  config.certificateSecretResource = "projects/test/secrets/aeat/versions/1";
  return config;
}

async function seedProfile(uid: string, email: string, restaurantId: string, role: string) {
  const profile = { uid, email, restaurantId, restaurantName: restaurantId, role, status: "active" };
  await Promise.all([
    adminDb.collection("users").doc(uid).set(profile),
    adminDb.collection("usuarios").doc(uid).set(profile),
  ]);
}

async function seedOrder(orderId: string, restaurantId = RESTAURANT_A, amount = 11) {
  await adminDb.collection("orders").doc(orderId).set({
    restaurantId,
    status: "sent",
    items: [{ id: `${orderId}-line`, productId: "menu", name: "Menú", quantity: 1, price: amount, total: amount, vatRateBps: 1_000, status: "sent" }],
    total: amount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function charge(orderId: string, restaurantId = RESTAURANT_A, idempotencyKey = `charge:${orderId}`) {
  return handleChargeOrder(managerContext(restaurantId), {
    orderId,
    paymentMethod: "card",
    type: "table_amount",
    amount: 11,
    idempotencyKey,
  });
}

describe("fiscal emission transaction", () => {
  before(async () => {
    process.env.HOSTLY_FISCAL_PRODUCER_LEGAL_NAME = "Hostly Cloud SL";
    process.env.HOSTLY_FISCAL_PRODUCER_NIF = "B12345674";
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
    adminApp = initializeApp({ projectId: PROJECT_ID }, "fiscal-emission-admin");
    adminDb = getAdminFirestore(adminApp);
    adminDb.settings({ ignoreUndefinedProperties: true });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await Promise.all([
      adminDb.collection("fiscalConfigurations").doc(RESTAURANT_A).set(activeTestConfiguration(RESTAURANT_A)),
      adminDb.collection("fiscalConfigurations").doc(RESTAURANT_B).set(activeTestConfiguration(RESTAURANT_B)),
      seedProfile("manager-a", "manager-a@example.test", RESTAURANT_A, "manager"),
      seedProfile("manager-b", "manager-b@example.test", RESTAURANT_B, "manager"),
      seedProfile("waiter-a", "waiter-a@example.test", RESTAURANT_A, "waiter"),
    ]);
  });

  after(async () => {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  });

  test("dos TPV concurrentes reciben números distintos y una sola cadena", async () => {
    await Promise.all([seedOrder("order-a1"), seedOrder("order-a2")]);
    const [first, second] = await Promise.all([charge("order-a1"), charge("order-a2")]);
    assert.equal("fiscal" in first, true);
    assert.equal("fiscal" in second, true);
    if (!("fiscal" in first) || !("fiscal" in second)) return;
    assert.ok(first.fiscal);
    assert.ok(second.fiscal);
    assert.notEqual(first.fiscal.invoiceNumber, second.fiscal.invoiceNumber);

    const invoices = await adminDb.collection("fiscalInvoices").where("restaurantId", "==", RESTAURANT_A).get();
    const sequences = invoices.docs.map((row) => Number(row.data().sequence)).sort((a, b) => a - b);
    assert.deepEqual(sequences, [1, 2]);
    const records = await adminDb.collection("fiscalRecords").where("restaurantId", "==", RESTAURANT_A).get();
    const previousValues = records.docs.map((row) => row.data().record.previous);
    assert.equal(previousValues.filter((value) => value == null).length, 1);
    assert.equal(previousValues.filter((value) => value != null).length, 1);
    const outbox = await adminDb.collection("fiscalOutbox").get();
    assert.equal(outbox.size, 2);
    assert.deepEqual(
      outbox.docs.map((row) => Number(row.data().chainSequence)).sort((a, b) => a - b),
      [1, 2],
    );
    assert.equal(outbox.docs.every((row) => typeof row.data().installationNumber === "string"), true);
  });

  test("doble pulsación no duplica pago, número ni registro", async () => {
    await seedOrder("order-double");
    const results = await Promise.all([
      charge("order-double", RESTAURANT_A, "same-key"),
      charge("order-double", RESTAURANT_A, "same-key"),
    ]);
    assert.equal(results.every((result) => "paymentId" in result), true);
    assert.equal((await adminDb.collection("payments").where("orderId", "==", "order-double").get()).size, 1);
    assert.equal((await adminDb.collection("fiscalInvoices").where("orderId", "==", "order-double").get()).size, 1);
    assert.equal((await adminDb.collection("fiscalRecords").where("restaurantId", "==", RESTAURANT_A).get()).size, 1);
  });

  test("modo demo cobra sin crear una apariencia de factura fiscal", async () => {
    const demo = activeTestConfiguration(RESTAURANT_A);
    demo.mode = "demo";
    demo.status = "draft";
    await adminDb.collection("fiscalConfigurations").doc(RESTAURANT_A).set(demo);
    await seedOrder("order-demo");
    const result = await charge("order-demo");
    assert.equal("fiscal" in result && result.fiscal, null);
    assert.equal((await adminDb.collection("fiscalInvoices").get()).size, 0);
  });

  test("las reglas aíslan facturas y bloquean escrituras fiscales del cliente", async () => {
    await seedOrder("order-a-visible");
    await seedOrder("order-b-hidden", RESTAURANT_B);
    const a = await charge("order-a-visible");
    const b = await charge("order-b-hidden", RESTAURANT_B);
    assert.equal("fiscal" in a && Boolean(a.fiscal), true);
    assert.equal("fiscal" in b && Boolean(b.fiscal), true);
    if (!("fiscal" in a) || !a.fiscal || !("fiscal" in b) || !b.fiscal) return;

    const dbA = testEnv.authenticatedContext("manager-a", { email: "manager-a@example.test" }).firestore();
    const waiterDb = testEnv.authenticatedContext("waiter-a", { email: "waiter-a@example.test" }).firestore();
    await assertSucceeds(getDoc(doc(dbA, "fiscalInvoices", a.fiscal.invoiceId)));
    await assertFails(getDoc(doc(dbA, "fiscalInvoices", b.fiscal.invoiceId)));
    await assertFails(getDoc(doc(waiterDb, "fiscalInvoices", a.fiscal.invoiceId)));
    await assertFails(setDoc(doc(dbA, "fiscalInvoices", "forged"), { restaurantId: RESTAURANT_A }));
    await assertFails(setDoc(doc(dbA, "fiscalCounters", "forged"), { restaurantId: RESTAURANT_A, sequence: 999 }));
  });
});
