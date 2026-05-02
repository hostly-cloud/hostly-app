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
};
