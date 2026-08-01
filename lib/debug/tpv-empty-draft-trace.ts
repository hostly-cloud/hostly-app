/**
 * Trazas de draft vacío — solo desarrollo, sin globals ni payloads sensibles.
 */

export type EmptyDraftTraceLine = {
  id: string;
  qty: number;
  status: string;
};

type TracePayload = Record<string, unknown>;

let seq = 0;

function enabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function summarizeTraceLines(
  lines: ReadonlyArray<{
    id?: string;
    quantity?: number;
    status?: string;
    product?: { nombre?: string } | null;
  } | null | undefined>,
): EmptyDraftTraceLine[] {
  return (lines ?? []).filter(Boolean).map((l) => ({
    id: String(l?.id ?? ""),
    qty: Number(l?.quantity) || 0,
    status: String(l?.status ?? ""),
  }));
}

/** Log cronológico en desarrollo: `[HostlyEmptyDraftTrace]`. Sin window globals. */
export function traceEmptyDraft(event: string, payload: TracePayload = {}): void {
  if (!enabled()) return;
  if (typeof console === "undefined") return;
  seq += 1;
  const entry = {
    seq,
    t: new Date().toISOString(),
    event,
    // Solo claves no sensibles / conteos
    keys: Object.keys(payload),
  };
  // eslint-disable-next-line no-console
  console.log("[HostlyEmptyDraftTrace]", entry);
}
