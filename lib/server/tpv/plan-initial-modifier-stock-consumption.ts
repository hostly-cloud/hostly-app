import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import {
  buildModifierSaleMovementFingerprint,
  buildModifierSaleV2MovementId,
  readStoredModifierSaleMovementFingerprint,
  STOCK_MOVEMENT_ID_CONFLICT,
} from "@/lib/inventory/modifier-sale-movement-identity";
import {
  assertExistingRecipeSaleMovementIsValidForIdempotentSkip,
} from "@/lib/inventory/recipe-sale-movement-identity";
import type {
  ModifierSaleStockMovementDocument,
  ModifierStockConsumptionWarning,
} from "@/lib/inventory/stock-movement-types";
import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  resolveInventoryUnitGroup,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { isModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import {
  deriveNewlySentSegments,
  deriveNewlySentUnits,
  type NewlySentSegment,
} from "@/lib/server/tpv/newly-sent-segments";
import {
  buildPendingRecipeWrites,
  finalizeRecipeMovementFingerprint,
  readSaleProductIdFromLine,
  validateRecipeInventoryProduct,
  type PendingRecipeMovementWrite,
} from "@/lib/server/tpv/plan-initial-recipe-stock-consumption";

export type { NewlySentSegment };
export { deriveNewlySentSegments, deriveNewlySentUnits };

export type ModifierStockConsumptionPlan = {
  warnings: ModifierStockConsumptionWarning[];
  movementIds: string[];
  /** Stock final escrito en esta tx por producto de inventario (modifier + recipe). */
  appliedStockByProductId: Record<string, number>;
};

type PendingMovementWrite = {
  movementId: string;
  fingerprint: string;
  payload: ModifierSaleStockMovementDocument;
  inventoryProductId: string;
  convertedDelta: number;
};

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
  const inv =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
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

type SelectedModifierRow = {
  groupId: string;
  groupName?: string;
  optionId: string;
  optionName?: string;
  inventoryProductId?: string;
  inventoryProductName?: string;
  inventoryQuantity?: number;
  inventoryUnit?: string;
};

function readSelectedModifiers(line: Record<string, unknown>): SelectedModifierRow[] {
  const raw = line.selectedModifiers;
  if (!Array.isArray(raw)) return [];
  const out: SelectedModifierRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const data = row as Record<string, unknown>;
    const groupId = typeof data.groupId === "string" ? data.groupId.trim() : "";
    const optionId = typeof data.optionId === "string" ? data.optionId.trim() : "";
    if (!groupId || !optionId) continue;
    out.push({
      groupId,
      groupName: typeof data.groupName === "string" ? data.groupName.trim() : undefined,
      optionId,
      optionName: typeof data.optionName === "string" ? data.optionName.trim() : undefined,
      inventoryProductId:
        typeof data.inventoryProductId === "string" ? data.inventoryProductId.trim() : undefined,
      inventoryProductName:
        typeof data.inventoryProductName === "string"
          ? data.inventoryProductName.trim()
          : undefined,
      inventoryQuantity: readFiniteNumber(data.inventoryQuantity) ?? undefined,
      inventoryUnit:
        typeof data.inventoryUnit === "string" ? data.inventoryUnit.trim() : undefined,
    });
  }
  return out;
}

function selectionOccurrenceKey(mod: SelectedModifierRow): string {
  return `${mod.groupId}::${mod.optionId}::${mod.inventoryProductId ?? ""}`;
}

export function validateModifierInventoryProduct(params: {
  restaurantId: string;
  orderId: string;
  lineId: string;
  groupId: string;
  optionId: string;
  inventoryProductId: string;
  inventoryUnit: string;
  inventoryQuantityPerUnit: number;
  productData: Record<string, unknown> | undefined;
}): ModifierStockConsumptionWarning | null {
  const {
    restaurantId,
    orderId,
    lineId,
    groupId,
    optionId,
    inventoryProductId,
    inventoryUnit,
    inventoryQuantityPerUnit,
    productData,
  } = params;

  if (!productData) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "PRODUCT_NOT_FOUND",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!assertSameRestaurantDoc(productData, restaurantId)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "PRODUCT_NOT_FOUND",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isProductActive(productData)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "PRODUCT_INACTIVE",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isInventoryEnabled(productData)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "INVENTORY_DISABLED",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (readValidInventoryCurrentStock(productData) === null) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "INVALID_CURRENT_STOCK",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  const productUnit = readCanonicalProductInventoryUnit(productData);
  if (!productUnit) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "UNKNOWN_PRODUCT_UNIT",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (!isModifierInventoryUnit(inventoryUnit)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "INCOMPATIBLE_UNIT",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  if (resolveInventoryUnitGroup(inventoryUnit) !== resolveInventoryUnitGroup(productUnit)) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "INCOMPATIBLE_UNIT",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  const converted = convertInventoryQuantity({
    quantity: -inventoryQuantityPerUnit,
    fromUnit: inventoryUnit,
    toUnit: productUnit,
  });
  if (converted == null || !Number.isFinite(converted) || converted >= 0) {
    return {
      inventoryProductId,
      orderId,
      lineId,
      groupId,
      optionId,
      reason: "INVALID_CONSUMPTION_QUANTITY",
      requestedQuantity: inventoryQuantityPerUnit,
      unit: inventoryUnit,
    };
  }
  return null;
}

function buildPendingWrites(params: {
  restaurantId: string;
  orderId: string;
  actorUid: string;
  segments: readonly NewlySentSegment[];
  nowMs: number;
}): { pending: PendingMovementWrite[]; warnings: ModifierStockConsumptionWarning[] } {
  const pending: PendingMovementWrite[] = [];
  const warnings: ModifierStockConsumptionWarning[] = [];
  const occurrenceCounter = new Map<string, number>();

  for (const segment of params.segments) {
    const modifiers = readSelectedModifiers(segment.line);
    const saleProductId = String(segment.line.productId ?? "");
    const saleProductName = String(
      segment.line.productName ?? segment.line.name ?? segment.line.displayName ?? "",
    );

    for (const mod of modifiers) {
      if (!mod.inventoryProductId) continue;
      if (mod.inventoryQuantity == null || mod.inventoryQuantity <= 0) continue;
      if (!mod.inventoryUnit || !isModifierInventoryUnit(mod.inventoryUnit)) continue;

      const occurrenceKey = selectionOccurrenceKey(mod);
      const selectionOccurrence = occurrenceCounter.get(occurrenceKey) ?? 0;
      occurrenceCounter.set(occurrenceKey, selectionOccurrence + 1);

      const sentQuantity = segment.newlySentUnits;
      const inventoryQuantityPerUnit = mod.inventoryQuantity;
      const quantityDelta = roundInventoryQuantity(
        -(inventoryQuantityPerUnit * sentQuantity),
      );
      const movementId = buildModifierSaleV2MovementId({
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        sentSegmentLineId: segment.sentSegmentLineId,
        modifierGroupId: mod.groupId,
        modifierOptionId: mod.optionId,
        inventoryProductId: mod.inventoryProductId,
        selectionOccurrence,
      });
      const fingerprint = buildModifierSaleMovementFingerprint({
        sentQuantity,
        inventoryQuantityPerUnit,
        inventoryUnit: mod.inventoryUnit,
        quantityDelta,
      });

      pending.push({
        movementId,
        fingerprint,
        inventoryProductId: mod.inventoryProductId,
        convertedDelta: 0,
        payload: {
          restaurantId: params.restaurantId,
          productId: mod.inventoryProductId,
          productName: mod.inventoryProductName ?? mod.inventoryProductId,
          source: "modifier_sale",
          type: "modifier_sale",
          orderId: params.orderId,
          lineId: segment.sentSegmentLineId,
          saleProductId,
          saleProductName,
          modifierGroupId: mod.groupId,
          modifierOptionId: mod.optionId,
          modifierOptionName: mod.optionName ?? mod.optionId,
          quantityDelta,
          unit: mod.inventoryUnit,
          idempotencyKey: movementId,
          createdAt: params.nowMs,
          createdBy: params.actorUid,
          applied: true,
          appliedAt: params.nowMs,
          sentSegmentLineId: segment.sentSegmentLineId,
          selectionOccurrence,
          movementFingerprint: fingerprint,
          sentQuantity,
          inventoryQuantityPerUnit,
        },
      });
    }
  }

  return { pending, warnings };
}

export async function applyInitialModifierStockConsumptionInTransaction(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  orderId: string;
  actorUid: string;
  beforeItems: readonly Record<string, unknown>[];
  afterItems: readonly Record<string, unknown>[];
  nowMs: number;
}): Promise<ModifierStockConsumptionPlan> {
  const segments = deriveNewlySentSegments(params.beforeItems, params.afterItems);
  if (segments.length === 0) {
    return { warnings: [], movementIds: [], appliedStockByProductId: {} };
  }

  const { pending, warnings } = buildPendingWrites({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    actorUid: params.actorUid,
    segments,
    nowMs: params.nowMs,
  });

  // All reads first (modifier + recipe) to satisfy Firestore tx ordering.
  const saleProductIds = [
    ...new Set(segments.map((segment) => readSaleProductIdFromLine(segment.line)).filter(Boolean)),
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

  const { pending: recipePending, warnings: recipeWarnings } = buildPendingRecipeWrites({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    actorUid: params.actorUid,
    segments,
    saleProductDataById,
    nowMs: params.nowMs,
  });
  for (const warning of recipeWarnings) {
    console.warn("[Hostly Inventory] recipe stock skipped:", warning);
  }

  if (pending.length === 0 && recipePending.length === 0) {
    return { warnings, movementIds: [], appliedStockByProductId: {} };
  }

  const allPendingMovements: Array<
    | { kind: "modifier"; row: PendingMovementWrite }
    | { kind: "recipe"; row: PendingRecipeMovementWrite }
  > = [
    ...pending.map((row) => ({ kind: "modifier" as const, row })),
    ...recipePending.map((row) => ({ kind: "recipe" as const, row })),
  ];

  const movementRefs: DocumentReference[] = allPendingMovements.map((entry) =>
    params.db
      .collection("restaurants")
      .doc(params.restaurantId)
      .collection("stockMovements")
      .doc(entry.row.movementId),
  );
  const uniqueProductIds = [
    ...new Set(allPendingMovements.map((entry) => entry.row.inventoryProductId)),
  ];
  const productRefs = uniqueProductIds.map((productId) =>
    params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
  );

  const movementSnaps = movementRefs.length > 0 ? await params.tx.getAll(...movementRefs) : [];
  const productSnaps = productRefs.length > 0 ? await params.tx.getAll(...productRefs) : [];

  const movementSnapById = new Map<string, DocumentSnapshot>();
  movementSnaps.forEach((snap, index) => {
    movementSnapById.set(allPendingMovements[index]!.row.movementId, snap);
  });
  const productDataById = new Map<string, Record<string, unknown>>();
  productSnaps.forEach((snap, index) => {
    if (snap.exists) {
      productDataById.set(uniqueProductIds[index]!, snap.data() as Record<string, unknown>);
    }
  });

  const validatedModifiers: PendingMovementWrite[] = [];
  const validatedRecipes: PendingRecipeMovementWrite[] = [];
  const movementIds: string[] = [];
  const skippedExistingStockAfterByProduct = new Map<
    string,
    Array<{ movementId: string; stockAfter: number }>
  >();
  const expectStockMatchFor = (inventoryProductId: string) =>
    allPendingMovements.filter((entry) => entry.row.inventoryProductId === inventoryProductId)
      .length === 1;

  for (const entry of [...allPendingMovements].sort((a, b) =>
    a.row.movementId.localeCompare(b.row.movementId),
  )) {
    const existingSnap = movementSnapById.get(entry.row.movementId);

    if (entry.kind === "modifier") {
      const row = entry.row;
      if (existingSnap?.exists) {
        const existingData = existingSnap.data() as Record<string, unknown>;
        const storedFingerprint = readStoredModifierSaleMovementFingerprint(existingData);
        if (storedFingerprint && storedFingerprint !== row.fingerprint) {
          throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
        }
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
      const warning = validateModifierInventoryProduct({
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        lineId: row.payload.lineId,
        groupId: row.payload.modifierGroupId,
        optionId: row.payload.modifierOptionId,
        inventoryProductId: row.inventoryProductId,
        inventoryUnit: String(row.payload.unit),
        inventoryQuantityPerUnit: row.payload.inventoryQuantityPerUnit ?? 0,
        productData,
      });
      if (warning) {
        warnings.push(warning);
        console.warn("[Hostly Inventory] modifier stock skipped:", warning);
        continue;
      }
      const productUnit = readCanonicalProductInventoryUnit(productData);
      if (!productUnit) continue;
      const convertedPerUnit = convertInventoryQuantity({
        quantity: -(row.payload.inventoryQuantityPerUnit ?? 0),
        fromUnit: row.payload.unit,
        toUnit: productUnit,
      });
      if (convertedPerUnit == null || !Number.isFinite(convertedPerUnit)) {
        warnings.push({
          inventoryProductId: row.inventoryProductId,
          orderId: params.orderId,
          lineId: row.payload.lineId,
          groupId: row.payload.modifierGroupId,
          optionId: row.payload.modifierOptionId,
          reason: "INCOMPATIBLE_UNIT",
          requestedQuantity: row.payload.inventoryQuantityPerUnit,
          unit: String(row.payload.unit),
        });
        continue;
      }
      row.convertedDelta = roundInventoryQuantity(
        convertedPerUnit * (row.payload.sentQuantity ?? 0),
      );
      validatedModifiers.push(row);
      continue;
    }

    const row = entry.row;
    if (existingSnap?.exists) {
      const existingData = existingSnap.data() as Record<string, unknown>;
      const productData = productDataById.get(row.inventoryProductId);
      const productUnit = readCanonicalProductInventoryUnit(productData);
      const productStock = readValidInventoryCurrentStock(productData);
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
      console.warn("[Hostly Inventory] recipe stock skipped:", {
        inventoryProductId: row.inventoryProductId,
        reason: "INCOMPATIBLE_UNIT",
      });
      continue;
    }
    finalizeRecipeMovementFingerprint(row, productUnit);
    row.convertedDelta = roundInventoryQuantity(
      convertedPerUnit * (row.payload.sentQuantity ?? 0),
    );
    validatedRecipes.push(row);
  }

  for (const [productId, entries] of skippedExistingStockAfterByProduct.entries()) {
    const hasNewWrite =
      validatedModifiers.some((row) => row.inventoryProductId === productId) ||
      validatedRecipes.some((row) => row.inventoryProductId === productId);
    if (hasNewWrite) continue;
    if (entries.length <= 1) continue;
    const last = [...entries].sort((a, b) => a.movementId.localeCompare(b.movementId)).at(-1);
    const current = readValidInventoryCurrentStock(productDataById.get(productId));
    if (!last || current == null || current !== last.stockAfter) {
      throw new Error(STOCK_MOVEMENT_ID_CONFLICT);
    }
  }

  const runningStock = new Map<string, number>();
  const seedStock = (productId: string) => {
    if (runningStock.has(productId)) return;
    const stock = readValidInventoryCurrentStock(productDataById.get(productId));
    if (stock === null) return;
    runningStock.set(productId, stock);
  };
  for (const row of validatedModifiers) seedStock(row.inventoryProductId);
  for (const row of validatedRecipes) seedStock(row.inventoryProductId);

  const writeRows: Array<{
    movementId: string;
    inventoryProductId: string;
    convertedDelta: number;
    apply: (stockBefore: number, stockAfter: number) => void;
  }> = [
    ...validatedModifiers.map((row) => ({
      movementId: row.movementId,
      inventoryProductId: row.inventoryProductId,
      convertedDelta: row.convertedDelta,
      apply: (stockBefore: number, stockAfter: number) => {
        row.payload.stockBefore = stockBefore;
        row.payload.stockAfter = stockAfter;
        row.payload.applied = true;
        row.payload.appliedAt = params.nowMs;
        params.tx.set(
          params.db
            .collection("restaurants")
            .doc(params.restaurantId)
            .collection("stockMovements")
            .doc(row.movementId),
          row.payload,
        );
      },
    })),
    ...validatedRecipes.map((row) => ({
      movementId: row.movementId,
      inventoryProductId: row.inventoryProductId,
      convertedDelta: row.convertedDelta,
      apply: (stockBefore: number, stockAfter: number) => {
        row.payload.stockBefore = stockBefore;
        row.payload.stockAfter = stockAfter;
        row.payload.applied = true;
        row.payload.appliedAt = params.nowMs;
        params.tx.set(
          params.db
            .collection("restaurants")
            .doc(params.restaurantId)
            .collection("stockMovements")
            .doc(row.movementId),
          row.payload,
        );
      },
    })),
  ];

  for (const row of writeRows.sort((a, b) => a.movementId.localeCompare(b.movementId))) {
    const before = runningStock.get(row.inventoryProductId);
    if (before == null) continue;
    const after = roundInventoryQuantity(before + row.convertedDelta);
    row.apply(before, after);
    runningStock.set(row.inventoryProductId, after);
    movementIds.push(row.movementId);
  }

  const appliedStockByProductId: Record<string, number> = {};
  for (const [productId, stockAfter] of runningStock.entries()) {
    const touched = writeRows.some((row) => row.inventoryProductId === productId);
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
