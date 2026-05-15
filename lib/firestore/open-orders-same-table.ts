import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  isOrderStatusActiveForTableOccupancy,
  readOrderCreatedAtMs,
  readOrderUpdatedAtMs,
} from "@/lib/firestore/order-table-occupancy";

export function isFirestoreOrderStatusOpen(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "open";
}

/**
 * Pedido activo más reciente para una mesa (`restaurantId` + `tableId`).
 * Filtra estados terminales en cliente y ordena por `updatedAt` / `createdAt` desc.
 */
export async function fetchOpenOrderForTable(
  db: Firestore,
  restaurantId: string,
  tableId: string,
): Promise<QueryDocumentSnapshot | null> {
  const tid = tableId.trim();
  const rid = restaurantId.trim();
  if (!tid || !rid) return null;

  const q = query(
    collection(db, "orders"),
    where("restaurantId", "==", rid),
    where("tableId", "==", tid),
  );
  const snap = await getDocs(q);
  const active = snap.docs.filter((d) =>
    isOrderStatusActiveForTableOccupancy(
      (d.data() as { status?: string }).status,
    ),
  );
  if (active.length === 0) return null;

  active.sort((a, b) => {
    const da = a.data() as { updatedAt?: unknown; createdAt?: unknown };
    const db_ = b.data() as { updatedAt?: unknown; createdAt?: unknown };
    const ua =
      readOrderUpdatedAtMs(da.updatedAt) ??
      readOrderCreatedAtMs(da.createdAt) ??
      0;
    const ub =
      readOrderUpdatedAtMs(db_.updatedAt) ??
      readOrderCreatedAtMs(db_.createdAt) ??
      0;
    return ub - ua;
  });
  return active[0] ?? null;
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
