export type OrderSource = "mesa" | "tpv" | "delivery";

export type OrderStatus = "open" | "sent" | "closed";

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served";

export type OrderItem = {
  id: string;
  orderId: string;
  restaurantId: string | null;
  mesaId: string;
  tableId: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  status: OrderItemStatus;
  createdAt: number;
  updatedAt: number;
  /** Trazabilidad KDS (fase 1); routing sigue por heurística si falta. */
  station?: "kitchen" | "bar" | "cocktail" | "none";
  preparationArea?: "cocina" | "barra" | "cocteleria" | "none";
  /** Estación operativa configurable (metadata; filtro KDS legacy sigue por `station`). */
  operationStationId?: string;
  operationStationName?: string;
  categoryName?: string;
};
