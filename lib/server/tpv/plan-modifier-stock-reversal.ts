import type { Firestore, Transaction } from "firebase-admin/firestore";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import {
  assertValidModifierSaleAggregatedReversalV3BalanceDocument,
  assertValidStoredModifierSaleAggregatedReversalDocument,
  assertModifierSaleOriginalPoolCoherent,
  assertValidStoredModifierSaleV2OriginalFromLedgerRow,
  buildModifierSaleAggregatedReversalFingerprint,
  buildModifierSaleAggregatedReversalV3MovementId,
  classifyLineStockMovementForOriginalLookup,
  MODIFIER_SALE_REVERSAL_SCHEMA_V3,
  MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR,
  type ExpectedModifierSaleAggregatedReversalDocument,
  type ModifierSaleAggregatedReversalBalanceContext,
} from "@/lib/inventory/modifier-sale-movement-identity";
import type {
  ModifierSaleReversalStockMovementDocument,
  ModifierStockConsumptionWarning,
  ModifierStockConsumptionWarningReason,
} from "@/lib/inventory/stock-movement-types";
import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  resolveInventoryUnitGroup,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { isModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import { stablePayloadHash } from "@/lib/server/tpv/tpv-idempotency";

export type ModifierStockReversalPlan = {
  warnings: ModifierStockConsumptionWarning[];
  movementIds: string[];
  unitsReversed: number;
};

export type ModifierReversalOperationKind = "cancel_lines" | "remove_line_unit";

/** Domain error prefix for mandatory reversal blocked by inventory product state. */
export function buildModifierReversalBlockedErrorCode(
  reason: ModifierStockConsumptionWarningReason,
): string {
  return `MODIFIER_REVERSAL_${reason}`;
}

export function isModifierReversalBlockedError(message: string): boolean {
  return message.startsWith("MODIFIER_REVERSAL_");
}

function throwModifierReversalBlocked(reason: ModifierStockConsumptionWarningReason): never {
  throw new Error(buildModifierReversalBlockedErrorCode(reason));
}

function throwLedgerConflict(): never {
  throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
}

export function buildModifierReversalOperationIdempotencyKey(params: {
  operationKind: ModifierReversalOperationKind;
  restaurantId: string;
  orderId: string;
  lineId: string;
  beforeRemaining: number;
  afterRemaining: number;
  externalOperationIdempotencyKey?: string;
}): string {
  const external = params.externalOperationIdempotencyKey?.trim();
  if (external) return external;
  return stablePayloadHash({
    schema: "modifier_reversal_op_v1",
    kind: params.operationKind,
    restaurantId: params.restaurantId.trim(),
    orderId: params.orderId.trim(),
    lineId: params.lineId.trim(),
    beforeRemaining: params.beforeRemaining,
    afterRemaining: params.afterRemaining,
  });
}

type SelectedModifierRow = {
  groupId: string;
  optionId: string;
  optionName?: string;
  inventoryProductId?: string;
  inventoryProductName?: string;
  inventoryQuantity?: number;
  inventoryUnit?: string;
};

type PendingReversalWrite = {
  movementId: string;
  inventoryProductId: string;
  convertedDelta: number;
  payload: ModifierSaleReversalStockMovementDocument;
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

function assertSameRestaurantDoc(data: Record<string, unknown>, restaurantId: string): boolean {
  const docRid = typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  return !docRid || docRid === restaurantId.trim();
}

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

function isInventoryModifier(mod: SelectedModifierRow): boolean {
  if (!mod.inventoryProductId) return false;
  if (mod.inventoryQuantity == null || mod.inventoryQuantity <= 0) return false;
  if (!mod.inventoryUnit || !isModifierInventoryUnit(mod.inventoryUnit)) return false;
  return true;
}

function readInventoryModifiers(line: Record<string, unknown>): SelectedModifierRow[] {
  return readSelectedModifiers(line).filter(isInventoryModifier);
}

type LineReversalTarget = {
  sentSegmentLineId: string;
  sourceLine: Record<string, unknown>;
};

type ResolvedOriginalCandidate = {
  target: LineReversalTarget;
  mod: SelectedModifierRow;
  selectionOccurrence: number;
  originalMovementId: string;
  saleProductId: string;
  saleProductName: string;
  originalData: Record<string, unknown>;
  consumedSaleUnits: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
};

function originalModifierPoolKey(mod: SelectedModifierRow): string {
  return `${mod.groupId}::${mod.optionId}::${mod.inventoryProductId ?? ""}`;
}

function originalLogicalSlotKey(params: {
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
  selectionOccurrence: number;
}): string {
  return `${params.modifierGroupId}::${params.modifierOptionId}::${params.inventoryProductId}::${params.selectionOccurrence}`;
}

type OriginalModifierPoolRow = {
  selectionOccurrence: number;
  originalMovementId: string;
  originalData: Record<string, unknown>;
  consumedSaleUnits: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
};

function countInventoryModSlotsByPoolKey(line: Record<string, unknown>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const mod of readInventoryModifiers(line)) {
    const poolKey = originalModifierPoolKey(mod);
    counts.set(poolKey, (counts.get(poolKey) ?? 0) + 1);
  }
  return counts;
}

/**
 * Single line-scoped ledger read for modifier_sale originals.
 *
 * Required Firestore composite index (COLLECTION scope, declared in firestore.indexes.json):
 *   stockMovements: orderId ASC, lineId ASC
 *
 * Deploy firestore:indexes and wait until Enabled before shipping the app.
 * Reversal balance reads use reversalOfMovementId ASC + type ASC (same file/indexes).
 */
async function loadValidatedOriginalPoolsForLine(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
}): Promise<Map<string, OriginalModifierPoolRow[]>> {
  const snap = await params.tx.get(
    params.db
      .collection("restaurants")
      .doc(params.restaurantId)
      .collection("stockMovements")
      .where("orderId", "==", params.orderId)
      .where("lineId", "==", params.sentSegmentLineId),
  );

  const pools = new Map<string, OriginalModifierPoolRow[]>();
  const occupiedLogicalSlots = new Map<string, string>();
  const queryContext = {
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    sentSegmentLineId: params.sentSegmentLineId,
  };

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const classification = classifyLineStockMovementForOriginalLookup(doc.id, data);
    if (classification === "skip") {
      continue;
    }
    if (classification === "conflict_contradictory_identity") {
      throwLedgerConflict();
    }

    const validated = assertValidStoredModifierSaleV2OriginalFromLedgerRow(
      doc.id,
      data,
      queryContext,
    );

    const slotKey = originalLogicalSlotKey({
      modifierGroupId: validated.modifierGroupId,
      modifierOptionId: validated.modifierOptionId,
      inventoryProductId: validated.inventoryProductId,
      selectionOccurrence: validated.selectionOccurrence,
    });
    if (occupiedLogicalSlots.has(slotKey)) {
      throwLedgerConflict();
    }
    occupiedLogicalSlots.set(slotKey, doc.id);

    const poolKey = originalModifierPoolKey({
      groupId: validated.modifierGroupId,
      optionId: validated.modifierOptionId,
      inventoryProductId: validated.inventoryProductId,
    });
    const pool = pools.get(poolKey) ?? [];
    pool.push({
      selectionOccurrence: validated.selectionOccurrence,
      originalMovementId: doc.id,
      originalData: validated.originalData,
      consumedSaleUnits: validated.sentQuantity,
      inventoryQuantityPerUnit: validated.inventoryQuantityPerUnit,
      inventoryUnit: validated.inventoryUnit,
    });
    pools.set(poolKey, pool);
  }

  for (const pool of pools.values()) {
    pool.sort((a, b) => a.selectionOccurrence - b.selectionOccurrence);
  }

  return pools;
}

function pushResolvedOriginalCandidate(params: {
  resolved: ResolvedOriginalCandidate[];
  target: LineReversalTarget;
  mod: SelectedModifierRow;
  saleProductId: string;
  saleProductName: string;
  hit: OriginalModifierPoolRow;
}): void {
  params.resolved.push({
    target: params.target,
    mod: params.mod,
    selectionOccurrence: params.hit.selectionOccurrence,
    originalMovementId: params.hit.originalMovementId,
    saleProductId: params.saleProductId,
    saleProductName: params.saleProductName,
    originalData: params.hit.originalData,
    consumedSaleUnits: params.hit.consumedSaleUnits,
    inventoryQuantityPerUnit: params.hit.inventoryQuantityPerUnit,
    inventoryUnit: params.hit.inventoryUnit,
  });
}

async function resolveOriginalCandidatesFromLedger(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  orderId: string;
  targets: readonly LineReversalTarget[];
}): Promise<ResolvedOriginalCandidate[]> {
  const poolsByLine = new Map<string, Map<string, OriginalModifierPoolRow[]>>();
  const uniqueLineIds = [...new Set(params.targets.map((target) => target.sentSegmentLineId))];

  for (const lineId of uniqueLineIds) {
    poolsByLine.set(
      lineId,
      await loadValidatedOriginalPoolsForLine({
        tx: params.tx,
        db: params.db,
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        sentSegmentLineId: lineId,
      }),
    );
  }

  const resolved: ResolvedOriginalCandidate[] = [];
  for (const target of params.targets) {
    const saleProductId = String(target.sourceLine.productId ?? "");
    const saleProductName = String(
      target.sourceLine.productName ??
        target.sourceLine.name ??
        target.sourceLine.displayName ??
        "",
    );
    const linePools = poolsByLine.get(target.sentSegmentLineId);
    if (!linePools) continue;

    const slotCountsByPoolKey = countInventoryModSlotsByPoolKey(target.sourceLine);
    for (const [poolKey, expectedSlotCount] of slotCountsByPoolKey) {
      const poolRows = linePools.get(poolKey) ?? [];
      assertModifierSaleOriginalPoolCoherent({ expectedSlotCount, poolRows });
    }

    /*
     * sent+ lines must preserve selectedModifiers order from consumption time.
     * Pool rows are sorted by persisted selectionOccurrence; shift() pairs them
     * with inventory slots in current array order. A writer that reorders
     * selectedModifiers after send makes pairing ambiguous → pool mismatch aborts.
     */
    for (const mod of readInventoryModifiers(target.sourceLine)) {
      const poolKey = originalModifierPoolKey(mod);
      const pool = linePools.get(poolKey);
      const queryHit = pool?.shift();
      if (!queryHit) {
        continue;
      }

      pushResolvedOriginalCandidate({
        resolved,
        target,
        mod,
        saleProductId,
        saleProductName,
        hit: queryHit,
      });
    }
  }

  return resolved;
}

/**
 * Units that should still hold consumption after the mutation.
 * Pending/cancelled → 0. Active production statuses keep their quantity.
 */
export function remainingConsumedUnitsAfter(line: Record<string, unknown> | undefined): number {
  if (!line) return 0;
  const status = normalizeProductionLineStatus(line.status);
  if (status === "pending" || status === "cancelled") return 0;
  return readLineQuantity(line);
}

/**
 * How many sale units should be reversed for this before→after transition.
 */
export function deriveUnitsToReverse(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): number {
  if (!before) return 0;
  const beforeStatus = normalizeProductionLineStatus(before.status);
  if (beforeStatus === "pending" || beforeStatus === "cancelled") return 0;

  const beforeRemaining = remainingConsumedUnitsAfter(before);
  const afterRemaining = remainingConsumedUnitsAfter(after);
  const delta = beforeRemaining - afterRemaining;
  return delta > 0 ? delta : 0;
}

function indexItemsById(
  items: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const line of items) {
    const id = readLineId(line);
    if (id) map.set(id, line);
  }
  return map;
}

function collectLineTargets(params: {
  beforeItems: readonly Record<string, unknown>[];
  afterItems: readonly Record<string, unknown>[];
  lineIds?: readonly string[];
}): LineReversalTarget[] {
  const beforeById = indexItemsById(params.beforeItems);
  const afterById = indexItemsById(params.afterItems);
  const ids =
    params.lineIds && params.lineIds.length > 0
      ? [...new Set(params.lineIds.map((id) => id.trim()).filter(Boolean))]
      : [...new Set([...beforeById.keys(), ...afterById.keys()])];

  const targets: LineReversalTarget[] = [];
  for (const lineId of ids) {
    const beforeLine = beforeById.get(lineId);
    const afterLine = afterById.get(lineId);
    const sourceLine = beforeLine ?? afterLine;
    if (!sourceLine) continue;
    if (beforeLine && normalizeProductionLineStatus(beforeLine.status) === "pending") {
      continue;
    }
    if (!beforeLine && normalizeProductionLineStatus(sourceLine.status) === "pending") {
      continue;
    }
    targets.push({ sentSegmentLineId: lineId, sourceLine });
  }
  return targets;
}

type ReversalSlot = ResolvedOriginalCandidate;

function buildExpectedAggregatedReversalDocument(params: {
  slot: ReversalSlot;
  restaurantId: string;
  orderId: string;
  operationIdempotencyKey: string;
  reversedSaleUnits: number;
}): ExpectedModifierSaleAggregatedReversalDocument {
  const quantityDelta = roundInventoryQuantity(
    params.reversedSaleUnits * params.slot.inventoryQuantityPerUnit,
  );
  const fingerprint = buildModifierSaleAggregatedReversalFingerprint({
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    reversedSaleUnits: params.reversedSaleUnits,
    inventoryQuantityPerUnit: params.slot.inventoryQuantityPerUnit,
    inventoryUnit: params.slot.inventoryUnit,
    quantityDelta,
  });
  const movementId = buildModifierSaleAggregatedReversalV3MovementId({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    sentSegmentLineId: params.slot.target.sentSegmentLineId,
    reversalOfMovementId: params.slot.originalMovementId,
    operationIdempotencyKey: params.operationIdempotencyKey,
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
  });
  return {
    movementId,
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    lineId: params.slot.target.sentSegmentLineId,
    productId: params.slot.mod.inventoryProductId!,
    modifierGroupId: params.slot.mod.groupId,
    modifierOptionId: params.slot.mod.optionId,
    reversalOfMovementId: params.slot.originalMovementId,
    selectionOccurrence: params.slot.selectionOccurrence,
    operationIdempotencyKey: params.operationIdempotencyKey,
    reversedSaleUnits: params.reversedSaleUnits,
    quantityDelta,
    inventoryQuantityPerUnit: params.slot.inventoryQuantityPerUnit,
    inventoryUnit: params.slot.inventoryUnit,
    fingerprint,
  };
}

async function loadLedgerReversalsForOriginal(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  originalMovementId: string;
}): Promise<Array<{ movementId: string; data: Record<string, unknown> }>> {
  const snap = await params.tx.get(
    params.db
      .collection("restaurants")
      .doc(params.restaurantId)
      .collection("stockMovements")
      .where("reversalOfMovementId", "==", params.originalMovementId)
      .where("type", "==", "modifier_sale_reversal"),
  );
  return snap.docs.map((doc) => ({
    movementId: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
}

function mergeLedgerRows(params: {
  ledgerRows: Array<{ movementId: string; data: Record<string, unknown> }>;
  directRow?: { movementId: string; data: Record<string, unknown> };
}): Array<{ movementId: string; data: Record<string, unknown> }> {
  const byId = new Map<string, { movementId: string; data: Record<string, unknown> }>();
  for (const row of params.ledgerRows) {
    byId.set(row.movementId, row);
  }
  if (params.directRow && !byId.has(params.directRow.movementId)) {
    byId.set(params.directRow.movementId, params.directRow);
  }
  return [...byId.values()].sort((a, b) => a.movementId.localeCompare(b.movementId));
}

function computeValidatedGlobalReversedSaleUnits(params: {
  ledgerRows: Array<{ movementId: string; data: Record<string, unknown> }>;
  balanceContext: ModifierSaleAggregatedReversalBalanceContext;
  consumedSaleUnits: number;
}): number {
  let totalRevertido = 0;
  for (const row of params.ledgerRows) {
    totalRevertido += assertValidModifierSaleAggregatedReversalV3BalanceDocument(
      row.movementId,
      row.data,
      params.balanceContext,
    );
  }
  if (totalRevertido > params.consumedSaleUnits) {
    throwLedgerConflict();
  }
  return totalRevertido;
}

/**
 * Reverses modifier stock using aggregated v3 ledger documents (one per logical mutation).
 */
export async function applyModifierStockReversalInTransaction(params: {
  tx: Transaction;
  db: Firestore;
  restaurantId: string;
  orderId: string;
  actorUid: string;
  beforeItems: readonly Record<string, unknown>[];
  afterItems: readonly Record<string, unknown>[];
  nowMs: number;
  operationKind?: ModifierReversalOperationKind;
  externalOperationIdempotencyKey?: string;
  lineIds?: readonly string[];
}): Promise<ModifierStockReversalPlan> {
  const operationKind = params.operationKind ?? "cancel_lines";
  const targets = collectLineTargets({
    beforeItems: params.beforeItems,
    afterItems: params.afterItems,
    lineIds: params.lineIds,
  });
  if (targets.length === 0) {
    return { warnings: [], movementIds: [], unitsReversed: 0 };
  }

  const beforeById = indexItemsById(params.beforeItems);
  const afterById = indexItemsById(params.afterItems);

  const originalCandidates = await resolveOriginalCandidatesFromLedger({
    tx: params.tx,
    db: params.db,
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    targets,
  });

  if (originalCandidates.length === 0) {
    return { warnings: [], movementIds: [], unitsReversed: 0 };
  }

  const slots: ReversalSlot[] = originalCandidates;

  const pending: PendingReversalWrite[] = [];
  const movementIds: string[] = [];
  let unitsReversed = 0;

  for (const slot of slots) {
    const beforeLine = beforeById.get(slot.target.sentSegmentLineId);
    const afterLine = afterById.get(slot.target.sentSegmentLineId);
    const beforeRemaining = remainingConsumedUnitsAfter(beforeLine);
    const afterRemaining = remainingConsumedUnitsAfter(afterLine);
    const unitsRequested = deriveUnitsToReverse(beforeLine, afterLine);
    if (unitsRequested <= 0) {
      continue;
    }

    const operationIdempotencyKey = buildModifierReversalOperationIdempotencyKey({
      operationKind,
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      lineId: slot.target.sentSegmentLineId,
      beforeRemaining,
      afterRemaining,
      externalOperationIdempotencyKey: params.externalOperationIdempotencyKey,
    });

    const expected = buildExpectedAggregatedReversalDocument({
      slot,
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      operationIdempotencyKey,
      reversedSaleUnits: unitsRequested,
    });

    const ledgerRows = await loadLedgerReversalsForOriginal({
      tx: params.tx,
      db: params.db,
      restaurantId: params.restaurantId,
      originalMovementId: slot.originalMovementId,
    });

    let directRow: { movementId: string; data: Record<string, unknown> } | undefined;
    const directSnap = await params.tx.get(
      params.db
        .collection("restaurants")
        .doc(params.restaurantId)
        .collection("stockMovements")
        .doc(expected.movementId),
    );
    if (directSnap.exists) {
      directRow = {
        movementId: expected.movementId,
        data: directSnap.data() as Record<string, unknown>,
      };
    }

    const mergedLedgerRows = mergeLedgerRows({ ledgerRows, directRow });
    const balanceContext: ModifierSaleAggregatedReversalBalanceContext = {
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      lineId: slot.target.sentSegmentLineId,
      productId: slot.mod.inventoryProductId!,
      modifierGroupId: slot.mod.groupId,
      modifierOptionId: slot.mod.optionId,
      selectionOccurrence: slot.selectionOccurrence,
      reversalOfMovementId: slot.originalMovementId,
    };

    const totalRevertido = computeValidatedGlobalReversedSaleUnits({
      ledgerRows: mergedLedgerRows,
      balanceContext,
      consumedSaleUnits: slot.consumedSaleUnits,
    });

    const currentRow = mergedLedgerRows.find((row) => row.movementId === expected.movementId);
    if (currentRow) {
      assertValidStoredModifierSaleAggregatedReversalDocument(currentRow.data, expected);
      movementIds.push(expected.movementId);
      continue;
    }

    if (totalRevertido + unitsRequested > slot.consumedSaleUnits) {
      throwLedgerConflict();
    }

    pending.push({
      movementId: expected.movementId,
      inventoryProductId: slot.mod.inventoryProductId!,
      convertedDelta: 0,
      payload: {
        restaurantId: params.restaurantId,
        productId: slot.mod.inventoryProductId!,
        productName:
          slot.mod.inventoryProductName ??
          String(slot.originalData.productName ?? slot.mod.inventoryProductId),
        source: "modifier_sale_reversal",
        type: "modifier_sale_reversal",
        orderId: params.orderId,
        lineId: slot.target.sentSegmentLineId,
        saleProductId: slot.saleProductId,
        saleProductName: slot.saleProductName,
        modifierGroupId: slot.mod.groupId,
        modifierOptionId: slot.mod.optionId,
        modifierOptionName: slot.mod.optionName ?? slot.mod.optionId,
        quantityDelta: expected.quantityDelta,
        unit: slot.inventoryUnit,
        idempotencyKey: expected.movementId,
        reversalOfMovementId: slot.originalMovementId,
        createdAt: params.nowMs,
        createdBy: params.actorUid,
        applied: true,
        appliedAt: params.nowMs,
        sentSegmentLineId: slot.target.sentSegmentLineId,
        selectionOccurrence: slot.selectionOccurrence,
        movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
        operationIdempotencyKey,
        movementFingerprint: expected.fingerprint,
        inventoryQuantityPerUnit: slot.inventoryQuantityPerUnit,
        reversedSaleUnits: unitsRequested,
      },
    });
    unitsReversed += unitsRequested;
  }

  if (pending.length === 0) {
    return { warnings: [], movementIds: [...new Set(movementIds)], unitsReversed: 0 };
  }

  const uniqueProductIds = [...new Set(pending.map((row) => row.inventoryProductId))];
  const productRefs = uniqueProductIds.map((productId) =>
    params.db.collection("restaurants").doc(params.restaurantId).collection("products").doc(productId),
  );
  const productSnaps = productRefs.length > 0 ? await params.tx.getAll(...productRefs) : [];
  const productDataById = new Map<string, Record<string, unknown>>();
  productSnaps.forEach((snap, index) => {
    if (snap.exists) {
      productDataById.set(uniqueProductIds[index]!, snap.data() as Record<string, unknown>);
    }
  });

  const validated: PendingReversalWrite[] = [];
  const pendingSorted = [...pending].sort((a, b) => a.movementId.localeCompare(b.movementId));
  for (const row of pendingSorted) {
    const productData = productDataById.get(row.inventoryProductId);
    if (!productData || !assertSameRestaurantDoc(productData, params.restaurantId)) {
      throwModifierReversalBlocked("PRODUCT_NOT_FOUND");
    }
    if (productData.active === false) {
      throwModifierReversalBlocked("PRODUCT_INACTIVE");
    }
    const inv = readInventoryBlock(productData);
    if (inv.enabled !== true) {
      throwModifierReversalBlocked("INVENTORY_DISABLED");
    }
    if (readValidInventoryCurrentStock(productData) === null) {
      throwModifierReversalBlocked("INVALID_CURRENT_STOCK");
    }
    const productUnit = readCanonicalProductInventoryUnit(productData);
    if (!productUnit) {
      throwModifierReversalBlocked("UNKNOWN_PRODUCT_UNIT");
    }
    const converted = convertInventoryQuantity({
      quantity: row.payload.quantityDelta,
      fromUnit: String(row.payload.unit),
      toUnit: productUnit,
    });
    if (converted == null || !Number.isFinite(converted) || converted <= 0) {
      throwModifierReversalBlocked("INCOMPATIBLE_UNIT");
    }
    row.convertedDelta = roundInventoryQuantity(converted);
    validated.push(row);
  }

  const runningStock = new Map<string, number>();
  for (const row of validated) {
    if (runningStock.has(row.inventoryProductId)) continue;
    const stock = readValidInventoryCurrentStock(productDataById.get(row.inventoryProductId));
    if (stock === null) {
      throwModifierReversalBlocked("INVALID_CURRENT_STOCK");
    }
    runningStock.set(row.inventoryProductId, stock);
  }

  for (const row of pendingSorted) {
    const before = runningStock.get(row.inventoryProductId);
    if (before == null) {
      throwModifierReversalBlocked("INVALID_CURRENT_STOCK");
    }
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

  return {
    warnings: [],
    movementIds: [...new Set(movementIds)],
    unitsReversed,
  };
}
