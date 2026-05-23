import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { dbgRunTransaction, dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
import {
  purchaseOrderDocRef,
} from "@/lib/firestore/purchase-orders";
import {
  applyCreatedStockMovements,
  createStockMovementsForPurchaseReceipt,
} from "@/lib/firestore/stock-movements";
import {
  computePurchaseOrderStatusFromLines,
  isPurchaseOrderReceivableStatus,
  normalizePurchaseOrderDocument,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/purchases/purchase-order-types";
import {
  buildPurchaseReceiptLinesFromOrder,
  computePurchaseReceiptTotalQuantity,
  normalizePurchaseReceiptDocument,
  PurchaseReceiptFromOrderError,
  type PurchaseReceiptDocument,
  type PurchaseReceiptInputLine,
} from "@/lib/purchases/purchase-receipt-types";
import { roundInventoryQuantity } from "@/lib/inventory/unit-conversions";
import {
  buildActivityMetadata,
  createActivityLog,
} from "@/lib/firestore/activity-log";

export type { PurchaseReceiptDocument };
export { PurchaseReceiptFromOrderError };

export function purchaseReceiptsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "purchaseReceipts");
}

export function purchaseReceiptDocRef(restaurantId: string, receiptId: string) {
  return doc(purchaseReceiptsCollectionRef(restaurantId), receiptId.trim());
}

function authUidOrUndefined(): string | undefined {
  const uid = auth.currentUser?.uid?.trim();
  return uid || undefined;
}

function isFirestoreIndexError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : "";
  return code === "failed-precondition";
}

function serializeOrderLineForFirestore(line: PurchaseOrderLine): Record<string, unknown> {
  return {
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    unit: line.unit,
    receivedQuantity: line.receivedQuantity ?? 0,
    ...(line.estimatedUnitCost != null ? { estimatedUnitCost: line.estimatedUnitCost } : {}),
    ...(line.estimatedTotalCost != null ? { estimatedTotalCost: line.estimatedTotalCost } : {}),
    ...(line.supplierName?.trim() ? { supplierName: line.supplierName.trim() } : {}),
    ...(line.currentStock != null ? { currentStock: line.currentStock } : {}),
    ...(line.averageDailyConsumption != null
      ? { averageDailyConsumption: line.averageDailyConsumption }
      : {}),
    ...(line.riskLevel ? { riskLevel: line.riskLevel } : {}),
  };
}

function mergeOrderLinesWithReceipt(
  orderLines: PurchaseOrderLine[],
  receiptLines: ReturnType<typeof buildPurchaseReceiptLinesFromOrder>,
): PurchaseOrderLine[] {
  const receiptQtyByProductId = new Map<string, number>();
  for (const line of receiptLines) {
    receiptQtyByProductId.set(line.productId, line.quantity);
  }

  return orderLines.map((line) => {
    const delta = receiptQtyByProductId.get(line.productId) ?? 0;
    if (delta <= 0) return line;
    const prev = line.receivedQuantity ?? 0;
    const next = roundInventoryQuantity(prev + delta);
    if (next > line.quantity) {
      throw new PurchaseReceiptFromOrderError("quantity_exceeds_remaining");
    }
    return { ...line, receivedQuantity: next };
  });
}

export type ListenPurchaseReceiptsForOrderOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export function listenPurchaseReceiptsForOrder(
  restaurantId: string,
  purchaseOrderId: string,
  onData: (receipts: PurchaseReceiptDocument[]) => void,
  options?: ListenPurchaseReceiptsForOrderOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const orderId = purchaseOrderId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  if (!rid || !orderId || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = purchaseReceiptsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (docs: PurchaseReceiptDocument[]) => {
    const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
    const items: PurchaseReceiptDocument[] = [];
    for (const docSnap of snap.docs) {
      const parsed = normalizePurchaseReceiptDocument(
        docSnap.id,
        docSnap.data(),
        rid,
      );
      if (parsed && parsed.purchaseOrderId === orderId) items.push(parsed);
    }
    emitSorted(items);
  };

  const attachFallback = () => {
    fallbackActive = true;
    options?.onFallback?.();
    const fallbackQuery = query(
      col,
      where("purchaseOrderId", "==", orderId),
      limit(lim),
    );
    innerUnsub = onSnapshot(
      fallbackQuery,
      (snap) => mapSnapshot(snap),
      (error) => {
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  const orderedQuery = query(
    col,
    where("purchaseOrderId", "==", orderId),
    orderBy("createdAt", "desc"),
    limit(lim),
  );

  innerUnsub = onSnapshot(
    orderedQuery,
    (snap) => mapSnapshot(snap),
    (error) => {
      if (!fallbackActive && isFirestoreIndexError(error)) {
        innerUnsub?.();
        attachFallback();
        return;
      }
      options?.onError?.(error);
      onData([]);
    },
  );

  return () => {
    innerUnsub?.();
  };
}

export async function getPurchaseReceiptById(
  restaurantId: string,
  receiptId: string,
): Promise<PurchaseReceiptDocument | null> {
  const rid = restaurantId.trim();
  const rid2 = receiptId.trim();
  if (!rid || !rid2 || !isAuthReady()) return null;

  const snap = await getDoc(purchaseReceiptDocRef(rid, rid2));
  if (!snap.exists()) return null;
  return normalizePurchaseReceiptDocument(snap.id, snap.data(), rid);
}

export type CreatePurchaseReceiptFromOrderParams = {
  restaurantId: string;
  purchaseOrderId: string;
  lines: PurchaseReceiptInputLine[];
  notes?: string | null;
};

export type CreatePurchaseReceiptFromOrderResult = {
  receiptId: string;
  purchaseOrderId: string;
  orderStatus: PurchaseOrderStatus;
  movementIds: string[];
  applySummary: {
    applied: number;
    skipped: number;
    failed: number;
  };
};

export async function createPurchaseReceiptFromOrder(
  params: CreatePurchaseReceiptFromOrderParams,
): Promise<CreatePurchaseReceiptFromOrderResult> {
  const rid = params.restaurantId.trim();
  const purchaseOrderId = params.purchaseOrderId.trim();
  if (!rid || !purchaseOrderId || !isAuthReady()) {
    throw new PurchaseReceiptFromOrderError("auth_or_params_unavailable");
  }

  const uid = authUidOrUndefined();
  const orderRef = purchaseOrderDocRef(rid, purchaseOrderId);

  const txResult = await dbgRunTransaction(
    db,
    async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new PurchaseReceiptFromOrderError("order_not_found");
      }

      const order = normalizePurchaseOrderDocument(
        purchaseOrderId,
        orderSnap.data(),
        rid,
      );
      if (!order) {
        throw new PurchaseReceiptFromOrderError("order_invalid");
      }

      if (!isPurchaseOrderReceivableStatus(order.status)) {
        throw new PurchaseReceiptFromOrderError("order_not_receivable");
      }

      const receiptLines = buildPurchaseReceiptLinesFromOrder({
        order,
        inputLines: params.lines,
      });
      if (receiptLines.length === 0) {
        throw new PurchaseReceiptFromOrderError("empty_lines");
      }

      const updatedLines = mergeOrderLinesWithReceipt(order.lines, receiptLines);
      const nextStatus = computePurchaseOrderStatusFromLines(updatedLines);
      const receiptRef = doc(purchaseReceiptsCollectionRef(rid));
      const totalReceivedQuantity = computePurchaseReceiptTotalQuantity(receiptLines);

      transaction.set(receiptRef, {
        restaurantId: rid,
        purchaseOrderId,
        createdAt: serverTimestamp(),
        ...(uid ? { createdBy: uid } : {}),
        lines: receiptLines,
        totalReceivedQuantity,
        ...(params.notes?.trim()
          ? { notes: params.notes.trim().slice(0, 500) }
          : {}),
      });

      transaction.update(orderRef, {
        lines: updatedLines.map(serializeOrderLineForFirestore),
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(uid ? { updatedBy: uid } : {}),
      });

      return {
        receiptId: receiptRef.id,
        receiptLines,
        orderStatus: nextStatus,
      };
    },
    {
      label: "purchaseReceipts:createFromOrder",
      collection: "purchaseReceipts",
      restaurantId: rid,
    },
  );

  const movementResult = await createStockMovementsForPurchaseReceipt({
    restaurantId: rid,
    purchaseOrderId,
    purchaseReceiptId: txResult.receiptId,
    lines: txResult.receiptLines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unit: line.unit,
    })),
    userId: uid,
  });

  const applyResult = await applyCreatedStockMovements({
    restaurantId: rid,
    movementIds: movementResult.movementIds,
  });

  const applySummary = {
    applied: applyResult.applied,
    skipped: applyResult.skipped,
    failed: applyResult.failed,
  };

  try {
    await dbgUpdateDoc(
      purchaseReceiptDocRef(rid, txResult.receiptId),
      {
        movementIds: movementResult.movementIds,
        applySummary,
      },
      {
        label: "purchaseReceipts:updateApplySummary",
        collection: "purchaseReceipts",
        restaurantId: rid,
      },
    );
  } catch {
    // La recepción y el pedido ya están persistidos; el resumen de apply es informativo.
  }

  void createActivityLog({
    restaurantId: rid,
    type: "purchase_received",
    entityType: "purchaseOrder",
    entityId: purchaseOrderId,
    actorUserId: uid,
    metadata: buildActivityMetadata({
      purchaseOrderId,
      receiptId: txResult.receiptId,
      orderStatus: txResult.orderStatus,
      lineCount: txResult.receiptLines.length,
      totalReceivedQuantity: computePurchaseReceiptTotalQuantity(txResult.receiptLines),
      movementCount: movementResult.movementIds.length,
      route: "purchases",
    }),
  });

  return {
    receiptId: txResult.receiptId,
    purchaseOrderId,
    orderStatus: txResult.orderStatus,
    movementIds: movementResult.movementIds,
    applySummary,
  };
}
