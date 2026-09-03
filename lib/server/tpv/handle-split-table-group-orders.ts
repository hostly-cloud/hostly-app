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
import {
  normalizeTableGroupsMap,
  planSplitFromRemovedHints,
  sameSortedIds,
  type TableGroupsMap,
} from "@/lib/server/tpv/table-group-topology";
import { planTableGroupSplitPartition } from "@/lib/server/tpv/table-group-split-partition";

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
  const mergedDocs = snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return String(data.status ?? "").trim() === "merged";
  });

  const direct = mergedDocs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return String(data.mergedIntoTableId ?? "").trim() === primaryTableId;
  });
  if (direct.length > 0) {
    return direct.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as Record<string, unknown>,
    }));
  }

  // Nested join: pedido merged en mesa intermedia; las líneas viven en el
  // active primary con tableGroupSourceOrderId apuntando a este source.
  const activePrimary = await fetchActiveOrdersForTable(ctx, primaryTableId);
  const referencedSourceIds = new Set<string>();
  for (const order of activePrimary) {
    for (const item of asOrderItems(order.data.items)) {
      const oid =
        typeof item.tableGroupSourceOrderId === "string"
          ? item.tableGroupSourceOrderId.trim()
          : "";
      if (oid) referencedSourceIds.add(oid);
    }
  }
  return mergedDocs
    .filter((doc) => referencedSourceIds.has(doc.id))
    .map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as Record<string, unknown>,
    }));
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
  if (!primaryId || removedRaw.length === 0) {
    return { restored: true, result: "full-split", restoredOrderIds: [] };
  }

  const idemKey = intent.idempotencyKey?.trim();
  // Idempotency antes de topología: retry tras disolver el grupo debe rehidratar.
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, SPLIT_KIND, {
      mainTableId: primaryId,
      newMainTableId: intent.newMainTableId ?? null,
      removedTableIds: removedRaw,
      remainingTableIds: intent.remainingTableIds ?? null,
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

  const groupRef = tableGroupsDocRef(ctx.db, ctx.restaurantId);
  const preGroupsSnap = await groupRef.get();
  const preGroups = normalizeTableGroupsMap(
    preGroupsSnap.exists ? (preGroupsSnap.data() as Record<string, unknown>).groups : {},
  );
  const preTopology = planSplitFromRemovedHints({
    currentGroups: preGroups,
    mainTableId: primaryId,
    removedTableIds: removedRaw,
    newMainTableId: intent.newMainTableId,
  });
  if (!preTopology.ok) {
    const status =
      preTopology.error === "GROUP_TOPOLOGY_MISMATCH" ? 409 : 400;
    return { status, error: preTopology.error };
  }

  const removed = preTopology.removedTableIds;
  const remaining = preTopology.remainingTableIds;
  const effectivePrimaryId = preTopology.effectiveMainTableId;
  let plannedNextGroups: TableGroupsMap = preTopology.nextGroups;

  const activePrimaryOrders = await fetchActiveOrdersForTable(ctx, primaryId);
  const sourceOrdersToRestore = (
    await Promise.all(removed.map((tableId) => fetchMergedSourcesForTable(ctx, tableId, primaryId)))
  ).flat();

  if (sourceOrdersToRestore.length === 0) {
    // Split sin pedidos merged: persiste topología autoritativa.
    const resultKind = remaining.length > 1 ? "partial-split" : "full-split";
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
        const groupSnap = await tx.get(groupRef);
        const groupData = groupSnap.exists ? (groupSnap.data() as Record<string, unknown>) : {};
        const txTopology = planSplitFromRemovedHints({
          currentGroups: normalizeTableGroupsMap(groupData.groups),
          mainTableId: primaryId,
          removedTableIds: removedRaw,
          newMainTableId: intent.newMainTableId,
        });
        if (!txTopology.ok) throw new Error(txTopology.error);
        plannedNextGroups = txTopology.nextGroups;
        // Sin merge: el mapa `groups` debe sustituirse entero.
        tx.set(groupRef, {
          groups: plannedNextGroups,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (idemKey) {
          writeIdempotencyRecord(
            tx,
            idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
            SPLIT_KIND,
            payloadHash,
            { restored: true, result: resultKind, restoredOrderIds: [] },
          );
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("IDEM_OK:")) {
        const [, restoredFlag, resultKindHit, idsJson] = msg.split(":");
        let ids: string[] = [];
        try {
          ids = JSON.parse(idsJson ?? "[]") as string[];
        } catch {
          ids = [];
        }
        return {
          restored: restoredFlag === "true",
          result:
            resultKindHit === "partial-split" || resultKindHit === "full-split"
              ? resultKindHit
              : "aborted",
          restoredOrderIds: ids,
        };
      }
      if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
      if (msg === "GROUP_TOPOLOGY_MISMATCH") return { status: 409, error: msg };
      if (
        msg === "TABLE_ID_REQUIRED" ||
        msg === "GROUP_NOT_FOUND" ||
        msg === "TABLE_NOT_IN_GROUP" ||
        msg === "NEW_MAIN_TABLE_ID_REQUIRED"
      ) {
        return { status: 400, error: msg };
      }
      throw e;
    }
    return { restored: true, result: resultKind, restoredOrderIds: [] };
  }
  if (activePrimaryOrders.length === 0) {
    return { status: 400, error: "NO_ACTIVE_PRIMARY_ORDER" };
  }

  const activePrimaryOrderById = new Map(activePrimaryOrders.map((o) => [o.id, o]));
  const sourceByDestOrderId = new Map<string, typeof sourceOrdersToRestore>();
  for (const source of sourceOrdersToRestore) {
    const directDestId = String(source.data.mergedIntoOrderId ?? "").trim();
    let destId = "";
    if (directDestId && activePrimaryOrderById.has(directDestId)) {
      destId = directDestId;
    } else {
      // Nested merge: el source apunta a un intermedio; las líneas están en el primary activo.
      const sourceTableId = String(source.data.tableId ?? "").trim();
      const holders = activePrimaryOrders.filter((order) =>
        asOrderItems(order.data.items).some((item) => {
          const byOrder =
            typeof item.tableGroupSourceOrderId === "string"
              ? item.tableGroupSourceOrderId.trim()
              : "";
          const byTable =
            typeof item.tableGroupSourceTableId === "string"
              ? item.tableGroupSourceTableId.trim()
              : "";
          if (byOrder) return byOrder === source.id;
          return Boolean(sourceTableId && byTable === sourceTableId);
        }),
      );
      if (holders.length !== 1) {
        return { status: 400, error: "MERGED_SOURCE_NOT_LINKED" };
      }
      destId = holders[0]!.id;
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

  // Prefail Case F antes de abrir la TX (sin writes ni idempotency success).
  const prePartition = planTableGroupSplitPartition({
    restaurantId: ctx.restaurantId,
    primaryTableId: primaryId,
    mainTableId: preTopology.mainTableId,
    memberTableIds: preTopology.memberIdsBefore,
    removedTableIds: removed,
    remainingTableIds: remaining,
    destOrderId,
    lines: primaryItems,
    sourceOrders: sourceOrders.map((s) => ({
      id: s.id,
      tableId: String(s.data.tableId ?? "").trim(),
    })),
  });
  if (!prePartition.ok) {
    return { status: 409, error: "PROVENANCE_INSUFFICIENT" };
  }
  for (const source of sourceOrders) {
    if ((prePartition.bySourceOrderId[source.id] ?? []).length === 0) {
      return { status: 409, error: "PROVENANCE_INSUFFICIENT" };
    }
  }

  const restoredOrderIds = sourceOrders.map((s) => s.id);
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

      const groupSnapEarly = await tx.get(groupRef);
      const groupDataEarly = groupSnapEarly.exists
        ? (groupSnapEarly.data() as Record<string, unknown>)
        : {};
      const txTopology = planSplitFromRemovedHints({
        currentGroups: normalizeTableGroupsMap(groupDataEarly.groups),
        mainTableId: primaryId,
        removedTableIds: removedRaw,
        newMainTableId: intent.newMainTableId,
      });
      if (!txTopology.ok) throw new Error(txTopology.error);
      if (
        txTopology.effectiveMainTableId !== effectivePrimaryId ||
        !sameSortedIds(txTopology.removedTableIds, removed) ||
        !sameSortedIds(txTopology.remainingTableIds, remaining)
      ) {
        throw new Error("CONCURRENT_ORDER_CHANGE");
      }
      plannedNextGroups = txTopology.nextGroups;

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

      const freshItems = asOrderItems(freshPrimary.items);
      const txPartition = planTableGroupSplitPartition({
        restaurantId: ctx.restaurantId,
        primaryTableId: primaryId,
        mainTableId: txTopology.mainTableId,
        memberTableIds: txTopology.memberIdsBefore,
        removedTableIds: txTopology.removedTableIds,
        remainingTableIds: txTopology.remainingTableIds,
        destOrderId,
        lines: freshItems,
        sourceOrders: sourceOrders.map((s) => ({
          id: s.id,
          tableId: String(s.data.tableId ?? "").trim(),
        })),
      });
      if (!txPartition.ok) throw new Error("PROVENANCE_INSUFFICIENT");

      const restoredItemsBySourceOrder = new Map<string, Record<string, unknown>[]>();
      for (const source of sourceOrders) {
        const linesForSource = txPartition.bySourceOrderId[source.id] ?? [];
        if (linesForSource.length === 0) throw new Error("PROVENANCE_INSUFFICIENT");
        restoredItemsBySourceOrder.set(source.id, linesForSource);
      }
      const remainingPrimaryItems = txPartition.remainingOnPrimary;

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

      // Sin merge: sustituye `groups` entero (evita claves huérfanas por deep-merge).
      tx.set(groupRef, {
        groups: plannedNextGroups,
        updatedAt: FieldValue.serverTimestamp(),
      });

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
    if (
      msg === "VERSION_CONFLICT" ||
      msg === "CONCURRENT_ORDER_CHANGE" ||
      msg === "PROVENANCE_INSUFFICIENT" ||
      msg === "GROUP_TOPOLOGY_MISMATCH" ||
      msg === "DUPLICATE_SOURCE_LINE_ASSIGNMENT"
    ) {
      return { status: 409, error: msg };
    }
    if (msg === "LOCK_TENANT_MISMATCH" || msg === "LOCK_TABLE_MISMATCH") {
      return { status: 409, error: msg };
    }
    if (msg === "TENANT_MISMATCH") return { status: 403, error: msg };
    if (msg === "PRIMARY_NOT_FOUND" || msg === "SOURCE_NOT_FOUND") {
      return { status: 404, error: msg };
    }
    if (
      msg === "NEW_MAIN_TABLE_ID_REQUIRED" ||
      msg === "TABLE_ID_REQUIRED" ||
      msg === "GROUP_NOT_FOUND" ||
      msg === "TABLE_NOT_IN_GROUP"
    ) {
      return { status: 400, error: msg };
    }
    if (msg === "DUPLICATE_LINE_ID" || msg === "SOURCE_LINES_NOT_FOUND") {
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
