import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import type {
  BillingCompanySnapshot,
  BillingInvoice,
  BillingInvoiceLineSnapshot,
  BillingInvoiceStatus,
  BillingRestaurantSnapshot,
} from "@/types/billing-invoice";

const COLLECTION = "billingInvoices";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readTsIso(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  if (v == null) return null;
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return null;
}

function parseStatus(v: unknown): BillingInvoiceStatus {
  if (v === "draft" || v === "generated" || v === "sent" || v === "cancelled") {
    return v;
  }
  return "draft";
}

function parseCompanySnapshot(raw: unknown): BillingCompanySnapshot {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    companyName: typeof data.companyName === "string" ? data.companyName : "",
    taxId: typeof data.taxId === "string" ? data.taxId : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : null,
    address: typeof data.address === "string" ? data.address : null,
    postalCode: typeof data.postalCode === "string" ? data.postalCode : null,
    city: typeof data.city === "string" ? data.city : null,
    province: typeof data.province === "string" ? data.province : null,
    country: typeof data.country === "string" ? data.country : null,
  };
}

function parseRestaurantSnapshot(raw: unknown): BillingRestaurantSnapshot {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof data.name === "string" ? data.name : "",
    taxId: typeof data.taxId === "string" ? data.taxId : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    address: typeof data.address === "string" ? data.address : "",
    city: typeof data.city === "string" ? data.city : "",
    country: typeof data.country === "string" ? data.country : "",
    currency: typeof data.currency === "string" ? data.currency : "EUR",
  };
}

function parseLinesSnapshot(raw: unknown): BillingInvoiceLineSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const line = entry as Record<string, unknown>;
      const lineId = typeof line.lineId === "string" ? line.lineId : "";
      const name = typeof line.name === "string" ? line.name : "";
      const quantity =
        typeof line.quantity === "number" && Number.isFinite(line.quantity)
          ? line.quantity
          : 0;
      const unitPrice =
        typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice)
          ? line.unitPrice
          : 0;
      const lineTotal =
        typeof line.lineTotal === "number" && Number.isFinite(line.lineTotal)
          ? line.lineTotal
          : 0;
      if (!lineId && !name) return null;
      return {
        lineId,
        name,
        quantity,
        unitPrice,
        lineTotal,
        ...(line.isComped === true ? { isComped: true } : {}),
      };
    })
    .filter((line): line is BillingInvoiceLineSnapshot => line != null);
}

function mapDocToBillingInvoice(d: QueryDocumentSnapshot): BillingInvoice {
  const data = d.data() as Record<string, unknown>;
  const createdAt = readTsIso(data, "createdAt") ?? new Date().toISOString();
  const updatedAt = readTsIso(data, "updatedAt") ?? createdAt;

  return {
    id: d.id,
    restaurantId:
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "",
    billingCustomerId:
      typeof data.billingCustomerId === "string" ? data.billingCustomerId.trim() : "",
    orderId: typeof data.orderId === "string" ? data.orderId : null,
    tableId: typeof data.tableId === "string" ? data.tableId : null,
    invoiceNumber:
      typeof data.invoiceNumber === "string" ? data.invoiceNumber.trim() : "",
    invoiceSeries:
      typeof data.invoiceSeries === "string" ? data.invoiceSeries.trim() : "",
    status: parseStatus(data.status),
    companySnapshot: parseCompanySnapshot(data.companySnapshot),
    restaurantSnapshot: parseRestaurantSnapshot(data.restaurantSnapshot),
    linesSnapshot: parseLinesSnapshot(data.linesSnapshot),
    subtotal:
      typeof data.subtotal === "number" && Number.isFinite(data.subtotal)
        ? data.subtotal
        : 0,
    taxes: typeof data.taxes === "number" && Number.isFinite(data.taxes) ? data.taxes : 0,
    total: typeof data.total === "number" && Number.isFinite(data.total) ? data.total : 0,
    currency: typeof data.currency === "string" ? data.currency : "EUR",
    paymentMethod:
      typeof data.paymentMethod === "string" ? data.paymentMethod.trim() : "",
    createdAt,
    updatedAt,
    generatedAt: readTsIso(data, "generatedAt"),
    sentAt: readTsIso(data, "sentAt"),
  };
}

export function listenBillingInvoicesByCustomer(
  restaurantId: string,
  billingCustomerId: string,
  onData: (items: BillingInvoice[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  const cid = billingCustomerId.trim();
  if (!rid || !cid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, COLLECTION),
    where("restaurantId", "==", rid),
    where("billingCustomerId", "==", cid),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapDocToBillingInvoice);
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (err) => {
      console.error("listenBillingInvoicesByCustomer Firestore error", err);
      onListenError?.(err);
      onData([]);
    },
  );
}

export type PersistBillingInvoiceInput = {
  restaurantId: string;
  billingCustomerId: string;
  orderId: string | null;
  tableId: string | null;
  invoiceNumber: string;
  invoiceSeries: string;
  status: BillingInvoiceStatus;
  companySnapshot: BillingCompanySnapshot;
  restaurantSnapshot: BillingRestaurantSnapshot;
  linesSnapshot: BillingInvoiceLineSnapshot[];
  subtotal: number;
  taxes: number;
  total: number;
  currency: string;
  paymentMethod: string;
  generatedAt?: string | null;
  sentAt?: string | null;
};

export async function persistBillingInvoiceDoc(
  input: PersistBillingInvoiceInput,
): Promise<BillingInvoice> {
  const rid = input.restaurantId.trim();
  if (!rid) throw new Error("persistBillingInvoice: restaurantId vacío");

  const payload: DocumentData = {
    restaurantId: rid,
    billingCustomerId: input.billingCustomerId.trim(),
    orderId: input.orderId,
    tableId: input.tableId,
    invoiceNumber: input.invoiceNumber,
    invoiceSeries: input.invoiceSeries,
    status: input.status,
    companySnapshot: input.companySnapshot,
    restaurantSnapshot: input.restaurantSnapshot,
    linesSnapshot: input.linesSnapshot,
    subtotal: input.subtotal,
    taxes: input.taxes,
    total: input.total,
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    generatedAt:
      input.status === "generated" || input.generatedAt
        ? serverTimestamp()
        : null,
    sentAt: input.sentAt ? serverTimestamp() : null,
  };

  try {
    const ref = await addDoc(collection(db, COLLECTION), payload);
    const now = new Date().toISOString();
    return {
      id: ref.id,
      restaurantId: rid,
      billingCustomerId: input.billingCustomerId.trim(),
      orderId: input.orderId,
      tableId: input.tableId,
      invoiceNumber: input.invoiceNumber,
      invoiceSeries: input.invoiceSeries,
      status: input.status,
      companySnapshot: input.companySnapshot,
      restaurantSnapshot: input.restaurantSnapshot,
      linesSnapshot: input.linesSnapshot,
      subtotal: input.subtotal,
      taxes: input.taxes,
      total: input.total,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      createdAt: now,
      updatedAt: now,
      generatedAt: input.generatedAt ?? now,
      sentAt: input.sentAt ?? null,
    };
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function markBillingInvoiceSent(invoiceId: string): Promise<void> {
  const id = invoiceId.trim();
  if (!id) throw new Error("markBillingInvoiceSent: id vacío");
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      status: "sent",
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function getBillingInvoiceById(
  invoiceId: string,
): Promise<BillingInvoice | null> {
  const id = invoiceId.trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return mapDocToBillingInvoice(snap as QueryDocumentSnapshot);
}
