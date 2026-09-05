import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-hostly-operational-rbac";
const RESTAURANT_ID = "restaurant-rbac-a";

let testEnv: RulesTestEnvironment;

const PROFILE_SEEDS = [
  ["owner-a", "owner"],
  ["manager-a", "manager"],
  ["waiter-a", "waiter"],
  ["kitchen-a", "kitchen"],
  ["viewer-a", "viewer"],
] as const;

function profileEmail(uid: string) {
  return `${uid}@hostly-rbac.test`;
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role] of PROFILE_SEEDS) {
      const profile = {
        uid,
        email: profileEmail(uid),
        restaurantId: RESTAURANT_ID,
        role,
        status: "active",
      };
      await setDoc(doc(db, "users", uid), profile);
      await setDoc(doc(db, "usuarios", uid), profile);
    }

    await setDoc(doc(db, "reservations", "reservation-a"), {
      restaurantId: RESTAURANT_ID,
      customerName: "Cliente RBAC",
      date: "2026-09-04",
      time: "20:30",
      partySize: 2,
      status: "booked",
    });
    await setDoc(
      doc(db, "restaurants", RESTAURANT_ID, "activityLogs", "activity-a"),
      { restaurantId: RESTAURANT_ID, action: "test" },
    );
    await setDoc(
      doc(db, "restaurants", RESTAURANT_ID, "activeSessions", "session-a"),
      { restaurantId: RESTAURANT_ID, userId: "owner-a", active: true },
    );
    await setDoc(doc(db, "tables", "table-a"), {
      restaurantId: RESTAURANT_ID,
      name: "Mesa 1",
      guestCount: 0,
      x: 10,
      y: 10,
      width: 80,
      height: 80,
      capacity: 4,
    });
    await setDoc(doc(db, "tables", "decorative-a"), {
      restaurantId: RESTAURANT_ID,
      name: "Pared Editor V2",
      type: "wall",
      isActive: true,
      source: "editor-v2",
      x: 10,
      y: 10,
      width: 120,
      height: 12,
    });
    await setDoc(doc(db, "products", "legacy-product-a"), {
      restaurantId: RESTAURANT_ID,
      name: "Producto legacy",
      price: 5,
    });
  });
}

function firestoreFor(uid: string) {
  return testEnv.authenticatedContext(uid, { email: profileEmail(uid) }).firestore();
}

describe("operational RBAC Firestore rules", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    await seed();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  test("reservas se pueden leer por sala/manager pero no por cocina y nunca escribir directamente", async () => {
    const waiter = firestoreFor("waiter-a");
    const manager = firestoreFor("manager-a");
    const kitchen = firestoreFor("kitchen-a");

    await assertSucceeds(getDoc(doc(waiter, "reservations", "reservation-a")));
    await assertSucceeds(getDoc(doc(manager, "reservations", "reservation-a")));
    await assertFails(getDoc(doc(kitchen, "reservations", "reservation-a")));
    await assertFails(
      setDoc(doc(waiter, "reservations", "reservation-direct-write"), {
        restaurantId: RESTAURANT_ID,
        customerName: "Bypass",
        date: "2026-09-04",
        time: "21:00",
        partySize: 2,
        status: "booked",
      }),
    );
  });

  test("actividad y sesiones quedan reservadas a supervisión", async () => {
    const manager = firestoreFor("manager-a");
    const waiter = firestoreFor("waiter-a");
    const viewer = firestoreFor("viewer-a");

    await assertSucceeds(
      getDoc(doc(manager, "restaurants", RESTAURANT_ID, "activityLogs", "activity-a")),
    );
    await assertSucceeds(
      getDoc(doc(manager, "restaurants", RESTAURANT_ID, "activeSessions", "session-a")),
    );
    await assertFails(
      getDoc(doc(waiter, "restaurants", RESTAURANT_ID, "activityLogs", "activity-a")),
    );
    await assertFails(
      getDoc(doc(viewer, "restaurants", RESTAURANT_ID, "activeSessions", "session-a")),
    );
  });

  test("camarero puede actualizar datos operativos de mesa pero no geometría ni crear mesas", async () => {
    const waiter = firestoreFor("waiter-a");
    const owner = firestoreFor("owner-a");

    await assertSucceeds(
      updateDoc(doc(waiter, "tables", "table-a"), { guestCount: 2 }),
    );
    await assertFails(updateDoc(doc(waiter, "tables", "table-a"), { x: 120 }));
    await assertFails(
      setDoc(doc(waiter, "tables", "table-waiter"), {
        restaurantId: RESTAURANT_ID,
        name: "Mesa no autorizada",
      }),
    );
    await assertSucceeds(updateDoc(doc(owner, "tables", "table-a"), { x: 120 }));
    await assertSucceeds(
      setDoc(doc(owner, "tables", "table-owner"), {
        restaurantId: RESTAURANT_ID,
        name: "Mesa owner",
      }),
    );
  });

  test("owner puede retirar decorativos de Editor V2 sin abrir el lifecycle de mesas", async () => {
    const owner = firestoreFor("owner-a");
    const waiter = firestoreFor("waiter-a");

    await assertFails(
      updateDoc(doc(waiter, "tables", "decorative-a"), { isActive: false }),
    );
    await assertFails(
      updateDoc(doc(owner, "tables", "table-a"), { isActive: false }),
    );
    await assertFails(
      updateDoc(doc(owner, "tables", "decorative-a"), { type: "table" }),
    );
    await assertSucceeds(
      updateDoc(doc(owner, "tables", "decorative-a"), { isActive: false }),
    );
  });

  test("catálogo legacy solo admite escritura manager o superior", async () => {
    const manager = firestoreFor("manager-a");
    const waiter = firestoreFor("waiter-a");

    await assertSucceeds(
      updateDoc(doc(manager, "products", "legacy-product-a"), { price: 6 }),
    );
    await assertFails(
      updateDoc(doc(waiter, "products", "legacy-product-a"), { price: 7 }),
    );
  });
});
