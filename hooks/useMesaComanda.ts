"use client";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import {
  closeOrderViaApi,
  createOpenOrderViaApi,
  reopenOrderViaApi,
  upsertSaleLinesViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import { firestoreItemsToSaleLineIntents } from "@/lib/firestore/firestore-items-to-sale-intent";
import { updateMesa } from "@/lib/firestore/mesas";
import type { CatalogProduct, ComandaItem, PastOrder } from "@/types/comanda";
import type { Mesa } from "@/types/mesa";
import type { OrderStatus } from "@/types/order";
import type { ComandaOrderStatus, OrderMetaDoc } from "@/utils/comanda";
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

const ORDER_CONFLICT_ERROR = "ORDER_CONFLICT";

const ORDER_STATUS_OPEN: OrderStatus = "open";
const ORDER_STATUS_SENT: OrderStatus = "sent";
const ORDER_STATUS_CLOSED: OrderStatus = "closed";

const OPEN_ORDER_STATUSES = [ORDER_STATUS_OPEN, ORDER_STATUS_SENT] as const;
const CLOSED_ORDER_STATUS = ORDER_STATUS_CLOSED;

function comandaItemsToApiLines(items: ComandaItem[]): Record<string, unknown>[] {
  return items.map((item) => ({
    id: item.id,
    productId: item.id,
    name: item.name,
    qty: item.qty,
    quantity: item.qty,
    price: item.price,
    total: item.price * item.qty,
    status: "pending",
  }));
}

export const useMesaComanda = (mesaId: string, restaurantId?: string | null) => {
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

  const assertNoOrderConflict = (remoteUpdatedAt: number | null | undefined) => {
    if (
      typeof currentOrderUpdatedAt === "number" &&
      typeof remoteUpdatedAt === "number" &&
      remoteUpdatedAt !== currentOrderUpdatedAt
    ) {
      throw new Error(ORDER_CONFLICT_ERROR);
    }
  };

  useEffect(() => {
    if (!mesaId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const ref = doc(db, "mesas", mesaId);

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
  }, [mesaId]);

  useEffect(() => {
    const update = () => {
      setIsNarrowScreen(window.innerWidth < 900);
    };

    update();
    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!mesaId) return;

    setCurrentOrderId(null);
    setItems([]);
    setOrderStatus(null);
    setCurrentOrderUpdatedAt(null);

    const q = query(
      collection(db, "orders"),
      where("mesaId", "==", mesaId),
      where("status", "in", OPEN_ORDER_STATUSES),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setCurrentOrderId(null);
          setItems([]);
          setOrderStatus(null);
          setCurrentOrderUpdatedAt(null);
          return;
        }

        const orderDoc = snapshot.docs[0];
        setCurrentOrderId(orderDoc.id);

        const data = orderDoc.data();
        setCurrentOrderUpdatedAt(
          typeof data.updatedAt === "number" ? data.updatedAt : null,
        );
        setOrderStatus(
          data.status === ORDER_STATUS_SENT ? ORDER_STATUS_SENT : ORDER_STATUS_OPEN,
        );
        setItems(normalizeOpenOrderItems(data));
      },
      (error) => {
        console.error("Error listening open order", error);
      },
    );

    return () => unsubscribe();
  }, [mesaId]);

  useEffect(() => {
    if (!mesaId) {
      setPastOrders([]);
      return;
    }

    const q = query(
      collection(db, "orders"),
      where("mesaId", "==", mesaId),
      where("status", "==", CLOSED_ORDER_STATUS),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) =>
          normalizePastOrder(docSnap.id, docSnap.data()),
        );

        setPastOrders(data);
      },
      (error) => {
        console.error("Error listening past orders", error);
      },
    );

    return () => unsubscribe();
  }, [mesaId]);

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
      const apiItems = comandaItemsToApiLines(items);
      const now = Date.now();

      if (currentOrderId) {
        const snap = await getDoc(doc(db, "orders", currentOrderId));
        const data = snap.exists() ? (snap.data() as OrderMetaDoc) : null;
        const remoteUpdatedAt =
          typeof data?.updatedAt === "number" ? data.updatedAt : null;

        assertNoOrderConflict(remoteUpdatedAt);

        const result = await upsertSaleLinesViaApi({
          orderId: currentOrderId,
          lines: firestoreItemsToSaleLineIntents(apiItems),
          expectedUpdatedAtMs: remoteUpdatedAt ?? undefined,
        });

        if (!result.ok) {
          if (result.error === "VERSION_CONFLICT") {
            throw new Error(ORDER_CONFLICT_ERROR);
          }
          throw new Error(result.error);
        }

        setCurrentOrderUpdatedAt(now);
        setOrderStatus(ORDER_STATUS_OPEN);
      } else {
        const result = await createOpenOrderViaApi({
          tableId: mesaId,
          tableLabel: mesa?.name ?? mesaId,
          lines: firestoreItemsToSaleLineIntents(apiItems),
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        setCurrentOrderId(result.orderId);
        setOrderStatus(ORDER_STATUS_OPEN);
        setCurrentOrderUpdatedAt(now);
      }

      await updateMesa(mesaId, {
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
      const closeResult = await closeOrderViaApi({
        orderId,
        expectedUpdatedAtMs: currentOrderUpdatedAt ?? undefined,
      });
      if (!closeResult.ok) {
        if (closeResult.error === "VERSION_CONFLICT") {
          throw new Error(ORDER_CONFLICT_ERROR);
        }
        throw new Error(closeResult.error);
      }

      setCurrentOrderId(null);
      setItems([]);
      setOrderStatus(null);
      setCurrentOrderUpdatedAt(null);
    } catch (err) {
      if (err instanceof Error && err.message === ORDER_CONFLICT_ERROR) {
        window.alert(
          "La comanda ha cambiado en otro dispositivo. Revisa antes de cerrar.",
        );
        return;
      }

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
      const upsertResult = await upsertSaleLinesViaApi({
        orderId,
        lines: firestoreItemsToSaleLineIntents(comandaItemsToApiLines(items)),
        markSent: true,
        expectedUpdatedAtMs: currentOrderUpdatedAt ?? undefined,
      });
      if (!upsertResult.ok) {
        if (upsertResult.error === "VERSION_CONFLICT") {
          throw new Error(ORDER_CONFLICT_ERROR);
        }
        throw new Error(upsertResult.error);
      }

      setCurrentOrderUpdatedAt(Date.now());
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
      const reopenResult = await reopenOrderViaApi({
        orderId,
        expectedUpdatedAtMs: currentOrderUpdatedAt ?? undefined,
      });
      if (!reopenResult.ok) {
        if (reopenResult.error === "VERSION_CONFLICT") {
          throw new Error(ORDER_CONFLICT_ERROR);
        }
        throw new Error(reopenResult.error);
      }

      setCurrentOrderUpdatedAt(Date.now());
      setOrderStatus(ORDER_STATUS_OPEN);
    } catch (err) {
      if (err instanceof Error && err.message === ORDER_CONFLICT_ERROR) {
        window.alert(
          "La comanda ha cambiado en otro dispositivo. Revisa antes de reabrir edición.",
        );
        return;
      }

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
