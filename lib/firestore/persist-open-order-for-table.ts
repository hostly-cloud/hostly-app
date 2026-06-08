import {
  collection,
  doc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { tableOperatorAssignmentCreateFields } from "@/lib/firestore/table-operator-assignment";
import { dbgAddDoc, dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
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
 * No modifica `orderItems` (eso sigue en `sendLinesToComanda`).
 */
export async function persistOpenOrderForTable(
  db: Firestore,
  params: PersistOpenOrderForTableParams,
): Promise<string> {
  const {
    restaurantId,
    tableId,
    tableLabel,
    items,
    total,
    existingOrderId,
    operatorAssignment,
  } = params;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const tid = tableId.trim();
  const rid = restaurantId.trim();

  if (existingOrderId?.trim()) {
    const id = existingOrderId.trim();
    await dbgUpdateDoc(
      doc(db, "orders", id),
      {
        items,
        total: safeTotal,
        updatedAt: serverTimestamp(),
      },
      {
        label: "persistOpenOrderForTable:update",
        collection: "orders",
        restaurantId: rid,
        tableId: tid,
        orderId: id,
      },
    );
    return id;
  }

  const createPayload = {
    restaurantId: rid,
    tableId: tid,
    table: tableLabel,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    items,
    total: safeTotal,
    ...tableOperatorAssignmentCreateFields(operatorAssignment),
  };
  const ref = await dbgAddDoc(collection(db, "orders"), createPayload, {
    label: "persistOpenOrderForTable:create",
    collection: "orders",
    restaurantId: rid,
    tableId: tid,
  });
  return ref.id;
}
