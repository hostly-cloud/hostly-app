import type { Firestore } from "firebase-admin/firestore";
import {
  compareProductDocuments,
  readProductSortOrder,
} from "@/lib/carta/product-sort-order";
import type { ProductDocument } from "@/lib/firestore/products";

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readTsMs(data: Record<string, unknown>, key: string): number | undefined {
  const c = data[key];
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (c && typeof c === "object" && "toMillis" in c && typeof (c as { toMillis: () => number }).toMillis === "function") {
    return (c as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function mapAdminProductDoc(docId: string, data: Record<string, unknown>): ProductDocument | null {
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : typeof data.nombre === "string" && data.nombre.trim()
        ? data.nombre.trim()
        : "";
  if (!name) return null;

  const inventoryRaw =
    data.inventory && typeof data.inventory === "object" ? (data.inventory as Record<string, unknown>) : {};

  const stationRaw =
    typeof data.station === "string" && data.station.trim()
      ? data.station.trim()
      : typeof data.preparationArea === "string" && data.preparationArea.trim()
        ? data.preparationArea.trim()
        : null;

  const categoryName =
    typeof data.categoryName === "string" && data.categoryName.trim()
      ? data.categoryName.trim()
      : typeof data.categoria === "string" && data.categoria.trim()
        ? data.categoria.trim()
        : null;
  const visibleOnMenu =
    typeof data.visibleOnMenu === "boolean" ? data.visibleOnMenu : undefined;
  const tipoVenta =
    typeof data.tipoVenta === "string" && data.tipoVenta.trim()
      ? data.tipoVenta.trim()
      : null;
  const sortOrder =
    readProductSortOrder(data.sortOrder) ??
    readProductSortOrder(data.ordenEnCategoria);
  const imageUrl =
    typeof data.imageUrl === "string" && data.imageUrl.trim()
      ? data.imageUrl.trim()
      : undefined;
  const imagePath =
    typeof data.imagePath === "string" && data.imagePath.trim()
      ? data.imagePath.trim()
      : undefined;

  return {
    id: docId,
    name,
    categoryId:
      typeof data.categoryId === "string" && data.categoryId.trim() ? data.categoryId.trim() : null,
    categoryName,
    price: readFiniteNumber(data.price) ?? readFiniteNumber(data.precio),
    active: data.active !== false,
    station: stationRaw,
    type: typeof data.type === "string" ? data.type : null,
    tipoVenta,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(visibleOnMenu !== undefined ? { visibleOnMenu } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(imagePath ? { imagePath } : {}),
    inventory: {
      enabled: inventoryRaw.enabled === true,
      unit: "ud",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
    },
    recipe: { enabled: false, ingredients: [] },
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
  };
}

/**
 * Lee productos del catálogo central (solo lectura, admin SDK).
 */
export async function loadCentralProductsAdmin(
  db: Firestore,
  restaurantId: string,
): Promise<ProductDocument[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];

  try {
    const snap = await db.collection("restaurants").doc(rid).collection("products").limit(500).get();
    const out: ProductDocument[] = [];
    for (const d of snap.docs) {
      const mapped = mapAdminProductDoc(d.id, d.data() as Record<string, unknown>);
      if (mapped) out.push(mapped);
    }
    return out.sort(compareProductDocuments);
  } catch {
    return [];
  }
}
