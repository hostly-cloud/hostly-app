import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";
import {
  computeOrderBalance,
  isOrderEconomicallySettled,
  MONEY_EPS,
} from "@/lib/server/tpv/order-payment-balance";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function orderItemsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

export async function loadTableOrdersInTransaction(
  tx: Transaction,
  db: Firestore,
  restaurantId: string,
  tableId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[]> {
  const snap = await tx.get(
    db
      .collection("orders")
      .where("restaurantId", "==", restaurantId)
      .where("tableId", "==", tableId),
  );
  return snap.docs.map((doc) => ({
    ref: doc.ref,
    data: doc.data() as Record<string, unknown>,
  }));
}

export async function loadOrderPaymentsInTransaction(
  tx: Transaction,
  db: Firestore,
  restaurantId: string,
  orderId: string,
): Promise<Record<string, unknown>[]> {
  const snap = await tx.get(
    db
      .collection("payments")
      .where("restaurantId", "==", restaurantId)
      .where("orderId", "==", orderId),
  );
  return snap.docs.map((doc) => doc.data() as Record<string, unknown>);
}

export function countActiveOrdersOnTable(
  orders: readonly {
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
  }[],
  excludeOrderId?: string,
): number {
  let count = 0;
  for (const { ref, data } of orders) {
    if (excludeOrderId && ref.id === excludeOrderId) continue;
    if (isActiveOrderStatus(data.status)) count++;
  }
  return count;
}

export async function tableHasPendingBalance(
  tx: Transaction,
  db: Firestore,
  restaurantId: string,
  orders: readonly { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[],
): Promise<boolean> {
  for (const { ref, data } of orders) {
    if (!isActiveOrderStatus(data.status)) continue;
    const items = orderItemsArray(data.items);
    const payments = await loadOrderPaymentsInTransaction(tx, db, restaurantId, ref.id);
    const { remaining } = computeOrderBalance(data, items, payments);
    if (remaining > MONEY_EPS) return true;
  }
  return false;
}

export async function reconcileTableStatusInTransaction(
  tx: Transaction,
  tableRef: FirebaseFirestore.DocumentReference,
  tableData: Record<string, unknown>,
  ordersOnTable: readonly {
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
  }[],
  db: Firestore,
  restaurantId: string,
): Promise<void> {
  let activeCount = 0;
  let hasPending = false;
  for (const { ref, data } of ordersOnTable) {
    if (!isActiveOrderStatus(data.status)) continue;
    activeCount++;
    const items = orderItemsArray(data.items);
    const payments = await loadOrderPaymentsInTransaction(tx, db, restaurantId, ref.id);
    if (!isOrderEconomicallySettled(data, items, payments)) {
      hasPending = true;
      break;
    }
  }
  const currentStatus = String(tableData.status ?? "").trim().toLowerCase();
  const nextStatus =
    activeCount > 0 || hasPending ? "occupied" : "free";
  if (currentStatus !== nextStatus) {
    tx.update(tableRef, {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
