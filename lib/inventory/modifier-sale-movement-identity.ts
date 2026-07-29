import { createHash } from "crypto";
import { isModifierInventoryUnit } from "@/lib/modifiers/modifier-types";
import { roundInventoryQuantity } from "@/lib/inventory/unit-conversions";

function canonicalSerialize(value: unknown): string {
  if (value === undefined) return '{"$hostly":"undefined"}';
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export type ModifierSaleV2MovementIdentity = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
  selectionOccurrence: number;
};

export type ModifierSaleMovementFingerprintInput = {
  sentQuantity: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
};

/** Same key used by initial consumption when assigning global selectionOccurrence. */
export function modifierSaleSelectionOccurrenceKey(params: {
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
}): string {
  return `${params.modifierGroupId.trim()}::${params.modifierOptionId.trim()}::${params.inventoryProductId.trim()}`;
}

export type LineStockMovementOriginalLookupClassification =
  | "validate_as_original"
  | "skip"
  | "conflict_contradictory_identity";

/**
 * Classifies one stockMovements row returned by the line-scoped lookup query
 * (orderId + lineId, no type filter) before strict original validation.
 */
export function classifyLineStockMovementForOriginalLookup(
  movementId: string,
  data: Record<string, unknown>,
): LineStockMovementOriginalLookupClassification {
  const type = readTrimmedString(data.type);
  const source = readTrimmedString(data.source);

  if (type === "modifier_sale_reversal" || source === "modifier_sale_reversal") {
    return "skip";
  }

  if (type === "modifier_sale" && source === "modifier_sale") {
    return "validate_as_original";
  }

  if (type === "modifier_sale" || source === "modifier_sale") {
    return "conflict_contradictory_identity";
  }

  if (movementId.startsWith("modifier_sale_v2_")) {
    return "validate_as_original";
  }

  return "skip";
}

/**
 * Ensures a modifier_sale original pool matches the target slot count on the line.
 * Partial evidence (fewer originals than slots) aborts; excess originals abort.
 */
export function assertModifierSaleOriginalPoolCoherent(params: {
  expectedSlotCount: number;
  poolRows: readonly { selectionOccurrence: number }[];
}): void {
  const { expectedSlotCount, poolRows } = params;
  if (poolRows.length === 0) return;
  if (poolRows.length !== expectedSlotCount) {
    throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
  }

  const occurrences = poolRows
    .map((row) => row.selectionOccurrence)
    .sort((a, b) => a - b);
  for (let index = 1; index < occurrences.length; index += 1) {
    if (occurrences[index] === occurrences[index - 1]) {
      throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
    }
  }

  const min = occurrences[0]!;
  const max = occurrences[occurrences.length - 1]!;
  if (max - min + 1 !== occurrences.length) {
    throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
  }
}

export function buildModifierSaleV2MovementId(
  identity: ModifierSaleV2MovementIdentity,
): string {
  const digest = createHash("sha256")
    .update(
      canonicalSerialize({
        type: "modifier_sale",
        restaurantId: identity.restaurantId.trim(),
        orderId: identity.orderId.trim(),
        sentSegmentLineId: identity.sentSegmentLineId.trim(),
        modifierGroupId: identity.modifierGroupId.trim(),
        modifierOptionId: identity.modifierOptionId.trim(),
        inventoryProductId: identity.inventoryProductId.trim(),
        selectionOccurrence: identity.selectionOccurrence,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `modifier_sale_v2_${digest}`;
}

export function buildModifierSaleMovementFingerprint(
  input: ModifierSaleMovementFingerprintInput,
): string {
  return canonicalSerialize({
    sentQuantity: input.sentQuantity,
    inventoryQuantityPerUnit: input.inventoryQuantityPerUnit,
    inventoryUnit: input.inventoryUnit.trim(),
    quantityDelta: input.quantityDelta,
  });
}

export function readStoredModifierSaleSelectionOccurrence(
  data: Record<string, unknown> | undefined,
): number | null {
  if (!data) return null;
  const raw = data.selectionOccurrence;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

export function readStoredModifierSaleMovementFingerprint(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;
  if (typeof data.movementFingerprint === "string" && data.movementFingerprint.trim()) {
    return data.movementFingerprint.trim();
  }
  const sentQuantity = data.sentQuantity;
  const inventoryQuantityPerUnit = data.inventoryQuantityPerUnit;
  const inventoryUnit = data.inventoryUnit;
  const quantityDelta = data.quantityDelta;
  if (
    typeof sentQuantity !== "number" ||
    typeof inventoryQuantityPerUnit !== "number" ||
    typeof inventoryUnit !== "string" ||
    typeof quantityDelta !== "number"
  ) {
    return null;
  }
  return buildModifierSaleMovementFingerprint({
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
}

/** Aggregated reversal ledger schema (one document per logical mutation). */
export const MODIFIER_SALE_REVERSAL_SCHEMA_V3 = 3 as const;

export type ModifierSaleAggregatedReversalV3Identity = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  reversalOfMovementId: string;
  operationIdempotencyKey: string;
  schemaVersion: typeof MODIFIER_SALE_REVERSAL_SCHEMA_V3;
};

export type ModifierSaleAggregatedReversalFingerprintInput = {
  schemaVersion: typeof MODIFIER_SALE_REVERSAL_SCHEMA_V3;
  reversedSaleUnits: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  quantityDelta: number;
};

/** Deterministic per-operation aggregated reversal id. */
export function buildModifierSaleAggregatedReversalV3MovementId(
  identity: ModifierSaleAggregatedReversalV3Identity,
): string {
  const digest = createHash("sha256")
    .update(
      canonicalSerialize({
        type: "modifier_sale_reversal",
        schemaVersion: identity.schemaVersion,
        restaurantId: identity.restaurantId.trim(),
        orderId: identity.orderId.trim(),
        sentSegmentLineId: identity.sentSegmentLineId.trim(),
        reversalOfMovementId: identity.reversalOfMovementId.trim(),
        operationIdempotencyKey: identity.operationIdempotencyKey.trim(),
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `modifier_sale_reversal_v3_${digest}`;
}

export function buildModifierSaleAggregatedReversalFingerprint(
  input: ModifierSaleAggregatedReversalFingerprintInput,
): string {
  return canonicalSerialize({
    schemaVersion: input.schemaVersion,
    reversedSaleUnits: input.reversedSaleUnits,
    inventoryQuantityPerUnit: input.inventoryQuantityPerUnit,
    inventoryUnit: input.inventoryUnit.trim(),
    quantityDelta: input.quantityDelta,
  });
}

export function readStoredModifierSaleAggregatedReversalFingerprint(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;
  if (typeof data.movementFingerprint === "string" && data.movementFingerprint.trim()) {
    return data.movementFingerprint.trim();
  }
  const schemaVersion = data.movementSchemaVersion;
  const reversedSaleUnits = data.reversedSaleUnits;
  const inventoryQuantityPerUnit = data.inventoryQuantityPerUnit;
  const inventoryUnit = data.inventoryUnit;
  const quantityDelta = data.quantityDelta;
  if (
    schemaVersion !== MODIFIER_SALE_REVERSAL_SCHEMA_V3 ||
    typeof reversedSaleUnits !== "number" ||
    typeof inventoryQuantityPerUnit !== "number" ||
    typeof inventoryUnit !== "string" ||
    typeof quantityDelta !== "number"
  ) {
    return null;
  }
  return buildModifierSaleAggregatedReversalFingerprint({
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    reversedSaleUnits,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
}

/** Reused domain error: deterministic reversal id exists with incoherent ledger payload. */
export const MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR = "STOCK_MOVEMENT_ID_CONFLICT";

export type ExpectedModifierSaleAggregatedReversalDocument = {
  movementId: string;
  restaurantId: string;
  orderId: string;
  lineId: string;
  productId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  reversalOfMovementId: string;
  selectionOccurrence: number;
  operationIdempotencyKey: string;
  reversedSaleUnits: number;
  quantityDelta: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  fingerprint: string;
};

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFiniteLedgerNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readStrictPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function readStrictNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function readStrictPositiveFiniteNumber(value: unknown): number | null {
  const valueNumber = readFiniteLedgerNumber(value);
  if (valueNumber === null || valueNumber <= 0) return null;
  return valueNumber;
}

function ledgerConflict(): never {
  throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
}

export type ModifierSaleAggregatedReversalBalanceContext = {
  restaurantId: string;
  orderId: string;
  lineId: string;
  productId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  selectionOccurrence: number;
  reversalOfMovementId: string;
};

/**
 * Single gate for every v3 reversal document that contributes to ledger balance.
 * Reconstructs deterministic id from persisted fields; throws on any incoherence.
 */
export function assertValidModifierSaleAggregatedReversalV3BalanceDocument(
  movementId: string,
  data: Record<string, unknown> | undefined,
  context: ModifierSaleAggregatedReversalBalanceContext,
): number {
  if (!data) ledgerConflict();

  if (data.applied !== true) ledgerConflict();
  if (data.type !== "modifier_sale_reversal") ledgerConflict();
  if (data.source !== "modifier_sale_reversal") ledgerConflict();
  if (data.movementSchemaVersion !== MODIFIER_SALE_REVERSAL_SCHEMA_V3) ledgerConflict();

  const restaurantId = readTrimmedString(data.restaurantId);
  if (!restaurantId || restaurantId !== context.restaurantId.trim()) ledgerConflict();
  if (readTrimmedString(data.orderId) !== context.orderId.trim()) ledgerConflict();

  const lineId = readStoredReversalLineId(data);
  if (!lineId || lineId !== context.lineId.trim()) ledgerConflict();

  const sentSegmentLineId = readTrimmedString(data.sentSegmentLineId);
  if (sentSegmentLineId && sentSegmentLineId !== context.lineId.trim()) ledgerConflict();

  if (readTrimmedString(data.productId) !== context.productId.trim()) ledgerConflict();
  if (readTrimmedString(data.modifierGroupId) !== context.modifierGroupId.trim()) {
    ledgerConflict();
  }
  if (readTrimmedString(data.modifierOptionId) !== context.modifierOptionId.trim()) {
    ledgerConflict();
  }
  if (readTrimmedString(data.reversalOfMovementId) !== context.reversalOfMovementId.trim()) {
    ledgerConflict();
  }

  const operationIdempotencyKey = readTrimmedString(data.operationIdempotencyKey);
  if (!operationIdempotencyKey) ledgerConflict();

  const selectionOccurrence = readStrictNonNegativeInteger(data.selectionOccurrence);
  if (selectionOccurrence === null || selectionOccurrence !== context.selectionOccurrence) {
    ledgerConflict();
  }

  const reversedSaleUnits = readStrictPositiveInteger(data.reversedSaleUnits);
  if (reversedSaleUnits === null) ledgerConflict();

  const inventoryQuantityPerUnit = readStrictPositiveFiniteNumber(data.inventoryQuantityPerUnit);
  if (inventoryQuantityPerUnit === null) ledgerConflict();

  const inventoryUnit = readTrimmedString(data.unit);
  if (!inventoryUnit || !isModifierInventoryUnit(inventoryUnit)) ledgerConflict();

  const quantityDelta = readFiniteLedgerNumber(data.quantityDelta);
  if (quantityDelta === null) ledgerConflict();

  const expectedQuantityDelta = roundInventoryQuantity(
    reversedSaleUnits * inventoryQuantityPerUnit,
  );
  if (quantityDelta !== expectedQuantityDelta) ledgerConflict();

  if (readTrimmedString(data.idempotencyKey) !== movementId) ledgerConflict();

  const storedFingerprint = readStoredModifierSaleAggregatedReversalFingerprint(data);
  const expectedFingerprint = buildModifierSaleAggregatedReversalFingerprint({
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    reversedSaleUnits,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
  if (!storedFingerprint || storedFingerprint !== expectedFingerprint) ledgerConflict();

  const deterministicId = buildModifierSaleAggregatedReversalV3MovementId({
    restaurantId,
    orderId: context.orderId,
    sentSegmentLineId: lineId,
    reversalOfMovementId: context.reversalOfMovementId,
    operationIdempotencyKey,
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
  });
  if (deterministicId !== movementId) ledgerConflict();

  return reversedSaleUnits;
}

export type ModifierSaleV2OriginalProbeContext = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
  probeSelectionOccurrence: number;
};

export type ValidatedModifierSaleV2OriginalDocument = {
  selectionOccurrence: number;
  sentQuantity: number;
  inventoryQuantityPerUnit: number;
  inventoryUnit: string;
  modifierGroupId: string;
  modifierOptionId: string;
  inventoryProductId: string;
  originalData: Record<string, unknown>;
};

export type ModifierSaleV2OriginalLineQueryContext = {
  restaurantId: string;
  orderId: string;
  sentSegmentLineId: string;
};

function validateStoredModifierSaleV2OriginalCore(
  movementId: string,
  data: Record<string, unknown>,
  context: ModifierSaleV2OriginalLineQueryContext,
): ValidatedModifierSaleV2OriginalDocument {
  if (data.applied !== true) ledgerConflict();
  if (data.type !== "modifier_sale") ledgerConflict();
  if (data.source !== "modifier_sale") ledgerConflict();

  const restaurantId = readTrimmedString(data.restaurantId);
  if (!restaurantId || restaurantId !== context.restaurantId.trim()) ledgerConflict();
  if (readTrimmedString(data.orderId) !== context.orderId.trim()) ledgerConflict();

  const lineId = readStoredReversalLineId(data);
  if (!lineId || lineId !== context.sentSegmentLineId.trim()) ledgerConflict();

  const sentSegmentLineId = readTrimmedString(data.sentSegmentLineId);
  if (sentSegmentLineId && sentSegmentLineId !== context.sentSegmentLineId.trim()) {
    ledgerConflict();
  }

  const modifierGroupId = readTrimmedString(data.modifierGroupId);
  const modifierOptionId = readTrimmedString(data.modifierOptionId);
  const inventoryProductId = readTrimmedString(data.productId);
  if (!modifierGroupId || !modifierOptionId || !inventoryProductId) ledgerConflict();

  const selectionOccurrence = readStrictNonNegativeInteger(data.selectionOccurrence);
  if (selectionOccurrence === null) ledgerConflict();

  const sentQuantity = readStrictPositiveInteger(data.sentQuantity);
  if (sentQuantity === null) ledgerConflict();

  const inventoryQuantityPerUnit = readStrictPositiveFiniteNumber(data.inventoryQuantityPerUnit);
  if (inventoryQuantityPerUnit === null) ledgerConflict();

  const inventoryUnit = readTrimmedString(data.unit);
  if (!inventoryUnit || !isModifierInventoryUnit(inventoryUnit)) ledgerConflict();

  const quantityDelta = readFiniteLedgerNumber(data.quantityDelta);
  if (quantityDelta === null) ledgerConflict();

  const expectedQuantityDelta = -roundInventoryQuantity(
    sentQuantity * inventoryQuantityPerUnit,
  );
  if (quantityDelta !== expectedQuantityDelta) ledgerConflict();

  if (readTrimmedString(data.idempotencyKey) !== movementId) ledgerConflict();

  const storedFingerprint = readStoredModifierSaleMovementFingerprint(data);
  const expectedFingerprint = buildModifierSaleMovementFingerprint({
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    quantityDelta,
  });
  if (!storedFingerprint || storedFingerprint !== expectedFingerprint) ledgerConflict();

  const deterministicId = buildModifierSaleV2MovementId({
    restaurantId,
    orderId: context.orderId,
    sentSegmentLineId: context.sentSegmentLineId,
    modifierGroupId,
    modifierOptionId,
    inventoryProductId,
    selectionOccurrence,
  });
  if (deterministicId !== movementId) ledgerConflict();

  return {
    selectionOccurrence,
    sentQuantity,
    inventoryQuantityPerUnit,
    inventoryUnit,
    modifierGroupId,
    modifierOptionId,
    inventoryProductId,
    originalData: data,
  };
}

/**
 * Strict validation for modifier_sale v2 rows returned by a bounded line query.
 * selectionOccurrence is read from the persisted document, never probed.
 */
export function assertValidStoredModifierSaleV2OriginalFromLedgerRow(
  movementId: string,
  data: Record<string, unknown> | undefined,
  context: ModifierSaleV2OriginalLineQueryContext,
): ValidatedModifierSaleV2OriginalDocument {
  if (!data) ledgerConflict();
  return validateStoredModifierSaleV2OriginalCore(movementId, data, context);
}

/**
 * @deprecated Probe-based discovery removed from planner; retained for unit tests of strict gates.
 */
export function assertValidStoredModifierSaleV2OriginalAtProbe(
  movementId: string,
  data: Record<string, unknown> | undefined,
  context: ModifierSaleV2OriginalProbeContext,
): ValidatedModifierSaleV2OriginalDocument {
  if (!data) ledgerConflict();
  const validated = validateStoredModifierSaleV2OriginalCore(movementId, data, {
    restaurantId: context.restaurantId,
    orderId: context.orderId,
    sentSegmentLineId: context.sentSegmentLineId,
  });
  if (validated.selectionOccurrence !== context.probeSelectionOccurrence) ledgerConflict();
  if (validated.modifierGroupId !== context.modifierGroupId.trim()) ledgerConflict();
  if (validated.modifierOptionId !== context.modifierOptionId.trim()) ledgerConflict();
  if (validated.inventoryProductId !== context.inventoryProductId.trim()) ledgerConflict();
  return validated;
}

function readStoredReversalLineId(data: Record<string, unknown>): string {
  const sentSegmentLineId = readTrimmedString(data.sentSegmentLineId);
  if (sentSegmentLineId) return sentSegmentLineId;
  return readTrimmedString(data.lineId);
}

/**
 * Single gate for treating an existing aggregated reversal as already applied.
 * Throws MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR when incoherent.
 */
export function assertValidStoredModifierSaleAggregatedReversalDocument(
  data: Record<string, unknown> | undefined,
  expected: ExpectedModifierSaleAggregatedReversalDocument,
): void {
  const conflict = (): never => {
    throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
  };

  if (!data) {
    throw new Error(MODIFIER_REVERSAL_LEDGER_CONFLICT_ERROR);
  }

  const doc = data;

  if (doc.applied !== true) conflict();
  if (doc.type !== "modifier_sale_reversal") conflict();
  if (doc.source !== "modifier_sale_reversal") conflict();
  if (doc.movementSchemaVersion !== MODIFIER_SALE_REVERSAL_SCHEMA_V3) conflict();

  const restaurantId = readTrimmedString(doc.restaurantId);
  if (!restaurantId || restaurantId !== expected.restaurantId.trim()) conflict();
  if (readTrimmedString(doc.orderId) !== expected.orderId.trim()) conflict();

  const lineId = readStoredReversalLineId(doc);
  if (!lineId || lineId !== expected.lineId.trim()) conflict();

  const sentSegmentLineId = readTrimmedString(doc.sentSegmentLineId);
  if (sentSegmentLineId && sentSegmentLineId !== expected.lineId.trim()) conflict();

  if (readTrimmedString(doc.productId) !== expected.productId.trim()) conflict();
  if (readTrimmedString(doc.modifierGroupId) !== expected.modifierGroupId.trim()) conflict();
  if (readTrimmedString(doc.modifierOptionId) !== expected.modifierOptionId.trim()) conflict();
  if (readTrimmedString(doc.reversalOfMovementId) !== expected.reversalOfMovementId.trim()) {
    conflict();
  }
  if (readTrimmedString(doc.operationIdempotencyKey) !== expected.operationIdempotencyKey.trim()) {
    conflict();
  }

  const quantityDelta = readFiniteLedgerNumber(doc.quantityDelta);
  if (quantityDelta === null || quantityDelta !== expected.quantityDelta) conflict();

  const reversedSaleUnits = readStrictPositiveInteger(doc.reversedSaleUnits);
  if (reversedSaleUnits === null || reversedSaleUnits !== expected.reversedSaleUnits) {
    conflict();
  }

  const expectedQuantityDeltaFromUnits = roundInventoryQuantity(
    expected.reversedSaleUnits * expected.inventoryQuantityPerUnit,
  );
  if (quantityDelta !== expectedQuantityDeltaFromUnits) conflict();

  const selectionOccurrence = readStoredModifierSaleSelectionOccurrence(doc);
  if (selectionOccurrence !== expected.selectionOccurrence) conflict();

  if (readTrimmedString(doc.unit) !== expected.inventoryUnit.trim()) conflict();

  const inventoryQuantityPerUnit = readFiniteLedgerNumber(doc.inventoryQuantityPerUnit);
  if (
    inventoryQuantityPerUnit === null ||
    inventoryQuantityPerUnit !== expected.inventoryQuantityPerUnit
  ) {
    conflict();
  }

  if (readTrimmedString(doc.idempotencyKey) !== expected.movementId) conflict();

  const storedFingerprint = readStoredModifierSaleAggregatedReversalFingerprint(doc);
  if (!storedFingerprint || storedFingerprint !== expected.fingerprint) conflict();

  const deterministicId = buildModifierSaleAggregatedReversalV3MovementId({
    restaurantId: expected.restaurantId,
    orderId: expected.orderId,
    sentSegmentLineId: expected.lineId,
    reversalOfMovementId: expected.reversalOfMovementId,
    operationIdempotencyKey: expected.operationIdempotencyKey,
    schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
  });
  if (deterministicId !== expected.movementId) conflict();
}
