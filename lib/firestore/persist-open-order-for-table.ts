import type { Firestore } from "firebase/firestore";
import { syncOrderItemsViaApi } from "@/lib/firestore/sync-order-items-via-api";
import type { TableOperatorAssignment } from "@/lib/tpv/table-operator-assignment";

export type PersistOpenOrderForTableParams = {
  restaurantId: string;
  tableId: string;
  tableLabel: string;
  /** Payload ya serializado como guarda `orderLinesToFirestoreItems`. */
  items: Record<string, unknown>[];
  total: number;
  /** Si existe, solo actualiza campos de borrador sin tocar `status` (p. ej. sigue `sent` tras Comanda). */
  existingOrderId: string | null;
  /** Solo en alta nueva: primera asignación de operador TPV. */
  operatorAssignment?: Pick<
    TableOperatorAssignment,
    "assignedOperatorId" | "assignedOperatorName"
  > | null;
};

/**
 * Crea o actualiza `orders/{id}` para borrador / comanda activa en mesa.
 * Las líneas embebidas `items[]` se escriben vía API server-side (Admin SDK).
 * No modifica `orderItems` (eso sigue en `sendLinesToComanda`).
 */
export async function persistOpenOrderForTable(
  _db: Firestore,
  params: PersistOpenOrderForTableParams,
): Promise<string> {
  const {
    tableId,
    tableLabel,
    items,
    existingOrderId,
    operatorAssignment,
  } = params;
  const tid = tableId.trim();

  const result = await syncOrderItemsViaApi({
    operation: existingOrderId?.trim() ? "persist_items" : "create_open",
    orderId: existingOrderId,
    tableId: tid,
    tableLabel,
    items,
    operatorAssignment,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.orderId;
}
