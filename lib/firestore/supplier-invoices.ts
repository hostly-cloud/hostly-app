import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { dbgAddDoc, dbgRunTransaction } from "@/lib/firestore/instrumentedWrites";
import { purchaseOrderDocRef } from "@/lib/firestore/purchase-orders";
import {
  buildActivityMetadata,
  createActivityLog,
} from "@/lib/firestore/activity-log";
import {
  buildInventoryCostPatchFromSupplierInvoiceLine,
  mergeRecordedSupplierInvoiceLines,
} from "@/lib/inventory/supplier-invoice-cost";
import {
  computeSupplierInvoiceTotals,
  normalizeSupplierInvoiceDocument,
  sanitizeSupplierInvoiceLineInputs,
  SupplierInvoiceError,
  type SupplierInvoiceDocument,
  type SupplierInvoiceLineInput,
} from "@/lib/inventory/supplier-invoice-types";
import { normalizePurchaseOrderDocument } from "@/lib/purchases/purchase-order-types";

export type { SupplierInvoiceDocument };
export { SupplierInvoiceError };

export function supplierInvoicesCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "supplierInvoices");
}

export function supplierInvoiceDocRef(restaurantId: string, invoiceId: string) {
  return doc(supplierInvoicesCollectionRef(restaurantId), invoiceId.trim());
}

function productDocRef(restaurantId: string, productId: string) {
  return doc(db, "restaurants", restaurantId.trim(), "products", productId.trim());
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

function serializeSupplierInvoiceLine(line: SupplierInvoiceDocument["lines"][number]) {
  return {
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    unit: line.unit,
    realUnitCost: line.realUnitCost,
    realTotalCost: line.realTotalCost,
    ...(line.previousUnitCost != null ? { previousUnitCost: line.previousUnitCost } : {}),
    ...(line.updatedInventoryUnitCost != null
      ? { updatedInventoryUnitCost: line.updatedInventoryUnitCost }
      : {}),
    ...(line.purchaseReceiptId?.trim()
      ? { purchaseReceiptId: line.purchaseReceiptId.trim() }
      : {}),
  };
}

export type ListenSupplierInvoicesOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export function listenSupplierInvoices(
  restaurantId: string,
  onData: (invoices: SupplierInvoiceDocument[]) => void,
  options?: ListenSupplierInvoicesOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = supplierInvoicesCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (docs: SupplierInvoiceDocument[]) => {
    const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
    const items: SupplierInvoiceDocument[] = [];
    for (const docSnap of snap.docs) {
      const parsed = normalizeSupplierInvoiceDocument(docSnap.id, docSnap.data(), rid);
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

export async function getSupplierInvoiceById(
  restaurantId: string,
  invoiceId: string,
): Promise<SupplierInvoiceDocument | null> {
  const rid = restaurantId.trim();
  const iid = invoiceId.trim();
  if (!rid || !iid || !isAuthReady()) return null;

  const snap = await getDoc(supplierInvoiceDocRef(rid, iid));
  if (!snap.exists()) return null;
  return normalizeSupplierInvoiceDocument(snap.id, snap.data(), rid);
}

export type CreateSupplierInvoiceParams = {
  restaurantId: string;
  purchaseOrderId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: number | null;
  lines: SupplierInvoiceLineInput[];
  notes?: string | null;
};

async function validateLinkedPurchaseOrder(params: {
  restaurantId: string;
  purchaseOrderId: string;
  invoiceLines: SupplierInvoiceDocument["lines"];
}) {
  const orderSnap = await getDoc(
    purchaseOrderDocRef(params.restaurantId, params.purchaseOrderId),
  );
  if (!orderSnap.exists()) {
    throw new SupplierInvoiceError("linked_order_not_found");
  }

  const order = normalizePurchaseOrderDocument(
    orderSnap.id,
    orderSnap.data(),
    params.restaurantId,
  );
  if (!order) {
    throw new SupplierInvoiceError("linked_order_invalid");
  }

  const orderedProductIds = new Set(order.lines.map((line) => line.productId));
  if (params.invoiceLines.some((line) => !orderedProductIds.has(line.productId))) {
    throw new SupplierInvoiceError("linked_order_line_mismatch");
  }
}

export async function createSupplierInvoice(
  params: CreateSupplierInvoiceParams,
): Promise<{ invoiceId: string }> {
  const rid = params.restaurantId.trim();
  if (!rid || !isAuthReady()) {
    throw new SupplierInvoiceError("auth_or_params_unavailable");
  }

  const lines = sanitizeSupplierInvoiceLineInputs(params.lines);
  if (lines.length === 0) {
    throw new SupplierInvoiceError("empty_lines");
  }

  const purchaseOrderId = params.purchaseOrderId?.trim() || null;
  if (purchaseOrderId) {
    await validateLinkedPurchaseOrder({
      restaurantId: rid,
      purchaseOrderId,
      invoiceLines: lines,
    });
  }

  const totals = computeSupplierInvoiceTotals(lines);
  const uid = authUidOrUndefined();

  const ref = await dbgAddDoc(
    supplierInvoicesCollectionRef(rid),
    {
      restaurantId: rid,
      status: "draft",
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
      ...(params.supplierName?.trim()
        ? { supplierName: params.supplierName.trim().slice(0, 160) }
        : {}),
      ...(params.invoiceNumber?.trim()
        ? { invoiceNumber: params.invoiceNumber.trim().slice(0, 64) }
        : {}),
      ...(params.invoiceDate != null && Number.isFinite(params.invoiceDate)
        ? { invoiceDate: params.invoiceDate }
        : {}),
      lines: lines.map(serializeSupplierInvoiceLine),
      subtotal: totals.subtotal,
      total: totals.total,
      ...(params.notes?.trim()
        ? { notes: params.notes.trim().slice(0, 500) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(uid ? { createdBy: uid, updatedBy: uid } : {}),
    },
    {
      label: "supplierInvoices:create",
      collection: "supplierInvoices",
      restaurantId: rid,
    },
  );

  return { invoiceId: ref.id };
}

async function applyInventoryCostFromSupplierInvoiceInTransaction(params: {
  transaction: Transaction;
  restaurantId: string;
  lines: SupplierInvoiceDocument["lines"];
}) {
  const applyResults = [];

  for (const line of params.lines) {
    const productRef = productDocRef(params.restaurantId, line.productId);
    const productSnap = await params.transaction.get(productRef);
    if (!productSnap.exists()) {
      applyResults.push({
        productId: line.productId,
        status: "error" as const,
        applyError: "product_not_found",
      });
      continue;
    }

    const result = buildInventoryCostPatchFromSupplierInvoiceLine({
      line: {
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
        realUnitCost: line.realUnitCost,
        realTotalCost: line.realTotalCost,
      },
      productData: productSnap.data() as Record<string, unknown>,
    });

    if (result.status === "applied" && result.inventoryPatch) {
      params.transaction.update(productRef, {
        ...result.inventoryPatch,
        updatedAt: serverTimestamp(),
      });
    }

    applyResults.push(result);
  }

  return applyResults;
}

export async function recordSupplierInvoice(params: {
  restaurantId: string;
  invoiceId: string;
}): Promise<{ invoiceId: string }> {
  const rid = params.restaurantId.trim();
  const invoiceId = params.invoiceId.trim();
  if (!rid || !invoiceId || !isAuthReady()) {
    throw new SupplierInvoiceError("auth_or_params_unavailable");
  }

  const uid = authUidOrUndefined();
  const invoiceRef = supplierInvoiceDocRef(rid, invoiceId);

  await dbgRunTransaction(
    db,
    async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef);
      if (!invoiceSnap.exists()) {
        throw new SupplierInvoiceError("invoice_not_found");
      }

      const invoice = normalizeSupplierInvoiceDocument(
        invoiceId,
        invoiceSnap.data(),
        rid,
      );
      if (!invoice) {
        throw new SupplierInvoiceError("invoice_invalid");
      }

      if (invoice.status === "recorded") {
        throw new SupplierInvoiceError("already_recorded");
      }

      const applyResults = await applyInventoryCostFromSupplierInvoiceInTransaction({
        transaction,
        restaurantId: rid,
        lines: invoice.lines,
      });

      const failed = applyResults.filter((item) => item.status === "error");
      if (failed.length > 0) {
        throw new SupplierInvoiceError("cost_apply_failed");
      }

      const recordedLines = mergeRecordedSupplierInvoiceLines(invoice.lines, applyResults);

      transaction.update(invoiceRef, {
        status: "recorded",
        lines: recordedLines.map(serializeSupplierInvoiceLine),
        updatedAt: serverTimestamp(),
        ...(uid ? { updatedBy: uid } : {}),
      });
    },
    {
      label: "supplierInvoices:record",
      collection: "supplierInvoices",
      restaurantId: rid,
    },
  );

  void createActivityLog({
    restaurantId: rid,
    type: "supplier_invoice_recorded",
    entityType: "supplierInvoice",
    entityId: invoiceId,
    actorUserId: uid,
    metadata: buildActivityMetadata({
      invoiceId,
      route: "purchases",
    }),
  });

  return { invoiceId };
}

export async function createAndRecordSupplierInvoice(
  params: CreateSupplierInvoiceParams,
): Promise<{ invoiceId: string }> {
  const { invoiceId } = await createSupplierInvoice(params);
  await recordSupplierInvoice({
    restaurantId: params.restaurantId,
    invoiceId,
  });
  return { invoiceId };
}

export async function applyInventoryCostFromSupplierInvoice(params: {
  restaurantId: string;
  lines: SupplierInvoiceDocument["lines"];
}): Promise<ReturnType<typeof applyInventoryCostFromSupplierInvoiceInTransaction>> {
  const rid = params.restaurantId.trim();
  if (!rid || !isAuthReady()) {
    throw new SupplierInvoiceError("auth_or_params_unavailable");
  }

  return dbgRunTransaction(
    db,
    async (transaction) =>
      applyInventoryCostFromSupplierInvoiceInTransaction({
        transaction,
        restaurantId: rid,
        lines: params.lines,
      }),
    {
      label: "supplierInvoices:applyInventoryCost",
      collection: "supplierInvoices",
      restaurantId: rid,
    },
  );
}
