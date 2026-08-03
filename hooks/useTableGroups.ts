"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { restoreMergedOrdersForTableGroup } from "@/lib/firestore/split-table-group-orders";
import { mergeTableGroupOrdersViaApi } from "@/lib/firestore/tpv-mutations-via-api";
import {
  logTableJoinMerge,
  logTableJoinMergeError,
  logTableJoinMergeWarn,
  printTableJoinFirestoreDebugReport,
  TABLE_GROUP_ORDERS_MERGED_EVENT,
  TABLE_GROUP_ORDERS_SPLIT_EVENT,
  type TableGroupOrdersMergedDetail,
  type TableGroupOrdersSplitDetail,
} from "@/lib/firestore/table-join-merge-diagnostic";
import {
  normalizeTableGroups,
  tableGroupsDocRef,
} from "@/lib/firestore/table-groups";

function resolveMainTableIdFromMap(
  rec: Record<string, string[]>,
  tableId: string,
): string {
  const id = String(tableId).trim();
  if (!id) return tableId;
  if (Object.prototype.hasOwnProperty.call(rec, id)) return id;
  for (const [main, joined] of Object.entries(rec)) {
    if (!Array.isArray(joined)) continue;
    if (joined.some((j) => String(j).trim() === id)) {
      const m = String(main).trim();
      return m || id;
    }
  }
  return id;
}

function pruneEmptyPrincipalEntries(
  rec: Record<string, string[]>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (Array.isArray(v) && v.length > 0) next[k] = v;
  }
  return next;
}

function removeSecondaryFromGraph(
  draft: Record<string, string[]>,
  secNorm: string,
): Record<string, string[]> {
  const next = { ...draft };
  if (Object.prototype.hasOwnProperty.call(next, secNorm)) {
    delete next[secNorm];
  }
  for (const key of Object.keys(next)) {
    const arr = next[key];
    if (!Array.isArray(arr)) continue;
    const filtered = arr.filter((j) => String(j).trim() !== secNorm);
    if (filtered.length === 0) delete next[key];
    else next[key] = filtered;
  }
  return pruneEmptyPrincipalEntries(next);
}

function dedupeJoinedSecondaryIds(mainId: string, ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const t = String(raw).trim();
    if (!t || t === mainId) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function isTableGroupedInMap(
  rec: Record<string, string[]>,
  tableId: string,
): boolean {
  const id = String(tableId).trim();
  if (!id) return false;
  const own = rec[id];
  if (Array.isArray(own) && own.length > 0) return true;
  for (const joined of Object.values(rec)) {
    if (!Array.isArray(joined)) continue;
    if (joined.some((j) => String(j).trim() === id)) return true;
  }
  return false;
}

/** Mesa listada bajo otra principal (no debe mostrarse como ficha en mapa). */
function isTableJoinedSecondary(
  rec: Record<string, string[]>,
  tableId: string,
): boolean {
  const id = String(tableId).trim();
  if (!id) return false;
  for (const joined of Object.values(rec)) {
    if (!Array.isArray(joined)) continue;
    if (joined.some((j) => String(j).trim() === id)) return true;
  }
  return false;
}

function collectGroupTableIds(
  rec: Record<string, string[]>,
  tableId: string,
): string[] {
  const main = resolveMainTableIdFromMap(rec, tableId);
  const joined = rec[main] ?? [];
  const ids = new Set<string>();
  if (main) ids.add(main);
  for (const j of joined) {
    const t = String(j).trim();
    if (t) ids.add(t);
  }
  return [...ids];
}

export type UseTableGroupsOptions = {
  /** `restaurants/{id}/config/tableGroups` — sin lectura/escritura si falta. */
  restaurantId: string | null;
};

export function useTableGroups({ restaurantId }: UseTableGroupsOptions) {
  const { user, role } = useAuth();
  const restaurantIdTrimmed = restaurantId?.trim() ?? null;
  const actorUserId = user?.uid?.trim() || undefined;
  const actorUserName =
    user?.displayName?.trim() ||
    user?.email?.trim() ||
    undefined;
  const actorRole = role ?? undefined;

  const [groupedTables, setGroupedTables] = useState<Record<string, string[]>>(
    {},
  );

  useEffect(() => {
    if (!restaurantIdTrimmed) {
      setGroupedTables({});
      return;
    }

    if (!isFirebaseConfigured) {
      return;
    }

    if (!isAuthReady()) {
      setGroupedTables({});
      return;
    }

    const ref = tableGroupsDocRef(restaurantIdTrimmed);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          setGroupedTables({});
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setGroupedTables(normalizeTableGroups(data.groups));
      },
      (error) => {
        console.error(error);
      },
    );

    return () => unsub();
  }, [restaurantIdTrimmed]);

  const getMainTableId = useCallback(
    (tableId: string): string => {
      return resolveMainTableIdFromMap(groupedTables, tableId);
    },
    [groupedTables],
  );

  const isGroupedTable = useCallback(
    (tableId: string): boolean => {
      return isTableGroupedInMap(groupedTables, tableId);
    },
    [groupedTables],
  );

  const isJoinedSecondaryTable = useCallback(
    (tableId: string): boolean => {
      return isTableJoinedSecondary(groupedTables, tableId);
    },
    [groupedTables],
  );

  const getGroupedBadgeText = useCallback(
    (tableId: string): string | null => {
      const id = String(tableId).trim();
      if (!id) return null;
      const asMain = groupedTables[id];
      if (Array.isArray(asMain) && asMain.length > 0) {
        return `+${asMain.length}`;
      }
      return null;
    },
    [groupedTables],
  );

  /** true si `tableId` es clave principal con al menos una mesa unida. */
  const isGroupedPrimaryTable = useCallback(
    (tableId: string): boolean => {
      const id = String(tableId).trim();
      if (!id) return false;
      const sec = groupedTables[id];
      return Array.isArray(sec) && sec.length > 0;
    },
    [groupedTables],
  );

  const runServerMerge = useCallback(
    async (
      previous: Record<string, string[]>,
      mainTableId: string,
      memberIds: string[],
      secondaryTableId?: string,
    ) => {
      if (!restaurantIdTrimmed || !isFirebaseConfigured || !isAuthReady()) return;
      const apiResult = await mergeTableGroupOrdersViaApi({
        mainTableId,
        memberTableIds: memberIds,
      });
      if (!apiResult.ok) {
        setGroupedTables(previous);
        throw new Error(apiResult.error);
      }
      if (typeof window !== "undefined" && apiResult.merged) {
        window.dispatchEvent(
          new CustomEvent(TABLE_GROUP_ORDERS_MERGED_EVENT, {
            detail: {
              restaurantId: restaurantIdTrimmed,
              mainTableId,
              memberIds,
              destOrderId: apiResult.destOrderId,
            } satisfies TableGroupOrdersMergedDetail,
          }),
        );
      }
      if (secondaryTableId) {
        logTableJoinMerge("join:merge-finished", {
          mainTableId,
          secondaryTableId,
          memberIds,
          merged: apiResult.merged,
          destOrderId: apiResult.destOrderId,
        });
      }
    },
    [restaurantIdTrimmed],
  );

  const runServerSplit = useCallback(
    async (
      previous: Record<string, string[]>,
      next: Record<string, string[]>,
      ctx: { mainTableId: string; memberIds: string[]; separatedTableId: string },
    ) => {
      if (!restaurantIdTrimmed || !isFirebaseConfigured || !isAuthReady()) return;
      const mainTableId = ctx.mainTableId.trim();
      const memberIds = ctx.memberIds.map((id) => String(id ?? "").trim()).filter(Boolean);
      const remainingTableIds = collectGroupTableIds(next, mainTableId);
      const remainingSet = new Set(remainingTableIds);
      const removedTableIds = memberIds.filter(
        (memberId) => !remainingSet.has(memberId),
      );
      const separatingPrimary = removedTableIds.includes(mainTableId);
      const newMainTableId = separatingPrimary
        ? remainingTableIds.find((id) => id !== mainTableId)
        : undefined;
      const restore = await restoreMergedOrdersForTableGroup(
        db,
        restaurantIdTrimmed,
        mainTableId,
        removedTableIds,
        { remainingTableIds, newMainTableId },
      );
      if (!restore.restored && restore.unresolvedAssignments.length > 0) {
        setGroupedTables(previous);
        logTableJoinMergeWarn("split:restore-skipped-reverting-local-group", {
          mainTableId,
          memberIds,
          removedTableIds,
          remainingTableIds,
          unresolvedAssignments: restore.unresolvedAssignments,
        });
        return;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(TABLE_GROUP_ORDERS_SPLIT_EVENT, {
            detail: {
              restaurantId: restaurantIdTrimmed,
              mainTableId,
              memberIds,
            } satisfies TableGroupOrdersSplitDetail,
          }),
        );
      }
    },
    [restaurantIdTrimmed],
  );

  const joinTables = useCallback(
    (mainTableId: string, secondaryTableId: string) => {
      const mainNorm = String(mainTableId).trim();
      const secNorm = String(secondaryTableId).trim();
      if (!mainNorm || !secNorm || mainNorm === secNorm) return;

      setGroupedTables((prev) => {
        const afterRemoval = removeSecondaryFromGraph(prev, secNorm);
        const targetMain = resolveMainTableIdFromMap(afterRemoval, mainNorm);

        let next: Record<string, string[]>;

        if (secNorm === targetMain) {
          next = afterRemoval;
          logTableJoinMergeWarn("join:no-merge-callback", {
            mainNorm,
            secNorm,
            targetMain,
            hint: "secNorm === targetMain: solo persist tableGroups, sin mergeOpenOrdersForTableGroup.",
          });
          printTableJoinFirestoreDebugReport({
            mergeExecuted: false,
            mergeMerged: false,
            brokenAtStep: "0-joinTables",
            brokenReason:
              "mergeOpenOrdersForTableGroup NO se invocó (secNorm === targetMain)",
            restaurantId: restaurantIdTrimmed ?? "",
            mainTableId: targetMain,
            secondaryTableId: secNorm,
            memberIds: collectGroupTableIds(next, targetMain),
            beforeByTable: {},
            destOrderId: null,
            destTableIdBefore: null,
            plannedFinalItems: [],
            mergedSourceOrderIds: [],
            afterByTable: {},
          });
          queueMicrotask(() => {
            void runServerMerge(prev, targetMain, collectGroupTableIds(next, targetMain), secNorm).catch(
              (e) => logTableJoinMergeError("join:merge-failed", e, { mainTableId: targetMain }),
            );
          });
        } else {
          const prevList = [...(afterRemoval[targetMain] ?? [])];
          const merged = [...prevList, secNorm];
          const unique = dedupeJoinedSecondaryIds(targetMain, merged);
          next = pruneEmptyPrincipalEntries({
            ...afterRemoval,
            [targetMain]: unique,
          });
          logTableJoinMerge("join:server-merge", {
            targetMain,
            secNorm,
            nextGroups: next,
            memberIdsPreview: collectGroupTableIds(next, targetMain),
          });
          queueMicrotask(() => {
            void runServerMerge(
              prev,
              targetMain,
              collectGroupTableIds(next, targetMain),
              secNorm,
            ).catch((e) => logTableJoinMergeError("join:merge-failed", e, { mainTableId: targetMain }));
          });
        }
        return next;
      });
    },
    [restaurantIdTrimmed, runServerMerge],
  );

  const separateTable = useCallback(
    (tableId: string) => {
      const id = String(tableId).trim();
      if (!id) return;

      setGroupedTables((prev) => {
        if (!isTableGroupedInMap(prev, id)) {
          return prev;
        }

        const mainTableId = resolveMainTableIdFromMap(prev, id);
        const memberIds = collectGroupTableIds(prev, mainTableId);
        let next: Record<string, string[]>;

        if (Object.prototype.hasOwnProperty.call(prev, id)) {
          const cleaned = { ...prev };
          delete cleaned[id];
          next = pruneEmptyPrincipalEntries(cleaned);
        } else {
          let updated: Record<string, string[]> | null = null;
          for (const key of Object.keys(prev)) {
            const arr = prev[key];
            if (!Array.isArray(arr)) continue;
            if (!arr.some((j) => String(j).trim() === id)) continue;
            const n = { ...prev };
            n[key] = dedupeJoinedSecondaryIds(
              key,
              arr.filter((j) => String(j).trim() !== id),
            );
            if (n[key].length === 0) delete n[key];
            updated = pruneEmptyPrincipalEntries(n);
            break;
          }
          if (updated == null) {
            return prev;
          }
          next = updated;
        }

        queueMicrotask(() => {
          void runServerSplit(prev, next, {
            mainTableId,
            memberIds,
            separatedTableId: id,
          }).catch((e) =>
            logTableJoinMergeError("split:restore-failed", e, { mainTableId, memberIds }),
          );
        });
        return next;
      });
    },
    [runServerSplit],
  );

  const getGroupTableIds = useCallback(
    (tableId: string): string[] => {
      return collectGroupTableIds(groupedTables, tableId);
    },
    [groupedTables],
  );

  const groupedTablesMapHandlers = useMemo(
    () => ({
      resolveMainTableId: getMainTableId,
      getGroupTableIds,
      isGroupedTable,
      isJoinedSecondaryTable,
      isGroupedPrimaryTable,
      getGroupedBadgeText,
      joinTables,
      separateTable,
    }),
    [
      getMainTableId,
      getGroupTableIds,
      isGroupedTable,
      isJoinedSecondaryTable,
      isGroupedPrimaryTable,
      getGroupedBadgeText,
      joinTables,
      separateTable,
    ],
  );

  return {
    groupedTables,
    getMainTableId,
    getGroupTableIds,
    isGroupedTable,
    isJoinedSecondaryTable,
    isGroupedPrimaryTable,
    getGroupedBadgeText,
    joinTables,
    separateTable,
    groupedTablesMapHandlers,
  };
}
