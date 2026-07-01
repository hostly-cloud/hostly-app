import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
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
import type { BillingCustomer, BillingCustomerInput } from "@/types/billing-customer";

const COLLECTION = "billingCustomers";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readTsMs(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "string" && v.trim()) {
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBillingCustomerInput(input: BillingCustomerInput): BillingCustomerInput {
  return {
    companyName: input.companyName.trim(),
    taxId: input.taxId.trim(),
    email: input.email.trim(),
    phone: optionalString(input.phone),
    address: optionalString(input.address),
    postalCode: optionalString(input.postalCode),
    city: optionalString(input.city),
    province: optionalString(input.province),
    country: optionalString(input.country),
    notes: optionalString(input.notes),
  };
}

function mapDocToBillingCustomer(d: QueryDocumentSnapshot): BillingCustomer {
  const data = d.data() as Record<string, unknown>;
  const createdAtMs = readTsMs(data, "createdAt");
  const updatedAtMs = readTsMs(data, "updatedAt");
  return {
    id: d.id,
    restaurantId:
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "",
    companyName:
      typeof data.companyName === "string" ? data.companyName.trim() : "",
    taxId: typeof data.taxId === "string" ? data.taxId.trim() : "",
    email: typeof data.email === "string" ? data.email.trim() : "",
    phone: optionalString(data.phone),
    address: optionalString(data.address),
    postalCode: optionalString(data.postalCode),
    city: optionalString(data.city),
    province: optionalString(data.province),
    country: optionalString(data.country),
    notes: optionalString(data.notes),
    createdAt: new Date(createdAtMs).toISOString(),
    updatedAt: new Date(updatedAtMs).toISOString(),
  };
}

function buildFirestorePayload(
  restaurantId: string,
  input: BillingCustomerInput,
  includeTimestamps: "create" | "update",
): DocumentData {
  const normalized = normalizeBillingCustomerInput(input);
  const payload: DocumentData = {
    restaurantId: restaurantId.trim(),
    companyName: normalized.companyName,
    taxId: normalized.taxId,
    email: normalized.email,
    phone: normalized.phone,
    address: normalized.address,
    postalCode: normalized.postalCode,
    city: normalized.city,
    province: normalized.province,
    country: normalized.country,
    notes: normalized.notes,
    updatedAt: serverTimestamp(),
  };
  if (includeTimestamps === "create") {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export function listenBillingCustomers(
  restaurantId: string,
  onData: (items: BillingCustomer[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, COLLECTION), where("restaurantId", "==", rid));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapDocToBillingCustomer);
      list.sort((a, b) =>
        a.companyName.localeCompare(b.companyName, "es", { sensitivity: "base" }),
      );
      onData(list);
    },
    (err) => {
      console.error("listenBillingCustomers Firestore error", err);
      onListenError?.(err);
      onData([]);
    },
  );
}

export async function createBillingCustomerDoc(
  restaurantId: string,
  input: BillingCustomerInput,
): Promise<BillingCustomer> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("createBillingCustomer: restaurantId no disponible");

  const normalized = normalizeBillingCustomerInput(input);
  if (!normalized.companyName) {
    throw new Error("createBillingCustomer: razón social vacía");
  }
  if (!normalized.taxId) {
    throw new Error("createBillingCustomer: CIF/NIF vacío");
  }
  if (!normalized.email) {
    throw new Error("createBillingCustomer: email vacío");
  }

  try {
    const ref = await addDoc(
      collection(db, COLLECTION),
      buildFirestorePayload(rid, normalized, "create"),
    );
    const now = new Date().toISOString();
    return {
      id: ref.id,
      restaurantId: rid,
      ...normalized,
      createdAt: now,
      updatedAt: now,
    };
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function updateBillingCustomerDoc(
  restaurantId: string,
  customerId: string,
  input: BillingCustomerInput,
): Promise<void> {
  const rid = restaurantId.trim();
  const id = customerId.trim();
  if (!rid || !id) {
    throw new Error("updateBillingCustomer: identificadores no disponibles");
  }

  const normalized = normalizeBillingCustomerInput(input);
  if (!normalized.companyName || !normalized.taxId || !normalized.email) {
    throw new Error("updateBillingCustomer: campos obligatorios incompletos");
  }

  try {
    await updateDoc(
      doc(db, COLLECTION, id),
      buildFirestorePayload(rid, normalized, "update"),
    );
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function deleteBillingCustomerDoc(
  restaurantId: string,
  customerId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const id = customerId.trim();
  if (!rid || !id) {
    throw new Error("deleteBillingCustomer: identificadores no disponibles");
  }

  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (e) {
    rethrowWithMessage(e);
  }
}
