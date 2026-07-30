import { FieldValue } from "firebase-admin/firestore";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  requireTpvCapability,
  type TpvMutationError,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { isActiveTpvOrderStatus } from "@/lib/server/tpv/is-active-tpv-order-status";
import {
  assertTableOrderLockIntegrity,
  readTableOrderLockData,
  releaseTableOrderLockIfOwnerInTransaction,
  tableOrderLockRef,
  writeTableOrderLockClaim,
} from "@/lib/server/tpv/table-order-lock";

export type MergeTableGroupOrdersResult = {
  merged: boolean;
  destOrderId?: string;
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

function billableTotal(items: Array<Record<string, unknown>>): number {
  let sum = 0;
  for (const it of items) {
    const st = String(it.status ?? "").trim().toLowerCase();
    if (st === "cancelled" || st === "canceled" || st === "comped") continue;
    sum += Number(it.total) || 0;
  }
  return sum;
}

/**
 * Fusiona comandas activas del grupo en la mesa principal y actualiza
 * `tableOrderLocks` en la misma transacción Admin.
 */
export async function handleMergeTableGroupOrders(
  ctx: AuthorizedTpvRestaurantContext,
  intent: { mainTableId: string; memberIds: string[]; secondaryTableId?: string },
): Promise<MergeTableGroupOrdersResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const mainId = intent.mainTableId.trim();
  const memberIds = [
    ...new Set(intent.memberIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  if (!mainId) return { status: 400, error: "TABLE_ID_REQUIRED" };
  if (memberIds.length === 0) return { merged: false, reason: "empty_members" };

  let result: MergeTableGroupOrdersResult = { merged: false };

  try {
    await ctx.db.runTransaction(async (tx) => {
      // Lecturas deterministas: locks por tableId ordenado, luego orders.
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

      if (allActive.length === 0) {
        result = { merged: false, reason: "no_active_orders" };
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

      if (sources.length === 0) {
        if (dest.tableId === mainId) {
          result = { merged: false, destOrderId: dest.id, reason: "already_on_main" };
          // Asegurar lock de main apunta al dest.
          const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, mainId);
          writeTableOrderLockClaim(tx, lockRef, {
            restaurantId: ctx.restaurantId,
            tableId: mainId,
            orderId: dest.id,
            create: !(mainLockSnap?.exists ?? false),
          });
          return;
        }

        const oldTid = dest.tableId;
        tx.update(ctx.db.collection("orders").doc(dest.id), {
          tableId: mainId,
          updatedAt: FieldValue.serverTimestamp(),
        });

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
        const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, mainId);
        writeTableOrderLockClaim(tx, lockRef, {
          restaurantId: ctx.restaurantId,
          tableId: mainId,
          orderId: dest.id,
          create: !(mainLockSnap?.exists ?? false),
        });
        result = { merged: true, destOrderId: dest.id };
        return;
      }

      const destItems = asItems(dest.data.items);
      const flatSource = sources.flatMap((s) => asItems(s.data.items));
      const mergedItems = normalizeMergedItems([...destItems, ...flatSource]);
      const mergedTotal = billableTotal(mergedItems);

      tx.update(ctx.db.collection("orders").doc(dest.id), {
        tableId: mainId,
        items: mergedItems,
        total: mergedTotal,
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (const s of sources) {
        tx.update(ctx.db.collection("orders").doc(s.id), {
          status: "merged",
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

      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, mainId);
      writeTableOrderLockClaim(tx, lockRef, {
        restaurantId: ctx.restaurantId,
        tableId: mainId,
        orderId: dest.id,
        create: !(mainLockSnap?.exists ?? false),
      });
      result = { merged: true, destOrderId: dest.id };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "TABLE_ALREADY_HAS_ACTIVE_ORDER") {
      return { status: 409, error: "TABLE_ALREADY_HAS_ACTIVE_ORDER" };
    }
    if (msg === "LOCK_TENANT_MISMATCH") return { status: 409, error: "LOCK_TENANT_MISMATCH" };
    if (msg === "LOCK_TABLE_MISMATCH") return { status: 409, error: "LOCK_TABLE_MISMATCH" };
    throw e;
  }

  return result;
}
