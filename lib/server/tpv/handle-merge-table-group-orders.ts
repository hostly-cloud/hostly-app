import { createHash } from "node:crypto";
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
} from "@/lib/server/tpv/order-projection";
import {
  asOrderItems,
  ensureTableGroupLineOrigin,
  isActiveOrderStatus,
  mergeNotes,
  pickLatestPaymentRequestedAt,
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
  releaseTableOrderLockIfOwnerInTransaction,
  sortTableIdsForLockAcquisition,
  tableOrderLockRef,
  writeTableOrderLockClaim,
} from "@/lib/server/tpv/table-order-lock";
import {
  normalizeTableGroupsMap,
  planMergeFromMemberHints,
  sameSortedIds,
  type TableGroupsMap,
} from "@/lib/server/tpv/table-group-topology";

export type MergeTableGroupIntent = {
  mainTableId: string;
  memberTableIds: string[];
  idempotencyKey?: string;
};

const MERGE_KIND = "merge_table_group";

function pickDestination(
  docs: { id: string; data: Record<string, unknown> }[],
  mainId: string,
): { id: string; data: Record<string, unknown> } | null {
  const onMain = docs.filter((d) => String(d.data.tableId ?? "").trim() === mainId);
  if (onMain.length > 0) {
    return onMain.sort(
      (a, b) =>
        (Number(a.data.createdAt) || 0) - (Number(b.data.createdAt) || 0),
    )[0]!;
  }
  return (
    docs.sort(
      (a, b) =>
        (Number(a.data.createdAt) || 0) - (Number(b.data.createdAt) || 0),
    )[0] ?? null
  );
}

async function discoverActiveOrders(
  ctx: AuthenticatedRestaurantContext,
  memberIds: readonly string[],
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const out: { id: string; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  for (const tableId of memberIds) {
    const snap = await ctx.db
      .collection("orders")
      .where("restaurantId", "==", ctx.restaurantId)
      .where("tableId", "==", tableId)
      .get();
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      const data = doc.data() as Record<string, unknown>;
      const status = String(data.status ?? "").trim().toLowerCase();
      if (!isActiveOrderStatus(status)) continue;
      seen.add(doc.id);
      out.push({ id: doc.id, data });
    }
  }
  return out;
}

async function discoverActiveOrdersInTransaction(
  tx: FirebaseFirestore.Transaction,
  ctx: AuthenticatedRestaurantContext,
  memberIds: readonly string[],
): Promise<{ id: string; ref: DocumentReference; data: Record<string, unknown> }[]> {
  const out: { id: string; ref: DocumentReference; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  for (const tableId of memberIds) {
    const snap = await tx.get(
      ctx.db
        .collection("orders")
        .where("restaurantId", "==", ctx.restaurantId)
        .where("tableId", "==", tableId),
    );
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      const data = doc.data() as Record<string, unknown>;
      if (!isActiveOrderStatus(data.status)) continue;
      seen.add(doc.id);
      out.push({ id: doc.id, ref: doc.ref, data });
    }
  }
  return out;
}

export async function handleMergeTableGroupOrders(
  ctx: AuthenticatedRestaurantContext,
  intent: MergeTableGroupIntent,
): Promise<{ merged: boolean; destOrderId?: string } | TpvMutationError> {
  if (!serverRoleHasCapability(ctx.role, "tpv.join_tables")) {
    return { status: 403, error: "TPV_JOIN_TABLES_REQUIRED" };
  }

  const mainHint = intent.mainTableId.trim();
  const clientMemberIds = [
    ...new Set(intent.memberTableIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!mainHint || clientMemberIds.length === 0) {
    return { status: 400, error: "TABLE_GROUP_INVALID" };
  }
  if (!clientMemberIds.includes(mainHint)) clientMemberIds.unshift(mainHint);

  const idemKey = intent.idempotencyKey?.trim();
  // Idempotency over client intent (estable); la topología server se recalcula.
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, MERGE_KIND, {
      mainTableId: mainHint,
      memberTableIds: clientMemberIds,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      MERGE_KIND,
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.merged != null) {
      return {
        merged: hit.merged === true,
        destOrderId: typeof hit.destOrderId === "string" ? hit.destOrderId : undefined,
      };
    }
  }

  const groupRef = tableGroupsDocRef(ctx.db, ctx.restaurantId);
  const preGroupsSnap = await groupRef.get();
  const preGroups = normalizeTableGroupsMap(
    preGroupsSnap.exists ? (preGroupsSnap.data() as Record<string, unknown>).groups : {},
  );
  const preTopology = planMergeFromMemberHints({
    currentGroups: preGroups,
    mainTableId: mainHint,
    clientMemberIds,
  });
  if (!preTopology.ok) {
    const status =
      preTopology.error === "GROUP_TOPOLOGY_MISMATCH" || preTopology.error === "SAME_TABLE"
        ? 409
        : 400;
    return { status, error: preTopology.error };
  }

  const mainId = preTopology.mainTableId;
  const memberIds = preTopology.memberIds;

  const discovered = await discoverActiveOrders(ctx, memberIds);
  if (discovered.length === 0) {
    // Join sin pedidos: persiste topología autoritativa; no hay líneas que mover.
    try {
      await ctx.db.runTransaction(async (tx) => {
        if (idemKey) {
          const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
          const hit = readIdempotencyHit(idemSnap, MERGE_KIND, payloadHash);
          if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
          if (hit?.merged != null) {
            throw new Error(
              `IDEM_OK:${hit.merged === true}:${typeof hit.destOrderId === "string" ? hit.destOrderId : ""}`,
            );
          }
        }
        const groupSnap = await tx.get(groupRef);
        const groupData = groupSnap.exists ? (groupSnap.data() as Record<string, unknown>) : {};
        const txTopology = planMergeFromMemberHints({
          currentGroups: normalizeTableGroupsMap(groupData.groups),
          mainTableId: mainHint,
          clientMemberIds,
        });
        if (!txTopology.ok) throw new Error(txTopology.error);
        // Sin merge: el mapa `groups` debe sustituirse entero (merge deep conserva claves huérfanas).
        tx.set(groupRef, {
          groups: txTopology.nextGroups,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (idemKey) {
          writeIdempotencyRecord(
            tx,
            idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
            MERGE_KIND,
            payloadHash,
            { merged: false },
          );
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("IDEM_OK:")) {
        const [, mergedFlag, destId] = msg.split(":");
        return {
          merged: mergedFlag === "true",
          destOrderId: destId || undefined,
        };
      }
      if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
      if (msg === "GROUP_TOPOLOGY_MISMATCH" || msg === "SAME_TABLE") {
        return { status: 409, error: msg };
      }
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
    return { merged: false };
  }

  const dest = pickDestination(discovered, mainId);
  if (!dest) return { merged: false };

  const sources = discovered.filter((o) => o.id !== dest.id);
  const destRef = ctx.db.collection("orders").doc(dest.id);
  const sourceRefs = sources.map((s) => ctx.db.collection("orders").doc(s.id));
  const tableRefs = memberIds.map((tid) => ctx.db.collection("tables").doc(tid));
  const nowMs = Date.now();
  let resultDestOrderId = dest.id;
  let resultMerged = true;
  let plannedNextGroups: TableGroupsMap = preTopology.nextGroups;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, MERGE_KIND, payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.merged != null) {
          throw new Error(
            `IDEM_OK:${hit.merged === true}:${typeof hit.destOrderId === "string" ? hit.destOrderId : ""}`,
          );
        }
      }

      // Topología autoritativa dentro de la TX (antes de locks/mutaciones).
      const groupSnap = await tx.get(groupRef);
      const groupData = groupSnap.exists ? (groupSnap.data() as Record<string, unknown>) : {};
      const txGroups = normalizeTableGroupsMap(groupData.groups);
      const txTopology = planMergeFromMemberHints({
        currentGroups: txGroups,
        mainTableId: mainHint,
        clientMemberIds,
      });
      if (!txTopology.ok) throw new Error(txTopology.error);
      if (
        txTopology.mainTableId !== mainId ||
        !sameSortedIds(txTopology.memberIds, memberIds)
      ) {
        throw new Error("CONCURRENT_ORDER_CHANGE");
      }
      plannedNextGroups = txTopology.nextGroups;

      // Adquisición determinista de locks (orden lexicográfico) antes de mutar.
      const lockTableIds = sortTableIdsForLockAcquisition(memberIds);
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

      const destSnap = await tx.get(destRef);
      const destData = readOrderSnapData(destSnap);
      if (!destData) throw new Error("DEST_NOT_FOUND");
      if (String(destData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const destStatus = String(destData.status ?? "").trim().toLowerCase();
      if (!isActiveOrderStatus(destStatus)) throw new Error("DEST_NOT_ACTIVE");

      const txDiscovered = await discoverActiveOrdersInTransaction(tx, ctx, memberIds);
      const expectedIds = new Set(discovered.map((o) => o.id));
      const txIds = new Set(txDiscovered.map((o) => o.id));
      if (expectedIds.size !== txIds.size) throw new Error("CONCURRENT_ORDER_CHANGE");
      for (const id of expectedIds) {
        if (!txIds.has(id)) throw new Error("CONCURRENT_ORDER_CHANGE");
      }

      const sourceSnaps: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
      for (const ref of sourceRefs) {
        const snap = await tx.get(ref);
        const data = readOrderSnapData(snap);
        if (!data) throw new Error("SOURCE_NOT_FOUND");
        if (String(data.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
        const status = String(data.status ?? "").trim().toLowerCase();
        if (!isActiveOrderStatus(status)) throw new Error("SOURCE_NOT_ACTIVE");
        const tableId = String(data.tableId ?? "").trim();
        if (!memberIds.includes(tableId)) throw new Error("SOURCE_TABLE_NOT_IN_GROUP");
        sourceSnaps.push({ ref, data });
      }

      for (const ref of tableRefs) {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("TABLE_NOT_FOUND");
        const data = snap.data() as Record<string, unknown>;
        if (String(data.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TABLE_TENANT_MISMATCH");
      }

      const destTableId = String(destData.tableId ?? "").trim();
      if (!memberIds.includes(destTableId)) throw new Error("DEST_TABLE_NOT_IN_GROUP");

      const claimMainLock = () => {
        const idx = lockTableIds.indexOf(mainId);
        if (idx < 0) return;
        writeTableOrderLockClaim(tx, lockRefs[idx]!, {
          restaurantId: ctx.restaurantId,
          tableId: mainId,
          orderId: dest.id,
          create: !lockSnaps[idx]!.exists,
          claimedByUid: ctx.uid,
          lastOperation: "merge_table_group",
          lastClaimKey: idemKey ?? null,
        });
      };

      const writeAuthoritativeGroups = () => {
        // Sin merge: sustituye `groups` entero (evita claves huérfanas por deep-merge).
        tx.set(groupRef, {
          groups: plannedNextGroups,
          updatedAt: FieldValue.serverTimestamp(),
        });
      };

      if (sources.length === 0) {
        if (destTableId === mainId) {
          resultMerged = false;
          claimMainLock();
          writeAuthoritativeGroups();
          if (idemKey) {
            writeIdempotencyRecord(
              tx,
              idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
              MERGE_KIND,
              payloadHash,
              { merged: false },
            );
          }
          return;
        }
        tx.update(destRef, {
          tableId: mainId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (destTableId && destTableId !== mainId) {
          const oldIdx = lockTableIds.indexOf(destTableId);
          if (oldIdx >= 0) {
            releaseTableOrderLockIfOwnerInTransaction(
              tx,
              lockRefs[oldIdx]!,
              lockSnaps[oldIdx]!,
              {
                restaurantId: ctx.restaurantId,
                tableId: destTableId,
                orderId: dest.id,
                claimedByUid: ctx.uid,
                lastOperation: "merge_table_group",
                lastClaimKey: idemKey ?? null,
              },
            );
          }
        }
        claimMainLock();
        writeAuthoritativeGroups();
        if (idemKey) {
          writeIdempotencyRecord(
            tx,
            idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
            MERGE_KIND,
            payloadHash,
            { merged: true, destOrderId: dest.id },
          );
        }
        return;
      }

      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        dest.id,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);

      const sourceProjectionPlans: ReturnType<typeof planOrderProjectionWrites>[] = [];
      for (const { ref, data } of sourceSnaps) {
        const sourceItemsSnap = await loadOrderItemsForOrderInTransaction(
          tx,
          ctx.db,
          ctx.restaurantId,
          ref.id,
        );
        const sourceLoaded = indexLoadedOrderItems(sourceItemsSnap);
        const sourceMeta = orderProjectionMetaFromOrder(ref.id, data, ctx.restaurantId);
        sourceProjectionPlans.push(
          planOrderProjectionWrites(ctx.db, sourceMeta, [], sourceLoaded, nowMs),
        );
      }

      const mergedItems = [
        ...asOrderItems(destData.items).map((item) =>
          ensureTableGroupLineOrigin(item, destTableId, dest.id),
        ),
        ...sourceSnaps.flatMap(({ data, ref }) => {
          const sourceTableId = String(data.tableId ?? "").trim();
          return asOrderItems(data.items).map((item) =>
            ensureTableGroupLineOrigin(item, sourceTableId, ref.id),
          );
        }),
      ];

      const dupErr = assertNoDuplicateLineIds(mergedItems);
      if (dupErr) throw new Error(dupErr);

      const mergedNote = mergeNotes([
        destData.note,
        ...sourceSnaps.map((s) => s.data.note),
      ]);
      const mergedPaymentRequestedAt = pickLatestPaymentRequestedAt([
        destData.paymentRequestedAt,
        ...sourceSnaps.map((s) => s.data.paymentRequestedAt),
      ]);

      const meta = orderProjectionMetaFromOrder(dest.id, { ...destData, tableId: mainId }, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, mergedItems, loaded, nowMs);
      const mergedTotal = computeAuthoritativeOrderTotal(plan.itemsWithDocIds);

      tx.update(destRef, {
        tableId: mainId,
        items: plan.itemsWithDocIds,
        total: mergedTotal,
        ...(mergedNote ? { note: mergedNote } : {}),
        ...(mergedPaymentRequestedAt != null
          ? { paymentRequestedAt: mergedPaymentRequestedAt }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      for (const cancelPlan of sourceProjectionPlans) {
        applyProjectionWritePlan(tx, cancelPlan);
      }

      for (const { ref, data } of sourceSnaps) {
        const originalStatus = String(data.status ?? "").trim();
        const originalPaymentRequestedAt = data.paymentRequestedAt;
        const sourceTableId = String(data.tableId ?? "").trim();
        tx.update(ref, {
          status: "merged",
          items: [],
          total: 0,
          mergedIntoOrderId: dest.id,
          mergedIntoTableId: mainId,
          ...(originalStatus ? { tableGroupMergeOriginalStatus: originalStatus } : {}),
          ...(originalPaymentRequestedAt != null
            ? { tableGroupMergeOriginalPaymentRequestedAt: originalPaymentRequestedAt }
            : {}),
          paymentRequestedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (sourceTableId) {
          const sIdx = lockTableIds.indexOf(sourceTableId);
          if (sIdx >= 0) {
            releaseTableOrderLockIfOwnerInTransaction(
              tx,
              lockRefs[sIdx]!,
              lockSnaps[sIdx]!,
              {
                restaurantId: ctx.restaurantId,
                tableId: sourceTableId,
                orderId: ref.id,
                claimedByUid: ctx.uid,
                lastOperation: "merge_table_group",
                lastClaimKey: idemKey ?? null,
              },
            );
          }
        }
      }

      if (destTableId && destTableId !== mainId) {
        const oldIdx = lockTableIds.indexOf(destTableId);
        if (oldIdx >= 0) {
          releaseTableOrderLockIfOwnerInTransaction(
            tx,
            lockRefs[oldIdx]!,
            lockSnaps[oldIdx]!,
            {
              restaurantId: ctx.restaurantId,
              tableId: destTableId,
              orderId: dest.id,
              claimedByUid: ctx.uid,
              lastOperation: "merge_table_group",
              lastClaimKey: idemKey ?? null,
            },
          );
        }
      }
      claimMainLock();
      writeAuthoritativeGroups();

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          MERGE_KIND,
          payloadHash,
          { merged: true, destOrderId: dest.id },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, mergedFlag, destId] = msg.split(":");
      return {
        merged: mergedFlag === "true",
        destOrderId: destId || undefined,
      };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "DEST_NOT_FOUND" || msg === "SOURCE_NOT_FOUND") {
      return { status: 404, error: msg };
    }
    if (msg === "TENANT_MISMATCH" || msg === "TABLE_TENANT_MISMATCH") {
      return { status: 403, error: msg };
    }
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: msg };
    if (msg === "LOCK_TENANT_MISMATCH" || msg === "LOCK_TABLE_MISMATCH") {
      return { status: 409, error: msg };
    }
    if (msg === "GROUP_TOPOLOGY_MISMATCH" || msg === "SAME_TABLE") {
      return { status: 409, error: msg };
    }
    if (
      msg === "TABLE_ID_REQUIRED" ||
      msg === "GROUP_NOT_FOUND" ||
      msg === "TABLE_NOT_IN_GROUP" ||
      msg === "NEW_MAIN_TABLE_ID_REQUIRED"
    ) {
      return { status: 400, error: msg };
    }
    if (
      msg === "DUPLICATE_LINE_ID" ||
      msg === "SOURCE_NOT_ACTIVE" ||
      msg === "SOURCE_TABLE_NOT_IN_GROUP" ||
      msg === "DEST_TABLE_NOT_IN_GROUP" ||
      msg === "DEST_NOT_ACTIVE" ||
      msg === "CONCURRENT_ORDER_CHANGE"
    ) {
      return { status: 400, error: msg };
    }
    throw e;
  }

  return { merged: resultMerged, destOrderId: resultDestOrderId };
}

export function deriveStableSplitLineId(lineId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${lineId.trim()}:${idempotencyKey.trim()}`)
    .digest("hex")
    .slice(0, 16);
  return `${lineId.trim()}-sq-${digest}`;
}
