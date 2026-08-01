"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { updateMesa } from "@/lib/firestore/mesas";
import { readOrderUpdatedAtMs } from "@/lib/firestore/order-table-occupancy";
import {
  closeTpvOrderViaApi,
  createOpenOrderViaApi,
  persistDraftItemsViaApi,
  reopenTpvOrderViaApi,
  upsertSaleLinesViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import { pickActiveOrderDocForTable } from "@/lib/tpv/pick-active-order-doc-for-table";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import type { CatalogProduct, ComandaItem, PastOrder } from "@/types/comanda";
import type { Mesa } from "@/types/mesa";
import type { OrderStatus } from "@/types/order";
import type { ComandaOrderStatus } from "@/utils/comanda";
import {
  addProductToComanda,
  calculateItemsCount,
  calculateOrderTotal,
  formatOrderDate,
  getActionHint,
  getBusyLabel,
  getOrderItemsCount,
  getOrderStatusColor,
  getOrderStatusLabel,
  mergeComandaItems,
  normalizeCatalogProduct,
  normalizeOpenOrderItems,
  normalizePastOrder,
  updateComandaItemQty,
} from "@/utils/comanda";

function comandaItemsToSaleLineIntents(items: ComandaItem[]): SaleLineIntent[] {
  return items
    .filter((item) => item.qty > 0 && item.id.trim())
    .map((item) => ({
      lineId: item.id.trim(),
      productId: item.id.trim(),
      quantity: Math.floor(item.qty),
    }));
}

function comandaItemsToDraftFirestoreItems(
  items: ComandaItem[],
): Record<string, unknown>[] {
  return items
    .filter((item) => item.qty > 0 && item.id.trim())
    .map((item) => ({
      id: item.id.trim(),
      productId: item.id.trim(),
      quantity: Math.floor(item.qty),
      qty: Math.floor(item.qty),
      status: "pending",
      name: item.name,
      productName: item.name,
    }));
}

const ORDER_CONFLICT_ERROR = "ORDER_CONFLICT";

const ORDER_STATUS_OPEN: OrderStatus = "open";
const ORDER_STATUS_SENT: OrderStatus = "sent";
const ORDER_STATUS_CLOSED: OrderStatus = "closed";

const OPEN_ORDER_STATUSES = [ORDER_STATUS_OPEN, ORDER_STATUS_SENT] as const;
const CLOSED_ORDER_STATUS = ORDER_STATUS_CLOSED;

/**
 * El param de ruta puede llamarse mesaId por compatibilidad, pero la identidad
 * canónica del pedido es tableId (mismo valor).
 */
function resolveCanonicalTableId(routeMesaId: string): string {
  return routeMesaId.trim();
}

function applyAuthoritativeVersion(updatedAtMs: number | null | undefined): number | null {
  return typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
    ? updatedAtMs
    : null;
}

function buildOrderConstraints(
  field: "tableId" | "mesaId",
  tableId: string,
  restaurantId: string | null | undefined,
  statusConstraint: QueryConstraint,
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [
    where(field, "==", tableId),
    statusConstraint,
  ];
  const rid = restaurantId?.trim();
  if (rid) constraints.unshift(where("restaurantId", "==", rid));
  return constraints;
}

export const useMesaComanda = (mesaId: string, restaurantId?: string | null) => {
  const tableId = resolveCanonicalTableId(mesaId);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ComandaItem[]>([]);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentOrderUpdatedAt, setCurrentOrderUpdatedAt] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<ComandaOrderStatus>(null);
  const [pastOrders, setPastOrders] = useState<PastOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [productSearch, setProductSearch] = useState("");
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  const isSentToKitchen = orderStatus === ORDER_STATUS_SENT;
  const isBusy = isSaving || isSending || isClosing || isReopening;
  const isOrderLocked = isSentToKitchen || isBusy;
  const canSendToKitchen = Boolean(currentOrderId) && items.length > 0 && !isBusy;
  const canSaveOrder = items.length > 0 && !isBusy && !isSentToKitchen;
  const canCloseOrder = Boolean(currentOrderId) && !isBusy;
  const canReopenOrder = Boolean(currentOrderId) && isSentToKitchen && !isBusy;

  useEffect(() => {
    if (!tableId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const ref = doc(db, "mesas", tableId);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setMesa({
            id: snap.id,
            ...(snap.data() as Omit<Mesa, "id">),
          });
        } else {
          setMesa(null);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Error listening mesa", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [tableId]);

  useEffect(() => {
    const update = () => {
      setIsNarrowScreen(window.innerWidth < 900);
    };

    update();
    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!tableId) return;

    setCurrentOrderId(null);
    setItems([]);
    setOrderStatus(null);
    setCurrentOrderUpdatedAt(null);

    let primaryDocs: QueryDocumentSnapshot[] = [];
    let legacyDocs: QueryDocumentSnapshot[] = [];

    const apply = () => {
      const orderDoc = pickActiveOrderDocForTable(tableId, primaryDocs, legacyDocs);
      if (!orderDoc) {
        setCurrentOrderId(null);
        setItems([]);
        setOrderStatus(null);
        setCurrentOrderUpdatedAt(null);
        return;
      }

      setCurrentOrderId(orderDoc.id);
      const data = orderDoc.data();
      setCurrentOrderUpdatedAt(
        applyAuthoritativeVersion(readOrderUpdatedAtMs(data.updatedAt)),
      );
      setOrderStatus(
        data.status === ORDER_STATUS_SENT ? ORDER_STATUS_SENT : ORDER_STATUS_OPEN,
      );
      setItems(normalizeOpenOrderItems(data));
    };

    const statusOpen = where("status", "in", OPEN_ORDER_STATUSES);
    const qPrimary = query(
      collection(db, "orders"),
      ...buildOrderConstraints("tableId", tableId, restaurantId, statusOpen),
    );
    const qLegacy = query(
      collection(db, "orders"),
      ...buildOrderConstraints("mesaId", tableId, restaurantId, statusOpen),
    );

    const unsubPrimary = onSnapshot(
      qPrimary,
      (snapshot) => {
        primaryDocs = snapshot.docs;
        apply();
      },
      (error) => {
        console.error("Error listening open order by tableId", error);
      },
    );
    const unsubLegacy = onSnapshot(
      qLegacy,
      (snapshot) => {
        legacyDocs = snapshot.docs;
        apply();
      },
      (error) => {
        console.error("Error listening open order legacy mesaId", error);
      },
    );

    return () => {
      unsubPrimary();
      unsubLegacy();
    };
  }, [tableId, restaurantId]);

  useEffect(() => {
    if (!tableId) {
      setPastOrders([]);
      return;
    }

    let primaryDocs: QueryDocumentSnapshot[] = [];
    let legacyDocs: QueryDocumentSnapshot[] = [];

    const apply = () => {
      const byId = new Map<string, QueryDocumentSnapshot>();
      for (const d of primaryDocs) byId.set(d.id, d);
      for (const d of legacyDocs) {
        const data = d.data() as { tableId?: unknown };
        const docTableId = String(data.tableId ?? "").trim();
        if (docTableId && docTableId !== tableId) continue;
        if (!byId.has(d.id)) byId.set(d.id, d);
      }
      setPastOrders(
        [...byId.values()].map((docSnap) =>
          normalizePastOrder(docSnap.id, docSnap.data()),
        ),
      );
    };

    const statusClosed = where("status", "==", CLOSED_ORDER_STATUS);
    const qPrimary = query(
      collection(db, "orders"),
      ...buildOrderConstraints("tableId", tableId, restaurantId, statusClosed),
    );
    const qLegacy = query(
      collection(db, "orders"),
      ...buildOrderConstraints("mesaId", tableId, restaurantId, statusClosed),
    );

    const unsubPrimary = onSnapshot(
      qPrimary,
      (snapshot) => {
        primaryDocs = snapshot.docs;
        apply();
      },
      (error) => {
        console.error("Error listening past orders by tableId", error);
      },
    );
    const unsubLegacy = onSnapshot(
      qLegacy,
      (snapshot) => {
        legacyDocs = snapshot.docs;
        apply();
      },
      (error) => {
        console.error("Error listening past orders legacy mesaId", error);
      },
    );

    return () => {
      unsubPrimary();
      unsubLegacy();
    };
  }, [tableId, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    const q = query(
      collection(db, "productos"),
      where("restaurantId", "==", restaurantId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) =>
          normalizeCatalogProduct(docSnap.id, docSnap.data()),
        );

        setProducts(data);
      },
      (error) => {
        console.error("Error listening products", error);
      },
    );

    return () => unsubscribe();
  }, [restaurantId]);

  const addItem = (product: CatalogProduct) => {
    if (isOrderLocked) return;
    setItems((prev) => addProductToComanda(prev, product));
  };

  const updateItemQty = (itemId: string, delta: number) => {
    if (isOrderLocked) return;
    setItems((prev) => updateComandaItemQty(prev, itemId, delta));
  };

  const orderTotal = calculateOrderTotal(items);
  const totalItemsCount = calculateItemsCount(items);

  const handleClearItems = () => {
    if (isOrderLocked) return;

    const confirmed = window.confirm("¿Limpiar la comanda actual?");

    if (!confirmed) return;

    setItems([]);
  };

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRepeatOrder = (orderItems: ComandaItem[]) => {
    if (isSentToKitchen) return;

    setItems((prev) => mergeComandaItems(prev, orderItems));
  };

  const handleSaveOrder = async () => {
    if (!canSaveOrder) return;

    setIsSaving(true);

    try {
      const lines = comandaItemsToSaleLineIntents(items);
      if (lines.length === 0) {
        window.alert("Añade productos antes de guardar la comanda.");
        return;
      }

      if (currentOrderId) {
        const persisted = await persistDraftItemsViaApi({
          orderId: currentOrderId,
          items: comandaItemsToDraftFirestoreItems(items),
          expectedUpdatedAtMs: currentOrderUpdatedAt ?? undefined,
        });
        if (!persisted.ok) {
          if (persisted.error === "VERSION_CONFLICT") {
            throw new Error(ORDER_CONFLICT_ERROR);
          }
          console.error(
            "Error saving order via API",
            persisted.error,
            persisted.details,
          );
          window.alert("No se pudo guardar la comanda. Inténtalo de nuevo.");
          return;
        }
        setCurrentOrderUpdatedAt(applyAuthoritativeVersion(persisted.updatedAtMs));
        setOrderStatus(ORDER_STATUS_OPEN);
      } else {
        const created = await createOpenOrderViaApi({
          tableId,
          tableLabel: mesa?.name ?? tableId,
          lines,
          markSent: false,
        });
        if (!created.ok) {
          console.error("Error creating order via API", created.error, created.details);
          window.alert("No se pudo abrir la comanda. Inténtalo de nuevo.");
          return;
        }

        setCurrentOrderId(created.orderId);
        setOrderStatus(ORDER_STATUS_OPEN);
        setCurrentOrderUpdatedAt(applyAuthoritativeVersion(created.updatedAtMs));
      }

      await updateMesa(tableId, {
        status: "occupied",
      });
    } catch (err) {
      if (err instanceof Error && err.message === ORDER_CONFLICT_ERROR) {
        window.alert(
          "La comanda ha cambiado en otro dispositivo. Revisa antes de guardar.",
        );
        return;
      }

      console.error("Error saving order", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseOrder = async () => {
    if (!canCloseOrder) return;

    const orderId = currentOrderId;
    if (!orderId) return;

    const confirmed = window.confirm("¿Cerrar mesa y liberar la comanda?");
    if (!confirmed) return;

    setIsClosing(true);

    try {
      const closed = await closeTpvOrderViaApi({ orderId });
      if (!closed.ok) {
        console.error("Error closing order", closed.error, closed.details);
        window.alert("No se pudo cerrar la comanda. Inténtalo de nuevo.");
        return;
      }

      await updateMesa(tableId, {
        status: "free",
      });

      setCurrentOrderId(null);
      setItems([]);
      setOrderStatus(null);
      setCurrentOrderUpdatedAt(null);
    } catch (err) {
      console.error("Error closing order", err);
    } finally {
      setIsClosing(false);
    }
  };

  const handleSendToKitchen = async () => {
    if (!canSendToKitchen) return;

    const orderId = currentOrderId;
    if (!orderId) return;

    setIsSending(true);

    try {
      const lines = comandaItemsToSaleLineIntents(items);
      if (lines.length === 0) {
        window.alert("Añade productos antes de enviar a cocina.");
        return;
      }

      const sent = await upsertSaleLinesViaApi({
        orderId,
        lines,
        markSent: true,
        expectedUpdatedAtMs: currentOrderUpdatedAt ?? undefined,
      });
      if (!sent.ok) {
        if (sent.error === "VERSION_CONFLICT") {
          throw new Error(ORDER_CONFLICT_ERROR);
        }
        console.error("Error sending order via API", sent.error, sent.details);
        window.alert("No se pudo enviar a cocina. Inténtalo de nuevo.");
        return;
      }

      setCurrentOrderUpdatedAt(applyAuthoritativeVersion(sent.updatedAtMs));
      setOrderStatus(ORDER_STATUS_SENT);
    } catch (err) {
      if (err instanceof Error && err.message === ORDER_CONFLICT_ERROR) {
        window.alert(
          "La comanda ha cambiado en otro dispositivo. Revisa antes de enviar a cocina.",
        );
        return;
      }

      console.error("Error sending order", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleReopenOrder = async () => {
    if (!canReopenOrder) return;

    const orderId = currentOrderId;
    if (!orderId) return;

    setIsReopening(true);

    try {
      const result = await reopenTpvOrderViaApi({ orderId });
      if (!result.ok) {
        if (result.error === "TABLE_ALREADY_HAS_ACTIVE_ORDER") {
          window.alert(
            "La mesa ya tiene otro pedido activo. No se puede reabrir esta comanda.",
          );
          return;
        }
        console.error("Error reopening order", result.error, result.details);
        return;
      }

      setCurrentOrderUpdatedAt(applyAuthoritativeVersion(result.updatedAtMs));
      setOrderStatus(ORDER_STATUS_OPEN);
    } catch (err) {
      console.error("Error reopening order", err);
    } finally {
      setIsReopening(false);
    }
  };

  const categories = [
    "Todas",
    ...Array.from(new Set(products.map((p) => p.category))).sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
  ];

  const getCategoryCount = (category: string) => {
    if (category === "Todas") return products.length;

    return products.filter((p) => p.category === category).length;
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === "Todas" || p.category === selectedCategory;

    const matchesSearch =
      productSearch.trim().length === 0 ||
      p.name.toLowerCase().includes(productSearch.trim().toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );

  const orderStatusLabel = getOrderStatusLabel(orderStatus);
  const orderStatusColor = getOrderStatusColor(orderStatus);
  const busyLabel = getBusyLabel({
    isSaving,
    isSending,
    isClosing,
    isReopening,
  });
  const actionHint = getActionHint({
    currentOrderId,
    isSentToKitchen,
  });

  return {
    loading,

    // data
    mesa,
    items,
    products,
    pastOrders,

    // ui state
    selectedCategory,
    setSelectedCategory,
    productSearch,
    setProductSearch,
    isNarrowScreen,

    // derived
    categories,
    sortedProducts,
    totalItemsCount,
    orderTotal,

    orderStatus,
    orderStatusLabel,
    orderStatusColor,
    busyLabel,
    actionHint,

    isOrderLocked,
    isBusy,

    canSaveOrder,
    canSendToKitchen,
    canCloseOrder,
    canReopenOrder,

    // extra (needed by page JSX; same behavior as before)
    currentOrderId,
    isSentToKitchen,
    isSaving,
    isSending,
    isClosing,
    isReopening,

    // handlers
    addItem,
    updateItemQty,
    handleClearItems,
    handleSaveOrder,
    handleSendToKitchen,
    handleCloseOrder,
    handleReopenOrder,
    handleRepeatOrder,
    handleScrollTop,

    // utils passthrough
    getCategoryCount,
    formatOrderDate,
    getOrderItemsCount,
  };
};
