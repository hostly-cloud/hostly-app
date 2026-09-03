import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import {
  DEFAULT_PRODUCT_FAMILY_SPECS,
  isProductFamilyType,
  normalizeProductFamilyName,
  sortProductFamilies,
  type ProductFamilyDocument,
  type ProductFamilyInput,
} from "@/lib/carta/product-family-types";

export function productFamiliesCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "productFamilies");
}

export function productFamilyDocRef(restaurantId: string, familyId: string) {
  return doc(productFamiliesCollectionRef(restaurantId), familyId.trim());
}

function authUidOrThrow(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function readOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

function parseProductFamilyDocument(
  familyId: string,
  raw: unknown,
  restaurantId: string,
): ProductFamilyDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeProductFamilyName(name);
  const type = data.type;
  if (!name || !isProductFamilyType(type)) return null;
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : Date.now();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : 0;

  return {
    id: familyId,
    restaurantId: rid,
    name,
    normalizedName,
    type,
    active: data.active !== false,
    sortOrder,
    createdAt,
    updatedAt,
    ...(readOptionalTrimmed(data.createdBy)
      ? { createdBy: readOptionalTrimmed(data.createdBy) }
      : {}),
    ...(readOptionalTrimmed(data.updatedBy)
      ? { updatedBy: readOptionalTrimmed(data.updatedBy) }
      : {}),
  };
}

export function isDuplicateProductFamilyName(
  families: ProductFamilyDocument[],
  name: string,
  excludeId?: string,
): boolean {
  const norm = normalizeProductFamilyName(name);
  if (!norm) return false;
  const alt = normalizeProductName(name);
  return families.some((f) => {
    if (excludeId && f.id === excludeId) return false;
    return (
      f.normalizedName === norm ||
      normalizeProductFamilyName(f.name) === norm ||
      normalizeProductName(f.name) === alt
    );
  });
}

async function fetchAllFamilies(
  restaurantId: string,
): Promise<ProductFamilyDocument[]> {
  const snap = await getDocs(
    query(
      productFamiliesCollectionRef(restaurantId),
      orderBy("sortOrder", "asc"),
    ),
  );
  const rid = restaurantId.trim();
  const list: ProductFamilyDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseProductFamilyDocument(
      docSnap.id,
      docSnap.data(),
      rid,
    );
    if (parsed) list.push(parsed);
  });
  return sortProductFamilies(list);
}

function buildFamilyPayload(
  restaurantId: string,
  input: ProductFamilyInput,
  uid: string,
  now: number,
  createdAt?: number,
  createdBy?: string,
): Record<string, unknown> {
  const name = input.name.trim();
  return {
    restaurantId: restaurantId.trim(),
    name,
    normalizedName: normalizeProductFamilyName(name),
    type: input.type,
    active: input.active !== false,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : 0,
    createdAt: createdAt ?? now,
    updatedAt: now,
    ...(createdBy ? { createdBy } : { createdBy: uid }),
    updatedBy: uid,
  };
}

/** Crea Bebidas / Comida / Otros si faltan (ids fijos, idempotente). */
export async function ensureDefaultProductFamilies(
  restaurantId: string,
): Promise<number> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) return 0;
  const uid = auth.currentUser?.uid?.trim() ?? "system";
  const now = Date.now();
  let created = 0;

  for (const spec of DEFAULT_PRODUCT_FAMILY_SPECS) {
    const ref = productFamilyDocRef(rid, spec.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(
      ref,
      buildFamilyPayload(
        rid,
        {
          name: spec.name,
          type: spec.type,
          active: true,
          sortOrder: spec.sortOrder,
        },
        uid,
        now,
      ),
    );
    created += 1;
  }
  return created;
}

export function listenProductFamilies(
  restaurantId: string,
  onData: (families: ProductFamilyDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    productFamiliesCollectionRef(rid),
    orderBy("sortOrder", "asc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: ProductFamilyDocument[] = [];
      snap.forEach((docSnap) => {
        const parsed = parseProductFamilyDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) list.push(parsed);
      });
      onData(sortProductFamilies(list));
    },
    (error) => {
      onListenError?.(error);
    },
  );
}

export async function createProductFamily(
  restaurantId: string,
  input: ProductFamilyInput,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const name = input.name.trim();
  if (!name) throw new Error("MISSING_FAMILY_NAME");
  if (!isProductFamilyType(input.type)) throw new Error("INVALID_FAMILY_TYPE");

  const existing = await fetchAllFamilies(rid);
  if (isDuplicateProductFamilyName(existing, name)) {
    throw new Error("DUPLICATE_FAMILY_NAME");
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  const maxSort = existing.reduce((m, f) => Math.max(m, f.sortOrder), -1);
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.floor(input.sortOrder)
      : maxSort + 10;

  const ref = await addDoc(
    productFamiliesCollectionRef(rid),
    buildFamilyPayload(rid, { ...input, name, sortOrder }, uid, now),
  );
  return ref.id;
}

export async function updateProductFamily(
  restaurantId: string,
  familyId: string,
  input: Partial<ProductFamilyInput>,
): Promise<void> {
  const rid = restaurantId.trim();
  const fid = familyId.trim();
  if (!rid || !fid) throw new Error("MISSING_IDS");

  const ref = productFamilyDocRef(rid, fid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("FAMILY_NOT_FOUND");
  const current = parseProductFamilyDocument(fid, snap.data(), rid);
  if (!current) throw new Error("FAMILY_INVALID");

  const nextName =
    typeof input.name === "string" ? input.name.trim() : current.name;
  if (!nextName) throw new Error("MISSING_FAMILY_NAME");
  const nextType = input.type ?? current.type;
  if (!isProductFamilyType(nextType)) throw new Error("INVALID_FAMILY_TYPE");

  const all = await fetchAllFamilies(rid);
  if (isDuplicateProductFamilyName(all, nextName, fid)) {
    throw new Error("DUPLICATE_FAMILY_NAME");
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  await updateDoc(ref, {
    name: nextName,
    normalizedName: normalizeProductFamilyName(nextName),
    type: nextType,
    active: input.active !== undefined ? input.active !== false : current.active,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : current.sortOrder,
    updatedAt: now,
    updatedBy: uid,
  });
}

export async function disableProductFamily(
  restaurantId: string,
  familyId: string,
): Promise<void> {
  await updateProductFamily(restaurantId, familyId, { active: false });
}

export async function enableProductFamily(
  restaurantId: string,
  familyId: string,
): Promise<void> {
  await updateProductFamily(restaurantId, familyId, { active: true });
}

export async function moveProductFamilyOrder(
  restaurantId: string,
  familyId: string,
  direction: "up" | "down",
): Promise<void> {
  const rid = restaurantId.trim();
  const families = await fetchAllFamilies(rid);
  const idx = families.findIndex((f) => f.id === familyId);
  if (idx < 0) throw new Error("FAMILY_NOT_FOUND");
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= families.length) return;

  const current = families[idx]!;
  const neighbor = families[swapIdx]!;
  await updateProductFamily(rid, current.id, {
    sortOrder: neighbor.sortOrder,
  });
  await updateProductFamily(rid, neighbor.id, {
    sortOrder: current.sortOrder,
  });
}
