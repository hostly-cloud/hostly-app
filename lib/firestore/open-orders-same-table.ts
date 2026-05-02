import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { readOrderCreatedAtMs } from "@/lib/firestore/order-table-occupancy";

export function isFirestoreOrderStatusOpen(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "open";
}

/**
 * Orders con mismo `restaurantId`, mismo `tableId` y `status === "open"`.
 */
export async function fetchOpenOrdersForTable(
  db: Firestore,
  restaurantId: string,
  tableId: string,
): Promise<QueryDocumentSnapshot[]> {
  const tid = tableId.trim();
  if (!tid) return [];
  const q = query(
    collection(db, "orders"),
    where("restaurantId", "==", restaurantId),
    where("tableId", "==", tid),
  );
  const snap = await getDocs(q);
  return snap.docs.filter((d) =>
    isFirestoreOrderStatusOpen((d.data() as { status?: string }).status),
  );
}

export function sortOpenOrderDocsByCreatedAt(
  docs: QueryDocumentSnapshot[],
): QueryDocumentSnapshot[] {
  return [...docs].sort((a, b) => {
    const ma =
      readOrderCreatedAtMs((a.data() as { createdAt?: unknown }).createdAt) ??
      0;
    const mb =
      readOrderCreatedAtMs((b.data() as { createdAt?: unknown }).createdAt) ??
      0;
    return ma - mb;
  });
}
