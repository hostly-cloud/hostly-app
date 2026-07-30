/** Cobro / cierre contable en documentos `orders` (además de estados de flujo como `sent`). */
export type OrderBillStatus = "open" | "paid" | "closed";

export type OrderPaymentMethod = "cash" | "card" | "mixed";

/** Campos mínimos de `orders/{orderId}` usados por TPV / rules (Fase 5E). */
export type OrderDocument = {
  restaurantId?: string;
  items?: unknown[];
  total?: number;
  /** IDs de líneas canceladas en TPV; alimenta isCancellingOrderItemsArray() en rules. */
  cancelledLineIds?: string[];
};

/** Normaliza cancelledLineIds desde Firestore (pedidos legacy sin campo → []). */
export function parseOrderCancelledLineIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * @deprecated LEGACY — sin callers operativos (3B-2A.1).
 * No crea pedidos: la ausencia de `status` contaría como activo en occupancy.
 * Usar `createOpenOrderViaApi` / `handleCreateOpenOrder`.
 */
export const createOrder = async (_params: {
  restaurantId: string;
  items: {
    productId: string;
    nombre: string;
    precio: number;
    quantity: number;
    categoria?: string;
  }[];
  total: number;
  tableId?: string | null;
  tableName?: string | null;
}): Promise<never> => {
  throw new Error(
    "CREATE_ORDER_LEGACY_FORBIDDEN: use create-open API for active table orders",
  );
};
