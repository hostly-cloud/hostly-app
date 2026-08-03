import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { join } from "node:path";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  assertExistingRecipeSaleMovementIsValidForIdempotentSkip,
  buildRecipeSaleMovementFingerprint,
  buildRecipeSaleV2MovementId,
  STOCK_MOVEMENT_ID_CONFLICT,
} from "@/lib/inventory/recipe-sale-movement-identity";
import { convertInventoryQuantity, roundInventoryQuantity } from "@/lib/inventory/unit-conversions";
import {
  applyInitialRecipeStockConsumptionInTransaction,
  buildPendingRecipeWrites,
  validateRecipeInventoryProduct,
} from "@/lib/server/tpv/plan-initial-recipe-stock-consumption";
import { applyInitialModifierStockConsumptionInTransaction } from "@/lib/server/tpv/plan-initial-modifier-stock-consumption";
import { buildModifierSaleV2MovementId } from "@/lib/inventory/modifier-sale-movement-identity";

const RECIPE_REST = "rest-recipe-p1";
const RECIPE_ORDER = "order-recipe-p1";
const RECIPE_LINE = "line-recipe-p1";
const RECIPE_SALE = "sale-recipe-p1";
const RECIPE_INV_A = "inv-recipe-a";
const RECIPE_INV_B = "inv-recipe-b";

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

  const allMovements = () => ({
    ...(params.existingMovements ?? {}),
    ...Object.fromEntries(movementWrites),
  });

  const tx = {
    async getAll(...refs: Array<{ id: string }>) {
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
    },
    update(ref: { id: string }, data: Record<string, unknown>) {
      productUpdates.set(ref.id, data);
      const prev = params.products[ref.id] ?? {};
      const prevInv =
        prev.inventory && typeof prev.inventory === "object"
          ? (prev.inventory as Record<string, unknown>)
          : {};
      const nextInv =
        data.inventory && typeof data.inventory === "object"
          ? (data.inventory as Record<string, unknown>)
          : {};
      params.products[ref.id] = {
        ...prev,
        ...data,
        inventory: { ...prevInv, ...nextInv },
      };
    },
  } as unknown as Transaction;

  return { db, tx, movementWrites, productUpdates };
}

function recipeSaleProduct(params: {
  enabled?: boolean;
  ingredients?: Array<{
    productId: string;
    quantity: number;
    unit: string;
    name?: string;
  }>;
  restaurantId?: string;
}) {
  return {
    restaurantId: params.restaurantId ?? RECIPE_REST,
    name: "Plato receta",
    active: true,
    recipe: {
      enabled: params.enabled !== false,
      ingredients: params.ingredients ?? [],
    },
  };
}

function recipeInventoryProduct(overrides: {
  id?: string;
  currentStock?: unknown;
  unit?: string;
  active?: boolean;
  enabled?: boolean;
  restaurantId?: string;
} = {}) {
  return {
    restaurantId: overrides.restaurantId ?? RECIPE_REST,
    active: overrides.active !== false,
    name: overrides.id ?? "ing",
    inventory: {
      enabled: overrides.enabled !== false,
      unit: overrides.unit ?? "ud",
      currentStock: overrides.currentStock ?? 10,
    },
  };
}

function recipeSegmentLine(quantity = 1, lineId = RECIPE_LINE, productId = RECIPE_SALE) {
  return {
    id: lineId,
    status: "sent",
    quantity,
    productId,
    productName: "Plato receta",
  };
}

function recipeIdentity(overrides: Partial<{
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  saleProductId: string;
  inventoryProductId: string;
  recipeQuantityPerUnit: number;
  recipeUnit: string;
  ingredientOccurrence: number;
}> = {}) {
  return {
    restaurantId: RECIPE_REST,
    orderId: RECIPE_ORDER,
    sentSegmentLineId: RECIPE_LINE,
    saleProductId: RECIPE_SALE,
    inventoryProductId: RECIPE_INV_A,
    recipeQuantityPerUnit: 1,
    recipeUnit: "unit",
    ingredientOccurrence: 0,
    ...overrides,
  };
}

function recipeFingerprint(params: {
  sentQuantity: number;
  recipeQuantityPerUnit: number;
  inventoryUnit?: string;
  productInventoryUnit?: string;
}) {
  const inventoryUnit = params.inventoryUnit ?? "unit";
  const productInventoryUnit = params.productInventoryUnit ?? inventoryUnit;
  const quantityDelta = roundInventoryQuantity(
    -(params.recipeQuantityPerUnit * params.sentQuantity),
  );
  return buildRecipeSaleMovementFingerprint({
    sentQuantity: params.sentQuantity,
    recipeQuantityPerUnit: params.recipeQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
    productInventoryUnit,
  });
}

function buildValidRecipeServerMovement(params: {
  stockBefore: number;
  stockAfter: number;
  sentQuantity?: number;
  recipeQuantityPerUnit?: number;
  recipeUnit?: string;
  inventoryProductId?: string;
  productInventoryUnit?: string;
  ingredientOccurrence?: number;
}) {
  const sentQuantity = params.sentQuantity ?? 1;
  const recipeQuantityPerUnit = params.recipeQuantityPerUnit ?? 1;
  const inventoryUnit = params.recipeUnit ?? "unit";
  const productInventoryUnit = params.productInventoryUnit ?? inventoryUnit;
  const quantityDelta = roundInventoryQuantity(-(recipeQuantityPerUnit * sentQuantity));
  const identity = recipeIdentity({
    inventoryProductId: params.inventoryProductId ?? RECIPE_INV_A,
    recipeQuantityPerUnit,
    recipeUnit: inventoryUnit,
    ingredientOccurrence: params.ingredientOccurrence ?? 0,
  });
  const movementId = buildRecipeSaleV2MovementId(identity);
  return {
    movementId,
    data: {
      restaurantId: RECIPE_REST,
      productId: identity.inventoryProductId,
      productName: identity.inventoryProductId,
      source: "recipe_sale",
      type: "recipe_sale",
      orderId: RECIPE_ORDER,
      lineId: RECIPE_LINE,
      sentSegmentLineId: RECIPE_LINE,
      saleProductId: RECIPE_SALE,
      saleProductName: "Plato receta",
      quantityDelta,
      unit: inventoryUnit,
      idempotencyKey: movementId,
      createdAt: 1,
      applied: true,
      appliedAt: 1,
      stockBefore: params.stockBefore,
      stockAfter: params.stockAfter,
      movementFingerprint: recipeFingerprint({
        sentQuantity,
        recipeQuantityPerUnit,
        inventoryUnit,
        productInventoryUnit,
      }),
      sentQuantity,
      recipeQuantityPerUnit,
      productInventoryUnit,
      ingredientOccurrence: identity.ingredientOccurrence,
    },
  };
}

describe("initial recipe stock consumption (P1)", () => {
  test("1. producto con receta consume ingredientes", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 2, unit: "unit", name: "Sal" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.equal(plan.movementIds.length, 1);
    assert.equal(mock.movementWrites.size, 1);
    const written = [...mock.movementWrites.values()][0]!;
    assert.equal(written.source, "recipe_sale");
    assert.equal(written.quantityDelta, -2);
    assert.equal(written.stockBefore, 10);
    assert.equal(written.stockAfter, 8);
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_A], 8);
  });

  test("2. producto sin receta no crea movimientos", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({ enabled: false, ingredients: [
          { productId: RECIPE_INV_A, quantity: 1, unit: "unit" },
        ] }),
        [RECIPE_INV_A]: recipeInventoryProduct(),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.deepEqual(plan.movementIds, []);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("3. qty 2 multiplica receta", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 0.5, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 2 }],
      afterItems: [recipeSegmentLine(2)],
      nowMs: 1,
    });
    assert.equal(plan.movementIds.length, 1);
    const written = [...mock.movementWrites.values()][0]!;
    assert.equal(written.sentQuantity, 2);
    assert.equal(written.quantityDelta, -1);
    assert.equal(written.stockAfter, 9);
  });

  test("4. dos líneas iguales se procesan correctamente", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [
        { id: "line-a", status: "pending", quantity: 1 },
        { id: "line-b", status: "pending", quantity: 1 },
      ],
      afterItems: [
        recipeSegmentLine(1, "line-a"),
        recipeSegmentLine(1, "line-b"),
      ],
      nowMs: 1,
    });
    assert.equal(plan.movementIds.length, 2);
    assert.equal(mock.movementWrites.size, 2);
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_A], 8);
  });

  test("5-7. retry / doble click / timeout con write aplicado son idempotentes", async () => {
    const first = buildValidRecipeServerMovement({ stockBefore: 10, stockAfter: 9 });
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 9 }),
      },
      existingMovements: { [first.movementId]: first.data },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 2,
    });
    assert.deepEqual(plan.movementIds, [first.movementId]);
    assert.equal(mock.movementWrites.size, 0);
    assert.equal(mock.productUpdates.size, 0);
  });

  test("8. línea ya enviada no vuelve a consumir", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "sent", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.deepEqual(plan.movementIds, []);
    assert.equal(mock.movementWrites.size, 0);
  });

  test("9. línea rechazada (pending) no consume", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1, productId: RECIPE_SALE }],
      nowMs: 1,
    });
    assert.deepEqual(plan.movementIds, []);
  });

  test("10. qty parcial consume solo delta aplicado (nuevo segmento)", async () => {
    // Newly-sent derivation only fires pending→sent; split paths create new segment lines.
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "sent", quantity: 2 }],
      afterItems: [
        { id: RECIPE_LINE, status: "sent", quantity: 1, productId: RECIPE_SALE },
        {
          id: "line-split-new",
          status: "sent",
          quantity: 1,
          productId: RECIPE_SALE,
          productName: "Plato receta",
        },
      ],
      nowMs: 1,
    });
    // Original already sent → 0; new sent segment without before → consumes 1.
    assert.equal(plan.movementIds.length, 1);
    const written = [...mock.movementWrites.values()][0]!;
    assert.equal(written.lineId, "line-split-new");
    assert.equal(written.sentQuantity, 1);
    assert.equal(written.stockAfter, 9);
  });

  test("11. receta corrupta (unidad incompatible) no escribe", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10, unit: "kg" }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.equal(mock.movementWrites.size, 0);
    assert.equal(plan.warnings.some((w) => w.reason === "INCOMPATIBLE_UNIT"), true);
  });

  test("12. ingrediente cross-tenant rechazado", () => {
    const warning = validateRecipeInventoryProduct({
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      lineId: RECIPE_LINE,
      saleProductId: RECIPE_SALE,
      inventoryProductId: RECIPE_INV_A,
      inventoryUnit: "unit",
      recipeQuantityPerUnit: 1,
      productData: recipeInventoryProduct({ restaurantId: "other-rest" }),
    });
    assert.equal(warning?.reason, "PRODUCT_NOT_FOUND");
  });

  test("13. producto venta cross-tenant no aporta escandallo (sin movimientos)", async () => {
    const mock = createStockApplyMock({
      products: {
        // Sale product missing from tenant map → no recipe resolved.
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.deepEqual(plan.movementIds, []);
  });

  test("14. modifier stock coexistente en la misma tx", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: {
          ...recipeSaleProduct({
            ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
          }),
        },
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
        [RECIPE_INV_B]: recipeInventoryProduct({ id: RECIPE_INV_B, currentStock: 5 }),
      },
    });
    const afterLine = {
      ...recipeSegmentLine(1),
      selectedModifiers: [
        {
          groupId: "g1",
          optionId: "o1",
          optionName: "Extra",
          inventoryProductId: RECIPE_INV_B,
          inventoryProductName: "Extra",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    };
    const plan = await applyInitialModifierStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [afterLine],
      nowMs: 1,
    });
    assert.equal(plan.movementIds.length, 2);
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_A], 9);
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_B], 4);
    const types = [...mock.movementWrites.values()].map((m) => m.type).sort();
    assert.deepEqual(types, ["modifier_sale", "recipe_sale"]);
  });

  test("15. cocktail/mixer vía modifier + recipe no colisionan por prefijo", () => {
    const recipeId = buildRecipeSaleV2MovementId(recipeIdentity());
    const modifierId = buildModifierSaleV2MovementId({
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      sentSegmentLineId: RECIPE_LINE,
      modifierGroupId: "g1",
      modifierOptionId: "o1",
      inventoryProductId: RECIPE_INV_A,
      selectionOccurrence: 0,
    });
    assert.match(recipeId, /^recipe_sale_v2_/);
    assert.match(modifierId, /^modifier_sale_v2_/);
    assert.notEqual(recipeId, modifierId);
  });

  test("16. cancel/reversal identity: fingerprint helper acepta movimiento válido", () => {
    const built = buildValidRecipeServerMovement({ stockBefore: 10, stockAfter: 9 });
    assert.doesNotThrow(() =>
      assertExistingRecipeSaleMovementIsValidForIdempotentSkip({
        movementId: built.movementId,
        existing: built.data,
        expectedFingerprint: String(built.data.movementFingerprint),
        restaurantId: RECIPE_REST,
        orderId: RECIPE_ORDER,
        sentSegmentLineId: RECIPE_LINE,
        saleProductId: RECIPE_SALE,
        inventoryProductId: RECIPE_INV_A,
        ingredientOccurrence: 0,
        sentQuantity: 1,
        recipeQuantityPerUnit: 1,
        inventoryUnit: "unit",
        quantityDelta: -1,
        productCurrentStock: 9,
        productUnit: "unit",
      }),
    );
  });

  test("17. soft-fail / conflicto no marca writes (abort)", async () => {
    const conflict = buildValidRecipeServerMovement({ stockBefore: 10, stockAfter: 9 });
    conflict.data.quantityDelta = -99;
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [{ productId: RECIPE_INV_A, quantity: 1, unit: "unit" }],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 9 }),
      },
      existingMovements: { [conflict.movementId]: conflict.data },
    });
    await assert.rejects(
      () =>
        applyInitialRecipeStockConsumptionInTransaction({
          tx: mock.tx,
          db: mock.db,
          restaurantId: RECIPE_REST,
          orderId: RECIPE_ORDER,
          actorUid: "uid-1",
          beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
          afterItems: [recipeSegmentLine(1)],
          nowMs: 2,
        }),
      (err: unknown) =>
        err instanceof Error && err.message === STOCK_MOVEMENT_ID_CONFLICT,
    );
    assert.equal(mock.movementWrites.size, 0);
  });

  test("18. cliente Carta ya no contiene writer directo de receta", () => {
    const cartaPath = join(
      process.cwd(),
      "app/dashboard/carta/carta-page-content.tsx",
    );
    const source = readFileSync(cartaPath, "utf8");
    assert.equal(source.includes("createStockMovementsForRecipeConsumption"), false);
    assert.equal(source.includes("applyCreatedStockMovements"), false);
    assert.match(source, /runStock:\s*async\s*\(\)\s*=>\s*\{\s*\}/);
    assert.match(source, /runReleaseSideEffectsExactlyOnce/);
  });

  test("19. print/activity siguen después de stock en Release Effects", () => {
    const fxPath = join(
      process.cwd(),
      "lib/carta/run-release-side-effects-exactly-once.ts",
    );
    const source = readFileSync(fxPath, "utf8");
    const stockIdx = source.indexOf('runOne("stock"');
    const printIdx = source.indexOf('runOne("print"');
    const activityIdx = source.indexOf('runOne("activity"');
    assert.ok(stockIdx > 0 && printIdx > stockIdx && activityIdx > printIdx);
  });

  test("20. Release Effects stock conserva lease/idempotencia (API claim/complete intactas)", () => {
    const fxPath = join(
      process.cwd(),
      "lib/carta/run-release-side-effects-exactly-once.ts",
    );
    const source = readFileSync(fxPath, "utf8");
    assert.match(source, /claimReleaseEffectViaApi/);
    assert.match(source, /completeReleaseEffectViaApi/);
    assert.match(source, /effect:\s*"stock"|runOne\("stock"/);
  });

  test("varios ingredientes y conversión g→kg", async () => {
    const mock = createStockApplyMock({
      products: {
        [RECIPE_SALE]: recipeSaleProduct({
          ingredients: [
            { productId: RECIPE_INV_A, quantity: 1, unit: "unit" },
            { productId: RECIPE_INV_B, quantity: 500, unit: "g" },
          ],
        }),
        [RECIPE_INV_A]: recipeInventoryProduct({ currentStock: 10 }),
        [RECIPE_INV_B]: recipeInventoryProduct({
          id: RECIPE_INV_B,
          currentStock: 2,
          unit: "kg",
        }),
      },
    });
    const plan = await applyInitialRecipeStockConsumptionInTransaction({
      tx: mock.tx,
      db: mock.db,
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      beforeItems: [{ id: RECIPE_LINE, status: "pending", quantity: 1 }],
      afterItems: [recipeSegmentLine(1)],
      nowMs: 1,
    });
    assert.equal(plan.movementIds.length, 2);
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_A], 9);
    const converted = convertInventoryQuantity({
      quantity: -500,
      fromUnit: "g",
      toUnit: "kg",
    });
    assert.equal(plan.appliedStockByProductId[RECIPE_INV_B], roundInventoryQuantity(2 + (converted ?? 0)));
  });

  test("buildPendingRecipeWrites ignora self-ingredient y filas inválidas", () => {
    const { pending } = buildPendingRecipeWrites({
      restaurantId: RECIPE_REST,
      orderId: RECIPE_ORDER,
      actorUid: "uid-1",
      segments: [
        {
          sentSegmentLineId: RECIPE_LINE,
          newlySentUnits: 1,
          line: recipeSegmentLine(1),
        },
      ],
      saleProductDataById: new Map([
        [
          RECIPE_SALE,
          recipeSaleProduct({
            ingredients: [
              { productId: RECIPE_SALE, quantity: 1, unit: "unit" },
              { productId: RECIPE_INV_A, quantity: 0, unit: "unit" },
              { productId: RECIPE_INV_A, quantity: 1, unit: "unit" },
            ],
          }),
        ],
      ]),
      nowMs: 1,
    });
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.inventoryProductId, RECIPE_INV_A);
  });
});
