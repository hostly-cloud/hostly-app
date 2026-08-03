import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import {
  buildModifierSaleMovementFingerprint,
  buildModifierSaleV2MovementId,
  readStoredModifierSaleMovementFingerprint,
} from "@/lib/inventory/modifier-sale-movement-identity";
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

export type NewlySentSegment = {
  sentSegmentLineId: string;
  line: Record<string, unknown>;
  newlySentUnits: number;
};

export type ModifierStockConsumptionPlan = {
  warnings: ModifierStockConsumptionWarning[];
  movementIds: string[];
};

type PendingMovementWrite = {
  movementId: string;
  fingerprint: string;
  payload: ModifierSaleStockMovementDocument;
  inventoryProductId: string;
  convertedDelta: number;
};

function readLineId(line: Record<string, unknown>): string {
  return typeof line.id === "string" ? line.id.trim() : "";
}

function readLineQuantity(line: Record<string, unknown>): number {
  const qty = Math.floor(Number(line.quantity ?? line.qty) || 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
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

/** Canonical first-send units from orders.items[] snapshots. */
export function deriveNewlySentUnits(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): number {
  const afterStatus = normalizeProductionLineStatus(after.status);
  if (afterStatus !== "sent") return 0;
  const qty = readLineQuantity(after);
  if (qty <= 0) return 0;
  if (!before) return qty;
  const beforeStatus = normalizeProductionLineStatus(before.status);
  if (beforeStatus === "pending") return qty;
  return 0;
}

export function deriveNewlySentSegments(
  beforeItems: readonly Record<string, unknown>[],
  afterItems: readonly Record<string, unknown>[],
): NewlySentSegment[] {
  const beforeById = new Map<string, Record<string, unknown>>();
  for (const line of beforeItems) {
    const id = readLineId(line);
    if (id) beforeById.set(id, line);
  }
  const out: NewlySentSegment[] = [];
  for (const line of afterItems) {
    const sentSegmentLineId = readLineId(line);
    if (!sentSegmentLineId) continue;
    const newlySentUnits = deriveNewlySentUnits(beforeById.get(sentSegmentLineId), line);
    if (newlySentUnits <= 0) continue;
    out.push({ sentSegmentLineId, line, newlySentUnits });
  }
  return out;
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
    return { warnings: [], movementIds: [] };
  }

  const { pending, warnings } = buildPendingWrites({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    actorUid: params.actorUid,
    segments,
    nowMs: params.nowMs,
  });
  if (pending.length === 0) {
    return { warnings, movementIds: [] };
  }

  const movementRefs: DocumentReference[] = pending.map((row) =>
    params.db
      .collection("restaurants")
      .doc(params.restaurantId)
      .collection("stockMovements")
      .doc(row.movementId),
  );
  const uniqueProductIds = [...new Set(pending.map((row) => row.inventoryProductId))];
  const productRefs = uniqueProductIds.map((productId) =>
    params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
  );

  const movementSnaps = movementRefs.length > 0 ? await params.tx.getAll(...movementRefs) : [];
  const productSnaps = productRefs.length > 0 ? await params.tx.getAll(...productRefs) : [];

  const movementSnapById = new Map<string, DocumentSnapshot>();
  movementSnaps.forEach((snap, index) => {
    movementSnapById.set(pending[index]!.movementId, snap);
  });
  const productDataById = new Map<string, Record<string, unknown>>();
  productSnaps.forEach((snap, index) => {
    if (snap.exists) {
      productDataById.set(uniqueProductIds[index]!, snap.data() as Record<string, unknown>);
    }
  });

  const validated: PendingMovementWrite[] = [];
  const movementIds: string[] = [];

  for (const row of pending.sort((a, b) => a.movementId.localeCompare(b.movementId))) {
    const existingSnap = movementSnapById.get(row.movementId);
    if (existingSnap?.exists) {
      const storedFingerprint = readStoredModifierSaleMovementFingerprint(
        existingSnap.data() as Record<string, unknown>,
      );
      if (storedFingerprint && storedFingerprint !== row.fingerprint) {
        throw new Error("STOCK_MOVEMENT_ID_CONFLICT");
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
    if (!productUnit) {
      continue;
    }
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
    row.convertedDelta = roundInventoryQuantity(convertedPerUnit * (row.payload.sentQuantity ?? 0));
    validated.push(row);
  }

  const runningStock = new Map<string, number>();
  for (const row of validated) {
    if (runningStock.has(row.inventoryProductId)) continue;
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

  for (const [productId, stockAfter] of runningStock.entries()) {
    const touched = validated.some((row) => row.inventoryProductId === productId);
    if (!touched) continue;
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

  return { warnings, movementIds: [...new Set(movementIds)] };
}
