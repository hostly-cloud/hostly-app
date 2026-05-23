export type TpvRecentProductEntry = {
  productId: string;
  productName: string;
  sentAt: number;
};

const STORAGE_PREFIX = "hostly.tpv.recentProducts";
export const TPV_RECENT_PRODUCTS_MAX = 8;

function storageKey(restaurantId: string): string {
  return `${STORAGE_PREFIX}.${restaurantId.trim()}`;
}

export function readTpvRecentProducts(restaurantId: string): TpvRecentProductEntry[] {
  const rid = restaurantId.trim();
  if (!rid || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(rid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is TpvRecentProductEntry =>
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as TpvRecentProductEntry).productId === "string" &&
          typeof (entry as TpvRecentProductEntry).productName === "string",
      )
      .slice(0, TPV_RECENT_PRODUCTS_MAX);
  } catch {
    return [];
  }
}

export function recordTpvRecentProducts(
  restaurantId: string,
  products: ReadonlyArray<{ productId: string; productName: string }>,
): TpvRecentProductEntry[] {
  const rid = restaurantId.trim();
  if (!rid || typeof window === "undefined" || products.length === 0) {
    return readTpvRecentProducts(rid);
  }

  const now = Date.now();
  const existing = readTpvRecentProducts(rid).filter(
    (entry) => !products.some((p) => p.productId === entry.productId),
  );

  const incoming: TpvRecentProductEntry[] = products.map((p) => ({
    productId: p.productId.trim(),
    productName: p.productName.trim() || "Producto",
    sentAt: now,
  }));

  const merged = [...incoming, ...existing].slice(0, TPV_RECENT_PRODUCTS_MAX);

  try {
    window.sessionStorage.setItem(storageKey(rid), JSON.stringify(merged));
  } catch {
    // sessionStorage full or unavailable
  }

  return merged;
}
