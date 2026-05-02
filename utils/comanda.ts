import type { CatalogProduct, ComandaItem, PastOrder } from "@/types/comanda";
import type { OrderItem, OrderStatus as BaseOrderStatus } from "@/types/order";

export const calculateOrderTotal = (items: ComandaItem[]) => {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
};

export const calculateItemsCount = (items: ComandaItem[]) => {
  return items.reduce((sum, item) => sum + item.qty, 0);
};

export const getOrderItemsCount = calculateItemsCount;

export const formatOrderDate = (timestamp?: number) => {
  if (!timestamp) return "Sin fecha";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export type ComandaOrderStatus = BaseOrderStatus | null;

export const getOrderStatusLabel = (status: ComandaOrderStatus) => {
  if (status === "sent") return "En cocina";
  if (status === "closed") return "Cerrada";
  if (status === "open") return "Abierta";
  return "Sin comanda";
};

export const getOrderStatusColor = (status: ComandaOrderStatus) => {
  if (status === "sent") return "#2563eb";
  if (status === "closed") return "#6b7280";
  if (status === "open") return "#16a34a";
  return "#374151";
};

export const getBusyLabel = ({
  isSaving,
  isSending,
  isClosing,
  isReopening,
}: {
  isSaving: boolean;
  isSending: boolean;
  isClosing: boolean;
  isReopening: boolean;
}) => {
  if (isSaving) return "Guardando comanda...";
  if (isSending) return "Enviando a cocina...";
  if (isClosing) return "Cerrando mesa...";
  if (isReopening) return "Reabriendo edición...";
  return null;
};

export const getActionHint = ({
  currentOrderId,
  isSentToKitchen,
}: {
  currentOrderId: string | null;
  isSentToKitchen: boolean;
}) => {
  if (!currentOrderId) return "Añade productos y guarda la comanda.";
  if (isSentToKitchen) {
    return "La comanda está en cocina. Puedes cerrar mesa o reabrir edición.";
  }
  return "Puedes editar, guardar cambios o enviar a cocina.";
};

export const mergeComandaItems = (
  currentItems: ComandaItem[],
  incomingItems: ComandaItem[],
): ComandaItem[] => {
  const next = [...currentItems];

  incomingItems.forEach((incomingItem) => {
    const existing = next.find((item) => item.id === incomingItem.id);

    if (existing) {
      existing.qty += incomingItem.qty;
    } else {
      next.push({ ...incomingItem });
    }
  });

  return next;
};

export const updateComandaItemQty = (
  items: ComandaItem[],
  itemId: string,
  delta: number,
): ComandaItem[] => {
  return items
    .map((item) => (item.id === itemId ? { ...item, qty: item.qty + delta } : item))
    .filter((item) => item.qty > 0);
};

export const addProductToComanda = (
  items: ComandaItem[],
  product: CatalogProduct,
): ComandaItem[] => {
  const existing = items.find((item) => item.id === product.id);

  if (existing) {
    return items.map((item) =>
      item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
    );
  }

  return [
    ...items,
    {
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
    },
  ];
};

export const buildOrderItemsForKitchen = ({
  items,
  orderId,
  restaurantId,
  mesaId,
  tableId,
}: {
  items: ComandaItem[];
  orderId: string;
  restaurantId: string | null;
  mesaId: string;
  tableId: string;
}): OrderItem[] => {
  const now = Date.now();

  return items.map((item) => ({
    id: `${orderId}_${item.id}`,
    orderId,
    restaurantId,
    mesaId,
    tableId,
    productId: item.id,
    name: item.name,
    price: item.price,
    qty: item.qty,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }));
};

export type CatalogProductDoc = {
  nombre?: unknown;
  name?: unknown;
  precio?: unknown;
  price?: unknown;
  categoria?: unknown;
  category?: unknown;
};

export const normalizeCatalogProduct = (
  id: string,
  data: CatalogProductDoc,
): CatalogProduct => {
  const nombre =
    typeof data.nombre === "string" && data.nombre.trim().length > 0
      ? data.nombre.trim()
      : typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : "Producto";

  const precio =
    typeof data.precio === "number"
      ? data.precio
      : typeof data.price === "number"
        ? data.price
        : 0;

  const categoria =
    typeof data.categoria === "string" && data.categoria.trim().length > 0
      ? data.categoria.trim()
      : typeof data.category === "string" && data.category.trim().length > 0
        ? data.category.trim()
        : "Otros";

  return {
    id,
    name: nombre,
    price: precio,
    category: categoria,
  };
};

export type PastOrderDoc = {
  total?: unknown;
  createdAt?: unknown;
  items?: unknown;
};

export type OrderMetaDoc = {
  updatedAt?: unknown;
};

export const normalizePastOrder = (id: string, data: PastOrderDoc): PastOrder => {
  return {
    id,
    total: typeof data.total === "number" ? data.total : 0,
    createdAt:
      typeof data.createdAt === "number" ? data.createdAt : undefined,
    items: Array.isArray(data.items) ? (data.items as ComandaItem[]) : [],
  };
};

export type OrderDoc = {
  items?: unknown;
};

export const normalizeOpenOrderItems = (data: OrderDoc): ComandaItem[] => {
  return Array.isArray(data.items) ? (data.items as ComandaItem[]) : [];
};

