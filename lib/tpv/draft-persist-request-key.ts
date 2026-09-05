import { buildStableIdempotencyKey } from "@/lib/firestore/tpv-mutations-via-api";

export function nextDraftPersistRevision(current: number | undefined): number {
  return Number.isSafeInteger(current) && (current ?? 0) >= 0
    ? (current ?? 0) + 1
    : 1;
}

export function buildDraftPersistRequestKey(params: {
  tableId: string;
  orderId?: string | null;
  sessionId: string;
  revision: number;
}): string {
  const tableId = params.tableId.trim();
  const orderId = params.orderId?.trim() || "new-order";
  const sessionId = params.sessionId.trim();
  const revision = Number.isSafeInteger(params.revision)
    ? Math.max(0, params.revision)
    : 0;

  return buildStableIdempotencyKey(
    "persist-draft",
    tableId,
    orderId,
    sessionId,
    String(revision),
  );
}
