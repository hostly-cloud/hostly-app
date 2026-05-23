/** Backoff exponencial para worker futuro (simulador también lo persiste). */
export function computePrintJobNextRetryAt(
  attempts: number,
  fromMs: number = Date.now(),
): number {
  const baseMs = 30_000;
  const maxMs = 30 * 60_000;
  const exponent = Math.max(0, attempts - 1);
  const delay = Math.min(maxMs, baseMs * 2 ** exponent);
  return fromMs + delay;
}
