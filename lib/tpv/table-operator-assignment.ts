/** Asignación TPV del primer operador que abre la mesa (fase 1 «Mis mesas»). */
export type TableOperatorAssignment = {
  assignedOperatorId: string;
  assignedOperatorName: string;
  assignedAt?: number;
};

function readAssignedAtMs(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? raw : undefined;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "toMillis" in raw &&
    typeof (raw as { toMillis?: unknown }).toMillis === "function"
  ) {
    const ms = (raw as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) && ms > 0 ? ms : undefined;
  }
  return undefined;
}

/** Lee asignación desde documento Firestore (`tables` u `orders`). */
export function readTableOperatorAssignmentFromRecord(
  rec: Record<string, unknown>,
): TableOperatorAssignment | null {
  const assignedOperatorId =
    typeof rec.assignedOperatorId === "string"
      ? rec.assignedOperatorId.trim()
      : "";
  const assignedOperatorName =
    typeof rec.assignedOperatorName === "string"
      ? rec.assignedOperatorName.trim()
      : "";
  if (!assignedOperatorId || !assignedOperatorName) return null;
  const assignedAt = readAssignedAtMs(rec.assignedAt);
  return {
    assignedOperatorId,
    assignedOperatorName,
    ...(assignedAt != null ? { assignedAt } : {}),
  };
}

export function hasTableOperatorAssignment(
  rec: Record<string, unknown>,
): boolean {
  return readTableOperatorAssignmentFromRecord(rec) !== null;
}
