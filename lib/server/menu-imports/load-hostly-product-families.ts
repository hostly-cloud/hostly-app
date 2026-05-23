import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_PRODUCT_FAMILY_SPECS,
  isProductFamilyType,
  normalizeProductFamilyName,
  sortProductFamilies,
  type ProductFamilyDocument,
  type ProductFamilyType,
} from "@/lib/carta/product-family-types";

function readMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.getTime();
  }
  return Date.now();
}

function mapFamilyDoc(
  restaurantId: string,
  docId: string,
  data: Record<string, unknown>,
): ProductFamilyDocument | null {
  const name =
    typeof data.name === "string" && data.name.trim() ? data.name.trim() : "";
  const type = data.type;
  if (!name || !isProductFamilyType(type)) return null;
  const createdAt = readMs(data.createdAt);
  const updatedAt = readMs(data.updatedAt);
  return {
    id: docId,
    restaurantId: restaurantId.trim(),
    name,
    normalizedName:
      typeof data.normalizedName === "string" && data.normalizedName.trim()
        ? data.normalizedName.trim()
        : normalizeProductFamilyName(name),
    type,
    active: data.active !== false,
    sortOrder:
      typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
        ? Math.floor(data.sortOrder)
        : 0,
    createdAt,
    updatedAt,
  };
}

async function ensureDefaultsAdmin(
  db: Firestore,
  restaurantId: string,
  userId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const now = Date.now();
  const coll = db.collection("restaurants").doc(rid).collection("productFamilies");

  for (const spec of DEFAULT_PRODUCT_FAMILY_SPECS) {
    const ref = coll.doc(spec.id);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({
      restaurantId: rid,
      name: spec.name,
      normalizedName: normalizeProductFamilyName(spec.name),
      type: spec.type,
      active: true,
      sortOrder: spec.sortOrder,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    });
  }
}

/** Carga familias de producto (admin); crea defaults en `restaurants/{id}` si faltan. */
export async function loadHostlyProductFamilies(
  db: Firestore,
  restaurantId: string,
  options?: { ensureDefaults?: boolean; userId?: string },
): Promise<ProductFamilyDocument[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];

  if (options?.ensureDefaults !== false) {
    await ensureDefaultsAdmin(db, rid, options?.userId?.trim() || "system");
  }

  const byId = new Map<string, ProductFamilyDocument>();
  const paths = [
    ["restaurants", rid, "productFamilies"],
    ["restaurantes", rid, "productFamilies"],
  ] as const;

  for (const [root, docId, sub] of paths) {
    try {
      const snap = await db
        .collection(root)
        .doc(docId)
        .collection(sub)
        .orderBy("sortOrder", "asc")
        .get();
      for (const d of snap.docs) {
        const parsed = mapFamilyDoc(rid, d.id, d.data() as Record<string, unknown>);
        if (parsed) byId.set(parsed.id, parsed);
      }
    } catch {
      /* ignore */
    }
  }

  return sortProductFamilies([...byId.values()]);
}

export type { ProductFamilyType };
