/**
 * Partición autoritativa de líneas al separar un grupo de mesas (Case F).
 *
 * El helper es puro: no escribe Firestore ni confía en destinos del cliente.
 * Campos canónicos: tableGroupSourceTableId / tableGroupSourceOrderId.
 *
 * Case F (PROVENANCE_INSUFFICIENT):
 *   una línea debe repartirse y no puede demostrarse un único destino
 *   entre mesas/pedidos plausibles (legacy sin provenance, parcial ambigua,
 *   o provenance contradictoria).
 */

export type TableGroupSplitSourceOrder = {
  id: string;
  tableId: string;
};

export type TableGroupSplitPartitionOk = {
  ok: true;
  /** Mesa → líneas (orden de entrada preservado). */
  byTableId: Record<string, Record<string, unknown>[]>;
  /** Pedido merged a restaurar → líneas. */
  bySourceOrderId: Record<string, Record<string, unknown>[]>;
  /** Líneas que permanecen en el pedido consolidado (primary/effective main). */
  remainingOnPrimary: Record<string, unknown>[];
};

export type TableGroupSplitPartitionErr = {
  ok: false;
  error: "PROVENANCE_INSUFFICIENT";
};

export type TableGroupSplitPartitionResult =
  | TableGroupSplitPartitionOk
  | TableGroupSplitPartitionErr;

export function readSplitLineSourceTableId(line: Record<string, unknown>): string {
  return typeof line.tableGroupSourceTableId === "string"
    ? line.tableGroupSourceTableId.trim()
    : "";
}

export function readSplitLineSourceOrderId(line: Record<string, unknown>): string {
  return typeof line.tableGroupSourceOrderId === "string"
    ? line.tableGroupSourceOrderId.trim()
    : "";
}

function lineHasAnyProvenance(line: Record<string, unknown>): boolean {
  return Boolean(readSplitLineSourceTableId(line) || readSplitLineSourceOrderId(line));
}

function pushLine(
  map: Record<string, Record<string, unknown>[]>,
  key: string,
  line: Record<string, unknown>,
): void {
  const k = key.trim();
  if (!k) return;
  if (!map[k]) map[k] = [];
  map[k]!.push(line);
}

/**
 * Resuelve la mesa destino de una línea o aborta (Case F).
 * No inventa origen cuando hay más de una opción válida.
 */
function resolveLineDestinationTable(args: {
  line: Record<string, unknown>;
  mainTableId: string;
  memberSet: ReadonlySet<string>;
  removedSet: ReadonlySet<string>;
  sourceById: ReadonlyMap<string, TableGroupSplitSourceOrder>;
  sourcesByTable: ReadonlyMap<string, TableGroupSplitSourceOrder[]>;
  destOrderId: string;
  /** True si alguna línea del ticket tiene provenance (habilita Case D). */
  ticketHasProvenance: boolean;
}): string | "PROVENANCE_INSUFFICIENT" {
  const mainId = args.mainTableId;
  const orderId = readSplitLineSourceOrderId(args.line);
  const tableId = readSplitLineSourceTableId(args.line);

  if (orderId) {
    const byOrder = args.sourceById.get(orderId);
    if (byOrder) {
      const orderTable = byOrder.tableId;
      if (tableId && tableId !== orderTable && args.memberSet.has(tableId)) {
        // Contradicción order↔table dentro del grupo.
        return "PROVENANCE_INSUFFICIENT";
      }
      return orderTable;
    }
    if (orderId === args.destOrderId) {
      if (tableId && args.removedSet.has(tableId)) {
        // Pedido dest (primary) pero mesa de provenance es removida → conflicto.
        return "PROVENANCE_INSUFFICIENT";
      }
      if (tableId && args.memberSet.has(tableId)) return tableId;
      return mainId;
    }
    // orderId desconocido: solo aceptar si tableId lo ancla inequívocamente.
    if (tableId && args.memberSet.has(tableId)) {
      const sources = args.sourcesByTable.get(tableId) ?? [];
      if (sources.length > 1) return "PROVENANCE_INSUFFICIENT";
      return tableId;
    }
    if (tableId && !args.memberSet.has(tableId)) {
      // Mesa fuera del grupo: no perder la línea → mesa autoritativa.
      return mainId;
    }
    return "PROVENANCE_INSUFFICIENT";
  }

  if (tableId) {
    if (!args.memberSet.has(tableId)) {
      // Fuera del grupo: no perder la línea → mesa autoritativa.
      return mainId;
    }
    const sources = args.sourcesByTable.get(tableId) ?? [];
    if (args.removedSet.has(tableId) && sources.length > 1) {
      // Varios pedidos merged en la misma mesa sin orderId → ambiguo.
      return "PROVENANCE_INSUFFICIENT";
    }
    return tableId;
  }

  // Sin provenance.
  if (!args.ticketHasProvenance) {
    // Case F clásico: ticket legacy / merge sin stamps.
    return "PROVENANCE_INSUFFICIENT";
  }
  // Case D: post-merge add demostrable → permanece en mesa autoritativa.
  return mainId;
}

/**
 * Plan de partición determinista para split.
 * Entrada: datos server-side ya validados (topología + sources merged).
 */
export function planTableGroupSplitPartition(args: {
  restaurantId: string;
  primaryTableId: string;
  /** Mesa autoritativa del pedido consolidado (resolvedMain o effectiveMain). */
  mainTableId: string;
  memberTableIds: readonly string[];
  removedTableIds: readonly string[];
  remainingTableIds: readonly string[];
  destOrderId: string;
  lines: readonly Record<string, unknown>[];
  sourceOrders: readonly TableGroupSplitSourceOrder[];
}): TableGroupSplitPartitionResult {
  const restaurantId = args.restaurantId.trim();
  const mainId = args.mainTableId.trim();
  const destOrderId = args.destOrderId.trim();
  if (!restaurantId || !mainId || !destOrderId) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  const memberIds = [
    ...new Set(args.memberTableIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  const removedIds = [
    ...new Set(args.removedTableIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  const remainingIds = [
    ...new Set(args.remainingTableIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  const memberSet = new Set(memberIds);
  memberSet.add(mainId);
  const removedSet = new Set(removedIds);
  const remainingSet = new Set(remainingIds);
  if (remainingSet.size === 0) remainingSet.add(mainId);

  const lines = args.lines.filter((l) => l && typeof l === "object");
  const sourceOrders = args.sourceOrders
    .map((s) => ({
      id: String(s.id ?? "").trim(),
      tableId: String(s.tableId ?? "").trim(),
    }))
    .filter((s) => s.id && s.tableId);

  const hasMergedSourceOrders = sourceOrders.length > 0;
  if (!hasMergedSourceOrders) {
    // Sin sources merged no hay líneas que repartir a restaurar.
    return {
      ok: true,
      byTableId: mainId ? { [mainId]: [...lines] } : {},
      bySourceOrderId: {},
      remainingOnPrimary: [...lines],
    };
  }

  const ticketHasProvenance = lines.some(lineHasAnyProvenance);
  if (lines.length > 0 && !ticketHasProvenance) {
    // Case F: merge legacy sin provenance y varios destinos plausibles.
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  const sourceById = new Map<string, TableGroupSplitSourceOrder>();
  const sourcesByTable = new Map<string, TableGroupSplitSourceOrder[]>();
  for (const s of sourceOrders) {
    if (sourceById.has(s.id)) {
      // Mismo orderId duplicado → no demostrable.
      return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
    }
    sourceById.set(s.id, s);
    const list = sourcesByTable.get(s.tableId) ?? [];
    list.push(s);
    sourcesByTable.set(s.tableId, list);
  }

  const byTableId: Record<string, Record<string, unknown>[]> = {};
  for (const line of lines) {
    const dest = resolveLineDestinationTable({
      line,
      mainTableId: mainId,
      memberSet,
      removedSet,
      sourceById,
      sourcesByTable,
      destOrderId,
      ticketHasProvenance,
    });
    if (dest === "PROVENANCE_INSUFFICIENT") {
      return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
    }
    pushLine(byTableId, dest, line);
  }

  const bySourceOrderId: Record<string, Record<string, unknown>[]> = {};
  const claimed = new Set<Record<string, unknown>>();

  for (const source of sourceOrders) {
    const tableLines = byTableId[source.tableId] ?? [];
    const explicit: Record<string, unknown>[] = [];
    for (const item of tableLines) {
      if (claimed.has(item)) continue;
      const byOrder = readSplitLineSourceOrderId(item);
      const byTable = readSplitLineSourceTableId(item);
      if (byOrder) {
        if (byOrder === source.id) explicit.push(item);
        continue;
      }
      if (byTable && byTable === source.tableId) explicit.push(item);
    }
    // También aceptar líneas bucketizadas a esta mesa por orderId ya resuelto
    // cuando el bucket proviene de order match (sin table stamp).
    for (const item of tableLines) {
      if (claimed.has(item) || explicit.includes(item)) continue;
      const byOrder = readSplitLineSourceOrderId(item);
      if (byOrder === source.id) explicit.push(item);
    }

    if (explicit.length === 0) {
      // Hay pedido merged a restaurar pero ninguna línea demostrable → Case F
      // (no SOURCE_LINES silencioso: evita split incompleto).
      return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
    }
    for (const item of explicit) {
      if (claimed.has(item)) {
        return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
      }
      claimed.add(item);
    }
    bySourceOrderId[source.id] = explicit;
  }

  const remainingOnPrimary: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (claimed.has(line)) continue;
    remainingOnPrimary.push(line);
  }

  // Defensa: ninguna línea puede desaparecer.
  if (remainingOnPrimary.length + claimed.size !== lines.length) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  return {
    ok: true,
    byTableId,
    bySourceOrderId,
    remainingOnPrimary,
  };
}

/** Compat histórica / tests: partición solo por mesa (sin mapear source orders). */
export function partitionMergedLinesForSplit(args: {
  lines: readonly Record<string, unknown>[];
  mainTableId: string;
  memberIds: readonly string[];
  hasMergedSourceOrders: boolean;
}): { ok: true; byTableId: Record<string, Record<string, unknown>[]> } | TableGroupSplitPartitionErr {
  const mainId = args.mainTableId.trim();
  const memberIds = args.memberIds.map((id) => id.trim()).filter(Boolean);
  const lines = args.lines.filter((l) => l && typeof l === "object");

  if (
    args.hasMergedSourceOrders &&
    lines.length > 0 &&
    !lines.some(lineHasAnyProvenance)
  ) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }

  const memberSet = new Set(memberIds);
  if (mainId) memberSet.add(mainId);
  const byTableId: Record<string, Record<string, unknown>[]> = {};

  for (const line of lines) {
    const src = readSplitLineSourceTableId(line);
    if (src && memberSet.has(src)) {
      pushLine(byTableId, src, line);
      continue;
    }
    pushLine(byTableId, mainId, line);
  }

  if (!mainId && Object.keys(byTableId).length === 0) {
    return { ok: false, error: "PROVENANCE_INSUFFICIENT" };
  }
  return { ok: true, byTableId };
}
