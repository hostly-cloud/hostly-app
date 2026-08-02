"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { mergeOpenOrdersForTableGroup } from "@/lib/firestore/merge-table-group-orders";
import { splitTableGroupOrdersViaApi } from "@/lib/firestore/split-table-group-orders";
import {
  logTableJoinMerge,
  logTableJoinMergeError,
  logTableJoinMergeWarn,
  TABLE_GROUP_ORDERS_MERGED_EVENT,
  TABLE_GROUP_ORDERS_SPLIT_EVENT,
  type TableGroupOrdersMergedDetail,
  type TableGroupOrdersSplitDetail,
} from "@/lib/firestore/table-join-merge-diagnostic";
import {
  normalizeTableGroups,
  tableGroupsDocRef,
} from "@/lib/firestore/table-groups";
import {
  createTableGroupSplitActionGate,
  type SplitActionOrigin,
} from "@/lib/tpv/table-group-split-action-gate";

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
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function previewJoinMemberIds(
  prev: Record<string, string[]>,
  mainNorm: string,
  secNorm: string,
): { targetMain: string; memberIds: string[] } | null {
  const afterRemoval = removeSecondaryFromGraph(prev, secNorm);
  const targetMain = resolveMainTableIdFromMap(afterRemoval, mainNorm);
  if (secNorm === targetMain) return null;
  const prevList = [...(afterRemoval[targetMain] ?? [])];
  const unique = dedupeJoinedSecondaryIds(targetMain, [...prevList, secNorm]);
  const next = pruneEmptyPrincipalEntries({
    ...afterRemoval,
    [targetMain]: unique,
  });
  return { targetMain, memberIds: collectGroupTableIds(next, targetMain) };
}

const SPLIT_ERROR_HINTS: Record<string, string> = {
  GROUP_NOT_FOUND: "No se encontró el grupo persistido de la mesa principal.",
  TABLE_NOT_IN_GROUP: "La mesa a separar no pertenece al grupo.",
  PROVENANCE_INSUFFICIENT:
    "Faltan datos de procedencia de líneas (grupo legacy).",
  MULTIPLE_ACTIVE_ORDERS_IN_GROUP:
    "Hay más de un pedido activo en el grupo; no se puede separar con seguridad.",
  FIRESTORE_INDEX_REQUIRED:
    "Falta un índice de Firestore para completar la operación.",
  TABLE_GROUP_OP_PENDING: "Hay otra unión/separación en curso.",
  IDEMPOTENCY_CONFLICT: "Operación repetida con datos distintos.",
};

function showTableGroupOpError(
  code: string,
  context: string,
  details?: string | null,
): void {
  const hint = SPLIT_ERROR_HINTS[code] ?? "";
  const detailLine =
    details && process.env.NODE_ENV !== "production"
      ? `\nDetalle: ${details}`
      : "";
  const msg = [
    `No se pudo ${context}.`,
    `Código: ${code}`,
    hint,
  ]
    .filter(Boolean)
    .join("\n") + detailLine;
  logTableJoinMergeError("ui:visible-error", code, { context, details });
  if (typeof window !== "undefined") {
    window.alert(msg);
  }
}

export type TableGroupPendingOp = {
  type: "joining" | "splitting";
  tableIds: string[];
  operationId: string;
  error?: string;
};

export type UseTableGroupsOptions = {
  /** `restaurants/{id}/config/tableGroups` — sin lectura/escritura si falta. */
  restaurantId: string | null;
};

export function useTableGroups({ restaurantId }: UseTableGroupsOptions) {
  const { user, role } = useAuth();
  const restaurantIdTrimmed = restaurantId?.trim() ?? null;
  void user;
  void role;

  const [groupedTables, setGroupedTables] = useState<Record<string, string[]>>(
    {},
  );
  const [pendingOp, setPendingOp] = useState<TableGroupPendingOp | null>(null);
  /** Autoridad del pending: NO resincronizar desde state en cada render. */
  const pendingOpRef = useRef<TableGroupPendingOp | null>(null);
  const groupedTablesRef = useRef(groupedTables);
  groupedTablesRef.current = groupedTables;
  /** Una sola operación lógica de split; sobrevive a dobles eventos UI. */
  const splitGateRef = useRef(createTableGroupSplitActionGate());

  const beginPending = useCallback((op: TableGroupPendingOp) => {
    pendingOpRef.current = op;
    setPendingOp(op);
  }, []);

  const endPending = useCallback((operationId: string, error?: string) => {
    if (pendingOpRef.current?.operationId === operationId) {
      pendingOpRef.current = null;
    }
    setPendingOp((prev) => {
      if (!prev || prev.operationId !== operationId) return prev;
      if (error) return { ...prev, error };
      return null;
    });
    if (error) {
      // Liberar tras pintar el error en state (un tick); el alert es síncrono.
      queueMicrotask(() => {
        if (pendingOpRef.current?.operationId === operationId) {
          pendingOpRef.current = null;
        }
        setPendingOp((prev) =>
          prev?.operationId === operationId ? null : prev,
        );
      });
    }
  }, []);

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
      (snap) => {
        // No crear/pisar el doc desde cliente: el join/split server-side es dueño.
        // Un setDoc({groups:{}}) aquí puede borrar un join concurrente.
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

  const isTableGroupOpPending = useCallback(
    (tableId?: string): boolean => {
      const op = pendingOpRef.current ?? pendingOp;
      if (!op) return false;
      if (!tableId) return true;
      const id = String(tableId).trim();
      return op.tableIds.some((t) => t === id);
    },
    [pendingOp],
  );

  const joinTables = useCallback(
    (mainTableId: string, secondaryTableId: string) => {
      const mainNorm = String(mainTableId).trim();
      const secNorm = String(secondaryTableId).trim();
      if (!mainNorm || !secNorm || mainNorm === secNorm) return;
      if (!restaurantIdTrimmed || !isFirebaseConfigured || !isAuthReady()) {
        logTableJoinMergeWarn("join:skipped-no-auth", {
          restaurantId: restaurantIdTrimmed,
        });
        return;
      }
      if (pendingOpRef.current) {
        logTableJoinMergeWarn("join:blocked-pending", {
          pending: pendingOpRef.current,
          mainNorm,
          secNorm,
        });
        showTableGroupOpError(
          "TABLE_GROUP_OP_PENDING",
          "unir mesas (hay otra operación en curso)",
        );
        return;
      }

      const preview = previewJoinMemberIds(
        groupedTablesRef.current,
        mainNorm,
        secNorm,
      );
      if (!preview) {
        logTableJoinMergeWarn("join:invalid-topology-preview", {
          mainNorm,
          secNorm,
        });
        showTableGroupOpError("INVALID_JOIN_TOPOLOGY", "unir mesas");
        return;
      }

      const operationId = globalThis.crypto.randomUUID();
      beginPending({
        type: "joining",
        tableIds: preview.memberIds,
        operationId,
      });

      logTableJoinMerge("join:api-start", {
        targetMain: preview.targetMain,
        secNorm,
        memberIds: preview.memberIds,
        operationId,
        localGroups: groupedTablesRef.current,
      });

      void mergeOpenOrdersForTableGroup(
        db,
        restaurantIdTrimmed,
        preview.targetMain,
        preview.memberIds,
        {
          secondaryTableId: secNorm,
          operationId,
          // No enviar memberIds: el servidor calcula la topología.
        },
      )
        .then((result) => {
          if (!result.ok) {
            const code = result.error ?? "MERGE_FAILED";
            logTableJoinMergeError("join:api-failed", code, {
              mainTableId: preview.targetMain,
              memberIds: preview.memberIds,
              operationId,
            });
            endPending(operationId, code);
            showTableGroupOpError(code, "unir mesas");
            return;
          }
          logTableJoinMerge("join:api-ok", {
            mainTableId: preview.targetMain,
            secondaryTableId: secNorm,
            memberIds: preview.memberIds,
            merged: result.merged,
            destOrderId: result.destOrderId,
            operationId,
          });
          // Liberar pending ANTES del evento (evita reentrada con pending stale).
          endPending(operationId);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(TABLE_GROUP_ORDERS_MERGED_EVENT, {
                detail: {
                  restaurantId: restaurantIdTrimmed,
                  mainTableId: preview.targetMain,
                  memberIds: preview.memberIds,
                  destOrderId: result.destOrderId,
                } satisfies TableGroupOrdersMergedDetail,
              }),
            );
          }
        })
        .catch((e) => {
          const code =
            e instanceof Error && e.message ? e.message : "MERGE_EXCEPTION";
          logTableJoinMergeError("join:api-exception", e, {
            mainTableId: preview.targetMain,
            memberIds: preview.memberIds,
            operationId,
          });
          endPending(operationId, code);
          showTableGroupOpError(code, "unir mesas");
        });
    },
    [restaurantIdTrimmed, beginPending, endPending],
  );

  const separateTable = useCallback(
    (tableId: string, origin?: string) => {
      const id = String(tableId).trim();
      if (!id) return;
      const originNorm: SplitActionOrigin =
        origin === "onClick" ||
        origin === "onPointerUp" ||
        origin === "capture" ||
        origin === "carta-callback" ||
        origin === "hook"
          ? origin
          : "hook";
      if (!restaurantIdTrimmed || !isFirebaseConfigured || !isAuthReady()) {
        showTableGroupOpError("AUTH_NOT_READY", "separar mesas");
        return;
      }
      // Join en curso: sí avisar. Split duplicado: lo corta el gate sin alerta.
      if (pendingOpRef.current?.type === "joining") {
        showTableGroupOpError(
          "TABLE_GROUP_OP_PENDING",
          "separar mesas (hay otra operación en curso)",
        );
        return;
      }

      const prev = groupedTablesRef.current;
      const mainId = resolveMainTableIdFromMap(prev, id);
      const localGrouped = isTableGroupedInMap(prev, id);
      const memberIdsLocal = localGrouped
        ? collectGroupTableIds(prev, mainId)
        : [];
      const dissolvingWholeGroup =
        Object.prototype.hasOwnProperty.call(prev, id) ||
        Object.prototype.hasOwnProperty.call(prev, mainId);
      // Si el menú se abrió sobre la principal, disolvemos el grupo completo.
      const separateTableId =
        dissolvingWholeGroup || id === mainId ? undefined : id;

      const decision = splitGateRef.current.begin({
        mainTableId: mainId,
        separateTableId,
        isLocallyGrouped: localGrouped,
        origin: originNorm,
      });

      const diagBase = {
        timestamp: Date.now(),
        mainTableId: mainId,
        separateTableId: separateTableId ?? null,
        origin: originNorm,
        pendingOp: pendingOpRef.current,
        localGrouped,
        callSeq:
          decision.action === "run"
            ? decision.attempt.seq
            : decision.seq,
      };

      if (decision.action === "ignore") {
        logTableJoinMergeWarn("split:ignored-duplicate", {
          ...diagBase,
          reason: decision.reason,
          operationId: decision.operationId,
        });
        // Sin alerta: evita GROUP_NOT_FOUND / PENDING falsos tras el primer éxito.
        return;
      }

      const { operationId, seq } = decision.attempt;

      beginPending({
        type: "splitting",
        tableIds:
          memberIdsLocal.length > 0
            ? memberIdsLocal
            : [mainId, id].filter(Boolean),
        operationId,
      });

      logTableJoinMerge("split:api-start", {
        ...diagBase,
        operationId,
        callSeq: seq,
        memberIdsLocal,
        localGroups: prev,
      });

      void splitTableGroupOrdersViaApi({
        mainTableId: mainId,
        // Servidor lee tableGroups: no exigir memberIds del snapshot local.
        separateTableId,
        operationId,
      })
        .then((result) => {
          logTableJoinMerge("split:api-response", {
            timestamp: Date.now(),
            operationId,
            mainTableId: mainId,
            separateTableId: separateTableId ?? null,
            origin: originNorm,
            callSeq: seq,
            ok: result.ok,
            error: result.ok ? null : result.error,
            details: result.ok ? null : (result.details ?? null),
          });
          if (!result.ok) {
            const code = result.error ?? "SPLIT_FAILED";
            logTableJoinMergeError("split:api-failed", code, {
              mainTableId: mainId,
              memberIdsLocal,
              separateTableId: separateTableId ?? null,
              operationId,
              details: result.details ?? null,
            });
            splitGateRef.current.fail(operationId);
            endPending(operationId, code);
            showTableGroupOpError(code, "separar mesas", result.details);
            return;
          }
          logTableJoinMerge("split:api-ok", {
            mainTableId: mainId,
            operationId,
            ordersByTableId: result.ordersByTableId,
            reason: result.reason,
          });
          splitGateRef.current.succeed(operationId);
          endPending(operationId);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(TABLE_GROUP_ORDERS_SPLIT_EVENT, {
                detail: {
                  restaurantId: restaurantIdTrimmed,
                  mainTableId: mainId,
                  memberIds: memberIdsLocal,
                  ordersByTableId: result.ordersByTableId,
                } satisfies TableGroupOrdersSplitDetail,
              }),
            );
          }
        })
        .catch((e) => {
          const code =
            e instanceof Error && e.message ? e.message : "SPLIT_EXCEPTION";
          logTableJoinMergeError("split:api-exception", e, {
            mainTableId: mainId,
            memberIdsLocal,
            operationId,
            origin: originNorm,
            callSeq: seq,
          });
          splitGateRef.current.fail(operationId);
          endPending(operationId, code);
          showTableGroupOpError(code, "separar mesas");
        });
    },
    [restaurantIdTrimmed, beginPending, endPending],
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
      isTableGroupOpPending,
      tableGroupPendingOp: pendingOp,
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
      isTableGroupOpPending,
      pendingOp,
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
    isTableGroupOpPending,
    tableGroupPendingOp: pendingOp,
    groupedTablesMapHandlers,
  };
}
