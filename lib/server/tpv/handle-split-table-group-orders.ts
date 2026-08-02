import { FieldValue } from "firebase-admin/firestore";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  requireTpvCapability,
  type TpvMutationError,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { isActiveTpvOrderStatus } from "@/lib/server/tpv/is-active-tpv-order-status";
import { computeAuthoritativeOrderTotal } from "@/lib/server/tpv/build-authoritative-sale-line";
import {
  applyProjectionWritePlan,
  indexLoadedOrderItems,
  loadOrderItemsForOrderInTransaction,
  orderProjectionMetaFromOrder,
  planOrderProjectionWrites,
  readOrderSnapData,
  type LoadedOrderItemProjection,
} from "@/lib/server/tpv/order-projection";
import {
  assertTableOrderLockIntegrity,
  readTableOrderLockData,
  releaseTableOrderLockIfOwnerInTransaction,
  tableOrderLockRef,
  writeTableOrderLockClaim,
} from "@/lib/server/tpv/table-order-lock";
import {
  asOrderItems,
  tableGroupsDocRef,
} from "@/lib/server/tpv/table-group-order-utils";
import {
  partitionMergedLinesForSplit,
  resolveSplitTargetOrderId,
  tableHasActiveSplitLines,
} from "@/lib/server/tpv/table-group-split-partition";
import {
  normalizeTableGroupsMap,
  planSplitTopology,
} from "@/lib/server/tpv/table-group-topology";
import {
  buildIdempotencyPayload,
  idempotencyDocRef as idemRef,
  readIdempotencyHit,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";

export type SplitTableGroupOrdersIntent = {
  mainTableId: string;
  /** Opcional / informativo. La topología persistida manda. */
  memberIds?: string[];
  /** Si se indica, solo extrae esa mesa; si no, disuelve el grupo completo. */
  separateTableId?: string;
  operationId: string;
};

export type SplitTableGroupOrdersResult = {
  split: boolean;
  destOrderId: string;
  ordersByTableId: Record<string, string>;
  reason?: string;
};

const KNOWN_SPLIT_ERRORS = new Set([
  "PROVENANCE_INSUFFICIENT",
  "MULTIPLE_ACTIVE_ORDERS_IN_GROUP",
  "IDEMPOTENCY_CONFLICT",
  "GROUP_TOPOLOGY_MISMATCH",
  "GROUP_NOT_FOUND",
  "TABLE_NOT_IN_GROUP",
  "LOCK_TENANT_MISMATCH",
  "LOCK_TABLE_MISMATCH",
  "TABLE_NOT_FOUND",
  "TABLE_TENANT_MISMATCH",
  "ORDER_NOT_FOUND",
  "DUPLICATE_ORDER_ITEM_LINE_ID",
]);

function cloneLoadedWithoutLineIds(
  loaded: LoadedOrderItemProjection,
  excludeLineIds: ReadonlySet<string>,
): LoadedOrderItemProjection {
  const byLineId = new Map(
    [...loaded.byLineId.entries()].filter(([id]) => !excludeLineIds.has(id)),
  );
  const byDocId = new Map(
    [...loaded.byDocId.entries()].filter(([, entry]) => {
      const lineId =
        typeof entry.data.lineId === "string" ? entry.data.lineId.trim() : "";
      return !lineId || !excludeLineIds.has(lineId);
    }),
  );
  return { byLineId, byDocId, allRefs: loaded.allRefs };
}

async function assertTablesBelongToRestaurant(
  ctx: AuthorizedTpvRestaurantContext,
  tableIds: readonly string[],
): Promise<TpvMutationError | null> {
  for (const tid of tableIds) {
    const snap = await ctx.db.collection("tables").doc(tid).get();
    if (!snap.exists) return { status: 404, error: "TABLE_NOT_FOUND", details: tid };
    const data = snap.data() as Record<string, unknown>;
    if (String(data.restaurantId ?? "").trim() !== ctx.restaurantId) {
      return { status: 403, error: "TABLE_TENANT_MISMATCH", details: tid };
    }
  }
  return null;
}

function logSplitDiag(
  phase: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[Hostly:SplitTableGroup]", phase, payload);
}

type TableAssignment = {
  tableId: string;
  lines: Record<string, unknown>[];
  orderId: string;
  create: boolean;
};

function isMergedStatus(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "merged";
}

/**
 * Separa un grupo de mesas redistribuyendo líneas por `tableGroupSourceTableId`.
 * No re-aplica inventario: solo cambia pertenencia pedido/mesa + proyección.
 *
 * Nota: no usa query por `mergedIntoOrderId` (índice compuesto no desplegado);
 * reutiliza el scan por `tableId` de cada miembro del grupo.
 */
export async function handleSplitTableGroupOrders(
  ctx: AuthorizedTpvRestaurantContext,
  intent: SplitTableGroupOrdersIntent,
): Promise<SplitTableGroupOrdersResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const mainHint = intent.mainTableId.trim();
  const separateHint = intent.separateTableId?.trim() || "";
  const operationId = intent.operationId.trim();
  if (!mainHint) return { status: 400, error: "TABLE_ID_REQUIRED" };
  if (!operationId) return { status: 400, error: "OPERATION_ID_REQUIRED" };

  const tablesToValidate = [mainHint];
  if (separateHint) tablesToValidate.push(separateHint);
  const tableErr = await assertTablesBelongToRestaurant(ctx, tablesToValidate);
  if (tableErr) return tableErr;

  const clientMemberIds = intent.memberIds
    ? [
        ...new Set(
          intent.memberIds.map((id) => String(id ?? "").trim()).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b))
    : undefined;

  const idemKey = `split-table-group:${operationId}`;
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "split_table_group", {
      mainTableId: mainHint,
      memberIds: clientMemberIds ?? null,
      separateTableId: separateHint || null,
    }),
  );

  const preHit = readIdempotencyHit(
    await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
    "split_table_group",
    payloadHash,
  );
  if (preHit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
  if (preHit?.destOrderId != null && preHit.split === true) {
    return {
      split: true,
      destOrderId: String(preHit.destOrderId),
      ordersByTableId:
        preHit.ordersByTableId && typeof preHit.ordersByTableId === "object"
          ? (preHit.ordersByTableId as Record<string, string>)
          : {},
      reason: "idempotent_replay",
    };
  }

  let result: SplitTableGroupOrdersResult | null = null;
  let rehydrated: SplitTableGroupOrdersResult | null = null;
  let failingOp = "transaction";

  try {
    await ctx.db.runTransaction(async (tx) => {
      failingOp = "idempotency_read";
      const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
      const hit = readIdempotencyHit(idemSnap, "split_table_group", payloadHash);
      if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
      if (hit?.destOrderId != null && hit.split === true) {
        rehydrated = {
          split: true,
          destOrderId: String(hit.destOrderId),
          ordersByTableId:
            hit.ordersByTableId && typeof hit.ordersByTableId === "object"
              ? (hit.ordersByTableId as Record<string, string>)
              : {},
          reason: "idempotent_replay",
        };
        throw new Error("IDEM_OK");
      }

      failingOp = "read_table_groups";
      const groupsRef = tableGroupsDocRef(ctx.db, ctx.restaurantId);
      const groupsSnap = await tx.get(groupsRef);
      const groupsData = groupsSnap.exists
        ? (groupsSnap.data() as Record<string, unknown>)
        : {};
      const groupsMap = normalizeTableGroupsMap(groupsData.groups);

      failingOp = "plan_split_topology";
      const topology = planSplitTopology({
        currentGroups: groupsMap,
        mainTableId: mainHint,
        separateTableId: separateHint || undefined,
        clientMemberIds,
      });
      if (!topology.ok) throw new Error(topology.error);

      const mainId = topology.mainTableId;
      const memberIds = topology.memberIds;
      const separateTableId = topology.separateTableId ?? "";
      const nextGroups = topology.nextGroups;

      logSplitDiag("topology", {
        operationId,
        restaurantId: ctx.restaurantId,
        mainTableId: mainId,
        separateTableId: separateTableId || null,
        memberIds,
        groupsMap,
        nextGroups,
      });

      failingOp = "read_locks";
      const lockRefs = memberIds.map((tid) =>
        tableOrderLockRef(ctx.db, ctx.restaurantId, tid),
      );
      const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));

      failingOp = "scan_member_orders";
      type ScannedOrder = {
        id: string;
        tableId: string;
        data: Record<string, unknown>;
      };
      const scanned: ScannedOrder[] = [];
      const seen = new Set<string>();
      for (const tid of memberIds) {
        const snap = await tx.get(
          ctx.db
            .collection("orders")
            .where("restaurantId", "==", ctx.restaurantId)
            .where("tableId", "==", tid),
        );
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue;
          const data = d.data() as Record<string, unknown>;
          if (String(data.restaurantId ?? "").trim() !== ctx.restaurantId) continue;
          seen.add(d.id);
          scanned.push({
            id: d.id,
            tableId: String(data.tableId ?? "").trim(),
            data,
          });
        }
      }

      const allActive = scanned.filter((o) => isActiveTpvOrderStatus(o.data.status));

      const applyGroupsUpdate = () => {
        failingOp = "write_table_groups";
        tx.set(
          groupsRef,
          { groups: nextGroups, updatedAt: Date.now() },
          { merge: false },
        );
      };

      if (allActive.length === 0) {
        applyGroupsUpdate();
        result = {
          split: true,
          destOrderId: "",
          ordersByTableId: {},
          reason: "already_split",
        };
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "split_table_group",
          payloadHash,
          result,
        );
        return;
      }

      if (allActive.length > 1) {
        logSplitDiag("multiple_actives", {
          operationId,
          activeOrderIds: allActive.map((o) => o.id),
          activeTableIds: allActive.map((o) => o.tableId),
        });
        throw new Error("MULTIPLE_ACTIVE_ORDERS_IN_GROUP");
      }

      const dest = allActive[0]!;
      const destRef = ctx.db.collection("orders").doc(dest.id);
      const destItems = asOrderItems(dest.data.items);

      // Pedidos merged: del mismo scan por mesa (evita query mergedIntoOrderId + índice).
      const mergedSourceByTableId = new Map<string, string>();
      for (const o of scanned) {
        if (!isMergedStatus(o.data.status)) continue;
        if (String(o.data.mergedIntoOrderId ?? "").trim() !== dest.id) continue;
        const tableId = o.tableId;
        if (!tableId) continue;
        if (!mergedSourceByTableId.has(tableId)) {
          mergedSourceByTableId.set(tableId, o.id);
        }
      }

      // También por provenance de línea (por si el scan de mesa no los encontró).
      for (const line of destItems) {
        const srcTable =
          typeof line.tableGroupSourceTableId === "string"
            ? line.tableGroupSourceTableId.trim()
            : "";
        const srcOrder =
          typeof line.tableGroupSourceOrderId === "string"
            ? line.tableGroupSourceOrderId.trim()
            : "";
        if (srcTable && srcOrder && !mergedSourceByTableId.has(srcTable)) {
          mergedSourceByTableId.set(srcTable, srcOrder);
        }
      }

      failingOp = "partition_lines";
      const partition = partitionMergedLinesForSplit({
        lines: destItems,
        mainTableId: mainId,
        memberIds,
        hasMergedSourceOrders: mergedSourceByTableId.size > 0,
      });
      if (!partition.ok) throw new Error(partition.error);

      let byTable = partition.byTableId;
      if (separateTableId && separateTableId !== mainId) {
        const extracted = byTable[separateTableId] ?? [];
        const stayOnDest: Record<string, unknown>[] = [];
        for (const [tid, lines] of Object.entries(byTable)) {
          if (tid === separateTableId) continue;
          stayOnDest.push(...lines);
        }
        byTable = {
          [mainId]: stayOnDest,
          [separateTableId]: extracted,
        };
      }

      logSplitDiag("partition", {
        operationId,
        destOrderId: dest.id,
        byTableCounts: Object.fromEntries(
          Object.entries(byTable).map(([k, v]) => [k, v.length]),
        ),
        mergedSourceByTableId: Object.fromEntries(mergedSourceByTableId),
      });

      const assignments: TableAssignment[] = [];
      const claimedOrderIds = new Set<string>();
      const orderIdsToRead = new Set<string>();

      const tableIds = Object.keys(byTable).sort((a, b) => a.localeCompare(b));
      for (const tid of tableIds) {
        const lines = byTable[tid] ?? [];
        if (lines.length === 0) continue;

        let orderId = resolveSplitTargetOrderId({
          tableId: tid,
          mainTableId: mainId,
          destOrderId: dest.id,
          lines,
          mergedSourceByTableId,
        });

        if (orderId && claimedOrderIds.has(orderId)) {
          orderId = null;
        }

        let create = false;
        if (!orderId) {
          orderId = ctx.db.collection("orders").doc().id;
          create = true;
        } else if (orderId !== dest.id) {
          orderIdsToRead.add(orderId);
        }

        claimedOrderIds.add(orderId);
        assignments.push({ tableId: tid, lines, orderId, create });
      }

      failingOp = "read_target_orders";
      const priorByOrderId = new Map<string, Record<string, unknown>>();
      for (const oid of [...orderIdsToRead].sort()) {
        const snap = await tx.get(ctx.db.collection("orders").doc(oid));
        if (!snap.exists) {
          for (const a of assignments) {
            if (a.orderId === oid) a.create = true;
          }
        } else {
          priorByOrderId.set(oid, readOrderSnapData(snap) ?? {});
        }
      }

      failingOp = "load_dest_order_items";
      const destOrderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        dest.id,
      );
      const destLoaded = indexLoadedOrderItems(destOrderItemsSnap);

      const linesLeavingDest = new Set<string>();
      for (const a of assignments) {
        if (a.orderId === dest.id) continue;
        for (const line of a.lines) {
          const id = typeof line.id === "string" ? line.id.trim() : "";
          if (id) linesLeavingDest.add(id);
        }
      }

      failingOp = "write_orders_and_projections";
      const nowMs = Date.now();
      const ordersByTableId: Record<string, string> = {};
      const tablesToClaim: Array<{ tableId: string; orderId: string }> = [];
      const tablesToRelease = new Set<string>(memberIds);

      for (const a of assignments) {
        const orderRef = ctx.db.collection("orders").doc(a.orderId);
        let prior: Record<string, unknown> = {};
        if (a.orderId === dest.id) {
          prior = dest.data;
        } else if (!a.create) {
          prior = priorByOrderId.get(a.orderId) ?? {};
        }

        const loadedForPlan =
          a.orderId === dest.id
            ? cloneLoadedWithoutLineIds(destLoaded, linesLeavingDest)
            : {
                byLineId: new Map(),
                byDocId: new Map(),
                allRefs: [] as LoadedOrderItemProjection["allRefs"],
              };

        const meta = orderProjectionMetaFromOrder(
          a.orderId,
          { ...prior, tableId: a.tableId, restaurantId: ctx.restaurantId },
          ctx.restaurantId,
        );
        const plan = planOrderProjectionWrites(
          ctx.db,
          meta,
          a.lines,
          loadedForPlan,
          nowMs,
        );
        const active = tableHasActiveSplitLines(plan.itemsWithDocIds);
        const payload: Record<string, unknown> = {
          restaurantId: ctx.restaurantId,
          tableId: a.tableId,
          items: plan.itemsWithDocIds,
          total: computeAuthoritativeOrderTotal(plan.itemsWithDocIds),
          status: active ? "open" : "closed",
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (a.create) {
          payload.createdAt = FieldValue.serverTimestamp();
          payload.source = "tpv";
          // FieldValue.delete() no es válido en set() sin merge.
          tx.set(orderRef, payload);
        } else {
          payload.mergedIntoOrderId = FieldValue.delete();
          payload.mergedIntoTableId = FieldValue.delete();
          tx.update(orderRef, payload);
        }
        applyProjectionWritePlan(tx, plan);

        ordersByTableId[a.tableId] = a.orderId;
        tablesToRelease.delete(a.tableId);
        if (active) {
          tablesToClaim.push({ tableId: a.tableId, orderId: a.orderId });
        } else {
          tablesToRelease.add(a.tableId);
        }
      }

      if (!claimedOrderIds.has(dest.id)) {
        failingOp = "close_unused_dest";
        const emptyPlan = planOrderProjectionWrites(
          ctx.db,
          orderProjectionMetaFromOrder(
            dest.id,
            { ...dest.data, tableId: mainId },
            ctx.restaurantId,
          ),
          [],
          cloneLoadedWithoutLineIds(destLoaded, linesLeavingDest),
          nowMs,
        );
        tx.update(destRef, {
          tableId: mainId,
          items: [],
          total: 0,
          status: "closed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        applyProjectionWritePlan(tx, emptyPlan);
        tablesToRelease.add(mainId);
      }

      failingOp = "update_locks";
      for (let i = 0; i < memberIds.length; i++) {
        const tid = memberIds[i]!;
        const lock = readTableOrderLockData(lockSnaps[i]!);
        if (lock) {
          const integrity = assertTableOrderLockIntegrity(
            lock,
            ctx.restaurantId,
            tid,
          );
          if (integrity) throw new Error(integrity.code);
        }
      }

      for (const tid of tablesToRelease) {
        const idx = memberIds.indexOf(tid);
        if (idx < 0) continue;
        const lock = readTableOrderLockData(lockSnaps[idx]!);
        if (lock?.orderId) {
          releaseTableOrderLockIfOwnerInTransaction(
            tx,
            lockRefs[idx]!,
            lockSnaps[idx]!,
            {
              restaurantId: ctx.restaurantId,
              tableId: tid,
              orderId: lock.orderId,
            },
          );
        }
      }

      for (const claim of tablesToClaim) {
        const idx = memberIds.indexOf(claim.tableId);
        if (idx < 0) continue;
        writeTableOrderLockClaim(tx, lockRefs[idx]!, {
          restaurantId: ctx.restaurantId,
          tableId: claim.tableId,
          orderId: claim.orderId,
          create: !(lockSnaps[idx]?.exists ?? false),
        });
      }

      applyGroupsUpdate();

      result = {
        split: true,
        destOrderId: dest.id,
        ordersByTableId,
      };
      failingOp = "write_idempotency";
      writeIdempotencyRecord(
        tx,
        idemRef(ctx.db, ctx.restaurantId, idemKey),
        "split_table_group",
        payloadHash,
        result,
      );
    });
  } catch (e) {
    if (e instanceof Error && e.message === "IDEM_OK" && rehydrated) {
      return rehydrated;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : "Error";
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: unknown }).code ?? "")
        : "";

    logSplitDiag("failed", {
      operationId,
      restaurantId: ctx.restaurantId,
      mainTableId: mainHint,
      separateTableId: separateHint || null,
      failingOp,
      errorName: name,
      errorCode: code || null,
      errorMessage: msg,
      stack: e instanceof Error ? e.stack ?? null : null,
    });

    if (KNOWN_SPLIT_ERRORS.has(msg)) {
      const status =
        msg === "TABLE_NOT_FOUND"
          ? 404
          : msg === "TABLE_TENANT_MISMATCH"
            ? 403
            : msg.startsWith("LOCK_") ||
                msg === "PROVENANCE_INSUFFICIENT" ||
                msg === "MULTIPLE_ACTIVE_ORDERS_IN_GROUP" ||
                msg === "IDEMPOTENCY_CONFLICT" ||
                msg === "GROUP_TOPOLOGY_MISMATCH" ||
                msg === "GROUP_NOT_FOUND" ||
                msg === "TABLE_NOT_IN_GROUP" ||
                msg === "DUPLICATE_ORDER_ITEM_LINE_ID"
              ? 409
              : 400;
      return { status, error: msg };
    }

    // Índice faltante / precondition de Firestore → error de dominio accionable.
    if (
      code === "failed-precondition" ||
      /requires an index/i.test(msg) ||
      /FAILED_PRECONDITION/i.test(msg)
    ) {
      return {
        status: 500,
        error: "FIRESTORE_INDEX_REQUIRED",
        details: failingOp,
      };
    }

    return {
      status: 500,
      error: "SPLIT_TABLE_GROUP_FAILED",
      details:
        process.env.NODE_ENV === "production"
          ? failingOp
          : `${failingOp}:${name}:${msg.slice(0, 240)}`,
    };
  }

  return result ?? { split: false, destOrderId: "", ordersByTableId: {}, reason: "noop" };
}
