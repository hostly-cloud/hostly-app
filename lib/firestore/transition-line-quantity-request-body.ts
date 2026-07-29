export const MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH = 128;

export const TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_TOO_LONG =
  "TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_TOO_LONG";

export class TransitionLineQuantityRequestBodyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type TransitionLineQuantityViaApiParams = {
  orderId: string;
  lineId: string;
  units: number;
  expectedStatus: string;
  nextStatus: string;
  operationId?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

function assertIdempotencyKeyLength(key: string): string {
  if (key.length > MAX_TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_LENGTH) {
    throw new TransitionLineQuantityRequestBodyError(
      TRANSITION_LINE_QUANTITY_IDEMPOTENCY_KEY_TOO_LONG,
    );
  }
  return key;
}

function resolveOperationId(operationIdParam: string | undefined): string {
  const trimmed = operationIdParam?.trim();
  return trimmed || globalThis.crypto.randomUUID();
}

function buildGeneratedIdempotencyKey(operationId: string): string {
  return assertIdempotencyKeyLength(`transition-qty:${operationId}`);
}

function resolveIdempotencyKey(
  idempotencyKeyParam: string | undefined,
  operationId: string,
): string {
  const explicitIdempotencyKey = idempotencyKeyParam?.trim();
  if (explicitIdempotencyKey) {
    return assertIdempotencyKeyLength(explicitIdempotencyKey);
  }
  return buildGeneratedIdempotencyKey(operationId);
}

export function buildTransitionLineQuantityApiRequestBody(
  params: TransitionLineQuantityViaApiParams,
): { body: Record<string, unknown>; operationId: string } {
  const {
    orderId,
    lineId,
    units,
    expectedStatus,
    nextStatus,
    operationId: operationIdParam,
    idempotencyKey: idempotencyKeyParam,
    expectedUpdatedAtMs,
  } = params;
  const operationId = resolveOperationId(operationIdParam);
  const body: Record<string, unknown> = {
    orderId,
    lineId,
    units,
    expectedStatus,
    nextStatus,
    idempotencyKey: resolveIdempotencyKey(idempotencyKeyParam, operationId),
  };
  if (expectedUpdatedAtMs !== undefined) {
    body.expectedUpdatedAtMs = expectedUpdatedAtMs;
  }
  return { body, operationId };
}
