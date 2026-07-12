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
  removedTableIds: string[];
  remainingTableIds: string[];
  ordersBefore: number;
  restoredAssignments: Array<{
    orderId: string;
    tableId: string;
    itemCount: number;
  }>;
  restoredOrderIds: string[];
  preservedMergedOrderIds: string[];
  unresolvedAssignments: Array<{
    orderId?: string;
    tableId?: string;
    reason: string;
  }>;
  movedItemCount: number;
  unresolvedItemCount: number;
  totalsBefore: number;
  totalsAfter: number;
  result: "partial-split" | "full-split" | "aborted";
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
    removedTableIds: result.removedTableIds,
    remainingTableIds: result.remainingTableIds,
    ordersBefore: result.ordersBefore,
    restoredOrderIds: result.restoredOrderIds,
    preservedMergedOrderIds: result.preservedMergedOrderIds,
    restoredAssignments: result.restoredAssignments,
    unresolvedAssignments: result.unresolvedAssignments,
    movedItemCount: result.movedItemCount,
    unresolvedItemCount: result.unresolvedItemCount,
    totalsBefore: result.totalsBefore,
    totalsAfter: result.totalsAfter,
    result: result.result,
  });
}

function uniqueTrimmed(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function addUnresolved(
  result: SplitTableGroupOrdersResult,
  unresolved: SplitTableGroupOrdersResult["unresolvedAssignments"][number],
): void {
  result.unresolvedAssignments.push(unresolved);
  result.unresolvedItemCount += 1;
}

function selectFallbackItemsForLegacySource(params: {
  primaryItems: RawOrderItem[];
  sourceItems: RawOrderItem[];
  sourceOrderId: string;
  sourceTableId: string;
  result: SplitTableGroupOrdersResult;
}): RawOrderItem[] | null {
  const sourceIds = params.sourceItems.map(itemId).filter(Boolean);
  if (sourceIds.length === 0 || sourceIds.length !== params.sourceItems.length) {
    addUnresolved(params.result, {
      orderId: params.sourceOrderId,
      tableId: params.sourceTableId,
      reason: "legacy-source-items-missing-stable-line-ids",
    });
    return null;
  }

  const primaryById = new Map<string, RawOrderItem>();
  const duplicatePrimaryIds = new Set<string>();
  for (const item of params.primaryItems) {
    const id = itemId(item);
    if (!id) continue;
    if (primaryById.has(id)) {
      duplicatePrimaryIds.add(id);
      continue;
    }
    primaryById.set(id, item);
  }

  const selected: RawOrderItem[] = [];
  for (const id of sourceIds) {
    if (duplicatePrimaryIds.has(id)) {
      addUnresolved(params.result, {
        orderId: params.sourceOrderId,
        tableId: params.sourceTableId,
        reason: "legacy-line-id-duplicated-in-primary-order",
      });
      return null;
    }
    const primaryItem = primaryById.get(id);
    if (!primaryItem) {
      addUnresolved(params.result, {
        orderId: params.sourceOrderId,
        tableId: params.sourceTableId,
        reason: "legacy-source-line-not-found-in-primary-order",
      });
      return null;
    }
    selected.push(primaryItem);
  }

  return selected;
}

export async function restoreMergedOrdersForTableGroup(
  db: Firestore,
  restaurantId: string,
  primaryTableId: string,
  removedTableIds: string[],
  options: {
    remainingTableIds?: readonly string[];
  } = {},
): Promise<SplitTableGroupOrdersResult> {
  const rid = restaurantId.trim();
  const primaryId = primaryTableId.trim();
  const removed = uniqueTrimmed(removedTableIds).filter((id) => id !== primaryId);
  const remaining = uniqueTrimmed(options.remainingTableIds ?? [primaryId]);
  const members = uniqueTrimmed([primaryId, ...remaining, ...removed]);
  const groupId = primaryId;
  const baseResult: SplitTableGroupOrdersResult = {
    restored: false,
    groupId,
    primaryTableId: primaryId,
    memberTableIds: members,
    removedTableIds: removed,
    remainingTableIds: remaining,
    ordersBefore: 0,
    restoredAssignments: [],
    restoredOrderIds: [],
    preservedMergedOrderIds: [],
    unresolvedAssignments: [],
    movedItemCount: 0,
    unresolvedItemCount: 0,
    totalsBefore: 0,
    totalsAfter: 0,
    result: "aborted",
  };

  if (!rid || !primaryId || removed.length === 0) {
    baseResult.restored = true;
    baseResult.result = remaining.length > 1 ? "partial-split" : "full-split";
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const activePrimaryOrders = await fetchActiveOrdersForTable(db, rid, primaryId);
  const sourceOrdersToRestore = (
    await Promise.all(
      removed
        .map((memberId) =>
          fetchMergedSourceOrdersForTable(db, rid, memberId, primaryId),
        ),
    )
  ).flat();
  const preservedMergedSourceOrders = (
    await Promise.all(
      remaining
        .filter((memberId) => memberId !== primaryId)
        .map((memberId) =>
          fetchMergedSourceOrdersForTable(db, rid, memberId, primaryId),
        ),
    )
  ).flat();
  baseResult.preservedMergedOrderIds = preservedMergedSourceOrders.map(
    (source) => source.id,
  );

  baseResult.ordersBefore =
    activePrimaryOrders.length +
    sourceOrdersToRestore.length +
    preservedMergedSourceOrders.length;
  if (sourceOrdersToRestore.length === 0) {
    baseResult.restored = true;
    baseResult.result = remaining.length > 1 ? "partial-split" : "full-split";
    logTableGroupSplit(baseResult);
    return baseResult;
  }
  if (activePrimaryOrders.length === 0) {
    addUnresolved(baseResult, {
      tableId: primaryId,
      reason: "no-active-primary-order",
    });
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const sourceByDestOrderId = new Map<string, QueryDocumentSnapshot[]>();
  for (const source of sourceOrdersToRestore) {
    const destId = String(source.data().mergedIntoOrderId ?? "").trim();
    if (!destId) {
      addUnresolved(baseResult, {
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
    addUnresolved(baseResult, {
      orderId: primaryOrder.id,
      tableId: primaryId,
      reason: "primary-order-not-linked-to-merged-sources",
    });
    logTableGroupSplit(baseResult);
    return baseResult;
  }

  const primaryData = primaryOrder.data() as Record<string, unknown>;
  const primaryItems = asItems(primaryData.items);
  const removedSourceTableIds = new Set(
    sourceOrders
      .map((source) => String(source.data().tableId ?? "").trim())
      .filter(Boolean),
  );
  const restoredItemsBySourceOrder = new Map<string, RawOrderItem[]>();
  const restoredItemRefs = new Set<RawOrderItem>();

  for (const source of sourceOrders) {
    const sourceData = source.data() as Record<string, unknown>;
    const sourceTableId = String(sourceData.tableId ?? "").trim();
    const explicit = primaryItems.filter((item) => {
      const byOrder = itemSourceOrderId(item);
      const byTable = itemSourceTableId(item);
      return byOrder === source.id || (!!sourceTableId && byTable === sourceTableId);
    });
    const fallbackSourceItems = asItems(sourceData.items);
    const itemsToRestore =
      explicit.length > 0
        ? explicit
        : selectFallbackItemsForLegacySource({
            primaryItems,
            sourceItems: fallbackSourceItems,
            sourceOrderId: source.id,
            sourceTableId,
            result: baseResult,
          });
    if (itemsToRestore == null) {
      logTableGroupSplit(baseResult);
      return baseResult;
    }
    restoredItemsBySourceOrder.set(source.id, itemsToRestore);
    for (const item of itemsToRestore) {
      restoredItemRefs.add(item);
    }
  }

  const remainingPrimaryItems = primaryItems.filter((item) => {
    if (restoredItemRefs.has(item)) return false;
    const byTable = itemSourceTableId(item);
    return !byTable || byTable === primaryId || !removedSourceTableIds.has(byTable);
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
    baseResult.restoredOrderIds.push(source.id);
    baseResult.movedItemCount += restoredItems.length;
  }

  await batch.commit();

  baseResult.restored = true;
  baseResult.totalsBefore = totalsBefore;
  baseResult.totalsAfter = totalsAfter;
  baseResult.result = remaining.length > 1 ? "partial-split" : "full-split";
  logTableGroupSplit(baseResult);
  return baseResult;
}
