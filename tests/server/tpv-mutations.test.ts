import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseSaleLineIntent, parseUpsertSaleLinesBody, parseTransitionLineQuantityBody, MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  buildTransitionLineQuantityApiRequestBody,
  MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH,
  TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_TOO_LONG,
  TransitionLineQuantityRequestBodyError,
} from "@/lib/firestore/transition-line-quantity-request-body";
import { buildIdempotencyPayload, canonicalSerialize, stablePayloadHash, readInventoryWarningsFromIdempotencyResult, sortInventoryWarningsStable, buildIdempotencyResultWithInventoryWarnings } from "@/lib/server/tpv/tpv-idempotency";
import { tpvMutationJsonOk } from "@/lib/server/tpv/tpv-mutation-response";
import { firestoreItemsToSaleLineIntents } from "@/lib/firestore/firestore-items-to-sale-intent";
import { computeAuthoritativeOrderTotal, buildAuthoritativeSaleLine } from "@/lib/server/tpv/build-authoritative-sale-line";
import { planOrderProjectionWrites } from "@/lib/server/tpv/order-projection";
import {
  applyInitialModifierStockConsumptionInTransaction,
  deriveNewlySentSegments,
  deriveNewlySentUnits,
  validateModifierInventoryProduct,
} from "@/lib/server/tpv/plan-initial-modifier-stock-consumption";
import {
  applyModifierStockReversalInTransaction,
  buildModifierReversalBlockedErrorCode,
  buildModifierReversalOperationIdempotencyKey,
  deriveUnitsToReverse,
  remainingConsumedUnitsAfter,
} from "@/lib/server/tpv/plan-modifier-stock-reversal";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  buildModifierSaleAggregatedReversalFingerprint,
  buildModifierSaleAggregatedReversalV3MovementId,
  buildModifierSaleMovementFingerprint,
  buildModifierSaleV2MovementId,
  MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR,
  MODIFIER_SALE_REVERSAL_SCHEMA_V3,
} from "@/lib/inventory/modifier-sale-movement-identity";
import {
  isAllowedKdsLineStatusTransition,
  isAllowedLineStatusTransition,
} from "@/lib/server/tpv/line-status-transitions";
import { splitLineQuantityForKdsTransition } from "@/lib/server/tpv/line-quantity-split";
import { computeOrderEconomics } from "@/lib/server/tpv/compute-order-economics";
import { DuplicateOrderItemLineError, indexLoadedOrderItems } from "@/lib/server/tpv/order-projection";
import type { ProductDocument } from "@/lib/firestore/products";
import { resolveModifierSelectionsAdmin, parseModifierGroupDocAdmin } from "@/lib/server/tpv/load-tpv-catalog-admin";
import { slugifyModifierOptionId, type ModifierGroupType, type ModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import { resolveCategoryForProduct } from "@/lib/modifiers/cart-order-modifiers";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { Product } from "@/types/product";
describe("tpv mutation DTOs", () => {
  test("rejects client price authority in line intent keys", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: 2,
      price: 0,
    });
    assert.equal("error" in parsed, true);
    if ("error" in parsed) assert.equal(parsed.error, "LINE_UNKNOWN_KEY");
  });

  test("rejects invalid quantity", () => {
    const parsed = parseSaleLineIntent({
      lineId: "l1",
      productId: "p1",
      quantity: -1,
    });
    assert.equal("error" in parsed, true);
  });

  test("rejects unknown top-level upsert key", () => {
    const parsed = parseUpsertSaleLinesBody({
      orderId: "o1",
      lines: [{ lineId: "l1", productId: "p1", quantity: 1 }],
      total: 99,
    });
    assert.equal("error" in parsed, true);
    if ("error" in parsed) assert.equal(parsed.error, "UNKNOWN_KEY");
  });
});

describe("firestoreItemsToSaleLineIntents", () => {
  test("maps carta-like payload without economic fields", () => {
    const intents = firestoreItemsToSaleLineIntents([
      {
        id: "line-1",
        productId: "prod-1",
        quantity: 2,
        price: 0,
        total: 0,
        selectedModifiers: [{ groupId: "g1", optionId: "o1" }],
        note: "sin hielo",
      },
    ]);
    assert.deepEqual(intents, [
      {
        lineId: "line-1",
        productId: "prod-1",
        quantity: 2,
        selectedModifiers: [{ groupId: "g1", optionId: "o1" }],
        note: "sin hielo",
      },
    ]);
  });
});

function collectUndefinedPaths(value: unknown, prefix = ""): string[] {
  if (value === undefined) return prefix ? [prefix] : ["<root>"];
  if (value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUndefinedPaths(item, prefix ? `${prefix}[${index}]` : `[${index}]`),
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectUndefinedPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("buildAuthoritativeSaleLine Firestore serialization", () => {
  test("simple product without modifiers omits modifierTotal and has no undefined values", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-simple", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [],
      defaultStatus: "sent",
    });

    assert.equal(typeof line.id, "string");
    assert.equal(line.productId, "prod-1");
    assert.equal(Object.hasOwn(line, "modifierTotal"), false);
    assert.deepEqual(collectUndefinedPaths(line), []);
  });

  test("product with modifiers keeps modifierTotal without undefined values", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-mod", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "mixer",
          groupName: "Mixer",
          optionId: "cola",
          optionName: "Cola",
          priceDelta: 1.5,
        },
      ],
      defaultStatus: "sent",
    });

    assert.equal(Object.hasOwn(line, "modifierTotal"), true);
    assert.equal(line.modifierTotal, 1.5);
    assert.deepEqual(collectUndefinedPaths(line), []);
  });

  test("absent optional metadata is omitted instead of serialized as undefined", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-meta-absent", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [],
      defaultStatus: "sent",
    });

    assert.equal(Object.hasOwn(line, "categoryName"), false);
    assert.equal(Object.hasOwn(line, "categoria"), false);
    assert.equal(Object.hasOwn(line, "stationId"), false);
    assert.equal(Object.hasOwn(line, "stationName"), false);
    assert.equal(Object.hasOwn(line, "operationStationId"), false);
    assert.equal(Object.hasOwn(line, "operationStationName"), false);
    assert.equal(Object.hasOwn(line, "course"), false);
    assert.deepEqual(collectUndefinedPaths(line), []);
  });

  test("present optional metadata is preserved without undefined values", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-meta-present", productId: "prod-1", quantity: 1 },
      product: baseProduct({
        categoryName: "Entrantes",
        operationStationId: "station-cocina",
        operationStationName: "Cocina",
        course: 0,
      }),
      modifiers: [],
      defaultStatus: "sent",
    });

    assert.equal(line.categoryName, "Entrantes");
    assert.equal(line.categoria, "Entrantes");
    assert.equal(line.stationId, "station-cocina");
    assert.equal(line.operationStationId, "station-cocina");
    assert.equal(line.stationName, "Cocina");
    assert.equal(line.operationStationName, "Cocina");
    assert.equal(line.course, 0);
    assert.deepEqual(collectUndefinedPaths(line), []);
  });
});

describe("authoritative totals", () => {
  test("computeAuthoritativeOrderTotal skips cancelled lines", () => {
    const total = computeAuthoritativeOrderTotal([
      { id: "a", status: "sent", quantity: 2, price: 5, total: 10 },
      { id: "b", status: "cancelled", quantity: 1, price: 100, total: 100 },
    ]);
    assert.equal(total, 10);
  });

  test("computeAuthoritativeOrderTotal skips comped lines", () => {
    const total = computeAuthoritativeOrderTotal([
      { id: "a", status: "sent", quantity: 1, price: 10, total: 10 },
      { id: "b", status: "sent", quantity: 1, price: 20, total: 20, isComped: true },
    ]);
    assert.equal(total, 10);
  });
});

describe("kds transitions", () => {
  test("allows sent to prepared", () => {
    assert.equal(isAllowedKdsLineStatusTransition("sent", "prepared"), true);
    assert.equal(isAllowedLineStatusTransition("sent", "prepared"), true);
  });
  test("denies served to pending", () => {
    assert.equal(isAllowedKdsLineStatusTransition("served", "pending"), false);
  });
  test("denies kds cancel", () => {
    assert.equal(isAllowedKdsLineStatusTransition("sent", "cancelled"), false);
  });
});

describe("kds quantity split", () => {
  test("splits quantity 3 preparing 1 unit", () => {
    const now = 1_700_000_000_000;
    const split = splitLineQuantityForKdsTransition(
      [{ id: "line-1", status: "sent", quantity: 3, total: 30, price: 10 }],
      "line-1",
      1,
      "prepared",
      now,
      "line-1-adv",
    );
    assert.equal("error" in split, false);
    if ("error" in split) return;
    assert.equal(split.advancedLineId, "line-1-adv");
    const remainder = split.items.find((l) => l.id === "line-1");
    const advanced = split.items.find((l) => l.id === "line-1-adv");
    assert.equal(remainder?.quantity, 2);
    assert.equal(advanced?.quantity, 1);
    assert.equal(advanced?.status, "prepared");
    const sum = Number(remainder?.total) + Number(advanced?.total);
    assert.equal(sum, 30);
  });
});

describe("order economics", () => {
  test("fixed discount capped at subtotal", () => {
    const e = computeOrderEconomics({ discountAmount: 200 }, [
      { id: "a", status: "sent", quantity: 1, price: 50, total: 50 },
    ]);
    assert.equal(e.finalTotal, 0);
  });
});

describe("transition quantity DTO", () => {
  const validBody = {
    orderId: "o1",
    lineId: "l1",
    units: 1,
    expectedStatus: "sent",
    nextStatus: "prepared",
    idempotencyKey: "transition-qty:gesture-1",
  } as const;

  test("parses valid body with required idempotencyKey", () => {
    const parsed = parseTransitionLineQuantityBody(validBody);
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.idempotencyKey, validBody.idempotencyKey);
  });

  test("trims explicit idempotencyKey", () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: " clave-valida ",
    });
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.idempotencyKey, "clave-valida");
  });

  test("rejects absent idempotencyKey", () => {
    const parsed = parseTransitionLineQuantityBody({
      orderId: validBody.orderId,
      lineId: validBody.lineId,
      units: validBody.units,
      expectedStatus: validBody.expectedStatus,
      nextStatus: validBody.nextStatus,
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test("rejects null idempotencyKey", () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: null,
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test("rejects non-string idempotencyKey", () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: 123,
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test('rejects empty idempotencyKey ""', () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: "",
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test('rejects whitespace-only idempotencyKey " "', () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: " ",
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test("rejects idempotencyKey longer than 128 characters", () => {
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey: "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1),
    });
    assert.equal("error" in parsed, true);
    if (!("error" in parsed)) return;
    assert.equal(parsed.error, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test("accepts idempotencyKey of exactly 128 characters", () => {
    const idempotencyKey = "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH);
    const parsed = parseTransitionLineQuantityBody({
      ...validBody,
      idempotencyKey,
    });
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.idempotencyKey, idempotencyKey);
  });
});

describe("transitionLineQuantityViaApi request body", () => {
  const baseParams = {
    orderId: "order-1",
    lineId: "line-1",
    units: 1,
    expectedStatus: "sent",
    nextStatus: "preparing",
  } as const;

  function expectValidGeneratedKey(key: unknown) {
    assert.equal(typeof key, "string");
    const idempotencyKey = key as string;
    assert.match(idempotencyKey, /^transition-qty:.+$/);
    assert.ok(idempotencyKey.length >= 1);
    assert.ok(idempotencyKey.length <= MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH);
  }

  function expectTooLongError(fn: () => unknown) {
    assert.throws(fn, (error: unknown) => {
      assert.ok(error instanceof TransitionLineQuantityRequestBodyError);
      assert.equal(error.code, TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_TOO_LONG);
      return true;
    });
  }

  test("idempotencyKey undefined generates a valid key", () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({ ...baseParams });
    expectValidGeneratedKey(body.idempotencyKey);
  });

  test('idempotencyKey "" generates a valid key', () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      idempotencyKey: "",
    });
    expectValidGeneratedKey(body.idempotencyKey);
  });

  test('idempotencyKey " " generates a valid key', () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      idempotencyKey: " ",
    });
    expectValidGeneratedKey(body.idempotencyKey);
  });

  test("explicit idempotencyKey trims surrounding spaces", () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      idempotencyKey: " clave-valida ",
    });
    assert.equal(body.idempotencyKey, "clave-valida");
  });

  test("explicit idempotencyKey of 128 characters is accepted", () => {
    const explicitKey = "k".repeat(MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH);
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      idempotencyKey: explicitKey,
    });
    assert.equal(body.idempotencyKey, explicitKey);
    assert.equal((body.idempotencyKey as string).length, 128);
  });

  test("explicit idempotencyKey of 129 characters fails locally", () => {
    const explicitKey = "k".repeat(MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH + 1);
    expectTooLongError(() =>
      buildTransitionLineQuantityApiRequestBody({
        ...baseParams,
        idempotencyKey: explicitKey,
      }),
    );
  });

  test("empty operationId resolves to UUID and valid generated key", () => {
    const { body, operationId } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "",
    });
    assert.match(operationId, /^[0-9a-f-]{36}$/i);
    assert.equal(body.idempotencyKey, `transition-qty:${operationId}`);
    expectValidGeneratedKey(body.idempotencyKey);
  });

  test("operationId trims surrounding spaces in generated key", () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: " gesture-op ",
    });
    assert.equal(body.idempotencyKey, "transition-qty:gesture-op");
  });

  test("operationId that exceeds 128 characters fails locally", () => {
    const longOperationId = "o".repeat(MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH);
    expectTooLongError(() =>
      buildTransitionLineQuantityApiRequestBody({
        ...baseParams,
        operationId: longOperationId,
      }),
    );
  });

  test("same operationId yields same idempotencyKey", () => {
    const first = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "stable-gesture",
    });
    const second = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "stable-gesture",
    });
    assert.equal(first.body.idempotencyKey, second.body.idempotencyKey);
    assert.equal(first.body.idempotencyKey, "transition-qty:stable-gesture");
  });

  test("different operationId yields different idempotencyKey", () => {
    const first = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-a",
    });
    const second = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-b",
    });
    assert.notEqual(first.body.idempotencyKey, second.body.idempotencyKey);
  });

  test("two legitimate identical gestures do not share idempotencyKey by default", () => {
    const first = buildTransitionLineQuantityApiRequestBody({ ...baseParams });
    const second = buildTransitionLineQuantityApiRequestBody({ ...baseParams });
    assert.notEqual(first.operationId, second.operationId);
    assert.notEqual(first.body.idempotencyKey, second.body.idempotencyKey);
  });

  test("serialized body does not contain operationId", () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-op-1",
    });
    assert.equal("operationId" in body, false);
    assert.equal(JSON.stringify(body).includes('"operationId"'), false);
  });

  test("body passes parseTransitionLineQuantityBody without UNKNOWN_KEY", () => {
    const { body } = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-op-2",
      expectedUpdatedAtMs: 1_700_000_000_000,
    });
    const parsed = parseTransitionLineQuantityBody(body);
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    assert.equal(parsed.orderId, baseParams.orderId);
    assert.equal(parsed.lineId, baseParams.lineId);
    assert.equal(parsed.units, baseParams.units);
    assert.equal(typeof parsed.idempotencyKey, "string");
    assert.ok((parsed.idempotencyKey ?? "").length >= 1);
  });

  test("same idempotencyKey with different payload keeps server-side conflict semantics", () => {
    const sharedKey = "transition-qty:manual-key";
    const hashA = stablePayloadHash(
      buildIdempotencyPayload("uid-1", "rest-1", "transition_line_quantity", {
        orderId: baseParams.orderId,
        lineId: baseParams.lineId,
        units: 1,
        expectedStatus: baseParams.expectedStatus,
        nextStatus: baseParams.nextStatus,
      }),
    );
    const hashB = stablePayloadHash(
      buildIdempotencyPayload("uid-1", "rest-1", "transition_line_quantity", {
        orderId: baseParams.orderId,
        lineId: baseParams.lineId,
        units: 2,
        expectedStatus: baseParams.expectedStatus,
        nextStatus: baseParams.nextStatus,
      }),
    );
    assert.notEqual(hashA, hashB);
    const bodyA = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      idempotencyKey: sharedKey,
    }).body;
    const bodyB = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      units: 2,
      idempotencyKey: sharedKey,
    }).body;
    assert.equal(bodyA.idempotencyKey, sharedKey);
    assert.equal(bodyB.idempotencyKey, sharedKey);
    assert.notEqual(bodyA.units, bodyB.units);
  });

  test("explicit idempotencyKey bypasses operationId for key material", () => {
    const explicitKey = "transition-qty:explicit";
    const first = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-one",
      idempotencyKey: explicitKey,
    });
    const second = buildTransitionLineQuantityApiRequestBody({
      ...baseParams,
      operationId: "gesture-two",
      idempotencyKey: explicitKey,
    });
    assert.equal(first.body.idempotencyKey, explicitKey);
    assert.equal(second.body.idempotencyKey, explicitKey);
  });
});

describe("canonical idempotency hash", () => {
  test("nested objects with sorted keys produce stable hash", () => {
    const a = stablePayloadHash({
      orderId: "o1",
      lines: [{ lineId: "l1", modifiers: [{ groupId: "g1", optionId: "o1" }] }],
    });
    const b = stablePayloadHash({
      lines: [{ modifiers: [{ optionId: "o1", groupId: "g1" }], lineId: "l1" }],
      orderId: "o1",
    });
    assert.equal(a, b);
  });

  test("different nested payload changes hash", () => {
    const a = stablePayloadHash({ orderId: "o1", amount: 10 });
    const b = stablePayloadHash({ orderId: "o1", amount: 11 });
    assert.notEqual(a, b);
  });

  test("rejects non-finite numbers", () => {
    assert.throws(() => canonicalSerialize(Number.NaN));
  });
});

describe("order projection duplicates", () => {
  test("indexLoadedOrderItems throws on duplicate lineId", () => {
    const docs = [
      { id: "d1", data: () => ({ lineId: "line-1" }) },
      { id: "d2", data: () => ({ lineId: "line-1" }) },
    ];
    assert.throws(
      () =>
        indexLoadedOrderItems({
          docs,
        } as never),
      (err: unknown) => err instanceof DuplicateOrderItemLineError,
    );
  });
});

const TPV_TEST_RESTAURANT = "rest-mod-test";

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

function modifierGroupDoc(
  name: string,
  options: Array<
    {
      id?: string;
      name: string;
      priceDelta?: number;
      active?: boolean;
    } & Record<string, unknown>
  >,
  rules?: {
    required?: boolean;
    minSelected?: number;
    maxSelected?: number;
    active?: boolean;
    type?: ModifierGroupType;
  },
): Record<string, unknown> {
  return {
    name,
    type: rules?.type ?? "custom",
    active: rules?.active !== false,
    required: rules?.required === true,
    minSelected: rules?.minSelected,
    maxSelected: rules?.maxSelected,
    options: options.map((option, index) => {
      const { id, name, priceDelta, active, ...rest } = option;
      return {
        ...(id !== undefined ? { id } : {}),
        name,
        priceDelta: priceDelta ?? 0,
        active: active !== false,
        sortOrder: index,
        ...rest,
      };
    }),
  };
}

function createModifierCatalogFirestoreMock(params: {
  canonicalCategories?: Record<string, Record<string, unknown>>;
  englishShadowCategories?: Record<string, Record<string, unknown>>;
  modifierGroups?: Record<string, Record<string, unknown>>;
  restaurantId?: string;
}): Firestore {
  const restaurantId = params.restaurantId ?? TPV_TEST_RESTAURANT;
  const canonicalCategories = params.canonicalCategories ?? {};
  const englishShadowCategories = params.englishShadowCategories ?? {};
  const modifierGroups = params.modifierGroups ?? {};

  function readCollection(
    root: string,
    restId: string,
    sub: string,
    docId: string,
  ): Record<string, unknown> | undefined {
    if (restId !== restaurantId) return undefined;
    if (sub === "cartaCategorias") {
      if (root === "restaurantes") return canonicalCategories[docId];
      if (root === "restaurants") return englishShadowCategories[docId];
      return undefined;
    }
    if (sub === "modifierGroups" && root === "restaurants") {
      return modifierGroups[docId];
    }
    return undefined;
  }

  return {
    collection(root: string) {
      return {
        doc(restId: string) {
          return {
            collection(sub: string) {
              return {
                doc(docId: string) {
                  return {
                    async get() {
                      const data = readCollection(root, restId, sub, docId);
                      if (!data) {
                        return { exists: false, id: docId, data: () => undefined };
                      }
                      return { exists: true, id: docId, data: () => data };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Firestore;
}

describe("resolveModifierSelectionsAdmin operational modifier set", () => {
  test("1. categoría canónica española heredada → aceptada", async () => {
    const db = createModifierCatalogFirestoreMock({
      canonicalCategories: {
        "cat-1": { isActive: true, modifierGroupIds: ["inherited"] },
      },
      modifierGroups: {
        inherited: modifierGroupDoc("Heredado", [{ id: "opt-h", name: "H", priceDelta: 0 }]),
      },
    });
    const product = baseProduct({ categoryId: "cat-1" });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "inherited", optionId: "opt-h" },
    ]);
    assert.equal("error" in result, false);
  });

  test("2. documento distinto en raíz inglesa → se ignora completamente", async () => {
    const db = createModifierCatalogFirestoreMock({
      canonicalCategories: {
        "cat-1": { isActive: true, modifierGroupIds: ["canonical"] },
      },
      englishShadowCategories: {
        "cat-1": { isActive: true, modifierGroupIds: ["shadow"] },
      },
      modifierGroups: {
        canonical: modifierGroupDoc("Canónico", [{ id: "opt-c", name: "C", priceDelta: 0 }]),
        shadow: modifierGroupDoc("Shadow", [{ id: "opt-s", name: "S", priceDelta: 0 }]),
      },
    });
    const product = baseProduct({ categoryId: "cat-1" });
    const ok = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "canonical", optionId: "opt-c" },
    ]);
    assert.equal("error" in ok, false);
    const shadowDenied = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "shadow", optionId: "opt-s" },
    ]);
    assert.deepEqual(shadowDenied, { error: "MODIFIER_GROUP_NOT_ALLOWED" });
  });

  test("3. grupo inactivo no seleccionado → venta aceptada", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        inactiveGroup: modifierGroupDoc(
          "Off",
          [{ id: "opt-1", name: "O", priceDelta: 0 }],
          { active: false },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["inactiveGroup"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.deepEqual(result, []);
  });

  test("4. grupo inactivo seleccionado → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        inactiveGroup: modifierGroupDoc(
          "Off",
          [{ id: "opt-1", name: "O", priceDelta: 0 }],
          { active: false },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["inactiveGroup"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "inactiveGroup", optionId: "opt-1" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_GROUP_INACTIVE" });
  });

  test("5. grupo inexistente no seleccionado → venta aceptada", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        live: modifierGroupDoc("Live", [{ id: "opt-live", name: "Live", priceDelta: 0 }]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["missing", "live"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "live", optionId: "opt-live" },
    ]);
    assert.equal("error" in result, false);
  });

  test("6. grupo inexistente seleccionado → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        live: modifierGroupDoc("Live", [{ id: "opt-live", name: "Live", priceDelta: 0 }]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["missing", "live"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "missing", optionId: "opt-x" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_GROUP_NOT_FOUND" });
  });

  test("7. grupo activo sin opciones activas, optional → ignorado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        emptyOptional: modifierGroupDoc(
          "Vacío",
          [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
          { required: false },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["emptyOptional"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
  });

  test("8. grupo activo sin opciones activas, required → ignorado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        emptyRequired: modifierGroupDoc(
          "Vacío req",
          [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
          { required: true },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["emptyRequired"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
  });

  test("9. grupo activo sin opciones activas, min > 0 → ignorado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        emptyMin: modifierGroupDoc(
          "Vacío min",
          [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
          { minSelected: 1 },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["emptyMin"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
  });

  test("10. grupo vacío seleccionado → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        emptyOptional: modifierGroupDoc(
          "Vacío",
          [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["emptyOptional"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "emptyOptional", optionId: "opt-dead" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_OPTION_NOT_FOUND" });
  });

  test("11. grupo con opciones activas e inactivas → activa aceptada, inactiva rechazada", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        mixed: modifierGroupDoc("Mix", [
          { id: "opt-live", name: "Live", priceDelta: 1.5 },
          { id: "opt-dead", name: "Dead", priceDelta: 0, active: false },
        ]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["mixed"] });
    const ok = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "mixed", optionId: "opt-live" },
    ]);
    assert.equal("error" in ok, false);
    if ("error" in ok) return;
    assert.equal(ok[0]?.priceDelta, 1.5);
    const denied = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "mixed", optionId: "opt-dead" },
    ]);
    assert.deepEqual(denied, { error: "MODIFIER_OPTION_NOT_FOUND" });
  });

  test("12. grupo operativo required omitido → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        req: modifierGroupDoc(
          "Obligatorio",
          [{ id: "opt-r", name: "R", priceDelta: 0 }],
          { required: true },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["req"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.deepEqual(result, { error: "MODIFIER_GROUP_REQUIRED" });
  });

  test("13. propio + heredado operativos → ambos validados", async () => {
    const db = createModifierCatalogFirestoreMock({
      canonicalCategories: {
        "cat-1": { isActive: true, modifierGroupIds: ["inherited"] },
      },
      modifierGroups: {
        inherited: modifierGroupDoc("Cat", [{ id: "opt-c", name: "C", priceDelta: 0 }]),
        own: modifierGroupDoc("Prod", [{ id: "opt-p", name: "P", priceDelta: 2 }]),
      },
    });
    const product = baseProduct({ categoryId: "cat-1", modifierGroupIds: ["own"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "inherited", optionId: "opt-c" },
      { groupId: "own", optionId: "opt-p" },
    ]);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result.length, 2);
  });

  test("14. categoría ausente/inactiva → conserva grupos propios", async () => {
    const db = createModifierCatalogFirestoreMock({
      canonicalCategories: {
        "cat-off": { isActive: false, modifierGroupIds: ["inherited"] },
      },
      modifierGroups: {
        own: modifierGroupDoc("Propio", [{ id: "opt-o", name: "O", priceDelta: 0 }]),
      },
    });
    const missing = baseProduct({ categoryId: "missing", modifierGroupIds: ["own"] });
    const inactive = baseProduct({ categoryId: "cat-off", modifierGroupIds: ["own"] });
    for (const product of [missing, inactive]) {
      const inheritedDenied = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
        { groupId: "inherited", optionId: "opt-x" },
      ]);
      assert.deepEqual(inheritedDenied, { error: "MODIFIER_GROUP_NOT_ALLOWED" });
      const ownOk = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
        { groupId: "own", optionId: "opt-o" },
      ]);
      assert.equal("error" in ownOk, false);
    }
  });
});

describe("parseModifierGroupDocAdmin client/server parser parity", () => {
  function readFiniteNumberWithFallback(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return value;
  }

  function clampSelectionCount(value: number, min = 0, max = 99): number {
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  function expectedClientLimits(raw: Record<string, unknown>) {
    const minSelected = clampSelectionCount(readFiniteNumberWithFallback(raw.minSelected, 0));
    const maxSelected = clampSelectionCount(
      readFiniteNumberWithFallback(raw.maxSelected, 1),
      0,
      99,
    );
    return { minSelected, maxSelected: Math.max(minSelected, maxSelected) };
  }

  test("contractual matrix: admin parser matches client normalization contract", () => {
    const matrix: Record<string, Record<string, unknown>> = {
      valid: modifierGroupDoc("Extra", [{ id: "opt-a", name: "A", priceDelta: 1.234 }], {
        type: "addon",
      }),
      "no-type": { name: "Sin tipo", options: [{ id: "x", name: "X" }] },
      "bad-type": {
        name: "Tipo inválido",
        type: "single",
        options: [{ id: "x", name: "X" }],
      },
      "legacy-id": modifierGroupDoc("Extra", [{ name: "Café con leche!" }]),
      limits: modifierGroupDoc(
        "Limites",
        [{ id: "o1", name: "Uno" }, { id: "o2", name: "Dos" }],
        { minSelected: -2.7, maxSelected: 150.9 },
      ),
      "invalid-price": modifierGroupDoc("Precio", [{ id: "p", name: "P", priceDelta: Number.NaN }]),
    };
    for (const [groupId, raw] of Object.entries(matrix)) {
      const server = parseModifierGroupDocAdmin(groupId, raw, TPV_TEST_RESTAURANT);
      const type = raw.type;
      const validType =
        type === "format" || type === "mixer" || type === "addon" || type === "custom";
      if (!validType) {
        assert.equal(server, null);
        continue;
      }
      assert.notEqual(server, null);
      if (!server) continue;
      const limits = expectedClientLimits(raw);
      assert.equal(server.minSelected, limits.minSelected);
      assert.equal(server.maxSelected, limits.maxSelected);
    }
  });

  test("1. grupo con type válido → operativo", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        validType: modifierGroupDoc("Formato", [{ id: "opt-f", name: "F", priceDelta: 0 }], {
          type: "format",
        }),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["validType"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "validType", optionId: "opt-f" },
    ]);
    assert.equal("error" in result, false);
  });

  test("2. type ausente, sin selección → ignorado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        noType: { name: "Sin tipo", options: [{ id: "x", name: "X", priceDelta: 0, active: true }] },
      },
    });
    const product = baseProduct({ modifierGroupIds: ["noType"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.deepEqual(result, []);
  });

  test("3. type ausente, con selección → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        noType: { name: "Sin tipo", options: [{ id: "x", name: "X", priceDelta: 0, active: true }] },
      },
    });
    const product = baseProduct({ modifierGroupIds: ["noType"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "noType", optionId: "x" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_GROUP_NOT_FOUND" });
  });

  test("4. type inválido, sin selección → ignorado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        badType: {
          name: "Legacy single",
          type: "single",
          options: [{ id: "x", name: "X", priceDelta: 0, active: true }],
        },
      },
    });
    const product = baseProduct({ modifierGroupIds: ["badType"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
  });

  test("5. type inválido, con selección → rechazado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        badType: {
          name: "Legacy single",
          type: "single",
          options: [{ id: "x", name: "X", priceDelta: 0, active: true }],
        },
      },
    });
    const product = baseProduct({ modifierGroupIds: ["badType"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "badType", optionId: "x" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_GROUP_NOT_FOUND" });
  });

  test("6. maxSelected ausente → mismo máximo que cliente (1)", () => {
    const raw = modifierGroupDoc(
      "Single default",
      [{ id: "o1", name: "Uno" }, { id: "o2", name: "Dos" }],
    );
    const parsed = parseModifierGroupDocAdmin("g1", raw, TPV_TEST_RESTAURANT);
    assert.notEqual(parsed, null);
    if (!parsed) return;
    assert.equal(parsed.maxSelected, 1);
  });

  test("7. dos selecciones cuando el máximo canónico es uno → rechazadas", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        singleDefault: modifierGroupDoc(
          "Single default",
          [{ id: "o1", name: "Uno" }, { id: "o2", name: "Dos" }],
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["singleDefault"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "singleDefault", optionId: "o1" },
      { groupId: "singleDefault", optionId: "o2" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_MAX_EXCEEDED" });
  });

  test("8. min/max válidos → conservados", () => {
    const raw = modifierGroupDoc(
      "Rango",
      [{ id: "o1", name: "Uno" }, { id: "o2", name: "Dos" }, { id: "o3", name: "Tres" }],
      { minSelected: 2, maxSelected: 3 },
    );
    const parsed = parseModifierGroupDocAdmin("g-range", raw, TPV_TEST_RESTAURANT);
    assert.notEqual(parsed, null);
    if (!parsed) return;
    assert.equal(parsed.minSelected, 2);
    assert.equal(parsed.maxSelected, 3);
  });

  test("9. min/max inválidos o fuera de rango → misma normalización que cliente", () => {
    const raw = modifierGroupDoc(
      "Clamp",
      [{ id: "o1", name: "Uno" }],
      { minSelected: -2.7, maxSelected: 150.9 },
    );
    const server = parseModifierGroupDocAdmin("g-clamp", raw, TPV_TEST_RESTAURANT);
    const expected = expectedClientLimits(raw);
    assert.notEqual(server, null);
    if (!server) return;
    assert.equal(server.minSelected, expected.minSelected);
    assert.equal(server.maxSelected, expected.maxSelected);
  });

  test("10. opción legacy sin ID → mismo ID generado por cliente y servidor", () => {
    const raw = modifierGroupDoc("Extra", [{ name: "Café con leche!" }]);
    const legacyId = slugifyModifierOptionId("Café con leche!");
    const server = parseModifierGroupDocAdmin("legacy", raw, TPV_TEST_RESTAURANT);
    assert.notEqual(server, null);
    if (!server) return;
    assert.equal(server.options[0]?.id, legacyId);
  });

  test("11. nombre con espacios, mayúsculas, acentos y símbolos → mismo ID", () => {
    const name = "  Té  Especial  (XL)  ";
    const raw = modifierGroupDoc("Grupo", [{ name }]);
    const expectedId = slugifyModifierOptionId(name.trim());
    const server = parseModifierGroupDocAdmin("accent", raw, TPV_TEST_RESTAURANT);
    assert.equal(server?.options[0]?.id, expectedId);
  });

  test("12. opción inactiva → rechazada", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        inactiveOpt: modifierGroupDoc("Mix", [
          { id: "live", name: "Live", priceDelta: 0 },
          { id: "dead", name: "Dead", priceDelta: 0, active: false },
        ]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["inactiveOpt"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "inactiveOpt", optionId: "dead" },
    ]);
    assert.deepEqual(result, { error: "MODIFIER_OPTION_NOT_FOUND" });
  });

  test("13. grupo sin opciones activas → conserva comportamiento ya aceptado", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        emptyRequired: modifierGroupDoc(
          "Vacío req",
          [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
          { required: true, type: "custom" },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["emptyRequired"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, []);
    assert.equal("error" in result, false);
  });

  test("14. priceDelta válido → reconstruido desde Firestore", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        priced: modifierGroupDoc("Precio", [{ id: "opt-p", name: "P", priceDelta: 2.345 }]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["priced"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "priced", optionId: "opt-p" },
    ]);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result[0]?.priceDelta, 2.35);
  });

  test("15. priceDelta inválido → misma normalización segura que cliente", () => {
    const raw = modifierGroupDoc("Precio", [{ id: "p", name: "P", priceDelta: Number.NaN }]);
    const server = parseModifierGroupDocAdmin("bad-price", raw, TPV_TEST_RESTAURANT);
    assert.equal(server?.options[0]?.priceDelta, 0);
  });
});

function inventoryOption(
  id: string,
  name: string,
  inventory: Record<string, unknown>,
  priceDelta = 0,
): { id: string; name: string; priceDelta: number; active: boolean } & Record<string, unknown> {
  return {
    id,
    name,
    priceDelta,
    active: true,
    ...inventory,
  };
}

function completeInventoryFields(productId: string, name = "Coca-Cola") {
  return {
    inventoryProductId: productId,
    inventoryProductName: name,
    inventoryQuantity: 1,
    inventoryUnit: "unit" as ModifierInventoryUnit,
  };
}

describe("selectedModifiers inventory metadata persistence", () => {
  test("1. grupo propio con opción de inventario completa", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        mixer: modifierGroupDoc(
          "Mixer",
          [inventoryOption("cola", "Cola", completeInventoryFields("inv-cola"), 1.5)],
          { type: "mixer" },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["mixer"] });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "mixer", optionId: "cola" },
    ]);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result[0]?.inventoryProductId, "inv-cola");
    assert.equal(result[0]?.inventoryProductName, "Coca-Cola");
    assert.equal(result[0]?.inventoryQuantity, 1);
    assert.equal(result[0]?.inventoryUnit, "unit");
  });

  test("2. grupo heredado con opción de inventario completa", async () => {
    const db = createModifierCatalogFirestoreMock({
      canonicalCategories: {
        "cat-drink": { isActive: true, modifierGroupIds: ["inherited-mixer"] },
      },
      modifierGroups: {
        "inherited-mixer": modifierGroupDoc(
          "Mixer cat",
          [inventoryOption("tonica", "Tónica", completeInventoryFields("inv-tonic", "Tónica"))],
          { type: "mixer" },
        ),
      },
    });
    const product = baseProduct({ categoryId: "cat-drink" });
    const result = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "inherited-mixer", optionId: "tonica" },
    ]);
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result[0]?.inventoryProductId, "inv-tonic");
    assert.equal(result[0]?.inventoryQuantity, 1);
  });

  test("3. persistencia de los cuatro campos en orders.items[].selectedModifiers", () => {
    const line = buildAuthoritativeSaleLine({
      intent: {
        lineId: "line-1",
        productId: "prod-1",
        quantity: 1,
        selectedModifiers: [{ groupId: "mixer", optionId: "cola" }],
      },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "mixer",
          groupName: "Mixer",
          optionId: "cola",
          optionName: "Cola",
          priceDelta: 1.5,
          ...completeInventoryFields("inv-cola"),
        },
      ],
      defaultStatus: "sent",
    });
    const mods = line.selectedModifiers as Array<Record<string, unknown>>;
    assert.equal(mods[0]?.inventoryProductId, "inv-cola");
    assert.equal(mods[0]?.inventoryProductName, "Coca-Cola");
    assert.equal(mods[0]?.inventoryQuantity, 1);
    assert.equal(mods[0]?.inventoryUnit, "unit");
  });

  test("4. persistencia en proyección orderItems", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "mixer",
          groupName: "Mixer",
          optionId: "cola",
          optionName: "Cola",
          priceDelta: 0,
          ...completeInventoryFields("inv-cola"),
        },
      ],
      defaultStatus: "sent",
    });
    const sentLine = { ...line, status: "sent" };
    const mockDb = {
      collection() {
        return { doc: () => ({ id: "order-item-1" }) };
      },
    } as unknown as Firestore;
    const plan = planOrderProjectionWrites(
      mockDb,
      {
        restaurantId: TPV_TEST_RESTAURANT,
        orderId: "order-1",
        tableId: "mesa-1",
        tableName: "Mesa 1",
      },
      [sentLine],
      { byLineId: new Map(), byDocId: new Map(), allRefs: [] },
      1_700_000_000_000,
    );
    const payload = plan.writes[0]?.payload;
    const mods = payload?.selectedModifiers as Array<Record<string, unknown>> | undefined;
    assert.equal(mods?.[0]?.inventoryProductId, "inv-cola");
    assert.equal(mods?.[0]?.inventoryUnit, "unit");
  });

  test("5. priceDelta permanece autoritativo", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        addon: modifierGroupDoc(
          "Extra",
          [inventoryOption("extra", "Extra", completeInventoryFields("inv-extra"), 2.75)],
          { type: "addon" },
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["addon"] });
    const resolved = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "addon", optionId: "extra" },
    ]);
    assert.equal("error" in resolved, false);
    if ("error" in resolved) return;
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product,
      modifiers: resolved,
      defaultStatus: "sent",
    });
    const mods = line.selectedModifiers as Array<Record<string, unknown>>;
    assert.equal(mods[0]?.priceDelta, 2.75);
    assert.equal(line.price, 10);
    assert.equal(line.total, 12.75);
  });

  test("6. línea quantity > 1 conserva consumo por unidad sin multiplicarlo", () => {
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 3 },
      product: baseProduct(),
      modifiers: [
        {
          groupId: "mixer",
          groupName: "Mixer",
          optionId: "cola",
          optionName: "Cola",
          priceDelta: 0,
          ...completeInventoryFields("inv-cola"),
        },
      ],
      defaultStatus: "sent",
    });
    assert.equal(line.quantity, 3);
    const mods = line.selectedModifiers as Array<Record<string, unknown>>;
    assert.equal(mods[0]?.inventoryQuantity, 1);
  });

  test("7. opción sin vínculo de inventario no añade campos", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        plain: modifierGroupDoc("Plain", [{ id: "opt", name: "Opt", priceDelta: 0 }]),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["plain"] });
    const resolved = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "plain", optionId: "opt" },
    ]);
    assert.equal("error" in resolved, false);
    if ("error" in resolved) return;
    assert.equal(resolved[0]?.inventoryProductId, undefined);
    const line = buildAuthoritativeSaleLine({
      intent: { lineId: "line-1", productId: "prod-1", quantity: 1 },
      product,
      modifiers: resolved,
    });
    const mods = line.selectedModifiers as Array<Record<string, unknown>>;
    assert.equal(mods[0]?.inventoryProductId, undefined);
    assert.equal(mods[0]?.inventoryQuantity, undefined);
  });

  test("8. ID con cantidad inválida no inventa consumo", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        partialQty: modifierGroupDoc(
          "Partial qty",
          [
            inventoryOption("bad-qty", "Bad qty", {
              inventoryProductId: "inv-only-id",
              inventoryProductName: "Solo ID",
              inventoryQuantity: 0,
              inventoryUnit: "unit",
            }),
          ],
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["partialQty"] });
    const resolved = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "partialQty", optionId: "bad-qty" },
    ]);
    assert.equal("error" in resolved, false);
    if ("error" in resolved) return;
    assert.equal(resolved[0]?.inventoryProductId, "inv-only-id");
    assert.equal(resolved[0]?.inventoryProductName, "Solo ID");
    assert.equal(resolved[0]?.inventoryQuantity, undefined);
    assert.equal(resolved[0]?.inventoryUnit, undefined);
  });

  test("9. unidad inválida no se persiste como válida", async () => {
    const db = createModifierCatalogFirestoreMock({
      modifierGroups: {
        badUnit: modifierGroupDoc(
          "Bad unit",
          [
            inventoryOption("bad-unit", "Bad unit", {
              inventoryProductId: "inv-bad-unit",
              inventoryQuantity: 2,
              inventoryUnit: "litros",
            }),
          ],
        ),
      },
    });
    const product = baseProduct({ modifierGroupIds: ["badUnit"] });
    const resolved = await resolveModifierSelectionsAdmin(db, TPV_TEST_RESTAURANT, product, [
      { groupId: "badUnit", optionId: "bad-unit" },
    ]);
    assert.equal("error" in resolved, false);
    if ("error" in resolved) return;
    assert.equal(resolved[0]?.inventoryProductId, "inv-bad-unit");
    assert.equal(resolved[0]?.inventoryQuantity, undefined);
    assert.equal(resolved[0]?.inventoryUnit, undefined);
  });

  test("10. el DTO sigue rechazando campos de inventario enviados por cliente", () => {
    const parsed = parseSaleLineIntent({
      lineId: "line-1",
      productId: "prod-1",
      quantity: 1,
      selectedModifiers: [
        {
          groupId: "g1",
          optionId: "o1",
          inventoryProductId: "inv-client",
          inventoryQuantity: 99,
        },
      ],
    });
    assert.equal("error" in parsed, true);
    if ("error" in parsed) assert.equal(parsed.error, "MODIFIER_UNKNOWN_KEY");
  });
});

describe("initial modifier stock consumption event derivation", () => {
  test("pending → sent consume full quantity", () => {
    assert.equal(
      deriveNewlySentUnits(
        { id: "l1", status: "pending", quantity: 3 },
        { id: "l1", status: "sent", quantity: 3 },
      ),
      3,
    );
  });

  test("new sent line without before consumes quantity", () => {
    assert.equal(
      deriveNewlySentUnits(undefined, { id: "l-new", status: "sent", quantity: 1 }),
      1,
    );
  });

  test("sent retry produces zero", () => {
    assert.equal(
      deriveNewlySentUnits(
        { id: "l1", status: "sent", quantity: 2 },
        { id: "l1", status: "sent", quantity: 2 },
      ),
      0,
    );
  });

  test("sent → preparing produces zero", () => {
    assert.equal(
      deriveNewlySentUnits(
        { id: "l1", status: "sent", quantity: 2 },
        { id: "l1", status: "preparing", quantity: 2 },
      ),
      0,
    );
  });

  test("v2 movement id differs by modifierGroupId with same optionId", () => {
    const base = {
      restaurantId: TPV_TEST_RESTAURANT,
      orderId: "order-1",
      sentSegmentLineId: "line-1",
      modifierOptionId: "opt-shared",
      inventoryProductId: "inv-1",
      selectionOccurrence: 0,
    };
    const a = buildModifierSaleV2MovementId({ ...base, modifierGroupId: "grp-a" });
    const b = buildModifierSaleV2MovementId({ ...base, modifierGroupId: "grp-b" });
    assert.notEqual(a, b);
    assert.match(a, /^modifier_sale_v2_/);
  });

  test("fingerprint distinto para misma tupla con distinta cantidad", () => {
    const a = buildModifierSaleMovementFingerprint({
      sentQuantity: 1,
      inventoryQuantityPerUnit: 1,
      inventoryUnit: "unit",
      quantityDelta: -1,
    });
    const b = buildModifierSaleMovementFingerprint({
      sentQuantity: 2,
      inventoryQuantityPerUnit: 1,
      inventoryUnit: "unit",
      quantityDelta: -2,
    });
    assert.notEqual(a, b);
  });

  test("deriveNewlySentSegments on upsert-like transition", () => {
    const segments = deriveNewlySentSegments(
      [{ id: "line-1", status: "pending", quantity: 2 }],
      [{ id: "line-1", status: "sent", quantity: 2 }],
    );
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.newlySentUnits, 2);
  });
});

const STOCK_VALIDATE_RESTAURANT = "rest-stock-validate";
const stockValidateBase = {
  restaurantId: STOCK_VALIDATE_RESTAURANT,
  orderId: "order-stock-1",
  lineId: "line-stock-1",
  groupId: "grp-stock-1",
  optionId: "opt-stock-1",
  inventoryProductId: "inv-stock-1",
  inventoryUnit: "unit",
  inventoryQuantityPerUnit: 1,
} as const;

function inventoryProductDoc(overrides: {
  currentStock?: unknown;
  unit?: unknown;
  enabled?: boolean;
  active?: boolean;
} = {}): Record<string, unknown> {
  const inventory: Record<string, unknown> = {
    enabled: overrides.enabled !== false,
  };
  if ("currentStock" in overrides) inventory.currentStock = overrides.currentStock;
  else inventory.currentStock = 10;
  if ("unit" in overrides) inventory.unit = overrides.unit;
  else inventory.unit = "unit";
  return {
    active: overrides.active !== false,
    inventory,
  };
}

function sentLineWithInventoryModifier(params: {
  lineId: string;
  productId: string;
  groupId: string;
  optionId: string;
  inventoryProductId: string;
  inventoryQuantity?: number;
  inventoryUnit?: string;
  quantity?: number;
}) {
  return {
    id: params.lineId,
    status: "sent",
    quantity: params.quantity ?? 1,
    productId: params.productId,
    selectedModifiers: [
      {
        groupId: params.groupId,
        optionId: params.optionId,
        inventoryProductId: params.inventoryProductId,
        inventoryQuantity: params.inventoryQuantity ?? 1,
        inventoryUnit: params.inventoryUnit ?? "unit",
      },
    ],
  };
}

function buildValidModifierSaleV2LedgerDocument(params: {
  restaurantId: string;
  orderId: string;
  lineId: string;
  groupId: string;
  optionId: string;
  invProductId: string;
  selectionOccurrence?: number;
  sentQuantity: number;
  inventoryQuantityPerUnit?: number;
  inventoryUnit?: string;
  productName?: string;
}): { movementId: string; data: Record<string, unknown> } {
  const selectionOccurrence = params.selectionOccurrence ?? 0;
  const inventoryQuantityPerUnit = params.inventoryQuantityPerUnit ?? 1;
  const inventoryUnit = params.inventoryUnit ?? "unit";
  const sentQuantity = params.sentQuantity;
  const quantityDelta = -sentQuantity * inventoryQuantityPerUnit;
  const movementId = buildModifierSaleV2MovementId({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    sentSegmentLineId: params.lineId,
    modifierGroupId: params.groupId,
    modifierOptionId: params.optionId,
    inventoryProductId: params.invProductId,
    selectionOccurrence,
  });
  const movementFingerprint = buildModifierSaleMovementFingerprint({
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
  return {
    movementId,
    data: {
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      lineId: params.lineId,
      sentSegmentLineId: params.lineId,
      type: "modifier_sale",
      source: "modifier_sale",
      applied: true,
      sentQuantity,
      inventoryQuantityPerUnit,
      unit: inventoryUnit,
      quantityDelta,
      productId: params.invProductId,
      modifierGroupId: params.groupId,
      modifierOptionId: params.optionId,
      selectionOccurrence,
      productName: params.productName ?? "Inv",
      idempotencyKey: movementId,
      movementFingerprint,
    },
  };
}

function saleMovementFixture(params: {
  restaurantId: string;
  orderId: string;
  lineId: string;
  groupId: string;
  optionId: string;
  invProductId: string;
  selectionOccurrence?: number;
  sentQuantity: number;
  inventoryQuantityPerUnit?: number;
  inventoryUnit?: string;
}): Record<string, unknown> {
  return buildValidModifierSaleV2LedgerDocument(params).data;
}

type StockApplyMockStats = {
  txGets: number;
  queryGets: number;
  queryDocsRead: number;
  originalSaleQueries: number;
  originalSaleDocsRead: number;
  reversalQueries: number;
  reversalDocsRead: number;
  directDocGets: number;
  getAllCalls: number;
  getAllRefCount: number;
  movementWrites: number;
};

function classifyQueryStats(filters: Array<{ field: string; op: string; value: unknown }>): {
  isLineScopedOriginalLookupQuery: boolean;
  isReversalQuery: boolean;
} {
  const byField = new Map(filters.map((filter) => [filter.field, filter.value]));
  const isLineScopedOriginalLookupQuery =
    byField.has("orderId") && byField.has("lineId") && !byField.has("type");
  const isReversalQuery =
    byField.get("type") === "modifier_sale_reversal" && byField.has("reversalOfMovementId");
  return { isLineScopedOriginalLookupQuery, isReversalQuery };
}

function createStockApplyMock(params: {
  products: Record<string, Record<string, unknown>>;
  existingMovements?: Record<string, Record<string, unknown>>;
}) {
  const movementWrites = new Map<string, Record<string, unknown>>();
  const productUpdates = new Map<string, Record<string, unknown>>();
  const refKinds = new Map<string, "movement" | "product">();
  const stats: StockApplyMockStats = {
    txGets: 0,
    queryGets: 0,
    queryDocsRead: 0,
    originalSaleQueries: 0,
    originalSaleDocsRead: 0,
    reversalQueries: 0,
    reversalDocsRead: 0,
    directDocGets: 0,
    getAllCalls: 0,
    getAllRefCount: 0,
    movementWrites: 0,
  };

  type WhereFilter = { field: string; op: string; value: unknown };

  function allMovements(): Record<string, Record<string, unknown>> {
    return {
      ...(params.existingMovements ?? {}),
      ...Object.fromEntries(movementWrites),
    };
  }

  function buildWhereChain(initial: WhereFilter) {
    const filters: WhereFilter[] = [initial];
    const chain = {
      _isQuery: true as const,
      filters,
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return chain;
      },
    };
    return chain;
  }

  const db = {
    collection() {
      return {
        doc() {
          return {
            collection(sub: string) {
              return {
                doc(id: string) {
                  refKinds.set(id, sub === "stockMovements" ? "movement" : "product");
                  return { id };
                },
                where(field: string, op: string, value: unknown) {
                  return buildWhereChain({ field, op, value });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Firestore;

  const tx = {
    async get(refOrQuery: { id?: string; _isQuery?: true; filters?: WhereFilter[] }) {
      stats.txGets += 1;
      if (refOrQuery._isQuery && refOrQuery.filters) {
        stats.queryGets += 1;
        const movements = allMovements();
        const matching = Object.entries(movements).filter(([, data]) =>
          refOrQuery.filters!.every((filter) => {
            if (filter.op === "==") return data[filter.field] === filter.value;
            return false;
          }),
        );
        stats.queryDocsRead += matching.length;
        const queryKind = classifyQueryStats(refOrQuery.filters);
        if (queryKind.isLineScopedOriginalLookupQuery) {
          stats.originalSaleQueries += 1;
          stats.originalSaleDocsRead += matching.length;
        }
        if (queryKind.isReversalQuery) {
          stats.reversalQueries += 1;
          stats.reversalDocsRead += matching.length;
        }
        return {
          docs: matching.map(([id, data]) => ({
            id,
            exists: true,
            data: () => data,
          })),
        };
      }
      stats.directDocGets += 1;
      const ref = refOrQuery as { id: string };
      const kind = refKinds.get(ref.id);
      if (kind === "movement") {
        const data = allMovements()[ref.id];
        return { exists: Boolean(data), data: () => data, id: ref.id };
      }
      const data = params.products[ref.id];
      return { exists: Boolean(data), data: () => data, id: ref.id };
    },
    async getAll(...refs: Array<{ id: string }>) {
      stats.getAllCalls += 1;
      stats.getAllRefCount += refs.length;
      return refs.map((ref) => {
        const kind = refKinds.get(ref.id);
        if (kind === "movement") {
          const data = allMovements()[ref.id];
          return { exists: Boolean(data), data: () => data, id: ref.id };
        }
        const data = params.products[ref.id];
        return { exists: Boolean(data), data: () => data, id: ref.id };
      });
    },
    set(ref: { id: string }, data: Record<string, unknown>) {
      movementWrites.set(ref.id, data);
      stats.movementWrites = movementWrites.size;
    },
    update(ref: { id: string }, data: Record<string, unknown>) {
      productUpdates.set(ref.id, data);
    },
  } as unknown as Transaction;

  return { db, tx, movementWrites, productUpdates, stats };
}

describe("modifier inventory product validation (6C2.2)", () => {
  test("1. positive currentStock is valid", () => {
    assert.equal(
      validateModifierInventoryProduct({
        ...stockValidateBase,
        productData: inventoryProductDoc({ currentStock: 12.5 }),
      }),
      null,
    );
  });

  test("2. zero currentStock is valid and may go negative after apply", () => {
    assert.equal(
      validateModifierInventoryProduct({
        ...stockValidateBase,
        productData: inventoryProductDoc({ currentStock: 0 }),
      }),
      null,
    );
  });

  test("3. negative currentStock is valid", () => {
    assert.equal(
      validateModifierInventoryProduct({
        ...stockValidateBase,
        productData: inventoryProductDoc({ currentStock: -4 }),
      }),
      null,
    );
  });

  test("4. absent currentStock → INVALID_CURRENT_STOCK", () => {
    const product = inventoryProductDoc();
    delete (product.inventory as Record<string, unknown>).currentStock;
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: product,
    });
    assert.ok(warning);
    assert.equal(warning?.reason, "INVALID_CURRENT_STOCK");
  });

  test("5. null currentStock → INVALID_CURRENT_STOCK", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ currentStock: null }),
    });
    assert.equal(warning?.reason, "INVALID_CURRENT_STOCK");
  });

  test('6. string currentStock "10" → INVALID_CURRENT_STOCK', () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ currentStock: "10" }),
    });
    assert.equal(warning?.reason, "INVALID_CURRENT_STOCK");
  });

  test("7. NaN currentStock → INVALID_CURRENT_STOCK", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ currentStock: Number.NaN }),
    });
    assert.equal(warning?.reason, "INVALID_CURRENT_STOCK");
  });

  test("8. Infinity currentStock → INVALID_CURRENT_STOCK", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ currentStock: Number.POSITIVE_INFINITY }),
    });
    assert.equal(warning?.reason, "INVALID_CURRENT_STOCK");
  });

  test("9. canonical product unit → valid movement path", () => {
    assert.equal(
      validateModifierInventoryProduct({
        ...stockValidateBase,
        inventoryUnit: "unit",
        productData: inventoryProductDoc({ unit: "unit" }),
      }),
      null,
    );
  });

  test("10. recognized alias ud → valid conversion path", () => {
    assert.equal(
      validateModifierInventoryProduct({
        ...stockValidateBase,
        inventoryUnit: "unit",
        productData: inventoryProductDoc({ unit: "ud" }),
      }),
      null,
    );
  });

  test("11. absent unit → UNKNOWN_PRODUCT_UNIT", () => {
    const product = inventoryProductDoc();
    delete (product.inventory as Record<string, unknown>).unit;
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: product,
    });
    assert.equal(warning?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("12. null unit → UNKNOWN_PRODUCT_UNIT", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ unit: null }),
    });
    assert.equal(warning?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("13. empty unit → UNKNOWN_PRODUCT_UNIT", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ unit: "   " }),
    });
    assert.equal(warning?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("14. unknown unit → UNKNOWN_PRODUCT_UNIT", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ unit: "parsec" }),
    });
    assert.equal(warning?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("15. non-string unit → UNKNOWN_PRODUCT_UNIT", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      productData: inventoryProductDoc({ unit: 7 }),
    });
    assert.equal(warning?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("16. valid units in incompatible families → INCOMPATIBLE_UNIT", () => {
    const warning = validateModifierInventoryProduct({
      ...stockValidateBase,
      inventoryUnit: "ml",
      productData: inventoryProductDoc({ unit: "g" }),
    });
    assert.equal(warning?.reason, "INCOMPATIBLE_UNIT");
  });

  test("17. one valid selection and one invalid on different products apply only valid", async () => {
    const invalidProduct = inventoryProductDoc({ unit: "unit" });
    delete (invalidProduct.inventory as Record<string, unknown>).currentStock;
    const { db, tx, movementWrites, productUpdates } = createStockApplyMock({
      products: {
        "inv-valid": inventoryProductDoc({ currentStock: 5, unit: "unit" }),
        "inv-invalid": invalidProduct,
      },
    });
    const afterLine = {
      id: "line-mix",
      status: "sent",
      quantity: 1,
      productId: "sale-1",
      selectedModifiers: [
        {
          groupId: "grp-a",
          optionId: "opt-a",
          inventoryProductId: "inv-valid",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId: "grp-b",
          optionId: "opt-b",
          inventoryProductId: "inv-invalid",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx,
      db,
      restaurantId: STOCK_VALIDATE_RESTAURANT,
      orderId: "order-mix",
      actorUid: "uid-1",
      beforeItems: [{ id: "line-mix", status: "pending", quantity: 1 }],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
    });

    assert.equal(movementWrites.size, 1);
    assert.equal(productUpdates.size, 1);
    assert.equal(plan.warnings.length, 1);
    assert.equal(plan.warnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(plan.warnings[0]?.inventoryProductId, "inv-invalid");
  });

  test("18. multiple invalid selections on same product produce deterministic warnings only", async () => {
    const invalidProduct = inventoryProductDoc({ unit: "parsec", currentStock: 3 });
    const { db, tx, movementWrites, productUpdates } = createStockApplyMock({
      products: { "inv-bad-unit": invalidProduct },
    });
    const afterLine = {
      id: "line-multi",
      status: "sent",
      quantity: 1,
      productId: "sale-1",
      selectedModifiers: [
        {
          groupId: "grp-a",
          optionId: "opt-a",
          inventoryProductId: "inv-bad-unit",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId: "grp-b",
          optionId: "opt-b",
          inventoryProductId: "inv-bad-unit",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx,
      db,
      restaurantId: STOCK_VALIDATE_RESTAURANT,
      orderId: "order-multi",
      actorUid: "uid-1",
      beforeItems: [{ id: "line-multi", status: "pending", quantity: 1 }],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
    });
    assert.equal(movementWrites.size, 0);
    assert.equal(productUpdates.size, 0);
    assert.equal(plan.warnings.length, 2);
    assert.equal(plan.warnings[0]?.reason, "UNKNOWN_PRODUCT_UNIT");
    assert.equal(plan.warnings[1]?.reason, "UNKNOWN_PRODUCT_UNIT");
    assert.deepEqual(
      plan.warnings.map((warning) => warning.optionId),
      ["opt-a", "opt-b"],
    );
  });

  test("19. invalid currentStock never produces stockBefore = 0 movement", async () => {
    const invalidProduct = inventoryProductDoc({ unit: "unit" });
    delete (invalidProduct.inventory as Record<string, unknown>).currentStock;
    const { db, tx, movementWrites } = createStockApplyMock({
      products: { "inv-no-stock": invalidProduct },
    });
    await applyInitialModifierStockConsumptionInTransaction({
      tx,
      db,
      restaurantId: STOCK_VALIDATE_RESTAURANT,
      orderId: "order-no-stock",
      actorUid: "uid-1",
      beforeItems: [{ id: "line-no-stock", status: "pending", quantity: 1 }],
      afterItems: [
        sentLineWithInventoryModifier({
          lineId: "line-no-stock",
          productId: "sale-1",
          groupId: "grp-a",
          optionId: "opt-a",
          inventoryProductId: "inv-no-stock",
        }),
      ],
      nowMs: 1_700_000_000_000,
    });
    assert.equal(movementWrites.size, 0);
    for (const movement of movementWrites.values()) {
      assert.notEqual(movement.stockBefore, 0);
    }
  });

  test("20. invalid product unit never persists movement using fallback ud", async () => {
    const product = inventoryProductDoc({ currentStock: 4 });
    delete (product.inventory as Record<string, unknown>).unit;
    const mock = createStockApplyMock({ products: { "inv-no-unit": product } });
    await applyInitialModifierStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: STOCK_VALIDATE_RESTAURANT,
      orderId: "order-no-unit",
      actorUid: "uid-1",
      beforeItems: [{ id: "line-no-unit", status: "pending", quantity: 1 }],
      afterItems: [
        sentLineWithInventoryModifier({
          lineId: "line-no-unit",
          productId: "sale-1",
          groupId: "grp-a",
          optionId: "opt-a",
          inventoryProductId: "inv-no-unit",
        }),
      ],
      nowMs: 1_700_000_000_000,
    });
    assert.equal(mock.movementWrites.size, 0);
    for (const movement of mock.movementWrites.values()) {
      assert.notEqual(movement.unit, "ud");
    }
  });
});

describe("inventoryWarnings idempotency rehydration (6C2.3)", () => {
  test("legacy idempotency result without inventoryWarnings rehydrates as empty array", () => {
    assert.deepEqual(readInventoryWarningsFromIdempotencyResult({ orderId: "o1", total: 10 }), []);
  });

  test("malformed inventoryWarnings entries are ignored defensively", () => {
    const warnings = readInventoryWarningsFromIdempotencyResult({
      orderId: "o1",
      inventoryWarnings: [
        { orderId: "o1", lineId: "l1", groupId: "g1", optionId: "opt1", reason: "INVALID_CURRENT_STOCK" },
        { orderId: "o1", lineId: "l1", groupId: "g1", optionId: "opt1", reason: "NOT_A_REAL_REASON" },
        "bad-entry",
      ],
    });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.reason, "INVALID_CURRENT_STOCK");
  });

  test("buildIdempotencyResultWithInventoryWarnings always persists sorted inventoryWarnings", () => {
    const stored = buildIdempotencyResultWithInventoryWarnings(
      { orderId: "o1", total: 10 },
      [
        {
          orderId: "o1",
          lineId: "line-b",
          groupId: "grp-b",
          optionId: "opt-b",
          reason: "UNKNOWN_PRODUCT_UNIT",
        },
        {
          orderId: "o1",
          lineId: "line-a",
          groupId: "grp-a",
          optionId: "opt-a",
          reason: "INVALID_CURRENT_STOCK",
        },
      ],
    );
    assert.ok(Array.isArray(stored.inventoryWarnings));
    assert.equal((stored.inventoryWarnings as unknown[]).length, 2);
    assert.equal(
      (stored.inventoryWarnings as Array<{ lineId: string }>)[0]?.lineId,
      "line-a",
    );
    assert.deepEqual(
      readInventoryWarningsFromIdempotencyResult(stored),
      stored.inventoryWarnings,
    );
  });

  test("tpvMutationJsonOk preserves inventoryWarnings in HTTP payload", async () => {
    const response = tpvMutationJsonOk({
      orderId: "o1",
      total: 10,
      inventoryWarnings: sortInventoryWarningsStable([
        {
          orderId: "o1",
          lineId: "line-1",
          groupId: "grp-1",
          optionId: "opt-1",
          reason: "INVALID_CURRENT_STOCK",
        },
      ]),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.inventoryWarnings));
    assert.equal((payload.inventoryWarnings as unknown[]).length, 1);
  });
});

describe("resolveCategoryForProduct client inheritance", () => {
  test("13. producto legacy sin categoryId no hereda por nombre", () => {
    const categories: CartaCategoria[] = [
      {
        id: "cat-1",
        restauranteId: "r1",
        name: "Refrescos",
        slug: "refrescos",
        type: "drink",
        sortOrder: 0,
        isActive: true,
        createdAt: "",
        updatedAt: "",
        modifierGroupIds: ["fmt"],
      },
    ];
    const product = {
      id: "p1",
      nombre: "Refrescos",
      categoria: "Refrescos",
    } as Product;
    assert.equal(resolveCategoryForProduct(product, categories), null);
  });
});

describe("modifier stock reversal derivation", () => {
  test("cancel sent line requests full before quantity", () => {
    assert.equal(
      deriveUnitsToReverse(
        { id: "l1", status: "sent", quantity: 3 },
        { id: "l1", status: "cancelled", quantity: 0 },
      ),
      3,
    );
  });

  test("reduce sent 3 → 2 requests one unit", () => {
    assert.equal(
      deriveUnitsToReverse(
        { id: "l1", status: "sent", quantity: 3 },
        { id: "l1", status: "sent", quantity: 2 },
      ),
      1,
    );
  });

  test("pending and already cancelled request zero", () => {
    assert.equal(
      deriveUnitsToReverse(
        { id: "l1", status: "pending", quantity: 2 },
        undefined,
      ),
      0,
    );
    assert.equal(
      deriveUnitsToReverse(
        { id: "l1", status: "cancelled", quantity: 0 },
        { id: "l1", status: "cancelled", quantity: 0 },
      ),
      0,
    );
  });

  test("remainingConsumedUnitsAfter treats cancelled as zero", () => {
    assert.equal(remainingConsumedUnitsAfter({ status: "cancelled", quantity: 5 }), 0);
    assert.equal(remainingConsumedUnitsAfter({ status: "preparing", quantity: 2 }), 2);
  });

  test("reversal v3 id differs by operation key and is tenant-scoped", () => {
    const base = {
      restaurantId: TPV_TEST_RESTAURANT,
      orderId: "order-1",
      sentSegmentLineId: "line-1",
      reversalOfMovementId: "modifier_sale_v2_abc123",
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    };
    const op1 = buildModifierSaleAggregatedReversalV3MovementId({
      ...base,
      operationIdempotencyKey: "op-1",
    });
    const op2 = buildModifierSaleAggregatedReversalV3MovementId({
      ...base,
      operationIdempotencyKey: "op-2",
    });
    const otherTenant = buildModifierSaleAggregatedReversalV3MovementId({
      ...base,
      restaurantId: "other-tenant",
      operationIdempotencyKey: "op-1",
    });
    assert.notEqual(op1, op2);
    assert.notEqual(op1, otherTenant);
    assert.match(op1, /^modifier_sale_reversal_v3_/);
  });
});

describe("modifier stock reversal apply (mock txn)", () => {
  test("cancel restores stock once; retry writes nothing extra", async () => {
    const restaurantId = "rest-rev-1";
    const orderId = "order-rev-1";
    const lineId = "line-rev-1";
    const invProductId = "inv-rev-1";
    const groupId = "grp-rev-1";
    const optionId = "opt-rev-1";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 2,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };

    const first = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit" }),
      },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 2,
        }),
      },
    });

    const plan1 = await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });
    assert.equal(plan1.unitsReversed, 2);
    assert.equal(first.movementWrites.size, 1);
    const aggregated = [...first.movementWrites.values()][0];
    assert.equal(aggregated?.reversedSaleUnits, 2);
    assert.equal(aggregated?.movementSchemaVersion, MODIFIER_SALE_REVERSAL_SCHEMA_V3);
    assert.equal(
      (first.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      10,
    );

    const second = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 10, unit: "unit" }),
      },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 2,
        }),
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const plan2 = await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [afterLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_001,
      lineIds: [lineId],
    });
    assert.equal(plan2.unitsReversed, 0);
    assert.equal(second.movementWrites.size, 0);
    assert.equal(second.productUpdates.size, 0);
  });

  test("partial reduce reverses one unit only", async () => {
    const restaurantId = "rest-rev-2";
    const orderId = "order-rev-2";
    const lineId = "line-rev-2";
    const invProductId = "inv-rev-2";
    const groupId = "grp-rev-2";
    const optionId = "opt-rev-2";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 3,
    });
    const afterLine = { ...beforeLine, quantity: 2, qty: 2 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 7, unit: "unit" }),
      },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 3,
        }),
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.movementWrites.size, 1);
    const written = [...mock.movementWrites.values()][0];
    assert.equal(written?.type, "modifier_sale_reversal");
    assert.equal(written?.quantityDelta, 1);
    assert.equal(written?.reversedSaleUnits, 1);
    assert.equal(written?.movementSchemaVersion, MODIFIER_SALE_REVERSAL_SCHEMA_V3);
    assert.equal(
      (mock.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      8,
    );
  });

  test("without original v2 consumption does not invent reversal", async () => {
    const restaurantId = "rest-rev-3";
    const lineId = "line-rev-3";
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId: "grp",
      optionId: "opt",
      inventoryProductId: "inv-missing",
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: {
        "inv-missing": inventoryProductDoc({ currentStock: 5, unit: "unit" }),
      },
      existingMovements: {},
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId: "order-rev-3",
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [{ ...beforeLine, status: "cancelled", quantity: 0 }],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.movementWrites.size, 0);
    assert.equal(mock.productUpdates.size, 0);
  });
});

describe("modifier stock reversal selectionOccurrence ledger lookup", () => {
  const restaurantId = "rest-occ-ledger";
  const orderId = "order-occ-ledger";
  const invProductId = "inv-cola-shared";
  const groupId = "grp-mixer";
  const optionId = "opt-cola";
  const saleProductId = "prod-refresco";

  function sharedModifierLine(params: {
    lineId: string;
    quantity?: number;
    status?: string;
  }) {
    return sentLineWithInventoryModifier({
      lineId: params.lineId,
      productId: saleProductId,
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: params.quantity ?? 1,
    });
  }

  function buildSaleMovement(params: {
    lineId: string;
    selectionOccurrence: number;
    sentQuantity?: number;
  }) {
    return buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: params.lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: params.selectionOccurrence,
      sentQuantity: params.sentQuantity ?? 1,
      productName: "Cola",
    });
  }

  test("consumption assigns global selectionOccurrence across lines", async () => {
    const lineA = "line-occ-a";
    const lineB = "line-occ-b";
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 20, unit: "unit" }),
      },
    });
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [
        { id: lineA, status: "pending", quantity: 1 },
        { id: lineB, status: "pending", quantity: 1 },
      ],
      afterItems: [sharedModifierLine({ lineId: lineA }), sharedModifierLine({ lineId: lineB })],
      nowMs: 1_700_000_000_000,
    });
    assert.equal(plan.movementIds.length, 2);
    const idA = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineA,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const idB = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineB,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 1,
    });
    assert.equal(mock.movementWrites.has(idA), true);
    assert.equal(mock.movementWrites.has(idB), true);
    assert.notEqual(idA, idB);
  });

  test("cancel second line only reverses its own global occurrence", async () => {
    const lineA = "line-cancel-b-a";
    const lineB = "line-cancel-b-b";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 18, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const beforeItems = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
    ];
    const afterItems = [
      sharedModifierLine({ lineId: lineA }),
      { ...sharedModifierLine({ lineId: lineB }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems,
      afterItems,
      nowMs: 1_700_000_000_100,
      lineIds: [lineB],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.movementWrites.size, 1);
    const reversal = [...mock.movementWrites.values()][0];
    assert.equal(reversal?.lineId, lineB);
    assert.equal(reversal?.selectionOccurrence, 1);
    assert.equal(reversal?.reversalOfMovementId, saleB.movementId);
    assert.equal(
      (mock.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      19,
    );
  });

  test("cancel first then second fully compensates without double reversal", async () => {
    const lineA = "line-seq-a";
    const lineB = "line-seq-b";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const first = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 18, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const beforeBoth = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
    ];
    const afterCancelA = [
      { ...sharedModifierLine({ lineId: lineA }), status: "cancelled", quantity: 0, qty: 0 },
      sharedModifierLine({ lineId: lineB }),
    ];
    const planA = await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: beforeBoth,
      afterItems: afterCancelA,
      nowMs: 1_700_000_000_200,
      lineIds: [lineA],
    });
    assert.equal(planA.unitsReversed, 1);
    assert.equal(
      (first.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      19,
    );

    const second = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 19, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const afterCancelBoth = [
      { ...sharedModifierLine({ lineId: lineA }), status: "cancelled", quantity: 0, qty: 0 },
      { ...sharedModifierLine({ lineId: lineB }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    const planB = await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: afterCancelA,
      afterItems: afterCancelBoth,
      nowMs: 1_700_000_000_201,
      lineIds: [lineB],
    });
    assert.equal(planB.unitsReversed, 1);
    assert.equal(second.movementWrites.size, 1);
    assert.equal(
      (second.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      20,
    );
  });

  test("cancel in reverse order reaches the same final stock", async () => {
    const lineA = "line-rev-order-a";
    const lineB = "line-rev-order-b";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const first = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 18, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const beforeBoth = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
    ];
    const afterCancelB = [
      sharedModifierLine({ lineId: lineA }),
      { ...sharedModifierLine({ lineId: lineB }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: beforeBoth,
      afterItems: afterCancelB,
      nowMs: 1_700_000_000_300,
      lineIds: [lineB],
    });

    const second = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 19, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const afterCancelBoth = [
      { ...sharedModifierLine({ lineId: lineA }), status: "cancelled", quantity: 0, qty: 0 },
      { ...sharedModifierLine({ lineId: lineB }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: afterCancelB,
      afterItems: afterCancelBoth,
      nowMs: 1_700_000_000_301,
      lineIds: [lineA],
    });
    assert.equal(
      (second.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      20,
    );
  });

  test("three lines with same modifier each reverse only their own movement", async () => {
    const lineA = "line-three-a";
    const lineB = "line-three-b";
    const lineC = "line-three-c";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const saleC = buildSaleMovement({ lineId: lineC, selectionOccurrence: 2 });
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 17, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
        [saleC.movementId]: saleC.data,
      },
    });
    const beforeItems = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
      sharedModifierLine({ lineId: lineC }),
    ];
    const afterItems = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
      { ...sharedModifierLine({ lineId: lineC }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems,
      afterItems,
      nowMs: 1_700_000_000_400,
      lineIds: [lineC],
    });
    assert.equal(plan.unitsReversed, 1);
    const reversal = [...mock.movementWrites.values()][0];
    assert.equal(reversal?.lineId, lineC);
    assert.equal(reversal?.selectionOccurrence, 2);
    assert.equal(reversal?.reversalOfMovementId, saleC.movementId);
  });

  test("retry of targeted cancel does not duplicate reversal", async () => {
    const lineA = "line-retry-a";
    const lineB = "line-retry-b";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const first = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 18, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const beforeBoth = [
      sharedModifierLine({ lineId: lineA }),
      sharedModifierLine({ lineId: lineB }),
    ];
    const afterCancelB = [
      sharedModifierLine({ lineId: lineA }),
      { ...sharedModifierLine({ lineId: lineB }), status: "cancelled", quantity: 0, qty: 0 },
    ];
    const plan1 = await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: beforeBoth,
      afterItems: afterCancelB,
      nowMs: 1_700_000_000_500,
      lineIds: [lineB],
    });
    assert.equal(plan1.unitsReversed, 1);

    const second = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 19, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const plan2 = await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: afterCancelB,
      afterItems: afterCancelB,
      nowMs: 1_700_000_000_501,
      lineIds: [lineB],
    });
    assert.equal(plan2.unitsReversed, 0);
    assert.equal(second.movementWrites.size, 0);
    assert.equal(second.productUpdates.size, 0);
  });

  test("shuffling unrelated lines does not change target line association", async () => {
    const lineA = "line-shuffle-a";
    const lineB = "line-shuffle-b";
    const lineC = "line-shuffle-c";
    const saleA = buildSaleMovement({ lineId: lineA, selectionOccurrence: 0 });
    const saleB = buildSaleMovement({ lineId: lineB, selectionOccurrence: 1 });
    const saleC = buildSaleMovement({
      lineId: lineC,
      selectionOccurrence: 2,
    });
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 17, unit: "unit" }),
      },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
        [saleC.movementId]: saleC.data,
      },
    });
    const lineBBefore = sharedModifierLine({ lineId: lineB });
    const lineBAfter = {
      ...sharedModifierLine({ lineId: lineB }),
      status: "cancelled",
      quantity: 0,
      qty: 0,
    };
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [
        sharedModifierLine({ lineId: lineC }),
        lineBBefore,
        sharedModifierLine({ lineId: lineA }),
      ],
      afterItems: [sharedModifierLine({ lineId: lineC }), lineBAfter, sharedModifierLine({ lineId: lineA })],
      nowMs: 1_700_000_000_600,
      lineIds: [lineB],
    });
    assert.equal(plan.unitsReversed, 1);
    const reversal = [...mock.movementWrites.values()][0];
    assert.equal(reversal?.lineId, lineB);
    assert.equal(reversal?.selectionOccurrence, 1);
    assert.equal(reversal?.reversalOfMovementId, saleB.movementId);
  });
});

describe("modifier stock reversal corrupt ledger validation (BLOCK 2)", () => {
  const restaurantId = "rest-rev-ledger";
  const orderId = "order-rev-ledger";
  const lineId = "line-rev-ledger";
  const invProductId = "inv-rev-ledger";
  const groupId = "grp-rev-ledger";
  const optionId = "opt-rev-ledger";

  function buildOriginalSaleMovement(sentQuantity = 1) {
    return buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId: invProductId,
      sentQuantity,
    });
  }

  function buildValidReversalMovement(originalMovementId: string, reversedSaleUnits = 1) {
    const beforeRemaining = reversedSaleUnits;
    const afterRemaining = 0;
    const operationIdempotencyKey = buildModifierReversalOperationIdempotencyKey({
      operationKind: "cancel_lines",
      restaurantId,
      orderId,
      lineId,
      beforeRemaining,
      afterRemaining,
    });
    const inventoryQuantityPerUnit = 1;
    const inventoryUnit = "unit";
    const quantityDelta = reversedSaleUnits * inventoryQuantityPerUnit;
    const fingerprint = buildModifierSaleAggregatedReversalFingerprint({
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
      reversedSaleUnits,
      inventoryQuantityPerUnit,
      inventoryUnit,
      quantityDelta,
    });
    const movementId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: originalMovementId,
      operationIdempotencyKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    return {
      movementId,
      data: {
        restaurantId,
        orderId,
        lineId,
        sentSegmentLineId: lineId,
        type: "modifier_sale_reversal",
        source: "modifier_sale_reversal",
        applied: true,
        productId: invProductId,
        modifierGroupId: groupId,
        modifierOptionId: optionId,
        reversalOfMovementId: originalMovementId,
        selectionOccurrence: 0,
        operationIdempotencyKey,
        movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
        quantityDelta,
        inventoryQuantityPerUnit,
        unit: inventoryUnit,
        reversedSaleUnits,
        idempotencyKey: movementId,
        movementFingerprint: fingerprint,
        productName: "Inv",
      },
    };
  }

  async function expectCorruptReversalAborts(
    label: string,
    corruptData: Record<string, unknown>,
    corruptMovementId: string,
  ) {
    const sale = buildOriginalSaleMovement();
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
        [corruptMovementId]: corruptData,
      },
    });

    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [afterLine],
          nowMs: 1_700_000_000_000,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR, label);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0, `${label}: no new reversals`);
    assert.equal(mock.productUpdates.size, 0, `${label}: stock unchanged`);
    assert.equal(mock.movementWrites.has(corruptMovementId), false, `${label}: corrupt doc not overwritten`);
  }

  test("1. applied false aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts("applied false", { ...reversal.data, applied: false }, reversal.movementId);
  });

  test("2. quantityDelta zero aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "quantityDelta zero",
      { ...reversal.data, quantityDelta: 0 },
      reversal.movementId,
    );
  });

  test("3. incorrect quantityDelta aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "quantityDelta incorrect",
      { ...reversal.data, quantityDelta: 2 },
      reversal.movementId,
    );
  });

  test("4. incorrect fingerprint aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "fingerprint incorrect",
      { ...reversal.data, movementFingerprint: "corrupt-fingerprint" },
      reversal.movementId,
    );
  });

  test("5. incorrect reversalOfMovementId aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "reversalOfMovementId incorrect",
      { ...reversal.data, reversalOfMovementId: "modifier_sale_v2_deadbeef" },
      reversal.movementId,
    );
  });

  test("6. incorrect restaurantId aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "restaurantId incorrect",
      { ...reversal.data, restaurantId: "other-restaurant" },
      reversal.movementId,
    );
  });

  test("7. incorrect orderId aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "orderId incorrect",
      { ...reversal.data, orderId: "other-order" },
      reversal.movementId,
    );
  });

  test("8. incorrect lineId aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "lineId incorrect",
      { ...reversal.data, lineId: "other-line", sentSegmentLineId: "other-line" },
      reversal.movementId,
    );
  });

  test("9. incorrect product aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "product incorrect",
      { ...reversal.data, productId: "other-product" },
      reversal.movementId,
    );
  });

  test("10. incorrect modifier group aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "modifier group incorrect",
      { ...reversal.data, modifierGroupId: "other-group" },
      reversal.movementId,
    );
  });

  test("11. incorrect modifier option aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "modifier option incorrect",
      { ...reversal.data, modifierOptionId: "other-option" },
      reversal.movementId,
    );
  });

  test("12. incorrect selectionOccurrence aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "selectionOccurrence incorrect",
      { ...reversal.data, selectionOccurrence: 9 },
      reversal.movementId,
    );
  });

  test("13. incorrect reversedSaleUnits aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "reversedSaleUnits incorrect",
      { ...reversal.data, reversedSaleUnits: 2, quantityDelta: 2 },
      reversal.movementId,
    );
  });

  test("14. incorrect movement type aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "type incorrect",
      { ...reversal.data, type: "modifier_sale" },
      reversal.movementId,
    );
  });

  test("15. incorrect source aborts with ledger conflict", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    await expectCorruptReversalAborts(
      "source incorrect",
      { ...reversal.data, source: "manual_adjustment" },
      reversal.movementId,
    );
  });

  test("16. valid existing reversal is accepted idempotently", async () => {
    const sale = buildOriginalSaleMovement();
    const reversal = buildValidReversalMovement(sale.movementId);
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 9, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
        [reversal.movementId]: reversal.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.movementWrites.size, 0);
    assert.equal(mock.productUpdates.size, 0);
  });

  test("17. missing reversal document is created correctly", async () => {
    const sale = buildOriginalSaleMovement();
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.movementWrites.size, 1);
    const written = [...mock.movementWrites.values()][0];
    assert.equal(written?.applied, true);
    assert.equal(written?.type, "modifier_sale_reversal");
    assert.equal(
      (mock.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      9,
    );
  });
});

describe("modifier stock reversal mandatory atomicity (BLOCK 3)", () => {
  const restaurantId = "rest-rev-atomic";
  const orderId = "order-rev-atomic";
  const lineId = "line-rev-atomic";
  const invProductId = "inv-rev-atomic";
  const groupId = "grp-rev-atomic";
  const optionId = "opt-rev-atomic";

  function buildOriginalSaleMovement() {
    return buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
  }

  async function expectMandatoryReversalBlocked(params: {
    label: string;
    expectedError: string;
    products: Record<string, Record<string, unknown>>;
  }) {
    const sale = buildOriginalSaleMovement();
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: params.products,
      existingMovements: {
        [sale.movementId]: sale.data,
      },
    });

    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [afterLine],
          nowMs: 1_700_000_000_000,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, params.expectedError, params.label);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0, `${params.label}: no new movements`);
    assert.equal(mock.productUpdates.size, 0, `${params.label}: stock unchanged`);
  }

  test("1. deleted product aborts mandatory reversal", async () => {
    await expectMandatoryReversalBlocked({
      label: "deleted product",
      expectedError: buildModifierReversalBlockedErrorCode("PRODUCT_NOT_FOUND"),
      products: {},
    });
  });

  test("2. inactive product aborts mandatory reversal", async () => {
    await expectMandatoryReversalBlocked({
      label: "inactive product",
      expectedError: buildModifierReversalBlockedErrorCode("PRODUCT_INACTIVE"),
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit", active: false }),
      },
    });
  });

  test("3. inventory disabled aborts mandatory reversal", async () => {
    await expectMandatoryReversalBlocked({
      label: "inventory disabled",
      expectedError: buildModifierReversalBlockedErrorCode("INVENTORY_DISABLED"),
      products: {
        [invProductId]: {
          active: true,
          inventory: { enabled: false, unit: "unit", currentStock: 8 },
        },
      },
    });
  });

  test("4. invalid currentStock aborts mandatory reversal", async () => {
    await expectMandatoryReversalBlocked({
      label: "invalid stock",
      expectedError: buildModifierReversalBlockedErrorCode("INVALID_CURRENT_STOCK"),
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: null, unit: "unit" }),
      },
    });
  });

  test("5. incompatible unit aborts mandatory reversal", async () => {
    await expectMandatoryReversalBlocked({
      label: "incompatible unit",
      expectedError: buildModifierReversalBlockedErrorCode("INCOMPATIBLE_UNIT"),
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "g" }),
      },
    });
  });

  test("6. valid product still reverses successfully", async () => {
    const sale = buildOriginalSaleMovement();
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [{ ...beforeLine, status: "cancelled", quantity: 0, qty: 0 }],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.movementWrites.size, 1);
  });

  test("7. retry remains idempotent after successful reversal", async () => {
    const sale = buildOriginalSaleMovement();
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const first = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 8, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
      },
    });
    await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      lineIds: [lineId],
    });

    const second = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 9, unit: "unit" }),
      },
      existingMovements: {
        [sale.movementId]: sale.data,
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [afterLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_001,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(second.movementWrites.size, 0);
  });
});

describe("modifier stock reversal aggregated v3 (BLOCK 4)", () => {
  test("A. cancel qty 100 creates one aggregated reversal document", async () => {
    const restaurantId = "rest-scale-100";
    const orderId = "order-scale-100";
    const lineId = "line-scale-100";
    const invProductId = "inv-scale-100";
    const groupId = "grp-scale";
    const optionId = "opt-scale";
    const qty = 100;
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: qty,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }),
      },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: qty,
        }),
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1_700_000_000_000,
      operationKind: "cancel_lines",
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, qty);
    assert.equal(mock.movementWrites.size, 1);
    const written = [...mock.movementWrites.values()][0];
    assert.equal(written?.reversedSaleUnits, qty);
    assert.equal(written?.quantityDelta, qty);
    assert.equal(written?.movementSchemaVersion, MODIFIER_SALE_REVERSAL_SCHEMA_V3);
    assert.equal(
      (mock.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      qty,
    );
  });

  test("B. partial reversals 100→80→30→cancel use three aggregated movements", async () => {
    const restaurantId = "rest-partial-seq";
    const orderId = "order-partial-seq";
    const lineId = "line-partial-seq";
    const invProductId = "inv-partial-seq";
    const groupId = "grp-partial";
    const optionId = "opt-partial";
    const qty = 100;
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const baseLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: qty,
    });

    const step1Before = { ...baseLine, quantity: 100, qty: 100 };
    const step1After = { ...baseLine, quantity: 80, qty: 80 };
    const mock1 = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: qty,
        }),
      },
    });
    const plan1 = await applyModifierStockReversalInTransaction({
      tx: mock1.tx,
      db: mock1.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [step1Before],
      afterItems: [step1After],
      nowMs: 1,
      operationKind: "remove_line_unit",
      externalOperationIdempotencyKey: "remove-100-to-80",
      lineIds: [lineId],
    });
    assert.equal(plan1.unitsReversed, 20);
    assert.equal(mock1.movementWrites.size, 1);

    const step2Before = { ...step1After };
    const step2After = { ...baseLine, quantity: 30, qty: 30 };
    const mock2 = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 20, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: qty,
        }),
        ...Object.fromEntries(mock1.movementWrites),
      },
    });
    const plan2 = await applyModifierStockReversalInTransaction({
      tx: mock2.tx,
      db: mock2.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [step2Before],
      afterItems: [step2After],
      nowMs: 2,
      operationKind: "remove_line_unit",
      externalOperationIdempotencyKey: "remove-80-to-30",
      lineIds: [lineId],
    });
    assert.equal(plan2.unitsReversed, 50);
    assert.equal(mock2.movementWrites.size, 1);

    const step3Before = { ...step2After };
    const step3After = { ...baseLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock3 = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 70, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: qty,
        }),
        ...Object.fromEntries(mock1.movementWrites),
        ...Object.fromEntries(mock2.movementWrites),
      },
    });
    const plan3 = await applyModifierStockReversalInTransaction({
      tx: mock3.tx,
      db: mock3.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [step3Before],
      afterItems: [step3After],
      nowMs: 3,
      operationKind: "cancel_lines",
      externalOperationIdempotencyKey: "cancel-remaining-30",
      lineIds: [lineId],
    });
    assert.equal(plan3.unitsReversed, 30);
    assert.equal(mock3.movementWrites.size, 1);
    assert.equal(
      (mock3.productUpdates.get(invProductId)?.inventory as { currentStock?: number } | undefined)
        ?.currentStock,
      100,
    );
  });

  test("C. retry with same idempotency key does not duplicate reversal", async () => {
    const restaurantId = "rest-idem-retry";
    const orderId = "order-idem-retry";
    const lineId = "line-idem-retry";
    const invProductId = "inv-idem-retry";
    const groupId = "grp-idem";
    const optionId = "opt-idem";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 100,
    });
    const afterLine = { ...beforeLine, quantity: 80, qty: 80 };
    const idemKey = "retry-remove-20";
    const first = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
      },
    });
    await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1,
      operationKind: "remove_line_unit",
      externalOperationIdempotencyKey: idemKey,
      lineIds: [lineId],
    });
    const second = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 20, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
        ...Object.fromEntries(first.movementWrites),
      },
    });
    const plan2 = await applyModifierStockReversalInTransaction({
      tx: second.tx,
      db: second.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 2,
      operationKind: "remove_line_unit",
      externalOperationIdempotencyKey: idemKey,
      lineIds: [lineId],
    });
    assert.equal(plan2.unitsReversed, 0);
    assert.equal(second.movementWrites.size, 0);
    assert.equal(second.productUpdates.size, 0);
  });

  test("D. ledger excess reversal aborts with conflict", async () => {
    const restaurantId = "rest-ledger-excess";
    const orderId = "order-ledger-excess";
    const lineId = "line-ledger-excess";
    const invProductId = "inv-ledger-excess";
    const groupId = "grp-excess";
    const optionId = "opt-excess";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const priorReversalKey = buildModifierReversalOperationIdempotencyKey({
      operationKind: "remove_line_unit",
      restaurantId,
      orderId,
      lineId,
      beforeRemaining: 100,
      afterRemaining: 50,
    });
    const priorReversalId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: originalId,
      operationIdempotencyKey: priorReversalKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 100,
    });
    const afterLine = { ...beforeLine, quantity: 80, qty: 80 };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 10, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
        [priorReversalId]: {
          restaurantId,
          orderId,
          lineId,
          sentSegmentLineId: lineId,
          type: "modifier_sale_reversal",
          source: "modifier_sale_reversal",
          applied: true,
          productId: invProductId,
          modifierGroupId: groupId,
          modifierOptionId: optionId,
          reversalOfMovementId: originalId,
          selectionOccurrence: 0,
          operationIdempotencyKey: priorReversalKey,
          movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          quantityDelta: 90,
          inventoryQuantityPerUnit: 1,
          unit: "unit",
          reversedSaleUnits: 90,
          idempotencyKey: priorReversalId,
          movementFingerprint: buildModifierSaleAggregatedReversalFingerprint({
            schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
            reversedSaleUnits: 90,
            inventoryQuantityPerUnit: 1,
            inventoryUnit: "unit",
            quantityDelta: 90,
          }),
          productName: "Inv",
        },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [afterLine],
          nowMs: 1,
          operationKind: "remove_line_unit",
          externalOperationIdempotencyKey: "remove-20-more",
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("D. zero balance skips new reversal on already-cancelled line", async () => {
    const restaurantId = "rest-zero-balance";
    const orderId = "order-zero-balance";
    const lineId = "line-zero-balance";
    const invProductId = "inv-zero-balance";
    const groupId = "grp-zero";
    const optionId = "opt-zero";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const cancelKey = buildModifierReversalOperationIdempotencyKey({
      operationKind: "cancel_lines",
      restaurantId,
      orderId,
      lineId,
      beforeRemaining: 1,
      afterRemaining: 0,
    });
    const reversalId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: originalId,
      operationIdempotencyKey: cancelKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const cancelledLine = {
      ...sentLineWithInventoryModifier({
        lineId,
        productId: "prod-1",
        groupId,
        optionId,
        inventoryProductId: invProductId,
        quantity: 0,
      }),
      status: "cancelled",
      qty: 0,
    };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 1, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 1,
        }),
        [reversalId]: {
          restaurantId,
          orderId,
          lineId,
          sentSegmentLineId: lineId,
          type: "modifier_sale_reversal",
          source: "modifier_sale_reversal",
          applied: true,
          productId: invProductId,
          modifierGroupId: groupId,
          modifierOptionId: optionId,
          reversalOfMovementId: originalId,
          selectionOccurrence: 0,
          operationIdempotencyKey: cancelKey,
          movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          quantityDelta: 1,
          inventoryQuantityPerUnit: 1,
          unit: "unit",
          reversedSaleUnits: 1,
          idempotencyKey: reversalId,
          movementFingerprint: buildModifierSaleAggregatedReversalFingerprint({
            schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
            reversedSaleUnits: 1,
            inventoryQuantityPerUnit: 1,
            inventoryUnit: "unit",
            quantityDelta: 1,
          }),
          productName: "Inv",
        },
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [cancelledLine],
      afterItems: [cancelledLine],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("E. cancel qty 500 stays O(1) writes and reads per modifier slot", async () => {
    const restaurantId = "rest-scale-500";
    const orderId = "order-scale-500";
    const lineId = "line-scale-500";
    const invProductId = "inv-scale-500";
    const groupId = "grp-scale-500";
    const optionId = "opt-scale-500";
    const qty = 500;
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: qty,
    });
    const afterLine = { ...beforeLine, status: "cancelled", quantity: 0, qty: 0 };
    const mock = createStockApplyMock({
      products: {
        [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }),
      },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: qty,
        }),
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1,
      operationKind: "cancel_lines",
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, qty);
    assert.equal(mock.movementWrites.size, 1);
    assert.equal([...mock.movementWrites.values()][0]?.reversedSaleUnits, qty);
  });

  test("F. unapplied v3 reversal in ledger balance query aborts with conflict", async () => {
    const restaurantId = "rest-unapplied-balance";
    const orderId = "order-unapplied-balance";
    const lineId = "line-unapplied-balance";
    const invProductId = "inv-unapplied-balance";
    const groupId = "grp-unapplied";
    const optionId = "opt-unapplied";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const priorKey = "prior-remove-20";
    const priorId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: originalId,
      operationIdempotencyKey: priorKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const ghostId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: originalId,
      operationIdempotencyKey: "ghost-unapplied",
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 80,
    });
    const afterLine = { ...beforeLine, quantity: 70, qty: 70 };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 20, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
        [priorId]: {
          restaurantId,
          orderId,
          lineId,
          sentSegmentLineId: lineId,
          type: "modifier_sale_reversal",
          source: "modifier_sale_reversal",
          applied: true,
          productId: invProductId,
          modifierGroupId: groupId,
          modifierOptionId: optionId,
          reversalOfMovementId: originalId,
          selectionOccurrence: 0,
          operationIdempotencyKey: priorKey,
          movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          quantityDelta: 20,
          inventoryQuantityPerUnit: 1,
          unit: "unit",
          reversedSaleUnits: 20,
          idempotencyKey: priorId,
          movementFingerprint: buildModifierSaleAggregatedReversalFingerprint({
            schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
            reversedSaleUnits: 20,
            inventoryQuantityPerUnit: 1,
            inventoryUnit: "unit",
            quantityDelta: 20,
          }),
          productName: "Inv",
        },
        [ghostId]: {
          restaurantId,
          orderId,
          lineId,
          sentSegmentLineId: lineId,
          type: "modifier_sale_reversal",
          source: "modifier_sale_reversal",
          applied: false,
          productId: invProductId,
          modifierGroupId: groupId,
          modifierOptionId: optionId,
          reversalOfMovementId: originalId,
          selectionOccurrence: 0,
          operationIdempotencyKey: "ghost-unapplied",
          movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          quantityDelta: 10,
          inventoryQuantityPerUnit: 1,
          unit: "unit",
          reversedSaleUnits: 10,
          idempotencyKey: ghostId,
          movementFingerprint: "ghost",
          productName: "Inv",
        },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [afterLine],
          nowMs: 1,
          operationKind: "remove_line_unit",
          externalOperationIdempotencyKey: "remove-10-more",
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("G. reusing external idempotency key for different mutation aborts with conflict", async () => {
    const restaurantId = "rest-idem-collision";
    const orderId = "order-idem-collision";
    const lineId = "line-idem-collision";
    const invProductId = "inv-idem-collision";
    const groupId = "grp-idem-collision";
    const optionId = "opt-idem-collision";
    const sharedKey = "client-reused-key";
    const originalId = buildModifierSaleV2MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      modifierGroupId: groupId,
      modifierOptionId: optionId,
      inventoryProductId: invProductId,
      selectionOccurrence: 0,
    });
    const before100 = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 100,
    });
    const after80 = { ...before100, quantity: 80, qty: 80 };
    const first = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
      },
    });
    await applyModifierStockReversalInTransaction({
      tx: first.tx,
      db: first.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [before100],
      afterItems: [after80],
      nowMs: 1,
      operationKind: "remove_line_unit",
      externalOperationIdempotencyKey: sharedKey,
      lineIds: [lineId],
    });

    const before80 = { ...after80 };
    const after30 = { ...before100, quantity: 30, qty: 30 };
    const second = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 20, unit: "unit" }) },
      existingMovements: {
        [originalId]: saleMovementFixture({
          restaurantId,
          orderId,
          lineId,
          groupId,
          optionId,
          invProductId,
          sentQuantity: 100,
        }),
        ...Object.fromEntries(first.movementWrites),
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: second.tx,
          db: second.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [before80],
          afterItems: [after30],
          nowMs: 2,
          operationKind: "remove_line_unit",
          externalOperationIdempotencyKey: sharedKey,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(second.movementWrites.size, 0);
  });
});

describe("modifier stock reversal strict ledger integrity (Codex)", () => {
  const restaurantId = "rest-codex-integrity";
  const orderId = "order-codex-integrity";
  const lineId = "line-codex-integrity";
  const invProductId = "inv-codex-integrity";
  const groupId = "grp-codex-integrity";
  const optionId = "opt-codex-integrity";

  function buildOriginal(sentQuantity = 5) {
    return buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity,
    });
  }

  function buildValidPriorReversal(params: {
    originalMovementId: string;
    operationIdempotencyKey: string;
    reversedSaleUnits: number;
  }) {
    const inventoryQuantityPerUnit = 1;
    const inventoryUnit = "unit";
    const quantityDelta = params.reversedSaleUnits * inventoryQuantityPerUnit;
    const movementId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: params.originalMovementId,
      operationIdempotencyKey: params.operationIdempotencyKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    return {
      movementId,
      data: {
        restaurantId,
        orderId,
        lineId,
        sentSegmentLineId: lineId,
        type: "modifier_sale_reversal",
        source: "modifier_sale_reversal",
        applied: true,
        productId: invProductId,
        modifierGroupId: groupId,
        modifierOptionId: optionId,
        reversalOfMovementId: params.originalMovementId,
        selectionOccurrence: 0,
        operationIdempotencyKey: params.operationIdempotencyKey,
        movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
        quantityDelta,
        inventoryQuantityPerUnit,
        unit: inventoryUnit,
        reversedSaleUnits: params.reversedSaleUnits,
        idempotencyKey: movementId,
        movementFingerprint: buildModifierSaleAggregatedReversalFingerprint({
          schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          reversedSaleUnits: params.reversedSaleUnits,
          inventoryQuantityPerUnit,
          inventoryUnit,
          quantityDelta,
        }),
        productName: "Inv",
      },
    };
  }

  async function expectLedgerConflict(run: () => Promise<unknown>, label: string) {
    await assert.rejects(run, (error: unknown) => {
      assert.equal(error instanceof Error, true, label);
      assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR, label);
      return true;
    });
  }

  test("B20. retry aborts when current valid op plus other reversal exceeds consumption", async () => {
    const original = buildOriginal(5);
    const other = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: "prior-remove-5",
      reversedSaleUnits: 5,
    });
    const current = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: buildModifierReversalOperationIdempotencyKey({
        operationKind: "remove_line_unit",
        restaurantId,
        orderId,
        lineId,
        beforeRemaining: 5,
        afterRemaining: 3,
      }),
      reversedSaleUnits: 2,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 5,
    });
    const afterLine = { ...beforeLine, quantity: 3, qty: 3 };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [original.movementId]: original.data,
        [other.movementId]: other.data,
        [current.movementId]: current.data,
      },
    });
    await expectLedgerConflict(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [afterLine],
          nowMs: 1,
          operationKind: "remove_line_unit",
          lineIds: [lineId],
        }),
      "retry global excess",
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("B22. retry stays idempotent when global ledger balance is correct", async () => {
    const original = buildOriginal(5);
    const other = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: "prior-remove-3",
      reversedSaleUnits: 3,
    });
    const current = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: buildModifierReversalOperationIdempotencyKey({
        operationKind: "remove_line_unit",
        restaurantId,
        orderId,
        lineId,
        beforeRemaining: 5,
        afterRemaining: 3,
      }),
      reversedSaleUnits: 2,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 5,
    });
    const afterLine = { ...beforeLine, quantity: 3, qty: 3 };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 2, unit: "unit" }) },
      existingMovements: {
        [original.movementId]: original.data,
        [other.movementId]: other.data,
        [current.movementId]: current.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [afterLine],
      nowMs: 1,
      operationKind: "remove_line_unit",
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("A17. decimal reversedSaleUnits in prior reversal aborts with conflict", async () => {
    const original = buildOriginal(2);
    const reversal = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: "decimal-units",
      reversedSaleUnits: 1,
    });
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [original.movementId]: original.data,
          [reversal.movementId]: { ...reversal.data, reversedSaleUnits: 1.5, quantityDelta: 1.5 },
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 2,
          }),
        ],
        afterItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        nowMs: 1,
        lineIds: [lineId],
      });
    }, "decimal reversedSaleUnits");
  });

  test("A18-A19. zero and negative reversedSaleUnits abort with conflict", async () => {
    for (const [label, reversedSaleUnits, quantityDelta] of [
      ["zero", 0, 0],
      ["negative", -1, -1],
    ] as const) {
      const original = buildOriginal(2);
      const reversal = buildValidPriorReversal({
        originalMovementId: original.movementId,
        operationIdempotencyKey: `${label}-units`,
        reversedSaleUnits: 1,
      });
      await expectLedgerConflict(async () => {
        const mock = createStockApplyMock({
          products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
          existingMovements: {
            [original.movementId]: original.data,
            [reversal.movementId]: { ...reversal.data, reversedSaleUnits, quantityDelta },
          },
        });
        await applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [
            sentLineWithInventoryModifier({
              lineId,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 2,
            }),
          ],
          afterItems: [
            sentLineWithInventoryModifier({
              lineId,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 1,
            }),
          ],
          nowMs: 1,
          lineIds: [lineId],
        });
      }, label);
    }
  });

  test("A11. missing operationIdempotencyKey in prior reversal aborts with conflict", async () => {
    const original = buildOriginal(2);
    const reversal = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: "missing-op-key",
      reversedSaleUnits: 1,
    });
    const corrupt = { ...reversal.data, operationIdempotencyKey: undefined as unknown as string };
    delete (corrupt as { operationIdempotencyKey?: string }).operationIdempotencyKey;
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [original.movementId]: original.data,
          [reversal.movementId]: corrupt,
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 2,
          }),
        ],
        afterItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        nowMs: 1,
        lineIds: [lineId],
      });
    }, "missing operationIdempotencyKey");
  });

  test("A12. non-deterministic reversal document id aborts with conflict", async () => {
    const original = buildOriginal(2);
    const reversal = buildValidPriorReversal({
      originalMovementId: original.movementId,
      operationIdempotencyKey: "manual-doc",
      reversedSaleUnits: 1,
    });
    const manualId = "modifier_sale_reversal_v3_manual00000000000000000000";
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [original.movementId]: original.data,
          [manualId]: { ...reversal.data, idempotencyKey: manualId },
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 2,
          }),
        ],
        afterItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        nowMs: 1,
        lineIds: [lineId],
      });
    }, "non-deterministic reversal id");
  });

  test("C24-C25. original source mismatch aborts; wrong type at deterministic id aborts", async () => {
    const original = buildOriginal(1);
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [original.movementId]: { ...original.data, source: "manual_adjustment" },
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        afterItems: [
          {
            ...sentLineWithInventoryModifier({
              lineId,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 1,
            }),
            status: "cancelled",
            quantity: 0,
            qty: 0,
          },
        ],
        nowMs: 1,
        lineIds: [lineId],
      });
    }, "source incorrect");

    const originalTypeMismatch = buildOriginal(1);
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [originalTypeMismatch.movementId]: {
            ...originalTypeMismatch.data,
            type: "manual_adjustment",
          },
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        afterItems: [
          {
            ...sentLineWithInventoryModifier({
              lineId,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 1,
            }),
            status: "cancelled",
            quantity: 0,
            qty: 0,
          },
        ],
        nowMs: 1,
        lineIds: [lineId],
      });
    }, "type incorrect at deterministic id");
  });

  test("C32. corrupt original at deterministic id never treated as absence", async () => {
    const original = buildOriginal(1);
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [original.movementId]: { ...original.data, applied: false },
      },
    });
    await expectLedgerConflict(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [
            sentLineWithInventoryModifier({
              lineId,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 1,
            }),
          ],
          afterItems: [
            {
              ...sentLineWithInventoryModifier({
                lineId,
                productId: "prod-1",
                groupId,
                optionId,
                inventoryProductId: invProductId,
                quantity: 1,
              }),
              status: "cancelled",
              quantity: 0,
              qty: 0,
            },
          ],
          nowMs: 1,
          lineIds: [lineId],
        }),
      "corrupt original not absence",
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("D33. real absence at expected ids does not invent reversal", async () => {
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [
        sentLineWithInventoryModifier({
          lineId,
          productId: "prod-1",
          groupId,
          optionId,
          inventoryProductId: invProductId,
          quantity: 1,
        }),
      ],
      afterItems: [
        {
          ...sentLineWithInventoryModifier({
            lineId,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
          status: "cancelled",
          quantity: 0,
          qty: 0,
        },
      ],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("E36/C29. selectionOccurrence incompatible with deterministic original id aborts", async () => {
    const lineA = `${lineId}-a`;
    const lineB = `${lineId}-b`;
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineA,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const second = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineB,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    await expectLedgerConflict(async () => {
      const mock = createStockApplyMock({
        products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
        existingMovements: {
          [first.movementId]: first.data,
          [second.movementId]: { ...second.data, selectionOccurrence: 0 },
        },
      });
      await applyModifierStockReversalInTransaction({
        tx: mock.tx,
        db: mock.db,
        restaurantId,
        orderId,
        actorUid: "uid-1",
        beforeItems: [
          sentLineWithInventoryModifier({
            lineId: lineA,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
          sentLineWithInventoryModifier({
            lineId: lineB,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        afterItems: [
          {
            ...sentLineWithInventoryModifier({
              lineId: lineA,
              productId: "prod-1",
              groupId,
              optionId,
              inventoryProductId: invProductId,
              quantity: 1,
            }),
            status: "cancelled",
            quantity: 0,
            qty: 0,
          },
          sentLineWithInventoryModifier({
            lineId: lineB,
            productId: "prod-1",
            groupId,
            optionId,
            inventoryProductId: invProductId,
            quantity: 1,
          }),
        ],
        nowMs: 1,
        lineIds: [lineA, lineB],
      });
    }, "selectionOccurrence incompatible with probe id");
  });
});

describe("modifier stock reversal original lookup scalability (BLOCK 1 query)", () => {
  const restaurantId = "rest-scale-query";
  const orderId = "order-scale-query";
  const groupId = "grp-scale-query";
  const optionId = "opt-scale-query";
  const invProductId = "inv-scale-query";

  function readTestLineId(line: Record<string, unknown>): string {
    return typeof line.id === "string" ? line.id.trim() : "";
  }

  function buildSharedModifierLines(params: {
    lineCount: number;
    lineIdPrefix: string;
    sentQuantity?: number;
  }) {
    const sentQuantity = params.sentQuantity ?? 1;
    const lines: Record<string, unknown>[] = [];
    const movements: Record<string, Record<string, unknown>> = {};
    let globalOccurrence = 0;
    for (let index = 0; index < params.lineCount; index += 1) {
      const lineId = `${params.lineIdPrefix}-${index}`;
      lines.push(
        sentLineWithInventoryModifier({
          lineId,
          productId: "prod-1",
          groupId,
          optionId,
          inventoryProductId: invProductId,
          quantity: sentQuantity,
        }),
      );
      const sale = buildValidModifierSaleV2LedgerDocument({
        restaurantId,
        orderId,
        lineId,
        groupId,
        optionId,
        invProductId,
        selectionOccurrence: globalOccurrence,
        sentQuantity,
      });
      globalOccurrence += 1;
      movements[sale.movementId] = sale.data;
    }
    return { lines, movements };
  }

  function cancelledLineFrom(line: Record<string, unknown>) {
    return { ...line, status: "cancelled", quantity: 0, qty: 0 };
  }

  test("A1-A4. cancel one of 50 shared-modifier lines uses one bounded original query", async () => {
    const { lines, movements } = buildSharedModifierLines({
      lineCount: 50,
      lineIdPrefix: "line-scale-50",
    });
    const targetLineId = "line-scale-50-24";
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: movements,
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: lines,
      afterItems: lines.map((line) =>
        readTestLineId(line) === targetLineId ? cancelledLineFrom(line) : line,
      ),
      nowMs: 1,
      lineIds: [targetLineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 1);
    assert.ok(mock.stats.getAllRefCount <= 1, "no candidate-id getAll fan-out");
  });

  test("A1b. valid original in query uses zero fallback direct gets", async () => {
    const lineId = "line-fallback-zero";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: { [sale.movementId]: sale.data },
    });
    await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(mock.stats.originalSaleQueries, 1);
  });

  test("A5-A6. cancel all 50 lines scales linearly with one query per line", async () => {
    const { lines, movements } = buildSharedModifierLines({
      lineCount: 50,
      lineIdPrefix: "line-scale-50-all",
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: movements,
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: lines,
      afterItems: lines.map(cancelledLineFrom),
      nowMs: 1,
    });
    assert.equal(plan.unitsReversed, 50);
    assert.equal(mock.stats.originalSaleQueries, 50);
    assert.equal(mock.stats.originalSaleDocsRead, 50);
    assert.ok(mock.stats.getAllRefCount <= 1, "no candidate-id getAll fan-out");
  });

  test("A7-A8. 100 lines stay within mock transaction limits without candidate id probes", async () => {
    const { lines, movements } = buildSharedModifierLines({
      lineCount: 100,
      lineIdPrefix: "line-scale-100",
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: movements,
    });
    await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: lines,
      afterItems: lines.map(cancelledLineFrom),
      nowMs: 1,
    });
    assert.equal(mock.stats.originalSaleQueries, 100);
    assert.equal(mock.stats.originalSaleDocsRead, 100);
    assert.ok(mock.stats.getAllRefCount <= 1, "no candidate-id getAll fan-out");
    assert.ok(mock.stats.txGets < 500);
  });

  test("B9-B10. one line with 10 modifiers uses a single original query", async () => {
    const lineId = "line-ten-mods";
    const movements: Record<string, Record<string, unknown>> = {};
    const selectedModifiers = Array.from({ length: 10 }, (_, index) => ({
      groupId: `grp-${index}`,
      optionId: `opt-${index}`,
      inventoryProductId: `inv-${index}`,
      inventoryQuantity: 1,
      inventoryUnit: "unit",
    }));
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers,
    };
    let globalOccurrence = 0;
    const products: Record<string, Record<string, unknown>> = {};
    for (const mod of selectedModifiers) {
      const sale = buildValidModifierSaleV2LedgerDocument({
        restaurantId,
        orderId,
        lineId,
        groupId: mod.groupId,
        optionId: mod.optionId,
        invProductId: mod.inventoryProductId,
        selectionOccurrence: globalOccurrence,
        sentQuantity: 1,
      });
      globalOccurrence += 1;
      movements[sale.movementId] = sale.data;
      products[mod.inventoryProductId] = inventoryProductDoc({ currentStock: 0, unit: "unit" });
    }
    const mock = createStockApplyMock({ products, existingMovements: movements });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 10);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 10);
  });

  test("C11-C14. repeated identical modifier occurrences resolve without swapping", async () => {
    const lineId = "line-repeat-mod";
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const second = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers: [
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [first.movementId]: first.data,
        [second.movementId]: second.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 2);
    const written = [...mock.movementWrites.values()];
    assert.equal(written.length, 2);
    const reversedOriginalIds = written.map((row) => row.reversalOfMovementId).sort();
    assert.deepEqual(reversedOriginalIds, [first.movementId, second.movementId].sort());
  });

  test("D15-D17. cancel only the second of two lines with same modifier", async () => {
    const lineA = "line-two-a";
    const lineB = "line-two-b";
    const saleA = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineA,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const saleB = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineB,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const lineAData = sentLineWithInventoryModifier({
      lineId: lineA,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const lineBData = sentLineWithInventoryModifier({
      lineId: lineB,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [lineAData, lineBData],
      afterItems: [lineAData, cancelledLineFrom(lineBData)],
      nowMs: 1,
      lineIds: [lineB],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal([...mock.movementWrites.values()][0]?.reversalOfMovementId, saleB.movementId);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 1);
  });

  test("E20. valid original for another modifier slot on same line does not block cancel", async () => {
    const lineId = "line-other-slot";
    const modA = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId: "grp-a",
      optionId: "opt-a",
      invProductId: "inv-a",
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const modB = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId: "grp-b",
      optionId: "opt-b",
      invProductId: "inv-b",
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers: [
        {
          groupId: "grp-a",
          optionId: "opt-a",
          inventoryProductId: "inv-a",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const mock = createStockApplyMock({
      products: {
        "inv-a": inventoryProductDoc({ currentStock: 0, unit: "unit" }),
        "inv-b": inventoryProductDoc({ currentStock: 0, unit: "unit" }),
      },
      existingMovements: {
        [modA.movementId]: modA.data,
        [modB.movementId]: modB.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal([...mock.movementWrites.values()][0]?.reversalOfMovementId, modA.movementId);
  });

  test("E21. corrupt original on queried line aborts with conflict", async () => {
    const lineId = "line-corrupt-query";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [sale.movementId]: { ...sale.data, applied: false },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
  });

  test("E22. duplicate valid originals for same logical slot abort with conflict", async () => {
    const lineId = "line-dup-slot";
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const forgedId = "modifier_sale_v2_dup000000000000000000000000";
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [first.movementId]: first.data,
        [forgedId]: { ...first.data, idempotencyKey: forgedId },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
  });

  test("F25-F27. query with no originals keeps legacy no-op contract", async () => {
    const lineId = "line-no-original";
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 0);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 0);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("G32. quantity 500 does not increase original lookup reads", async () => {
    const lineId = "line-qty-500";
    const qty = 500;
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: qty,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: qty,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: { [sale.movementId]: sale.data },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, qty);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 1);
  });
});

describe("modifier stock reversal original lookup direct get fallback (BLOCK 2)", () => {
  const restaurantId = "rest-block2-fallback";
  const orderId = "order-block2-fallback";
  const groupId = "grp-block2-fallback";
  const optionId = "opt-block2-fallback";
  const invProductId = "inv-block2-fallback";

  function cancelledLineFrom(line: Record<string, unknown>) {
    return { ...line, status: "cancelled", quantity: 0, qty: 0 };
  }

  test("B3. deterministic id with wrong type triggers conflict via direct get", async () => {
    const lineId = "line-type-corrupt";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [sale.movementId]: { ...sale.data, type: "manual_adjustment" },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("B4-B6. wrong source, fingerprint and quantityDelta at deterministic id abort", async () => {
    const lineId = "line-direct-corrupt-fields";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });

    for (const corrupt of [
      { ...sale.data, source: "manual_adjustment" },
      { ...sale.data, movementFingerprint: "corrupt-fingerprint" },
      { ...sale.data, quantityDelta: -999 },
    ]) {
      await assert.rejects(
        async () => {
          const mock = createStockApplyMock({
            products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
            existingMovements: { [sale.movementId]: corrupt },
          });
          await applyModifierStockReversalInTransaction({
            tx: mock.tx,
            db: mock.db,
            restaurantId,
            orderId,
            actorUid: "uid-1",
            beforeItems: [beforeLine],
            afterItems: [cancelledLineFrom(beforeLine)],
            nowMs: 1,
            lineIds: [lineId],
          });
        },
        (error: unknown) => {
          assert.equal(error instanceof Error, true);
          assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
          return true;
        },
      );
    }
  });

  test("B7. query and direct get for same document do not duplicate candidates", async () => {
    const lineId = "line-dedupe-query-direct";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: { [sale.movementId]: sale.data },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal([...mock.movementWrites.values()].length, 1);
  });

  test("B8. two distinct documents for same slot abort with conflict", async () => {
    const lineId = "line-two-docs-slot";
    const valid = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const forgedId = "modifier_sale_v2_forge0000000000000000000000";
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [valid.movementId]: valid.data,
        [forgedId]: {
          ...valid.data,
          idempotencyKey: forgedId,
          selectionOccurrence: 0,
        },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
  });

  test("B9-B11. ten modifiers on one line stay at one query with proportional fallback", async () => {
    const lineId = "line-ten-fallback";
    const selectedModifiers = Array.from({ length: 10 }, (_, index) => ({
      groupId: `grp-${index}`,
      optionId: `opt-${index}`,
      inventoryProductId: `inv-${index}`,
      inventoryQuantity: 1,
      inventoryUnit: "unit",
    }));
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers,
    };
    const movements: Record<string, Record<string, unknown>> = {};
    const products: Record<string, Record<string, unknown>> = {};
    for (let index = 0; index < selectedModifiers.length; index += 1) {
      const mod = selectedModifiers[index]!;
      const sale = buildValidModifierSaleV2LedgerDocument({
        restaurantId,
        orderId,
        lineId,
        groupId: mod.groupId,
        optionId: mod.optionId,
        invProductId: mod.inventoryProductId,
        selectionOccurrence: 0,
        sentQuantity: 1,
      });
      if (index === 4) {
        movements[sale.movementId] = { ...sale.data, type: "manual_adjustment" };
      } else {
        movements[sale.movementId] = sale.data;
      }
      products[mod.inventoryProductId] = inventoryProductDoc({ currentStock: 0, unit: "unit" });
    }
    const mock = createStockApplyMock({ products, existingMovements: movements });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.stats.originalSaleQueries, 1);
  });

  test("B12. repeated identical modifier keeps occurrence 0 and 1 without swap", async () => {
    const lineId = "line-repeat-fallback";
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const second = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers: [
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [first.movementId]: first.data,
        [second.movementId]: { ...second.data, type: "manual_adjustment" },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
  });
});

describe("modifier stock reversal order immutability audit", () => {
  const restaurantId = "rest-audit-order";
  const orderId = "order-audit-order";
  const groupId = "grp-audit-order";
  const optionId = "opt-audit-order";
  const invProductId = "inv-audit-order";

  function cancelledLineFrom(line: Record<string, unknown>) {
    return { ...line, status: "cancelled", quantity: 0, qty: 0 };
  }

  test("A1-A5. sequential-send lines with same mod resolve via query by lineId", async () => {
    const lineA = "line-seq-a";
    const lineB = "line-seq-b";
    const saleA = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineA,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const saleB = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineB,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const lineAData = sentLineWithInventoryModifier({
      lineId: lineA,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const lineBData = sentLineWithInventoryModifier({
      lineId: lineB,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const cancelA = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [lineAData, lineBData],
      afterItems: [cancelledLineFrom(lineAData), lineBData],
      nowMs: 1,
      lineIds: [lineA],
    });
    assert.equal(cancelA.unitsReversed, 1);
    assert.equal([...mock.movementWrites.values()][0]?.reversalOfMovementId, saleA.movementId);

    const cancelB = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [cancelledLineFrom(lineAData), lineBData],
      afterItems: [cancelledLineFrom(lineAData), cancelledLineFrom(lineBData)],
      nowMs: 2,
      lineIds: [lineB],
    });
    assert.equal(cancelB.unitsReversed, 1);
    const reversals = [...mock.movementWrites.values()];
    assert.equal(reversals[1]?.reversalOfMovementId, saleB.movementId);
  });

  test("B6-B9. reversed beforeItems still resolves via line-scoped query", async () => {
    const lineA = "line-rev-a";
    const lineB = "line-rev-b";
    const saleA = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineA,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const saleB = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineB,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const lineAData = sentLineWithInventoryModifier({
      lineId: lineA,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const lineBData = sentLineWithInventoryModifier({
      lineId: lineB,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: saleB.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [lineBData, lineAData],
      afterItems: [cancelledLineFrom(lineBData), lineAData],
      nowMs: 1,
      lineIds: [lineB],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal([...mock.movementWrites.values()][0]?.reversalOfMovementId, saleB.movementId);
  });

  test("C10-C13. two-line same mod with hidden original aborts instead of legacy absence", async () => {
    const lineA = "line-hide-a";
    const lineB = "line-hide-b";
    const saleA = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineA,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const saleB = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId: lineB,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const lineAData = sentLineWithInventoryModifier({
      lineId: lineA,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const lineBData = sentLineWithInventoryModifier({
      lineId: lineB,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [saleA.movementId]: saleA.data,
        [saleB.movementId]: { ...saleB.data, type: "manual_adjustment" },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [lineAData, lineBData],
          afterItems: [lineAData, cancelledLineFrom(lineBData)],
          nowMs: 1,
          lineIds: [lineB],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("E17-E20. repeated modifier order on line matches consumption array order", async () => {
    const lineId = "line-repeat-order";
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const second = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 1,
      sentQuantity: 1,
    });
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers: [
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [first.movementId]: first.data,
        [second.movementId]: second.data,
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 2);
    const reversedIds = [...mock.movementWrites.values()]
      .map((row) => row.reversalOfMovementId)
      .sort();
    assert.deepEqual(reversedIds, [first.movementId, second.movementId].sort());
  });

  test("F21-F24. single-line hidden original still conflicts via line query", async () => {
    const lineId = "line-single-hide";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [sale.movementId]: { ...sale.data, type: "manual_adjustment" },
      },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.directDocGets, 0);
  });
});

describe("modifier stock reversal line-scoped lookup (no type filter)", () => {
  const restaurantId = "rest-line-scope";
  const orderId = "order-line-scope";
  const groupId = "grp-line-scope";
  const optionId = "opt-line-scope";
  const invProductId = "inv-line-scope";

  function cancelledLineFrom(line: Record<string, unknown>) {
    return { ...line, status: "cancelled", quantity: 0, qty: 0 };
  }

  test("C7-C11. original with coexisting reversal and unrelated movement on line", async () => {
    const lineId = "line-with-reversal";
    const sale = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      sentQuantity: 1,
    });
    const reversalId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId,
      orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: "other-original-id",
      operationIdempotencyKey: "prior-reversal-unrelated",
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const beforeLine = sentLineWithInventoryModifier({
      lineId,
      productId: "prod-1",
      groupId,
      optionId,
      inventoryProductId: invProductId,
      quantity: 1,
    });
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: {
        [sale.movementId]: sale.data,
        [reversalId]: {
          restaurantId,
          orderId,
          lineId,
          type: "modifier_sale_reversal",
          source: "modifier_sale_reversal",
          applied: true,
          reversalOfMovementId: "other-original-id",
          selectionOccurrence: 0,
          reversedSaleUnits: 1,
        },
        "manual-line-move": {
          restaurantId,
          orderId,
          lineId,
          type: "manual_adjustment",
          source: "manual_adjustment",
          applied: true,
          quantityDelta: 1,
        },
      },
    });
    const plan = await applyModifierStockReversalInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId,
      orderId,
      actorUid: "uid-1",
      beforeItems: [beforeLine],
      afterItems: [cancelledLineFrom(beforeLine)],
      nowMs: 1,
      lineIds: [lineId],
    });
    assert.equal(plan.unitsReversed, 1);
    assert.equal(mock.stats.originalSaleQueries, 1);
    assert.equal(mock.stats.originalSaleDocsRead, 3);
    assert.equal(mock.stats.directDocGets, 1);
  });

  test("E23-E26. partial original evidence for repeated slots aborts", async () => {
    const lineId = "line-partial-pool";
    const first = buildValidModifierSaleV2LedgerDocument({
      restaurantId,
      orderId,
      lineId,
      groupId,
      optionId,
      invProductId,
      selectionOccurrence: 0,
      sentQuantity: 1,
    });
    const beforeLine = {
      id: lineId,
      status: "sent",
      quantity: 1,
      productId: "prod-1",
      selectedModifiers: [
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
        {
          groupId,
          optionId,
          inventoryProductId: invProductId,
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const mock = createStockApplyMock({
      products: { [invProductId]: inventoryProductDoc({ currentStock: 0, unit: "unit" }) },
      existingMovements: { [first.movementId]: first.data },
    });
    await assert.rejects(
      () =>
        applyModifierStockReversalInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId,
          orderId,
          actorUid: "uid-1",
          beforeItems: [beforeLine],
          afterItems: [cancelledLineFrom(beforeLine)],
          nowMs: 1,
          lineIds: [lineId],
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
        return true;
      },
    );
  });
});