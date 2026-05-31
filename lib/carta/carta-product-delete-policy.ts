import { collection, getDocs, limit, query, where } from "firebase/firestore";
import type { EscandalloMetaMap } from "@/lib/platos-escandallo-bridge";
import type { ProductDocument } from "@/lib/firestore/products";
import { db } from "@/lib/firebase/client";
import type { PlatoCarta } from "@/lib/platos-local";

function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DISPOSABLE_PRODUCT_NAMES = new Set([
  "nuevo producto",
  "new product",
  "new sale item",
]);

const GENERAL_CATEGORY_KEYS = new Set(["general", "sin categoria", "sin categoría", ""]);

export function centralProductHasRecipeDependency(doc: ProductDocument | undefined): boolean {
  if (!doc?.recipe?.enabled) return false;
  return (doc.recipe.ingredients?.length ?? 0) > 0;
}

export function isDisposableTestCartaProduct(
  p: PlatoCarta,
  meta: EscandalloMetaMap,
  tieneEscandallo: (plato: PlatoCarta, escMeta: EscandalloMetaMap) => boolean,
  centralDoc?: ProductDocument,
): boolean {
  if (tieneEscandallo(p, meta)) return false;
  if (centralProductHasRecipeDependency(centralDoc)) return false;

  const precio =
    typeof p.precioVenta === "number" && Number.isFinite(p.precioVenta) ? p.precioVenta : 0;
  if (precio !== 0) return false;

  const catKey = normalizeText(p.categoria ?? "");
  if (!GENERAL_CATEGORY_KEYS.has(catKey)) return false;

  const nameKey = normalizeText(p.nombre ?? "");
  return DISPOSABLE_PRODUCT_NAMES.has(nameKey);
}

export async function centralSaleProductHasOrderUsage(
  restaurantId: string,
  productId: string,
): Promise<boolean> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) return false;

  try {
    const snap = await getDocs(
      query(collection(db, "orders"), where("restaurantId", "==", rid), limit(120)),
    );
    for (const docSnap of snap.docs) {
      const items = docSnap.data().items;
      if (!Array.isArray(items)) continue;
      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as { productId?: unknown };
        if (typeof row.productId === "string" && row.productId.trim() === pid) {
          return true;
        }
      }
    }
    return false;
  } catch {
    // Ante duda, conservar histórico (solo desactivar).
    return true;
  }
}

export type CartaProductDeleteDecision =
  | { action: "delete"; reason: "disposable_test" | "no_dependencies" }
  | { action: "deactivate"; reason: "has_dependencies" };

export async function resolveCartaProductDeleteAction(args: {
  p: PlatoCarta;
  meta: EscandalloMetaMap;
  centralDoc?: ProductDocument;
  restaurantId: string;
  tieneEscandallo: (plato: PlatoCarta, escMeta: EscandalloMetaMap) => boolean;
}): Promise<CartaProductDeleteDecision> {
  const { p, meta, centralDoc, restaurantId, tieneEscandallo } = args;

  if (isDisposableTestCartaProduct(p, meta, tieneEscandallo, centralDoc)) {
    return { action: "delete", reason: "disposable_test" };
  }

  if (tieneEscandallo(p, meta) || centralProductHasRecipeDependency(centralDoc)) {
    return { action: "deactivate", reason: "has_dependencies" };
  }

  const hasOrders = await centralSaleProductHasOrderUsage(restaurantId, p.id);
  if (hasOrders) {
    return { action: "deactivate", reason: "has_dependencies" };
  }

  return { action: "delete", reason: "no_dependencies" };
}
