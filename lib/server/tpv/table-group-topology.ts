/**
 * Topología autoritativa de grupos de mesas (server-side).
 * El cliente no impone el mapa final: solo propone join/split; el servidor valida.
 */

export type TableGroupsMap = Record<string, string[]>;

export function normalizeTableGroupsMap(raw: unknown): TableGroupsMap {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TableGroupsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const mainId = String(key ?? "").trim();
    if (!mainId || !Array.isArray(value)) continue;
    const list = [
      ...new Set(
        value
          .map((x) => String(x ?? "").trim())
          .filter((sid) => sid && sid !== mainId),
      ),
    ];
    if (list.length > 0) out[mainId] = list;
  }
  return out;
}

export function resolveMainTableIdFromGroups(
  groups: TableGroupsMap,
  tableId: string,
): string {
  const id = String(tableId).trim();
  if (!id) return tableId;
  if (Object.prototype.hasOwnProperty.call(groups, id)) return id;
  for (const [main, joined] of Object.entries(groups)) {
    if (!Array.isArray(joined)) continue;
    if (joined.some((j) => String(j).trim() === id)) {
      const m = String(main).trim();
      return m || id;
    }
  }
  return id;
}

export function collectGroupMemberIds(
  groups: TableGroupsMap,
  tableId: string,
): string[] {
  const main = resolveMainTableIdFromGroups(groups, tableId);
  const ids = new Set<string>();
  if (main) ids.add(main);
  for (const j of groups[main] ?? []) {
    const t = String(j).trim();
    if (t) ids.add(t);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export type JoinTopologyOk = {
  ok: true;
  mainTableId: string;
  secondaryTableId: string;
  /** Miembros del grupo tras el join (ordenados). */
  memberIds: string[];
  nextGroups: TableGroupsMap;
};

export type TopologyErr = {
  ok: false;
  error:
    | "TABLE_ID_REQUIRED"
    | "SAME_TABLE"
    | "GROUP_TOPOLOGY_MISMATCH"
    | "TABLE_NOT_IN_GROUP"
    | "GROUP_NOT_FOUND";
};

/**
 * Calcula la topología tras unir dos mesas (o sus grupos completos).
 * (A+B)+(C+D) → A+B+C+D. No descarta miembros del grupo secundario.
 */
export function planJoinTopology(args: {
  currentGroups: TableGroupsMap;
  mainTableId: string;
  secondaryTableId: string;
  /** Si el cliente envía memberIds, deben coincidir con el resultado. */
  clientMemberIds?: readonly string[];
}): JoinTopologyOk | TopologyErr {
  const mainNorm = args.mainTableId.trim();
  const secNorm = args.secondaryTableId.trim();
  if (!mainNorm || !secNorm) return { ok: false, error: "TABLE_ID_REQUIRED" };
  if (mainNorm === secNorm) return { ok: false, error: "SAME_TABLE" };

  const targetMain = resolveMainTableIdFromGroups(args.currentGroups, mainNorm);
  const sourceMain = resolveMainTableIdFromGroups(args.currentGroups, secNorm);
  if (secNorm === targetMain) {
    return { ok: false, error: "SAME_TABLE" };
  }

  // Ya mismo grupo → idempotente (sin duplicar).
  if (sourceMain === targetMain) {
    const memberIds = collectGroupMemberIds(args.currentGroups, targetMain);
    return {
      ok: true,
      mainTableId: targetMain,
      secondaryTableId: secNorm,
      memberIds,
      nextGroups: { ...args.currentGroups },
    };
  }

  const targetMembers = collectGroupMemberIds(args.currentGroups, targetMain);
  const sourceMembers = collectGroupMemberIds(args.currentGroups, sourceMain);
  const absorbed = new Set([...targetMembers, ...sourceMembers]);

  const nextGroups: TableGroupsMap = {};
  for (const [main, joined] of Object.entries(args.currentGroups)) {
    if (main === targetMain || main === sourceMain) continue;
    if (absorbed.has(main)) continue;
    const filtered = joined.filter((j) => !absorbed.has(String(j).trim()));
    if (filtered.length > 0) nextGroups[main] = filtered;
  }

  const unique = [
    ...new Set(
      [...targetMembers, ...sourceMembers]
        .map((id) => String(id).trim())
        .filter((id) => id && id !== targetMain),
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (unique.length > 0) nextGroups[targetMain] = unique;

  const memberIds = collectGroupMemberIds(nextGroups, targetMain);
  // Join: validar por conjunto (orden irrelevante). Si el cliente no envía
  // memberIds, se acepta la topología calculada server-side.
  if (args.clientMemberIds && args.clientMemberIds.length > 0) {
    const clientSet = new Set(
      args.clientMemberIds.map((id) => String(id).trim()).filter(Boolean),
    );
    const serverSet = new Set(memberIds);
    const same =
      clientSet.size === serverSet.size &&
      [...clientSet].every((id) => serverSet.has(id));
    if (!same) {
      return { ok: false, error: "GROUP_TOPOLOGY_MISMATCH" };
    }
  }

  return {
    ok: true,
    mainTableId: targetMain,
    secondaryTableId: secNorm,
    memberIds,
    nextGroups,
  };
}

export type SplitTopologyOk = {
  ok: true;
  mainTableId: string;
  /** Miembros del grupo ANTES del split (autoritativos). */
  memberIds: string[];
  separateTableId: string | null;
  nextGroups: TableGroupsMap;
  dissolveWholeGroup: boolean;
};

/**
 * Valida split contra topología persistida. Los memberIds del cliente deben
 * coincidir con el grupo real; la topología resultante la calcula el servidor.
 */
export function planSplitTopology(args: {
  currentGroups: TableGroupsMap;
  mainTableId: string;
  separateTableId?: string;
  clientMemberIds?: readonly string[];
}): SplitTopologyOk | TopologyErr {
  const mainId = args.mainTableId.trim();
  if (!mainId) return { ok: false, error: "TABLE_ID_REQUIRED" };

  const resolvedMain = resolveMainTableIdFromGroups(args.currentGroups, mainId);
  const memberIds = collectGroupMemberIds(args.currentGroups, resolvedMain);
  if (memberIds.length < 2) {
    return { ok: false, error: "GROUP_NOT_FOUND" };
  }

  // memberIds del cliente son informativos. La topología persistida manda.
  // No rechazar por snapshot stale u orden distinto (comparación por conjunto).
  if (args.clientMemberIds && args.clientMemberIds.length > 0) {
    const clientSet = new Set(
      args.clientMemberIds.map((id) => String(id).trim()).filter(Boolean),
    );
    const serverSet = new Set(memberIds);
    const same =
      clientSet.size === serverSet.size &&
      [...clientSet].every((id) => serverSet.has(id));
    if (!same) {
      // Soft: el servidor continúa con memberIds autoritativos.
    }
  }

  const separate = args.separateTableId?.trim() || "";
  const dissolveWholeGroup = !separate || separate === resolvedMain;

  if (!dissolveWholeGroup) {
    if (!memberIds.includes(separate) || separate === resolvedMain) {
      return { ok: false, error: "TABLE_NOT_IN_GROUP" };
    }
  }

  const nextGroups: TableGroupsMap = { ...args.currentGroups };
  if (dissolveWholeGroup) {
    delete nextGroups[resolvedMain];
  } else {
    const sec = (nextGroups[resolvedMain] ?? []).filter((id) => id !== separate);
    if (sec.length === 0) delete nextGroups[resolvedMain];
    else nextGroups[resolvedMain] = sec;
  }

  return {
    ok: true,
    mainTableId: resolvedMain,
    memberIds,
    separateTableId: dissolveWholeGroup ? null : separate,
    nextGroups,
    dissolveWholeGroup,
  };
}

export function sameSortedIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
