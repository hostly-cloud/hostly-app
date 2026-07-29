import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { ProductDocument } from "@/lib/firestore/products";
import { buildAuthoritativeSaleLine } from "@/lib/server/tpv/build-authoritative-sale-line";
import { planOrderProjectionWrites } from "@/lib/server/tpv/order-projection";
import {
  buildIdempotencyResultWithInventoryWarnings,
  buildIdempotencyPayload,
} from "@/lib/server/tpv/tpv-idempotency";

const RESTAURANT = "rest-undefined-test";

function isFirestoreSentinel(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Timestamp) return true;
  if (value instanceof Date) return true;
  return "_methodName" in (value as Record<string, unknown>);
}

export function collectUndefinedPaths(
  value: unknown,
  path = "$",
  acc: string[] = [],
): string[] {
  if (value === undefined) {
    acc.push(path);
    return acc;
  }
  if (value == null || typeof value !== "object") return acc;
  if (isFirestoreSentinel(value)) return acc;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUndefinedPaths(entry, `${path}[${index}]`, acc));
    return acc;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    collectUndefinedPaths(entry, `${path}.${key}`, acc);
  }
  return acc;
}

export function assertNoUndefinedDeep(value: unknown, label = "payload"): void {
  const paths = collectUndefinedPaths(value);
  assert.deepEqual(paths, [], `${label} contains undefined at: ${paths.join(", ")}`);
}

function baseProduct(overrides: Partial<ProductDocument> = {}): ProductDocument {
  return {
    id: "prod-1",
    name: "Producto test",
    categoryId: null,
    categoryName: null,
    price: 10,
    active: true,
    station: null,
    type: null,
    tipoVenta: "plato",
    inventory: {
      enabled: false,
      unit: "ud",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
    },
    recipe: { enabled: false, ingredients: [] },
    ...overrides,
  };
}

function projectionPayload(line: Record<string, unknown>) {
  const mockDb = {
    collection() {
      return { doc: () => ({ id: "order-item-1" }) };
    },
  } as unknown as Firestore;
  const sentLine = { ...line, status: "sent" };
  const plan = planOrderProjectionWrites(
    mockDb,
    {
      restaurantId: RESTAURANT,
      orderId: "order-1",
      tableId: "mesa-1",
      tableName: "Mesa 1",
    },
    [sentLine],
    { byLineId: new Map(), byDocId: new Map(), allRefs: [] },
    1_700_000_000_000,
  );
  return {
    orderLine: sentLine,
    orderItem: plan.writes[0]?.payload,
    orderDocument: { items: plan.itemsWithDocIds, total: 10, restaurantId: RESTAURANT },
  };
}

describe("TPV payloads omit undefined before Firestore (Corrección 2)", () => {
  test("emulator setup does not enable ignoreUndefinedProperties", () => {
    const src = readFileSync("tests/server/tpv-mutations-emulator.test.ts", "utf8");
    assert.doesNotMatch(src, /ignoreUndefinedProperties\s*:\s*true/);
  });

  test("1. product without category omits category fields", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct({ categoryId: null, categoryName: null }),
      modifiers: [],
    });
    assert.equal("categoryId" in line, false);
    assert.equal("categoryName" in line, false);
    assert.equal("categoria" in line, false);
    assertNoUndefinedDeep(line, "sale line without category");
  });

  test("2. product without station omits station fields", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct({
        operationStationId: null,
        operationStationName: null,
      }),
      modifiers: [],
    });
    assert.equal("stationId" in line, false);
    assert.equal("stationName" in line, false);
    assert.equal("operationStationId" in line, false);
    assert.equal("operationStationName" in line, false);
    assertNoUndefinedDeep(line, "sale line without station");
  });

  test("3. product without operational station metadata has no undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [],
    });
    assertNoUndefinedDeep(line, "sale line minimal");
  });

  test("4. product without course omits course", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct({ course: null }),
      modifiers: [],
    });
    assert.equal("course" in line, false);
    assertNoUndefinedDeep(line, "sale line without course");
  });

  test("5. line without modifiers omits modifierTotal", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [],
    });
    assert.equal("modifierTotal" in line, false);
    assert.equal("selectedModifiers" in line, false);
    assertNoUndefinedDeep(line, "sale line without modifiers");
  });

  test("6. line with modifierTotal equal to 0 keeps zero", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "grp",
          groupName: "Grupo",
          optionId: "opt",
          optionName: "Opción",
          priceDelta: 0,
        },
      ],
    });
    assert.equal(line.modifierTotal, 0);
    assertNoUndefinedDeep(line, "sale line with zero modifierTotal");
  });

  test("7. null categoryName on product is omitted, course 0 is preserved", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct({ categoryName: null, course: 0 }),
      modifiers: [],
    });
    assert.equal("categoryName" in line, false);
    assert.equal(line.course, 0);
    assertNoUndefinedDeep(line, "sale line with course zero");
  });

  test("8. nested selectedModifiers contain no undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "grp",
          groupName: "Grupo",
          optionId: "opt",
          optionName: "Opción",
          priceDelta: 1,
        },
      ],
      defaultStatus: "sent",
    });
    assertNoUndefinedDeep(line, "sale line with modifiers");
  });

  test("9. order document items contain no undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [],
      defaultStatus: "sent",
    });
    const { orderDocument } = projectionPayload(line);
    assertNoUndefinedDeep(orderDocument, "order document");
  });

  test("10. orderItem projection contains no undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct({
        categoryId: "cat-1",
        categoryName: "Bebidas",
        operationStationId: "bar",
        operationStationName: "Barra",
        course: 2,
      }),
      modifiers: [],
      defaultStatus: "sent",
    });
    const { orderItem } = projectionPayload(line);
    assert.ok(orderItem);
    assertNoUndefinedDeep(orderItem, "orderItem projection");
  });

  test("11. stock movement shape from sale line modifiers has no undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "grp",
          groupName: "Mixer",
          optionId: "cola",
          optionName: "Cola",
          priceDelta: 0,
          inventoryProductId: "inv-cola",
          inventoryProductName: "Cola",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
      defaultStatus: "sent",
    });
    const movementPayload = {
      restaurantId: RESTAURANT,
      productId: "inv-cola",
      productName: "Cola",
      source: "modifier_sale",
      type: "modifier_sale",
      orderId: "order-1",
      lineId: "line-1",
      saleProductId: "prod-1",
      saleProductName: "Producto test",
      modifierGroupId: "grp",
      modifierOptionId: "cola",
      modifierOptionName: "Cola",
      quantityDelta: -1,
      unit: "unit",
      idempotencyKey: "movement-1",
      createdAt: 1_700_000_000_000,
      createdBy: "user-1",
      applied: true,
      appliedAt: 1_700_000_000_000,
      sentSegmentLineId: "line-1",
      selectionOccurrence: 0,
      movementFingerprint: "fp-1",
      sentQuantity: 1,
      inventoryQuantityPerUnit: 1,
      stockBefore: 5,
      stockAfter: 4,
    };
    assertNoUndefinedDeep(movementPayload, "stock movement payload");
    assertNoUndefinedDeep(line.selectedModifiers, "selectedModifiers for stock");
  });

  test("12. idempotency record result contains no undefined", () => {
    const payload = buildIdempotencyPayload(RESTAURANT, RESTAURANT, "create_open_order", {
      tableId: "mesa-1",
      lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
    });
    const result = buildIdempotencyResultWithInventoryWarnings(
      { orderId: "order-1", total: 10 },
      [
        {
          orderId: "order-1",
          lineId: "line-1",
          groupId: "grp",
          optionId: "opt",
          reason: "INVALID_CURRENT_STOCK",
          inventoryProductId: "inv-1",
          requestedQuantity: 1,
          unit: "unit",
        },
      ],
    );
    const record = {
      kind: "create_open_order",
      payloadHash: "hash-1",
      result,
      createdAt: FieldValue.serverTimestamp(),
    };
    assertNoUndefinedDeep(payload, "idempotency payload");
    assertNoUndefinedDeep(result, "idempotency result");
    assertNoUndefinedDeep(record, "idempotency record");
  });

  test("collectUndefinedPaths preserves null, 0 and false", () => {
    const sample = {
      nullable: null,
      zero: 0,
      disabled: false,
      empty: "",
      nested: { ok: false },
    };
    assert.deepEqual(collectUndefinedPaths(sample), []);
  });

  test("collectUndefinedPaths does not treat Timestamp or FieldValue as traversable undefined", () => {
    const sample = {
      at: Timestamp.fromMillis(1_700_000_000_000),
      createdAt: FieldValue.serverTimestamp(),
    };
    assert.deepEqual(collectUndefinedPaths(sample), []);
  });
});
