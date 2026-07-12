import {
  collection,
  deleteField,
  getDocs,
  query,
  serverTimestamp,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { DbgWriteBatch } from "@/lib/firestore/instrumentedWrites";
import { computeBillableTotalFromOrderDocLike } from "@/lib/firestore/order-table-occupancy";
import { fetchActiveOrdersForTable } from "@/lib/firestore/open-orders-same-table";

type RawOrderItem = Record<string, unknown>;

type SplitTableGroupOrdersResult = {
  restored: boolean;
  groupId: string;
  primaryTableId: string;
  memberTableIds: string[];
  ordersBefore: number;
  restoredAssignments: Array<{
    orderId: string;
    tableId: string;
    itemCount: number;
  }>;
  unresolvedAssignments: Array<{
    orderId?: string;
    tableId?: string;
    reason: string;
  }>;
  totalsBefore: number;
  totalsAfter: number;
};

function asItems(raw: unknown): RawOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({ ...(item as RawOrderItem) }));
}

function itemId(item: RawOrderItem): string {
  return typeof item.id === "string" ? item.id.trim() : "";
}

function itemSourceTableId(item: RawOrderItem): string {
  return typeof item.tableGroupSourceTableId === "string"
    ? item.tableGroupSourceTableId.trim()
    : "";
}

function itemSourceOrderId(item: RawOrderItem): string {
  return typeof item.tableGroupSourceOrderId === "string"
    ? item.tableGroupSourceOrderId.trim()
    : "";
}

function totalFromItems(items: RawOrderItem[]): number {
  const total = computeBillableTotalFromOrderDocLike({ items, total: 0 });
  return Number.isFinite(total) ? total : 0;
}

function resolveRestoredStatus(data: Record<string, unknown>): string {
  const original = String(data.tableGroupMergeOriginalStatus ?? "").trim();
  if (original && original !== "merged") return original;
  const hasSentLine = asItems(data.items).some((item) => {
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

async function fetchMergedSourceOrdersForTable(
  db: Firestore,
  restaurantId: string,
  tableId: string,
  primaryTableId: string,
): Promise<QueryDocumentSnapshot[]> {
  const snap = await getDocs(
    query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("tableId", "==", tableId),
    ),
  );
  return snap.docs.filter((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    return (
      String(data.status ?? "").trim() === "merged" &&
      String(data.mergedIntoTableId ?? "").trim() === primaryTableId
    );
  });
}

function logTableGroupSplit(result: SplitTableGroupOrdersResult): void {
  if (typeof console === "undefined") return;
  console.info("[TPV][TableGroupSplit]", {
    groupId: result.groupId,
    primaryTableId: result.primaryTableId,
    memberTableIds: result.memberTableIds,
    ordersBefore: result.ordersBefore,
    restoredAssignments: result.restoredAssignments,
    unresolvedAssignments: result.unresolvedAssignments,
    totalsBefore: result.totalsBefore,
    totalsAfter: result.totalsAfter,
  });
}

export async function restoreMergedOrdersForTableGroup(
  db: Firestore,
  restaurantId: string,
  primaryTableId: string,
  memberTableIds: string[],
): Promise<SplitTableGroupOrdersResult> {
  const rid = restaurantId.trim();
  const primaryId = primaryTableId.trim();
  const members = [
    ...new Set(memberTableIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  const groupId = primaryId;
  const baseResult: SplitTableGroupOrdersResult = {
    restored: false,
    groupId,
    primaryTableId: primaryId,
    memberTableIds: members,
    ordersBefore: 0,
    restoredAssignments: [],
    unresolvedAssignments: [],
    totalsBefore: 0,
    totalsAfter: 0,
  };

  if (!rid || !primaryId || members.length <= 1) {
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const activePrimaryOrders = await fetchActiveOrdersForTable(db, rid, primaryId);
  const mergedSourceOrders = (
    await Promise.all(
      members
        .filter((memberId) => memberId !== primaryId)
        .map((memberId) =>
          fetchMergedSourceOrdersForTable(db, rid, memberId, primaryId),
        ),
    )
  ).flat();

  baseResult.ordersBefore = activePrimaryOrders.length + mergedSourceOrders.length;
  if (mergedSourceOrders.length === 0) {
    baseResult.restored = true;
    logTableGroupSplit(baseResult);
    return baseResult;
  }
  if (activePrimaryOrders.length === 0) {
    baseResult.unresolvedAssignments.push({
      tableId: primaryId,
      reason: "no-active-primary-order",
    });
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const sourceByDestOrderId = new Map<string, QueryDocumentSnapshot[]>();
  for (const source of mergedSourceOrders) {
    const destId = String(source.data().mergedIntoOrderId ?? "").trim();
    if (!destId) {
      baseResult.unresolvedAssignments.push({
        orderId: source.id,
        tableId: String(source.data().tableId ?? "").trim(),
        reason: "missing-mergedIntoOrderId",
      });
      continue;
    }
    const list = sourceByDestOrderId.get(destId) ?? [];
    list.push(source);
    sourceByDestOrderId.set(destId, list);
  }

  const primaryOrder =
    activePrimaryOrders.find((docSnap) => sourceByDestOrderId.has(docSnap.id)) ??
    activePrimaryOrders[0]!;
  const sourceOrders = sourceByDestOrderId.get(primaryOrder.id) ?? [];
  if (sourceOrders.length === 0) {
    baseResult.unresolvedAssignments.push({
      orderId: primaryOrder.id,
      tableId: primaryId,
      reason: "primary-order-not-linked-to-merged-sources",
    });
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const primaryData = primaryOrder.data() as Record<string, unknown>;
  const primaryItems = asItems(primaryData.items);
  const sourceTableIds = new Set(
    sourceOrders
      .map((source) => String(source.data().tableId ?? "").trim())
      .filter(Boolean),
  );
  const restoredItemsBySourceOrder = new Map<string, RawOrderItem[]>();
  const restoredLineIds = new Set<string>();

  for (const source of sourceOrders) {
    const sourceData = source.data() as Record<string, unknown>;
    const sourceTableId = String(sourceData.tableId ?? "").trim();
    const explicit = primaryItems.filter((item) => {
      const byOrder = itemSourceOrderId(item);
      const byTable = itemSourceTableId(item);
      return byOrder === source.id || (!!sourceTableId && byTable === sourceTableId);
    });
    const fallbackSourceItems = asItems(sourceData.items);
    const itemsToRestore = explicit.length > 0 ? explicit : fallbackSourceItems;
    restoredItemsBySourceOrder.set(source.id, itemsToRestore);
    for (const item of itemsToRestore) {
      const id = itemId(item);
      if (id) restoredLineIds.add(id);
    }
  }

  const remainingPrimaryItems = primaryItems.filter((item) => {
    const id = itemId(item);
    if (id && restoredLineIds.has(id)) return false;
    const byTable = itemSourceTableId(item);
    return !byTable || byTable === primaryId || !sourceTableIds.has(byTable);
  });

  const totalsBefore = totalFromItems(primaryItems);
  const totalsAfter =
    totalFromItems(remainingPrimaryItems) +
    [...restoredItemsBySourceOrder.values()].reduce(
      (sum, items) => sum + totalFromItems(items),
      0,
    );

  const batch = new DbgWriteBatch(db, {
    label: "restoreMergedOrdersForTableGroup",
    collection: "orders",
    restaurantId: rid,
    tableId: primaryId,
    orderId: primaryOrder.id,
  });

  batch.update(primaryOrder.ref, {
    items: remainingPrimaryItems,
    total: totalFromItems(remainingPrimaryItems),
    updatedAt: serverTimestamp(),
  });

  for (const source of sourceOrders) {
    const sourceData = source.data() as Record<string, unknown>;
    const sourceTableId = String(sourceData.tableId ?? "").trim();
    const restoredItems = restoredItemsBySourceOrder.get(source.id) ?? [];
    const originalPaymentRequestedAt =
      sourceData.tableGroupMergeOriginalPaymentRequestedAt;
    batch.update(source.ref, {
      status: resolveRestoredStatus(sourceData),
      items: restoredItems,
      total: totalFromItems(restoredItems),
      mergedIntoOrderId: deleteField(),
      mergedIntoTableId: deleteField(),
      tableGroupMergeOriginalStatus: deleteField(),
      tableGroupMergeOriginalPaymentRequestedAt: deleteField(),
      paymentRequestedAt: hasStoredOriginalPaymentRequest(sourceData)
        ? originalPaymentRequestedAt
        : null,
      updatedAt: serverTimestamp(),
    });
    baseResult.restoredAssignments.push({
      orderId: source.id,
      tableId: sourceTableId,
      itemCount: restoredItems.length,
    });
  }

  await batch.commit();

  baseResult.restored = true;
  baseResult.totalsBefore = totalsBefore;
  baseResult.totalsAfter = totalsAfter;
  logTableGroupSplit(baseResult);
  return baseResult;
}
