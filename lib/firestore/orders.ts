import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/** Cobro / cierre contable en documentos `orders` (además de estados de flujo como `sent`). */
export type OrderBillStatus = "open" | "paid" | "closed";

export type OrderPaymentMethod = "cash" | "card" | "mixed";

export const createOrder = async ({
  restaurantId,
  items,
  total,
  tableId,
  tableName,
}: {
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
}) => {
  await addDoc(collection(db, "orders"), {
    restaurantId,
    items,
    total,
    createdAt: Date.now(),
    tableId: tableId ?? null,
    tableName: tableName ?? null,
  });
};
