import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  createInventoryWaste,
  normalizeWasteIdempotencyKey,
} from "@/lib/server/inventory/waste";

type StoredDocument = Record<string, unknown>;

type FakeDocumentReference = {
  path: string;
  id: string;
  collection: (name: string) => FakeCollectionReference;
};

type FakeCollectionReference = {
  path: string;
  doc: (id?: string) => FakeDocumentReference;
};

class FakeFirestore {
  private readonly documents = new Map<string, StoredDocument>();
  private autoId = 0;

  collection(name: string): FakeCollectionReference {
    return this.collectionRef(name);
  }

  seed(path: string, data: StoredDocument): void {
    this.documents.set(path, structuredClone(data));
  }

  read(path: string): StoredDocument | undefined {
    const data = this.documents.get(path);
    return data ? structuredClone(data) : undefined;
  }

  async runTransaction<T>(
    callback: (transaction: {
      get: (ref: FakeDocumentReference) => Promise<{
        id: string;
        exists: boolean;
        data: () => StoredDocument | undefined;
      }>;
      update: (ref: FakeDocumentReference, patch: StoredDocument) => void;
      create: (ref: FakeDocumentReference, data: StoredDocument) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const writes: Array<() => void> = [];
    const transaction = {
      get: async (ref: FakeDocumentReference) => {
        const data = this.documents.get(ref.path);
        return {
          id: ref.id,
          exists: data != null,
          data: () => (data ? structuredClone(data) : undefined),
        };
      },
      update: (ref: FakeDocumentReference, patch: StoredDocument) => {
        writes.push(() => {
          const current = this.documents.get(ref.path);
          if (!current) throw new Error(`missing document: ${ref.path}`);
          const next = structuredClone(current);
          for (const [key, value] of Object.entries(patch)) {
            if (key.includes(".")) {
              const parts = key.split(".");
              let cursor = next;
              for (let index = 0; index < parts.length - 1; index += 1) {
                const part = parts[index];
                const child = cursor[part];
                if (!child || typeof child !== "object" || Array.isArray(child)) {
                  cursor[part] = {};
                }
                cursor = cursor[part] as StoredDocument;
              }
              cursor[parts[parts.length - 1]] = value;
            } else {
              next[key] = value;
            }
          }
          this.documents.set(ref.path, next);
        });
      },
      create: (ref: FakeDocumentReference, data: StoredDocument) => {
        writes.push(() => {
          if (this.documents.has(ref.path)) {
            throw new Error(`already exists: ${ref.path}`);
          }
          this.documents.set(ref.path, structuredClone(data));
        });
      },
    };

    const result = await callback(transaction);
    for (const write of writes) write();
    return result;
  }

  private collectionRef(path: string): FakeCollectionReference {
    return {
      path,
      doc: (id?: string) => {
        const resolvedId = id || `auto-${++this.autoId}`;
        return this.documentRef(`${path}/${resolvedId}`, resolvedId);
      },
    };
  }

  private documentRef(path: string, id: string): FakeDocumentReference {
    return {
      path,
      id,
      collection: (name: string) => this.collectionRef(`${path}/${name}`),
    };
  }
}

function firestore(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const restaurantId = "restaurant-1";
const productId = "product-1";
const userId = "owner-1";
const idempotencyKey = "7f1ddbc0-51f3-4ee8-82d4-4a948219e6fe";

function seedProduct(fake: FakeFirestore) {
  fake.seed(`restaurants/${restaurantId}/products/${productId}`, {
    restaurantId,
    name: "Tomate",
    inventory: {
      enabled: true,
      unit: "kg",
      currentStock: 10,
      costPerUnit: 2,
    },
  });
}

test("waste idempotency key validation accepts UUID-style keys only", () => {
  assert.equal(normalizeWasteIdempotencyKey(idempotencyKey), idempotencyKey);
  assert.equal(normalizeWasteIdempotencyKey("short"), null);
  assert.equal(normalizeWasteIdempotencyKey("bad key with spaces"), null);
});

test("retrying the same waste mutation does not discount stock twice", async () => {
  const fake = new FakeFirestore();
  seedProduct(fake);

  const input = {
    db: firestore(fake),
    restaurantId,
    userId,
    productId,
    quantity: 3,
    reason: "roto" as const,
    notes: "Botella rota",
    occurredOn: "2026-09-04",
    idempotencyKey,
  };

  const first = await createInventoryWaste(input);
  const retry = await createInventoryWaste(input);

  assert.equal(first.id, idempotencyKey);
  assert.equal(retry.id, idempotencyKey);
  assert.equal(retry.stockBefore, 10);
  assert.equal(retry.stockAfter, 7);
  assert.equal(
    (fake.read(`restaurants/${restaurantId}/products/${productId}`)?.inventory as StoredDocument)
      .currentStock,
    7,
  );
  assert.equal(
    fake.read(`restaurants/${restaurantId}/inventoryWaste/${idempotencyKey}`)?.quantity,
    3,
  );
  assert.equal(
    fake.read(`restaurants/${restaurantId}/stockMovements/waste_${idempotencyKey}`)
      ?.quantityDelta,
    -3,
  );
});

test("reusing a waste idempotency key with different data is rejected", async () => {
  const fake = new FakeFirestore();
  seedProduct(fake);

  await createInventoryWaste({
    db: firestore(fake),
    restaurantId,
    userId,
    productId,
    quantity: 2,
    reason: "caducado",
    notes: null,
    occurredOn: "2026-09-04",
    idempotencyKey,
  });

  await assert.rejects(
    createInventoryWaste({
      db: firestore(fake),
      restaurantId,
      userId,
      productId,
      quantity: 4,
      reason: "caducado",
      notes: null,
      occurredOn: "2026-09-04",
      idempotencyKey,
    }),
    /IDEMPOTENCY_CONFLICT/,
  );

  assert.equal(
    (fake.read(`restaurants/${restaurantId}/products/${productId}`)?.inventory as StoredDocument)
      .currentStock,
    8,
  );
});
