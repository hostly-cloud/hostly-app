export type RetryActionState = {
  retryLabel: string;
  retryCount: number;
  lastRetryAt: number | null;
};

export type RunWithRetryParams<T> = {
  action: () => Promise<T>;
  label: string;
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (result: T) => boolean;
  onStateChange?: (state: RetryActionState) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Wrapper ligero para reintentos manuales/automáticos puntuales.
 * Fase 4: disponible para handlers críticos; no sustituye cola offline.
 */
export async function runWithRetry<T>(
  params: RunWithRetryParams<T>,
): Promise<T> {
  const maxAttempts = Math.min(Math.max(params.maxAttempts ?? 2, 1), 4);
  const delayMs = Math.max(params.delayMs ?? 400, 0);
  const shouldRetry = params.shouldRetry ?? (() => false);

  let retryCount = 0;
  let lastRetryAt: number | null = null;

  const emit = () => {
    params.onStateChange?.({
      retryLabel: params.label,
      retryCount,
      lastRetryAt,
    });
  };

  emit();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await params.action();
    const failed = shouldRetry(result);
    if (!failed || attempt >= maxAttempts) {
      return result;
    }
    retryCount += 1;
    lastRetryAt = Date.now();
    emit();
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return params.action();
}

export function createRetryActionState(label: string): RetryActionState {
  return {
    retryLabel: label,
    retryCount: 0,
    lastRetryAt: null,
  };
}
