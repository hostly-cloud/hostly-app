/**
 * Gate síncrono para una sola operación lógica de split por gesto.
 * Evita POST duplicados (click + capture, ghost click, reentrada) con UUIDs distintos.
 */

export type SplitActionOrigin =
  | "onClick"
  | "onPointerUp"
  | "capture"
  | "carta-callback"
  | "hook"
  | "unknown";

export type SplitActionAttempt = {
  mainTableId: string;
  separateTableId?: string;
  operationId: string;
  seq: number;
  origin: SplitActionOrigin;
};

export type SplitGateDecision =
  | { action: "run"; attempt: SplitActionAttempt }
  | {
      action: "ignore";
      reason: "in_flight" | "not_grouped" | "already_succeeded";
      seq: number;
      origin: SplitActionOrigin;
      operationId: string | null;
    };

export type TableGroupSplitActionGate = {
  begin: (input: {
    mainTableId: string;
    separateTableId?: string;
    isLocallyGrouped: boolean;
    origin?: SplitActionOrigin;
    /** Reutilizar ID de la acción lógica activa (reintentos). */
    preferOperationId?: string;
  }) => SplitGateDecision;
  succeed: (operationId: string) => void;
  fail: (operationId: string) => void;
  /** Libera in-flight sin marcar éxito (p. ej. auth). */
  release: (operationId: string) => void;
  getInFlight: () => boolean;
  getActiveOperationId: () => string | null;
  getCallSeq: () => number;
};

export function createTableGroupSplitActionGate(options?: {
  now?: () => number;
  createOperationId?: () => string;
}): TableGroupSplitActionGate {
  const now = options?.now ?? (() => Date.now());
  const createOperationId =
    options?.createOperationId ?? (() => globalThis.crypto.randomUUID());

  let inFlight = false;
  let callSeq = 0;
  let active: SplitActionAttempt | null = null;
  let lastSuccess: {
    mainTableId: string;
    operationId: string;
    at: number;
  } | null = null;

  return {
    begin(input) {
      const origin = input.origin ?? "unknown";
      callSeq += 1;
      const seq = callSeq;
      const mainTableId = String(input.mainTableId ?? "").trim();
      const separateTableId = input.separateTableId?.trim() || undefined;

      if (inFlight && active) {
        return {
          action: "ignore",
          reason: "in_flight",
          seq,
          origin,
          operationId: active.operationId,
        };
      }

      if (!input.isLocallyGrouped) {
        if (
          lastSuccess &&
          lastSuccess.mainTableId === mainTableId &&
          now() - lastSuccess.at < 60_000
        ) {
          return {
            action: "ignore",
            reason: "already_succeeded",
            seq,
            origin,
            operationId: lastSuccess.operationId,
          };
        }
        return {
          action: "ignore",
          reason: "not_grouped",
          seq,
          origin,
          operationId: lastSuccess?.operationId ?? null,
        };
      }

      const operationId =
        (input.preferOperationId && input.preferOperationId.trim()) ||
        createOperationId();
      const attempt: SplitActionAttempt = {
        mainTableId,
        separateTableId,
        operationId,
        seq,
        origin,
      };
      inFlight = true;
      active = attempt;
      return { action: "run", attempt };
    },

    succeed(operationId) {
      const id = String(operationId ?? "").trim();
      if (!id || !active || active.operationId !== id) return;
      lastSuccess = {
        mainTableId: active.mainTableId,
        operationId: id,
        at: now(),
      };
      inFlight = false;
      active = null;
    },

    fail(operationId) {
      const id = String(operationId ?? "").trim();
      if (!id || !active || active.operationId !== id) return;
      inFlight = false;
      // Conservar operationId en active=null; reintento explícito puede pasar preferOperationId.
      active = null;
    },

    release(operationId) {
      const id = String(operationId ?? "").trim();
      if (!id || !active || active.operationId !== id) return;
      inFlight = false;
      active = null;
    },

    getInFlight: () => inFlight,
    getActiveOperationId: () => active?.operationId ?? null,
    getCallSeq: () => callSeq,
  };
}
