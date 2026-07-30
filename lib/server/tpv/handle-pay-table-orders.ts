import { FieldValue } from "firebase-admin/firestore";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  requireTpvCapability,
  type TpvMutationError,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { isActiveTpvOrderStatus } from "@/lib/server/tpv/is-active-tpv-order-status";
import {
  readTableOrderLockData,
  releaseTableOrderLockIfOwnerInTransaction,
  tableOrderLockRef,
  writeTableOrderLockRelease,
} from "@/lib/server/tpv/table-order-lock";

export type PayTableOrdersResult = {
  tableId: string;
  paidOrderIds: string[];
  updatedCount: number;
  lockReleased: boolean;
  lockReleaseReason?: string;
};

/**
 * Pago total de mesa: marca pedidos activos como `paid` y libera el lock
 * del propietario en la misma transacción Admin.
 * No aplica a pagos parciales (el pedido seguiría activo).
 */
export async function handlePayTableOrders(
  ctx: AuthorizedTpvRestaurantContext,
  intent: { tableId: string },
): Promise<PayTableOrdersResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };

  const paidOrderIds: string[] = [];
  let lockReleased = false;
  let lockReleaseReason: string | undefined;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const ordersSnap = await tx.get(
        ctx.db
          .collection("orders")
          .where("restaurantId", "==", ctx.restaurantId)
          .where("tableId", "==", tableId),
      );
      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
      const lockSnap = await tx.get(lockRef);

      const toPay: Array<{ id: string; alreadyTerminal: boolean }> = [];
      for (const d of ordersSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (String(data.restaurantId ?? "").trim() !== ctx.restaurantId) continue;
        if (String(data.tableId ?? "").trim() !== tableId) continue;
        if (!isActiveTpvOrderStatus(data.status)) {
          // Idempotencia: ya terminal; puede participar en release.
          if (String(data.status ?? "").trim().toLowerCase() === "paid") {
            toPay.push({ id: d.id, alreadyTerminal: true });
          }
          continue;
        }
        toPay.push({ id: d.id, alreadyTerminal: false });
      }

      for (const row of toPay) {
        if (!row.alreadyTerminal) {
          tx.update(ctx.db.collection("orders").doc(row.id), {
            status: "paid",
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            paymentRequestedAt: null,
          });
        }
        paidOrderIds.push(row.id);
      }

      const lock = readTableOrderLockData(lockSnap);
      if (!lock || lock.orderId == null || lock.orderId === "") {
        if (!lockSnap.exists && paidOrderIds.length > 0) {
          // Sin lock: pago OK; normalizar libre es opcional e idempotente.
          writeTableOrderLockRelease(tx, lockRef, {
            restaurantId: ctx.restaurantId,
            tableId,
          });
          lockReleased = true;
          lockReleaseReason = "missing_lock_normalized";
        } else {
          lockReleased = true;
          lockReleaseReason = "already_free";
        }
        return;
      }

      const integrityRestaurant = lock.restaurantId === ctx.restaurantId;
      const integrityTable = lock.tableId === tableId;
      if (!integrityRestaurant || !integrityTable) {
        console.warn("[payTableOrders] lock integrity mismatch; not releasing", {
          restaurantId: ctx.restaurantId,
          tableId,
          lockRestaurantId: lock.restaurantId,
          lockTableId: lock.tableId,
        });
        lockReleased = false;
        lockReleaseReason = !integrityRestaurant
          ? "LOCK_TENANT_MISMATCH"
          : "LOCK_TABLE_MISMATCH";
        // El pago de orders de esta mesa continúa; no tocamos lock ajeno.
        return;
      }

      if (!paidOrderIds.includes(lock.orderId)) {
        console.warn("[payTableOrders] lock owned by other order; not releasing", {
          restaurantId: ctx.restaurantId,
          tableId,
          lockOrderId: lock.orderId,
          paidOrderIds,
        });
        lockReleased = false;
        lockReleaseReason = "lock_owned_by_other_order";
        return;
      }

      const release = releaseTableOrderLockIfOwnerInTransaction(tx, lockRef, lockSnap, {
        restaurantId: ctx.restaurantId,
        tableId,
        orderId: lock.orderId,
      });
      lockReleased = release.released;
      lockReleaseReason = release.reason;
    });
  } catch (e) {
    throw e;
  }

  return {
    tableId,
    paidOrderIds,
    updatedCount: paidOrderIds.length,
    lockReleased,
    lockReleaseReason,
  };
}
