import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import {
  assertExistingRecipeSaleMovementIsValidForIdempotentSkip,
  buildRecipeIngredientEconomicKey,
  buildRecipeSaleMovementFingerprint,
  buildRecipeSaleV2MovementId,
  normalizeRecipeSaleUnit,
  STOCK_MOVEMENT_ID_CONFLICT,
} from "@/lib/inventory/recipe-sale-movement-identity";
import type {
  RecipeSaleStockMovementDocument,
  RecipeStockConsumptionWarning,
} from "@/lib/inventory/stock-movement-types";
import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  resolveInventoryUnitGroup,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { isRecipeEnabled, isRecipeInventoryUnit } from "@/lib/recipes/product-recipe-helpers";
import {
  deriveNewlySentSegments,
  type NewlySentSegment,
} from "@/lib/server/tpv/newly-sent-segments";

export type RecipeStockConsumptionPlan = {
  warnings: RecipeStockConsumptionWarning[];
  movementIds: string[];
  appliedStockByProductId: Record<string, number>;
};

export type PendingRecipeMovementWrite = {
  movementId: string;
  /** Fingerprint final con productInventoryUnit; se completa al validar/aplicar. */
  fingerprint: string;
  payload: RecipeSaleStockMovementDocument;
  inventoryProductId: string;
  convertedDelta: number;
};

/** Completa fingerprint + productInventoryUnit cuando ya se conoce la unidad destino. */
export function finalizeRecipeMovementFingerprint(
  row: PendingRecipeMovementWrite,
  productInventoryUnit: string,
): string {
  const fingerprint = buildRecipeSaleMovementFingerprint({
    sentQuantity: row.payload.sentQuantity ?? 0,
    recipeQuantityPerUnit: row.payload.recipeQuantityPerUnit ?? 0,
    inventoryUnit: String(row.payload.unit),
    quantityDelta: row.payload.quantityDelta,
    productInventoryUnit,
  });
  row.fingerprint = fingerprint;
  row.payload.movementFingerprint = fingerprint;
  row.payload.productInventoryUnit = normalizeRecipeSaleUnit(productInventoryUnit);
  return fingerprint;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readInventoryBlock(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return data.inventory && typeof data.inventory === "object"
    ? (data.inventory as Record<string, unknown>)
    : {};
}

function readValidInventoryCurrentStock(data: Record<string, unknown> | undefined): number | null {
  const inv = readInventoryBlock(data);
  if (!("currentStock" in inv)) return null;
  return readFiniteNumber(inv.currentStock);
}

function readCanonicalProductInventoryUnit(data: Record<string, unknown> | undefined): string | null {
  const inv = readInventoryBlock(data);
  const rawUnit = inv.unit;
  if (typeof rawUnit !== "string") return null;
  const trimmed = rawUnit.trim();
  if (!trimmed) return null;
  const normalized = normalizeInventoryUnitAlias(trimmed);
  if (!normalized || resolveInventoryUnitGroup(normalized) === "unknown") return null;
  return normalized;
}

function isInventoryEnabled(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const inv = readInventoryBlock(data);
  return inv.enabled === true;
}

function isProductActive(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return data.active !== false;
}

function assertSameRestaurantDoc(
  data: Record<string, unknown>,
  restaurantId: string,
): boolean {
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  return !docRid || docRid === restaurantId.trim();
}

export function readSaleProductIdFromLine(line: Record<string, unknown>): string {
  return typeof line.productId === "string" ? line.productId.trim() : "";
}

function readSaleProductId(line: Record<string, unknown>): string {
  return readSaleProductIdFromLine(line);
}

function readSaleProductName(line: Record<string, unknown>): string {
  return String(line.productName ?? line.name ?? line.displayName ?? "").trim();
}

function readEmbeddedRecipe(
  productData: Record<string, unknown> | undefined,
): { enabled: boolean; ingredients: readonly Record<string, unknown>[] } | null {
  if (!productData) return null;
  const recipeRaw = productData.recipe;
  if (!recipeRaw || typeof recipeRaw !== "object") return null;
  const recipe = recipeRaw as Record<string, unknown>;
  const ingredients = Array.isArray(recipe.ingredients)
    ? (recipe.ingredients as Record<string, unknown>[])
    : [];
  return {
    enabled: recipe.enabled === true,
    ingredients,
  };
}

export function validateRecipeInventoryProduct(params: {
  restaurantId: string;
  orderId: string;
  lineId: string;
  saleProductId: string;
  inventoryProductId: string;
  inventoryUnit: string;
  recipeQuantityPerUnit: number;
  productData: Record<string, unknown> | undefined;
}): RecipeStockConsumptionWarning | null {
  const {
    restaurantId,
    orderId,
    lineId,
    saleProductId,
    inventoryProductId,
    inventoryUnit,
    recipeQuantityPerUnit,
    productData,
  } = params;

  if (!productData) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "PRODUCT_NOT_FOUND",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!assertSameRestaurantDoc(productData, restaurantId)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "PRODUCT_NOT_FOUND",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isProductActive(productData)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "PRODUCT_INACTIVE",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isInventoryEnabled(productData)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "INVENTORY_DISABLED",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (readValidInventoryCurrentStock(productData) === null) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "INVALID_CURRENT_STOCK",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  const productUnit = readCanonicalProductInventoryUnit(productData);
  if (!productUnit) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "UNKNOWN_PRODUCT_UNIT",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isRecipeInventoryUnit(inventoryUnit)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "INCOMPATIBLE_UNIT",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (resolveInventoryUnitGroup(inventoryUnit) !== resolveInventoryUnitGroup(productUnit)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "INCOMPATIBLE_UNIT",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  const converted = convertInventoryQuantity({
    quantity: -recipeQuantityPerUnit,
    fromUnit: inventoryUnit,
    toUnit: productUnit,
  });
  if (converted == null || !Number.isFinite(converted) || converted >= 0) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      saleProductId,
      reason: "INVALID_CONSUMPTION_QUANTITY",
      requestedQuantity: recipeQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  return null;
}

export function buildPendingRecipeWrites(params: {
  restaurantId: string;
  orderId: string;
  actorUid: string;
  segments: readonly NewlySentSegment[];
  saleProductDataById: ReadonlyMap<string, Record<string, unknown>>;
  nowMs: number;
}): { pending: PendingRecipeMovementWrite[]; warnings: RecipeStockConsumptionWarning[] } {
  const pending: PendingRecipeMovementWrite[] = [];
  const warnings: RecipeStockConsumptionWarning[] = [];

  for (const segment of params.segments) {
    const saleProductId = readSaleProductId(segment.line);
    if (!saleProductId) continue;
    const saleProductName = readSaleProductName(segment.line) || saleProductId;
    const saleProductData = params.saleProductDataById.get(saleProductId);
    const recipe = readEmbeddedRecipe(saleProductData);
    if (!recipe || !isRecipeEnabled(recipe)) continue;

    // Occurrence solo entre filas con la misma clave económica.
    const occurrenceCounter = new Map<string, number>();
    for (const raw of recipe.ingredients) {
      const inventoryProductId =
        typeof raw.productId === "string" ? raw.productId.trim() : "";
      if (!inventoryProductId) continue;
      if (inventoryProductId === saleProductId) continue;

      const recipeQuantityPerUnit = readFiniteNumber(raw.quantity);
      if (recipeQuantityPerUnit == null || recipeQuantityPerUnit <= 0) continue;
      const rawUnit =
        typeof raw.unit === "string" && isRecipeInventoryUnit(raw.unit.trim())
          ? raw.unit.trim()
          : "";
      if (!rawUnit) continue;
      const inventoryUnit = normalizeRecipeSaleUnit(rawUnit);
      if (!inventoryUnit || !isRecipeInventoryUnit(inventoryUnit)) continue;

      const economicKey = buildRecipeIngredientEconomicKey({
        inventoryProductId,
        recipeQuantityPerUnit,
        recipeUnit: inventoryUnit,
      });
      const ingredientOccurrence = occurrenceCounter.get(economicKey) ?? 0;
      occurrenceCounter.set(economicKey, ingredientOccurrence + 1);

      const sentQuantity = segment.newlySentUnits;
      const quantityDelta = roundInventoryQuantity(
        -(recipeQuantityPerUnit * sentQuantity),
      );
      const movementId = buildRecipeSaleV2MovementId({
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        sentSegmentLineId: segment.sentSegmentLineId,
        saleProductId,
        inventoryProductId,
        recipeQuantityPerUnit,
        recipeUnit: inventoryUnit,
        ingredientOccurrence,
      });
      const productName =
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim()
          : inventoryProductId;

      pending.push({
        movementId,
        fingerprint: "",
        inventoryProductId,
        convertedDelta: 0,
        payload: {
          restaurantId: params.restaurantId,
          productId: inventoryProductId,
          productName,
          source: "recipe_sale",
          type: "recipe_sale",
          orderId: params.orderId,
          lineId: segment.sentSegmentLineId,
          saleProductId,
          saleProductName,
          quantityDelta,
          unit: inventoryUnit,
          idempotencyKey: movementId,
          createdAt: params.nowMs,
          createdBy: params.actorUid,
          applied: true,
          appliedAt: params.nowMs,
          sentSegmentLineId: segment.sentSegmentLineId,
          ingredientOccurrence,
          sentQuantity,
          recipeQuantityPerUnit,
        },
      });
    }
  }

  return { pending, warnings };
}

/**
 * Aplica consumo de escandallo en la misma transacción de liberación.
 * Preferir el wiring combinado en el planner de modifiers (all reads first).
 * Este entrypoint sirve tests unitarios y overrides de stock encadenados.
 */
export async function applyInitialRecipeStockConsumptionInTransaction(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  orderId: string;
  actorUid: string;
  beforeItems: readonly Record<string, unknown>[];
  afterItems: readonly Record<string, unknown>[];
  nowMs: number;
  /** Stock ya aplicado en la misma tx (p. ej. por modifier_sale). */
  stockOverridesByProductId?: Readonly<Record<string, number>>;
}): Promise<RecipeStockConsumptionPlan> {
  const segments = deriveNewlySentSegments(params.beforeItems, params.afterItems);
  if (segments.length === 0) {
    return { warnings: [], movementIds: [], appliedStockByProductId: {} };
  }

  const saleProductIds = [
    ...new Set(segments.map((segment) => readSaleProductId(segment.line)).filter(Boolean)),
  ];
  const saleProductRefs = saleProductIds.map((productId) =>
    params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
  );
  const saleProductSnaps =
    saleProductRefs.length > 0 ? await params.tx.getAll(...saleProductRefs) : [];
  const saleProductDataById = new Map<string, Record<string, unknown>>();
  saleProductSnaps.forEach((snap, index) => {
    if (snap.exists) {
      saleProductDataById.set(saleProductIds[index]!, snap.data() as Record<string, unknown>);
    }
  });

  const { pending, warnings } = buildPendingRecipeWrites({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    actorUid: params.actorUid,
    segments,
    saleProductDataById,
    nowMs: params.nowMs,
  });
  if (pending.length === 0) {
    return { warnings, movementIds: [], appliedStockByProductId: {} };
  }

  const movementRefs: DocumentReference[] = pending.map((row) =>
    params.db
      .collection("restaurants")
      .doc(params.restaurantId)
      .collection("stockMovements")
      .doc(row.movementId),
  );
  const uniqueInventoryProductIds = [...new Set(pending.map((row) => row.inventoryProductId))];
  const inventoryProductRefs = uniqueInventoryProductIds.map((productId) =>
    params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
  );

  const movementSnaps = movementRefs.length > 0 ? await params.tx.getAll(...movementRefs) : [];
  const inventoryProductSnaps =
    inventoryProductRefs.length > 0 ? await params.tx.getAll(...inventoryProductRefs) : [];

  const movementSnapById = new Map<string, DocumentSnapshot>();
  movementSnaps.forEach((snap, index) => {
    movementSnapById.set(pending[index]!.movementId, snap);
  });
  const productDataById = new Map<string, Record<string, unknown>>();
  inventoryProductSnaps.forEach((snap, index) => {
    if (snap.exists) {
      productDataById.set(uniqueInventoryProductIds[index]!, snap.data() as Record<string, unknown>);
    }
  });

  const validated: PendingRecipeMovementWrite[] = [];
  const movementIds: string[] = [];
  const skippedExistingStockAfterByProduct = new Map<
    string,
    Array<{ movementId: string; stockAfter: number }>
  >();
  const expectStockMatchFor = (inventoryProductId: string) =>
    pending.filter((row) => row.inventoryProductId === inventoryProductId).length === 1;

  for (const row of pending.sort((a, b) => a.movementId.localeCompare(b.movementId))) {
    const existingSnap = movementSnapById.get(row.movementId);
    if (existingSnap?.exists) {
      const existingData = existingSnap.data() as Record<string, unknown>;
      const productData = productDataById.get(row.inventoryProductId);
      const productUnit = readCanonicalProductInventoryUnit(productData);
      const overrideStock = params.stockOverridesByProductId?.[row.inventoryProductId];
      const productStock =
        typeof overrideStock === "number" && Number.isFinite(overrideStock)
          ? overrideStock
          : readValidInventoryCurrentStock(productData);
      if (!productData || !productUnit || productStock == null) {
        throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
      }
      const expectedFingerprint = finalizeRecipeMovementFingerprint(row, productUnit);
      assertExistingRecipeSaleMovementIsValidForIdempotentSkip({
        movementId: row.movementId,
        existing: existingData,
        expectedFingerprint,
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        sentSegmentLineId: String(row.payload.sentSegmentLineId ?? row.payload.lineId),
        saleProductId: row.payload.saleProductId,
        inventoryProductId: row.inventoryProductId,
        ingredientOccurrence: row.payload.ingredientOccurrence ?? 0,
        sentQuantity: row.payload.sentQuantity ?? 0,
        recipeQuantityPerUnit: row.payload.recipeQuantityPerUnit ?? 0,
        inventoryUnit: String(row.payload.unit),
        quantityDelta: row.payload.quantityDelta,
        productCurrentStock: productStock,
        productUnit,
        expectProductStockMatch: expectStockMatchFor(row.inventoryProductId),
      });
      const stockAfter = readFiniteNumber(existingData.stockAfter);
      if (stockAfter != null) {
        const list = skippedExistingStockAfterByProduct.get(row.inventoryProductId) ?? [];
        list.push({ movementId: row.movementId, stockAfter });
        skippedExistingStockAfterByProduct.set(row.inventoryProductId, list);
      }
      movementIds.push(row.movementId);
      continue;
    }

    const productData = productDataById.get(row.inventoryProductId);
    const warning = validateRecipeInventoryProduct({
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      lineId: row.payload.lineId,
      saleProductId: row.payload.saleProductId,
      inventoryProductId: row.inventoryProductId,
      inventoryUnit: String(row.payload.unit),
      recipeQuantityPerUnit: row.payload.recipeQuantityPerUnit ?? 0,
      productData,
    });
    if (warning) {
      warnings.push(warning);
      console.warn("[Hostly Inventory] recipe stock skipped:", warning);
      continue;
    }

    const productUnit = readCanonicalProductInventoryUnit(productData);
    if (!productUnit) continue;
    const convertedPerUnit = convertInventoryQuantity({
      quantity: -(row.payload.recipeQuantityPerUnit ?? 0),
      fromUnit: row.payload.unit,
      toUnit: productUnit,
    });
    if (convertedPerUnit == null || !Number.isFinite(convertedPerUnit)) {
      warnings.push({
        inventoryProductId: row.inventoryProductId,
        orderId: params.orderId,
        lineId: row.payload.lineId,
        saleProductId: row.payload.saleProductId,
        reason: "INCOMPATIBLE_UNIT",
        requestedQuantity: row.payload.recipeQuantityPerUnit,
        unit: String(row.payload.unit),
      });
      continue;
    }
    finalizeRecipeMovementFingerprint(row, productUnit);
    row.convertedDelta = roundInventoryQuantity(
      convertedPerUnit * (row.payload.sentQuantity ?? 0),
    );
    validated.push(row);
  }

  for (const [productId, entries] of skippedExistingStockAfterByProduct.entries()) {
    const hasNewWrite = validated.some((row) => row.inventoryProductId === productId);
    if (hasNewWrite) continue;
    if (entries.length <= 1) continue;
    const last = [...entries].sort((a, b) => a.movementId.localeCompare(b.movementId)).at(-1);
    const overrideStock = params.stockOverridesByProductId?.[productId];
    const current =
      typeof overrideStock === "number" && Number.isFinite(overrideStock)
        ? overrideStock
        : readValidInventoryCurrentStock(productDataById.get(productId));
    if (!last || current == null || current !== last.stockAfter) {
      throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
    }
  }

  const runningStock = new Map<string, number>();
  for (const row of validated) {
    if (runningStock.has(row.inventoryProductId)) continue;
    const overrideStock = params.stockOverridesByProductId?.[row.inventoryProductId];
    if (typeof overrideStock === "number" && Number.isFinite(overrideStock)) {
      runningStock.set(row.inventoryProductId, overrideStock);
      continue;
    }
    const stock = readValidInventoryCurrentStock(productDataById.get(row.inventoryProductId));
    if (stock === null) continue;
    runningStock.set(row.inventoryProductId, stock);
  }

  for (const row of validated.sort((a, b) => a.movementId.localeCompare(b.movementId))) {
    const before = runningStock.get(row.inventoryProductId);
    if (before == null) continue;
    const after = roundInventoryQuantity(before + row.convertedDelta);
    row.payload.stockBefore = before;
    row.payload.stockAfter = after;
    row.payload.applied = true;
    row.payload.appliedAt = params.nowMs;
    runningStock.set(row.inventoryProductId, after);
    movementIds.push(row.movementId);
    params.tx.set(
      params.db
        .collection("restaurants")
        .doc(params.restaurantId)
        .collection("stockMovements")
        .doc(row.movementId),
      row.payload,
    );
  }

  const appliedStockByProductId: Record<string, number> = {
    ...(params.stockOverridesByProductId ?? {}),
  };
  for (const [productId, stockAfter] of runningStock.entries()) {
    const touched = validated.some((row) => row.inventoryProductId === productId);
    if (!touched) continue;
    appliedStockByProductId[productId] = stockAfter;
    const productData = productDataById.get(productId);
    const existingInv =
      productData?.inventory && typeof productData.inventory === "object"
        ? (productData.inventory as Record<string, unknown>)
        : {};
    params.tx.update(
      params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
      {
        inventory: {
          ...existingInv,
          currentStock: stockAfter,
        },
        updatedAt: params.nowMs,
      },
    );
  }

  return {
    warnings,
    movementIds: [...new Set(movementIds)],
    appliedStockByProductId,
  };
}
