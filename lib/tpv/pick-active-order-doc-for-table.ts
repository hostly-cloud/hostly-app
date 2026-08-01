/**
 * Selección de pedido activo por identidad canónica tableId,
 * con fallback de lectura legacy mesaId (sin duplicar docs).
 */

export type OrderIdentityDoc = {
  id: string;
  data: () => { tableId?: unknown; mesaId?: unknown; [key: string]: unknown };
};

/**
 * Une docs de query canónica (tableId) + legacy (mesaId).
 * Si un doc tiene ambos, prevalece tableId. No duplica por id.
 */
export function pickActiveOrderDocForTable<T extends OrderIdentityDoc>(
  tableId: string,
  primaryDocs: readonly T[],
  legacyDocs: readonly T[],
): T | null {
  const tid = tableId.trim();
  if (!tid) return null;

  const byId = new Map<string, T>();
  for (const d of primaryDocs) byId.set(d.id, d);
  for (const d of legacyDocs) {
    const data = d.data();
    const docTableId = String(data.tableId ?? "").trim();
    if (docTableId && docTableId !== tid) continue;
    if (!byId.has(d.id)) byId.set(d.id, d);
  }

  const docs = [...byId.values()];
  if (docs.length === 0) return null;

  const withTableId = docs.find(
    (d) => String(d.data().tableId ?? "").trim() === tid,
  );
  if (withTableId) return withTableId;

  const legacyOnly = docs.find((d) => {
    const data = d.data();
    const docTableId = String(data.tableId ?? "").trim();
    const docMesaId = String(data.mesaId ?? "").trim();
    return !docTableId && docMesaId === tid;
  });
  return legacyOnly ?? docs[0] ?? null;
}
