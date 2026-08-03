import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import type { PaymentInvoiceIntent, SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import type { TableOperatorAssignment } from "@/lib/tpv/table-operator-assignment";
import {
  buildTransitionLineQuantityApiRequestBody,
  TransitionLineQuantityRequestBodyError,
  type TransitionLineQuantityViaApiParams,
} from "@/lib/firestore/transition-line-quantity-request-body";

export type { TransitionLineQuantityViaApiParams };

export function buildStableIdempotencyKey(scope: string, ...parts: string[]): string {
  return `${scope}:${parts.map((part) => String(part).trim()).filter(Boolean).join(":")}`;
}

type ApiFail = { ok: false; error: string; details?: string | null };
type ApiOk<T> = { ok: true } & T;

type TpvMutationApiFetch = typeof authenticatedApiFetch;

function readInventoryWarningsFromApiPayload(
  payload: Record<string, unknown>,
): ModifierStockConsumptionWarning[] {
  const raw = payload.inventoryWarnings;
  return Array.isArray(raw) ? (raw as ModifierStockConsumptionWarning[]) : [];
}

async function parseApiResponse<T extends Record<string, unknown>>(
  response: Response,
): Promise<ApiOk<T> | ApiFail> {
  const payload = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string; details?: string | null } & T)
    | null;
  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? "TPV_MUTATION_FAILED",
      details: payload?.details ?? null,
    };
  }
  return payload as ApiOk<T>;
}

export async function createOpenOrderViaApi(
  params: {
    tableId: string;
    tableLabel?: string;
    lines: SaleLineIntent[];
    markSent?: boolean;
    idempotencyKey?: string;
    operatorAssignment?: Pick<
      TableOperatorAssignment,
      "assignedOperatorId" | "assignedOperatorName"
    > | null;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  { ok: true; orderId: string; total: number; inventoryWarnings: ModifierStockConsumptionWarning[] } | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/orders/create-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: params.tableId,
      tableLabel: params.tableLabel,
      lines: params.lines,
      markSent: params.markSent === true,
      operatorAssignment: params.operatorAssignment ?? undefined,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "create-open",
          params.tableId,
          ...params.lines.map((line) => `${line.lineId}:${line.productId}:${line.quantity}`),
        ),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; total: number }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
  };
}

export async function assignTableOperatorViaApi(params: {
  tableId: string;
  orderId?: string;
  assignedOperatorId: string;
  assignedOperatorName: string;
}): Promise<
  { ok: true; assigned: boolean; tableId: string; orderId?: string } | ApiFail
> {
  const response = await authenticatedApiFetch("/api/tpv/orders/assign-table-operator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: params.tableId,
      orderId: params.orderId,
      assignedOperatorId: params.assignedOperatorId,
      assignedOperatorName: params.assignedOperatorName,
    }),
  });
  const parsed = await parseApiResponse<{
    assigned: boolean;
    tableId: string;
    orderId?: string;
  }>(response);
  if (!parsed.ok || typeof parsed.assigned !== "boolean") {
    return parsed.ok ? { ok: false, error: "ASSIGN_OPERATOR_FAILED" } : parsed;
  }
  return {
    ok: true,
    assigned: parsed.assigned,
    tableId: String(parsed.tableId),
    ...(parsed.orderId ? { orderId: String(parsed.orderId) } : {}),
  };
}

export async function upsertSaleLinesViaApi(
  params: {
    orderId: string;
    lines: SaleLineIntent[];
    markSent?: boolean;
    idempotencyKey?: string;
    expectedUpdatedAtMs?: number;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  { ok: true; orderId: string; total: number; inventoryWarnings: ModifierStockConsumptionWarning[] } | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/orders/upsert-sale-lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: params.orderId,
      lines: params.lines,
      markSent: params.markSent === true,
      expectedUpdatedAtMs: params.expectedUpdatedAtMs,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "upsert",
          params.orderId,
          ...params.lines.map((line) => `${line.lineId}:${line.productId}:${line.quantity}`),
          params.markSent ? "sent" : "pending",
        ),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; total: number }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
  };
}

export async function cancelLinesViaApi(params: {
  orderId: string;
  lineIds: string[];
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; total: number; cancelledLineIds: string[] } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/cancel-lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: params.orderId,
      lineIds: params.lineIds,
      expectedUpdatedAtMs: params.expectedUpdatedAtMs,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey("cancel", params.orderId, ...params.lineIds),
    }),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    total: number;
    cancelledLineIds: string[];
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    cancelledLineIds: Array.isArray(parsed.cancelledLineIds) ? parsed.cancelledLineIds : params.lineIds,
  };
}

export async function transitionLineStatusViaApi(
  params: {
    orderId: string;
    lineId: string;
    expectedStatus: string;
    nextStatus: string;
    idempotencyKey?: string;
    expectedUpdatedAtMs?: number;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      orderId: string;
      lineId: string;
      status: string;
      inventoryWarnings: ModifierStockConsumptionWarning[];
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/orders/transition-line-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "transition-status",
          params.orderId,
          params.lineId,
          params.expectedStatus,
          params.nextStatus,
        ),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; lineId: string; status: string }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "TRANSITION_FAILED" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    lineId: String(parsed.lineId),
    status: String(parsed.status),
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
  };
}

export async function transitionLineQuantityViaApi(
  params: TransitionLineQuantityViaApiParams,
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      orderId: string;
      lineId: string;
      advancedLineId: string;
      status: string;
      inventoryWarnings: ModifierStockConsumptionWarning[];
    }
  | ApiFail
> {
  let body: Record<string, unknown>;
  try {
    ({ body } = buildTransitionLineQuantityApiRequestBody(params));
  } catch (error) {
    if (error instanceof TransitionLineQuantityRequestBodyError) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/orders/transition-line-quantity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    lineId: string;
    advancedLineId: string;
    status: string;
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "TRANSITION_FAILED" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    lineId: String(parsed.lineId),
    advancedLineId: String(parsed.advancedLineId),
    status: String(parsed.status),
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
  };
}

export async function chargeOrderViaApi(params: {
  orderId: string;
  tableId?: string;
  tableName?: string;
  paymentMethod: "cash" | "card" | "voucher";
  type: "table_amount" | "split_equal" | "split_by_items";
  amount: number;
  itemIds?: string[];
  part?: number;
  totalParts?: number;
  orderSessionId?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
  tip?: number;
  received?: number;
  cashReceived?: number;
  change?: number;
  voucherAmount?: number;
  voucherNumber?: string;
  ticketNumber?: string;
  invoiceNumber?: string;
  invoice?: PaymentInvoiceIntent;
  waiterId?: string;
  waiterEmail?: string;
}): Promise<{ ok: true; paymentId: string; amount: number; remainingAfterPayment: number } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/payments/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "charge",
          params.orderId,
          params.type,
          String(params.amount),
          params.paymentMethod,
          ...(params.itemIds ?? []),
          params.part != null ? String(params.part) : "",
          params.totalParts != null ? String(params.totalParts) : "",
        ),
    }),
  });
  const parsed = await parseApiResponse<{
    paymentId: string;
    amount: number;
    remainingAfterPayment: number;
  }>(response);
  if (!parsed.ok || !parsed.paymentId) return parsed.ok ? { ok: false, error: "CHARGE_FAILED" } : parsed;
  return {
    ok: true,
    paymentId: parsed.paymentId,
    amount: Number(parsed.amount) || 0,
    remainingAfterPayment: Number(parsed.remainingAfterPayment) || 0,
  };
}

export async function mergeTableGroupOrdersViaApi(params: {
  mainTableId: string;
  memberTableIds: string[];
  idempotencyKey?: string;
}): Promise<{ ok: true; merged: boolean; destOrderId?: string } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/merge-table-group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mainTableId: params.mainTableId,
      memberTableIds: params.memberTableIds,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey("merge-group", params.mainTableId, ...params.memberTableIds),
    }),
  });
  const parsed = await parseApiResponse<{ merged: boolean; destOrderId?: string }>(response);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    merged: parsed.merged === true,
    destOrderId: typeof parsed.destOrderId === "string" ? parsed.destOrderId : undefined,
  };
}

export async function splitTableGroupOrdersViaApi(params: {
  mainTableId: string;
  removedTableIds: string[];
  remainingTableIds?: string[];
  newMainTableId?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<
  | {
      ok: true;
      restored: boolean;
      result: "partial-split" | "full-split" | "aborted";
      restoredOrderIds: string[];
    }
  | ApiFail
> {
  const response = await authenticatedApiFetch("/api/tpv/orders/split-table-group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "split-group",
          params.mainTableId,
          ...params.removedTableIds,
          ...(params.remainingTableIds ?? []),
        ),
    }),
  });
  const parsed = await parseApiResponse<{
    restored: boolean;
    result: "partial-split" | "full-split" | "aborted";
    restoredOrderIds: string[];
  }>(response);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    restored: parsed.restored === true,
    result: parsed.result ?? "aborted",
    restoredOrderIds: Array.isArray(parsed.restoredOrderIds) ? parsed.restoredOrderIds : [],
  };
}

export async function closeOrderViaApi(params: {
  orderId: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; status: string } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/close-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("close-order", params.orderId),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; status: string }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "CLOSE_FAILED" } : parsed;
  return { ok: true, orderId: parsed.orderId, status: String(parsed.status) };
}

export async function reopenOrderViaApi(params: {
  orderId: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; status: string } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/reopen-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("reopen-order", params.orderId),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; status: string }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "REOPEN_FAILED" } : parsed;
  return { ok: true, orderId: parsed.orderId, status: String(parsed.status) };
}

export async function patchOrderMetadataViaApi(params: {
  orderId: string;
  note?: string;
  paymentRequestedAt?: number | null;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/patch-order-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "patch-metadata",
          params.orderId,
          params.note ?? "",
          params.paymentRequestedAt == null ? "null" : String(params.paymentRequestedAt),
        ),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "PATCH_FAILED" } : parsed;
  return { ok: true, orderId: parsed.orderId };
}

export async function removeLineUnitViaApi(params: {
  orderId: string;
  lineId: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; lineId: string; total: number } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/remove-line-unit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey("remove-unit", params.orderId, params.lineId),
    }),
  });
  const parsed = await parseApiResponse<{ orderId: string; lineId: string; total: number }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "REMOVE_UNIT_FAILED" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    lineId: String(parsed.lineId),
    total: Number(parsed.total) || 0,
  };
}

export async function compLineViaApi(params: {
  orderId: string;
  lineId: string;
  comped: boolean;
  reason?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; lineId: string; total: number; isComped: boolean } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/comp-line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey(
          "comp-line",
          params.orderId,
          params.lineId,
          params.comped ? "1" : "0",
        ),
    }),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    lineId: string;
    total: number;
    isComped: boolean;
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "COMP_FAILED" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    lineId: String(parsed.lineId),
    total: Number(parsed.total) || 0,
    isComped: parsed.isComped === true,
  };
}

export async function autoCloseTableViaApi(params: {
  tableId: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; closedOrderIds: string[] } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/auto-close-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: params.tableId,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("auto-close-table", params.tableId),
    }),
  });
  const parsed = await parseApiResponse<{ closedOrderIds: string[] }>(response);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    closedOrderIds: Array.isArray(parsed.closedOrderIds) ? parsed.closedOrderIds : [],
  };
}

export async function finalizeTableAfterPaymentViaApi(params: {
  tableId: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; tableId: string; tableStatus: string } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/orders/finalize-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: params.tableId,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("finalize-table", params.tableId),
    }),
  });
  const parsed = await parseApiResponse<{ tableId: string; tableStatus: string }>(response);
  if (!parsed.ok || !parsed.tableId) return parsed.ok ? { ok: false, error: "FINALIZE_FAILED" } : parsed;
  return {
    ok: true,
    tableId: parsed.tableId,
    tableStatus: String(parsed.tableStatus),
  };
}

export async function voidPaymentViaApi(params: {
  paymentId: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; paymentId: string; refundAmount: number } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/payments/void", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentId: params.paymentId,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("void", params.paymentId),
    }),
  });
  const parsed = await parseApiResponse<{ paymentId: string; refundAmount: number }>(response);
  if (!parsed.ok || !parsed.paymentId) return parsed.ok ? { ok: false, error: "VOID_FAILED" } : parsed;
  return {
    ok: true,
    paymentId: parsed.paymentId,
    refundAmount: Number(parsed.refundAmount) || 0,
  };
}

export async function refundPaymentViaApi(params: {
  paymentId: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; paymentId: string; refundAmount: number } | ApiFail> {
  const response = await authenticatedApiFetch("/api/tpv/payments/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentId: params.paymentId,
      idempotencyKey:
        params.idempotencyKey ?? buildStableIdempotencyKey("refund", params.paymentId),
    }),
  });
  const parsed = await parseApiResponse<{ paymentId: string; refundAmount: number }>(response);
  if (!parsed.ok || !parsed.paymentId) return parsed.ok ? { ok: false, error: "REFUND_FAILED" } : parsed;
  return {
    ok: true,
    paymentId: parsed.paymentId,
    refundAmount: Number(parsed.refundAmount) || 0,
  };
}

export type ReleaseSideEffectName = "stock" | "print" | "activity";

function normalizeReleaseSideEffectName(
  value: unknown,
  fallback: ReleaseSideEffectName,
): ReleaseSideEffectName {
  if (value === "stock" || value === "print" || value === "activity") return value;
  return fallback;
}

export async function claimReleaseEffectViaApi(
  params: {
    releaseEventId: string;
    effect: ReleaseSideEffectName;
    leaseOwner: string;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      releaseEventId: string;
      effect: ReleaseSideEffectName;
      acquired: boolean;
      claimed: boolean;
      alreadyCompleted: boolean;
      leaseHeld: boolean;
      alreadyProcessed: boolean;
      leaseOwner: string | null;
      leaseUntil: number | null;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/release-effects/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseEventId: params.releaseEventId,
      effect: params.effect,
      leaseOwner: params.leaseOwner,
    }),
  });
  const parsed = await parseApiResponse<{
    releaseEventId: string;
    effect: ReleaseSideEffectName;
    acquired?: boolean;
    claimed?: boolean;
    alreadyCompleted?: boolean;
    leaseHeld?: boolean;
    alreadyProcessed?: boolean;
    leaseOwner?: string | null;
    leaseUntil?: number | null;
  }>(response);
  if (!parsed.ok) return parsed;
  const acquired = parsed.acquired === true || parsed.claimed === true;
  return {
    ok: true,
    releaseEventId: String(parsed.releaseEventId ?? params.releaseEventId),
    effect: normalizeReleaseSideEffectName(parsed.effect, params.effect),
    acquired,
    claimed: acquired,
    alreadyCompleted: parsed.alreadyCompleted === true,
    leaseHeld: parsed.leaseHeld === true,
    alreadyProcessed:
      parsed.alreadyProcessed === true || parsed.alreadyCompleted === true,
    leaseOwner:
      typeof parsed.leaseOwner === "string" && parsed.leaseOwner.trim()
        ? parsed.leaseOwner.trim()
        : null,
    leaseUntil:
      typeof parsed.leaseUntil === "number" && Number.isFinite(parsed.leaseUntil)
        ? parsed.leaseUntil
        : null,
  };
}

export async function completeReleaseEffectViaApi(
  params: {
    releaseEventId: string;
    effect: ReleaseSideEffectName;
    leaseOwner: string;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      releaseEventId: string;
      effect: ReleaseSideEffectName;
      completed: boolean;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/release-effects/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseEventId: params.releaseEventId,
      effect: params.effect,
      leaseOwner: params.leaseOwner,
    }),
  });
  const parsed = await parseApiResponse<{
    releaseEventId: string;
    effect: ReleaseSideEffectName;
    completed?: boolean;
  }>(response);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    releaseEventId: String(parsed.releaseEventId ?? params.releaseEventId),
    effect: normalizeReleaseSideEffectName(parsed.effect, params.effect),
    completed: parsed.completed === true,
  };
}
