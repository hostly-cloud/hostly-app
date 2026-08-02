import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
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
  ensureTableGroupLineOrigin,
  tableGroupsDocRef,
} from "@/lib/server/tpv/table-group-order-utils";
import {
  normalizeTableGroupsMap,
  planJoinTopology,
} from "@/lib/server/tpv/table-group-topology";
import {
  buildIdempotencyPayload,
  idempotencyDocRef as idemRef,
  readIdempotencyHit,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";

export type MergeTableGroupOrdersIntent = {
  mainTableId: string;
  /**
   * Si se indica: join autoritativo (actualiza tableGroups).
   * Si se omite: solo consolida pedidos activos de `memberIds` / mesa (sin cambiar topología).
   */
  secondaryTableId?: string;
  /** Opcional: debe coincidir con la topología resultante o se rechaza. */
  memberIds?: string[];
  operationId: string;
};

export type MergeTableGroupOrdersResult = {
  merged: boolean;
  destOrderId?: string;
  mainTableId?: string;
  memberIds?: string[];
  groups?: Record<string, string[]>;
  reason?: string;
};

function generateOrderLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function asItems(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => ({ ...(x as Record<string, unknown>) }));
}

function normalizeMergedItems(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.map((it) => {
    const next = { ...it };
    let id = typeof next.id === "string" ? next.id : "";
    if (!id || seen.has(id)) {
      id = generateOrderLineId();
      next.id = id;
    }
    seen.add(id);
    return next;
  });
}

function mergeLoadedProjections(
  parts: LoadedOrderItemProjection[],
): LoadedOrderItemProjection {
  const byLineId = new Map<
    string,
    { ref: DocumentReference; data: Record<string, unknown> }
  >();
  const byDocId = new Map<
    string,
    { ref: DocumentReference; data: Record<string, unknown> }
  >();
  const allRefs: DocumentReference[] = [];
  for (const part of parts) {
    for (const [lineId, entry] of part.byLineId) {
      if (!byLineId.has(lineId)) byLineId.set(lineId, entry);
    }
    for (const [docId, entry] of part.byDocId) {
      if (!byDocId.has(docId)) byDocId.set(docId, entry);
    }
    for (const ref of part.allRefs) allRefs.push(ref);
  }
  return { byLineId, byDocId, allRefs };
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

/**
 * Join autoritativo: topología + pedidos + orderItems + locks + provenance
 * en una sola transacción Admin. No toca inventario.
 */
export async function handleMergeTableGroupOrders(
  ctx: AuthorizedTpvRestaurantContext,
  intent: MergeTableGroupOrdersIntent,
): Promise<MergeTableGroupOrdersResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const mainHint = intent.mainTableId.trim();
  const secondaryId = intent.secondaryTableId?.trim() || "";
  const operationId = intent.operationId.trim();
  if (!mainHint) return { status: 400, error: "TABLE_ID_REQUIRED" };
  if (secondaryId && mainHint === secondaryId) return { status: 400, error: "SAME_TABLE" };
  if (!operationId) return { status: 400, error: "OPERATION_ID_REQUIRED" };

  const tablesToCheck = secondaryId ? [mainHint, secondaryId] : [mainHint];
  const tableErr = await assertTablesBelongToRestaurant(ctx, tablesToCheck);
  if (tableErr) return tableErr;

  const idemKey = `merge-table-group:${operationId}`;
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "merge_table_group", {
      mainTableId: mainHint,
      secondaryTableId: secondaryId || null,
      memberIds: intent.memberIds
        ? [...new Set(intent.memberIds.map((id) => String(id).trim()).filter(Boolean))].sort(
            (a, b) => a.localeCompare(b),
          )
        : null,
    }),
  );

  const preHit = readIdempotencyHit(
    await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
    "merge_table_group",
    payloadHash,
  );
  if (preHit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
  if (preHit?.merged != null) {
    return {
      merged: Boolean(preHit.merged),
      destOrderId: typeof preHit.destOrderId === "string" ? preHit.destOrderId : undefined,
      mainTableId: typeof preHit.mainTableId === "string" ? preHit.mainTableId : undefined,
      memberIds: Array.isArray(preHit.memberIds)
        ? (preHit.memberIds as string[])
        : undefined,
      groups:
        preHit.groups && typeof preHit.groups === "object"
          ? (preHit.groups as Record<string, string[]>)
          : undefined,
      reason: "idempotent_replay",
    };
  }

  let result: MergeTableGroupOrdersResult | null = null;
  let rehydrated: MergeTableGroupOrdersResult | null = null;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
      const hit = readIdempotencyHit(idemSnap, "merge_table_group", payloadHash);
      if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
      if (hit?.merged != null) {
        rehydrated = {
          merged: Boolean(hit.merged),
          destOrderId: typeof hit.destOrderId === "string" ? hit.destOrderId : undefined,
          mainTableId: typeof hit.mainTableId === "string" ? hit.mainTableId : undefined,
          memberIds: Array.isArray(hit.memberIds) ? (hit.memberIds as string[]) : undefined,
          groups:
            hit.groups && typeof hit.groups === "object"
              ? (hit.groups as Record<string, string[]>)
              : undefined,
          reason: "idempotent_replay",
        };
        throw new Error("IDEM_OK");
      }

      const groupsRef = tableGroupsDocRef(ctx.db, ctx.restaurantId);
      const groupsSnap = await tx.get(groupsRef);
      const currentGroups = normalizeTableGroupsMap(
        groupsSnap.exists ? (groupsSnap.data() as Record<string, unknown>).groups : {},
      );

      let mainId = mainHint;
      let memberIds: string[];
      let nextGroups = currentGroups;
      let shouldWriteGroups = false;

      if (secondaryId) {
        const topology = planJoinTopology({
          currentGroups,
          mainTableId: mainHint,
          secondaryTableId: secondaryId,
          clientMemberIds: intent.memberIds,
        });
        if (!topology.ok) throw new Error(topology.error);
        mainId = topology.mainTableId;
        memberIds = topology.memberIds;
        nextGroups = topology.nextGroups;
        shouldWriteGroups = true;
      } else {
        memberIds = intent.memberIds?.length
          ? [
              ...new Set(
                intent.memberIds.map((id) => String(id).trim()).filter(Boolean),
              ),
            ].sort((a, b) => a.localeCompare(b))
          : [mainId];
        if (!memberIds.includes(mainId)) memberIds = [mainId, ...memberIds].sort();
      }

      const lockRefs = memberIds.map((tid) =>
        tableOrderLockRef(ctx.db, ctx.restaurantId, tid),
      );
      const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));

      const allActive: Array<{
        id: string;
        tableId: string;
        data: Record<string, unknown>;
      }> = [];
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
          if (!isActiveTpvOrderStatus(data.status)) continue;
          seen.add(d.id);
          allActive.push({
            id: d.id,
            tableId: String(data.tableId ?? "").trim(),
            data,
          });
        }
      }

      const writeGroups = () => {
        if (!shouldWriteGroups) return;
        tx.set(
          groupsRef,
          { groups: nextGroups, updatedAt: Date.now() },
          { merge: false },
        );
      };

      const finish = (r: MergeTableGroupOrdersResult) => {
        writeGroups();
        result = {
          ...r,
          mainTableId: mainId,
          memberIds,
          groups: shouldWriteGroups ? nextGroups : undefined,
        };
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "merge_table_group",
          payloadHash,
          result,
        );
      };

      if (allActive.length === 0) {
        finish({ merged: false, reason: "no_active_orders" });
        return;
      }

      const onMain = allActive.filter((o) => o.tableId === mainId);
      const dest =
        onMain.sort((a, b) => a.id.localeCompare(b.id))[0] ??
        allActive.sort((a, b) => a.id.localeCompare(b.id))[0]!;
      const sources = allActive.filter((o) => o.id !== dest.id);

      const mainLockIdx = memberIds.indexOf(mainId);
      const mainLockSnap = mainLockIdx >= 0 ? lockSnaps[mainLockIdx]! : null;
      const mainLock = mainLockSnap ? readTableOrderLockData(mainLockSnap) : null;
      if (mainLock) {
        const integrity = assertTableOrderLockIntegrity(mainLock, ctx.restaurantId, mainId);
        if (integrity) throw new Error(integrity.code);
        if (
          mainLock.orderId &&
          mainLock.orderId !== dest.id &&
          allActive.some((o) => o.id === mainLock.orderId)
        ) {
          throw new Error("TABLE_ALREADY_HAS_ACTIVE_ORDER");
        }
      }

      const nowMs = Date.now();
      const orderIdsForProjection = [dest.id, ...sources.map((s) => s.id)];
      const loadedParts: LoadedOrderItemProjection[] = [];
      for (const oid of orderIdsForProjection) {
        const snap = await loadOrderItemsForOrderInTransaction(
          tx,
          ctx.db,
          ctx.restaurantId,
          oid,
        );
        loadedParts.push(indexLoadedOrderItems(snap));
      }
      const combinedLoaded = mergeLoadedProjections(loadedParts);

      const claimMainLock = () => {
        const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, mainId);
        writeTableOrderLockClaim(tx, lockRef, {
          restaurantId: ctx.restaurantId,
          tableId: mainId,
          orderId: dest.id,
          create: !(mainLockSnap?.exists ?? false),
        });
      };

      if (sources.length === 0) {
        if (dest.tableId === mainId) {
          claimMainLock();
          finish({
            merged: false,
            destOrderId: dest.id,
            reason: "already_on_main",
          });
          return;
        }

        const oldTid = dest.tableId;
        const stampedRelocate = asItems(dest.data.items).map((it) =>
          ensureTableGroupLineOrigin(it, oldTid || mainId, dest.id),
        );
        const meta = orderProjectionMetaFromOrder(
          dest.id,
          { ...dest.data, tableId: mainId, restaurantId: ctx.restaurantId },
          ctx.restaurantId,
        );
        const plan = planOrderProjectionWrites(
          ctx.db,
          meta,
          stampedRelocate,
          combinedLoaded,
          nowMs,
        );
        tx.update(ctx.db.collection("orders").doc(dest.id), {
          tableId: mainId,
          items: plan.itemsWithDocIds,
          total: computeAuthoritativeOrderTotal(plan.itemsWithDocIds),
          updatedAt: FieldValue.serverTimestamp(),
        });
        applyProjectionWritePlan(tx, plan);

        if (oldTid && oldTid !== mainId) {
          const oldIdx = memberIds.indexOf(oldTid);
          if (oldIdx >= 0) {
            releaseTableOrderLockIfOwnerInTransaction(
              tx,
              lockRefs[oldIdx]!,
              lockSnaps[oldIdx]!,
              { restaurantId: ctx.restaurantId, tableId: oldTid, orderId: dest.id },
            );
          }
        }
        claimMainLock();
        finish({ merged: true, destOrderId: dest.id });
        return;
      }

      const destOriginTable = dest.tableId || mainId;
      const destItems = asItems(dest.data.items).map((it) =>
        ensureTableGroupLineOrigin(it, destOriginTable, dest.id),
      );
      const flatSource = sources.flatMap((s) =>
        asItems(s.data.items).map((it) =>
          ensureTableGroupLineOrigin(it, s.tableId || mainId, s.id),
        ),
      );
      const mergedItems = normalizeMergedItems([...destItems, ...flatSource]);
      const meta = orderProjectionMetaFromOrder(
        dest.id,
        { ...dest.data, tableId: mainId, restaurantId: ctx.restaurantId },
        ctx.restaurantId,
      );
      const plan = planOrderProjectionWrites(
        ctx.db,
        meta,
        mergedItems,
        combinedLoaded,
        nowMs,
      );

      tx.update(ctx.db.collection("orders").doc(dest.id), {
        tableId: mainId,
        items: plan.itemsWithDocIds,
        total: computeAuthoritativeOrderTotal(plan.itemsWithDocIds),
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      for (const s of sources) {
        tx.update(ctx.db.collection("orders").doc(s.id), {
          status: "merged",
          items: [],
          total: 0,
          mergedIntoOrderId: dest.id,
          mergedIntoTableId: mainId,
          paymentRequestedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const sIdx = memberIds.indexOf(s.tableId);
        if (sIdx >= 0) {
          releaseTableOrderLockIfOwnerInTransaction(
            tx,
            lockRefs[sIdx]!,
            lockSnaps[sIdx]!,
            { restaurantId: ctx.restaurantId, tableId: s.tableId, orderId: s.id },
          );
        }
      }

      if (dest.tableId && dest.tableId !== mainId) {
        const oldIdx = memberIds.indexOf(dest.tableId);
        if (oldIdx >= 0) {
          releaseTableOrderLockIfOwnerInTransaction(
            tx,
            lockRefs[oldIdx]!,
            lockSnaps[oldIdx]!,
            {
              restaurantId: ctx.restaurantId,
              tableId: dest.tableId,
              orderId: dest.id,
            },
          );
        }
      }

      claimMainLock();
      finish({ merged: true, destOrderId: dest.id });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "IDEM_OK" && rehydrated) {
      return rehydrated;
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "GROUP_TOPOLOGY_MISMATCH") {
      return { status: 409, error: "GROUP_TOPOLOGY_MISMATCH" };
    }
    if (msg === "SAME_TABLE") return { status: 400, error: "SAME_TABLE" };
    if (msg === "TABLE_ID_REQUIRED") return { status: 400, error: "TABLE_ID_REQUIRED" };
    if (msg === "TABLE_ALREADY_HAS_ACTIVE_ORDER") {
      return { status: 409, error: "TABLE_ALREADY_HAS_ACTIVE_ORDER" };
    }
    if (msg === "LOCK_TENANT_MISMATCH") return { status: 409, error: "LOCK_TENANT_MISMATCH" };
    if (msg === "LOCK_TABLE_MISMATCH") return { status: 409, error: "LOCK_TABLE_MISMATCH" };
    throw e;
  }

  return result ?? { merged: false, reason: "noop" };
}
