import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import type {
  ApplyCreatedStockMovementsResult,
  ApplyStockMovementResult,
  CreateModifierStockMovementsResult,
  CreateModifierStockReversalMovementsResult,
  CreateRecipeStockMovementsResult,
  CreateRecipeStockReversalMovementsResult,
  CreatePurchaseReceiptStockMovementsResult,
} from "@/lib/inventory/stock-movement-types";
import type { ProductRecipeDocument } from "@/lib/firestore/products";
import type { CartOrderLineSelectedModifier } from "@/lib/modifiers/cart-order-modifiers";
import {
  buildModifierInventoryConsumption,
} from "@/lib/modifiers/modifier-inventory-consumption";
import { buildRecipeInventoryConsumption } from "@/lib/recipes/product-recipe-helpers";
import { buildModifierSaleV2MovementId } from "@/lib/inventory/modifier-sale-movement-identity";
import {
  buildRecipeIngredientEconomicKey,
  buildRecipeSaleV2MovementId,
  normalizeRecipeSaleUnit,
} from "@/lib/inventory/recipe-sale-movement-identity";
import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  resolveInventoryUnitGroup,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { isRecipeInventoryUnit } from "@/lib/recipes/product-recipe-helpers";

export type ModifierConsumptionComandaLine = {
  id: string;
  quantity: number;
  status: string;
  product: { id: string; nombre: string };
  selectedModifiers?: readonly CartOrderLineSelectedModifier[];
};

export type CreateStockMovementsForModifierConsumptionParams = {
  restaurantId: string;
  orderId: string;
  lines: readonly ModifierConsumptionComandaLine[];
  userId?: string | null;
};

export type ApplyStockMovementToCurrentStockParams = {
  restaurantId: string;
  movementId: string;
};

export type ApplyCreatedStockMovementsParams = {
  restaurantId: string;
  movementIds: readonly string[];
};

export type CreateStockReversalMovementsForModifierConsumptionParams = {
  restaurantId: string;
  orderId: string;
  line: ModifierConsumptionComandaLine;
  userId?: string | null;
};

export type RecipeConsumptionComandaLine = ModifierConsumptionComandaLine;

export type CreateStockMovementsForRecipeConsumptionParams = {
  restaurantId: string;
  orderId: string;
  lines: readonly RecipeConsumptionComandaLine[];
  userId?: string | null;
};

export type CreateStockMovementsForPurchaseReceiptParams = {
  restaurantId: string;
  purchaseOrderId: string;
  purchaseReceiptId: string;
  lines: readonly {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }[];
  userId?: string | null;
};

export type CreateStockReversalMovementsForRecipeConsumptionParams = {
  restaurantId: string;
  orderId: string;
  line: RecipeConsumptionComandaLine;
  userId?: string | null;
};

function sanitizeMovementIdPart(value: string): string {
  return value
    .trim()
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 120);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readInventoryCurrentStockFromDoc(
  data: Record<string, unknown> | undefined,
): number {
  if (!data) return 0;
  const inv =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  const n = readFiniteNumber(inv.currentStock);
  return n ?? 0;
}

function readProductInventoryUnit(data: Record<string, unknown> | undefined): string {
  if (!data) return "ud";
  const inv =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  return typeof inv.unit === "string" && inv.unit.trim() ? inv.unit.trim() : "ud";
}

function assertSameRestaurantDoc(
  data: Record<string, unknown>,
  restaurantId: string,
): void {
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid && docRid !== restaurantId.trim()) {
    throw new Error("UNAUTHORIZED_STOCK_MOVEMENT_ACCESS");
  }
}

/** Comprueba compatibilidad entre unidad del movimiento y unidad del producto de inventario. */
export function isMovementUnitCompatibleWithProduct(
  movementUnit: unknown,
  productInventoryUnit: unknown,
): boolean {
  return areInventoryUnitsCompatible(movementUnit, productInventoryUnit);
}

function resolveStockApplyUnitError(
  movementUnitRaw: unknown,
  productUnitRaw: string,
): string | null {
  const movementLabel = String(movementUnitRaw ?? "").trim() || "?";
  const productLabel = productUnitRaw.trim() || "?";
  const movementGroup = resolveInventoryUnitGroup(movementUnitRaw);
  const productGroup = resolveInventoryUnitGroup(productUnitRaw);

  if (movementGroup === "unknown") {
    return `unknown_unit:movement=${movementLabel}`;
  }
  if (productGroup === "unknown") {
    return `unknown_unit:product=${productLabel}`;
  }
  if (movementGroup !== productGroup) {
    return `incompatible_unit_group:movement=${movementLabel},product=${productLabel}`;
  }
  return null;
}

/** Idempotente: `{orderId}_{lineId}_{inventoryProductId}_{modifierOptionId}_modifier`. */
export function buildModifierConsumptionMovementId(
  orderId: string,
  lineId: string,
  inventoryProductId: string,
  modifierOptionId: string,
): string {
  return [
    sanitizeMovementIdPart(orderId),
    sanitizeMovementIdPart(lineId),
    sanitizeMovementIdPart(inventoryProductId),
    sanitizeMovementIdPart(modifierOptionId),
    "modifier",
  ].join("_");
}

/** Idempotente: `{orderId}_{lineId}_{inventoryProductId}_{modifierOptionId}_modifier_reversal`. */
export function buildModifierConsumptionReversalMovementId(
  orderId: string,
  lineId: string,
  inventoryProductId: string,
  modifierOptionId: string,
): string {
  return [
    sanitizeMovementIdPart(orderId),
    sanitizeMovementIdPart(lineId),
    sanitizeMovementIdPart(inventoryProductId),
    sanitizeMovementIdPart(modifierOptionId),
    "modifier_reversal",
  ].join("_");
}

/**
 * Solo `sent` (y `pending` por compatibilidad) pueden revertir consumo de modificadores.
 * `prepared` / `served` / desconocido → conservador, no revertir.
 */
export function isOrderLineEligibleForModifierStockReversal(
  status: unknown,
): boolean {
  const s =
    typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return false;
  if (s === "sent") return true;
  if (s === "pending") return true;
  if (s === "preparing") return true;
  return false;
}

/** Alias compartido: modifiers y recipe usan la misma regla de reversión. */
export const isOrderLineEligibleForStockReversal =
  isOrderLineEligibleForModifierStockReversal;

/** Idempotente: `{orderId}_{lineId}_{ingredientProductId}_recipe`. */
export function buildRecipeConsumptionMovementId(
  orderId: string,
  lineId: string,
  ingredientProductId: string,
): string {
  return [
    sanitizeMovementIdPart(orderId),
    sanitizeMovementIdPart(lineId),
    sanitizeMovementIdPart(ingredientProductId),
    "recipe",
  ].join("_");
}

/** Idempotente: `{orderId}_{lineId}_{ingredientProductId}_recipe_reversal`. */
export function buildRecipeConsumptionReversalMovementId(
  orderId: string,
  lineId: string,
  ingredientProductId: string,
): string {
  return [
    sanitizeMovementIdPart(orderId),
    sanitizeMovementIdPart(lineId),
    sanitizeMovementIdPart(ingredientProductId),
    "recipe_reversal",
  ].join("_");
}

/** Idempotente: `{purchaseOrderId}_{productId}_receipt_{receiptId}`. */
export function buildPurchaseReceiptMovementId(
  purchaseOrderId: string,
  productId: string,
  receiptId: string,
): string {
  return [
    sanitizeMovementIdPart(purchaseOrderId),
    sanitizeMovementIdPart(productId),
    "receipt",
    sanitizeMovementIdPart(receiptId),
  ].join("_");
}

function readProductRecipeFromDoc(
  data: Record<string, unknown>,
): ProductRecipeDocument {
  const recipeRaw =
    data.recipe && typeof data.recipe === "object"
      ? (data.recipe as Record<string, unknown>)
      : {};
  const ingredients = Array.isArray(recipeRaw.ingredients)
    ? (recipeRaw.ingredients as ProductRecipeDocument["ingredients"])
    : [];
  return {
    enabled: recipeRaw.enabled === true,
    ingredients,
  };
}

async function loadSaleProductRecipesById(
  restaurantId: string,
  saleProductIds: readonly string[],
): Promise<Map<string, ProductRecipeDocument>> {
  const map = new Map<string, ProductRecipeDocument>();
  const unique = [
    ...new Set(
      saleProductIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  await Promise.all(
    unique.map(async (saleProductId) => {
      try {
        const snap = await getDoc(productDocRef(restaurantId, saleProductId));
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        assertSameRestaurantDoc(data, restaurantId);
        map.set(saleProductId, readProductRecipeFromDoc(data));
      } catch {
        // Producto sin recipe o sin acceso: sin consumo base.
      }
    }),
  );
  return map;
}

export function stockMovementsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "stockMovements");
}

export function stockMovementDocRef(restaurantId: string, movementId: string) {
  return doc(stockMovementsCollectionRef(restaurantId), movementId.trim());
}

function productDocRef(restaurantId: string, productId: string) {
  return doc(db, "restaurants", restaurantId.trim(), "products", productId.trim());
}

function isCancelledComandaLine(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "cancelled";
}

function authUidOrUndefined(): string | undefined {
  const uid = auth.currentUser?.uid?.trim();
  return uid || undefined;
}

function isMovementApplied(data: Record<string, unknown> | undefined): boolean {
  return data?.applied === true;
}

/**
 * Aplica un movimiento del ledger central al `inventory.currentStock` del producto.
 * Idempotente: si `applied === true`, no vuelve a descontar.
 */
export async function applyStockMovementToCurrentStock(
  params: ApplyStockMovementToCurrentStockParams,
): Promise<ApplyStockMovementResult> {
  const rid = params.restaurantId.trim();
  const movementId = params.movementId.trim();
  const base: ApplyStockMovementResult = { movementId, status: "error" };

  if (!rid || !movementId || !isAuthReady()) {
    return { ...base, applyError: "auth_or_params_unavailable" };
  }

  const movementRef = stockMovementDocRef(rid, movementId);

  try {
    return await runTransaction(db, async (transaction) => {
      const movementSnap = await transaction.get(movementRef);
      if (!movementSnap.exists()) {
        return { ...base, applyError: "movement_not_found" };
      }

      const movementData = movementSnap.data() as Record<string, unknown>;
      assertSameRestaurantDoc(movementData, rid);

      if (isMovementApplied(movementData)) {
        return {
          movementId,
          status: "skipped",
          stockBefore:
            readFiniteNumber(movementData.stockBefore) ?? undefined,
          stockAfter: readFiniteNumber(movementData.stockAfter) ?? undefined,
        };
      }

      const productId =
        typeof movementData.productId === "string"
          ? movementData.productId.trim()
          : "";
      const quantityDelta = readFiniteNumber(movementData.quantityDelta);
      const movementUnitRaw = movementData.unit;

      if (!productId) {
        transaction.update(movementRef, {
          applyError: "missing_product_id",
        });
        return { ...base, applyError: "missing_product_id" };
      }

      if (quantityDelta == null) {
        transaction.update(movementRef, {
          applyError: "invalid_quantity_delta",
        });
        return { ...base, applyError: "invalid_quantity_delta" };
      }

      const productRef = productDocRef(rid, productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        transaction.update(movementRef, {
          applyError: `product_not_found:${productId}`,
        });
        return { ...base, applyError: `product_not_found:${productId}` };
      }

      const productData = productSnap.data() as Record<string, unknown>;
      assertSameRestaurantDoc(productData, rid);

      const productUnit = readProductInventoryUnit(productData);

      const unitApplyError = resolveStockApplyUnitError(
        movementUnitRaw,
        productUnit,
      );
      if (unitApplyError) {
        transaction.update(movementRef, { applyError: unitApplyError });
        return { ...base, applyError: unitApplyError };
      }

      const convertedDelta = convertInventoryQuantity({
        quantity: quantityDelta,
        fromUnit: movementUnitRaw,
        toUnit: productUnit,
      });
      if (convertedDelta == null) {
        const applyError = `incompatible_unit_group:movement=${String(movementUnitRaw ?? "").trim() || "?"},product=${productUnit}`;
        transaction.update(movementRef, { applyError });
        return { ...base, applyError };
      }

      const stockBefore = roundInventoryQuantity(
        readInventoryCurrentStockFromDoc(productData),
      );
      const stockAfter = roundInventoryQuantity(stockBefore + convertedDelta);

      transaction.update(productRef, {
        "inventory.currentStock": stockAfter,
        updatedAt: serverTimestamp(),
      });

      transaction.update(movementRef, {
        applied: true,
        appliedAt: serverTimestamp(),
        stockBefore,
        stockAfter,
        applyError: deleteField(),
      });

      return {
        movementId,
        status: "applied",
        stockBefore,
        stockAfter,
      };
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "apply_stock_movement_failed";
    try {
      await runTransaction(db, async (transaction) => {
        const movementSnap = await transaction.get(movementRef);
        if (!movementSnap.exists() || isMovementApplied(movementSnap.data())) {
          return;
        }
        transaction.update(movementRef, { applyError: message });
      });
    } catch {
      // No bloquear TPV si tampoco podemos persistir el error.
    }
    return { ...base, applyError: message };
  }
}

/** Aplica en serie movimientos recién creados o pendientes de aplicar. */
export async function applyCreatedStockMovements(
  params: ApplyCreatedStockMovementsParams,
): Promise<ApplyCreatedStockMovementsResult> {
  const result: ApplyCreatedStockMovementsResult = {
    applied: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  const rid = params.restaurantId.trim();
  if (!rid || !isAuthReady()) return result;

  const uniqueIds = [
    ...new Set(
      params.movementIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  for (const movementId of uniqueIds) {
    try {
      const item = await applyStockMovementToCurrentStock({
        restaurantId: rid,
        movementId,
      });
      result.results.push(item);
      if (item.status === "applied") result.applied += 1;
      else if (item.status === "skipped") result.skipped += 1;
      else result.failed += 1;
    } catch (err) {
      result.failed += 1;
      const applyError =
        err instanceof Error ? err.message : "apply_stock_movement_failed";
      result.results.push({ movementId, status: "error", applyError });
      console.warn(
        "[Hostly Inventory] apply stock movement failed",
        { movementId, err },
      );
    }
  }

  return result;
}

/**
 * Crea movimientos espejo positivos al cancelar una línea enviada (antes de preparar).
 * Solo revierte si el movimiento original existe y fue aplicado (`applied === true`).
 */
export async function createStockReversalMovementsForModifierConsumption(
  params: CreateStockReversalMovementsForModifierConsumptionParams,
): Promise<CreateModifierStockReversalMovementsResult> {
  const result: CreateModifierStockReversalMovementsResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    movementIds: [],
    eligible: false,
    skippedNoOriginal: 0,
  };

  const rid = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  if (!rid || !orderId || !isAuthReady()) return result;

  if (!isOrderLineEligibleForModifierStockReversal(params.line.status)) {
    return result;
  }
  result.eligible = true;

  const createdBy =
    params.userId?.trim() || authUidOrUndefined() || undefined;

  const lineQty = Math.max(1, Math.floor(Number(params.line.quantity) || 1));
  const consumptions = buildModifierInventoryConsumption(
    params.line.selectedModifiers,
  );
  if (consumptions.length === 0) return result;

  const saleProductId = String(params.line.product.id ?? "").trim();
  const saleProductName =
    String(params.line.product.nombre ?? "").trim() || "Producto";
  const occurrenceCounter = new Map<string, number>();

  for (const consumption of consumptions) {
    const occurrenceKey = `${consumption.groupId}::${consumption.optionId}::${consumption.inventoryProductId}`;
    const selectionOccurrence = occurrenceCounter.get(occurrenceKey) ?? 0;
    occurrenceCounter.set(occurrenceKey, selectionOccurrence + 1);

    const v2MovementId = buildModifierSaleV2MovementId({
      restaurantId: rid,
      orderId,
      sentSegmentLineId: params.line.id,
      modifierGroupId: consumption.groupId,
      modifierOptionId: consumption.optionId,
      inventoryProductId: consumption.inventoryProductId,
      selectionOccurrence,
    });
    const legacyMovementId = buildModifierConsumptionMovementId(
      orderId,
      params.line.id,
      consumption.inventoryProductId,
      consumption.optionId,
    );
    const reversalMovementId = buildModifierConsumptionReversalMovementId(
      orderId,
      params.line.id,
      consumption.inventoryProductId,
      consumption.optionId,
    );
    result.movementIds.push(reversalMovementId);

    let originalMovementId = v2MovementId;
    try {
      let originalRef = stockMovementDocRef(rid, originalMovementId);
      let originalSnap = await getDoc(originalRef);
      if (!originalSnap.exists()) {
        originalMovementId = legacyMovementId;
        originalRef = stockMovementDocRef(rid, originalMovementId);
        originalSnap = await getDoc(originalRef);
      }
      const reversalRef = stockMovementDocRef(rid, reversalMovementId);
      const existingReversalSnap = await getDoc(reversalRef);

      if (existingReversalSnap.exists()) {
        result.skipped += 1;
        continue;
      }

      if (!originalSnap.exists()) {
        result.skippedNoOriginal += 1;
        result.movementIds = result.movementIds.filter(
          (id) => id !== reversalMovementId,
        );
        continue;
      }

      const originalData = originalSnap.data() as Record<string, unknown>;
      if (!isMovementApplied(originalData)) {
        result.skippedNoOriginal += 1;
        result.movementIds = result.movementIds.filter(
          (id) => id !== reversalMovementId,
        );
        continue;
      }

      const quantityDelta = consumption.inventoryQuantity * lineQty;

      await setDoc(reversalRef, {
        restaurantId: rid,
        productId: consumption.inventoryProductId,
        productName:
          consumption.inventoryProductName?.trim() ||
          consumption.inventoryProductId,
        source: "modifier_sale_reversal",
        type: "modifier_sale_reversal",
        orderId,
        lineId: params.line.id,
        saleProductId,
        saleProductName,
        modifierGroupId: consumption.groupId,
        modifierOptionId: consumption.optionId,
        modifierOptionName: consumption.optionName,
        quantityDelta,
        unit: consumption.inventoryUnit,
        idempotencyKey: reversalMovementId,
        reversalOfMovementId: originalMovementId,
        applied: false,
        createdAt: serverTimestamp(),
        ...(createdBy ? { createdBy } : {}),
      });

      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.movementIds = result.movementIds.filter(
        (id) => id !== reversalMovementId,
      );
      console.warn(
        "[Hostly Inventory] modifier stock reversal failed",
        {
          reversalMovementId,
          originalMovementId,
          orderId,
          lineId: params.line.id,
          err,
        },
      );
    }
  }

  if (result.movementIds.length > 0) {
    const applyResult = await applyCreatedStockMovements({
      restaurantId: rid,
      movementIds: result.movementIds,
    });
    result.applyResult = applyResult;
    if (applyResult.failed > 0) {
      console.warn(
        "[Hostly Inventory] algunos reversos de modificador no se aplicaron al stock.",
        applyResult,
      );
    }
  }

  return result;
}

/**
 * Ledger por consumo de escandallo base al enviar comanda.
 * Resuelve `product.recipe` embebida en el catálogo central (una lectura por producto vendido).
 */
export async function createStockMovementsForRecipeConsumption(
  params: CreateStockMovementsForRecipeConsumptionParams,
): Promise<CreateRecipeStockMovementsResult> {
  const result: CreateRecipeStockMovementsResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    movementIds: [],
  };

  const rid = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  if (!rid || !orderId || !isAuthReady()) return result;

  const createdBy =
    params.userId?.trim() || authUidOrUndefined() || undefined;

  const activeLines = params.lines.filter(
    (line) => !isCancelledComandaLine(line.status),
  );
  if (activeLines.length === 0) return result;

  const saleProductIds = activeLines.map((line) =>
    String(line.product.id ?? "").trim(),
  );
  const recipesBySaleProductId = await loadSaleProductRecipesById(
    rid,
    saleProductIds,
  );

  for (const line of activeLines) {
    const saleProductId = String(line.product.id ?? "").trim();
    if (!saleProductId) continue;

    const recipe = recipesBySaleProductId.get(saleProductId);
    if (!recipe?.enabled) continue;

    const lineQty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const consumptions = buildRecipeInventoryConsumption(recipe, lineQty, {
      saleProductId,
    });
    if (consumptions.length === 0) continue;

    const saleProductName =
      String(line.product.nombre ?? "").trim() || "Producto";

    for (const consumption of consumptions) {
      const movementId = buildRecipeConsumptionMovementId(
        orderId,
        line.id,
        consumption.productId,
      );
      result.movementIds.push(movementId);

      const ref = stockMovementDocRef(rid, movementId);
      const quantityDelta = -consumption.quantity;

      try {
        const existing = await getDoc(ref);
        if (existing.exists()) {
          result.skipped += 1;
          continue;
        }

        await setDoc(ref, {
          restaurantId: rid,
          productId: consumption.productId,
          productName: consumption.productName,
          source: "recipe_sale",
          type: "recipe_sale",
          orderId,
          lineId: line.id,
          saleProductId,
          saleProductName,
          quantityDelta,
          unit: consumption.unit,
          idempotencyKey: movementId,
          applied: false,
          createdAt: serverTimestamp(),
          ...(createdBy ? { createdBy } : {}),
        });

        result.created += 1;
      } catch (err) {
        result.failed += 1;
        result.movementIds = result.movementIds.filter((id) => id !== movementId);
        console.warn(
          "[Hostly Inventory] recipe stock movement failed",
          { movementId, orderId, lineId: line.id, err },
        );
      }
    }
  }

  return result;
}

/**
 * Entrada de stock por recepción de pedido de compra (quantityDelta positivo).
 * Idempotente por `{purchaseOrderId}_{productId}_receipt_{receiptId}`.
 */
export async function createStockMovementsForPurchaseReceipt(
  params: CreateStockMovementsForPurchaseReceiptParams,
): Promise<CreatePurchaseReceiptStockMovementsResult> {
  const result: CreatePurchaseReceiptStockMovementsResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    movementIds: [],
  };

  const rid = params.restaurantId.trim();
  const purchaseOrderId = params.purchaseOrderId.trim();
  const purchaseReceiptId = params.purchaseReceiptId.trim();
  if (!rid || !purchaseOrderId || !purchaseReceiptId || !isAuthReady()) {
    return result;
  }

  const createdBy =
    params.userId?.trim() || authUidOrUndefined() || undefined;

  for (const line of params.lines) {
    const productId = line.productId.trim();
    if (!productId) continue;

    const quantity = readFiniteNumber(line.quantity);
    if (quantity == null || quantity <= 0) continue;

    const movementId = buildPurchaseReceiptMovementId(
      purchaseOrderId,
      productId,
      purchaseReceiptId,
    );
    result.movementIds.push(movementId);

    const ref = stockMovementDocRef(rid, movementId);
    const quantityDelta = roundInventoryQuantity(quantity);
    const unit = typeof line.unit === "string" && line.unit.trim() ? line.unit.trim() : "ud";
    const productName =
      typeof line.productName === "string" && line.productName.trim()
        ? line.productName.trim()
        : productId;

    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        result.skipped += 1;
        continue;
      }

      await setDoc(ref, {
        restaurantId: rid,
        productId,
        productName,
        source: "purchase_receipt",
        type: "purchase_receipt",
        purchaseOrderId,
        purchaseReceiptId,
        quantityDelta,
        unit,
        idempotencyKey: movementId,
        applied: false,
        createdAt: serverTimestamp(),
        ...(createdBy ? { createdBy } : {}),
      });

      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.movementIds = result.movementIds.filter((id) => id !== movementId);
      console.warn(
        "[Hostly Inventory] purchase receipt stock movement failed",
        { movementId, purchaseOrderId, purchaseReceiptId, err },
      );
    }
  }

  return result;
}

/**
 * Revierte consumo de escandallo base al cancelar línea elegible.
 * Solo si el movimiento original existe y fue aplicado.
 */
export async function createStockReversalMovementsForRecipeConsumption(
  params: CreateStockReversalMovementsForRecipeConsumptionParams,
): Promise<CreateRecipeStockReversalMovementsResult> {
  const result: CreateRecipeStockReversalMovementsResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    movementIds: [],
    eligible: false,
    skippedNoOriginal: 0,
  };

  const rid = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  if (!rid || !orderId || !isAuthReady()) return result;

  if (!isOrderLineEligibleForStockReversal(params.line.status)) {
    return result;
  }
  result.eligible = true;

  const createdBy =
    params.userId?.trim() || authUidOrUndefined() || undefined;

  const saleProductId = String(params.line.product.id ?? "").trim();
  if (!saleProductId) return result;

  const recipesBySaleProductId = await loadSaleProductRecipesById(rid, [
    saleProductId,
  ]);
  const recipe = recipesBySaleProductId.get(saleProductId);
  if (!recipe?.enabled) return result;

  const lineQty = Math.max(1, Math.floor(Number(params.line.quantity) || 1));
  // Per-unit consumptions preserve economic identity for recipe_sale_v2 lookup.
  const consumptions = buildRecipeInventoryConsumption(recipe, 1, {
    saleProductId,
  });
  if (consumptions.length === 0) return result;

  const saleProductName =
    String(params.line.product.nombre ?? "").trim() || "Producto";
  const occurrenceCounter = new Map<string, number>();

  for (const consumption of consumptions) {
    const recipeUnit = isRecipeInventoryUnit(consumption.unit)
      ? normalizeRecipeSaleUnit(consumption.unit)
      : "";
    if (!recipeUnit) continue;
    const recipeQuantityPerUnit = consumption.quantity;
    if (
      typeof recipeQuantityPerUnit !== "number" ||
      !Number.isFinite(recipeQuantityPerUnit) ||
      recipeQuantityPerUnit <= 0
    ) {
      continue;
    }

    const economicKey = buildRecipeIngredientEconomicKey({
      inventoryProductId: consumption.productId,
      recipeQuantityPerUnit,
      recipeUnit,
    });
    const ingredientOccurrence = occurrenceCounter.get(economicKey) ?? 0;
    occurrenceCounter.set(economicKey, ingredientOccurrence + 1);

    const v2MovementId = buildRecipeSaleV2MovementId({
      restaurantId: rid,
      orderId,
      sentSegmentLineId: params.line.id,
      saleProductId,
      inventoryProductId: consumption.productId,
      recipeQuantityPerUnit,
      recipeUnit,
      ingredientOccurrence,
    });
    const legacyMovementId = buildRecipeConsumptionMovementId(
      orderId,
      params.line.id,
      consumption.productId,
    );
    const reversalMovementId = buildRecipeConsumptionReversalMovementId(
      orderId,
      params.line.id,
      consumption.productId,
    );
    result.movementIds.push(reversalMovementId);

    let originalMovementId = v2MovementId;
    const quantityDelta = roundInventoryQuantity(recipeQuantityPerUnit * lineQty);

    try {
      let originalRef = stockMovementDocRef(rid, originalMovementId);
      let originalSnap = await getDoc(originalRef);
      if (!originalSnap.exists()) {
        originalMovementId = legacyMovementId;
        originalRef = stockMovementDocRef(rid, originalMovementId);
        originalSnap = await getDoc(originalRef);
      }
      const reversalRef = stockMovementDocRef(rid, reversalMovementId);
      const existingReversalSnap = await getDoc(reversalRef);

      if (existingReversalSnap.exists()) {
        result.skipped += 1;
        continue;
      }

      if (!originalSnap.exists()) {
        result.skippedNoOriginal += 1;
        result.movementIds = result.movementIds.filter(
          (id) => id !== reversalMovementId,
        );
        continue;
      }

      const originalData = originalSnap.data() as Record<string, unknown>;
      if (!isMovementApplied(originalData)) {
        result.skippedNoOriginal += 1;
        result.movementIds = result.movementIds.filter(
          (id) => id !== reversalMovementId,
        );
        continue;
      }

      await setDoc(reversalRef, {
        restaurantId: rid,
        productId: consumption.productId,
        productName: consumption.productName,
        source: "recipe_sale_reversal",
        type: "recipe_sale_reversal",
        orderId,
        lineId: params.line.id,
        saleProductId,
        saleProductName,
        quantityDelta,
        unit: recipeUnit,
        idempotencyKey: reversalMovementId,
        reversalOfMovementId: originalMovementId,
        applied: false,
        createdAt: serverTimestamp(),
        ...(createdBy ? { createdBy } : {}),
      });

      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.movementIds = result.movementIds.filter(
        (id) => id !== reversalMovementId,
      );
      console.warn(
        "[Hostly Inventory] recipe stock reversal failed",
        {
          reversalMovementId,
          originalMovementId,
          orderId,
          lineId: params.line.id,
          err,
        },
      );
    }
  }

  if (result.movementIds.length > 0) {
    const applyResult = await applyCreatedStockMovements({
      restaurantId: rid,
      movementIds: result.movementIds,
    });
    result.applyResult = applyResult;
    if (applyResult.failed > 0) {
      console.warn(
        "[Hostly Inventory] algunos reversos de escandallo no se aplicaron al stock.",
        applyResult,
      );
    }
  }

  return result;
}

/**
 * Ledger append-only por consumo de modificadores al enviar comanda.
 * @deprecated Consumo inicial server-side (6C2). No usar desde cliente.
 */
export async function createStockMovementsForModifierConsumption(
  params: CreateStockMovementsForModifierConsumptionParams,
): Promise<CreateModifierStockMovementsResult> {
  const result: CreateModifierStockMovementsResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    movementIds: [],
  };

  const rid = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  if (!rid || !orderId || !isAuthReady()) return result;

  const createdBy =
    params.userId?.trim() || authUidOrUndefined() || undefined;

  for (const line of params.lines) {
    if (isCancelledComandaLine(line.status)) continue;

    const lineQty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const consumptions = buildModifierInventoryConsumption(line.selectedModifiers);
    if (consumptions.length === 0) continue;

    const saleProductId = String(line.product.id ?? "").trim();
    const saleProductName = String(line.product.nombre ?? "").trim() || "Producto";

    for (const consumption of consumptions) {
      const movementId = buildModifierConsumptionMovementId(
        orderId,
        line.id,
        consumption.inventoryProductId,
        consumption.optionId,
      );
      result.movementIds.push(movementId);

      const ref = stockMovementDocRef(rid, movementId);
      const quantityDelta = -consumption.inventoryQuantity * lineQty;

      try {
        const existing = await getDoc(ref);
        if (existing.exists()) {
          result.skipped += 1;
          continue;
        }

        await setDoc(ref, {
          restaurantId: rid,
          productId: consumption.inventoryProductId,
          productName:
            consumption.inventoryProductName?.trim() ||
            consumption.inventoryProductId,
          source: "modifier_sale",
          type: "modifier_sale",
          orderId,
          lineId: line.id,
          saleProductId,
          saleProductName,
          modifierGroupId: consumption.groupId,
          modifierOptionId: consumption.optionId,
          modifierOptionName: consumption.optionName,
          quantityDelta,
          unit: consumption.inventoryUnit,
          idempotencyKey: movementId,
          applied: false,
          createdAt: serverTimestamp(),
          ...(createdBy ? { createdBy } : {}),
        });

        result.created += 1;
      } catch (err) {
        result.failed += 1;
        result.movementIds = result.movementIds.filter((id) => id !== movementId);
        console.warn(
          "[Hostly Inventory] modifier stock movement failed",
          { movementId, orderId, lineId: line.id, err },
        );
      }
    }
  }

  return result;
}

export type CentralStockMovementListItem = {
  id: string;
  productId: string | null;
  source: string;
  type: string;
  quantityDelta: number;
  unit: string;
  saleProductName: string | null;
  modifierOptionName: string | null;
  orderId: string | null;
  lineId: string | null;
  purchaseOrderId: string | null;
  purchaseReceiptId: string | null;
  stockBefore: number | null;
  stockAfter: number | null;
  applyError: string | null;
  applied: boolean | null;
  createdAtMs: number | null;
};

export type PurchaseOrderStockMovementListItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  purchaseOrderId: string | null;
  purchaseReceiptId: string | null;
  source: string;
  type: string;
  quantityDelta: number;
  unit: string;
  stockBefore: number | null;
  stockAfter: number | null;
  applyError: string | null;
  applied: boolean | null;
  createdAtMs: number | null;
};

export type ListenStockMovementsForPurchaseOrderOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export type ListenCentralStockMovementsForRestaurantOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export type ListenCentralStockMovementsForProductOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

function readMovementCreatedAtMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  return null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapCentralStockMovementSnapshot(
  snap: QueryDocumentSnapshot<DocumentData>,
): CentralStockMovementListItem {
  const d = snap.data() as Record<string, unknown>;
  const quantityDelta = readFiniteNumber(d.quantityDelta) ?? 0;
  const source = readOptionalString(d.source) ?? readOptionalString(d.type) ?? "unknown";
  const type = readOptionalString(d.type) ?? source;
  const appliedRaw = d.applied;
  return {
    id: snap.id,
    productId: readOptionalString(d.productId),
    source,
    type,
    quantityDelta,
    unit: readOptionalString(d.unit) ?? "ud",
    saleProductName: readOptionalString(d.saleProductName),
    modifierOptionName: readOptionalString(d.modifierOptionName),
    orderId: readOptionalString(d.orderId),
    lineId: readOptionalString(d.lineId),
    purchaseOrderId: readOptionalString(d.purchaseOrderId),
    purchaseReceiptId: readOptionalString(d.purchaseReceiptId),
    stockBefore: readFiniteNumber(d.stockBefore),
    stockAfter: readFiniteNumber(d.stockAfter),
    applyError: readOptionalString(d.applyError),
    applied: typeof appliedRaw === "boolean" ? appliedRaw : null,
    createdAtMs: readMovementCreatedAtMs(d.createdAt),
  };
}

export function centralStockMovementSourceLabel(
  source: string,
  type?: string,
): string {
  const key = (source || type || "").trim().toLowerCase();
  switch (key) {
    case "modifier_sale":
      return "Venta modificador";
    case "modifier_sale_reversal":
      return "Reversión modificador";
    case "recipe_sale":
      return "Venta escandallo";
    case "recipe_sale_reversal":
      return "Reversión escandallo";
    case "inventory_receipt":
      return "Recepción";
    case "purchase_receipt":
      return "Recepción pedido";
    case "manual_adjustment":
      return "Ajuste manual";
    default:
      return key ? key.replace(/_/g, " ") : "Movimiento";
  }
}

function isFirestoreIndexError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : "";
  return code === "failed-precondition";
}

/**
 * Ledger central: restaurants/{restaurantId}/stockMovements filtrado por productId.
 * Requiere índice compuesto productId ASC + createdAt DESC (fallback sin orderBy si falta).
 */
export function listenCentralStockMovementsForProduct(
  restaurantId: string,
  productId: string,
  onData: (items: CentralStockMovementListItem[]) => void,
  options?: ListenCentralStockMovementsForProductOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 50, 1), 50);
  if (!rid || !pid || !auth.currentUser) {
    onData([]);
    return () => {};
  }

  const col = stockMovementsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (items: CentralStockMovementListItem[]) => {
    const sorted = [...items].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
    );
    onData(sorted.slice(0, lim));
  };

  const attachFallback = () => {
    fallbackActive = true;
    options?.onFallback?.();
    const fallbackQuery = query(col, where("productId", "==", pid), limit(100));
    innerUnsub = onSnapshot(
      fallbackQuery,
      (snap) => {
        emitSorted(snap.docs.map(mapCentralStockMovementSnapshot));
      },
      (error) => {
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  const orderedQuery = query(
    col,
    where("productId", "==", pid),
    orderBy("createdAt", "desc"),
    limit(lim),
  );

  innerUnsub = onSnapshot(
    orderedQuery,
    (snap) => {
      onData(snap.docs.map(mapCentralStockMovementSnapshot));
    },
    (error) => {
      if (!fallbackActive && isFirestoreIndexError(error)) {
        innerUnsub?.();
        attachFallback();
        return;
      }
      options?.onError?.(error);
      onData([]);
    },
  );

  return () => {
    innerUnsub?.();
  };
}

export type FetchCentralStockMovementsForProductPageParams = {
  restaurantId: string;
  productId: string;
  pageSize?: number;
  /** Snapshot del último doc cargado (más antiguo en orden desc). */
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  /** Alternativa al cursor: id del movimiento más antiguo ya cargado. */
  cursorMovementId?: string | null;
  /** IDs ya presentes — fallback sin índice compuesto. */
  excludeIds?: readonly string[];
};

export type FetchCentralStockMovementsForProductPageResult = {
  items: CentralStockMovementListItem[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  usedFallback: boolean;
};

/**
 * Página histórica del ledger central por producto (older than cursor).
 * Query: productId == + orderBy createdAt desc + startAfter.
 */
export async function fetchCentralStockMovementsForProductPage(
  params: FetchCentralStockMovementsForProductPageParams,
): Promise<FetchCentralStockMovementsForProductPageResult> {
  const rid = params.restaurantId.trim();
  const pid = params.productId.trim();
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 50);
  const excludeIds = new Set((params.excludeIds ?? []).map((id) => id.trim()).filter(Boolean));

  if (!rid || !pid || !auth.currentUser) {
    return { items: [], lastDoc: null, hasMore: false, usedFallback: false };
  }

  const col = stockMovementsCollectionRef(rid);
  let cursorSnap = params.cursor ?? null;

  if (!cursorSnap && params.cursorMovementId?.trim()) {
    const ref = doc(col, params.cursorMovementId.trim());
    const snap = await getDoc(ref);
    if (snap.exists()) {
      cursorSnap = snap as QueryDocumentSnapshot<DocumentData>;
    }
  }

  const runOrderedFetch = async (): Promise<FetchCentralStockMovementsForProductPageResult> => {
    const q = cursorSnap
      ? query(
          col,
          where("productId", "==", pid),
          orderBy("createdAt", "desc"),
          startAfter(cursorSnap),
          limit(pageSize),
        )
      : query(
          col,
          where("productId", "==", pid),
          orderBy("createdAt", "desc"),
          limit(pageSize),
        );

    const snap = await getDocs(q);
    const items = snap.docs.map(mapCentralStockMovementSnapshot);
    const lastDoc =
      snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : cursorSnap;
    return {
      items,
      lastDoc: snap.docs.length > 0 ? lastDoc : null,
      hasMore: snap.docs.length === pageSize,
      usedFallback: false,
    };
  };

  const runFallbackFetch = async (): Promise<FetchCentralStockMovementsForProductPageResult> => {
    const snap = await getDocs(query(col, where("productId", "==", pid), limit(500)));
    const sorted = snap.docs
      .map(mapCentralStockMovementSnapshot)
      .filter((item) => !excludeIds.has(item.id))
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    let startIndex = 0;
    if (params.cursorMovementId?.trim()) {
      const idx = sorted.findIndex((item) => item.id === params.cursorMovementId!.trim());
      if (idx >= 0) startIndex = idx + 1;
    }

    const page = sorted.slice(startIndex, startIndex + pageSize);
    const lastItem = page[page.length - 1];
    const lastDoc =
      lastItem != null
        ? (snap.docs.find((docSnap) => docSnap.id === lastItem.id) ?? null)
        : null;

    return {
      items: page,
      lastDoc,
      hasMore: startIndex + pageSize < sorted.length,
      usedFallback: true,
    };
  };

  try {
    return await runOrderedFetch();
  } catch (error) {
    if (!isFirestoreIndexError(error)) throw error;
    return runFallbackFetch();
  }
}

/**
 * Ledger central completo del restaurante (una query; filtrar en cliente por fecha).
 * Fallback sin orderBy si falta índice en createdAt.
 */
export function listenCentralStockMovementsForRestaurant(
  restaurantId: string,
  onData: (items: CentralStockMovementListItem[]) => void,
  options?: ListenCentralStockMovementsForRestaurantOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 500, 1), 500);
  if (!rid || !auth.currentUser) {
    onData([]);
    return () => {};
  }

  const col = stockMovementsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (items: CentralStockMovementListItem[]) => {
    const sorted = [...items].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
    );
    onData(sorted.slice(0, lim));
  };

  const attachFallback = () => {
    fallbackActive = true;
    options?.onFallback?.();
    const fallbackQuery = query(col, limit(lim));
    innerUnsub = onSnapshot(
      fallbackQuery,
      (snap) => {
        emitSorted(snap.docs.map(mapCentralStockMovementSnapshot));
      },
      (error) => {
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  const orderedQuery = query(col, orderBy("createdAt", "desc"), limit(lim));

  innerUnsub = onSnapshot(
    orderedQuery,
    (snap) => {
      onData(snap.docs.map(mapCentralStockMovementSnapshot));
    },
    (error) => {
      if (!fallbackActive && isFirestoreIndexError(error)) {
        innerUnsub?.();
        attachFallback();
        return;
      }
      options?.onError?.(error);
      onData([]);
    },
  );

  return () => {
    innerUnsub?.();
  };
}

function mapPurchaseOrderStockMovementSnapshot(
  snap: QueryDocumentSnapshot<DocumentData>,
): PurchaseOrderStockMovementListItem {
  const d = snap.data() as Record<string, unknown>;
  const quantityDelta = readFiniteNumber(d.quantityDelta) ?? 0;
  const source = readOptionalString(d.source) ?? readOptionalString(d.type) ?? "unknown";
  const type = readOptionalString(d.type) ?? source;
  const appliedRaw = d.applied;
  return {
    id: snap.id,
    productId: readOptionalString(d.productId),
    productName: readOptionalString(d.productName),
    purchaseOrderId: readOptionalString(d.purchaseOrderId),
    purchaseReceiptId: readOptionalString(d.purchaseReceiptId),
    source,
    type,
    quantityDelta,
    unit: readOptionalString(d.unit) ?? "ud",
    stockBefore: readFiniteNumber(d.stockBefore),
    stockAfter: readFiniteNumber(d.stockAfter),
    applyError: readOptionalString(d.applyError),
    applied: typeof appliedRaw === "boolean" ? appliedRaw : null,
    createdAtMs: readMovementCreatedAtMs(d.createdAt),
  };
}

/**
 * Movimientos del ledger vinculados a un pedido de compra (source purchase_receipt).
 * Una query por purchaseOrderId; fallback sin orderBy si falta índice.
 */
export function listenStockMovementsForPurchaseOrder(
  restaurantId: string,
  purchaseOrderId: string,
  onData: (items: PurchaseOrderStockMovementListItem[]) => void,
  options?: ListenStockMovementsForPurchaseOrderOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const orderId = purchaseOrderId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  if (!rid || !orderId || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = stockMovementsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (items: PurchaseOrderStockMovementListItem[]) => {
    const filtered = items.filter(
      (item) =>
        item.purchaseOrderId === orderId &&
        (item.source === "purchase_receipt" || item.type === "purchase_receipt"),
    );
    const sorted = [...filtered].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
    );
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    emitSorted(snap.docs.map(mapPurchaseOrderStockMovementSnapshot));
  };

  const attachFallback = () => {
    fallbackActive = true;
    options?.onFallback?.();
    const fallbackQuery = query(
      col,
      where("purchaseOrderId", "==", orderId),
      limit(lim),
    );
    innerUnsub = onSnapshot(
      fallbackQuery,
      (snap) => mapSnapshot(snap),
      (error) => {
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  const orderedQuery = query(
    col,
    where("purchaseOrderId", "==", orderId),
    orderBy("createdAt", "desc"),
    limit(lim),
  );

  innerUnsub = onSnapshot(
    orderedQuery,
    (snap) => mapSnapshot(snap),
    (error) => {
      if (!fallbackActive && isFirestoreIndexError(error)) {
        innerUnsub?.();
        attachFallback();
        return;
      }
      options?.onError?.(error);
      onData([]);
    },
  );

  return () => {
    innerUnsub?.();
  };
}
