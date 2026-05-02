"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { db } from "@/lib/firebase/client";
import type { OrderItem } from "@/types/order";

function getElapsedMinutes(timestamp: number) {
  return Math.floor((Date.now() - timestamp) / 60000);
}

function getPriorityColor(minutes: number) {
  if (minutes >= 20) return "bg-red-500";
  if (minutes >= 10) return "bg-yellow-500";
  return "bg-green-500";
}

function isNewItem(createdAt: number) {
  const diff = Date.now() - createdAt;
  return diff <= 2 * 60 * 1000;
}

function sortItemsSmart(items: OrderItem[]) {
  return [...items].sort((a, b) => {
    const isNewA = isNewItem(a.createdAt);
    const isNewB = isNewItem(b.createdAt);
    if (isNewA && !isNewB) return -1;
    if (!isNewA && isNewB) return 1;
    return a.createdAt - b.createdAt;
  });
}

function isReadyOld(item: OrderItem) {
  if (item.status !== "ready") return false;
  return Date.now() - item.updatedAt >= 2 * 60 * 1000;
}

function getReadyRemainingSeconds(item: OrderItem) {
  if (item.status !== "ready") return null;
  const diff = Date.now() - item.updatedAt;
  const remaining = Math.max(0, 120 - Math.floor(diff / 1000));
  return remaining;
}

function countCompletedLast15min(items: OrderItem[]) {
  const now = Date.now();

  return items.filter((item) => {
    if (item.status !== "ready") return false;
    return now - item.updatedAt <= 15 * 60 * 1000;
  }).length;
}

function getKitchenStation(item: OrderItem) {
  const category = ((item as any).categoryName || (item as any).category || "")
    .toLowerCase()
    .trim();
  if (
    category.includes("caliente") ||
    category.includes("cocina") ||
    category.includes("principal") ||
    category.includes("carne") ||
    category.includes("pescado")
  ) {
    return "Caliente";
  }
  if (
    category.includes("frío") ||
    category.includes("frio") ||
    category.includes("ensalada") ||
    category.includes("postre")
  ) {
    return "Frío";
  }
  if (
    category.includes("bebida") ||
    category.includes("bar") ||
    category.includes("cocktail") ||
    category.includes("coctel")
  ) {
    return "Bebidas";
  }
  return "Otros";
}

function groupItemsByStation(items: OrderItem[]) {
  return items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const station = getKitchenStation(item);
    if (!acc[station]) acc[station] = [];
    acc[station]!.push(item);
    return acc;
  }, {});
}

function getStationPriority(station: string) {
  if (station === "Bebidas") return 1;
  if (station === "Frío") return 2;
  if (station === "Caliente") return 3;
  return 4;
}

function getStationColor(station: string) {
  if (station === "Bebidas") return "bg-blue-500";
  if (station === "Frío") return "bg-cyan-500";
  if (station === "Caliente") return "bg-orange-500";
  return "bg-gray-400";
}

function getResumeCountdown(lastInteraction: number) {
  const diff = Date.now() - lastInteraction;
  const remaining = Math.max(0, 10 - Math.floor(diff / 1000));
  return remaining;
}

function getETAForOrder(itemsCount: number, throughputPer15min: number) {
  if (throughputPer15min === 0) return null;
  const itemsPerMinute = throughputPer15min / 15;
  if (itemsPerMinute === 0) return null;
  const minutes = Math.ceil(itemsCount / itemsPerMinute);
  return minutes;
}

function getDelayStatus(orderMinutes: number, eta: number | null) {
  if (!eta) return null;
  const diff = orderMinutes - eta;
  if (diff >= 5) return "high";
  if (diff >= 2) return "medium";
  return "ok";
}

function countHighDelayOrders(orders: [string, OrderItem[]][], throughput: number) {
  return orders.filter(([_, items]) => {
    const oldest = items.reduce(
      (min, item) => (item.createdAt < min ? item.createdAt : min),
      items[0]!.createdAt,
    );
    const orderMinutes = Math.floor((Date.now() - oldest) / 60000);
    const eta = getETAForOrder(items.length, throughput);
    const delayStatus = getDelayStatus(orderMinutes, eta);
    return delayStatus === "high";
  }).length;
}

function getOrderTypeLabel(type?: string) {
  if (type === "delivery") return "DELIVERY";
  if (type === "takeaway") return "TAKEAWAY";
  return "SALA";
}

function getOrderTypeColor(type?: string) {
  if (type === "delivery") return "bg-purple-600";
  if (type === "takeaway") return "bg-blue-600";
  return "bg-gray-700";
}

function getOrderLabel(items: OrderItem[]) {
  const first = items[0];
  const f = first as any;
  if (f?.tableName) return `Mesa ${f.tableName}`;
  if (f?.tableNumber) return `Mesa ${f.tableNumber}`;
  if (f?.customerName) return f.customerName;
  return "Pedido";
}

function getAverageOrderMinutes(orders: [string, OrderItem[]][]) {
  if (orders.length === 0) return 0;
  const total = orders.reduce((sum, [_, items]) => {
    const oldest = items.reduce(
      (min, item) => (item.createdAt < min ? item.createdAt : min),
      items[0]!.createdAt,
    );
    return sum + Math.floor((Date.now() - oldest) / 60000);
  }, 0);
  return Math.round(total / orders.length);
}

function isHighLoad(avgMinutes: number) {
  return avgMinutes >= 15;
}

function isCriticalOrder(items: OrderItem[]) {
  const oldest = items.reduce(
    (min, item) => (item.createdAt < min ? item.createdAt : min),
    items[0]!.createdAt,
  );

  const minutes = Math.floor((Date.now() - oldest) / 60000);
  return minutes >= 20;
}

function countCriticalOrders(orders: [string, OrderItem[]][]) {
  return orders.filter(([_, items]) => {
    const oldest = items.reduce(
      (min, item) => (item.createdAt < min ? item.createdAt : min),
      items[0]!.createdAt,
    );

    const minutes = Math.floor((Date.now() - oldest) / 60000);
    return minutes >= 20;
  }).length;
}

function groupByOrder(items: OrderItem[]): Record<string, OrderItem[]> {
  return items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    if (!acc[item.orderId]) acc[item.orderId] = [];
    acc[item.orderId]!.push(item);
    return acc;
  }, {});
}

function getOrderElapsedMinutes(items: OrderItem[]): number {
  if (items.length === 0) return 0;
  const oldest = items.reduce(
    (min, item) => (item.createdAt < min ? item.createdAt : min),
    items[0]!.createdAt,
  );
  return Math.floor((Date.now() - oldest) / 60000);
}

function getOldestOrderId(grouped: Record<string, OrderItem[]>): string | null {
  let oldestOrderId: string | null = null;
  let oldestTime = Infinity;
  Object.entries(grouped).forEach(([orderId, ticketItems]) => {
    if (ticketItems.length === 0) return;
    const oldestItemTime = ticketItems.reduce(
      (min, item) => (item.createdAt < min ? item.createdAt : min),
      ticketItems[0]!.createdAt,
    );
    if (oldestItemTime < oldestTime) {
      oldestTime = oldestItemTime;
      oldestOrderId = orderId;
    }
  });
  return oldestOrderId;
}

function sortByUrgency(items: any[]) {
  return [...items].sort((a, b) => {
    const aMinutes = getMinutesSince(a.sentAt);
    const bMinutes = getMinutesSince(b.sentAt);
    return bMinutes - aMinutes;
  });
}

function getMinutesSince(timestamp?: number) {
  if (!timestamp) return 0;
  return Math.floor((Date.now() - timestamp) / 60000);
}

const MAX_ALERTED_ITEMS = 200;

function formatIncomingCount(count: number) {
  if (count > 99) return "99+";
  return String(count);
}

function getMostUrgentItemId(items: any[]) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => {
    const aMinutes = getMinutesSince(a.sentAt);
    const bMinutes = getMinutesSince(b.sentAt);
    return bMinutes - aMinutes;
  });
  return sorted[0]?.id || null;
}

function isCriticalItem(item: any) {
  const minutes = getMinutesSince(item.sentAt);
  return minutes >= 20;
}

function getUrgencyColor(minutes: number) {
  if (minutes >= 20) return "text-red-600";
  if (minutes >= 10) return "text-orange-500";
  return "text-gray-500";
}

function getAdjacentItemId(
  currentId: string,
  items: any[],
  direction: "up" | "down",
) {
  const index = items.findIndex((i) => i.id === currentId);
  if (index === -1) return null;
  if (direction === "up" && index > 0) {
    return items[index - 1].id;
  }
  if (direction === "down" && index < items.length - 1) {
    return items[index + 1].id;
  }
  return null;
}

function getNextItemId(currentId: string, items: any[]) {
  const index = items.findIndex((i) => i.id === currentId);
  if (index === -1) return null;
  if (index + 1 >= items.length) return null;
  return items[index + 1].id;
}

function isElementInViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.bottom <= window.innerHeight
  );
}

function sortOrdersByOldest(
  grouped: Record<string, OrderItem[]>,
): [string, OrderItem[]][] {
  return Object.entries(grouped).sort((a, b) => {
    const getOldest = (lineItems: OrderItem[]) =>
      lineItems.reduce(
        (min, item) => (item.createdAt < min ? item.createdAt : min),
        lineItems[0]!.createdAt,
      );
    return getOldest(a[1]) - getOldest(b[1]);
  });
}

export default function CocinaPage() {
  const { restaurantId, ready } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [, setNow] = useState(Date.now());
  let globalHighLoad = false;
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_dark_mode") === "true";
    }
    return false;
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_sound") !== "false";
    }
    return true;
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "preparing">("all");
  const [urgentOnly, setUrgentOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_urgent_only") === "true";
    }
    return false;
  });

  const [urgentMinutes, setUrgentMinutes] = useState(() => {
    if (typeof window !== "undefined") {
      const value = localStorage.getItem("kds_urgent_minutes");
      return value ? Number(value) : 10;
    }
    return 10;
  });
  const [hiddenReadyIds, setHiddenReadyIds] = useState<string[]>([]);
  const [showReady, setShowReady] = useState(false);
  const [focusMode, setFocusMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_focus_mode") === "true";
    }
    return false;
  });
  const [focusedItemId, setFocusedItemId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_focused_item") || null;
    }
    return null;
  });
  const [focusFlash, setFocusFlash] = useState(false);
  const [lockFocus, setLockFocus] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_lock_focus") === "true";
    }
    return false;
  });
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_compact_mode") === "true";
    }
    return false;
  });
  const [stationFilter, setStationFilter] = useState<
    "all" | "Bebidas" | "Frío" | "Caliente" | "Otros"
  >("all");
  const [quickStationFilter, setQuickStationFilter] = useState<
    "all" | "cocina" | "barra" | "cocteleria"
  >("all");
  const [autoRotate, setAutoRotate] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_auto_rotate") === "true";
    }
    return false;
  });
  const [stationView, setStationView] = useState<null | "Bebidas" | "Frío" | "Caliente" | "Otros">(
    () => {
      if (typeof window !== "undefined") {
        const value = localStorage.getItem("kds_station_view");
        return value ? (value as any) : null;
      }
      return null;
    },
  );
  const [nextStationPreview, setNextStationPreview] = useState<
    null | "Bebidas" | "Frío" | "Caliente" | "Otros"
  >(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastInteraction, setLastInteraction] = useState(Date.now());
  const [lastAction, setLastAction] = useState<null | { id: string }>(null);
  const [toast, setToast] = useState<null | { message: string }>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [alertedItems, setAlertedItems] = useState<string[]>([]);
  const [focusLocked, setFocusLocked] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_only_critical") === "true";
    }
    return false;
  });
  const [isPaused, setIsPaused] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_paused") === "true";
    }
    return false;
  });
  const [pausedItems, setPausedItems] = useState<any[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [pausedStats, setPausedStats] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("kds_paused_stats");
        return saved ? JSON.parse(saved) : { prepared: 0, served: 0 };
      } catch {
        return { prepared: 0, served: 0 };
      }
    }

    return { prepared: 0, served: 0 };
  });
  const [showShortcuts, setShowShortcuts] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_show_shortcuts") === "true";
    }
    return false;
  });
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_muted") === "true";
    }
    return false;
  });
  const [criticalAlertsEnabled, setCriticalAlertsEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kds_critical_alerts") !== "false";
    }
    return true;
  });
  const [rotateSpeed, setRotateSpeed] = useState(() => {
    if (typeof window !== "undefined") {
      const val = localStorage.getItem("kds_rotate_speed");
      return val ? Number(val) : 5000;
    }
    return 5000;
  });
  const stations = ["Bebidas", "Frío", "Caliente", "Otros"] as const;
  const orderItems = items;
  const visibleItems = orderItems.filter((item) => {
    if (hiddenReadyIds.includes(item.id)) return false;
    if (!showReady && item.status === "ready") return false;
    if (isReadyOld(item)) return false;
    return true;
  });
  const filteredItems = useMemo(() => {
    return quickStationFilter === "all"
      ? visibleItems
      : visibleItems.filter(
          (item) => (item as any).station === quickStationFilter,
        );
  }, [visibleItems, quickStationFilter]);
  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems],
  );
  const displayItems = isPaused ? pausedItems : filteredItems;
  const criticalFilteredItems = useMemo(() => {
    return onlyCritical
      ? displayItems.filter((item) => isCriticalItem(item))
      : displayItems;
  }, [onlyCritical, displayItems]);
  const actionSoundRef = useRef<HTMLAudioElement | null>(null);
  const criticalSoundRef = useRef<HTMLAudioElement | null>(null);
  const lastLiveIdsRef = useRef<string[]>([]);
  const wasPausedRef = useRef(false);
  const pausedSnapshotRef = useRef<any[]>([]);
  const shortcutsRef = useRef<HTMLDivElement | null>(null);
  const shortcutsButtonRef = useRef<HTMLButtonElement | null>(null);
  const audioSalaRef = useRef<HTMLAudioElement | null>(null);
  const audioTakeawayRef = useRef<HTMLAudioElement | null>(null);
  const audioDeliveryRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef(0);
  const urgentRef = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef<HTMLDivElement | null>(null);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const activateCrisisMode = () => {
    setUrgentOnly(true);
    setUrgentMinutes(5);
    setCompactMode(true);
    setSoundEnabled(false);
  };

  const toggleFocusItem = (id: string) => {
    setFocusedItemId((prev) => {
      const newValue = prev === id ? null : id;
      if (newValue) {
        setFocusFlash(true);
        setTimeout(() => setFocusFlash(false), 300);
        setFocusLocked(true);
      }
      return newValue;
    });
  };

  const registerInteraction = () => {
    setLastInteraction(Date.now());
  };

  useEffect(() => {
    actionSoundRef.current = new Audio("/sounds/action.mp3");
  }, []);

  useEffect(() => {
    criticalSoundRef.current = new Audio("/sounds/critical.mp3");
  }, []);

  useEffect(() => {
    localStorage.setItem("kds_muted", String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem("kds_critical_alerts", String(criticalAlertsEnabled));
  }, [criticalAlertsEnabled]);

  useEffect(() => {
    localStorage.setItem("kds_show_shortcuts", String(showShortcuts));
  }, [showShortcuts]);

  useEffect(() => {
    localStorage.setItem("kds_only_critical", String(onlyCritical));
  }, [onlyCritical]);

  useEffect(() => {
    localStorage.setItem("kds_paused", String(isPaused));
  }, [isPaused]);

  useEffect(() => {
    if (pausedStats.prepared <= 0) return;

    const timeout = setTimeout(() => {
      setPausedStats({ prepared: 0, served: 0 });
    }, 10000);

    return () => clearTimeout(timeout);
  }, [pausedStats.prepared]);

  useEffect(() => {
    localStorage.setItem("kds_paused_stats", JSON.stringify(pausedStats));
  }, [pausedStats]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!shortcutsRef.current) return;
      if (
        !shortcutsRef.current.contains(e.target as Node) &&
        !shortcutsButtonRef.current?.contains(e.target as Node)
      ) {
        setShowShortcuts(false);
      }
    }
    if (showShortcuts) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showShortcuts]);

  function playActionSound() {
    if (isMuted) return;
    if (!actionSoundRef.current) return;
    actionSoundRef.current.currentTime = 0;
    actionSoundRef.current.play().catch(() => {});
  }

  function playCriticalSound() {
    if (!criticalAlertsEnabled) return;
    if (isMuted) return;
    if (!criticalSoundRef.current) return;
    criticalSoundRef.current.currentTime = 0;
    criticalSoundRef.current.play().catch(() => {});
  }

  useEffect(() => {
    if (!focusedItemId) return;
    const exists = visibleItems.some((item) => item.id === focusedItemId);
    if (!exists && !lockFocus) {
      setFocusedItemId(null);
    }
  }, [visibleItems, focusedItemId, lockFocus]);

  useEffect(() => {
    if (focusedRef.current) {
      const el = focusedRef.current;
      if (!isElementInViewport(el)) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [focusedItemId]);

  useEffect(() => {
    const events = ["click", "scroll", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, registerInteraction));
    return () => {
      events.forEach((e) => window.removeEventListener(e, registerInteraction));
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusMode(false);
        setFocusedItemId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("kds_dark_mode", String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("kds_sound", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("kds_urgent_only", String(urgentOnly));
  }, [urgentOnly]);

  useEffect(() => {
    localStorage.setItem("kds_urgent_minutes", String(urgentMinutes));
  }, [urgentMinutes]);

  useEffect(() => {
    localStorage.setItem("kds_compact_mode", String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem("kds_auto_rotate", String(autoRotate));
  }, [autoRotate]);

  useEffect(() => {
    localStorage.setItem("kds_rotate_speed", String(rotateSpeed));
  }, [rotateSpeed]);

  useEffect(() => {
    localStorage.setItem("kds_focus_mode", String(focusMode));
  }, [focusMode]);

  useEffect(() => {
    if (focusedItemId) {
      localStorage.setItem("kds_focused_item", focusedItemId);
    } else {
      localStorage.removeItem("kds_focused_item");
    }
  }, [focusedItemId]);

  useEffect(() => {
    localStorage.setItem("kds_lock_focus", String(lockFocus));
  }, [lockFocus]);

  useEffect(() => {
    if (stationView) {
      localStorage.setItem("kds_station_view", stationView);
    } else {
      localStorage.removeItem("kds_station_view");
    }
  }, [stationView]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!autoRotate) return;
    let index = 0;
    const interval = setInterval(() => {
      const now = Date.now();
      const inactive = now - lastInteraction > 10000;
      if (!inactive) return;
      const nextIndex = (index + 1) % stations.length;
      setNextStationPreview(stations[nextIndex]);
      setIsTransitioning(true);
      setTimeout(() => {
        setStationView(stations[index]);
        setNextStationPreview(null);
        setIsTransitioning(false);
        index = (index + 1) % stations.length;
      }, 200);
    }, rotateSpeed);
    return () => clearInterval(interval);
  }, [autoRotate, rotateSpeed, lastInteraction]);

  useEffect(() => {
    if (!autoRotate) {
      setStationView(null);
    }
  }, [autoRotate]);

  useEffect(() => {
    if (!restaurantId) {
      setItems([]);
      return;
    }

    const q = query(
      collection(db, "orderItems"),
      where("restaurantId", "==", restaurantId),
      where("status", "in", ["pending", "sent", "preparing"]),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<OrderItem, "id">),
      }));

      setItems(data);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  useEffect(() => {
    if (!soundEnabled || globalHighLoad) return;
    const pendingItems = visibleItems.filter((i) => i.status === "pending");

    if (prevCountRef.current !== 0 && pendingItems.length > prevCountRef.current) {
      const lastItem = pendingItems[pendingItems.length - 1] as any;
      const type = lastItem?.orderType;

      if (type === "delivery") {
        void audioDeliveryRef.current?.play().catch(() => {});
      } else if (type === "takeaway") {
        void audioTakeawayRef.current?.play().catch(() => {});
      } else {
        void audioSalaRef.current?.play().catch(() => {});
      }
    }

    prevCountRef.current = pendingItems.length;
  }, [visibleItems, soundEnabled, globalHighLoad]);

  const handleMarkPreparing = async (itemId: string) => {
    try {
      await updateDoc(doc(db, "orderItems", itemId), {
        status: "preparing",
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error("Error marking preparing", err);
    }
  };

  const handleMarkReady = async (itemId: string) => {
    try {
      const ref = doc(db, "orderItems", itemId);
      await updateDoc(ref, {
        status: "ready",
        readyAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error("handleMarkReady", e);
    }
  };

  const handleMarkServed = async (itemId: string) => {
    await updateDoc(doc(db, "orderItems", itemId), {
      status: "served",
      servedAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const clearPausedStats = () => {
    setPausedStats({ prepared: 0, served: 0 });
  };

  const resetKdsModes = () => {
    if (selectedItems.length > 0) {
      const confirmReset = window.confirm(
        `Tienes ${selectedItems.length} items seleccionados. Resetear modos limpiará la selección. ¿Confirmar?`,
      );
      if (!confirmReset) return;
    }
    setIsPaused(false);
    setOnlyCritical(false);
    setFocusMode(false);
    setFocusLocked(false);
    setIsMuted(false);
    setCriticalAlertsEnabled(true);
    setShowShortcuts(false);
    setSelectedItems([]);
    setToast({ message: "Modos reseteados" });
    setTimeout(() => setToast(null), 1500);
  };

  const handleUndoLast = async () => {
    if (!lastAction) return;
    const { id } = lastAction;
    await updateDoc(doc(db, "orderItems", id), {
      status: "pending",
      updatedAt: Date.now(),
    });
    setFocusedItemId(id);
    setLastAction(null);
    setToast({ message: "Deshecho" });
    setTimeout(() => setToast(null), 1500);
  };

  const handleBackToPending = async (itemId: string) => {
    try {
      await updateDoc(doc(db, "orderItems", itemId), {
        status: "pending",
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error reverting to pending:", error);
    }
  };

  const handleMarkOrderReady = async (items: OrderItem[]) => {
    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        const ref = doc(db, "orderItems", item.id);
        batch.update(ref, {
          status: "ready",
          updatedAt: Date.now(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking order ready:", error);
    }
  };

  const handleMarkOrderPreparing = async (items: OrderItem[]) => {
    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        const ref = doc(db, "orderItems", item.id);
        batch.update(ref, {
          status: "preparing",
          updatedAt: Date.now(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking order preparing:", error);
    }
  };

  const handleClearReady = () => {
    const readyIds = orderItems.filter((item) => item.status === "ready").map((item) => item.id);
    setHiddenReadyIds((prev) => [...prev, ...readyIds]);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  function renderOrderItemCard(item: OrderItem) {
    const minutes = getElapsedMinutes(item.createdAt);
    const priorityColor = getPriorityColor(minutes);
    const isNew = isNewItem(item.createdAt);
    const remainingSeconds = getReadyRemainingSeconds(item);
    const sentMinutes = getMinutesSince((item as any).sentAt);

    return (
      <div
        ref={focusedItemId === item.id ? focusedRef : null}
        onClick={(e) => {
          if ((e.target as HTMLElement | null)?.closest("button")) return;
          if (e.shiftKey && lastSelectedId) {
            const startIndex = filteredItems.findIndex(
              (i) => i.id === lastSelectedId,
            );
            const endIndex = filteredItems.findIndex((i) => i.id === item.id);
            if (startIndex !== -1 && endIndex !== -1) {
              const [start, end] = [startIndex, endIndex].sort(
                (a, b) => a - b,
              );
              const rangeIds = filteredItems
                .slice(start, end + 1)
                .map((i) => i.id);
              setSelectedItems((prev) =>
                Array.from(new Set([...prev, ...rangeIds])),
              );
            }
          } else if (e.shiftKey) {
            setSelectedItems((prev) =>
              prev.includes(item.id)
                ? prev.filter((id) => id !== item.id)
                : [...prev, item.id],
            );
          } else {
            toggleFocusItem(item.id);
            setSelectedItems([]);
          }
          setLastSelectedId(item.id);
        }}
        className={`border rounded ${
          focusMode ? "text-lg p-6" : ""
        } ${
          isCriticalItem(item) ? "border-red-500 animate-pulse" : ""
        } ${compactMode ? "p-2 text-sm" : "p-4 text-base"} ${
          selectedItems.includes(item.id) ? "bg-blue-200" : ""
        } ${
          focusedItemId === item.id ? "ring-2 ring-blue-500 bg-blue-50" : ""
        }`}
        style={{
          background: focusedItemId === item.id ? "#eff6ff" : "#111827",
          color: focusedItemId === item.id ? "#111827" : "#fff",
        }}
      >
        <div className={`h-1 w-full ${priorityColor}`} />

        <div style={{ position: "relative" }}>
          <span className="absolute right-4 top-4 font-bold text-sm">
            {minutes} min
          </span>

          <div style={{ fontWeight: 700, marginBottom: 6, paddingRight: 72 }}>
            {item.name} x{item.qty}
            {isNew && (
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded ml-2">
                NUEVO
              </span>
            )}
            {remainingSeconds !== null && (
              <span className="text-xs text-gray-500 ml-2">({remainingSeconds}s)</span>
            )}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Mesa {item.mesaId}
          </div>

          <div className={`text-xs font-bold ${getUrgencyColor(sentMinutes)}`}>
            {sentMinutes} min
          </div>

          <button
            type="button"
            onClick={() => void handleMarkPreparing(item.id)}
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Preparando
          </button>

          <button
            type="button"
            onClick={() => handleMarkReady(item.id)}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm"
          >
            Listo
          </button>

          {item.status === "preparing" && (
            <button
              type="button"
              onClick={() => void handleBackToPending(item.id)}
              className="bg-yellow-600 text-white px-3 py-1 rounded text-sm ml-2"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    );
  }

  const pendingItems = useMemo(() => {
    return criticalFilteredItems.filter((item) => item.status === "pending");
  }, [criticalFilteredItems]);

  const preparingItems = useMemo(() => {
    return criticalFilteredItems.filter((item) => item.status === "preparing");
  }, [criticalFilteredItems]);
  const totalItems = pendingItems.length + preparingItems.length;
  const totalPending = pendingItems.length;
  const totalPreparing = preparingItems.length;
  const activeModesCount = [
    isPaused,
    onlyCritical,
    focusMode,
    focusLocked,
    isMuted,
    !criticalAlertsEnabled,
    showShortcuts,
  ].filter(Boolean).length;
  const throughput = countCompletedLast15min(orderItems);
  const focusedVisibleCount = focusMode
    ? visibleItems.filter((item) => item.id === focusedItemId).length
    : 0;
  const pendingCount = pendingItems.length;
  const preparingCount = preparingItems.length;
  const sortedPending = [...pendingItems].sort((a, b) => a.createdAt - b.createdAt);
  const sortedPreparing = [...preparingItems].sort((a, b) => a.createdAt - b.createdAt);
  const pendingItemsSorted = useMemo(() => {
    return sortByUrgency(pendingItems);
  }, [pendingItems]);

  const preparingItemsSorted = useMemo(() => {
    return sortByUrgency(preparingItems);
  }, [preparingItems]);
  const groupedPending = groupByOrder(pendingItemsSorted);
  const groupedPreparing = groupByOrder(preparingItemsSorted);
  const oldestPendingOrderId = getOldestOrderId(groupedPending);
  const oldestPreparingOrderId = getOldestOrderId(groupedPreparing);
  const sortedPendingOrders = sortOrdersByOldest(groupedPending);
  const sortedPreparingOrders = sortOrdersByOldest(groupedPreparing);

  const filterUrgentOrders = (orders: [string, OrderItem[]][]) => {
    if (!urgentOnly) return orders;

    return orders.filter(([_, items]) => {
      if (items.length === 0) return false;
      const oldest = items.reduce(
        (min, item) => (item.createdAt < min ? item.createdAt : min),
        items[0]!.createdAt,
      );

      const minutes = Math.floor((Date.now() - oldest) / 60000);
      return minutes >= urgentMinutes;
    });
  };

  const visiblePendingOrders = filterUrgentOrders(sortedPendingOrders);
  const visiblePreparingOrders = filterUrgentOrders(sortedPreparingOrders);
  const pendingOrdersCount = visiblePendingOrders.length;
  const preparingOrdersCount = visiblePreparingOrders.length;
  const pendingAverageMinutes = getAverageOrderMinutes(visiblePendingOrders);
  const preparingAverageMinutes = getAverageOrderMinutes(visiblePreparingOrders);
  const pendingHighLoad = isHighLoad(pendingAverageMinutes);
  const preparingHighLoad = isHighLoad(preparingAverageMinutes);
  globalHighLoad = pendingHighLoad || preparingHighLoad;
  const pendingCriticalCount = countCriticalOrders(visiblePendingOrders);
  const preparingCriticalCount = countCriticalOrders(visiblePreparingOrders);
  const totalCritical = pendingCriticalCount + preparingCriticalCount;
  const highDelayPending = countHighDelayOrders(visiblePendingOrders, throughput);
  const highDelayPreparing = countHighDelayOrders(visiblePreparingOrders, throughput);
  const totalHighDelay = highDelayPending + highDelayPreparing;
  const serviceAtRisk = totalHighDelay >= 3;
  const isPausedByUser = autoRotate && Date.now() - lastInteraction <= 10000;
  const resumeSeconds = getResumeCountdown(lastInteraction);

  const filterOrdersByStation = (orders: [string, OrderItem[]][]) => {
    if (!stationView) return orders;
    return orders
      .map(([orderId, items]) => {
        const filteredItems = items.filter((item) => getKitchenStation(item) === stationView);
        if (filteredItems.length === 0) return null;
        return [orderId, filteredItems] as [string, OrderItem[]];
      })
      .filter((v): v is [string, OrderItem[]] => Boolean(v));
  };

  const stationPendingOrders = filterOrdersByStation(visiblePendingOrders);
  const stationPreparingOrders = filterOrdersByStation(visiblePreparingOrders);

  useEffect(() => {
    if (urgentRef.current) {
      urgentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [sortedPendingOrders, sortedPreparingOrders]);

  useEffect(() => {
    let isProcessing = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPaused && incomingCount > 0 && e.key === "Enter") {
        e.preventDefault();
        setIsPaused(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void handleUndoLast();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedItems(filteredItems.map((i) => i.id));
        return;
      }

      if (e.key === "Escape") {
        if (selectedItems.length >= 5) {
          const confirmClear = window.confirm(
            `Vas a limpiar ${selectedItems.length} items seleccionados. ¿Seguro?`,
          );
          if (!confirmClear) return;
        }
        setSelectedItems([]);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!focusedItemId) return;
        const prevId = getAdjacentItemId(focusedItemId, visibleItems, "up");
        if (prevId) {
          setFocusedItemId(prevId);
          setFocusLocked(true);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!focusedItemId) return;
        const nextId = getAdjacentItemId(focusedItemId, visibleItems, "down");
        if (nextId) {
          setFocusedItemId(nextId);
          setFocusLocked(true);
        }
        return;
      }

      if (
        e.shiftKey &&
        e.key.toLowerCase() === "s" &&
        selectedItems.length > 0
      ) {
        e.preventDefault();

        if (selectedItems.length >= 5) {
          const confirmBatch = window.confirm(
            `Vas a servir ${selectedItems.length} items. ¿Confirmar?`,
          );
          if (!confirmBatch) return;
        }

        selectedItems.forEach((id) => {
          setLastAction({ id });
          void handleMarkReady(id);
        });

        setSelectedItems([]);
        return;
      }

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!focusedItemId) return;
        setLastAction({ id: focusedItemId });
        void handleMarkReady(focusedItemId);
        playActionSound();
        return;
      }

      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setIsMuted((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        setCriticalAlertsEnabled((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        setFocusLocked(false);
        return;
      }

      if (e.key === "Backspace") {
        if (!focusedItemId) return;
        e.preventDefault();
        setFocusedItemId(null);
        setFocusLocked(false);
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetKdsModes();
        return;
      }

      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        const nextId = getMostUrgentItemId(filteredItems);
        if (nextId) {
          setFocusedItemId(nextId);
          setFocusLocked(false);
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        setOnlyCritical((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        setQuickStationFilter("all");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        setQuickStationFilter("cocina");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        setQuickStationFilter("barra");
        return;
      }
      if (e.key === "4") {
        e.preventDefault();
        setQuickStationFilter("cocteleria");
        return;
      }

      if ((e.key === "Enter" || e.key === " ") && selectedItems.length > 0) {
        e.preventDefault();
        if (selectedItems.length >= 5) {
          const confirmBatch = window.confirm(
            `Vas a preparar ${selectedItems.length} items. ¿Confirmar?`,
          );
          if (!confirmBatch) return;
        }
        selectedItems.forEach((id) => {
          void handleMarkPreparing(id);
        });
        setSelectedItems([]);
        return;
      }

      if (!focusedItemId) return;
      if (isProcessing) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        isProcessing = true;

        const nextId = getNextItemId(focusedItemId, visibleItems);
        setLastAction({ id: focusedItemId });
        void handleMarkPreparing(focusedItemId);
        playActionSound();
        setToast({ message: "Marcado como preparado" });
        setTimeout(() => setToast(null), 1500);
        if (nextId) {
          setTimeout(() => {
            setFocusedItemId(nextId);
          }, 100);
        }

        setTimeout(() => {
          isProcessing = false;
        }, 300);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusedItemId, selectedItems, isPaused, incomingCount]);

  useEffect(() => {
    if (!criticalAlertsEnabled) return;
    if (!("vibrate" in navigator)) return;

    const criticalIds = visibleItems
      .filter((item) => isCriticalItem(item))
      .map((item) => item.id);

    const newAlerts = criticalIds.filter((id) => !alertedItems.includes(id));

    if (newAlerts.length > 0) {
      navigator.vibrate(200);
      playCriticalSound();
      setAlertedItems((prev) =>
        [...prev, ...newAlerts].slice(-MAX_ALERTED_ITEMS),
      );
    }
  }, [visibleItems]);

  useEffect(() => {
    setAlertedItems((prev) => {
      const next = prev.filter((id) => filteredItemIds.has(id));

      if (next.length === prev.length) return prev;
      return next;
    });
  }, [filteredItemIds]);

  useEffect(() => {
    if (focusLocked) return;
    if (focusedItemId) return;
    const nextId = getMostUrgentItemId(filteredItems);
    if (nextId) {
      setFocusedItemId(nextId);
    }
  }, [filteredItems, focusedItemId, focusLocked]);

  useEffect(() => {
    if (isPaused) {
      setPausedItems(filteredItems);
      pausedSnapshotRef.current = filteredItems;
    }
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused) {
      setIncomingCount(0);
      lastLiveIdsRef.current = filteredItems.map((i) => i.id);
      return;
    }

    const currentIds = filteredItems.map((i) => i.id);
    const newIds = currentIds.filter(
      (id) => !lastLiveIdsRef.current.includes(id),
    );

    if (newIds.length > 0) {
      setIncomingCount((prev) => prev + newIds.length);
    }
  }, [filteredItems, isPaused]);

  useEffect(() => {
    if (wasPausedRef.current && !isPaused && incomingCount > 0) {
      const firstNewId = filteredItems.find(
        (item) => !lastLiveIdsRef.current.includes(item.id),
      )?.id;
      if (firstNewId) {
        setFocusedItemId(firstNewId);
        setFocusLocked(false);
      }
      setToast({ message: `${incomingCount} nuevos items cargados` });
      setTimeout(() => setToast(null), 1500);
    }
    if (wasPausedRef.current && !isPaused) {
      const before = pausedSnapshotRef.current;
      const after = filteredItems;
      const beforeIds = before.map((i) => i.id);
      const afterIds = after.map((i) => i.id);
      const disappearedIds = beforeIds.filter((id) => !afterIds.includes(id));

      setPausedStats({
        prepared: disappearedIds.length,
        served: 0,
      });

      if (disappearedIds.length > 0) {
        setToast({
          message: `${disappearedIds.length} items procesados durante pausa`,
        });
        setTimeout(() => setToast(null), 2000);
      }
    }
    wasPausedRef.current = isPaused;
  }, [isPaused, incomingCount, filteredItems]);

  useEffect(() => {
    if (!focusedItemId) return;
    const exists = filteredItems.some((i) => i.id === focusedItemId);
    if (!exists) {
      setFocusedItemId(null);
      setFocusLocked(false);
    }
  }, [filteredItems, focusedItemId]);

  return (
    <>
      <audio ref={audioSalaRef} src="/sounds/sala.mp3" preload="auto" />
      <audio ref={audioTakeawayRef} src="/sounds/takeaway.mp3" preload="auto" />
      <audio ref={audioDeliveryRef} src="/sounds/delivery.mp3" preload="auto" />
      {!ready ? (
        <div style={{ padding: 24 }}>Cargando cocina...</div>
      ) : (
        <div
          className={
            darkMode ? "bg-black text-white min-h-screen" : "bg-white text-black min-h-screen"
          }
        >
          <div className={`transition-all duration-300 ${focusFlash ? "bg-blue-100" : ""}`}>
            <div style={{ padding: 16 }}>
            <h2 style={{ marginBottom: 16 }}>Cocina</h2>
            {serviceAtRisk && (
              <div className="bg-red-800 text-white px-4 py-2 rounded font-bold text-center mb-2">
                SERVICIO EN RIESGO
              </div>
            )}
            <div className="flex justify-end mb-2">
              <div className="font-bold text-sm mr-4">Total: {totalItems}</div>
              <div className="bg-red-700 text-white px-3 py-1 rounded text-sm font-bold ml-2">
                Críticos: {totalCritical}
              </div>
              <div className="bg-green-700 text-white px-3 py-1 rounded text-sm font-bold ml-2">
                Salidas 15m: {throughput}
              </div>
              <button
                type="button"
                onClick={handleFullscreen}
                className="bg-black text-white px-3 py-1 rounded text-sm"
              >
                Pantalla completa
              </button>
              <button
                type="button"
                onClick={activateCrisisMode}
                className="bg-red-800 text-white px-3 py-1 rounded text-sm ml-2 font-bold"
              >
                MODO CRISIS
              </button>
              {focusMode && (
                <div className="bg-blue-700 text-white px-3 py-1 rounded text-sm ml-2 font-bold">
                  En foco: {focusedVisibleCount}
                </div>
              )}
              {focusMode && (
                <div className="bg-blue-900 text-white px-3 py-1 rounded text-sm font-bold ml-2">
                  MODO FOCO
                </div>
              )}
              {autoRotate && (
                <div
                  className={`px-3 py-1 rounded text-sm ml-2 font-bold ${
                    isPausedByUser ? "bg-yellow-500 text-black" : "bg-purple-700 text-white"
                  }`}
                >
                  {isPausedByUser ? `PAUSADO (${resumeSeconds}s)` : "AUTO ROTANDO"}
                </div>
              )}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm ml-2"
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setSoundEnabled((prev) => !prev)}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm ml-2"
              >
                {soundEnabled ? "Sonido ON" : "Sonido OFF"}
              </button>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-gray-200">
                {isMuted ? "🔇" : "🔊"}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-gray-200">
                {quickStationFilter.toUpperCase()}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-red-200 text-red-800">
                {criticalAlertsEnabled ? "ALERTAS ON" : "ALERTAS OFF"}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-yellow-200 text-yellow-800">
                {focusMode ? "FOCUS" : "NORMAL"}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-blue-200 text-blue-800">
                {focusLocked ? "LOCKED" : "AUTO"}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-gray-100 text-gray-800 font-bold">
                {totalItems} total · {totalPending} pendientes · {totalPreparing} en preparación
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-red-100 text-red-800">
                {onlyCritical ? "CRÍTICOS" : "TODO"}
              </div>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-yellow-300 text-black font-bold">
                {isPaused ? "PAUSADO" : "LIVE"}
              </div>
              {isPaused && incomingCount > 0 && (
                <div className="ml-2 text-xs px-2 py-1 rounded bg-red-600 text-white font-bold animate-pulse">
                  +{formatIncomingCount(incomingCount)} nuevos · ENTER
                </div>
              )}
              {pausedStats.prepared > 0 && (
                <div className="ml-2 flex items-center gap-2 text-xs px-2 py-1 rounded bg-green-200 text-green-800">
                  <span>{pausedStats.prepared} procesados</span>
                  <button
                    type="button"
                    onClick={clearPausedStats}
                    className="font-bold underline"
                  >
                    limpiar
                  </button>
                </div>
              )}
              <button
                ref={shortcutsButtonRef}
                type="button"
                onClick={() => setShowShortcuts((prev) => !prev)}
                className="ml-2 px-3 py-1 text-xs rounded bg-black text-white font-bold"
              >
                Atajos
              </button>
              <div className="ml-2 text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-800 font-bold">
                Modos: {activeModesCount}
              </div>
              {activeModesCount > 0 && (
                <button
                  type="button"
                  onClick={resetKdsModes}
                  className="ml-2 px-3 py-1 text-xs rounded bg-indigo-700 text-white font-bold"
                >
                  Reset modos
                </button>
              )}
              {selectedItems.length > 0 && (
                <div className="ml-2 text-xs px-2 py-1 rounded bg-blue-600 text-white font-bold">
                  {selectedItems.length} seleccionados
                </div>
              )}
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedItems.length >= 5) {
                      const confirmBatch = window.confirm(
                        `Vas a preparar ${selectedItems.length} items. ¿Confirmar?`,
                      );
                      if (!confirmBatch) return;
                    }
                    selectedItems.forEach((id) => {
                      void handleMarkPreparing(id);
                    });
                    setSelectedItems([]);
                  }}
                  className="ml-2 px-3 py-1 text-xs rounded bg-green-600 text-white font-bold"
                >
                  Preparar ({selectedItems.length})
                </button>
              )}
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedItems.length >= 5) {
                      const confirmBatch = window.confirm(
                        `Vas a servir ${selectedItems.length} items. ¿Confirmar?`,
                      );
                      if (!confirmBatch) return;
                    }
                    selectedItems.forEach((id) => {
                      setLastAction({ id });
                      void handleMarkReady(id);
                    });
                    setSelectedItems([]);
                  }}
                  className="ml-2 px-3 py-1 text-xs rounded bg-purple-600 text-white font-bold"
                >
                  Listo ({selectedItems.length})
                </button>
              )}
              {filteredItems.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedItems(filteredItems.map((i) => i.id))
                  }
                  className="ml-2 px-3 py-1 text-xs rounded bg-gray-700 text-white font-bold"
                >
                  Seleccionar todo
                </button>
              )}
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedItems.length >= 5) {
                      const confirmClear = window.confirm(
                        `Vas a limpiar ${selectedItems.length} items seleccionados. ¿Seguro?`,
                      );
                      if (!confirmClear) return;
                    }
                    setSelectedItems([]);
                  }}
                  className="ml-2 px-3 py-1 text-xs rounded bg-gray-400 text-black font-bold"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                onClick={handleClearReady}
                className="bg-gray-700 text-white px-3 py-1 rounded text-sm ml-2"
              >
                Limpiar completados
              </button>
              <button
                type="button"
                onClick={() => setShowReady((prev) => !prev)}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm ml-2"
              >
                {showReady ? "Ocultar ready" : "Mostrar ready"}
              </button>
              <button
                type="button"
                onClick={() => setCompactMode((prev) => !prev)}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm ml-2"
              >
                {compactMode ? "Normal" : "Compacto"}
              </button>
              {globalHighLoad && (
                <div className="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold ml-2">
                  Sonido pausado por alta carga
                </div>
              )}
            </div>

            {showShortcuts && (
              <div
                ref={shortcutsRef}
                className="mb-3 rounded border bg-white p-3 text-xs text-gray-800 shadow"
              >
                <div className="font-bold mb-2">Atajos de cocina</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>↑ / ↓ · mover foco</div>
                  <div>Enter / Espacio · preparar</div>
                  <div>S · servir</div>
                  <div>Shift + S · servir selección</div>
                  <div>Ctrl/Cmd + A · seleccionar todo</div>
                  <div>Esc · limpiar selección</div>
                  <div>Backspace · limpiar foco</div>
                  <div>R · foco más urgente</div>
                  <div>P · pausa/live</div>
                  <div>C · solo críticos</div>
                  <div>M · sonido on/off</div>
                  <div>L · alertas on/off</div>
                  <div>F · modo focus</div>
                  <div>U · desbloquear foco</div>
                </div>
              </div>
            )}

            {autoRotate && nextStationPreview && (
              <div className="text-xs text-gray-400 mb-2">
                Siguiente: {nextStationPreview}
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded text-sm ${
                  statusFilter === "all" ? "bg-black text-white" : "bg-gray-200 text-black"
                }`}
              >
                Todos
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={`px-3 py-1 rounded text-sm ${
                  statusFilter === "pending"
                    ? "bg-orange-600 text-white"
                    : "bg-gray-200 text-black"
                }`}
              >
                Pendientes
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("preparing")}
                className={`px-3 py-1 rounded text-sm ${
                  statusFilter === "preparing"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-black"
                }`}
              >
                Preparando
              </button>
              <button
                type="button"
                onClick={() => setUrgentOnly((prev) => !prev)}
                className={`px-3 py-1 rounded text-sm ml-2 ${
                  urgentOnly ? "bg-red-600 text-white" : "bg-gray-200 text-black"
                }`}
              >
                Urgentes {urgentOnly ? "ON" : "OFF"}
              </button>
              <div className="flex gap-1 ml-2">
                {[5, 10, 15].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setUrgentMinutes(minutes)}
                    className={`px-2 py-1 rounded text-xs ${
                      urgentMinutes === minutes
                        ? "bg-red-600 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
              <div className="flex gap-1 ml-2">
                {["all", "Bebidas", "Frío", "Caliente", "Otros"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStationFilter(st as any)}
                    className={`px-2 py-1 rounded text-xs ${
                      stationFilter === st
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {st === "all" ? "Todas" : st}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 ml-2">
                {["Bebidas", "Frío", "Caliente", "Otros"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStationView((prev) => (prev === st ? null : (st as any)))}
                    className={`px-2 py-1 rounded text-xs ${
                      stationView === st ? "bg-purple-700 text-white" : "bg-gray-200 text-black"
                    }`}
                  >
                    {stationView === st ? `Salir ${st}` : st}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className={`px-3 py-1 rounded text-sm ml-2 ${
                  autoRotate ? "bg-purple-700 text-white" : "bg-gray-200 text-black"
                }`}
              >
                Auto rotar
              </button>
              <button
                type="button"
                onClick={() => setFocusMode((prev) => !prev)}
                className={`px-3 py-1 rounded text-sm ml-2 ${
                  focusMode ? "bg-blue-700 text-white" : "bg-gray-200 text-black"
                }`}
              >
                Foco
              </button>
              <button
                type="button"
                onClick={() => setLockFocus((prev) => !prev)}
                className={`px-3 py-1 rounded text-sm ml-2 ${
                  lockFocus ? "bg-blue-900 text-white" : "bg-gray-200 text-black"
                }`}
              >
                {lockFocus ? "Foco bloqueado" : "Bloquear foco"}
              </button>
              <div className="flex gap-1 ml-2">
                {[3000, 5000, 10000].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setRotateSpeed(ms)}
                    className={`px-2 py-1 rounded text-xs ${
                      rotateSpeed === ms
                        ? "bg-purple-700 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {ms / 1000}s
                  </button>
                ))}
              </div>
            </div>

            {items.length === 0 ? (
              <div style={{ color: "#9ca3af" }}>No hay platos pendientes.</div>
            ) : (
              <div
                className={`transition-all duration-300 ${
                  isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
                } ${
                  statusFilter === "all" ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"
                }`}
              >
                {(statusFilter === "all" || statusFilter === "pending") && (
                  <div>
                    <h2
                      className={`text-lg font-bold mb-2 ${
                        pendingHighLoad ? "text-red-600" : ""
                      }`}
                    >
                      Pendientes ({pendingCount}) · Pedidos: {pendingOrdersCount} · Media:{" "}
                      {pendingAverageMinutes} min
                      {pendingHighLoad && (
                        <span className="ml-2 bg-red-600 text-white px-2 py-1 rounded text-xs">
                          HIGH LOAD
                        </span>
                      )}
                    </h2>
                    {stationPendingOrders.length === 0 && (
                      <div className="border rounded p-6 text-center text-gray-500 bg-gray-50">
                        No hay pedidos pendientes
                      </div>
                    )}
                    {stationPendingOrders.map(([orderId, ticketItems]) => {
                      const orderMinutes = getOrderElapsedMinutes(ticketItems);
                      const orderType = (ticketItems[0] as any)?.orderType;
                      const typeLabel = getOrderTypeLabel(orderType);
                      const typeColor = getOrderTypeColor(orderType);
                      const orderLabel = getOrderLabel(ticketItems);
                      const eta = getETAForOrder(ticketItems.length, throughput);
                      const delayStatus = getDelayStatus(orderMinutes, eta);
                      const isCritical = isCriticalOrder(ticketItems);
                      const groupedByStation = groupItemsByStation(ticketItems);
                      if (focusMode && !focusedItemId) return null;
                      const filteredStations = Object.entries(groupedByStation).filter(
                        ([station]) => stationFilter === "all" || station === stationFilter,
                      );
                      return (
                        <div
                          ref={orderId === oldestPendingOrderId ? urgentRef : null}
                          key={orderId}
                          className={`mb-4 border rounded p-2 ${
                            orderId === oldestPendingOrderId ? "ring-2 ring-red-500" : ""
                          } ${isCritical ? "animate-pulse bg-red-50" : ""}`}
                        >
                          <div className="font-bold mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>
                                {orderLabel} · #{orderId} ({ticketItems.length}) -{" "}
                                {orderMinutes} min
                              </span>
                              <span className="text-xs px-2 py-1 rounded bg-gray-200">
                                {ticketItems.length}
                              </span>
                              <span
                                className={`text-white text-xs px-2 py-1 rounded ${typeColor}`}
                              >
                                {typeLabel}
                              </span>
                              {eta && (
                                <span className="ml-2 text-xs bg-gray-800 text-white px-2 py-1 rounded">
                                  ETA ~{eta} min
                                </span>
                              )}
                              {eta && (
                                <span
                                  className={`ml-2 text-xs px-2 py-1 rounded ${
                                    delayStatus === "high"
                                      ? "bg-red-700 text-white"
                                      : delayStatus === "medium"
                                        ? "bg-yellow-500 text-black"
                                        : "bg-green-700 text-white"
                                  }`}
                                >
                                  {delayStatus === "high"
                                    ? "RETRASO"
                                    : delayStatus === "medium"
                                      ? "JUSTO"
                                      : "OK"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleMarkOrderPreparing(ticketItems)}
                                className="bg-orange-600 text-white px-2 py-1 rounded text-xs ml-2"
                              >
                                Preparar todo
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleMarkOrderReady(ticketItems)}
                                className="bg-green-700 text-white px-2 py-1 rounded text-xs ml-2"
                              >
                                Todo listo
                              </button>
                            </div>
                          </div>
                          {filteredStations
                            .sort(
                              (a, b) => getStationPriority(a[0]) - getStationPriority(b[0]),
                            )
                            .map(([station, stationItems]) => (
                              <div key={station} className="mb-3 border rounded overflow-hidden">
                                <div className={`h-1 w-full ${getStationColor(station)}`} />
                                <div className="p-2">
                                  <div className="text-xs font-bold uppercase mb-1 text-gray-500">
                                    {station}
                                  </div>
                                  <div className={compactMode ? "space-y-1" : "space-y-3"}>
                                    {sortItemsSmart(stationItems)
                                      .filter((item) => !focusMode || focusedItemId === item.id)
                                      .map((item) => (
                                      <div key={item.id}>{renderOrderItemCard(item)}</div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(statusFilter === "all" || statusFilter === "preparing") && (
                  <div>
                    <h2
                      className={`text-lg font-bold mb-2 ${
                        preparingHighLoad ? "text-red-600" : ""
                      }`}
                    >
                      Preparando ({preparingCount}) · Pedidos: {preparingOrdersCount} · Media:{" "}
                      {preparingAverageMinutes} min
                      {preparingHighLoad && (
                        <span className="ml-2 bg-red-600 text-white px-2 py-1 rounded text-xs">
                          HIGH LOAD
                        </span>
                      )}
                    </h2>
                    {stationPreparingOrders.length === 0 && (
                      <div className="border rounded p-6 text-center text-gray-500 bg-gray-50">
                        No hay pedidos en preparación
                      </div>
                    )}
                    {stationPreparingOrders.map(([orderId, ticketItems]) => {
                      const orderMinutes = getOrderElapsedMinutes(ticketItems);
                      const orderType = (ticketItems[0] as any)?.orderType;
                      const typeLabel = getOrderTypeLabel(orderType);
                      const typeColor = getOrderTypeColor(orderType);
                      const orderLabel = getOrderLabel(ticketItems);
                      const eta = getETAForOrder(ticketItems.length, throughput);
                      const delayStatus = getDelayStatus(orderMinutes, eta);
                      const isCritical = isCriticalOrder(ticketItems);
                      const groupedByStation = groupItemsByStation(ticketItems);
                      if (focusMode && !focusedItemId) return null;
                      const filteredStations = Object.entries(groupedByStation).filter(
                        ([station]) => stationFilter === "all" || station === stationFilter,
                      );
                      return (
                        <div
                          ref={orderId === oldestPreparingOrderId ? urgentRef : null}
                          key={orderId}
                          className={`mb-4 border rounded p-2 ${
                            orderId === oldestPreparingOrderId ? "ring-2 ring-red-500" : ""
                          } ${isCritical ? "animate-pulse bg-red-50" : ""}`}
                        >
                          <div className="font-bold mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>
                                {orderLabel} · #{orderId} ({ticketItems.length}) -{" "}
                                {orderMinutes} min
                              </span>
                              <span className="text-xs px-2 py-1 rounded bg-gray-200">
                                {ticketItems.length}
                              </span>
                              <span
                                className={`text-white text-xs px-2 py-1 rounded ${typeColor}`}
                              >
                                {typeLabel}
                              </span>
                              {eta && (
                                <span className="ml-2 text-xs bg-gray-800 text-white px-2 py-1 rounded">
                                  ETA ~{eta} min
                                </span>
                              )}
                              {eta && (
                                <span
                                  className={`ml-2 text-xs px-2 py-1 rounded ${
                                    delayStatus === "high"
                                      ? "bg-red-700 text-white"
                                      : delayStatus === "medium"
                                        ? "bg-yellow-500 text-black"
                                        : "bg-green-700 text-white"
                                  }`}
                                >
                                  {delayStatus === "high"
                                    ? "RETRASO"
                                    : delayStatus === "medium"
                                      ? "JUSTO"
                                      : "OK"}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleMarkOrderReady(ticketItems)}
                              className="bg-green-700 text-white px-2 py-1 rounded text-xs ml-2"
                            >
                              Todo listo
                            </button>
                          </div>
                          {filteredStations
                            .sort(
                              (a, b) => getStationPriority(a[0]) - getStationPriority(b[0]),
                            )
                            .map(([station, stationItems]) => (
                              <div key={station} className="mb-3 border rounded overflow-hidden">
                                <div className={`h-1 w-full ${getStationColor(station)}`} />
                                <div className="p-2">
                                  <div className="text-xs font-bold uppercase mb-1 text-gray-500">
                                    {station}
                                  </div>
                                  <div className={compactMode ? "space-y-1" : "space-y-3"}>
                                    {sortItemsSmart(stationItems)
                                      .filter((item) => !focusMode || focusedItemId === item.id)
                                      .map((item) => (
                                      <div key={item.id}>{renderOrderItemCard(item)}</div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-black text-white px-4 py-2 rounded shadow-lg text-sm z-50">
          {toast.message}
        </div>
      )}
    </>
  );
}
