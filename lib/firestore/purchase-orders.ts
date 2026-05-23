import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { dbgRunTransaction } from "@/lib/firestore/instrumentedWrites";
import { purchaseDraftDocRef } from "@/lib/firestore/purchase-drafts";
import { normalizePurchaseDraftDocument } from "@/lib/inventory/purchase-draft-types";
import {
  buildPurchaseOrderWritePayloadFromDraft,
  canMarkPurchaseOrderAsOrdered,
  normalizePurchaseOrderDocument,
  PurchaseOrderFromDraftError,
  type PurchaseOrderDocument,
} from "@/lib/purchases/purchase-order-types";

export type { PurchaseOrderDocument };
export { PurchaseOrderFromDraftError };

export function purchaseOrdersCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "purchaseOrders");
}

export function purchaseOrderDocRef(restaurantId: string, orderId: string) {
  return doc(purchaseOrdersCollectionRef(restaurantId), orderId.trim());
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

export type ListenPurchaseOrdersOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export function listenPurchaseOrders(
  restaurantId: string,
  onData: (orders: PurchaseOrderDocument[]) => void,
  options?: ListenPurchaseOrdersOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = purchaseOrdersCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (docs: PurchaseOrderDocument[]) => {
    const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
    const items: PurchaseOrderDocument[] = [];
    for (const docSnap of snap.docs) {
      const parsed = normalizePurchaseOrderDocument(
        docSnap.id,
        docSnap.data(),
        rid,
      );
      if (parsed) items.push(parsed);
    }
    emitSorted(items);
  };

  const attachFallback = () => {
    fallbackActive = true;
    options?.onFallback?.();
    const fallbackQuery = query(col, limit(lim));
    innerUnsub = onSnapshot(
      fallbackQuery,
      (snap) => mapSnapshot(snap),
      (error) => {
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  const orderedQuery = query(col, orderBy("updatedAt", "desc"), limit(lim));
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

export type ListenPurchaseOrderByIdOptions = {
  onError?: (error: unknown) => void;
};

export function listenPurchaseOrderById(
  restaurantId: string,
  purchaseOrderId: string,
  onData: (order: PurchaseOrderDocument | null) => void,
  options?: ListenPurchaseOrderByIdOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const orderId = purchaseOrderId.trim();
  if (!rid || !orderId || !isAuthReady()) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    purchaseOrderDocRef(rid, orderId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const parsed = normalizePurchaseOrderDocument(orderId, snap.data(), rid);
      onData(parsed);
    },
    (error) => {
      options?.onError?.(error);
      onData(null);
    },
  );
}

export async function createPurchaseOrderFromDraft(params: {
  restaurantId: string;
  draftId: string;
}): Promise<{ purchaseOrderId: string }> {
  const rid = params.restaurantId.trim();
  const draftId = params.draftId.trim();
  if (!rid || !draftId || !isAuthReady()) {
    throw new PurchaseOrderFromDraftError("auth_or_params_unavailable");
  }

  const uid = authUidOrUndefined();
  const draftRef = purchaseDraftDocRef(rid, draftId);

  return dbgRunTransaction(
    db,
    async (transaction) => {
      const draftSnap = await transaction.get(draftRef);
      if (!draftSnap.exists()) {
        throw new PurchaseOrderFromDraftError("draft_not_found");
      }

      const draft = normalizePurchaseDraftDocument(draftId, draftSnap.data(), rid);
      if (!draft) {
        throw new PurchaseOrderFromDraftError("draft_invalid");
      }

      if (draft.linkedPurchaseOrderId?.trim()) {
        throw new PurchaseOrderFromDraftError("draft_already_linked");
      }

      let orderPayload: Record<string, unknown>;
      try {
        orderPayload = buildPurchaseOrderWritePayloadFromDraft({
          restaurantId: rid,
          draft,
          userId: uid,
        });
      } catch {
        throw new PurchaseOrderFromDraftError("empty_lines");
      }

      const orderRef = doc(purchaseOrdersCollectionRef(rid));
      transaction.set(orderRef, {
        ...orderPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      transaction.update(draftRef, {
        status: "archived",
        linkedPurchaseOrderId: orderRef.id,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(uid ? { updatedBy: uid } : {}),
      });

      return { purchaseOrderId: orderRef.id };
    },
    {
      label: "purchaseOrders:createFromDraft",
      collection: "purchaseOrders",
      restaurantId: rid,
    },
  );
}

export class PurchaseOrderMarkAsOrderedError extends Error {
  readonly code:
    | "auth_or_params_unavailable"
    | "order_not_found"
    | "order_invalid"
    | "status_not_allowed"
    | "already_ordered";

  constructor(
    code: PurchaseOrderMarkAsOrderedError["code"],
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PurchaseOrderMarkAsOrderedError";
    this.code = code;
  }
}

export async function updatePurchaseOrderStatusToOrdered(params: {
  restaurantId: string;
  purchaseOrderId: string;
}): Promise<{ alreadyOrdered: boolean }> {
  const rid = params.restaurantId.trim();
  const orderId = params.purchaseOrderId.trim();
  if (!rid || !orderId || !isAuthReady()) {
    throw new PurchaseOrderMarkAsOrderedError("auth_or_params_unavailable");
  }

  const uid = authUidOrUndefined();
  const orderRef = purchaseOrderDocRef(rid, orderId);

  return dbgRunTransaction(
    db,
    async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new PurchaseOrderMarkAsOrderedError("order_not_found");
      }

      const order = normalizePurchaseOrderDocument(orderId, orderSnap.data(), rid);
      if (!order) {
        throw new PurchaseOrderMarkAsOrderedError("order_invalid");
      }

      if (order.status === "received" || order.status === "cancelled") {
        throw new PurchaseOrderMarkAsOrderedError("status_not_allowed");
      }

      if (order.status === "partially_received") {
        throw new PurchaseOrderMarkAsOrderedError("status_not_allowed");
      }

      if (order.status === "ordered") {
        return { alreadyOrdered: true };
      }

      if (!canMarkPurchaseOrderAsOrdered(order.status)) {
        throw new PurchaseOrderMarkAsOrderedError("status_not_allowed");
      }

      transaction.update(orderRef, {
        status: "ordered",
        orderedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(uid ? { orderedBy: uid, updatedBy: uid } : {}),
      });

      return { alreadyOrdered: false };
    },
    {
      label: "purchaseOrders:markOrdered",
      collection: "purchaseOrders",
      restaurantId: rid,
    },
  );
}
