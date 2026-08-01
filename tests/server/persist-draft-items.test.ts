import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parsePersistDraftItemsBody,
} from "@/lib/server/tpv/tpv-mutation-dtos";
import { mergeOrderItemsForPersist } from "@/lib/firestore/merge-order-items-for-persist";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "test-project";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:abc";

describe("parsePersistDraftItemsBody", () => {
  test("acepta items vacíos", () => {
    const parsed = parsePersistDraftItemsBody({
      orderId: "ord-1",
      items: [],
    });
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.orderId, "ord-1");
    assert.deepEqual(parsed.items, []);
  });

  test("rechaza restaurantId en body", () => {
    const parsed = parsePersistDraftItemsBody({
      orderId: "ord-1",
      items: [],
      restaurantId: "other",
    });
    assert.equal("error" in parsed && parsed.error, "RESTAURANT_ID_NOT_ALLOWED");
  });

  test("requiere orderId", () => {
    const parsed = parsePersistDraftItemsBody({ items: [] });
    assert.equal("error" in parsed && parsed.error, "ORDER_ID_REQUIRED");
  });
});

describe("persist-draft merge semantics (contrato remoto)", () => {
  test("6. epoch 2 vacío gana frente a epoch 1 con [A] (merge final)", () => {
    // Simula escritura final del epoch 2 tras un create/upsert tardío del epoch 1.
    const afterStaleEpoch1 = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
    ];
    const epoch2Local: Record<string, unknown>[] = [];
    const final = mergeOrderItemsForPersist(afterStaleEpoch1, epoch2Local);
    assert.deepEqual(final, []);
  });

  test("7. misma mutación vacía es idempotente en merge", () => {
    const server = [
      { id: "B", productId: "p2", quantity: 1, status: "sent", total: 3 },
    ];
    const once = mergeOrderItemsForPersist(server, []);
    const twice = mergeOrderItemsForPersist(once, []);
    assert.deepEqual(once, twice);
    assert.equal(twice.length, 1);
    assert.equal(twice[0]?.id, "B");
  });
});

describe("persist-draft route structural", () => {
  test("ruta TPV usa auth estricto y handlePersistDraftItems", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "app/api/tpv/orders/persist-draft/route.ts",
      ),
      "utf8",
    );
    assert.match(src, /requireAuthorizedTpvRestaurant/);
    assert.match(src, /handlePersistDraftItems/);
    assert.match(src, /parsePersistDraftItemsBody/);
  });

  test("handler exporta handlePersistDraftItems", async () => {
    const mod = await import("@/lib/server/tpv/handle-tpv-order-mutations");
    assert.equal(typeof mod.handlePersistDraftItems, "function");
  });
});
