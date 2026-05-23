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
import { dbgAddDoc, dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
import type { SuggestedPurchaseDraft } from "@/lib/inventory/suggested-purchase-draft";
import {
  buildPurchaseDraftWritePayload,
  normalizePurchaseDraftDocument,
  sanitizeDraftForPersistence,
  type PurchaseDraftDocument,
  type PurchaseDraftStatus,
} from "@/lib/inventory/purchase-draft-types";

export type { PurchaseDraftDocument };

export function purchaseDraftsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "purchaseDrafts");
}

export function purchaseDraftDocRef(restaurantId: string, draftId: string) {
  return doc(purchaseDraftsCollectionRef(restaurantId), draftId.trim());
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

export type ListenPurchaseDraftsOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export function listenPurchaseDrafts(
  restaurantId: string,
  onData: (drafts: PurchaseDraftDocument[]) => void,
  options?: ListenPurchaseDraftsOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = purchaseDraftsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (docs: PurchaseDraftDocument[]) => {
    const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
    const items: PurchaseDraftDocument[] = [];
    for (const docSnap of snap.docs) {
      const parsed = normalizePurchaseDraftDocument(
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

export async function createPurchaseDraft(params: {
  restaurantId: string;
  draft: SuggestedPurchaseDraft;
  notes?: string | null;
}): Promise<string> {
  const rid = params.restaurantId.trim();
  if (!rid || !isAuthReady()) {
    throw new Error("createPurchaseDraft: auth_or_restaurant_unavailable");
  }

  const sanitized = sanitizeDraftForPersistence(params.draft);
  if (sanitized.lines.length === 0) {
    throw new Error("createPurchaseDraft: empty_lines");
  }

  const uid = authUidOrUndefined();
  const payload = {
    ...buildPurchaseDraftWritePayload({
      restaurantId: rid,
      draft: params.draft,
      status: "draft",
      notes: params.notes,
      userId: uid,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await dbgAddDoc(purchaseDraftsCollectionRef(rid), payload, {
    label: "purchaseDrafts:create",
    collection: "purchaseDrafts",
    restaurantId: rid,
  });
  return ref.id;
}

export async function updatePurchaseDraft(params: {
  restaurantId: string;
  draftId: string;
  draft: SuggestedPurchaseDraft;
  notes?: string | null;
  existing?: Pick<PurchaseDraftDocument, "createdAt" | "createdBy" | "status">;
}): Promise<void> {
  const rid = params.restaurantId.trim();
  const draftId = params.draftId.trim();
  if (!rid || !draftId || !isAuthReady()) {
    throw new Error("updatePurchaseDraft: auth_or_params_unavailable");
  }

  const sanitized = sanitizeDraftForPersistence(params.draft);
  if (sanitized.lines.length === 0) {
    throw new Error("updatePurchaseDraft: empty_lines");
  }

  const uid = authUidOrUndefined();
  const status: PurchaseDraftStatus = params.existing?.status === "archived"
    ? "archived"
    : "draft";

  const payload = {
    ...buildPurchaseDraftWritePayload({
      restaurantId: rid,
      draft: params.draft,
      status,
      notes: params.notes,
      userId: uid,
      preserveCreatedAt: params.existing?.createdAt,
      preserveCreatedBy: params.existing?.createdBy,
    }),
    updatedAt: serverTimestamp(),
  };

  await dbgUpdateDoc(purchaseDraftDocRef(rid, draftId), payload, {
    label: "purchaseDrafts:update",
    collection: "purchaseDrafts",
    restaurantId: rid,
  });
}

export async function archivePurchaseDraft(
  restaurantId: string,
  draftId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const id = draftId.trim();
  if (!rid || !id || !isAuthReady()) {
    throw new Error("archivePurchaseDraft: auth_or_params_unavailable");
  }

  const uid = authUidOrUndefined();
  await dbgUpdateDoc(
    purchaseDraftDocRef(rid, id),
    {
      status: "archived",
      updatedAt: serverTimestamp(),
      ...(uid ? { updatedBy: uid } : {}),
    },
    {
      label: "purchaseDrafts:archive",
      collection: "purchaseDrafts",
      restaurantId: rid,
    },
  );
}
