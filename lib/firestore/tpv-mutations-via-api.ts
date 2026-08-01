import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import { traceEmptyDraft } from "@/lib/debug/tpv-empty-draft-trace";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
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

function readUpdatedAtMsFromApiPayload(
  payload: Record<string, unknown>,
): number | undefined {
  const raw = payload.updatedAtMs;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
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
  | {
      ok: true;
      orderId: string;
      total: number;
      inventoryWarnings: ModifierStockConsumptionWarning[];
      reusedExistingOrder?: boolean;
      items?: Record<string, unknown>[];
      updatedAtMs?: number;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  traceEmptyDraft("api.create-open.request", {
    tableId: params.tableId,
    lines: params.lines.map((l) => ({
      lineId: l.lineId,
      productId: l.productId,
      quantity: l.quantity,
    })),
    markSent: params.markSent === true,
  });
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
  const parsed = await parseApiResponse<{
    orderId: string;
    total: number;
    reusedExistingOrder?: boolean;
    items?: Record<string, unknown>[];
    updatedAtMs?: number;
  }>(response);
  if (!parsed.ok || !parsed.orderId) {
    traceEmptyDraft("api.create-open.fail", {
      tableId: params.tableId,
      error: parsed.ok ? "MISSING_ORDER_ID" : parsed.error,
    });
    return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  }
  traceEmptyDraft("api.create-open.ok", {
    tableId: params.tableId,
    orderId: parsed.orderId,
    reusedExistingOrder: parsed.reusedExistingOrder === true,
    itemsCount: Array.isArray(parsed.items) ? parsed.items.length : null,
  });
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
    reusedExistingOrder: parsed.reusedExistingOrder === true,
    items: Array.isArray(parsed.items) ? parsed.items : undefined,
    updatedAtMs: readUpdatedAtMsFromApiPayload(parsed),
  };
}

export async function closeTpvOrderViaApi(
  params: { orderId: string; idempotencyKey?: string },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<{ ok: true; orderId: string; status: string; lockReleased: boolean } | ApiFail> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  traceEmptyDraft("api.close.request", { orderId: params.orderId });
  const response = await apiFetch("/api/tpv/orders/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: params.orderId,
      idempotencyKey: params.idempotencyKey,
    }),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    status: string;
    lockReleased?: boolean;
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    status: String(parsed.status ?? "closed"),
    lockReleased: parsed.lockReleased === true,
  };
}

export async function reopenTpvOrderViaApi(
  params: { orderId: string },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      orderId: string;
      status: string;
      lockAcquired: boolean;
      updatedAtMs?: number;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const response = await apiFetch("/api/tpv/orders/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: params.orderId }),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    status: string;
    lockAcquired?: boolean;
    updatedAtMs?: number;
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    status: String(parsed.status ?? "open"),
    lockAcquired: parsed.lockAcquired === true,
    updatedAtMs: readUpdatedAtMsFromApiPayload(parsed),
  };
}

export async function resolveActiveOrderForTableViaApi(
  params: { tableId: string },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<{ ok: true; tableId: string; orderId: string | null } | ApiFail> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  traceEmptyDraft("api.resolve-active.request", { tableId: params.tableId });
  const response = await apiFetch("/api/tpv/orders/resolve-active-for-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId: params.tableId }),
  });
  const parsed = await parseApiResponse<{ tableId: string; orderId?: string | null }>(response);
  if (!parsed.ok) {
    traceEmptyDraft("api.resolve-active.fail", {
      tableId: params.tableId,
      error: parsed.error,
    });
    return parsed;
  }
  const orderId =
    typeof parsed.orderId === "string" && parsed.orderId.trim()
      ? parsed.orderId.trim()
      : null;
  traceEmptyDraft("api.resolve-active.ok", {
    tableId: String(parsed.tableId ?? params.tableId),
    orderId,
  });
  return {
    ok: true,
    tableId: String(parsed.tableId ?? params.tableId),
    orderId,
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
  | {
      ok: true;
      orderId: string;
      total: number;
      items: Record<string, unknown>[];
      inventoryWarnings: ModifierStockConsumptionWarning[];
      updatedAtMs?: number;
    }
  | ApiFail
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
  const parsed = await parseApiResponse<{
    orderId: string;
    total: number;
    items?: Record<string, unknown>[];
    updatedAtMs?: number;
  }>(response);
  if (!parsed.ok || !parsed.orderId) return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    inventoryWarnings: readInventoryWarningsFromApiPayload(parsed),
    updatedAtMs: readUpdatedAtMsFromApiPayload(parsed),
  };
}

export async function persistDraftItemsViaApi(
  params: {
    orderId: string;
    items: Record<string, unknown>[];
    /** Estable en reintentos de la misma mutación lógica. */
    operationId?: string;
    idempotencyKey?: string;
    expectedUpdatedAtMs?: number;
  },
  options?: { apiFetch?: TpvMutationApiFetch },
): Promise<
  | {
      ok: true;
      orderId: string;
      total: number;
      items: Record<string, unknown>[];
      pendingRemoved: number;
      nonPendingPreserved: number;
      operationId: string;
      updatedAtMs?: number;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  // Identidad por mutación lógica (no por fingerprint de items): evita IDEM_OK
  // stale en A→B→A. El caller reutiliza operationId solo en reintentos.
  const operationId =
    params.operationId?.trim() || globalThis.crypto.randomUUID();
  const response = await apiFetch("/api/tpv/orders/persist-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: params.orderId,
      items: params.items,
      expectedUpdatedAtMs: params.expectedUpdatedAtMs,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey("persist-draft", operationId),
    }),
  });
  const parsed = await parseApiResponse<{
    orderId: string;
    total: number;
    items?: Record<string, unknown>[];
    pendingRemoved?: number;
    nonPendingPreserved?: number;
    updatedAtMs?: number;
  }>(response);
  if (!parsed.ok || !parsed.orderId) {
    return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  }
  return {
    ok: true,
    orderId: parsed.orderId,
    total: Number(parsed.total) || 0,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    pendingRemoved: Number(parsed.pendingRemoved) || 0,
    nonPendingPreserved: Number(parsed.nonPendingPreserved) || 0,
    operationId,
    updatedAtMs: readUpdatedAtMsFromApiPayload(parsed),
  };
}

export async function cancelLinesViaApi(params: {
  orderId: string;
  lineIds: string[];
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
}): Promise<{ ok: true; orderId: string; total: number; cancelledLineIds: string[] } | ApiFail> {
  traceEmptyDraft("api.cancel-lines.request", {
    orderId: params.orderId,
    lineIds: params.lineIds,
  });
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
  if (!parsed.ok || !parsed.orderId) {
    traceEmptyDraft("api.cancel-lines.fail", {
      orderId: params.orderId,
      error: parsed.ok ? "MISSING_ORDER_ID" : parsed.error,
    });
    return parsed.ok ? { ok: false, error: "MISSING_ORDER_ID" } : parsed;
  }
  traceEmptyDraft("api.cancel-lines.ok", {
    orderId: parsed.orderId,
    cancelledLineIds: Array.isArray(parsed.cancelledLineIds)
      ? parsed.cancelledLineIds
      : params.lineIds,
  });
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
    /** Estable en reintentos de la misma mutación lógica. */
    operationId?: string;
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
      operationId: string;
    }
  | ApiFail
> {
  const apiFetch = options?.apiFetch ?? authenticatedApiFetch;
  const operationId =
    params.operationId?.trim() || globalThis.crypto.randomUUID();
  const response = await apiFetch("/api/tpv/orders/transition-line-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: params.orderId,
      lineId: params.lineId,
      expectedStatus: params.expectedStatus,
      nextStatus: params.nextStatus,
      expectedUpdatedAtMs: params.expectedUpdatedAtMs,
      idempotencyKey:
        params.idempotencyKey ??
        buildStableIdempotencyKey("transition-status", operationId),
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
    operationId,
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
