/**
 * Partición determinista de líneas al separar un grupo de mesas.
 *
 * Regla líneas sin provenance (añadidas tras el merge):
 *   → mesa autoritativa del grupo (`mainTableId`).
 *
 * Regla legacy inseguro (Case F):
 *   → si hubo merge (existen source orders merged) y NINGUNA línea activa
 *     tiene `tableGroupSourceTableId`, abortar (no concentrar en una mesa).
 */

export type SplitPartitionOk = {
  ok: true;
  /** tableId → líneas asignadas (incluye cancelled con provenance). */
  byTableId: Record<string, Record<string, unknown>[]>;
};

export type SplitPartitionErr = {
  ok: false;
  error: "PROVENANCE_INSUFFICIENT";
};

export type SplitPartitionResult = SplitPartitionOk | SplitPartitionErr;

function readSourceTableId(line: Record<string, unknown>): string {
  return typeof line.tableGroupSourceTableId === "string"
    ? line.tableGroupSourceTableId.trim()
    : "";
}

function isCancelledLine(line: Record<string, unknown>): boolean {
  const st = String(line.status ?? "")
    .trim()
    .toLowerCase();
  return st === "cancelled" || st === "canceled" || st === "cancelado";
}

export function partitionMergedLinesForSplit(args: {
  lines: readonly Record<string, unknown>[];
  mainTableId: string;
  memberIds: readonly string[];
  /** Hay pedidos `status=merged` con `mergedIntoOrderId` = pedido consolidado. */
  hasMergedSourceOrders: boolean;
}): SplitPartitionResult {
  const mainId = args.mainTableId.trim();
  const memberSet = new Set(
    args.memberIds.map((id) => id.trim()).filter(Boolean),
  );
  if (mainId) memberSet.add(mainId);

  const lines = args.lines.filter((l) => l && typeof l === "object");
  const withProv = lines.filter((l) => Boolean(readSourceTableId(l)));
  const withoutProv = lines.filter((l) => !readSourceTableId(l));

  if (
    args.hasMergedSourceOrders &&
    lines.length > 0 &&
    withProv.length === 0 &&
    withoutProv.length > 0
  ) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  const byTableId: Record<string, Record<string, unknown>[]> = {};
  const push = (tableId: string, line: Record<string, unknown>) => {
    const tid = tableId.trim() || mainId;
    if (!byTableId[tid]) byTableId[tid] = [];
    byTableId[tid]!.push(line);
  };

  for (const line of lines) {
    const src = readSourceTableId(line);
    if (src && memberSet.has(src)) {
      push(src, line);
      continue;
    }
    if (src && !memberSet.has(src)) {
      // Provenance fuera del grupo: mesa autoritativa (no perder la línea).
      push(mainId, line);
      continue;
    }
    // Sin provenance → mesa/pedido autoritativo del grupo (post-merge adds).
    push(mainId, line);
  }

  // Evitar claves vacías.
  if (!mainId && Object.keys(byTableId).length === 0) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  return { ok: true, byTableId };
}

export function tableHasActiveSplitLines(
  lines: readonly Record<string, unknown>[],
): boolean {
  return lines.some((l) => !isCancelledLine(l));
}

export function readSourceOrderId(line: Record<string, unknown>): string {
  return typeof line.tableGroupSourceOrderId === "string"
    ? line.tableGroupSourceOrderId.trim()
    : "";
}

/**
 * Elige orderId destino para una mesa al split.
 * Preferencia: provenance unánime → source merged de esa mesa → dest si es main → null (crear).
 */
export function resolveSplitTargetOrderId(args: {
  tableId: string;
  mainTableId: string;
  destOrderId: string;
  lines: readonly Record<string, unknown>[];
  /** orderId → tableId original de pedidos merged. */
  mergedSourceByTableId: ReadonlyMap<string, string>;
}): string | null {
  const tid = args.tableId.trim();
  const provenanceOrders = [
    ...new Set(args.lines.map(readSourceOrderId).filter(Boolean)),
  ];
  if (provenanceOrders.length === 1) {
    return provenanceOrders[0]!;
  }
  const mergedForTable = args.mergedSourceByTableId.get(tid);
  if (mergedForTable) return mergedForTable;
  if (tid === args.mainTableId.trim()) return args.destOrderId;
  return null;
}
