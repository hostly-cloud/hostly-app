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
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  assertExistingModifierSaleMovementIsValidForIdempotentSkip,
  buildModifierSaleMovementFingerprint,
  buildModifierSaleV2MovementId,
  STOCK_MOVEMENT_ID_CONFLICT,
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

function createStockApplyMock(params: {
  products: Record<string, Record<string, unknown>>;
  existingMovements?: Record<string, Record<string, unknown>>;
}) {
  const movementWrites = new Map<string, Record<string, unknown>>();
  const productUpdates = new Map<string, Record<string, unknown>>();
  const refKinds = new Map<string, "movement" | "product">();

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
              };
            },
          };
        },
      };
    },
  } as unknown as Firestore;

  const tx = {
    async getAll(...refs: Array<{ id: string }>) {
      return refs.map((ref) => {
        const kind = refKinds.get(ref.id);
        if (kind === "movement") {
          const data = params.existingMovements?.[ref.id];
          return { exists: Boolean(data), data: () => data, id: ref.id };
        }
        const data = params.products[ref.id];
        return { exists: Boolean(data), data: () => data, id: ref.id };
      });
    },
    set(ref: { id: string }, data: Record<string, unknown>) {
      movementWrites.set(ref.id, data);
    },
    update(ref: { id: string }, data: Record<string, unknown>) {
      productUpdates.set(ref.id, data);
    },
  } as unknown as Transaction;

  return { db, tx, movementWrites, productUpdates };
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

const EXISTING_MOVEMENT_RESTAURANT = "rest-existing-movement";
const EXISTING_ORDER_ID = "order-existing-1";
const EXISTING_LINE_ID = "line-existing-1";
const EXISTING_GROUP_ID = "grp-existing-1";
const EXISTING_OPTION_ID = "opt-existing-1";
const EXISTING_INV_PRODUCT_ID = "inv-existing-1";
const EXISTING_SALE_PRODUCT_ID = "sale-existing-1";

function existingMovementIdentity() {
  return {
    restaurantId: EXISTING_MOVEMENT_RESTAURANT,
    orderId: EXISTING_ORDER_ID,
    sentSegmentLineId: EXISTING_LINE_ID,
    modifierGroupId: EXISTING_GROUP_ID,
    modifierOptionId: EXISTING_OPTION_ID,
    inventoryProductId: EXISTING_INV_PRODUCT_ID,
    selectionOccurrence: 0,
  };
}

function existingMovementFingerprint(sentQuantity = 1) {
  const inventoryQuantityPerUnit = 1;
  const inventoryUnit = "unit";
  const quantityDelta = -inventoryQuantityPerUnit * sentQuantity;
  return buildModifierSaleMovementFingerprint({
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
}

function existingMovementId(sentQuantity = 1) {
  return buildModifierSaleV2MovementId(existingMovementIdentity());
}

function buildValidExistingServerMovement(
  stockBefore: number,
  stockAfter: number,
  overrides: Record<string, unknown> = {},
) {
  const sentQuantity = 1;
  const inventoryQuantityPerUnit = 1;
  const inventoryUnit = "unit";
  const quantityDelta = -1;
  const movementId = existingMovementId();
  return {
    restaurantId: EXISTING_MOVEMENT_RESTAURANT,
    productId: EXISTING_INV_PRODUCT_ID,
    productName: EXISTING_INV_PRODUCT_ID,
    source: "modifier_sale",
    type: "modifier_sale",
    orderId: EXISTING_ORDER_ID,
    lineId: EXISTING_LINE_ID,
    sentSegmentLineId: EXISTING_LINE_ID,
    saleProductId: EXISTING_SALE_PRODUCT_ID,
    saleProductName: "Sale",
    modifierGroupId: EXISTING_GROUP_ID,
    modifierOptionId: EXISTING_OPTION_ID,
    modifierOptionName: EXISTING_OPTION_ID,
    quantityDelta,
    unit: inventoryUnit,
    idempotencyKey: movementId,
    applied: true,
    appliedAt: 1,
    movementFingerprint: existingMovementFingerprint(sentQuantity),
    sentQuantity,
    inventoryQuantityPerUnit,
    selectionOccurrence: 0,
    stockBefore,
    stockAfter,
    ...overrides,
  };
}

function createExistingMovementApplyFixture(
  existingMovements: Record<string, Record<string, unknown>> | undefined,
  productCurrentStock = 10,
) {
  const mock = createStockApplyMock({
    products: {
      [EXISTING_INV_PRODUCT_ID]: {
        restaurantId: EXISTING_MOVEMENT_RESTAURANT,
        active: true,
        inventory: { enabled: true, unit: "unit", currentStock: productCurrentStock },
      },
    },
    existingMovements,
  });
  const beforeItems = [{ id: EXISTING_LINE_ID, status: "pending", quantity: 1 }];
  const afterItems = [
    sentLineWithInventoryModifier({
      lineId: EXISTING_LINE_ID,
      productId: EXISTING_SALE_PRODUCT_ID,
      groupId: EXISTING_GROUP_ID,
      optionId: EXISTING_OPTION_ID,
      inventoryProductId: EXISTING_INV_PRODUCT_ID,
    }),
  ];
  return { ...mock, beforeItems, afterItems };
}

async function applyExistingMovementScenario(
  existingMovements: Record<string, Record<string, unknown>> | undefined,
  productCurrentStock = 10,
) {
  const fixture = createExistingMovementApplyFixture(existingMovements, productCurrentStock);
  return {
    fixture,
    plan: await applyInitialModifierStockConsumptionInTransaction({
      tx: fixture.tx,
      db: fixture.db,
      restaurantId: EXISTING_MOVEMENT_RESTAURANT,
      orderId: EXISTING_ORDER_ID,
      actorUid: "uid-server",
      beforeItems: fixture.beforeItems,
      afterItems: fixture.afterItems,
      nowMs: 1_700_000_000_000,
    }),
  };
}

describe("existing modifier_sale movement idempotency validation (6C3)", () => {
  test("1. first legitimate consumption creates movement and decrements stock once", async () => {
    const { fixture, plan } = await applyExistingMovementScenario(undefined, 10);
    assert.equal(fixture.movementWrites.size, 1);
    assert.equal(fixture.productUpdates.size, 1);
    assert.equal(plan.movementIds.length, 1);
    const movement = [...fixture.movementWrites.values()][0];
    assert.equal(movement?.stockBefore, 10);
    assert.equal(movement?.stockAfter, 9);
    const productUpdate = fixture.productUpdates.get(EXISTING_INV_PRODUCT_ID);
    assert.equal(
      (productUpdate?.inventory as Record<string, unknown> | undefined)?.currentStock,
      9,
    );
  });

  test("2. legitimate retry accepts existing server movement without second decrement", async () => {
    const movementId = existingMovementId();
    const existing = buildValidExistingServerMovement(10, 9);
    const { fixture, plan } = await applyExistingMovementScenario(
      { [movementId]: existing },
      9,
    );
    assert.equal(fixture.movementWrites.size, 0);
    assert.equal(fixture.productUpdates.size, 0);
    assert.deepEqual(plan.movementIds, [movementId]);
  });

  test("3. two distinct modifiers produce distinct movement ids and both decrement", async () => {
    const invA = "inv-existing-a";
    const invB = "inv-existing-b";
    const mock = createStockApplyMock({
      products: {
        [invA]: {
          active: true,
          inventory: { enabled: true, unit: "unit", currentStock: 10 },
        },
        [invB]: {
          active: true,
          inventory: { enabled: true, unit: "unit", currentStock: 20 },
        },
      },
    });
    const afterItems = [
      {
        id: EXISTING_LINE_ID,
        status: "sent",
        quantity: 1,
        productId: EXISTING_SALE_PRODUCT_ID,
        selectedModifiers: [
          {
            groupId: "grp-a",
            optionId: "opt-a",
            inventoryProductId: invA,
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
          {
            groupId: "grp-b",
            optionId: "opt-b",
            inventoryProductId: invB,
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      },
    ];
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: EXISTING_MOVEMENT_RESTAURANT,
      orderId: EXISTING_ORDER_ID,
      actorUid: "uid-server",
      beforeItems: [{ id: EXISTING_LINE_ID, status: "pending", quantity: 1 }],
      afterItems,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(mock.movementWrites.size, 2);
    assert.equal(mock.productUpdates.size, 2);
    assert.equal(plan.movementIds.length, 2);
    assert.notEqual(plan.movementIds[0], plan.movementIds[1]);
  });

  test("4. repeated modifier selection uses distinct selectionOccurrence movement ids", async () => {
    const mock = createStockApplyMock({
      products: {
        [EXISTING_INV_PRODUCT_ID]: {
          active: true,
          inventory: { enabled: true, unit: "unit", currentStock: 10 },
        },
      },
    });
    const afterItems = [
      {
        id: EXISTING_LINE_ID,
        status: "sent",
        quantity: 1,
        productId: EXISTING_SALE_PRODUCT_ID,
        selectedModifiers: [
          {
            groupId: EXISTING_GROUP_ID,
            optionId: EXISTING_OPTION_ID,
            inventoryProductId: EXISTING_INV_PRODUCT_ID,
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
          {
            groupId: EXISTING_GROUP_ID,
            optionId: EXISTING_OPTION_ID,
            inventoryProductId: EXISTING_INV_PRODUCT_ID,
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      },
    ];
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: EXISTING_MOVEMENT_RESTAURANT,
      orderId: EXISTING_ORDER_ID,
      actorUid: "uid-server",
      beforeItems: [{ id: EXISTING_LINE_ID, status: "pending", quantity: 1 }],
      afterItems,
      nowMs: 1_700_000_000_000,
    });
    assert.equal(mock.movementWrites.size, 2);
    assert.equal(plan.movementIds.length, 2);
    assert.notEqual(plan.movementIds[0], plan.movementIds[1]);
  });

  test("5. conflict aborts apply and leaves writes untouched", async () => {
    const movementId = existingMovementId();
    await assert.rejects(
      () =>
        applyExistingMovementScenario(
          { [movementId]: { restaurantId: EXISTING_MOVEMENT_RESTAURANT } },
          10,
        ),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("6. rejects minimal preseed document", async () => {
    const movementId = existingMovementId();
    await assert.rejects(
      () =>
        applyExistingMovementScenario(
          { [movementId]: { restaurantId: EXISTING_MOVEMENT_RESTAURANT } },
          10,
        ),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("7. rejects missing fingerprint", async () => {
    const movementId = existingMovementId();
    const doc = { ...buildValidExistingServerMovement(10, 9) } as Record<string, unknown>;
    delete doc.movementFingerprint;
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("8. rejects different fingerprint", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, {
      movementFingerprint: existingMovementFingerprint(99),
      sentQuantity: 99,
      quantityDelta: -99,
    });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("9. rejects correct fingerprint without full schema", async () => {
    const movementId = existingMovementId();
    await assert.rejects(
      () =>
        applyExistingMovementScenario(
          {
            [movementId]: {
              restaurantId: EXISTING_MOVEMENT_RESTAURANT,
              movementFingerprint: existingMovementFingerprint(),
            },
          },
          10,
        ),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("10. rejects wrong restaurantId", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, { restaurantId: "other-rest" });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("11. rejects wrong inventory productId", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, { productId: "other-inv" });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("12. rejects wrong orderId", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, { orderId: "other-order" });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("13. rejects wrong lineId", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, {
      lineId: "other-line",
      sentSegmentLineId: "other-line",
    });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("14. rejects wrong quantityDelta", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, { quantityDelta: -2 });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("15. rejects missing stockBefore/stockAfter", async () => {
    const movementId = existingMovementId();
    const doc = { ...buildValidExistingServerMovement(10, 9) } as Record<string, unknown>;
    delete doc.stockBefore;
    delete doc.stockAfter;
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("16. rejects non-numeric stockBefore", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9, { stockBefore: "10" });
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 9),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("17. rejects incoherent stockBefore/stockAfter math", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 8);
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 8),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("18. rejects valid movement when product stock does not match stockAfter", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, 9);
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 10),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("19. rejects NaN stockAfter", async () => {
    const movementId = existingMovementId();
    const doc = buildValidExistingServerMovement(10, Number.NaN);
    await assert.rejects(
      () => applyExistingMovementScenario({ [movementId]: doc }, 10),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
  });

  test("20. direct helper accepts a fully valid existing movement", () => {
    assert.doesNotThrow(() =>
      assertExistingModifierSaleMovementIsValidForIdempotentSkip({
        movementId: existingMovementId(),
        existing: buildValidExistingServerMovement(10, 9),
        expectedFingerprint: existingMovementFingerprint(),
        restaurantId: EXISTING_MOVEMENT_RESTAURANT,
        orderId: EXISTING_ORDER_ID,
        sentSegmentLineId: EXISTING_LINE_ID,
        inventoryProductId: EXISTING_INV_PRODUCT_ID,
        modifierGroupId: EXISTING_GROUP_ID,
        modifierOptionId: EXISTING_OPTION_ID,
        selectionOccurrence: 0,
        sentQuantity: 1,
        inventoryQuantityPerUnit: 1,
        inventoryUnit: "unit",
        quantityDelta: -1,
        productCurrentStock: 9,
        productUnit: "unit",
      }),
    );
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
