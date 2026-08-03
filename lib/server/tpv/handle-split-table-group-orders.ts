import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { computeAuthoritativeOrderTotal } from "@/lib/server/tpv/build-authoritative-sale-line";
import type { TpvMutationError } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { assertNoDuplicateLineIds } from "@/lib/server/tpv/line-quantity-split";
import {
  applyProjectionWritePlan,
  DuplicateOrderItemLineError,
  indexLoadedOrderItems,
  loadOrderItemsForOrderInTransaction,
  orderProjectionMetaFromOrder,
  planOrderProjectionWrites,
  readOrderSnapData,
  readOrderUpdatedAtMs,
} from "@/lib/server/tpv/order-projection";
import {
  asOrderItems,
  isActiveOrderStatus,
  isPaymentRequestedAtSet,
  tableGroupsDocRef,
} from "@/lib/server/tpv/table-group-order-utils";
import {
  buildIdempotencyPayload,
  idempotencyDocRef,
  readIdempotencyHit,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";
import {
  assertTableOrderLockIntegrity,
  readTableOrderLockData,
  sortTableIdsForLockAcquisition,
  tableOrderLockRef,
  writeTableOrderLockClaim,
} from "@/lib/server/tpv/table-order-lock";

export type SplitTableGroupIntent = {
  mainTableId: string;
  removedTableIds: string[];
  remainingTableIds?: string[];
  /** Obligatorio cuando se separa la mesa principal del grupo. */
  newMainTableId?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

const SPLIT_KIND = "split_table_group";

function itemSourceTableId(item: Record<string, unknown>): string {
  return typeof item.tableGroupSourceTableId === "string"
    ? item.tableGroupSourceTableId.trim()
    : "";
}

function itemSourceOrderId(item: Record<string, unknown>): string {
  return typeof item.tableGroupSourceOrderId === "string"
    ? item.tableGroupSourceOrderId.trim()
    : "";
}

function resolveRestoredStatus(data: Record<string, unknown>): string {
  const original = String(data.tableGroupMergeOriginalStatus ?? "").trim();
  if (original && original !== "merged") return original;
  const hasSentLine = asOrderItems(data.items).some((item) => {
    const status = String(item.status ?? "").trim().toLowerCase();
    return status === "sent" || status === "prepared" || status === "served";
  });
  return hasSentLine ? "sent" : "open";
}

function hasStoredOriginalPaymentRequest(data: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(
    data,
    "tableGroupMergeOriginalPaymentRequestedAt",
  );
}

async function fetchMergedSourcesForTable(
  ctx: AuthenticatedRestaurantContext,
  tableId: string,
  primaryTableId: string,
): Promise<{ id: string; ref: DocumentReference; data: Record<string, unknown> }[]> {
  const snap = await ctx.db
    .collection("orders")
    .where("restaurantId", "==", ctx.restaurantId)
    .where("tableId", "==", tableId)
    .get();
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return (
        String(data.status ?? "").trim() === "merged" &&
        String(data.mergedIntoTableId ?? "").trim() === primaryTableId
      );
    })
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() as Record<string, unknown> }));
}

async function fetchActiveOrdersForTable(
  ctx: AuthenticatedRestaurantContext,
  tableId: string,
): Promise<{ id: string; ref: DocumentReference; data: Record<string, unknown> }[]> {
  const snap = await ctx.db
    .collection("orders")
    .where("restaurantId", "==", ctx.restaurantId)
    .where("tableId", "==", tableId)
    .get();
  return snap.docs
    .filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return isActiveOrderStatus(data.status);
    })
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() as Record<string, unknown> }));
}

export async function handleSplitTableGroupOrders(
  ctx: AuthenticatedRestaurantContext,
  intent: SplitTableGroupIntent,
): Promise<
  | {
      restored: boolean;
      result: "partial-split" | "full-split" | "aborted";
      restoredOrderIds: string[];
    }
  | TpvMutationError
> {
  if (!serverRoleHasCapability(ctx.role, "tpv.join_tables")) {
    return { status: 403, error: "TPV_JOIN_TABLES_REQUIRED" };
  }

  const primaryId = intent.mainTableId.trim();
  const removedRaw = [...new Set(intent.removedTableIds.map((id) => id.trim()).filter(Boolean))];
  const separatingPrimary = removedRaw.includes(primaryId);
  if (separatingPrimary && !intent.newMainTableId?.trim()) {
    return { status: 400, error: "NEW_MAIN_TABLE_ID_REQUIRED" };
  }
  const newMainId = intent.newMainTableId?.trim() || primaryId;
  const removed = separatingPrimary
    ? removedRaw
    : removedRaw.filter((id) => id !== primaryId);
  const remaining = [
    ...new Set(
      (intent.remainingTableIds ?? [primaryId]).map((id) => id.trim()).filter(Boolean),
    ),
  ];
  const effectivePrimaryId = separatingPrimary ? newMainId : primaryId;
  if (!primaryId || removed.length === 0) {
    return { restored: true, result: remaining.length > 1 ? "partial-split" : "full-split", restoredOrderIds: [] };
  }

  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, SPLIT_KIND, {
      mainTableId: primaryId,
      newMainTableId: intent.newMainTableId ?? null,
      removedTableIds: removed,
      remainingTableIds: remaining,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      SPLIT_KIND,
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.restored != null) {
      return {
        restored: hit.restored === true,
        result:
          hit.result === "partial-split" || hit.result === "full-split" || hit.result === "aborted"
            ? hit.result
            : "aborted",
        restoredOrderIds: Array.isArray(hit.restoredOrderIds)
          ? hit.restoredOrderIds.filter((id): id is string => typeof id === "string")
          : [],
      };
    }
  }

  const activePrimaryOrders = await fetchActiveOrdersForTable(ctx, primaryId);
  const sourceOrdersToRestore = (
    await Promise.all(removed.map((tableId) => fetchMergedSourcesForTable(ctx, tableId, primaryId)))
  ).flat();

  if (sourceOrdersToRestore.length === 0) {
    return { restored: true, result: remaining.length > 1 ? "partial-split" : "full-split", restoredOrderIds: [] };
  }
  if (activePrimaryOrders.length === 0) {
    return { status: 400, error: "NO_ACTIVE_PRIMARY_ORDER" };
  }

  const activePrimaryOrderById = new Map(activePrimaryOrders.map((o) => [o.id, o]));
  const sourceByDestOrderId = new Map<string, typeof sourceOrdersToRestore>();
  for (const source of sourceOrdersToRestore) {
    const destId = String(source.data.mergedIntoOrderId ?? "").trim();
    if (!destId || !activePrimaryOrderById.has(destId)) {
      return { status: 400, error: "MERGED_SOURCE_NOT_LINKED" };
    }
    const list = sourceByDestOrderId.get(destId) ?? [];
    list.push(source);
    sourceByDestOrderId.set(destId, list);
  }
  if (sourceByDestOrderId.size !== 1) {
    return { status: 400, error: "PRIMARY_ORDER_AMBIGUOUS" };
  }

  const [[destOrderId, sourceOrders]] = [...sourceByDestOrderId.entries()];
  const primaryOrder = activePrimaryOrderById.get(destOrderId)!;
  const primaryData = primaryOrder.data;
  const primaryItems = asOrderItems(primaryData.items);
  const sourceOrderIdSet = new Set(sourceOrders.map((s) => s.id));
  const restoredItemsBySourceOrder = new Map<string, Record<string, unknown>[]>();
  const restoredItemRefs = new Set<Record<string, unknown>>();

  for (const source of sourceOrders) {
    const sourceTableId = String(source.data.tableId ?? "").trim();
    const explicit: Record<string, unknown>[] = [];
    for (const item of primaryItems) {
      const byOrder = itemSourceOrderId(item);
      const byTable = itemSourceTableId(item);
      if (byOrder) {
        if (byOrder === source.id) explicit.push(item);
        continue;
      }
      if (byTable && byTable === sourceTableId) explicit.push(item);
    }
    if (explicit.length === 0) {
      return { status: 400, error: "SOURCE_LINES_NOT_FOUND" };
    }
    for (const item of explicit) {
      if (restoredItemRefs.has(item)) {
        return { status: 409, error: "DUPLICATE_SOURCE_LINE_ASSIGNMENT" };
      }
      restoredItemRefs.add(item);
    }
    restoredItemsBySourceOrder.set(source.id, explicit);
  }

  if (restoredItemsBySourceOrder.size !== sourceOrders.length) {
    return { status: 400, error: "SOURCE_RESTORE_INCOMPLETE" };
  }

  const remainingPrimaryItems = primaryItems.filter((item) => !restoredItemRefs.has(item));
  const restoredOrderIds = sourceOrders.map((s) => s.id);
  const groupRef = tableGroupsDocRef(ctx.db, ctx.restaurantId);
  const nowMs = Date.now();

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, SPLIT_KIND, payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.restored != null) {
          throw new Error(
            `IDEM_OK:${hit.restored === true}:${hit.result ?? "aborted"}:${JSON.stringify(hit.restoredOrderIds ?? [])}`,
          );
        }
      }

      const lockTableIds = sortTableIdsForLockAcquisition([
        primaryId,
        effectivePrimaryId,
        ...removed,
        ...restoredOrderIds.map((id) => {
          const src = sourceOrders.find((s) => s.id === id);
          return String(src?.data.tableId ?? "").trim();
        }),
      ]);
      const lockRefs = lockTableIds.map((tid) =>
        tableOrderLockRef(ctx.db, ctx.restaurantId, tid),
      );
      const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));
      for (let i = 0; i < lockTableIds.length; i++) {
        const lock = readTableOrderLockData(lockSnaps[i]!);
        if (!lock) continue;
        const integrity = assertTableOrderLockIntegrity(
          lock,
          ctx.restaurantId,
          lockTableIds[i]!,
        );
        if (integrity) throw new Error(integrity.code);
      }

      const primarySnap = await tx.get(primaryOrder.ref);
      const freshPrimary = readOrderSnapData(primarySnap);
      if (!freshPrimary) throw new Error("PRIMARY_NOT_FOUND");
      if (String(freshPrimary.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      if (intent.expectedUpdatedAtMs != null) {
        const current = readOrderUpdatedAtMs(freshPrimary);
        if (current != null && current !== intent.expectedUpdatedAtMs) {
          throw new Error("VERSION_CONFLICT");
        }
      }

      const primaryItems = asOrderItems(freshPrimary.items);
      const restoredItemsBySourceOrder = new Map<string, Record<string, unknown>[]>();
      const restoredItemRefs = new Set<Record<string, unknown>>();

      for (const source of sourceOrders) {
        const sourceTableId = String(source.data.tableId ?? "").trim();
        const explicit: Record<string, unknown>[] = [];
        for (const item of primaryItems) {
          const byOrder = itemSourceOrderId(item);
          const byTable = itemSourceTableId(item);
          if (byOrder) {
            if (byOrder === source.id) explicit.push(item);
            continue;
          }
          if (byTable && byTable === sourceTableId) explicit.push(item);
        }
        if (explicit.length === 0) throw new Error("SOURCE_LINES_NOT_FOUND");
        for (const item of explicit) {
          if (restoredItemRefs.has(item)) throw new Error("DUPLICATE_SOURCE_LINE_ASSIGNMENT");
          restoredItemRefs.add(item);
        }
        restoredItemsBySourceOrder.set(source.id, explicit);
      }

      const remainingPrimaryItems = primaryItems.filter((item) => !restoredItemRefs.has(item));

      const sourceSnapsPrepared: {
        source: (typeof sourceOrders)[number];
        sourceData: Record<string, unknown>;
        restoredItems: Record<string, unknown>[];
        sourceItemsSnap: FirebaseFirestore.QuerySnapshot;
      }[] = [];

      for (const source of sourceOrders) {
        const sourceSnap = await tx.get(source.ref);
        const sourceData = readOrderSnapData(sourceSnap);
        if (!sourceData) throw new Error("SOURCE_NOT_FOUND");
        const restoredItems = restoredItemsBySourceOrder.get(source.id) ?? [];
        const dupErr = assertNoDuplicateLineIds(restoredItems);
        if (dupErr) throw new Error(dupErr);
        const sourceItemsSnap = await loadOrderItemsForOrderInTransaction(
          tx,
          ctx.db,
          ctx.restaurantId,
          source.id,
        );
        sourceSnapsPrepared.push({ source, sourceData, restoredItems, sourceItemsSnap });
      }

      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        destOrderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);

      const dupRemaining = assertNoDuplicateLineIds(remainingPrimaryItems);
      if (dupRemaining) throw new Error(dupRemaining);

      const groupSnap = await tx.get(groupRef);
      const groupData = groupSnap.exists ? (groupSnap.data() as Record<string, unknown>) : {};

      const meta = orderProjectionMetaFromOrder(destOrderId, freshPrimary, ctx.restaurantId);
      const primaryPlan = planOrderProjectionWrites(
        ctx.db,
        meta,
        remainingPrimaryItems,
        loaded,
        nowMs,
      );

      tx.update(primaryOrder.ref, {
        items: primaryPlan.itemsWithDocIds,
        total: computeAuthoritativeOrderTotal(primaryPlan.itemsWithDocIds),
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, primaryPlan);

      for (const prepared of sourceSnapsPrepared) {
        const { source, sourceData, restoredItems, sourceItemsSnap } = prepared;
        const sourceLoaded = indexLoadedOrderItems(sourceItemsSnap);
        const sourceMeta = orderProjectionMetaFromOrder(
          source.id,
          {
            ...sourceData,
            tableId: String(sourceData.tableId ?? ""),
            status: resolveRestoredStatus(sourceData),
          },
          ctx.restaurantId,
        );
        const sourcePlan = planOrderProjectionWrites(
          ctx.db,
          sourceMeta,
          restoredItems,
          sourceLoaded,
          nowMs,
        );

        const originalPaymentRequestedAt = sourceData.tableGroupMergeOriginalPaymentRequestedAt;
        tx.update(source.ref, {
          status: resolveRestoredStatus(sourceData),
          items: sourcePlan.itemsWithDocIds,
          total: computeAuthoritativeOrderTotal(sourcePlan.itemsWithDocIds),
          mergedIntoOrderId: FieldValue.delete(),
          mergedIntoTableId: FieldValue.delete(),
          tableGroupMergeOriginalStatus: FieldValue.delete(),
          tableGroupMergeOriginalPaymentRequestedAt: FieldValue.delete(),
          paymentRequestedAt: hasStoredOriginalPaymentRequest(sourceData)
            ? originalPaymentRequestedAt
            : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        applyProjectionWritePlan(tx, sourcePlan);
      }

      const groupsRaw =
        groupData.groups && typeof groupData.groups === "object"
          ? (groupData.groups as Record<string, unknown>)
          : {};
      const nextGroups: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(groupsRaw)) {
        if (!Array.isArray(value)) continue;
        const filtered = value
          .map((id) => String(id).trim())
          .filter((id) => id && !removed.includes(id));
        if (filtered.length > 0) nextGroups[key] = filtered;
      }
      if (remaining.length > 1) {
        const joined = remaining.filter((id) => id !== effectivePrimaryId);
        if (joined.length > 0) nextGroups[effectivePrimaryId] = joined;
      } else {
        delete nextGroups[effectivePrimaryId];
      }
      if (separatingPrimary) delete nextGroups[primaryId];
      tx.set(
        groupRef,
        { groups: nextGroups, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

      // Ownership: primary conserva dest; cada mesa restaurada reclama su order restaurado.
      const claimLock = (tableId: string, orderId: string) => {
        const idx = lockTableIds.indexOf(tableId);
        if (idx < 0) return;
        writeTableOrderLockClaim(tx, lockRefs[idx]!, {
          restaurantId: ctx.restaurantId,
          tableId,
          orderId,
          create: !lockSnaps[idx]!.exists,
          claimedByUid: ctx.uid,
          lastOperation: "split_table_group",
          lastClaimKey: idemKey ?? null,
        });
      };

      claimLock(effectivePrimaryId, destOrderId);
      for (const source of sourceOrders) {
        const sourceTableId = String(source.data.tableId ?? "").trim();
        if (sourceTableId) claimLock(sourceTableId, source.id);
      }

      const resultKind = remaining.length > 1 ? "partial-split" : "full-split";
      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          SPLIT_KIND,
          payloadHash,
          { restored: true, result: resultKind, restoredOrderIds },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, restoredFlag, resultKind, idsJson] = msg.split(":");
      let ids: string[] = [];
      try {
        ids = JSON.parse(idsJson ?? "[]") as string[];
      } catch {
        ids = [];
      }
      return {
        restored: restoredFlag === "true",
        result:
          resultKind === "partial-split" || resultKind === "full-split"
            ? resultKind
            : "aborted",
        restoredOrderIds: ids,
      };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "LOCK_TENANT_MISMATCH" || msg === "LOCK_TABLE_MISMATCH") {
      return { status: 409, error: msg };
    }
    if (msg === "TENANT_MISMATCH") return { status: 403, error: msg };
    if (msg === "PRIMARY_NOT_FOUND" || msg === "SOURCE_NOT_FOUND") {
      return { status: 404, error: msg };
    }
    if (msg === "NEW_MAIN_TABLE_ID_REQUIRED") return { status: 400, error: msg };
    if (
      msg === "DUPLICATE_LINE_ID" ||
      msg === "SOURCE_LINES_NOT_FOUND" ||
      msg === "DUPLICATE_SOURCE_LINE_ASSIGNMENT"
    ) {
      return { status: 400, error: msg };
    }
    throw e;
  }

  return {
    restored: true,
    result: remaining.length > 1 ? "partial-split" : "full-split",
    restoredOrderIds,
  };
}
