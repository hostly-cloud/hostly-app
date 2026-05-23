import type { Firestore } from "firebase-admin/firestore";
import { readCategoryProductFamilyType } from "@/lib/carta/category-product-family";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { readModifierGroupIdsFromRecord } from "@/lib/modifiers/modifier-group-ids";

function readCategoryType(raw: unknown): CartaCategoriaTipo {
  if (raw === "food" || raw === "drink" || raw === "general") return raw;
  return "general";
}

function readIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function mapCategoryDoc(
  restauranteId: string,
  docId: string,
  data: Record<string, unknown>,
): CartaCategoria | null {
  const name =
    typeof data.name === "string"
      ? data.name.trim()
      : typeof data.nombre === "string"
        ? data.nombre.trim()
        : "";
  if (!name) return null;

  const slug =
    typeof data.slug === "string" && data.slug.trim()
      ? data.slug.trim()
      : name.toLowerCase().replace(/\s+/g, "-");
  const modifierGroupIds = readModifierGroupIdsFromRecord(data);

  return {
    id: docId,
    restauranteId,
    name,
    slug,
    type: readCategoryType(data.type),
    cartaFamiliaId:
      typeof data.cartaFamiliaId === "string" && data.cartaFamiliaId.trim()
        ? data.cartaFamiliaId.trim()
        : undefined,
    ...(typeof data.productFamilyId === "string" && data.productFamilyId.trim()
      ? { productFamilyId: data.productFamilyId.trim() }
      : {}),
    ...(typeof data.productFamilyName === "string" && data.productFamilyName.trim()
      ? { productFamilyName: data.productFamilyName.trim() }
      : {}),
    ...(readCategoryProductFamilyType(data.productFamilyType)
      ? { productFamilyType: readCategoryProductFamilyType(data.productFamilyType) }
      : {}),
    ...(modifierGroupIds ? { modifierGroupIds } : {}),
    sortOrder: typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
    isActive: data.isActive !== false,
    createdAt: readIso(data.createdAt),
    updatedAt: readIso(data.updatedAt),
  };
}

/**
 * Carga categorías de carta Hostly con id + nombre (admin SDK).
 */
export async function loadHostlyCartaCategories(
  db: Firestore,
  restaurantId: string,
): Promise<CartaCategoria[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];

  const byId = new Map<string, CartaCategoria>();

  const paths = [
    ["restaurantes", rid, "cartaCategorias"],
    ["restaurants", rid, "cartaCategorias"],
  ] as const;

  for (const [root, docId, sub] of paths) {
    try {
      const snap = await db.collection(root).doc(docId).collection(sub).limit(120).get();
      for (const d of snap.docs) {
        const cat = mapCategoryDoc(rid, d.id, d.data() as Record<string, unknown>);
        if (cat && cat.isActive) byId.set(cat.id, cat);
      }
    } catch {
      /* ignore */
    }
  }

  return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}
