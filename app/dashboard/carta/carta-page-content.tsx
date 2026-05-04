"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties, WheelEvent as ReactWheelEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import { HostlyBackButton } from "@/components/hostly/back-button";
import { HostlyMiniIconButton } from "@/components/hostly/mini-icon-button";
import { HostlyPageContainer } from "@/components/hostly/page-container";
import { HostlyPageHeader } from "@/components/hostly/page-header";
import { useI18n } from "@/components/i18n-provider";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, PLATOS_CHANGED_EVENT, type PlatoCarta } from "@/lib/platos-local";
import {
  isOrderStatusActiveForTableOccupancy,
  mapOccupancyFromOrderRows,
  readOrderCreatedAtMs,
} from "@/lib/firestore/order-table-occupancy";
import {
  fetchOpenOrdersForTable,
  isFirestoreOrderStatusOpen,
  sortOpenOrderDocsByCreatedAt,
} from "@/lib/firestore/open-orders-same-table";
import { handlePayTableOrder } from "@/lib/firestore/pay-table-order";
import {
  filterTablesForTpvMap,
  getTables,
  sortTablesForTpvMap,
  TABLE_MAP_STATUS_OCCUPIED,
  type Table,
} from "@/lib/firestore/tables";
import { getUsersByRestaurant } from "@/lib/firestore/users";
import { EditableFloorMap } from "@/components/map/EditableFloorMap";
import { PinchZoomMap } from "./_components/pinch-zoom-map";
import { ElementCard } from "@/components/map/element-map-card";
import {
  listenReservationsForDate,
  type Reservation,
} from "@/lib/firestore/reservations";
import { isBarItem } from "@/lib/kds/bar-classification";
import type { Product } from "@/types/product";

async function upsertVoucherBalanceAfterPayment(
  db: Firestore,
  restaurantId: string,
  voucherNumberRaw: string,
  voucherValue: number,
  voucherRemaining: number,
) {
  const trimmed = voucherNumberRaw.trim();
  if (!trimmed || !restaurantId) return;

  const q = query(
    collection(db, "vouchers"),
    where("restaurantId", "==", restaurantId),
    where("voucherNumber", "==", trimmed),
  );
  const snap = await getDocs(q);
  const now = Date.now();
  const status = voucherRemaining > 0 ? "active" : "used";

  if (!snap.empty) {
    const ref = snap.docs[0]!.ref;
    await updateDoc(ref, {
      balance: voucherRemaining,
      status,
      updatedAt: now,
    });
  } else {
    await addDoc(collection(db, "vouchers"), {
      restaurantId,
      voucherNumber: trimmed,
      initialAmount: voucherValue,
      balance: voucherRemaining,
      status,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function isBarProduct(product: Product | null | undefined): boolean {
  if (!product) return false;
  return isBarItem({ categoria: product.categoria });
}

function destinationBadgeStyle(bar: boolean): CSSProperties {
  return bar
    ? {
        background: "rgba(99, 102, 241, 0.16)",
        color: "#3730a3",
        border: "1px solid rgba(99, 102, 241, 0.32)",
      }
    : {
        background: "rgba(249, 115, 22, 0.16)",
        color: "#9a3412",
        border: "1px solid rgba(249, 115, 22, 0.32)",
      };
}

/** Texto corto para badge de camarero en mapa (inicial o 2 letras). */
function formatWaiterMapBadgeLabel(waiterName: string | undefined): string | null {
  const t = (waiterName ?? "").trim();
  if (!t) return null;
  const first = (t.split(/\s+/)[0] ?? t).trim();
  if (first.length <= 2) return first.toUpperCase();
  return first.slice(0, 1).toUpperCase();
}

type RestaurantUserRow = {
  id: string;
  email?: string;
  nombre?: string;
  displayName?: string;
};

const MAP_WAITER_FILTER_STORAGE_KEY = "hostly.carta.mapWaiterFilter";

function readStoredMapWaiterFilter(): "all" | "me" | string {
  if (typeof window === "undefined") return "all";
  try {
    const v = localStorage.getItem(MAP_WAITER_FILTER_STORAGE_KEY);
    if (v === "all" || v === "me") return v;
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  } catch {
    /* ignore */
  }
  return "all";
}

function displayRestaurantUserName(row: RestaurantUserRow): string {
  const n =
    (typeof row.displayName === "string" && row.displayName.trim()) ||
    (typeof row.nombre === "string" && row.nombre.trim());
  if (n) return n;
  const em = typeof row.email === "string" ? row.email.trim() : "";
  if (em.includes("@")) return em.split("@")[0] ?? "—";
  return em || "—";
}

/** Prioridad visual en mapa (0–3); solo render, no Firestore. */
function computeMapVisualPriorityLevel(
  openedAtMs: number | undefined,
  mapNow: number,
  orderTotal: number | undefined,
): number {
  const minutes =
    openedAtMs != null && Number.isFinite(openedAtMs)
      ? Math.max(0, Math.floor((mapNow - openedAtMs) / 60000))
      : 0;
  const total =
    typeof orderTotal === "number" && Number.isFinite(orderTotal)
      ? orderTotal
      : 0;
  if (minutes >= 60) return 3;
  if (minutes >= 30) return 2;
  if (total > 50) return 1;
  return 0;
}

function formatOrderOpenDurationLabel(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function getOrderOpenedAt(order: {
  createdAt?: unknown;
  openedAt?: unknown;
} | null | undefined): number | undefined {
  if (!order) return undefined;
  const opened = readOrderCreatedAtMs(order.openedAt);
  const created = readOrderCreatedAtMs(order.createdAt);
  const ms = opened ?? created;
  return ms != null && Number.isFinite(ms) ? ms : undefined;
}

function computeOrderDocTotal(data: {
  total?: unknown;
  items?: Array<{
    total?: unknown;
    quantity?: unknown;
    qty?: unknown;
    price?: unknown;
    precio?: unknown;
  }>;
}): number {
  const t = data.total;
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (Array.isArray(data.items)) {
    return data.items.reduce((acc, it) => {
      if (typeof it.total === "number" && Number.isFinite(it.total))
        return acc + it.total;
      const q = Number(it.quantity ?? it.qty) || 0;
      const p = Number(it.price ?? it.precio) || 0;
      return acc + q * p;
    }, 0);
  }
  return 0;
}

type OrderLineStatus = "pending" | "sent" | "prepared" | "served" | "cancelled";

type CartOrderLineExtra = { name: string; price: number };

type CartOrderLine = {
  id: string;
  product: Product;
  quantity: number;
  status: OrderLineStatus;
  /** Orden estable en panel comanda (inserción); no actualizar al subir cantidad. */
  addedAt?: number;
  createdAt?: number;
  sentAt?: number;
  preparedAt?: number;
  servedAt?: number;
  cancelledAt?: number;
  isComped?: boolean;
  compedAt?: number;
  compedReason?: string;
  /** Texto libre (solo UI / estado local). */
  lineNote?: string;
  /** @deprecated Preferir `extras`. */
  lineExtra?: string;
  /** Se muestra como “Nombre (variante)”. */
  variantLabel?: string;
  /** Extras con importe; el total de línea usa precio base + suma de extras. */
  extras?: CartOrderLineExtra[];
  /** Pase 1–4; omitir o 0 = sin pase. */
  course?: number;
};

const CARTA_PRESET_EXTRAS: readonly CartOrderLineExtra[] = [];

function normalizeComandaCourseForStorage(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(4, Math.max(1, Math.floor(n)));
}

/**
 * Mapea el pase de UI (string) al campo numérico `course` que ya usan
 * `CartOrderLine`, cocina y comanda. NO se introduce ningún campo nuevo
 * en la estructura ni en Firestore: solo se traduce.
 */
type ActiveCourseUi = "starter" | "main" | "dessert";
const ACTIVE_COURSE_TO_NUM: Record<ActiveCourseUi, number> = {
  starter: 1,
  main: 2,
  dessert: 3,
};

function lineCourseToPaseDraft(line: CartOrderLine): 0 | 1 | 2 | 3 | 4 {
  const u = normalizeComandaCourseForStorage(line.course);
  if (u == null) return 0;
  return u as 0 | 1 | 2 | 3 | 4;
}

/** Etiqueta de pase en línea TPV (`course` numérico 1–4 en datos). */
function getCourseLabel(course: number): string {
  switch (course) {
    case 1:
      return "ENTRANTE";
    case 2:
      return "PRIMERO";
    case 3:
      return "SEGUNDO";
    case 4:
      return "POSTRE";
    default:
      return "";
  }
}

function getCourseClass(course: number): string {
  switch (course) {
    case 1:
      return "bg-blue-100 text-blue-700";
    case 2:
      return "bg-green-100 text-green-700";
    case 3:
      return "bg-orange-100 text-orange-700";
    case 4:
      return "bg-pink-100 text-pink-700";
    default:
      return "";
  }
}

/** Pase en tarjetas vista Cocina integrada (TPV). */
function getCocinaCardCourseLabel(course?: number): string {
  if (course === 1) return "Entrante";
  if (course === 2) return "Segundo";
  if (course === 3) return "Postre";
  return "";
}

type CocinaCourseBucket = 0 | 1 | 2 | 3;

function cocinaCourseBucket(line: CartOrderLine): CocinaCourseBucket {
  const c = normalizeComandaCourseForStorage(line.course);
  if (c === 1) return 1;
  if (c === 2) return 2;
  if (c === 3 || c === 4) return 3;
  return 0;
}

function cocinaCourseSortOrder(line: CartOrderLine): number {
  const b = cocinaCourseBucket(line);
  if (b === 1) return 1;
  if (b === 2) return 2;
  if (b === 3) return 3;
  return 999;
}

function getCocinaSectionTitle(bucket: CocinaCourseBucket): string {
  if (bucket === 1) return "ENTRANTES";
  if (bucket === 2) return "SEGUNDOS";
  if (bucket === 3) return "POSTRES";
  return "SIN PASE";
}

type ComandaLineEditorDraft = {
  pase: 0 | 1 | 2 | 3 | 4;
  lineNote: string;
  extrasPickerOpen: boolean;
  selectedPresetExtraNames: string[];
};

function generateOrderLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeOrderLineStatus(raw: unknown): OrderLineStatus {
  if (
    raw === "pending" ||
    raw === "sent" ||
    raw === "prepared" ||
    raw === "served" ||
    raw === "cancelled"
  )
    return raw;
  if (raw === "preparing") return "sent";
  if (raw === "ready") return "prepared";
  if (raw === "new" || raw == null) return "pending";
  return "pending";
}

function getPendingItems(order: CartOrderLine[]): CartOrderLine[] {
  return order.filter((l) => l.status === "pending");
}

function comandaLineRowBg(
  status: OrderLineStatus,
  opts: { hover: boolean; selected: boolean },
): string {
  if (status === "cancelled") {
    return opts.hover ? "rgba(241, 245, 249, 0.95)" : "rgba(241, 245, 249, 0.75)";
  }
  if (status !== "pending" && !opts.selected) {
    return opts.hover ? "rgba(241, 245, 249, 0.95)" : "rgba(241, 245, 249, 0.75)";
  }
  if (opts.selected) {
    if (status === "pending") return "rgba(71, 85, 105, 0.20)";
    if (status === "sent") return "rgba(59, 130, 246, 0.22)";
    if (status === "prepared") return "rgba(249, 115, 22, 0.22)";
    return "rgba(34, 197, 94, 0.20)";
  }
  if (opts.hover) return "rgba(15, 23, 42, 0.07)";
  if (status === "pending") return "rgba(71, 85, 105, 0.11)";
  if (status === "sent") return "rgba(59, 130, 246, 0.14)";
  if (status === "prepared") return "rgba(249, 115, 22, 0.14)";
  return "rgba(34, 197, 94, 0.11)";
}

function comandaLineStatusOutline(status: OrderLineStatus): string {
  if (status === "pending") return "2px solid rgba(71, 85, 105, 0.55)";
  if (status === "sent") return "2px solid rgba(37, 99, 235, 0.5)";
  if (status === "prepared") return "2px solid rgba(234, 88, 12, 0.55)";
  if (status === "cancelled") return "2px solid rgba(148, 163, 184, 0.55)";
  return "2px solid rgba(22, 163, 74, 0.5)";
}

function comandaStatusBadgeStyle(status: OrderLineStatus): CSSProperties {
  if (status === "pending") {
    return {
      background: "rgba(71, 85, 105, 0.16)",
      color: "#334155",
      border: "1px solid rgba(71, 85, 105, 0.28)",
    };
  }
  if (status === "sent") {
    return {
      background: "rgba(59, 130, 246, 0.28)",
      color: "#1e40af",
      border: "1px solid rgba(37, 99, 235, 0.55)",
    };
  }
  if (status === "prepared") {
    return {
      background: "rgba(249, 115, 22, 0.2)",
      color: "#9a3412",
      border: "1px solid rgba(249, 115, 22, 0.35)",
    };
  }
  if (status === "cancelled") {
    return {
      background: "rgba(148, 163, 184, 0.22)",
      color: "#475569",
      border: "1px solid rgba(148, 163, 184, 0.38)",
    };
  }
  return {
    background: "rgba(34, 197, 94, 0.18)",
    color: "#166534",
    border: "1px solid rgba(34, 197, 94, 0.32)",
  };
}

function sumLineExtrasPrices(line: CartOrderLine): number {
  if (!Array.isArray(line.extras)) return 0;
  return line.extras.reduce((acc, ex) => {
    const p = Number(ex.price);
    return acc + (Number.isFinite(p) ? p : 0);
  }, 0);
}

/** Precio unitario efectivo: base + extras. */
function comandaLineUnitPriceWithExtras(line: CartOrderLine): number {
  const base = Number(line.product.precio);
  const b = Number.isFinite(base) ? base : 0;
  return b + sumLineExtrasPrices(line);
}

/** Total línea: (base + suma extras) × cantidad. */
function comandaLineTotalWithExtras(line: CartOrderLine): number {
  const q = Number(line.quantity);
  const qty = Number.isFinite(q) && q > 0 ? q : 0;
  return comandaLineUnitPriceWithExtras(line) * qty;
}

function sumCartOrderLinesTotal(lines: CartOrderLine[]): number {
  return lines.reduce((acc, line) => {
    if (line.status === "cancelled") return acc;
    if (line.isComped) return acc;
    return acc + comandaLineTotalWithExtras(line);
  }, 0);
}

function parseFirestoreLineExtras(raw: unknown): CartOrderLineExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      const p = Number(o.price);
      return {
        name,
        price: Number.isFinite(p) ? p : 0,
      };
    })
    .filter((e) => e.name !== "");
}

function formatComandaLineEuroEs(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function comandaLineDisplayName(line: CartOrderLine): string {
  const v = line.variantLabel?.trim();
  return v ? `${line.product.nombre} (${v})` : line.product.nombre;
}

function comandaLineSortKey(line: CartOrderLine): number {
  if (typeof line.addedAt === "number" && Number.isFinite(line.addedAt)) {
    return line.addedAt;
  }
  if (typeof line.createdAt === "number" && Number.isFinite(line.createdAt)) {
    return line.createdAt;
  }
  if (typeof line.sentAt === "number" && Number.isFinite(line.sentAt)) {
    return line.sentAt;
  }
  if (typeof line.preparedAt === "number" && Number.isFinite(line.preparedAt)) {
    return line.preparedAt;
  }
  if (typeof line.servedAt === "number" && Number.isFinite(line.servedAt)) {
    return line.servedAt;
  }
  return 0;
}

function orderLinesToFirestoreItems(lines: CartOrderLine[]) {
  return lines.map((line) => {
    const baseUnit = Number(line.product.precio) || 0;
    const quantity = Number(line.quantity) || 0;
    const extras = Array.isArray(line.extras)
      ? line.extras
          .filter((ex) => ex && typeof ex.name === "string")
          .map((ex) => ({
            name: String(ex.name).trim(),
            price: Number.isFinite(Number(ex.price)) ? Number(ex.price) : 0,
          }))
          .filter((ex) => ex.name !== "")
      : [];
    const extrasSum = extras.reduce((s, ex) => s + ex.price, 0);
    const unitWithExtras = baseUnit + extrasSum;
    const lineTotal = unitWithExtras * quantity;
    const courseStored = normalizeComandaCourseForStorage(line.course);
    return {
      id: line.id,
      productId: String(line.product.id),
      name: String(line.product.nombre ?? ""),
      qty: quantity,
      status: line.status,
      ...(typeof line.addedAt === "number" && Number.isFinite(line.addedAt)
        ? { addedAt: line.addedAt }
        : {}),
      createdAt: line.createdAt ?? null,
      sentAt: line.sentAt ?? null,
      preparedAt: line.preparedAt ?? null,
      servedAt: line.servedAt ?? null,
      cancelledAt: line.cancelledAt ?? null,
      isComped: Boolean(line.isComped),
      compedAt: line.compedAt ?? null,
      compedReason: line.compedReason ?? null,
      price: baseUnit,
      precio: baseUnit,
      extras,
      total: Number.isFinite(lineTotal) ? lineTotal : 0,
      categoria: String(line.product.categoria ?? ""),
      ...(line.lineNote?.trim() ? { note: line.lineNote.trim() } : {}),
      ...(courseStored != null ? { course: courseStored } : {}),
    };
  });
}

type FirestoreOrderDocForCart = {
  restaurantId?: string;
  items?: {
    id?: string;
    productId?: string;
    nombre?: string;
    name?: string;
    precio?: number;
    quantity?: number;
    qty?: number;
    categoria?: string;
    status?: string;
    addedAt?: unknown;
    createdAt?: unknown;
    sentAt?: unknown;
    preparedAt?: unknown;
    servedAt?: unknown;
    cancelledAt?: unknown;
    isComped?: unknown;
    compedAt?: unknown;
    compedReason?: unknown;
  }[];
};

function isPaymentRequestedAtSet(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "number" && Number.isFinite(raw)) return true;
  if (
    typeof raw === "object" &&
    raw !== null &&
    "toMillis" in raw &&
    typeof (raw as { toMillis?: () => number }).toMillis === "function"
  ) {
    return true;
  }
  return false;
}

function asFirestoreRawItems(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => ({ ...(x as Record<string, unknown>) }));
}

function normalizeMergedFirestoreItems(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.map((it) => {
    const next = { ...it };
    let id = typeof next.id === "string" ? next.id : "";
    if (!id || seen.has(id)) {
      id = generateOrderLineId();
      next.id = id;
    }
    seen.add(id);
    return next;
  });
}

function mapFirestoreOrderDocToCartLines(
  data: FirestoreOrderDocForCart,
  restaurantId: string,
): CartOrderLine[] | null {
  if (data.restaurantId !== restaurantId) return null;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const mapped = rawItems
    .filter((it) => it && typeof it.productId === "string")
    .map((it, idx) => {
      const qty = Math.max(0, Number(it.qty ?? it.quantity) || 0);
      const name = String(it.name ?? it.nombre ?? "");
      const st = normalizeOrderLineStatus(it.status);
      const createdMs =
        typeof it.createdAt === "number" ? it.createdAt : null;
      const addedMs =
        typeof (it as { addedAt?: unknown }).addedAt === "number" &&
        Number.isFinite((it as { addedAt?: number }).addedAt)
          ? ((it as { addedAt: number }).addedAt as number)
          : undefined;
      const sentMs =
        typeof it.sentAt === "number" ? it.sentAt : undefined;
      const preparedMs =
        typeof it.preparedAt === "number" ? it.preparedAt : undefined;
      const servedMs =
        typeof it.servedAt === "number" ? it.servedAt : undefined;
      const cancelledMs =
        typeof (it as { cancelledAt?: unknown }).cancelledAt === "number"
          ? ((it as { cancelledAt?: number }).cancelledAt as number)
          : undefined;
      const isComped =
        typeof (it as { isComped?: unknown }).isComped === "boolean"
          ? Boolean((it as { isComped?: boolean }).isComped)
          : false;
      const compedAt =
        typeof (it as { compedAt?: unknown }).compedAt === "number"
          ? ((it as { compedAt?: number }).compedAt as number)
          : undefined;
      const compedReason =
        typeof (it as { compedReason?: unknown }).compedReason === "string"
          ? String((it as { compedReason?: string }).compedReason ?? "").trim()
          : undefined;
      const extras = parseFirestoreLineExtras(
        (it as { extras?: unknown }).extras,
      );
      const rawIt = it as { note?: unknown; lineNote?: unknown };
      const lineNoteFromDoc =
        typeof rawIt.note === "string" && rawIt.note.trim()
          ? rawIt.note.trim()
          : typeof rawIt.lineNote === "string" && rawIt.lineNote.trim()
            ? rawIt.lineNote.trim()
            : undefined;
      const basePrecio =
        Number((it as { precio?: unknown }).precio) ||
        Number((it as { price?: unknown }).price) ||
        0;
      const courseStored = normalizeComandaCourseForStorage(
        (it as { course?: unknown }).course,
      );
      return {
        id:
          typeof it.id === "string" && it.id.trim() !== ""
            ? it.id
            : `legacy-${it.productId}-${idx}`,
        quantity: qty,
        product: {
          id: it.productId as string,
          nombre: name,
          precio: basePrecio,
          categoria: String(it.categoria ?? ""),
        } as Product,
        status: st,
        ...(addedMs != null ? { addedAt: addedMs } : {}),
        createdAt: createdMs ?? undefined,
        sentAt: sentMs,
        preparedAt: preparedMs,
        servedAt: servedMs,
        cancelledAt: cancelledMs,
        ...(isComped ? { isComped: true } : {}),
        ...(compedAt != null ? { compedAt } : {}),
        ...(compedReason ? { compedReason } : {}),
        ...(extras.length > 0 ? { extras } : {}),
        ...(lineNoteFromDoc ? { lineNote: lineNoteFromDoc } : {}),
        ...(courseStored != null ? { course: courseStored } : {}),
      };
    })
    .filter((row) => row.quantity > 0);
  return mapped;
}

/** Misma regla que en gestión de productos: visible en carta si está en catálogo y “en carta”. */
function publicationOnMenu(p: PlatoCarta): boolean {
  const raw = p as PlatoCarta & { enCarta?: boolean; isActive?: boolean };
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  if (!isActive) return false;
  const enCarta =
    typeof raw.enCarta === "boolean" ? raw.enCarta : raw.activo;
  return enCarta === true;
}

function platoCartaToProduct(p: PlatoCarta): Product {
  const precio =
    typeof p.precioVenta === "number" && Number.isFinite(p.precioVenta)
      ? p.precioVenta
      : 0;
  const cat = typeof p.categoria === "string" ? p.categoria.trim() : "";
  return {
    id: p.id,
    nombre: p.nombre?.trim() ? p.nombre.trim() : "Sin nombre",
    categoria: cat || "Sin categoría",
    categoryId: p.categoriaCartaId,
    precio,
    imageUrl:
      typeof p.fotoUrl === "string" && p.fotoUrl.trim() !== ""
        ? p.fotoUrl.trim()
        : undefined,
    restaurantId: p.restauranteId,
  };
}

/** Primer nivel TPV: bebida vs comida (segundo nivel = categorías del catálogo). */
type CartaMenuGroup = "bebida" | "comida";

function normalizeCategoryLabelForGroup(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");
}

function categoryLabelTokens(name: string): string[] {
  const n = normalizeCategoryLabelForGroup(name);
  if (!n) return [];
  return n.split(/[^a-z0-9]+/).filter(Boolean);
}

const DRINK_CATEGORY_WORDS = new Set([
  "agua",
  "aguas",
  "refresco",
  "refrescos",
  "soda",
  "sodas",
  "gaseosa",
  "gaseosas",
  "cerveza",
  "cervezas",
  "vino",
  "vinos",
  "cava",
  "cavas",
  "champagne",
  "champan",
  "copa",
  "copas",
  "coctel",
  "cocteles",
  "cocktail",
  "cocktails",
  "licor",
  "licores",
  "vermu",
  "vermouth",
  "ron",
  "vodka",
  "whisky",
  "whiskey",
  "brandy",
  "gintonics",
  "gintonic",
  "combinado",
  "combinados",
  "digestivo",
  "digestivos",
  "cafe",
  "cafes",
  "te",
  "tes",
  "infusion",
  "infusiones",
  "tisana",
  "tisanas",
  "zumo",
  "zumos",
  "jugo",
  "jugos",
  "batido",
  "batidos",
  "smoothie",
  "smoothies",
  "bebida",
  "bebidas",
  "sidra",
  "sangria",
  "mocktail",
  "mocktails",
  "tonica",
  "tonicas",
  "cola",
  "energetica",
  "energeticas",
  "isotonica",
  "isotonicas",
]);

function categoryWordLooksDrink(word: string): boolean {
  if (DRINK_CATEGORY_WORDS.has(word)) return true;
  if (word.startsWith("cervez")) return true;
  if (word.startsWith("coctel") || word.startsWith("cocktail")) return true;
  if (word.startsWith("refresc")) return true;
  if (word.startsWith("cafe")) return true;
  if (word.startsWith("champ")) return true;
  return false;
}

/**
 * Asocia el nombre de categoría del catálogo real a bebida o comida:
 * palabras clave (ES/EN) y prefijos habituales; si no encaja → comida
 * (incl. "Sin categoría" y nombres ambiguos).
 */
function categoryMenuGroup(categoryName: string): CartaMenuGroup {
  const raw = (categoryName || "").trim();
  if (!raw) return "comida";
  const flat = normalizeCategoryLabelForGroup(raw);
  if (flat === "sin categoria") return "comida";

  for (const w of categoryLabelTokens(raw)) {
    if (categoryWordLooksDrink(w)) return "bebida";
  }

  if (
    flat.includes("soft drink") ||
    flat.includes("softdrink") ||
    flat.includes("hot drink") ||
    flat.includes("long drink") ||
    flat.includes("sin alcohol")
  ) {
    return "bebida";
  }

  return "comida";
}

/** Texto corto para el indicador de mesa activa (TPV); recibe el nombre para mostrar, no el id. */
function formatActiveMesaIndicator(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const deacc = s
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();
  if (/^\d+$/.test(s)) return `Mesa ${s}`;
  if (deacc === "barra") return "Barra";
  if (deacc === "takeaway" || deacc === "take away" || deacc === "take-away") {
    return "Take Away";
  }
  return s;
}

/** Fondo pastel estable según el nombre (misma entrada → mismo color). */
function softBackgroundFromName(name: string): string {
  const s = name.trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 44%, 90%)`;
}

const getItemTimeInfo = (createdAt?: number) => {
  if (!createdAt) return { minutes: 0, label: "", color: "" };

  const diffMs = Date.now() - createdAt;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes >= 10) {
    return { minutes, label: "URGENTE", color: "#ff4d4f" };
  }

  if (minutes >= 5) {
    return { minutes, label: "EN CURSO", color: "#faad14" };
  }

  return { minutes, label: "NUEVO", color: "#52c41a" };
};

export type CartaPageContentProps = {
  /** Oculta la cabecera Hostly en `/dashboard/operacion` (tabs Operación arriba). Solo layout. */
  embeddedInOperacion?: boolean;
};

export function CartaPageContent({
  embeddedInOperacion = false,
}: CartaPageContentProps) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    user,
    restaurantId: profileRestaurantId,
    ready: authReady,
  } = useAuth();
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId");
  const tableIdFromUrl = searchParams.get("tableId");
  const tpvViewFromUrl = searchParams.get("tpvView");
  const appliedOrderFromUrlRef = useRef(false);
  const firstPendingRef = useRef<HTMLLIElement | null>(null);
  const lastSortedRef = useRef<string[]>([]);
  const lastResultRef = useRef<Table[]>([]);
  const tableFlipPositionsRef = useRef<Record<string, DOMRect>>({});
  const tableFlipElementsRef = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const tableFlipRefCallbackCacheRef = useRef<
    Record<string, (el: HTMLDivElement | null) => void>
  >({});
  const tableFlipRafRef = useRef<Record<string, number>>({});
  const rapidChangesRef = useRef(0);
  const lastChangeTsRef = useRef(0);
  const isInteractingRef = useRef(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const restaurantId = profileRestaurantId ?? user?.uid ?? null;

  const [cartaHeaderMobile, setCartaHeaderMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setCartaHeaderMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const waiterId =
    (user as { uid?: string; id?: string } | null | undefined)?.uid ||
    (user as { uid?: string; id?: string } | null | undefined)?.id ||
    null;
  const waiterEmail =
    (user as { email?: string } | null | undefined)?.email || null;

  const tableMapLibreLabel = useMemo(() => t("cartaTpv.mapLibre"), [t]);

  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setTodayReservations([]);
      return;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const ymd = `${yyyy}-${mm}-${dd}`;
    const unsub = listenReservationsForDate(restaurantId, ymd, (list) => {
      setTodayReservations(
        list.filter((r) => r.status === "booked" || r.status === "seated"),
      );
    });
    return () => unsub();
  }, [authReady, restaurantId, isFirebaseConfigured]);

  const reservedByTableId = useMemo(() => {
    const by: Record<string, Reservation> = {};
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    function toMinutes(time: string): number {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
      if (!m) return 0;
      const hh = Number.parseInt(m[1] ?? "0", 10);
      const mm = Number.parseInt(m[2] ?? "0", 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
      return hh * 60 + mm;
    }

    const groups: Record<string, Reservation[]> = {};
    for (const r of todayReservations) {
      const tid = typeof r.tableId === "string" ? r.tableId.trim() : "";
      if (!tid) continue;
      (groups[tid] ||= []).push(r);
    }
    for (const tableId of Object.keys(groups)) {
      const list = groups[tableId] ?? [];
      list.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
      let chosen: Reservation | null = null;
      for (const r of list) {
        if (toMinutes(r.time) >= nowMin) {
          chosen = r;
          break;
        }
      }
      chosen = chosen ?? list[0] ?? null;
      if (chosen) by[tableId] = chosen;
    }
    return by;
  }, [todayReservations]);

  const reservationPressureByTableId = useMemo(() => {
    const by: Record<
      string,
      { type: "upcoming" | "late"; time: string; customerName?: string }
    > = {};
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    function toMinutes(time: string): number {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
      if (!m) return 0;
      const hh = Number.parseInt(m[1] ?? "0", 10);
      const mm = Number.parseInt(m[2] ?? "0", 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
      return hh * 60 + mm;
    }

    type Row = Reservation & { _min: number; _type: "upcoming" | "late" | null };
    const rows: Row[] = todayReservations
      .filter((r) => r.status === "booked")
      .map((r) => {
        const m = toMinutes(r.time);
        let t: Row["_type"] = null;
        if (m <= nowMin - 15) t = "late";
        else if (m >= nowMin && m <= nowMin + 90) t = "upcoming";
        return Object.assign({}, r, { _min: m, _type: t });
      })
      .filter((r) => r._type !== null) as Row[];

    const groups: Record<string, Row[]> = {};
    for (const r of rows) {
      const tid = typeof r.tableId === "string" ? r.tableId.trim() : "";
      if (!tid) continue;
      (groups[tid] ||= []).push(r);
    }

    for (const tableId of Object.keys(groups)) {
      const list = groups[tableId] ?? [];
      const late = list.filter((r) => r._type === "late");
      if (late.length > 0) {
        late.sort((a, b) => a._min - b._min);
        const chosen = late[0]!;
        by[tableId] = {
          type: "late",
          time: chosen.time,
          customerName: chosen.customerName,
        };
        continue;
      }
      const upcoming = list.filter((r) => r._type === "upcoming");
      if (upcoming.length > 0) {
        upcoming.sort((a, b) => a._min - b._min);
        const chosen = upcoming[0]!;
        by[tableId] = {
          type: "upcoming",
          time: chosen.time,
          customerName: chosen.customerName,
        };
      }
    }
    return by;
  }, [todayReservations]);

  const reservationPressureCounts = useMemo(() => {
    let upcoming = 0;
    let late = 0;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const r of todayReservations) {
      if (r.status !== "booked") continue;
      const tid = typeof r.tableId === "string" ? r.tableId.trim() : "";
      if (!tid) continue;
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(r.time ?? "").trim());
      if (!m) continue;
      const hh = Number.parseInt(m[1] ?? "0", 10);
      const mm = Number.parseInt(m[2] ?? "0", 10);
      const mins = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
      if (mins <= nowMin - 15) late++;
      else if (mins >= nowMin && mins <= nowMin + 90) upcoming++;
    }
    return { upcoming, late };
  }, [todayReservations]);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState(false);

  const [tablesList, setTablesList] = useState<Table[]>([]);
  /** Nombre de categoría de carta resaltada; null si aún no hay categorías en el grupo (comida/bebida). */
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  /**
   * Primer nivel del TPV: solo categorías de ese grupo.
   * Por defecto `comida`: encaja con "Sin categoría" y categorías no reconocidas como bebida.
   */
  const [menuGroup, setMenuGroup] = useState<CartaMenuGroup>("comida");
  /** Feedback visual al pulsar un tile de producto (TPV). */
  const [isAddingByProductId, setIsAddingByProductId] = useState<Record<string, number>>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const activeProductTimeoutRef = useRef<number | null>(null);
  const addingTimeoutsRef = useRef<Record<string, number>>({});
  const lastClickAtByProductIdRef = useRef<Record<string, number>>({});
  const suppressClickUntilByProductIdRef = useRef<Record<string, number>>({});
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const holdActiveProductIdRef = useRef<string | null>(null);
  const holdDidRepeatRef = useRef(false);
  /** Barrido táctil entre tarjetas: el dedo sigue pulsado y entra en
   * otras `.carta-product-card` → se añade cada producto al cruzar.
   * `dragVisitedProductsRef` evita dos `handleQuickAdd` del mismo id en
   * un solo gesto si el dedo repasa la misma tarjeta. No usa capture;
   * se limpia el Set en pointerUp del botón o del grid. */
  const dragAddActiveRef = useRef(false);
  const dragVisitedProductsRef = useRef<Set<string>>(new Set());
  /** Pulso visual breve en cada tarjeta al añadir durante barrido
   * (pointerEnter con dedo pulsado). Solo UI; no afecta a order. */
  const [dragAddingProductId, setDragAddingProductId] = useState<string | null>(
    null,
  );
  /* Long-press en la grid de productos para QUITAR 1 unidad (reutiliza
     `handleDecrementLine`, que solo opera sobre líneas locales `pending`). */
  const removeHoldTimeoutRef = useRef<number | null>(null);
  const removeHoldClassTimeoutRef = useRef<number | null>(null);
  const removeIsHoldingRef = useRef(false);
  const [holdingProductId, setHoldingProductId] = useState<string | null>(null);
  /* Hold-to-repeat-add (mantener pulsado para añadir varias unidades).
     Empieza a 200 ms y se cancela cuando el long-press de remove se
     activa a 400 ms (el remove tiene prioridad). */
  const removeRepeatAddIntervalRef = useRef<number | null>(null);
  const [repeatingProductId, setRepeatingProductId] = useState<string | null>(
    null,
  );
  /**
   * Pase activo en la grid TPV. Es UI puro: se mapea al campo numérico
   * `course` (1-4) que YA existe en `CartOrderLine` y que ya consume
   * cocina/comanda. No se persiste ningún string nuevo en Firestore.
   */
  const [activeCourse, setActiveCourse] = useState<
    "starter" | "main" | "dessert"
  >("starter");
  /* Flash visual breve al cambiar de pase para confirmar la selección.
     Solo UI local: el valor refleja el pase recién elegido y se borra
     a los 700 ms con un timer; no afecta a `order` ni a Firestore. */
  const [courseFlash, setCourseFlash] = useState<
    "starter" | "main" | "dessert" | null
  >(null);
  const courseFlashTimeoutRef = useRef<number | null>(null);
  const handleSelectCourse = (course: "starter" | "main" | "dessert") => {
    setActiveCourse(course);
    setCourseFlash(course);
    if (courseFlashTimeoutRef.current != null) {
      window.clearTimeout(courseFlashTimeoutRef.current);
    }
    courseFlashTimeoutRef.current = window.setTimeout(() => {
      setCourseFlash(null);
      courseFlashTimeoutRef.current = null;
    }, 700);
  };
  const [hoveredComandaLineIndex, setHoveredComandaLineIndex] = useState<
    number | null
  >(null);
  const [viewMode, setViewMode] = useState<"normal" | "cocina" | "barra">(
    "normal",
  );
  /** Entrada TPV: mapa de mesas o mesa abierta (comanda + productos). `summary` = abrir enfocando cuenta. */
  const [tpvEntryMode, setTpvEntryMode] = useState<"map" | "tpv" | "summary">(
    "map",
  );
  /** Filtro de zona en el mapa (`__all__` = todas). */
  const [mapZoneFilter, setMapZoneFilter] = useState<string>("__all__");
  /** Filtro de camarero en mapa: todas, las del usuario actual, o id de usuario. */
  const [waiterFilter, setWaiterFilter] = useState<"all" | "me" | string>("all");

  useEffect(() => {
    setWaiterFilter(readStoredMapWaiterFilter());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_WAITER_FILTER_STORAGE_KEY, waiterFilter);
    } catch {
      /* ignore */
    }
  }, [waiterFilter]);
  const [now, setNow] = useState(Date.now());
  /** Mesa seleccionada: siempre `tables[].id` (clave de `ordersByTable`). */
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [order, setOrder] = useState<CartOrderLine[]>([]);
  /** Comandas locales por mesa; clave = `table.id` de Firestore. */
  const [ordersByTable, setOrdersByTable] = useState<
    Record<string, CartOrderLine[]>
  >({});
  /** Mesas con order activa en Firestore (`orders.tableId` = `table.id`). */
  const [firestoreOccupiedTableIds, setFirestoreOccupiedTableIds] = useState<
    Set<string>
  >(() => new Set());
  /** Por `table.id`: `createdAt` (ms) de la order activa más antigua de esa mesa. */
  const [firestoreOccupancyStartMsByTable, setFirestoreOccupancyStartMsByTable] =
    useState<Record<string, number>>({});
  /** Suma de totales de orders activas por `table.id` (misma regla de estado que ocupación). */
  const [orderTotalsByTable, setOrderTotalsByTable] = useState<
    Record<string, number>
  >({});
  /** Por mesa: último updatedAt o createdAt (ms) entre orders activas. */
  const [lastActivityAtByTable, setLastActivityAtByTable] = useState<
    Record<string, number>
  >({});
  const [isComandaSending, setIsComandaSending] = useState(false);
  const [comandaSentFlash, setComandaSentFlash] = useState(false);
  const [isPayTableOrderSending, setIsPayTableOrderSending] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isFinalTicketOpen, setIsFinalTicketOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "voucher" | null
  >(null);
  const [cashReceived, setCashReceived] = useState("");
  const [cardReceived, setCardReceived] = useState("");
  const [cardReceivedTouched, setCardReceivedTouched] = useState(false);
  const [voucherAmount, setVoucherAmount] = useState("");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [voucherLookupBalance, setVoucherLookupBalance] = useState<number | null>(null);
  const [closingFeedback, setClosingFeedback] = useState<null | { tableName?: string }>(
    null,
  );
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceTaxId, setInvoiceTaxId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [lastPaymentInfo, setLastPaymentInfo] = useState<{
    ticketNumber?: string;
    invoiceNumber?: string;
  } | null>(null);
  const [lastOrderSnapshot, setLastOrderSnapshot] = useState<CartOrderLine[]>([]);
  const [lastTicketBreakdown, setLastTicketBreakdown] = useState<{
    originalTotal: number;
    invPart: number;
    pctPart: number;
    percentValue: number;
    finalTotal: number;
    discountTotal: number;
  } | null>(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [isSplitEqualMode, setIsSplitEqualMode] = useState(false);
  const [isSplitItemsMode, setIsSplitItemsMode] = useState(false);
  const [isSplitItemsPayMode, setIsSplitItemsPayMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [paidSplitItemIds, setPaidSplitItemIds] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [comandaLineActionsOpen, setComandaLineActionsOpen] = useState(false);
  const [comandaLineActionsTargetId, setComandaLineActionsTargetId] = useState<string | null>(
    null,
  );
  const [partialPayments, setPartialPayments] = useState<
    Array<{
      id: string;
      itemIds: string[];
      total: number;
      finalTotal?: number;
      status: string;
      type: string;
    }>
  >([]);
  const [splitCount, setSplitCount] = useState(2);
  const [currentSplitIndex, setCurrentSplitIndex] = useState(1);

  const isSimplePaymentMode =
    !isSplitMode &&
    !isSplitEqualMode &&
    !isSplitItemsMode &&
    !isSplitItemsPayMode &&
    !isInvoice &&
    paidSplitItemIds.length === 0 &&
    partialPayments.length === 0;
  const [firestorePaidTableIds, setFirestorePaidTableIds] = useState<
    Set<string>
  >(() => new Set());
  const [orderUrlDocStatus, setOrderUrlDocStatus] = useState<string | null>(
    null,
  );
  const [orderUrlPaymentRequestedAt, setOrderUrlPaymentRequestedAt] =
    useState(false);
  const [orderUrlOpenedAtMs, setOrderUrlOpenedAtMs] = useState<number | null>(
    null,
  );
  const [comandaHeaderNow, setComandaHeaderNow] = useState(() => Date.now());
  const [editSplitEnabled, setEditSplitEnabled] = useState(false);
  const [editSplitQty, setEditSplitQty] = useState(1);
  const [firestoreBillRequestedTableIds, setFirestoreBillRequestedTableIds] =
    useState<Set<string>>(() => new Set());
  const [isBillRequestSending, setIsBillRequestSending] = useState(false);
  const [firestoreOrderNoteByTable, setFirestoreOrderNoteByTable] = useState<
    Record<string, string>
  >({});
  const [orderUrlNote, setOrderUrlNote] = useState("");
  const [orderNoteDraft, setOrderNoteDraft] = useState("");
  const [isSavingOrderNote, setIsSavingOrderNote] = useState(false);
  const comandaFlashTimeoutRef = useRef<number | null>(null);
  const [comandaLineEditorId, setComandaLineEditorId] = useState<string | null>(
    null,
  );
  const [lineEditDraft, setLineEditDraft] = useState<ComandaLineEditorDraft>({
    pase: 0,
    lineNote: "",
    extrasPickerOpen: false,
    selectedPresetExtraNames: [],
  });
  const [isMergingOrders, setIsMergingOrders] = useState(false);
  const [orderUrlTableId, setOrderUrlTableId] = useState<string | null>(null);
  const [openOrderIdsForTable, setOpenOrderIdsForTable] = useState<string[]>(
    [],
  );
  const orderSessionId = useMemo(() => {
    const fromUrl = typeof orderIdFromUrl === "string" ? orderIdFromUrl.trim() : "";
    if (fromUrl) return fromUrl;

    if (!selectedTableId) return null;
    const table = tablesList.find((t) => t.id === selectedTableId) as
      | (Table & { currentOrderId?: unknown; activeOrderId?: unknown })
      | undefined;
    const currentOrderId = table?.currentOrderId;
    const activeOrderId = table?.activeOrderId;
    if (typeof currentOrderId === "string" && currentOrderId.trim()) return currentOrderId.trim();
    if (typeof activeOrderId === "string" && activeOrderId.trim()) return activeOrderId.trim();

    const occupancyStartMs = firestoreOccupancyStartMsByTable[selectedTableId];
    if (typeof occupancyStartMs === "number" && Number.isFinite(occupancyStartMs)) {
      return `${selectedTableId}-${occupancyStartMs}`;
    }
    return null;
  }, [orderIdFromUrl, selectedTableId, tablesList, firestoreOccupancyStartMsByTable]);

  useEffect(() => {
    if (paymentMethod !== "voucher") {
      setVoucherLookupBalance(null);
      return;
    }
    const trimmed = voucherNumber.trim();
    if (!trimmed || !restaurantId || !isFirebaseConfigured) {
      setVoucherLookupBalance(null);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const q = query(
            collection(db, "vouchers"),
            where("restaurantId", "==", restaurantId),
            where("voucherNumber", "==", trimmed),
          );
          const snap = await getDocs(q);
          if (cancelled) return;
          if (snap.empty) {
            setVoucherLookupBalance(null);
            return;
          }
          const raw = snap.docs[0]!.data().balance;
          const balance =
            typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw) || 0;
          setVoucherLookupBalance(balance);
          setVoucherAmount((prev) => (prev.trim() === "" ? String(balance) : prev));
        } catch {
          if (!cancelled) setVoucherLookupBalance(null);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [voucherNumber, restaurantId, paymentMethod, isFirebaseConfigured]);

  useEffect(() => {
    if (!lastPaymentInfo) return;
    if (isFinalTicketOpen) return;
    const t = setTimeout(() => setLastPaymentInfo(null), 3000);
    return () => clearTimeout(t);
  }, [lastPaymentInfo, isFinalTicketOpen]);

  useEffect(() => {
    if (!isPaymentOpen) return;
    if (!restaurantId || !selectedTableId) return;
    if (!orderSessionId) {
      setPaidSplitItemIds([]);
      setPartialPayments([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "payments"),
            where("restaurantId", "==", restaurantId),
            where("tableId", "==", selectedTableId),
            where("orderSessionId", "==", orderSessionId),
            where("type", "==", "split_by_items"),
            where("status", "==", "paid"),
          ),
        );
        if (cancelled) return;

        const uniqueItemIds = new Set<string>();
        const partials: Array<{
          id: string;
          itemIds: string[];
          total: number;
          finalTotal?: number;
          status: string;
          type: string;
        }> = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as {
            itemIds?: unknown;
            total?: unknown;
            finalTotal?: unknown;
            status?: unknown;
            type?: unknown;
          };
          const itemIds = Array.isArray(data.itemIds)
            ? data.itemIds
                .filter((itemId): itemId is string => typeof itemId === "string")
                .map((itemId) => itemId.trim())
                .filter(Boolean)
            : [];
          const total =
            typeof data.total === "number" && Number.isFinite(data.total) ? data.total : 0;
          const finalTotal =
            typeof data.finalTotal === "number" && Number.isFinite(data.finalTotal)
              ? data.finalTotal
              : undefined;
          const status = typeof data.status === "string" ? data.status : "";
          const type = typeof data.type === "string" ? data.type : "";

          partials.push({
            id: docSnap.id,
            itemIds,
            total,
            finalTotal,
            status,
            type,
          });

          if (itemIds.length === 0) continue;
          for (const itemId of itemIds) {
            uniqueItemIds.add(itemId);
          }
        }

        setPartialPayments(partials);
        setPaidSplitItemIds([...uniqueItemIds]);
      } catch (error) {
        console.error("ERROR CARGANDO PAGOS PARCIALES", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPaymentOpen, restaurantId, selectedTableId, orderSessionId]);

  const handleCancelPartialPayment = useCallback(
    async (paymentId: string) => {
      const target = partialPayments.find((p) => p.id === paymentId);
      if (!target) return;
      if (target.status !== "paid") return;
      if (target.type !== "split_by_items") return;
      try {
        await updateDoc(doc(db, "payments", paymentId), {
          status: "cancelled",
          updatedAt: Date.now(),
        });
        setPartialPayments((prev) => {
          const next = prev.filter((p) => p.id !== paymentId);
          const uniqueItemIds = new Set<string>();
          for (const payment of next) {
            if (payment.status !== "paid") continue;
            if (payment.type !== "split_by_items") continue;
            for (const itemId of payment.itemIds) uniqueItemIds.add(itemId);
          }
          setPaidSplitItemIds([...uniqueItemIds]);
          return next;
        });
      } catch (error) {
        console.error("ERROR CANCELANDO PAGO PARCIAL", error);
      }
    },
    [partialPayments],
  );

  useEffect(() => {
    if (!comandaLineEditorId) return;
    if (!order.some((l) => l.id === comandaLineEditorId)) {
      setComandaLineEditorId(null);
    }
  }, [order, comandaLineEditorId]);

  useEffect(() => {
    if (!comandaLineEditorId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComandaLineEditorId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comandaLineEditorId]);

  useEffect(() => {
    if (comandaLineEditorId == null) {
      setEditSplitEnabled(false);
      setEditSplitQty(1);
    }
  }, [comandaLineEditorId]);

  const updateCurrentTableOrder = useCallback(
    (updater: (prev: CartOrderLine[]) => CartOrderLine[]) => {
      if (orderIdFromUrl) {
        setOrder(updater);
        return;
      }
      if (!selectedTableId) {
        setOrder((prev) => updater(prev));
        return;
      }
      setOrdersByTable((prev) => {
        const cur = prev[selectedTableId] || [];
        const nextOrder = updater(cur);
        return { ...prev, [selectedTableId]: nextOrder };
      });
      // Mantener `order` sincronizado para el render actual sin cambiar el resto del archivo.
      setOrder((prev) => updater(prev));
    },
    [orderIdFromUrl, selectedTableId],
  );

  const openComandaLineEditor = useCallback((item: CartOrderLine) => {
    setComandaLineEditorId(item.id);
    setEditSplitEnabled(false);
    setEditSplitQty(1);
    const presetNames = new Set(CARTA_PRESET_EXTRAS.map((e) => e.name));
    const fromLine = (item.extras ?? []).map((e) => e.name.trim()).filter(Boolean);
    const selectedPresetExtraNames =
      CARTA_PRESET_EXTRAS.length > 0
        ? fromLine.filter((n) => presetNames.has(n))
        : fromLine;
    setLineEditDraft({
      pase: lineCourseToPaseDraft(item),
      lineNote: item.lineNote?.trim() ?? "",
      extrasPickerOpen: false,
      selectedPresetExtraNames,
    });
  }, []);

  const saveComandaLineEdit = useCallback(() => {
    const id = comandaLineEditorId;
    if (!id) return;
    const trimmedN = lineEditDraft.lineNote.trim();
    const pase = lineEditDraft.pase;
    const draft = lineEditDraft;
    updateCurrentTableOrder((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const item = prev[idx]!;
      const extrasResolved =
        CARTA_PRESET_EXTRAS.length > 0
          ? draft.selectedPresetExtraNames
              .map((n) => CARTA_PRESET_EXTRAS.find((p) => p.name === n))
              .filter((x): x is CartOrderLineExtra => Boolean(x))
          : item.extras;

      const editedLine: CartOrderLine = {
        ...item,
        lineNote: trimmedN || undefined,
        course: pase === 0 ? undefined : pase,
        variantLabel: undefined,
        lineExtra: undefined,
        extras:
          extrasResolved && extrasResolved.length > 0 ? extrasResolved : undefined,
      };

      if (editSplitEnabled && item.quantity > 1) {
        const sameExtras = (a?: CartOrderLineExtra[], b?: CartOrderLineExtra[]) => {
          const aa = a ?? [];
          const bb = b ?? [];
          if (aa.length !== bb.length) return false;
          for (let i = 0; i < aa.length; i++) {
            const x = aa[i]!;
            const y = bb[i]!;
            if (x.name !== y.name) return false;
            if (Number(x.price) !== Number(y.price)) return false;
          }
          return true;
        };
        const sameLineKey = (l: CartOrderLine) =>
          l.product.id === editedLine.product.id &&
          (l.course ?? undefined) === (editedLine.course ?? undefined) &&
          (l.lineNote ?? "") === (editedLine.lineNote ?? "") &&
          sameExtras(l.extras, editedLine.extras) &&
          l.status === editedLine.status;

        const qty =
          Math.max(1, Math.min(item.quantity, Math.floor(Number(editSplitQty) || 1))) || 1;

        // Si se modifican todas las unidades, editar directo (mantener id/addedAt).
        if (qty >= item.quantity) {
          return prev.map((l) => (l.id === id ? editedLine : l));
        }

        const remainingQty = item.quantity - qty;
        const keptOriginal: CartOrderLine = { ...item, quantity: remainingQty };
        const now = Date.now();
        const newLine: CartOrderLine = {
          ...editedLine,
          id: generateOrderLineId(),
          quantity: qty,
          addedAt: now,
          createdAt: now,
        };

        const mergeIntoIndex = prev.findIndex((l, i) => i !== idx && sameLineKey(l));

        if (mergeIntoIndex !== -1) {
          const target = prev[mergeIntoIndex]!;
          const merged: CartOrderLine = { ...target, quantity: target.quantity + qty };
          const base = prev.map((l, i) => (i === mergeIntoIndex ? merged : l));
          return [
            ...base.slice(0, idx),
            keptOriginal,
            ...base.slice(idx + 1),
          ];
        }

        return [...prev.slice(0, idx), keptOriginal, newLine, ...prev.slice(idx + 1)];
      }

      return prev.map((l) => (l.id === id ? editedLine : l));
    });
    setComandaLineEditorId(null);
  }, [
    comandaLineEditorId,
    editSplitEnabled,
    editSplitQty,
    lineEditDraft,
    updateCurrentTableOrder,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setComandaHeaderNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const clickAudio = useMemo(() => {
    if (typeof window === "undefined") return null;
    const audio = new Audio("/sounds/click.mp3");
    audio.volume = 0.3;
    return audio;
  }, []);
  const playClickSound = useCallback(() => {
    if (!clickAudio) return;
    clickAudio.currentTime = 0;
    clickAudio.play().catch(() => {});
  }, [clickAudio]);

  const refreshCatalogFromPlatos = useCallback(() => {
    try {
      // Mismo alcance que /dashboard/productos (`getBrowserRestauranteId` + `loadPlatos`).
      const rid = getBrowserRestauranteId();
      const list = loadPlatos(rid)
        .filter(publicationOnMenu)
        .map(platoCartaToProduct);
      setProducts(list);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
      setProducts([]);
    }
  }, []);

  const parseMoney = useCallback(
    (value: string) => Number(String(value || "").replace(",", ".")) || 0,
    [],
  );

  const calculateFinalTotal = useCallback((baseTotal: number) => {
    const safeBase = Number.isFinite(baseTotal) ? baseTotal : 0;
    const discountAmountValue = Number(
      String(discountAmount ?? "").replace(",", ".") || 0,
    );
    const discountPercentValue = Number(
      String(discountPercent ?? "").replace(",", ".") || 0,
    );
    const percentAmount =
      discountPercentValue > 0 ? (safeBase * discountPercentValue) / 100 : 0;
    const discountTotal = Math.min(discountAmountValue + percentAmount, safeBase);
    const finalTotal = Math.max(safeBase - discountTotal, 0);
    const invPart =
      discountAmountValue > 0 ? Math.min(discountAmountValue, discountTotal) : 0;
    const pctPart = discountTotal > invPart ? discountTotal - invPart : 0;
    return {
      baseTotal: safeBase,
      discountAmountValue,
      discountPercentValue,
      percentAmount,
      discountTotal,
      finalTotal,
      invPart,
      pctPart,
    };
  }, [discountAmount, discountPercent]);

  const total = sumCartOrderLinesTotal(order);
  const preticketDisc = calculateFinalTotal(total);
  const originalTotal = preticketDisc.baseTotal;
  const discountAmountValue = preticketDisc.discountAmountValue;
  const discountPercentValue = preticketDisc.discountPercentValue;
  const discountPercentAmount = preticketDisc.percentAmount;
  const discountTotal = preticketDisc.discountTotal;
  const finalTotal = preticketDisc.finalTotal;

  useEffect(() => {
    const isNormalPaymentFlow =
      !isSplitMode && !isSplitEqualMode && !isSplitItemsMode && !isSplitItemsPayMode;
    if (!isNormalPaymentFlow) return;

    if (paymentMethod !== "card") {
      if (cardReceivedTouched) setCardReceivedTouched(false);
      return;
    }

    if (cardReceivedTouched) return;

    const next = calculateFinalTotal(total).finalTotal.toFixed(2);
    if (cardReceived !== next) setCardReceived(next);
  }, [
    paymentMethod,
    total,
    discountAmount,
    discountPercent,
    isSplitMode,
    isSplitEqualMode,
    isSplitItemsMode,
    isSplitItemsPayMode,
    cardReceivedTouched,
    cardReceived,
    calculateFinalTotal,
  ]);

  const isPaymentValid = useCallback(
    (amountToPay: number) => {
      if (!paymentMethod) return false;

      if (paymentMethod === "cash") {
        return parseMoney(cashReceived) >= amountToPay;
      }

      if (paymentMethod === "card") {
        const cardValue = parseMoney(cardReceived);
        return cardReceived.trim() === "" || cardValue >= amountToPay;
      }

      if (paymentMethod === "voucher") {
        return (
          parseMoney(voucherAmount) >= amountToPay && voucherNumber.trim().length > 0
        );
      }

      return false;
    },
    [paymentMethod, cashReceived, cardReceived, voucherAmount, voucherNumber, parseMoney],
  );

  const finishPaymentAndReturnToMap = useCallback((clearedTableId: string | null) => {
    const selectedTable =
      clearedTableId != null
        ? tablesList.find((t) => t.id === clearedTableId) ?? null
        : null;
    const tableName =
      selectedTable?.name ||
      (selectedTable as { label?: string } | null)?.label ||
      "Mesa";

    setIsPaymentOpen(false);
    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    setVoucherAmount("");
    setVoucherNumber("");
    setDiscountAmount("");
    setDiscountPercent("");
    setOrder([]);
    if (clearedTableId) {
      setOrdersByTable((prev) => ({
        ...prev,
        [clearedTableId]: [],
      }));
      setFirestoreOccupancyStartMsByTable((prev) => {
        const next = { ...prev };
        delete next[clearedTableId];
        return next;
      });
      setOrderTotalsByTable((prev) => {
        const next = { ...prev };
        delete next[clearedTableId];
        return next;
      });
      setLastActivityAtByTable((prev) => {
        const next = { ...prev };
        delete next[clearedTableId];
        return next;
      });
      setFirestoreOccupiedTableIds((prev) => {
        const next = new Set(prev);
        next.delete(clearedTableId);
        return next;
      });
    }
    setSelectedTableId(null);
    setClosingFeedback({ tableName });
    window.setTimeout(() => {
      setClosingFeedback(null);
      setTpvEntryMode("map");
    }, 900);
    setIsInvoice(false);
    setInvoiceName("");
    setInvoiceTaxId("");
    setInvoiceEmail("");
    setIsSplitMode(false);
    setIsSplitEqualMode(false);
    setIsSplitItemsMode(false);
    setIsSplitItemsPayMode(false);
    setSelectedItemIds([]);
    setSplitCount(2);
    setCurrentSplitIndex(1);
    setPaidSplitItemIds([]);
  }, [tablesList]);

  const handleConfirmPayment = useCallback(async (opts?: {
    overrideTotal?: number;
    part?: number;
    totalParts?: number;
    keepModalOpen?: boolean;
    skipCloseTable?: boolean;
    minimalPaymentDoc?: boolean;
  }) => {
    if (!restaurantId) {
      window.alert("No se pudo registrar el cobro");
      return;
    }
    if (!paymentMethod) return;

    const baseTotal =
      typeof opts?.overrideTotal === "number" && Number.isFinite(opts.overrideTotal)
        ? opts.overrideTotal
        : total;
    const breakdown = calculateFinalTotal(baseTotal);
    const amountToCharge = breakdown.finalTotal;

    if (!isPaymentValid(amountToCharge)) return;

    const pm = paymentMethod;
    const cashParsed = parseMoney(cashReceived);
    const cardParsed = parseMoney(cardReceived);
    const voucherValue = parseMoney(voucherAmount);
    const voucherUsed =
      pm === "voucher" ? Math.min(voucherValue, amountToCharge) : 0;
    const voucherRemaining =
      pm === "voucher" ? Math.max(voucherValue - amountToCharge, 0) : 0;

    const receivedVal =
      pm === "voucher"
        ? voucherValue
        : pm === "card"
          ? cardParsed || amountToCharge
          : cashParsed;

    const tipVal =
      pm === "card" ? Math.max((cardParsed || amountToCharge) - amountToCharge, 0) : 0;

    const changeVal = pm === "cash" ? Math.max(cashParsed - amountToCharge, 0) : 0;

    const selectedTable = selectedTableId
      ? tablesList.find((t) => t.id === selectedTableId) ?? null
      : null;
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.getTime().toString().slice(-6);
    const ticketNumber = `T-${datePart}-${timePart}`;
    const invoiceNumber = `F-${datePart}-${timePart}`;

    try {
      const invoiceData = isInvoice
        ? {
            invoiceNumber,
            invoice: {
              name: invoiceName,
              taxId: invoiceTaxId,
              email: invoiceEmail,
            },
          }
        : {};
      console.log("PAYMENT DEBUG", {
        baseTotal,
        finalTotal: breakdown.finalTotal,
      });
      await addDoc(
        collection(db, "payments"),
        opts?.minimalPaymentDoc
          ? {
              restaurantId,
              tableId: selectedTableId || selectedTable?.id || null,
              tableName:
                selectedTable?.name ||
                (selectedTable as { label?: string } | null)?.label ||
                "",
              total: breakdown.finalTotal,
              originalTotal: baseTotal,
              discountAmount: breakdown.discountAmountValue,
              discountPercent: breakdown.discountPercentValue,
              discountPercentAmount: breakdown.percentAmount,
              discountTotal: breakdown.discountTotal,
              finalTotal: breakdown.finalTotal,
              paymentMethod,
              orderSessionId: orderSessionId || null,
              waiterId,
              waiterEmail,
              tip: tipVal,
              received: receivedVal,
              voucherAmount: pm === "voucher" ? voucherValue : null,
              voucherUsed: pm === "voucher" ? voucherUsed : null,
              voucherRemaining: pm === "voucher" ? voucherRemaining : null,
              voucherNumber: pm === "voucher" ? voucherNumber.trim() : null,
              part: opts.part,
              totalParts: opts.totalParts,
              ticketNumber,
              createdAt: Date.now(),
              ...invoiceData,
            }
          : {
              restaurantId,
              tableId: selectedTableId || selectedTable?.id || null,
              tableName:
                selectedTable?.name ||
                (selectedTable as { label?: string } | null)?.label ||
                "",
              total: breakdown.finalTotal,
              originalTotal: baseTotal,
              discountAmount: breakdown.discountAmountValue,
              discountPercent: breakdown.discountPercentValue,
              discountPercentAmount: breakdown.percentAmount,
              discountTotal: breakdown.discountTotal,
              finalTotal: breakdown.finalTotal,
              paymentMethod,
              orderSessionId: orderSessionId || null,
              waiterId,
              waiterEmail,
              tip: tipVal,
              received: receivedVal,
              voucherAmount: pm === "voucher" ? voucherValue : null,
              voucherUsed: pm === "voucher" ? voucherUsed : null,
              voucherRemaining: pm === "voucher" ? voucherRemaining : null,
              voucherNumber: pm === "voucher" ? voucherNumber.trim() : null,
              cashReceived: pm === "cash" ? cashParsed : null,
              change: changeVal,
              ticketNumber,
              status: "paid",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...invoiceData,
            },
      );

      if (pm === "voucher") {
        await upsertVoucherBalanceAfterPayment(
          db,
          restaurantId,
          voucherNumber,
          voucherValue,
          voucherRemaining,
        );
      }

      if (soundEnabled) playClickSound();
      setLastPaymentInfo({
        ticketNumber,
        invoiceNumber: isInvoice ? invoiceNumber : undefined,
      });
      setLastOrderSnapshot(order);
      setLastTicketBreakdown({
        originalTotal: breakdown.baseTotal,
        invPart: breakdown.invPart,
        pctPart: breakdown.pctPart,
        percentValue: breakdown.discountPercentValue,
        finalTotal: breakdown.finalTotal,
        discountTotal: breakdown.discountTotal,
      });
      setIsFinalTicketOpen(true);

      if (selectedTableId && !opts?.skipCloseTable) {
        const closeMs = Date.now();
        await handlePayTableOrder(selectedTableId, { db, restaurantId });
        await updateDoc(doc(db, "tables", selectedTableId), {
          busy: false,
          status: "available",
          currentOrderId: null,
          activeOrderId: null,
          occupancyStartMs: null,
          occupiedAt: null,
          startedAt: null,
          openedAt: null,
          activeLineCount: 0,
          priorityScore: 0,
          total: 0,
          guestCount: 0,
          updatedAt: closeMs,
          closedAt: closeMs,
        });
        setGuestCount(0);
      }

      if (!opts?.keepModalOpen) {
        finishPaymentAndReturnToMap(selectedTableId ?? null);
      }
    } catch (error) {
      console.error("ERROR REGISTRANDO COBRO", error);
      window.alert("No se pudo registrar el cobro");
      return;
    }

    if (opts?.keepModalOpen) {
      setCashReceived("");
      setVoucherAmount("");
      setVoucherNumber("");
    }
    if (opts?.keepModalOpen) {
      setInvoiceName("");
      setInvoiceTaxId("");
      setInvoiceEmail("");
    }
    window.alert(
      `Cobro registrado\nTicket: ${ticketNumber}${
        isInvoice ? `\nFactura: ${invoiceNumber}` : ""
      }`,
    );
  }, [
    cardReceived,
    cashReceived,
    calculateFinalTotal,
    finishPaymentAndReturnToMap,
    isPaymentValid,
    parseMoney,
    playClickSound,
    invoiceEmail,
    invoiceName,
    invoiceTaxId,
    isInvoice,
    lastPaymentInfo,
    order,
    orderSessionId,
    paymentMethod,
    restaurantId,
    selectedTableId,
    soundEnabled,
    tablesList,
    total,
    voucherAmount,
    voucherNumber,
    waiterEmail,
    waiterId,
  ]);

  useEffect(() => {
    if (!authReady) return;
    setProductsLoading(true);
    refreshCatalogFromPlatos();
    setProductsLoading(false);
  }, [authReady, refreshCatalogFromPlatos]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPlatosChanged = () => {
      refreshCatalogFromPlatos();
    };
    window.addEventListener(PLATOS_CHANGED_EVENT, onPlatosChanged);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onPlatosChanged);
  }, [refreshCatalogFromPlatos]);

  useEffect(() => {
    if (!restaurantId || !isFirebaseConfigured) {
      setTablesList([]);
      return;
    }
    let cancelled = false;
    void getTables(restaurantId).then((list) => {
      if (cancelled) return;
      setTablesList(list);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setRestaurantWaiters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await getUsersByRestaurant(restaurantId);
        if (cancelled) return;
        const mapped = (list as RestaurantUserRow[]).map((u) => ({
          id: u.id,
          name: displayRestaurantUserName(u),
        }));
        setRestaurantWaiters(mapped);
      } catch (e) {
        console.error(e);
        if (!cancelled) setRestaurantWaiters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setFirestoreOccupiedTableIds(new Set());
      setFirestoreOccupancyStartMsByTable({});
      setOrderTotalsByTable({});
      setLastActivityAtByTable({});
      setFirestorePaidTableIds(new Set());
      setFirestoreBillRequestedTableIds(new Set());
      setFirestoreOrderNoteByTable({});
      return;
    }

    let cancelled = false;
    const ordersQuery = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );

    const unsub = onSnapshot(ordersQuery, (snapshot) => {
      if (cancelled) return;
      const rows = snapshot.docs.map((d) => {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          createdAt?: unknown;
          openedAt?: unknown;
        };
        return {
          tableId: data.tableId,
          status: data.status,
          createdAt: data.createdAt,
          openedAt: data.openedAt,
        };
      });
      const { occupiedTableIds, oldestActiveCreatedAtMsByTableId } =
        mapOccupancyFromOrderRows(rows);
      setFirestoreOccupiedTableIds(occupiedTableIds);
      setFirestoreOccupancyStartMsByTable(oldestActiveCreatedAtMsByTableId);

      const totals: Record<string, number> = {};
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          total?: unknown;
          items?: Array<{
            total?: unknown;
            quantity?: unknown;
            qty?: unknown;
            price?: unknown;
            precio?: unknown;
          }>;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        const amount = computeOrderDocTotal(data);
        totals[tid] = (totals[tid] ?? 0) + amount;
      }
      setOrderTotalsByTable(totals);

      const lastActivity: Record<string, number> = {};
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          createdAt?: unknown;
          updatedAt?: unknown;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        const updatedMs = readOrderCreatedAtMs(data.updatedAt);
        const createdMs = readOrderCreatedAtMs(data.createdAt);
        const docMs = updatedMs ?? createdMs;
        if (docMs == null) continue;
        const prev = lastActivity[tid];
        if (prev == null || docMs > prev) lastActivity[tid] = docMs;
      }
      setLastActivityAtByTable(lastActivity);

      const paidIds = new Set<string>();
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
        };
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        if (String(data.status ?? "").trim().toLowerCase() === "paid") {
          paidIds.add(tid);
        }
      }
      setFirestorePaidTableIds(paidIds);

      const billReqIds = new Set<string>();
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          paymentRequestedAt?: unknown;
        };
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        if (isPaymentRequestedAtSet(data.paymentRequestedAt)) {
          billReqIds.add(tid);
        }
      }
      setFirestoreBillRequestedTableIds(billReqIds);

      const notesByTable: Record<string, string> = {};
      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          note?: unknown;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        const noteStr = typeof data.note === "string" ? data.note : "";
        if (!(tid in notesByTable)) notesByTable[tid] = noteStr;
      }
      setFirestoreOrderNoteByTable(notesByTable);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (appliedOrderFromUrlRef.current) return;
    if (!orderIdFromUrl || !isFirebaseConfigured || !restaurantId) return;
    appliedOrderFromUrlRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const ref = doc(db, "orders", orderIdFromUrl);
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (!snap.exists()) return;
        const data = snap.data() as FirestoreOrderDocForCart;
        const st = String((data as { status?: string } | null)?.status ?? "")
          .trim()
          .toLowerCase();
        if (st === "paid" || st === "closed") {
          setOrder([]);
          const tid =
            typeof (data as { tableId?: unknown } | null)?.tableId === "string"
              ? ((data as { tableId?: string }).tableId ?? "").trim()
              : "";
          if (tid) {
            setOrdersByTable((prev) => ({ ...prev, [tid]: [] }));
          }
          return;
        }
        const mapped = mapFirestoreOrderDocToCartLines(data, restaurantId);
        if (mapped == null) return;
        if (cancelled) return;
        setOrder(mapped);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderIdFromUrl, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (orderIdFromUrl) setTpvEntryMode("tpv");
  }, [orderIdFromUrl]);

  useEffect(() => {
    if (!orderIdFromUrl || !isFirebaseConfigured || !restaurantId) {
      setOrderUrlDocStatus(null);
      setOrderUrlPaymentRequestedAt(false);
      setOrderUrlOpenedAtMs(null);
      setOrderUrlNote("");
      setOrderUrlTableId(null);
      return;
    }
    const ref = doc(db, "orders", orderIdFromUrl);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setOrderUrlDocStatus(null);
        setOrderUrlPaymentRequestedAt(false);
        setOrderUrlOpenedAtMs(null);
        setOrderUrlNote("");
        setOrderUrlTableId(null);
        return;
      }
      const data = snap.data() as {
        status?: string;
        restaurantId?: string;
        tableId?: string;
        paymentRequestedAt?: unknown;
        createdAt?: unknown;
        openedAt?: unknown;
        note?: unknown;
      };
      if (data.restaurantId !== restaurantId) {
        setOrderUrlDocStatus(null);
        setOrderUrlPaymentRequestedAt(false);
        setOrderUrlOpenedAtMs(null);
        setOrderUrlNote("");
        setOrderUrlTableId(null);
        return;
      }
      const st = data.status;
      setOrderUrlDocStatus(typeof st === "string" ? st : null);
      setOrderUrlPaymentRequestedAt(
        isPaymentRequestedAtSet(data.paymentRequestedAt),
      );
      const oa = getOrderOpenedAt(data);
      setOrderUrlOpenedAtMs(oa ?? null);
      setOrderUrlNote(typeof data.note === "string" ? data.note : "");
      const tid =
        typeof data.tableId === "string" && data.tableId.trim() !== ""
          ? data.tableId.trim()
          : null;
      setOrderUrlTableId(tid);
    });
    return () => unsub();
  }, [orderIdFromUrl, isFirebaseConfigured, restaurantId]);

  const mergeTableIdForOpenOrders = useMemo(() => {
    if (orderIdFromUrl) return orderUrlTableId?.trim() || null;
    return selectedTableId?.trim() || null;
  }, [orderIdFromUrl, orderUrlTableId, selectedTableId]);

  useEffect(() => {
    if (!restaurantId || !isFirebaseConfigured || !mergeTableIdForOpenOrders) {
      setOpenOrderIdsForTable([]);
      return;
    }
    const tid = mergeTableIdForOpenOrders;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("tableId", "==", tid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const open = snap.docs
        .filter((d) =>
          isFirestoreOrderStatusOpen(
            (d.data() as { status?: string }).status,
          ),
        )
        .map((d) => d.id);
      setOpenOrderIdsForTable(open);
    });
    return () => unsub();
  }, [restaurantId, isFirebaseConfigured, mergeTableIdForOpenOrders]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!tableIdFromUrl?.trim()) return;
    const id = tableIdFromUrl.trim();
    const busy = firestoreOccupiedTableIds.has(id);
    if (!busy) {
      setOrder([]);
      setOrdersByTable((prev) => ({ ...prev, [id]: [] }));
    } else {
      setOrdersByTable((prev) =>
        Object.prototype.hasOwnProperty.call(prev, id)
          ? prev
          : { ...prev, [id]: [] },
      );
    }
    setSelectedTableId(id);
    setTpvEntryMode(tpvViewFromUrl === "summary" ? "summary" : "tpv");
  }, [
    orderIdFromUrl,
    tableIdFromUrl,
    tpvViewFromUrl,
    firestoreOccupiedTableIds,
    setOrder,
    setOrdersByTable,
  ]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!isFirebaseConfigured) {
      setTpvEntryMode("tpv");
      return;
    }
    if (authReady && !restaurantId) {
      setTpvEntryMode("tpv");
    }
  }, [orderIdFromUrl, isFirebaseConfigured, authReady, restaurantId]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!selectedTableId) {
      setOrder([]);
      return;
    }
    setOrder(ordersByTable[selectedTableId] || []);
  }, [selectedTableId, ordersByTable, orderIdFromUrl]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!selectedTableId) {
      setGuestCount(0);
      return;
    }
    const t = tablesList.find((x) => x.id === selectedTableId) ?? null;
    const raw =
      (t as { dinersCount?: unknown; guestCount?: unknown } | null)?.dinersCount ??
      (t as { guestCount?: unknown } | null)?.guestCount;
    const next =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0, Math.floor(raw))
        : 0;
    setGuestCount(next);
  }, [orderIdFromUrl, selectedTableId, tablesList]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!isFirebaseConfigured) return;
    if (!restaurantId) return;
    if (!selectedTableId) return;

    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "tables", selectedTableId));
        if (cancelled) return;
        if (!snap.exists()) return;
        const data = snap.data() as { dinersCount?: unknown; guestCount?: unknown };
        const raw = data?.dinersCount ?? data?.guestCount;
        const next =
          typeof raw === "number" && Number.isFinite(raw)
            ? Math.max(0, Math.floor(raw))
            : 0;
        setGuestCount(next);
      } catch (e) {
        console.error("ERROR CARGANDO COMENSALES", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderIdFromUrl, selectedTableId, restaurantId]);

  useEffect(() => {
    if (!orderIdFromUrl || !firstPendingRef.current) return;
    firstPendingRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [orderIdFromUrl, order]);

  const handleQuickAdd = (
    product: Product,
    options?: { course?: ActiveCourseUi },
  ) => {
    // Feedback instantáneo (antes de cualquier otra lógica).
    setIsAddingByProductId((prev) => ({
      ...prev,
      [product.id]: (prev[product.id] ?? 0) + 1,
    }));
    const prevTimeout = addingTimeoutsRef.current[product.id];
    if (prevTimeout) window.clearTimeout(prevTimeout);
    addingTimeoutsRef.current[product.id] = window.setTimeout(() => {
      setIsAddingByProductId((prev) => {
        if (!(product.id in prev)) return prev;
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }, 420);

    /* Pase activo en UI traducido al campo numérico `course` (1-4) que ya
       existe en `CartOrderLine`. Si quien llama no pasa nada, usamos
       `activeCourse` actual (por defecto "starter" → 1). */
    const courseUi: ActiveCourseUi = options?.course ?? activeCourse;
    const courseNum = ACTIVE_COURSE_TO_NUM[courseUi];

    updateCurrentTableOrder((prev) => {
      const audio = new Audio("/sounds/click.mp3");
      audio.volume = 0.3;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      const existingIndex = prev.findIndex(
        (i) =>
          i.product.id === product.id &&
          i.status === "pending" &&
          !i.lineNote &&
          !i.extras &&
          !i.variantLabel &&
          !i.lineExtra &&
          /* Solo merge si comparten pase: si el usuario ha cambiado el
             pase activo entre tap y tap, queremos líneas separadas para
             que cocina respete los cursos. Si la línea existente no tiene
             course, se considera equivalente al pase 1 (starter). */
          (normalizeComandaCourseForStorage(i.course) ?? 1) === courseNum,
      );

      if (existingIndex !== -1) {
        const updated = [...prev];
        const cur = updated[existingIndex]!;
        updated[existingIndex] = { ...cur, quantity: cur.quantity + 1 };
        return updated;
      }

      return [
        ...prev,
        {
          id: generateOrderLineId(),
          product,
          quantity: 1,
          status: "pending",
          addedAt: Date.now(),
          createdAt: Date.now(),
          course: courseNum,
        },
      ];
    });
  };

  const handleIncrementLine = (lineId: string) => {
    updateCurrentTableOrder((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, quantity: l.quantity + 1 } : l,
      ),
    );
  };

  const stopHoldAdd = () => {
    if (holdTimeoutRef.current != null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current != null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    const pid = holdActiveProductIdRef.current;
    if (pid && holdDidRepeatRef.current) {
      suppressClickUntilByProductIdRef.current[pid] = Date.now() + 250;
    }
    holdActiveProductIdRef.current = null;
    holdDidRepeatRef.current = false;
  };

  const handleSendItem = useCallback(
    async (itemId: string) => {
      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) =>
          l.id === itemId && l.status === "pending"
            ? { ...l, status: "sent" as const, sentAt: Date.now() }
            : l,
        );
        return next;
      });
      if (orderIdFromUrl && isFirebaseConfigured) {
        try {
          await updateDoc(doc(db, "orders", orderIdFromUrl), {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("handleSendItem", e);
        }
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const handleSendAllItems = useCallback(async () => {
    let next: CartOrderLine[] = [];
    let didSend = false;
    updateCurrentTableOrder((prev) => {
      if (getPendingItems(prev).length === 0) {
        next = prev;
        return prev;
      }
      didSend = true;
      const now = Date.now();
      next = prev.map((l) =>
        l.status === "pending"
          ? { ...l, status: "sent" as const, sentAt: now }
          : l,
      );
      return next;
    });
    if (!didSend || !orderIdFromUrl || !isFirebaseConfigured) return;
    try {
      await updateDoc(doc(db, "orders", orderIdFromUrl), {
        items: orderLinesToFirestoreItems(next),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("handleSendAllItems", e);
    }
  }, [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder]);

  const handleServeItem = useCallback(
    async (itemId: string) => {
      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) =>
          l.id === itemId && (l.status === "sent" || l.status === "prepared")
            ? { ...l, status: "served" as const, servedAt: Date.now() }
            : l,
        );
        return next;
      });
      if (orderIdFromUrl && isFirebaseConfigured) {
        try {
          await updateDoc(doc(db, "orders", orderIdFromUrl), {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("handleServeItem", e);
        }
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const handleCancelPersistedLine = useCallback(
    async (itemId: string) => {
      if (!orderIdFromUrl || !isFirebaseConfigured) return;
      const ok = window.confirm("¿Cancelar este producto de la comanda?");
      if (!ok) return;

      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) =>
          l.id === itemId && l.status !== "pending" && l.status !== "cancelled"
            ? { ...l, status: "cancelled" as const, cancelledAt: Date.now() }
            : l,
        );
        return next;
      });

      try {
        await updateDoc(doc(db, "orders", orderIdFromUrl), {
          items: orderLinesToFirestoreItems(next),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error("handleCancelPersistedLine", e);
        window.alert("No se pudo cancelar el producto. Inténtalo otra vez.");
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const handleRemoveOnePersistedUnit = useCallback(
    async (itemId: string) => {
      if (!orderIdFromUrl || !isFirebaseConfigured) return;
      const ok = window.confirm("¿Quitar 1 unidad de este producto?");
      if (!ok) return;

      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          if (l.id !== itemId) return l;
          if (l.status === "pending" || l.status === "cancelled") return l;
          const q = Number(l.quantity) || 0;
          if (q > 1) return { ...l, quantity: q - 1 };
          return { ...l, status: "cancelled" as const, cancelledAt: Date.now() };
        });
        return next;
      });

      try {
        await updateDoc(doc(db, "orders", orderIdFromUrl), {
          items: orderLinesToFirestoreItems(next),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error("handleRemoveOnePersistedUnit", e);
        window.alert("No se pudo actualizar la cantidad. Inténtalo otra vez.");
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const handleRemoveOneUnitFromLine = useCallback(
    async (line: CartOrderLine) => {
      if (!isFirebaseConfigured) return;
      const ok = window.confirm("¿Quitar 1 unidad de este producto?");
      if (!ok) return;

      const selectedLine = line;
      console.log("REMOVE ONE REAL LINE", selectedLine);

      const lineAny = line as unknown as {
        itemId?: unknown;
        orderItemId?: unknown;
        firestoreId?: unknown;
        orderItemDocId?: unknown;
        orderId?: unknown;
        source?: unknown;
        qty?: unknown;
        quantity?: unknown;
      };
      const orderItemDocId =
        typeof lineAny.orderItemDocId === "string" && lineAny.orderItemDocId.trim()
          ? lineAny.orderItemDocId.trim()
          : null;

      const orderDocId =
        (typeof lineAny.orderId === "string" && lineAny.orderId.trim()
          ? lineAny.orderId.trim()
          : null) ??
        (orderIdFromUrl && orderIdFromUrl.trim() ? orderIdFromUrl.trim() : null) ??
        (openOrderIdsForTable.length > 0 ? openOrderIdsForTable[0]! : null);

      const qtyRaw =
        Number(
          (line as unknown as { quantity?: unknown; qty?: unknown }).quantity ??
            (line as unknown as { qty?: unknown }).qty,
        ) || 0;
      const qty = qtyRaw;
      const nextQty = Math.max(qty - 1, 0);
      const shouldCancel = qty <= 1;
      const quantityField =
        Object.prototype.hasOwnProperty.call(lineAny, "qty") ? "qty" : "quantity";

      const src =
        typeof lineAny.source === "string" && lineAny.source.trim()
          ? lineAny.source.trim()
          : orderItemDocId
            ? "orderItems"
            : "orders.items";

      console.log("REMOVE ONE SOURCE", {
        source: src,
        orderId: orderDocId,
        orderItemDocId,
        quantityField,
        previousQuantity: qty,
        nextQuantity: shouldCancel ? 0 : nextQty,
      });

      // Siempre actualiza UI local (comanda) para feedback inmediato.
      updateCurrentTableOrder((prev) =>
        prev.map((l) => {
          if (l.id !== selectedLine.id) return l;
          if (l.status === "pending") return l;
          if (shouldCancel) {
            return { ...l, status: "cancelled" as const, cancelledAt: Date.now() };
          }
          return { ...l, quantity: Math.max((Number(l.quantity) || 0) - 1, 0) };
        }),
      );

      // 1) orderItems/{id} (si existe)
      if (orderItemDocId) {
        try {
          const payloadBase: Record<string, unknown> = {
            updatedAt: Date.now(),
          };
          if (shouldCancel) {
            await updateDoc(doc(db, "orderItems", orderItemDocId), {
              ...payloadBase,
              status: "cancelled",
              cancelledAt: Date.now(),
            });
          } else {
            const existingHasQtyField = Object.prototype.hasOwnProperty.call(lineAny, "qty");
            await updateDoc(doc(db, "orderItems", orderItemDocId), {
              ...payloadBase,
              quantity: nextQty,
              ...(existingHasQtyField ? { qty: nextQty } : {}),
            } as Record<string, unknown>);
          }

          console.log("REMOVE ONE FIRESTORE WRITE OK");
        } catch (e) {
          console.error("REMOVE ONE FIRESTORE WRITE ERROR", e);
        }
      }

      // 2) orders/{id}.items[] (si existe)
      if (orderDocId) {
        let next: CartOrderLine[] = [];
        updateCurrentTableOrder((prev) => {
          next = prev.map((l) => {
            if (l.id !== selectedLine.id) return l;
            if (l.status === "pending") return l;
            if (shouldCancel) {
              return { ...l, status: "cancelled" as const, cancelledAt: Date.now() };
            }
            return { ...l, quantity: Math.max((Number(l.quantity) || 0) - 1, 0) };
          });
          return next;
        });

        try {
          await updateDoc(doc(db, "orders", orderDocId), {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          });
          console.log("REMOVE ONE FIRESTORE WRITE OK");
        } catch (e) {
          console.error("REMOVE ONE FIRESTORE WRITE ERROR", e);
        }
      }

      setEditSplitEnabled(false);
      setEditSplitQty(1);
      setComandaLineEditorId(null);
    },
    [
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
    ],
  );

  const handleCancelProductFromLine = useCallback(
    async (line: CartOrderLine) => {
      if (!isFirebaseConfigured) return;
      const ok = window.confirm("¿Cancelar este producto de la comanda?");
      if (!ok) return;

      const selectedLine = line;
      const lineAny = line as unknown as { orderId?: unknown };
      const orderDocId =
        (typeof lineAny.orderId === "string" && lineAny.orderId.trim()
          ? lineAny.orderId.trim()
          : null) ??
        (orderIdFromUrl && orderIdFromUrl.trim() ? orderIdFromUrl.trim() : null) ??
        (openOrderIdsForTable.length > 0 ? openOrderIdsForTable[0]! : null);

      if (!orderDocId) return;

      console.log("CANCEL PRODUCT", {
        lineId: selectedLine.id,
        orderId: orderDocId,
      });

      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          if (l.id !== selectedLine.id) return l;
          if (l.status === "pending") return l;
          return { ...l, status: "cancelled" as const, cancelledAt: Date.now() };
        });
        return next;
      });

      try {
        await updateDoc(doc(db, "orders", orderDocId), {
          items: orderLinesToFirestoreItems(next),
          updatedAt: Date.now(),
        });
        console.log("CANCEL PRODUCT OK");
      } catch (error) {
        console.error("CANCEL PRODUCT ERROR", error);
      }

      setEditSplitEnabled(false);
      setEditSplitQty(1);
      setComandaLineEditorId(null);
    },
    [
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
    ],
  );

  const handleCompProductFromLine = useCallback(
    async (line: CartOrderLine) => {
      if (!isFirebaseConfigured) return;
      const ok = window.confirm("¿Invitar este producto?");
      if (!ok) return;

      const lineEditorTarget = line;
      const lineAny = line as unknown as { orderId?: unknown; orderItemDocId?: unknown };
      const orderItemDocId =
        typeof lineAny.orderItemDocId === "string" && lineAny.orderItemDocId.trim()
          ? lineAny.orderItemDocId.trim()
          : null;
      const orderId =
        (typeof lineAny.orderId === "string" && lineAny.orderId.trim()
          ? lineAny.orderId.trim()
          : null) ??
        (orderIdFromUrl && orderIdFromUrl.trim() ? orderIdFromUrl.trim() : null) ??
        (openOrderIdsForTable.length > 0 ? openOrderIdsForTable[0]! : null);

      const nowMs = Date.now();

      console.log("COMP PRODUCT START", {
        orderId,
        orderItemDocId,
        targetId: lineEditorTarget?.id,
      });

      let next: CartOrderLine[] = [];
      let didMatch = false;
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          if (l.id !== lineEditorTarget.id) return l;
          console.log("COMP PRODUCT MATCH FOUND", l);
          didMatch = true;
          return {
            ...l,
            isComped: true,
            compedAt: nowMs,
            compedReason: "Invitación",
          };
        });
        return next;
      });

      if (!didMatch) {
        console.error("COMP PRODUCT LINE NOT FOUND", {
          targetId: lineEditorTarget?.id,
          availableIds: order.map((l) => l.id),
          lineEditorTarget,
        });
      }

      console.log(
        "COMP PRODUCT NEXT LINE",
        next.find((l) => l.id === lineEditorTarget.id),
      );

      try {
        // 1) orderItems/{id} (si existe)
        if (orderItemDocId) {
          await updateDoc(doc(db, "orderItems", orderItemDocId), {
            isComped: true,
            compedAt: nowMs,
            compedReason: "Invitación",
            updatedAt: nowMs,
          });
        }

        // 2) orders/{id}.items[] (si existe)
        if (orderId) {
          await updateDoc(doc(db, "orders", orderId), {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          });
        }

        console.log("COMP PRODUCT FIRESTORE OK", { orderId, orderItemDocId });
      } catch (error) {
        console.error("COMP PRODUCT FIRESTORE ERROR", error);
      }

      setComandaLineActionsOpen(false);
      setComandaLineActionsTargetId(null);
    },
    [
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
      order,
    ],
  );

  const handleRepeatItem = useCallback(
    async (item: CartOrderLine) => {
      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        const dup: CartOrderLine = {
          ...item,
          id: generateOrderLineId(),
          status: "pending",
          addedAt: Date.now(),
          createdAt: Date.now(),
          sentAt: undefined,
          preparedAt: undefined,
          servedAt: undefined,
        };
        next = [...prev, dup];
        return next;
      });
      if (orderIdFromUrl && isFirebaseConfigured) {
        try {
          await updateDoc(doc(db, "orders", orderIdFromUrl), {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("handleRepeatItem", e);
        }
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const advanceLineStatusKitchen = useCallback(
    (lineId: string) => {
      void handleServeItem(lineId);
    },
    [handleServeItem],
  );

  const handleMarkTableAsDone = (tableId: string) => {
    setOrdersByTable((prev) => {
      const updated = { ...prev };

      if (!updated[tableId]) return prev;

      updated[tableId] = updated[tableId].map((item) => ({
        ...item,
        status: "served" as const,
        servedAt: Date.now(),
      }));

      return updated;
    });
  };

  const handleDecrementLine = (lineId: string) => {
    updateCurrentTableOrder((prev) =>
      prev
        .map((item) =>
          item.id === lineId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  /**
   * Long-press desde la grid: quita 1 unidad del producto.
   * Reutiliza `handleDecrementLine` (estado local) y SOLO toca líneas con
   * status `pending` para no chocar con líneas ya enviadas a Firestore.
   * Devuelve `true` si encontró línea pendiente y decrementó.
   */
  const handleQuickRemoveOne = (product: Product): boolean => {
    let target: CartOrderLine | null = null;
    let targetAt = -1;
    for (const line of order) {
      if (line.product?.id !== product.id) continue;
      if (line.status !== "pending") continue;
      const at = Number(line.addedAt) || Number(line.createdAt) || 0;
      if (at >= targetAt) {
        target = line;
        targetAt = at;
      }
    }
    if (!target) return false;
    handleDecrementLine(target.id);
    return true;
  };

  /**
   * Limpia TODOS los timers/intervalos del gesto de presión sostenida
   * (tap-and-hold) sobre una tarjeta de producto y resetea el feedback
   * visual (clases `repeating` y `holding`). Se invoca al soltar, salir
   * de la tarjeta o cancelar el puntero.
   */
  const clearRepeatAndHoldGesture = () => {
    if (removeHoldTimeoutRef.current != null) {
      window.clearTimeout(removeHoldTimeoutRef.current);
      removeHoldTimeoutRef.current = null;
    }
    if (removeHoldClassTimeoutRef.current != null) {
      window.clearTimeout(removeHoldClassTimeoutRef.current);
      removeHoldClassTimeoutRef.current = null;
    }
    if (removeRepeatAddIntervalRef.current != null) {
      window.clearInterval(removeRepeatAddIntervalRef.current);
      removeRepeatAddIntervalRef.current = null;
    }
    setHoldingProductId(null);
    setRepeatingProductId(null);
  };

  const handleRemoveLine = (lineId: string) => {
    updateCurrentTableOrder((prev) =>
      prev.filter((item) => !(item.id === lineId && item.status === "pending")),
    );
  };

  const handleComanda = useCallback(async (): Promise<boolean> => {
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (order.length === 0) return false;
    if (isComandaSending) return false;
    if (!order.some((l) => l.status === "pending")) return false;

    const tableLabel =
      tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
      selectedTableId;

    setIsComandaSending(true);
    try {
      const now = Date.now();
      const pendingLines = order.filter((l) => l.status === "pending");
      const hadPending = pendingLines.length > 0;

      const nextOrder = order.map((l) =>
        l.status === "pending"
          ? { ...l, status: "sent" as const, sentAt: l.sentAt ?? now }
          : l,
      );

      updateCurrentTableOrder(() => nextOrder);

      if (hadPending) {
        const items = orderLinesToFirestoreItems(nextOrder);
        const grandTotal = items.reduce(
          (acc, it) => acc + (Number(it.total) || 0),
          0,
        );

        const existingOrderId =
          orderIdFromUrl && orderIdFromUrl.trim() !== ""
            ? orderIdFromUrl
            : openOrderIdsForTable.length > 0
              ? openOrderIdsForTable[0]!
              : null;

        const persistedOrderRef = existingOrderId
          ? doc(db, "orders", existingOrderId)
          : await addDoc(collection(db, "orders"), {
              restaurantId,
              tableId: selectedTableId,
              table: tableLabel,
              status: "sent",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              items,
              total: Number.isFinite(grandTotal) ? grandTotal : 0,
            });

        if (existingOrderId) {
          await updateDoc(persistedOrderRef, {
            status: "sent",
            updatedAt: serverTimestamp(),
            items,
            total: Number.isFinite(grandTotal) ? grandTotal : 0,
          });
        }

        const batch = writeBatch(db);
        pendingLines.forEach((l) => {
          const ref = doc(collection(db, "orderItems"));
          const lCourse = normalizeComandaCourseForStorage(l.course);
          const extrasPayload = Array.isArray(l.extras)
            ? l.extras
                .filter((ex) => ex && typeof ex.name === "string")
                .map((ex) => ({
                  name: String(ex.name).trim(),
                  price: Number.isFinite(Number(ex.price))
                    ? Number(ex.price)
                    : 0,
                }))
                .filter((ex) => ex.name !== "")
            : [];
          batch.set(ref, {
            restaurantId,
            orderId: persistedOrderRef.id,
            tableId: selectedTableId,
            tableName: tableLabel,
            name: l.product.nombre,
            quantity: l.quantity,
            status: "pending",
            sentAt: now,
            createdAt: now,
            updatedAt: now,
            categoryName: l.product.categoria ?? undefined,
            course: lCourse ?? 1,
            extras: extrasPayload,
            note: l.lineNote?.trim() ?? "",
          });
        });
        await batch.commit();
      }

      /* Tras enviar entrantes con éxito, pasar el selector a Segundos para
         acelerar el flujo real del camarero (sin tocar order ni Firestore). */
      if (activeCourse === "starter") {
        setActiveCourse("main");
      }

      setComandaSentFlash(true);
      if (comandaFlashTimeoutRef.current != null) {
        window.clearTimeout(comandaFlashTimeoutRef.current);
      }
      comandaFlashTimeoutRef.current = window.setTimeout(() => {
        setComandaSentFlash(false);
        comandaFlashTimeoutRef.current = null;
      }, 1000);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      setIsComandaSending(false);
    }
  }, [
    selectedTableId,
    tablesList,
    restaurantId,
    isFirebaseConfigured,
    order,
    isComandaSending,
    updateCurrentTableOrder,
    orderIdFromUrl,
    openOrderIdsForTable,
    activeCourse,
  ]);

  const handleGuardarComandaLocal = () => {
    if (!selectedTableId) return;
    setOrdersByTable((prev) => ({
      ...prev,
      [selectedTableId]: order,
    }));
    console.log("COMANDA GUARDADA", selectedTableId, order);
  };

  const handleMarkOrderClosed = async () => {
    if (!orderIdFromUrl || !isFirebaseConfigured) return;
    const ref = doc(db, "orders", orderIdFromUrl);
    await updateDoc(ref, {
      status: "closed",
      closedAt: serverTimestamp(),
    });
    setOrder([]);
  };

  const categoryTabNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const cat = p.categoria || "Sin categoría";
      if (categoryMenuGroup(cat) === menuGroup) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [products, menuGroup]);

  /** Categoría aplicada al grid: la seleccionada o la primera real (sin chip "Todos"). */
  const effectiveSelectedCategory = useMemo(() => {
    if (categoryTabNames.length === 0) return null;
    if (
      selectedCategory != null &&
      categoryTabNames.includes(selectedCategory)
    ) {
      return selectedCategory;
    }
    return categoryTabNames[0];
  }, [selectedCategory, categoryTabNames]);

  useEffect(() => {
    setSelectedCategory((prev) => {
      if (categoryTabNames.length === 0) return null;
      if (prev !== null && categoryTabNames.includes(prev)) return prev;
      return categoryTabNames[0];
    });
  }, [menuGroup, categoryTabNames]);

  const filteredProducts = useMemo(() => {
    const inGroup = products.filter(
      (p) =>
        categoryMenuGroup(p.categoria || "Sin categoría") === menuGroup,
    );
    if (!effectiveSelectedCategory) return inGroup;
    return inGroup.filter(
      (p) => (p.categoria || "Sin categoría") === effectiveSelectedCategory,
    );
  }, [products, menuGroup, effectiveSelectedCategory]);

  const groupedProducts = useMemo(
    () =>
      filteredProducts.reduce<Record<string, Product[]>>((acc, product) => {
        const cat = product.categoria || "Sin categoría";

        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(product);

        return acc;
      }, {}),
    [filteredProducts],
  );

  const showAuthSpinner = !authReady;
  const showProductsSpinner = authReady && productsLoading && !error;

  /** Mesas de Firestore + ids con comanda solo en memoria (`ordersByTable` por `table.id`). */
  const displayMesas = useMemo(() => {
    const map = new Map<string, Table | null>();
    for (const mesa of tablesList) {
      const id = String(mesa.id ?? "").trim();
      if (!id) continue;
      map.set(id, mesa);
    }
    for (const key of Object.keys(ordersByTable)) {
      if (!map.has(key)) map.set(key, null);
    }
    return [...map.entries()].sort((a, b) => {
      const la = (a[1]?.name ?? a[0]).toString();
      const lb = (b[1]?.name ?? b[0]).toString();
      return la.localeCompare(lb, "es", { numeric: true });
    });
  }, [tablesList, ordersByTable]);

  const tablesForTpvMap = useMemo(() => {
    const list = filterTablesForTpvMap(tablesList);
    return [...list].sort(sortTablesForTpvMap);
  }, [tablesList]);

  const mapZoneOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tablesForTpvMap) {
      set.add(t.zone ?? "restaurante");
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [tablesForTpvMap]);

  const tablesVisibleOnMap = useMemo(() => {
    if (mapZoneFilter === "__all__") return tablesForTpvMap;
    return tablesForTpvMap.filter(
      (t) => (t.zone ?? "restaurante") === mapZoneFilter,
    );
  }, [tablesForTpvMap, mapZoneFilter]);

  const tablesFilteredByWaiter = useMemo(() => {
    return tablesVisibleOnMap.filter((table) => {
      if (waiterFilter === "all") return true;
      if (waiterFilter === "me") return table.waiterId === user?.uid;
      return table.waiterId === waiterFilter;
    });
  }, [tablesVisibleOnMap, waiterFilter, user?.uid]);

  const enrichedTables = useMemo(() => {
    const list = tablesFilteredByWaiter.filter((tbl) => String(tbl.id ?? "").trim() !== "");
    return list.map((tbl) => {
      const tableId = String(tbl.id ?? "").trim();
      return {
        ...tbl,
        activeLineCount: ordersByTable[tableId]?.length ?? 0,
        busy:
          firestoreOccupiedTableIds.has(tableId) ||
          (ordersByTable[tableId]?.length ?? 0) > 0,
      };
    });
  }, [tablesFilteredByWaiter, firestoreOccupiedTableIds, ordersByTable]);

  const tablesById = useMemo(() => {
    const map: Record<string, Table> = {};
    for (const t of tablesList) {
      const id = String(t.id ?? "").trim();
      if (id) map[id] = t;
    }
    return map;
  }, [tablesList]);

  /** Mesas con al menos una order activa en Firestore (misma regla que `mapOccupancyFromOrderRows`). */
  const openOrdersByTable = useMemo(() => {
    const m: Record<string, true> = {};
    for (const id of firestoreOccupiedTableIds) {
      m[id] = true;
    }
    return m;
  }, [firestoreOccupiedTableIds]);

  /** Por mesa: instante de la comanda activa más antigua (ms), alineado con ocupación. */
  const orderOpenedAtByTable = firestoreOccupancyStartMsByTable;

  /** Resumen numérico de mesas visibles (respeta `tablesFilteredByWaiter`). */
  const mapQuickSummary = useMemo(() => {
    let total = 0;
    let busy = 0;
    let warning = 0;
    let critical = 0;
    for (const t of tablesFilteredByWaiter) {
      const id = String(t.id ?? "").trim();
      if (!id) continue;
      total += 1;
      const openedAtMs = orderOpenedAtByTable[id];
      const openedAt =
        typeof openedAtMs === "number" && Number.isFinite(openedAtMs)
          ? openedAtMs
          : undefined;
      const orderTotal = orderTotalsByTable[id];
      const pl = computeMapVisualPriorityLevel(openedAt, now, orderTotal);
      if (openOrdersByTable[id]) busy += 1;
      if (pl === 2) warning += 1;
      if (pl === 3) critical += 1;
    }
    return { total, busy, warning, critical };
  }, [
    tablesFilteredByWaiter,
    openOrdersByTable,
    orderOpenedAtByTable,
    orderTotalsByTable,
    now,
  ]);

  const mapSummaryAlertLevel = useMemo((): "normal" | "warning" | "critical" => {
    if (mapQuickSummary.critical > 0) return "critical";
    if (mapQuickSummary.warning > 0) return "warning";
    return "normal";
  }, [mapQuickSummary.critical, mapQuickSummary.warning]);

  const mapTablePriorityScore = useCallback(
    (tbl: Table) => {
      const tableId = String(tbl.id ?? "").trim();
      const busy =
        firestoreOccupiedTableIds.has(tableId) ||
        (ordersByTable[tableId]?.length ?? 0) > 0;
      const occupancyStartMs = firestoreOccupancyStartMsByTable[tableId] ?? null;
      const minutesOccupied =
        occupancyStartMs != null
          ? Math.max(0, (now - occupancyStartMs) / 60000)
          : 0;
      const activeLineCount = ordersByTable[tableId]?.length ?? 0;
      const isCritical =
        busy &&
        occupancyStartMs != null &&
        minutesOccupied >= 45 &&
        activeLineCount >= 8;
      return (
        (isCritical ? 1000 : 0) +
        (busy ? 100 : 0) +
        minutesOccupied +
        activeLineCount * 2
      );
    },
    [firestoreOccupiedTableIds, firestoreOccupancyStartMsByTable, ordersByTable, now],
  );

  const sortedTables = useMemo(() => {
    const tables = enrichedTables;

    type EnrichedRow = Table & { activeLineCount: number; busy: boolean };

    const getStableKey = (t: EnrichedRow) => {
      const id = String(t.id ?? "").trim();
      const time = firestoreOccupancyStartMsByTable[id] || 0;
      return `${id}-${t.busy}-${t.activeLineCount}-${time}-${mapTablePriorityScore(t)}`;
    };

    const currentKeys = tables.map(getStableKey);

    const isSame =
      currentKeys.length === lastSortedRef.current.length &&
      currentKeys.every((k, i) => k === lastSortedRef.current[i]);

    if (isSame) {
      return lastResultRef.current;
    }

    const result = [...tables]
      .sort((a, b) => {
        const scoreA = mapTablePriorityScore(a);
        const scoreB = mapTablePriorityScore(b);

        if (scoreB !== scoreA) return scoreB - scoreA;
        if (a.busy !== b.busy) return a.busy ? -1 : 1;

        const timeA = firestoreOccupancyStartMsByTable[a.id] || 0;
        const timeB = firestoreOccupancyStartMsByTable[b.id] || 0;
        if (timeA !== timeB) return timeA - timeB;

        if (b.activeLineCount !== a.activeLineCount) {
          return b.activeLineCount - a.activeLineCount;
        }

        return String(a.id).localeCompare(String(b.id));
      })
      .map(({ activeLineCount: _al, busy: _b, ...tbl }) => tbl);

    lastSortedRef.current = [...currentKeys];
    lastResultRef.current = result;

    return result;
  }, [
    enrichedTables,
    firestoreOccupancyStartMsByTable,
    firestoreOccupiedTableIds,
    mapTablePriorityScore,
    ordersByTable,
  ]);

  /** Mesas críticas/altas encima; sin cambiar x/y (solo orden de pintado). */
  const mapTablesOrderedByVisualPriority = useMemo(() => {
    return [...sortedTables].sort((a, b) => {
      const idA = String(a.id ?? "").trim();
      const idB = String(b.id ?? "").trim();
      const pa = computeMapVisualPriorityLevel(
        orderOpenedAtByTable[idA],
        now,
        orderTotalsByTable[idA],
      );
      const pb = computeMapVisualPriorityLevel(
        orderOpenedAtByTable[idB],
        now,
        orderTotalsByTable[idB],
      );
      if (pa !== pb) return pa - pb;
      return idA.localeCompare(idB);
    });
  }, [sortedTables, orderOpenedAtByTable, orderTotalsByTable, now]);

  const criticalTables = useMemo(() => {
    return mapTablesOrderedByVisualPriority.filter((t) => {
      const id = String(t.id ?? "").trim();
      const pl = computeMapVisualPriorityLevel(
        orderOpenedAtByTable[id],
        now,
        orderTotalsByTable[id],
      );
      const lastA = lastActivityAtByTable[id];
      const inactiveMin =
        lastA != null && Number.isFinite(lastA)
          ? Math.max(0, Math.floor((now - lastA) / 60000))
          : 0;
      return pl === 3 || inactiveMin >= 20;
    });
  }, [
    mapTablesOrderedByVisualPriority,
    orderOpenedAtByTable,
    orderTotalsByTable,
    lastActivityAtByTable,
    now,
  ]);

  /** En modo «Mis mesas», misma criticidad que `criticalTables` (ya acotada al mapa filtrado). */
  const myCriticalTables = useMemo(() => {
    if (waiterFilter !== "me") return [];
    return criticalTables;
  }, [waiterFilter, criticalTables]);

  useMemo(() => {
    const now = Date.now();
    if (now - lastChangeTsRef.current < 120) {
      rapidChangesRef.current++;
    } else {
      rapidChangesRef.current = 0;
    }
    lastChangeTsRef.current = now;
  }, [sortedTables]);

  const isHeavyLoad = sortedTables.length > 20;
  const isUltraFastMode = isHeavyLoad || rapidChangesRef.current > 5;

  const [restaurantWaiters, setRestaurantWaiters] = useState<
    { id: string; name: string }[]
  >([]);

  const handleMapWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const showTableMap = useMemo(
    () =>
      viewMode === "normal" &&
      tpvEntryMode === "map" &&
      !orderIdFromUrl &&
      authReady &&
      isFirebaseConfigured &&
      Boolean(restaurantId),
    [
      viewMode,
      tpvEntryMode,
      orderIdFromUrl,
      authReady,
      isFirebaseConfigured,
      restaurantId,
    ],
  );

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    update();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", update);
    } else {
      mediaQuery.addListener(update);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", update);
      } else {
        mediaQuery.removeListener(update);
      }
    };
  }, []);

  /** Scroll al bloque cuenta/total cuando se abre el TPV con `tpvView=summary`. */
  const tpvBillScrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (tpvEntryMode !== "summary") return;
    if (!selectedTableId) return;
    const el = tpvBillScrollAnchorRef.current;
    if (!el) return;
    el.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setTpvEntryMode("tpv");
  }, [tpvEntryMode, selectedTableId, prefersReducedMotion]);

  const getTableFlipRefCallback = useCallback((tableId: string) => {
    const cache = tableFlipRefCallbackCacheRef.current;
    if (!cache[tableId]) {
      cache[tableId] = (el: HTMLDivElement | null) => {
        tableFlipElementsRef.current[tableId] = el;
      };
    }
    return cache[tableId];
  }, []);

  useEffect(() => {
    if (!showTableMap) {
      for (const id in tableFlipRafRef.current) {
        cancelAnimationFrame(tableFlipRafRef.current[id]);
      }
      tableFlipRafRef.current = {};
      tableFlipPositionsRef.current = {};
      tableFlipElementsRef.current = {};
    }
  }, [showTableMap]);

  useLayoutEffect(() => {
    if (!showTableMap) return;

    if (prefersReducedMotion || isUltraFastMode) {
      const positions = tableFlipPositionsRef.current;
      const elements = tableFlipElementsRef.current;
      for (const id in elements) {
        const el = elements[id];
        if (!el) continue;
        positions[id] = el.getBoundingClientRect();
      }
      return;
    }

    const positions = tableFlipPositionsRef.current;
    const elements = tableFlipElementsRef.current;
    const ids = new Set<string>();

    for (const table of sortedTables) {
      const id = String(table.id ?? "").trim();
      if (!id) continue;
      ids.add(id);

      const el = elements[id];
      if (!el) continue;

      const newRect = el.getBoundingClientRect();
      const oldRect = positions[id];

      if (!oldRect) {
        positions[id] = newRect;
        continue;
      }

      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;

      if (dx === 0 && dy === 0) {
        positions[id] = newRect;
        continue;
      }

      const prevRaf = tableFlipRafRef.current[id];
      if (prevRaf) {
        cancelAnimationFrame(prevRaf);
        delete tableFlipRafRef.current[id];
        el.style.transform = "";
        el.style.transition = "";
      }

      el.style.transition = "transform 0s";
      el.style.transform = `translate(${dx}px, ${dy}px)`;

      void el.offsetHeight;

      const rafId = requestAnimationFrame(() => {
        el.style.transition =
          prefersReducedMotion || isInteractingRef.current || isUltraFastMode
            ? "none"
            : "transform 220ms ease";
        el.style.transform = "";
        delete tableFlipRafRef.current[id];
      });

      tableFlipRafRef.current[id] = rafId;

      positions[id] = newRect;
    }

    for (const key of Object.keys(positions)) {
      if (!ids.has(key)) {
        const staleRaf = tableFlipRafRef.current[key];
        if (staleRaf) {
          cancelAnimationFrame(staleRaf);
          delete tableFlipRafRef.current[key];
        }
        delete positions[key];
        delete elements[key];
      }
    }

    return () => {
      for (const id in tableFlipRafRef.current) {
        cancelAnimationFrame(tableFlipRafRef.current[id]);
      }
      tableFlipRafRef.current = {};
    };
  }, [sortedTables, showTableMap, prefersReducedMotion, isUltraFastMode]);

  const isTableOccupiedOnMap = useCallback(
    (tableId: string) => {
      const id = tableId.trim();
      if (!id) return false;
      if (firestoreOccupiedTableIds.has(id)) return true;
      return (ordersByTable[id]?.length ?? 0) > 0;
    },
    [firestoreOccupiedTableIds, ordersByTable],
  );

  const formatMapOccupiedDuration = useCallback(
    (tableId: string) => {
      const id = tableId.trim();
      const startMs = firestoreOccupancyStartMsByTable[id];
      if (startMs == null) return null;
      const elapsedMs = Math.max(0, now - startMs);
      const minutes = Math.floor(elapsedMs / 60000);
      if (minutes >= 1) {
        return t("cartaTpv.mapOccupiedMinutes", { minutes });
      }
      const seconds = Math.floor(elapsedMs / 1000);
      return t("cartaTpv.mapOccupiedSeconds", { seconds: Math.max(0, seconds) });
    },
    [firestoreOccupancyStartMsByTable, now, t],
  );

  /** Misma referencia temporal que la etiqueta de duración (`startMs` + `now`). */
  const mapTileOccupancyVisual = useCallback(
    (tableId: string, busy: boolean): "free" | "busy-short" | "busy-medium" | "busy-long" => {
      if (!busy) return "free";
      const id = tableId.trim();
      const startMs = firestoreOccupancyStartMsByTable[id];
      if (startMs == null) return "busy-short";
      const elapsedMs = Math.max(0, now - startMs);
      const minutes = elapsedMs / 60000;
      if (minutes < 15) return "busy-short";
      if (minutes <= 45) return "busy-medium";
      return "busy-long";
    },
    [firestoreOccupancyStartMsByTable, now],
  );

  const handleOpenTableOrder = useCallback(
    (tableId: string, options?: { entry?: "tpv" | "summary" }) => {
      const id = String(tableId).trim();
      if (!id) return;
      setOrdersByTable((prev) =>
        Object.prototype.hasOwnProperty.call(prev, id)
          ? prev
          : { ...prev, [id]: [] },
      );
      setSelectedTableId(id);
      const entry = options?.entry ?? "tpv";
      setTpvEntryMode(entry === "summary" ? "summary" : "tpv");
      const qs = new URLSearchParams();
      qs.set("tableId", id);
      if (entry === "summary") qs.set("tpvView", "summary");
      // Mantener la ruta embebida cuando estamos dentro de /dashboard/operacion/tpv
      // para no desmontar el OperacionModuleShell (eso era lo que provocaba el "paso
      // intermedio" / loader visible al tocar una mesa en móvil).
      const basePath = embeddedInOperacion
        ? "/dashboard/operacion/tpv"
        : "/dashboard/carta";
      router.push(`${basePath}?${qs.toString()}`);
    },
    [router, embeddedInOperacion],
  );

  const persistGuestCount = useCallback(
    async (next: number) => {
      if (!selectedTableId) return;
      if (!restaurantId || !isFirebaseConfigured) return;

      const value =
        typeof next === "number" && Number.isFinite(next)
          ? Math.max(0, Math.floor(next))
          : 0;
      if (value === guestCount) return;

      setGuestCount(value);
      try {
        await updateDoc(doc(db, "tables", selectedTableId), {
          dinersCount: value,
          // backwards compatibility (otros sitios aún leen guestCount)
          guestCount: value,
          updatedAt: Date.now(),
        });
      } catch (error) {
        console.error("ERROR GUARDANDO COMENSALES", error);
      }
    },
    [guestCount, restaurantId, selectedTableId],
  );

  const handlePayOrder = useCallback(async () => {
    if (!selectedTableId) return;
    if (!restaurantId || !isFirebaseConfigured) return;
    if (order.length === 0) {
      window.alert("No hay productos en la comanda");
      return;
    }
    if (!window.confirm("¿Cobrar esta mesa?")) return;
    if (isPayTableOrderSending) return;
    setIsPayTableOrderSending(true);
    try {
      await handlePayTableOrder(selectedTableId, { db, restaurantId });
      await updateDoc(doc(db, "tables", selectedTableId), {
        guestCount: 0,
        updatedAt: Date.now(),
      });
      setOrder([]);
      setOrdersByTable((prev) => ({ ...prev, [selectedTableId]: [] }));
      setGuestCount(0);
    } catch (e) {
      console.error("handlePayOrder", e);
    } finally {
      setIsPayTableOrderSending(false);
    }
  }, [
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    isPayTableOrderSending,
    order.length,
  ]);

  const updateActiveOrderPaymentRequest = useCallback(
    async (setRequested: boolean) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (orderIdFromUrl) {
        await updateDoc(doc(db, "orders", orderIdFromUrl), {
          paymentRequestedAt: setRequested ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      if (!selectedTableId) return;
      const q = query(
        collection(db, "orders"),
        where("restaurantId", "==", restaurantId),
        where("tableId", "==", selectedTableId),
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data() as { status?: string };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        await updateDoc(d.ref, {
          paymentRequestedAt: setRequested ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        break;
      }
    },
    [restaurantId, isFirebaseConfigured, orderIdFromUrl, selectedTableId],
  );

  const handleRequestBill = useCallback(async () => {
    if (isBillRequestSending) return;
    setIsBillRequestSending(true);
    try {
      await updateActiveOrderPaymentRequest(true);
    } catch (e) {
      console.error("handleRequestBill", e);
    } finally {
      setIsBillRequestSending(false);
    }
  }, [isBillRequestSending, updateActiveOrderPaymentRequest]);

  const handleClearBillRequest = useCallback(async () => {
    if (isBillRequestSending) return;
    setIsBillRequestSending(true);
    try {
      await updateActiveOrderPaymentRequest(false);
    } catch (e) {
      console.error("handleClearBillRequest", e);
    } finally {
      setIsBillRequestSending(false);
    }
  }, [isBillRequestSending, updateActiveOrderPaymentRequest]);

  const handleSaveOrderNote = useCallback(
    async (note: string) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      const raw = typeof note === "string" ? note : "";
      const value = raw.trim() === "" ? "" : raw;
      setIsSavingOrderNote(true);
      try {
        if (orderIdFromUrl) {
          await updateDoc(doc(db, "orders", orderIdFromUrl), {
            note: value,
            updatedAt: serverTimestamp(),
          });
        } else if (selectedTableId) {
          const q = query(
            collection(db, "orders"),
            where("restaurantId", "==", restaurantId),
            where("tableId", "==", selectedTableId),
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const data = d.data() as { status?: string };
            if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
            await updateDoc(d.ref, {
              note: value,
              updatedAt: serverTimestamp(),
            });
            break;
          }
        }
      } catch (e) {
        console.error("handleSaveOrderNote", e);
      } finally {
        setIsSavingOrderNote(false);
      }
    },
    [restaurantId, isFirebaseConfigured, orderIdFromUrl, selectedTableId],
  );

  const handleMergeOrders = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (isMergingOrders) return;
    const tableId = orderIdFromUrl
      ? (orderUrlTableId ?? "").trim()
      : (selectedTableId ?? "").trim();
    if (!tableId) return;
    if (!window.confirm("¿Unir todas las comandas abiertas de esta mesa en una sola?"))
      return;

    setIsMergingOrders(true);
    try {
      const openDocs = await fetchOpenOrdersForTable(
        db,
        restaurantId,
        tableId,
      );
      if (openDocs.length < 2) return;

      let destDoc: (typeof openDocs)[0];
      if (orderIdFromUrl) {
        const found = openDocs.find((d) => d.id === orderIdFromUrl);
        if (!found) {
          window.alert("No se pudo identificar la comanda actual.");
          return;
        }
        destDoc = found;
      } else {
        destDoc = sortOpenOrderDocsByCreatedAt(openDocs)[0]!;
      }

      const sources = openDocs.filter((d) => d.id !== destDoc.id);
      if (sources.length === 0) return;

      const destData = destDoc.data() as {
        restaurantId?: string;
        items?: unknown;
        note?: unknown;
        paymentRequestedAt?: unknown;
      };
      if (destData.restaurantId !== restaurantId) return;

      const destItems = asFirestoreRawItems(destData.items);
      const flatSource = sources.flatMap((s) =>
        asFirestoreRawItems((s.data() as { items?: unknown }).items),
      );

      const mergedItems = normalizeMergedFirestoreItems([
        ...destItems,
        ...flatSource,
      ]);
      const mergedTotal = computeOrderDocTotal({
        items: mergedItems as FirestoreOrderDocForCart["items"],
        total: 0,
      });

      const noteParts: string[] = [];
      const pushNote = (n: unknown) => {
        const s = typeof n === "string" ? n.trim() : "";
        if (s) noteParts.push(s);
      };
      pushNote(destData.note);
      for (const s of sources) {
        pushNote((s.data() as { note?: unknown }).note);
      }
      const mergedNote = noteParts.join("\n");

      const prRaw: unknown[] = [destData.paymentRequestedAt];
      for (const s of sources) {
        prRaw.push(
          (s.data() as { paymentRequestedAt?: unknown }).paymentRequestedAt,
        );
      }
      let mergedPr: unknown = null;
      let bestMs = -1;
      for (const raw of prRaw) {
        if (!isPaymentRequestedAtSet(raw)) continue;
        const ms = readOrderCreatedAtMs(raw) ?? 0;
        if (ms > bestMs) {
          bestMs = ms;
          mergedPr = raw;
        }
      }

      const batch = writeBatch(db);
      batch.update(destDoc.ref, {
        items: mergedItems,
        total: Number.isFinite(mergedTotal) ? mergedTotal : 0,
        note: mergedNote,
        paymentRequestedAt: mergedPr,
        updatedAt: serverTimestamp(),
      });
      for (const s of sources) {
        batch.delete(s.ref);
      }
      await batch.commit();

      const destId = destDoc.id;
      const hadSourceAsCurrentUrl =
        Boolean(orderIdFromUrl) &&
        sources.some((s) => s.id === orderIdFromUrl);

      if (hadSourceAsCurrentUrl) {
        router.replace(
          `/dashboard/carta?orderId=${encodeURIComponent(destId)}&tableId=${encodeURIComponent(tableId)}`,
        );
      }

      const mergedSnap = await getDoc(doc(db, "orders", destId));
      if (mergedSnap.exists()) {
        const data = mergedSnap.data() as FirestoreOrderDocForCart;
        const st = String((data as { status?: string } | null)?.status ?? "")
          .trim()
          .toLowerCase();
        if (st === "paid" || st === "closed") {
          setOrder([]);
          setOrdersByTable((prev) => ({ ...prev, [tableId]: [] }));
        } else {
          const mapped = mapFirestoreOrderDocToCartLines(data, restaurantId);
          if (mapped) {
            setOrder(mapped);
            setOrdersByTable((prev) => ({ ...prev, [tableId]: mapped }));
          }
        }
      }
    } catch (e) {
      console.error("handleMergeOrders", e);
    } finally {
      setIsMergingOrders(false);
    }
  }, [
    restaurantId,
    isFirebaseConfigured,
    isMergingOrders,
    orderIdFromUrl,
    orderUrlTableId,
    selectedTableId,
    router,
  ]);

  const handleTableMapTileClick = useCallback(
    (tableId: string) => {
      const tid = String(tableId).trim();
      if (!tid) return;

      const busy = firestoreOccupiedTableIds.has(tid);
      if (!busy) {
        // Mesa libre en el mapa: siempre comanda nueva (no reutilizar estado local antiguo).
        setOrder([]);
        setOrdersByTable((prev) => ({
          ...prev,
          [tid]: [],
        }));
        setFirestoreOccupancyStartMsByTable((prev) => {
          const next = { ...prev };
          delete next[tid];
          return next;
        });
        setOrderTotalsByTable((prev) => {
          const next = { ...prev };
          delete next[tid];
          return next;
        });
        setLastActivityAtByTable((prev) => {
          const next = { ...prev };
          delete next[tid];
          return next;
        });
        setFirestoreOccupiedTableIds((prev) => {
          const next = new Set(prev);
          next.delete(tid);
          return next;
        });
      }

      handleOpenTableOrder(tid);
    },
    [
      handleOpenTableOrder,
      firestoreOccupiedTableIds,
      setFirestoreOccupiedTableIds,
      setLastActivityAtByTable,
      setOrder,
      setOrderTotalsByTable,
      setFirestoreOccupancyStartMsByTable,
      setOrdersByTable,
    ],
  );

  const handleBackToMap = useCallback(() => {
    setTpvEntryMode("map");
    setSelectedTableId(null);
  }, []);

  const handlePrintPreTicket = useCallback(() => {
    window.print();
  }, []);

  const handleComandaAndExit = useCallback(async () => {
    if (!order.some((l) => l.status === "pending")) return;
    const ok = await handleComanda();
    if (!ok) {
      window.alert("No se pudo enviar la comanda. Inténtalo otra vez.");
      return;
    }
    await new Promise((r) => window.setTimeout(r, 900));
    handleBackToMap();
  }, [handleComanda, handleBackToMap, order]);

  const getItemColor = (createdAt?: number) => {
    const now = Date.now();
    const diff = now - (createdAt || now);

    const minutes = diff / 60000;

    if (minutes > 10) return "#ffcccc"; // rojo suave
    if (minutes > 5) return "#fff3cd"; // amarillo suave
    return "#e8f5e9"; // verde suave
  };

  const linesPending = useMemo(
    () =>
      order
        .filter((l) => l.status === "pending")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [order],
  );
  const linesSent = useMemo(
    () =>
      order
        .filter((l) => l.status === "sent")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [order],
  );
  const linesPrepared = useMemo(
    () =>
      order
        .filter((l) => l.status === "prepared")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [order],
  );
  const linesServed = useMemo(
    () =>
      order
        .filter((l) => l.status === "served")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [order],
  );

  const visibleLinesDebug = useMemo(() => {
    const visible = [...linesPending, ...linesSent, ...linesPrepared, ...linesServed];
    console.log("COMANDA VISIBLE LINES DEBUG", visible);
    return visible;
  }, [linesPending, linesSent, linesPrepared, linesServed]);

  const orderDocIsPaid = useMemo(() => {
    if (
      orderIdFromUrl &&
      String(orderUrlDocStatus ?? "").trim().toLowerCase() === "paid"
    ) {
      return true;
    }
    if (
      selectedTableId &&
      !orderIdFromUrl &&
      firestorePaidTableIds.has(selectedTableId)
    ) {
      return true;
    }
    return false;
  }, [
    orderIdFromUrl,
    orderUrlDocStatus,
    selectedTableId,
    firestorePaidTableIds,
  ]);

  const canMergeOpenOrders = useMemo(() => {
    if (orderDocIsPaid) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (!mergeTableIdForOpenOrders) return false;
    if (!selectedTableId && !orderIdFromUrl) return false;
    return openOrderIdsForTable.length > 1;
  }, [
    orderDocIsPaid,
    restaurantId,
    isFirebaseConfigured,
    mergeTableIdForOpenOrders,
    selectedTableId,
    orderIdFromUrl,
    openOrderIdsForTable.length,
  ]);

  const billRequestedForComanda = useMemo(() => {
    if (orderDocIsPaid) return false;
    if (orderIdFromUrl) return orderUrlPaymentRequestedAt;
    if (selectedTableId)
      return firestoreBillRequestedTableIds.has(selectedTableId);
    return false;
  }, [
    orderDocIsPaid,
    orderIdFromUrl,
    orderUrlPaymentRequestedAt,
    selectedTableId,
    firestoreBillRequestedTableIds,
  ]);

  const remoteOrderNote = useMemo(() => {
    if (orderIdFromUrl) return orderUrlNote;
    if (selectedTableId)
      return firestoreOrderNoteByTable[selectedTableId] ?? "";
    return "";
  }, [
    orderIdFromUrl,
    orderUrlNote,
    selectedTableId,
    firestoreOrderNoteByTable,
  ]);

  useEffect(() => {
    setOrderNoteDraft(remoteOrderNote);
  }, [remoteOrderNote]);

  const tpvComandaHeaderTime = useMemo(() => {
    let openedMs: number | undefined;
    if (orderIdFromUrl) {
      if (orderUrlOpenedAtMs == null || !Number.isFinite(orderUrlOpenedAtMs)) {
        return null;
      }
      openedMs = orderUrlOpenedAtMs;
    } else if (selectedTableId) {
      const ms = firestoreOccupancyStartMsByTable[selectedTableId];
      if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
      openedMs = ms;
    } else {
      return null;
    }
    const minutes = Math.max(
      0,
      Math.floor((comandaHeaderNow - openedMs) / 60000),
    );
    const label = formatOrderOpenDurationLabel(minutes);
    const color =
      minutes >= 60 ? "#dc2626" : minutes >= 30 ? "#ea580c" : "#0f172a";
    return { label, color };
  }, [
    orderIdFromUrl,
    orderUrlOpenedAtMs,
    selectedTableId,
    firestoreOccupancyStartMsByTable,
    comandaHeaderNow,
  ]);

  /**
   * Total de unidades en estado `pending` (aún sin enviar a cocina/barra).
   * Se calcula derivando del estado local `order`. Sin Firestore, sin
   * lectura adicional ni handlers nuevos. Se memoriza para no recalcular
   * en cada render que no afecte a `order`.
   */
  const totalPendingItems = useMemo(() => {
    return order.reduce((sum, line) => {
      if (line.status === "pending") {
        return sum + (Number(line.quantity) || 0);
      }
      return sum;
    }, 0);
  }, [order]);

  /** Pase activo en su forma numérica (1-3), usado por el resaltado en la lista de
      comanda (`isActiveCourseLine` en `renderComandaLine`). */
  const activeCourseNum = ACTIVE_COURSE_TO_NUM[activeCourse];

  const cocinaItems = useMemo(() => {
    return order
      .filter((it) => it.status === "sent")
      .filter(
        (it) =>
          ((it.product as Product & { preparationArea?: string }).preparationArea ||
            "cocina") === "cocina",
      )
      .slice()
      .sort((a, b) => {
        const rank = (s: OrderLineStatus) =>
          s === "pending" ? 0 : s === "sent" ? 1 : 2;
        const rd = rank(a.status) - rank(b.status);
        if (rd !== 0) return rd;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }, [order]);

  const cocinaCourseSections = useMemo(() => {
    const sorted = [...cocinaItems].sort((a, b) => {
      const oc = cocinaCourseSortOrder(a) - cocinaCourseSortOrder(b);
      if (oc !== 0) return oc;
      const rank = (s: OrderLineStatus) =>
        s === "pending" ? 0 : s === "sent" ? 1 : 2;
      const rd = rank(a.status) - rank(b.status);
      if (rd !== 0) return rd;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    const keys: CocinaCourseBucket[] = [1, 2, 3, 0];
    return keys
      .map((key) => ({
        key,
        title: getCocinaSectionTitle(key),
        items: sorted.filter((i) => cocinaCourseBucket(i) === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [cocinaItems]);

  const hasPendingItems = useMemo(
    () => order.some((l) => l.status === "pending"),
    [order],
  );

  const showComandaAside =
    viewMode !== "normal" || Boolean(selectedTableId || orderIdFromUrl);

  const lineEditorTarget =
    comandaLineEditorId == null
      ? null
      : (order.find((l) => l.id === comandaLineEditorId) ?? null);
  const lineEditorReadOnly = lineEditorTarget ? lineEditorTarget.status !== "pending" : false;
  const comandaLineActionsTarget =
    comandaLineActionsTargetId == null
      ? null
      : (order.find((l) => l.id === comandaLineActionsTargetId) ?? null);

  const renderComandaLine = (
    item: CartOrderLine,
    statusLabel: "Pendiente" | "Enviado" | "Preparado" | "Servido",
    opts: { strike?: boolean; attachFirstPendingRef?: boolean },
  ) => {
    console.log("COMANDA LINE DEBUG", {
      id: item.id,
      itemId: (item as unknown as { itemId?: unknown }).itemId,
      orderId: (item as unknown as { orderId?: unknown }).orderId,
      source: (item as unknown as { source?: unknown }).source,
      name: (item as unknown as { name?: unknown }).name ?? item.product?.nombre,
      quantity: (item as unknown as { quantity?: unknown; qty?: unknown }).quantity ?? (item as unknown as { qty?: unknown }).qty ?? item.quantity,
      status: item.status,
      destination: (item.product as Product & { preparationArea?: string }).preparationArea || "cocina",
      rawLine: item,
    });
    const i = order.indexOf(item);
    const base = Number(item.product.precio);
    const extrasSum = sumLineExtrasPrices(item);
    const hasUnit =
      (Number.isFinite(base) && base >= 0) || extrasSum > 0;
    const unit = hasUnit ? comandaLineUnitPriceWithExtras(item) : null;
    const lineTotal =
      unit !== null && Number.isFinite(item.quantity)
        ? unit * item.quantity
        : null;
    const firstPendingId = linesPending[0]?.id;
    const nm = item.product.nombre;
    const courseForBadge = normalizeComandaCourseForStorage(item.course);
    /* Etiqueta breve y singular del pase para mostrar inline junto al
       nombre del producto. Reutiliza `courseForBadge` (ya normalizado a
       1-4 o undefined) para no llamar 3 veces a la función. Coherente
       con `ACTIVE_COURSE_TO_NUM` (starter→1, main→2, dessert→3). */
    const lineCourseLabel =
      courseForBadge === 1
        ? "Entrante"
        : courseForBadge === 2
          ? "Segundo"
          : courseForBadge === 3
            ? "Postre"
            : null;
    /* ¿Esta línea pertenece al pase activo? Sirve para resaltar
       sutilmente la fila y oscurecer su badge inline, ayudando al
       camarero a localizar visualmente las líneas del pase actual.
       Las líneas SIN `course` explícito se tratan como pase 1
       (Entrantes), igual que en el fallback `|| 1` de `handleQuickAdd`.
       `activeCourseNum` viene del ámbito del componente. */
    const lineCourseNumForActiveHighlight = courseForBadge ?? 1;
    const isActiveCourseLine =
      lineCourseNumForActiveHighlight === activeCourseNum;
    return (
      <li
        key={`line-${item.id}`}
        className={`carta-comanda-line${
          isActiveCourseLine ? " is-active-course-line" : ""
        }`}
        ref={
          opts.attachFirstPendingRef &&
          orderIdFromUrl &&
          firstPendingId === item.id
            ? firstPendingRef
            : null
        }
        onClick={item.status !== "cancelled" ? () => openComandaLineEditor(item) : undefined}
        onMouseEnter={() => setHoveredComandaLineIndex(i)}
        onMouseLeave={() => setHoveredComandaLineIndex(null)}
        style={{
          cursor: item.status !== "cancelled" ? "pointer" : "default",
          textDecoration: "none",
          opacity:
            item.status === "pending" ? (opts.strike ? 0.92 : 1) : opts.strike ? 0.78 : 0.75,
          backgroundColor: comandaLineRowBg(item.status, {
            hover: hoveredComandaLineIndex === i,
            selected: false,
          }),
          outline: "none",
          outlineOffset: 0,
          borderBottom: "1px solid #eeeeee",
        }}
      >
        <div
          className="carta-comanda-line-grid"
          style={{ rowGap: 6 }}
        >
          <div className="carta-comanda-line-main">
            <div className="carta-comanda-line-head">
              <div className="carta-comanda-name-block">
                <span
                  className="carta-comanda-name"
                  style={{
                    color: opts.strike ? "#64748b" : "#0f172a",
                    textDecoration: opts.strike ? "line-through" : "none",
                  }}
                  title={nm}
                >
                  {nm}
                </span>
                {lineCourseLabel ? (
                  <span
                    className="carta-line-course-badge"
                    aria-label={`Pase: ${lineCourseLabel}`}
                  >
                    {lineCourseLabel}
                  </span>
                ) : null}
                {item.status !== "pending" ? (
                  <span
                    className="carta-comanda-qty-inline"
                    style={{
                      color: opts.strike ? "#94a3b8" : "#475569",
                    }}
                  >{` x${item.quantity}`}</span>
                ) : null}
              </div>
              <div className="carta-comanda-line-badges">
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 999,
                    lineHeight: 1.1,
                    ...comandaStatusBadgeStyle(item.status),
                  }}
                >
                  {statusLabel}
                </span>
              {item.isComped ? (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 999,
                    lineHeight: 1.1,
                    background: "rgba(245, 158, 11, 0.18)",
                    color: "#92400e",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                  }}
                  title={item.compedReason ? `Invitado: ${item.compedReason}` : "Invitado"}
                >
                  INVITADO
                </span>
              ) : null}
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 999,
                    lineHeight: 1.1,
                    ...destinationBadgeStyle(isBarProduct(item.product)),
                  }}
                  title={
                    isBarProduct(item.product)
                      ? "Se envía a Barra"
                      : "Se envía a Cocina"
                  }
                >
                  {isBarProduct(item.product) ? "Barra" : "Cocina"}
                </span>
              </div>
            </div>
            <div
              className="carta-comanda-line-pricing"
              style={{ color: opts.strike ? "#94a3b8" : undefined }}
            >
              {unit !== null && lineTotal !== null ? (
                <>
                  <span className="carta-comanda-pu">
                    <span
                      style={{
                        textDecoration: item.isComped ? "line-through" : "none",
                        color: item.isComped ? "#64748b" : undefined,
                      }}
                    >
                      {formatComandaLineEuroEs(unit)}
                    </span>
                  </span>
                  <span className="carta-comanda-pu-suffix">/ud</span>
                  <span className="carta-comanda-pricing-sep"> · </span>
                  <span className="carta-comanda-total-lead">Total </span>
                  <span
                    className="carta-comanda-line-total-value"
                    style={{
                      color: opts.strike ? "#64748b" : "#0f172a",
                      textDecoration: item.isComped ? "line-through" : "none",
                      opacity: item.isComped ? 0.75 : 1,
                    }}
                  >
                    {formatComandaLineEuroEs(lineTotal)}
                  </span>
                </>
              ) : (
                <span>— · Total —</span>
              )}
            </div>
          </div>
          {item.status === "pending" ? (
            <div className="carta-comanda-qty-controls ml-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDecrementLine(item.id);
                }}
                className="carta-comanda-qty-btn"
              >
                -
              </button>

              <span className="text-sm w-4 text-center">{item.quantity}</span>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleIncrementLine(item.id);
                }}
                className="carta-comanda-qty-btn"
              >
                +
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemoveLine(item.id);
                }}
                className="carta-comanda-qty-btn carta-comanda-qty-btn--remove"
                title="Eliminar línea"
                aria-label="Eliminar línea"
              >
                ×
              </button>
            </div>
          ) : item.status !== "cancelled" ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setComandaLineActionsTargetId(item.id);
                  setComandaLineActionsOpen(true);
                }}
                className="h-6 px-2 flex items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                style={{ position: "relative", zIndex: 3 }}
                title="Acciones"
                aria-label="Acciones"
              >
                ⋯
              </button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div
      className="carta-root"
      data-carta-mobile={cartaHeaderMobile ? "true" : undefined}
      data-carta-embedded={embeddedInOperacion ? "true" : undefined}
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
        color: "#e5e7eb",
        ...(embeddedInOperacion
          ? {
              height: "100%",
              minHeight: "100%",
              display: "flex",
              flexDirection: "column" as const,
            }
          : {}),
      }}
    >
      {comandaLineActionsOpen && comandaLineActionsTarget ? (
        <div
          className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3"
          onClick={() => {
            setComandaLineActionsOpen(false);
            setComandaLineActionsTargetId(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white text-gray-900 shadow-2xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex: 81 }}
          >
            {(() => {
              const status = comandaLineActionsTarget.status;
              const allowInvite = status === "sent" || status === "prepared";
              const allowRemoveOne = status === "sent";
              return (
                <>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-semibold">Acciones</div>
              <button
                type="button"
                className="text-xs font-semibold text-gray-500 hover:text-gray-900"
                onClick={() => {
                  setComandaLineActionsOpen(false);
                  setComandaLineActionsTargetId(null);
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="p-3 space-y-2">
              <div className="text-xs text-gray-600">
                {comandaLineDisplayName(comandaLineActionsTarget)} x{comandaLineActionsTarget.quantity}
              </div>

              <button
                type="button"
                disabled={!allowRemoveOne}
                className={`w-full py-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-900 ${
                  allowRemoveOne ? "hover:bg-gray-200" : "opacity-50 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (!allowRemoveOne) {
                    console.log("ACTION BLOCKED", { status, action: "remove_one" });
                    return;
                  }
                  void handleRemoveOneUnitFromLine(comandaLineActionsTarget);
                  setComandaLineActionsOpen(false);
                  setComandaLineActionsTargetId(null);
                }}
              >
                Quitar 1 unidad
              </button>

              <button
                type="button"
                disabled={!allowInvite}
                className={`w-full py-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-900 ${
                  allowInvite ? "hover:bg-gray-200" : "opacity-50 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (!allowInvite) {
                    console.log("ACTION BLOCKED", { status, action: "invite" });
                    return;
                  }
                  void handleCompProductFromLine(comandaLineActionsTarget);
                }}
              >
                Invitar producto
              </button>

              <button
                type="button"
                className="w-full py-2 rounded-lg bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 border border-gray-200"
                onClick={() => {
                  setComandaLineActionsOpen(false);
                  setComandaLineActionsTargetId(null);
                }}
              >
                Cerrar
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.urgent {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

@keyframes addBump {
  0% { opacity: 0; transform: translateY(6px) scale(0.96); }
  12% { opacity: 1; transform: translateY(0px) scale(1); }
  100% { opacity: 0; transform: translateY(-10px) scale(1.02); }
}

@keyframes cartaProductAddFlash {
  0% { background-color: #e7f8ee; box-shadow: 0 14px 22px rgba(34,197,94,0.14), 0 10px 18px rgba(2,6,23,0.14); }
  100% { background-color: #f5f5f5; box-shadow: 0 6px 14px rgba(2,6,23,0.08); }
}

.carta-add-bump {
  position: absolute;
  top: 8px;
  right: 10px;
  font-weight: 950;
  font-size: 12px;
  letter-spacing: -0.01em;
  color: rgba(17, 24, 39, 0.92);
  background: rgba(34, 197, 94, 0.20);
  border: 1px solid rgba(34, 197, 94, 0.30);
  padding: 4px 7px;
  border-radius: 999px;
  pointer-events: none;
  animation: addBump 300ms ease-out both;
}

@keyframes sentFlash {
  0% { box-shadow: inset 0 0 0 1px rgba(34,197,94,0.0); background-color: rgba(34,197,94,0.0); }
  20% { box-shadow: inset 0 0 0 1px rgba(34,197,94,0.18); background-color: rgba(34,197,94,0.12); }
  100% { box-shadow: inset 0 0 0 1px rgba(34,197,94,0.0); background-color: rgba(34,197,94,0.0); }
}

.carta-sent-flash {
  animation: sentFlash 420ms ease-out both;
}

.carta-kitchen-wrap {
  max-width: 1400px;
  margin: 0 auto;
  padding: 18px;
  width: 100%;
  box-sizing: border-box;
}

.carta-kitchen-section {
  margin-bottom: 18px;
}

.carta-kitchen-section:last-child {
  margin-bottom: 0;
}

.carta-kitchen-section-title {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #64748b;
  margin: 0 0 10px;
  padding: 0 2px;
}

.carta-kitchen-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (min-width: 768px) {
  .carta-kitchen-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .carta-kitchen-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (min-width: 1280px) {
  .carta-kitchen-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}

.carta-kitchen-card {
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 16px 40px rgba(2,6,23,0.35);
  cursor: pointer;
  user-select: none;
  transition: transform 100ms ease, box-shadow 100ms ease, background-color 100ms ease;
  min-height: 92px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.carta-kitchen-card:active {
  transform: scale(0.98);
}

.carta-kitchen-qty {
  flex: 0 0 auto;
  align-self: center;
  font-size: 34px;
  font-weight: 950;
  letter-spacing: -0.03em;
  line-height: 1;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #f8fafc;
  min-width: 76px;
  text-align: center;
}

.carta-kitchen-name {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: #f8fafc;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-kitchen-course {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  color: #94a3b8;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-kitchen-card--new {
  background: rgba(15, 23, 42, 0.78);
}

.carta-kitchen-card--preparing {
  background: rgba(245, 158, 11, 0.20);
  border-color: rgba(245, 158, 11, 0.32);
  box-shadow: 0 18px 46px rgba(245, 158, 11, 0.12), 0 16px 40px rgba(2,6,23,0.35);
}

.carta-kitchen-card--preparing .carta-kitchen-qty {
  background: rgba(245, 158, 11, 0.25);
  border-color: rgba(245, 158, 11, 0.40);
}

/* Layout responsive (/dashboard/carta) */
.carta-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.carta-root[data-carta-embedded="true"] {
  flex: 1 1 auto;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  padding-bottom: 0 !important;
}

/* Embedded en Operación: ignorar el modo "scroll natural" móvil de Carta. */
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] {
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  overflow-y: hidden !important;
  padding-bottom: 0 !important;
}

.carta-root[data-carta-embedded="true"] .carta-page-main,
.carta-root[data-carta-embedded="true"] .carta-page-main--map {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
}

.carta-root[data-carta-embedded="true"] .carta-map-page-fill {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
}

.carta-root[data-carta-embedded="true"] .carta-table-map-grid {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: auto !important;
}

.carta-root .hostly-page-header {
  flex-shrink: 0;
  padding: 0;
}

/* Móvil Carta: scroll natural, cabecera apilada (detalle en HostlyPageHeader + data-carta-mobile) */
.carta-root[data-carta-mobile="true"] {
  height: auto !important;
  max-height: none !important;
  min-height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 0;
}

.carta-root[data-carta-mobile="true"] .hostly-page-header {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
}

.carta-root[data-carta-mobile="true"] .carta-page-main--below-header {
  margin-top: 12px;
}

.carta-root[data-carta-mobile="true"] .carta-header-mode-tabs {
  display: inline-flex !important;
  flex-wrap: nowrap !important;
  align-self: stretch !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
  box-sizing: border-box;
}

.carta-root[data-carta-mobile="true"] .carta-page-main,
.carta-root[data-carta-mobile="true"] .carta-page-main--map {
  flex: none !important;
  min-height: auto !important;
  overflow: visible !important;
  height: auto !important;
}

.carta-root[data-carta-mobile="true"] .carta-map-page-fill {
  flex: none !important;
  min-height: auto !important;
  overflow: visible !important;
  height: auto !important;
}

.carta-root[data-carta-mobile="true"] .carta-table-map-grid {
  flex: none !important;
  min-height: 420px !important;
  overflow: visible !important;
}

/* Embedded en Operación + viewport móvil: el mapa debe llenar el alto disponible.
   Estas reglas tienen mayor especificidad (0,4,0) y van después de las reglas
   mobile-only (0,3,0), así que vencen tanto por especificidad como por orden. */
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-page-main,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-page-main--map {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-page-fill {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-table-map-shell {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-table-map-grid {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  width: 100% !important;
  overflow: auto !important;
}

.carta-page-main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* Vista TPV con grid + comanda: el scroll va dentro de productos/comanda, no en el page-main. */
.carta-page-main:not(.carta-page-main--map) {
  overflow: hidden;
}

.carta-page-main--map {
  flex: 1 1 0%;
  overflow: hidden;
}

.carta-map-page-fill {
  flex: 1 1 0%;
  min-height: 0;
  width: 100%;
  max-width: none !important;
  margin: 0 !important;
  padding-left: var(--hostly-page-pad-x) !important;
  padding-right: var(--hostly-page-pad-x) !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.carta-map-top-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 0 6px;
}

.carta-map-summary-block {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}

.carta-map-summary-status {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.92);
  flex-shrink: 0;
  margin-left: auto;
}

.carta-map-waiter-row {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0 8px 4px;
}

.carta-map-top-strip-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 220px;
}

.carta-map-waiter-compact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #cbd5e1;
  white-space: nowrap;
}

.carta-map-waiter-compact select {
  min-width: 0;
  max-width: 148px;
  width: auto;
  font: inherit;
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 3px 8px !important;
  min-height: 28px !important;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.65);
  color: #e2e8f0;
  cursor: pointer;
  box-sizing: border-box;
}

.carta-map-zones-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.carta-top-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}

.carta-top-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.carta-top-view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.carta-top-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.carta-map-summary-shell,
.carta-map-summary-shell--critical {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.carta-map-summary-shell.carta-map-summary-block,
.carta-map-summary-shell--critical.carta-map-summary-block {
  padding: 4px 8px;
  border-radius: 10px;
}

.carta-map-summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.carta-map-summary-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  color: #ffffff;
}

.carta-map-summary-pill--neutral { background: rgba(148, 163, 184, 0.22); }
.carta-map-summary-pill--busy { background: rgba(59, 130, 246, 0.35); }
.carta-map-summary-pill--warn { background: rgba(245, 158, 11, 0.40); }
.carta-map-summary-pill--crit { background: rgba(239, 68, 68, 0.42); }

.carta-map-top-strip .carta-map-summary-pill {
  padding: 4px 8px;
  font-size: 11px;
}

.carta-map-top-strip .carta-table-map-zone-btn {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(148, 163, 184, 0.28);
  color: #e2e8f0;
}

.carta-map-top-strip .carta-table-map-zone-btn--on {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
}

.carta-map-toolbar {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.carta-map-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.carta-map-toolbar-waiter {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
}

.carta-mode-seg {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  width: auto;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 3px 5px 3px 4px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

.carta-mode-seg--compact {
  padding: 2px 4px 2px 3px;
  gap: 3px;
  width: fit-content;
  max-width: 100%;
}

.carta-operativa-mode-strip .carta-mode-seg--compact {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.carta-operativa-mode-strip .carta-mode-btn--compact {
  color: rgba(226, 232, 240, 0.9) !important;
}

.carta-operativa-mode-strip .carta-mode-btn--compact[aria-pressed="true"] {
  background: rgba(255, 255, 255, 0.16) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
  box-shadow: 0 4px 12px rgba(2, 6, 23, 0.2) !important;
}

.carta-operativa-mode-strip .carta-mode-btn--compact[aria-pressed="false"]:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}

.carta-mode-btn {
  flex-shrink: 0 !important;
  min-height: 36px !important;
  min-width: 88px !important;
  padding: 10px 18px !important;
  border-radius: 999px !important;
  border: 1px solid #374151 !important;
  background: #111827 !important;
  color: #f8fafc !important;
  font-weight: 800 !important;
  font-size: 13px !important;
  line-height: 1.1 !important;
  letter-spacing: 0.02em;
  white-space: nowrap !important;
  cursor: pointer;
  box-shadow: none !important;
}

.carta-mode-btn--compact {
  min-height: 30px !important;
  min-width: 72px !important;
  padding: 5px 12px !important;
  font-size: 12px !important;
}

.carta-mode-btn[aria-pressed="true"] {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
  color: #0b1220 !important;
  font-weight: 900 !important;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.06), 0 6px 14px rgba(2, 6, 23, 0.14) !important;
}

.carta-mode-btn:active {
  transform: translateY(0.5px);
}

.carta-mode-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22) !important;
}

.carta-mode-btn[aria-pressed="false"]:hover {
  background: #374151 !important;
  border-color: #4b5563 !important;
}

.carta-aside-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.carta-aside-meta-row .carta-tpv-to-map-btn {
  margin-left: auto;
}

.carta-active-mesa {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 0 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.25;
  color: rgba(15, 23, 42, 0.52);
}

.carta-comanda-headline {
  font-size: 16px;
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #0f172a;
  margin: 0;
}

.carta-comanda-headline-time {
  font-weight: 800;
}

.carta-comanda-meta-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.carta-comanda-meta-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.carta-tpv-payment-dock {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 0 0;
  background: transparent;
  border-top: none;
  box-shadow: none;
}

.carta-tpv-payment-dock-total {
  margin-bottom: 10px;
}

.carta-tpv-payment-dock-total-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 2px;
}

.carta-tpv-payment-dock-total-value {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #f8fafc;
  line-height: 1.1;
}

.carta-tpv-payment-dock-total-eur {
  font-size: 17px;
  font-weight: 800;
  opacity: 0.92;
}

.carta-tpv-final-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
}

.carta-tpv-final-actions--dock {
  padding: 0;
  margin: 0;
  border: none;
}

.carta-tpv-final-actions button {
  min-height: 44px;
  box-sizing: border-box;
}

.carta-tpv-notes-panel {
  padding: 12px 0 0;
  margin-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.carta-active-mesa--empty {
  color: rgba(15, 23, 42, 0.38);
  font-weight: 500;
}

.carta-tpv-to-map-btn {
  flex-shrink: 0;
  margin-left: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.38);
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  font: inherit;
}

.carta-tpv-to-map-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(29, 78, 216, 0.45);
}

.carta-tpv-to-map-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28);
}

.carta-cats-wrap {
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.carta-cat-btn-active {
  background: rgba(56, 189, 248, 0.26) !important;
  border-color: rgba(56, 189, 248, 0.38) !important;
  color: #e0f2fe !important;
  box-shadow: 0 10px 20px rgba(56, 189, 248, 0.10);
}

.carta-current-cat-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 950;
  letter-spacing: 0.02em;
  color: #e5e7eb;
  text-transform: uppercase;
  opacity: 0.92;
}

.carta-table-map-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.carta-table-map-header {
  margin-bottom: 0;
}

.carta-table-map-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.carta-table-map-sub {
  margin: 0 0 8px;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}

.carta-table-map-zones {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0;
}

.carta-table-map-zone-btn {
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  font-weight: 800;
  color: #334155;
  cursor: pointer;
}

.carta-table-map-zone-btn--on {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.14);
  color: #0369a1;
}

.carta-table-map-grid {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.28), rgba(2, 6, 23, 0.08));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.carta-table-map-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.92) !important;
  cursor: pointer;
  box-sizing: border-box;
  font: inherit;
  text-align: center;
  min-height: 92px;
  color: #0f172a;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.carta-table-map-tile:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
}

.carta-table-map-tile:focus {
  outline: none;
}

.carta-table-map-tile:focus-visible {
  outline: 2px solid rgba(148, 163, 184, 0.55);
  outline-offset: 2px;
}

.carta-table-map-tile--free {
  border-color: rgba(34, 197, 94, 0.35);
  background: linear-gradient(
    180deg,
    rgba(240, 253, 244, 0.98),
    rgba(255, 255, 255, 0.94)
  ) !important;
}

.carta-table-map-tile--busy-short {
  border-color: rgba(34, 197, 94, 0.4);
  background: linear-gradient(
    180deg,
    rgba(220, 252, 231, 0.98),
    rgba(255, 255, 255, 0.92)
  ) !important;
  box-shadow:
    0 0 0 1px rgba(34, 197, 94, 0.1),
    0 6px 16px rgba(34, 197, 94, 0.1);
}

.carta-table-map-tile--busy-medium {
  border-color: rgba(245, 158, 11, 0.45);
  background: linear-gradient(
    180deg,
    rgba(254, 243, 199, 0.98),
    rgba(255, 255, 255, 0.9)
  ) !important;
  box-shadow:
    0 0 0 1px rgba(245, 158, 11, 0.12),
    0 6px 16px rgba(245, 158, 11, 0.12);
}

.carta-table-map-tile--busy-long {
  border-color: rgba(239, 68, 68, 0.48);
  background: linear-gradient(
    180deg,
    rgba(254, 226, 226, 0.98),
    rgba(255, 255, 255, 0.9)
  );
  box-shadow:
    0 0 0 1px rgba(239, 68, 68, 0.12),
    0 6px 18px rgba(239, 68, 68, 0.14);
}

@keyframes carta-table-map-tile-critical-ring {
  0%,
  100% {
    outline-color: rgba(30, 41, 59, 0.34);
  }
  50% {
    outline-color: rgba(30, 41, 59, 0.4);
  }
}

.carta-table-map-tile--critical {
  position: relative;
  z-index: 1;
  outline: 2px solid rgba(30, 41, 59, 0.36);
  outline-offset: 2px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  animation: carta-table-map-tile-critical-ring 7s ease-in-out infinite;
}

.carta-table-map-tile-name {
  font-size: 18px;
  font-weight: 900;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: rgba(15, 23, 42, 0.92);
}

.carta-table-map-tile-badge {
  display: inline-block;
  padding: 2px 7px;
  margin: 0;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.02em;
  line-height: 1.2;
  box-sizing: border-box;
}

.carta-table-map-tile-badge--low {
  font-weight: 600;
  background: rgba(255, 255, 255, 0.9);
  color: rgba(15, 23, 42, 0.6);
}

.carta-table-map-tile-badge--medium {
  font-weight: 600;
  background: rgba(148, 163, 184, 0.35);
  color: #0f172a;
}

.carta-table-map-tile-badge--high {
  background: rgba(30, 41, 59, 0.95);
  color: #ffffff;
  font-weight: 700;
  transform: scale(1.05);
}

.carta-table-map-tile-duration {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #1e293b;
  line-height: 1.2;
}

.carta-table-map-tile-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.58);
  line-height: 1.15;
}

.carta-table-map-tile-state--occupied {
  margin-top: 0;
  min-height: 8px;
}

.carta-table-map-tile-live-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.48);
  flex-shrink: 0;
}

@keyframes carta-table-map-tile-inactive-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.carta-table-map-tile--inactive-blink {
  animation: carta-table-map-tile-inactive-blink 1.2s ease-in-out infinite;
}

@keyframes carta-map-summary-critical-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 1px rgba(239, 68, 68, 0.38),
      0 0 16px rgba(239, 68, 68, 0.26);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(239, 68, 68, 0.55),
      0 0 26px rgba(239, 68, 68, 0.4);
  }
}

.carta-map-summary-shell--critical {
  animation: carta-map-summary-critical-glow 2.8s ease-in-out infinite;
}

.carta-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  box-sizing: border-box;
  overflow: hidden;
  height: 100%;
}

/* Columna comanda (izquierda en escritorio; arriba en móvil). */
.carta-aside,
.carta-comanda {
  flex-shrink: 0;
  width: 35%;
  min-width: 320px;
  min-height: 0;
  height: auto;
  align-self: stretch;
  position: relative;
  z-index: 1;
  background: #ffffff;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
}

.carta-aside-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  padding-bottom: 0;
}

.carta-aside-footer {
  margin-top: 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.carta-comanda-line {
  padding: 1px 6px 1px 8px;
  margin-left: 0;
  margin-right: 0;
  border-radius: 6px;
  border-bottom: 1px solid #eeeeee;
  transition: background-color 0.1s ease;
}

.carta-comanda-line-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 6px;
  align-items: center;
}

.carta-comanda-select-hit {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 2px 0 0;
  cursor: pointer;
  align-self: center;
  flex-shrink: 0;
}

.carta-comanda-select {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #2563eb;
  cursor: pointer;
}

.carta-comanda-line-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  justify-content: center;
}

.carta-comanda-line-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.carta-comanda-name-block {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: baseline;
  gap: 2px;
}

/* Badge de pase inline en la línea de comanda. Se muestra entre el
   nombre del producto y la cantidad (cuando no está en pending).
   Lectura derivada de line.course ya existente en CartOrderLine. */
.carta-line-course-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.08);
  color: #111827;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
  flex-shrink: 0;
  transition: background-color 120ms ease, color 120ms ease;
}

/* Resaltado sutil de las líneas que pertenecen al pase actualmente
   activo en el selector. Solo afecta al fondo y al borde inferior, y
   oscurece el badge inline para que destaque sin reescribir colores
   de estado (Pendiente / Enviado / etc.). */
.carta-comanda-line.is-active-course-line {
  border-color: rgba(17, 24, 39, 0.24);
  background: rgba(17, 24, 39, 0.04);
}

.carta-comanda-line.is-active-course-line .carta-line-course-badge {
  background: #111827;
  color: white;
}

.carta-comanda-line-badges {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.carta-comanda-qty-inline {
  flex-shrink: 0;
  font-weight: 750;
  font-size: 11px;
  line-height: 1.1;
  white-space: nowrap;
}

.carta-comanda-line-pricing {
  font-size: 10px;
  line-height: 1.12;
  color: #64748b;
  padding-left: 0;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-line-meta {
  font-size: 9px;
  line-height: 1.15;
  color: #64748b;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-comanda-line-meta-note {
  font-weight: 600;
}

.carta-comanda-line-meta-extra {
  font-weight: 500;
  font-style: italic;
  opacity: 0.92;
}

.carta-comanda-line-meta-sep {
  font-weight: 500;
  opacity: 0.75;
}

.carta-comanda-course-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.carta-comanda-course-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  margin-right: 2px;
}

.carta-comanda-course-btn {
  min-width: 22px;
  height: 20px;
  padding: 0 5px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #334155;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.carta-comanda-course-btn--active {
  background: rgba(37, 99, 235, 0.14);
  border-color: rgba(37, 99, 235, 0.35);
  color: #1e40af;
}

.carta-comanda-extras {
  font-size: 9px;
  line-height: 1.25;
  color: #64748b;
  margin-top: 2px;
}

.carta-comanda-extras-row {
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-pu {
  font-weight: 500;
  letter-spacing: -0.02em;
  font-size: 11px;
  opacity: 0.7;
}

.carta-comanda-pu-suffix {
  font-weight: 500;
  letter-spacing: -0.01em;
  font-size: 11px;
  opacity: 0.7;
}

.carta-comanda-pricing-sep {
  font-weight: 500;
  opacity: 0.85;
}

.carta-comanda-total-lead {
  font-weight: 600;
  margin-left: 2px;
}

.carta-comanda-line-total-value {
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-left: 2px;
}

.carta-comanda-name {
  font-weight: 500;
  font-size: 13px;
  line-height: 1.2;
  min-width: 0;
  padding-left: 0;
  margin-left: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.carta-comanda-meta {
  font-weight: 700;
  font-size: 11px;
  color: #334155;
  white-space: nowrap;
}

.carta-comanda-qty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  outline: none;
  white-space: nowrap;
  min-width: 0;
  align-self: center;
  justify-self: end;
}

.carta-comanda-qty-value {
  display: inline-block;
  min-width: 1.1em;
  padding: 0 1px;
  text-align: center;
  font-weight: 600;
  font-size: 10px;
  line-height: 1.1;
  color: #0f172a;
  flex-shrink: 0;
}

.carta-comanda-actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Botones táctiles − / + / × en líneas de comanda (pending). */
.carta-comanda-qty-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.carta-comanda-qty-btn {
  box-sizing: border-box;
  min-width: 36px;
  min-height: 36px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  background: #f3f4f6;
  color: #111827;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.carta-comanda-qty-btn:hover {
  background: #e5e7eb;
}

.carta-comanda-qty-btn:active {
  background: #d1d5db;
}

.carta-comanda-qty-btn--remove {
  color: #6b7280;
}

.carta-comanda-qty-btn--remove:hover {
  color: #dc2626;
}

.carta-line-editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(15, 23, 42, 0.48);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
}

@media (min-width: 640px) {
  .carta-line-editor-backdrop {
    align-items: center;
  }
}

.carta-line-editor-panel {
  width: 100%;
  max-width: 400px;
  border-radius: 14px;
  background: #f8fafc;
  color: #0f172a;
  padding: 14px 14px 12px;
  box-shadow: 0 22px 50px rgba(2, 6, 23, 0.38);
  border: 1px solid rgba(15, 23, 42, 0.1);
  box-sizing: border-box;
}

.carta-line-editor-title {
  font-size: 14px;
  font-weight: 850;
  line-height: 1.25;
  margin: 0 0 10px;
}

.carta-line-editor-sub {
  font-size: 11px;
  color: #64748b;
  font-weight: 650;
  margin: -4px 0 10px;
}

.carta-line-editor-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.carta-line-editor-label {
  font-size: 11px;
  font-weight: 750;
  color: #334155;
}

.carta-line-editor-input,
.carta-line-editor-textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  padding: 7px 9px;
  font-size: 13px;
  font-weight: 550;
  color: #0f172a;
  background: #fff;
}

.carta-line-editor-input--grow {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}

.carta-line-editor-input--price {
  width: 88px;
  flex: 0 0 auto;
}

.carta-line-editor-extra-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.carta-line-editor-extra-remove {
  flex: 0 0 auto;
  width: 30px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}

.carta-line-editor-extra-add {
  margin-top: 2px;
  border-radius: 8px;
  border: 1px dashed rgba(15, 23, 42, 0.2);
  background: rgba(255, 255, 255, 0.7);
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
  cursor: pointer;
  width: 100%;
}

.carta-line-editor-textarea {
  min-height: 64px;
  resize: vertical;
  font-family: inherit;
}

.carta-line-editor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: #334155;
}

.carta-line-editor-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: #2563eb;
  flex-shrink: 0;
}

.carta-line-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.carta-line-editor-btn {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 9px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.carta-line-editor-btn--ghost {
  background: #fff;
  color: #0f172a;
}

.carta-line-editor-btn--primary {
  background: rgba(37, 99, 235, 0.16);
  color: #1e3a8a;
  border-color: rgba(37, 99, 235, 0.28);
}

.carta-line-editor-btn--split {
  background: rgba(249, 115, 22, 0.12);
  color: #9a3412;
  border-color: rgba(249, 115, 22, 0.28);
  flex: 1 1 100%;
}

.carta-total-box {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(15,23,42,0.04);
  border: 1px solid rgba(15,23,42,0.08);
  box-shadow: 0 10px 22px rgba(2,6,23,0.08);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.carta-total-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.carta-total-value {
  font-size: 18px;
  font-weight: 950;
  color: #111827;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.carta-main,
.carta-productos {
  flex: 1;
  min-width: 0;
}

.carta-main {
  min-height: 0;
  overflow: hidden;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.carta-main-fixed {
  flex: 0 0 auto;
}

.carta-products-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

.carta-product-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(4, 1fr);
  align-items: stretch;
  gap: 12px;
}

.carta-product-card {
  height: 120px;
  min-height: 120px;
  padding: 8px;
  gap: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  text-align: center;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  min-width: 0;
  background-color: #f5f5f5;
  color: #111827;
  border-radius: 16px;
  border: 1px solid #e5e5e5;
  box-shadow: 0 6px 14px rgba(2,6,23,0.08);
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
  transition: transform 80ms ease, box-shadow 80ms ease, background-color 120ms ease;
  width: 100%;
}

.carta-product-card:active {
  transform: scale(0.96);
  animation: productTapFlash 0.2s ease;
}

.carta-product-card--adding {
  animation: cartaProductAddFlash 160ms ease-out both;
}

/* === Feedback táctil en :active (productTapFlash). Base consolidada arriba. === */

@keyframes productTapFlash {
  0%   { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
  50%  { box-shadow: 0 0 0 4px rgba(0, 200, 120, 0.25); }
  100% { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
}

/* Badge de cantidad: muestra cuántas unidades del producto hay ya en la
   comanda (suma de líneas no canceladas). Solo lectura del estado existente. */
.carta-product-qty-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #16a34a;
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 6px;
  min-width: 20px;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  line-height: 1;
  z-index: 2;
}

/* Producto con unidades pendientes Y enviadas a la vez: ámbar para
   distinguirlo del verde (todo pendiente) o del verde + opacidad 0.6 que
   ya da .has-sent (todo enviado). El número se muestra como "P+E". */
.carta-product-qty-badge.mixed {
  background: #f59e0b;
}

/* Badge de pase (curso) en la esquina inferior derecha. Convive con el
   badge de cantidad de la esquina superior derecha. Lectura derivada del
   campo numérico course (1 E, 2 S, 3 P) ya existente en CartOrderLine. */
.carta-product-course-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: #111;
  color: white;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  padding: 2px 4px;
  pointer-events: none;
  opacity: 0.9;
  line-height: 1;
  z-index: 2;
}

.carta-comanda-button:hover:not(:disabled) {
  background: #d1d5db !important;
}

/* Indicador global de unidades pendientes de enviar a cocina/barra.
   Se inserta en la zona "mesa / tiempo" del header de la comanda y
   solo se muestra cuando hay al menos 1 unidad en estado pending. */
.carta-pending-indicator {
  display: inline-block;
  vertical-align: middle;
  background: #dc2626;
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 999px;
  margin-left: 8px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);
  animation: pulsePending 1.2s infinite;
}

@keyframes pulsePending {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.08); }
  100% { transform: scale(1); }
}

/* "Ya enviado a cocina/barra": baja opacidad para distinguir el producto
   y un check en la esquina superior izquierda. NO oculta nada y no
   interfiere con qty (sup. derecha) ni course (inf. derecha). */
.carta-product-card.has-sent {
  opacity: 0.6;
}

.carta-product-card.has-sent::after {
  content: "✓";
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  line-height: 1;
  border-radius: 999px;
  padding: 2px 5px;
  pointer-events: none;
  z-index: 2;
}

/* Pulso corto al cruzar una tarjeta durante “arrastre para añadir”
   (clase drag-adding): escala + halo verde coherente con repeat-add. */
.carta-product-card.drag-adding {
  transform: scale(0.96);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
}

/* Mientras se está añadiendo en bucle (hold-to-repeat-add): aro verde
   para señalar "añadiendo varias unidades". Se mantiene desde los 200 ms
   hasta que se suelta o hasta que holding (rojo) toma el relevo a 400 ms
   si el remove encuentra una línea pendiente. */
.carta-product-card.repeating {
  transform: scale(0.94);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.25);
}

/* Feedback visual mientras se mantiene pulsada la tarjeta para quitar 1
   unidad (long-press). La clase holding se añade a los 200 ms y se
   retira al soltar/cancelar. El color rojo señala "vas a quitar". */
.carta-product-card.holding {
  transform: scale(0.92);
  box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.25);
}

.carta-product-media {
  max-width: 74px;
  height: 50px;
}

@media (min-width: 768px) {
  .carta-product-grid { grid-template-columns: repeat(5, 1fr); }
  .carta-product-card { height: 120px; min-height: 120px; padding: 8px; gap: 4px; }
  .carta-product-media { max-width: 82px; height: 56px; }
}

@media (min-width: 1024px) {
  .carta-product-grid { grid-template-columns: repeat(6, 1fr); }
  .carta-product-card { height: 120px; min-height: 120px; padding: 8px; gap: 4px; }
  .carta-product-media { max-width: 86px; height: 60px; }
}

@media (min-width: 1280px) {
  .carta-product-grid { grid-template-columns: repeat(6, 1fr); }
}

@media (min-width: 1536px) {
  .carta-product-grid { grid-template-columns: repeat(7, 1fr); }
}

@media (max-width: 767.98px) {
  .carta-layout {
    flex-direction: column;
    gap: 10px;
  }
  .carta-aside,
  .carta-comanda {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    flex-shrink: 0;
    border-right: none;
  }
  .carta-main,
  .carta-productos {
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }
  .carta-products-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}

/* === Mobile + embedded en Operación: viewport locked, productos con
   scroll propio para evitar el clip por overflow:hidden de los padres === */
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-layout {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-products-scroll {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
`,
        }}
      />
      {!embeddedInOperacion ? (
        <HostlyPageHeader
          wide
          isMobileLayout={cartaHeaderMobile}
          mobileStackLeftColumn={cartaHeaderMobile}
          left={
            <HostlyBackButton
              onClick={() => router.push("/dashboard")}
              label={t("common.backToDashboard")}
              ariaLabel="Volver al dashboard"
            />
          }
          title="TPV / Carta"
          subtitle={t("cartaTpv.viewTpv")}
          right={
            <div
              className="carta-mode-seg carta-mode-seg--compact carta-header-mode-tabs"
              role="group"
              aria-label="Modo"
            >
              <button
                type="button"
                onClick={() => setViewMode("normal")}
                className="carta-mode-btn carta-mode-btn--compact"
                aria-pressed={viewMode === "normal"}
              >
                TPV
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cocina")}
                className="carta-mode-btn carta-mode-btn--compact"
                aria-pressed={viewMode === "cocina"}
              >
                Cocina
              </button>
              <button
                type="button"
                onClick={() => setViewMode("barra")}
                className="carta-mode-btn carta-mode-btn--compact"
                aria-pressed={viewMode === "barra"}
              >
                Barra
              </button>
            </div>
          }
          containerStyle={{
            paddingTop: 6,
            paddingBottom: cartaHeaderMobile ? 16 : 6,
          }}
        />
      ) : null}

      <div
        className={`carta-page-main${
          embeddedInOperacion ? "" : " carta-page-main--below-header"
        }${showTableMap ? " carta-page-main--map" : ""}`}
      >
      {viewMode === "cocina" ? (
        <HostlyPageContainer
          wide
          className="carta-kitchen-wrap"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingTop: 10,
            paddingBottom: 18,
          }}
        >
          <div
            style={{
              marginBottom: 10,
              color: "#94a3b8",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {t("cartaTpv.pending")}: {cocinaItems.length}
          </div>

          <div>
            {cocinaCourseSections.map((section) => (
              <div key={section.key} className="carta-kitchen-section">
                <h3 className="carta-kitchen-section-title">{section.title}</h3>
                <div className="carta-kitchen-grid">
                  {section.items.map((item) => {
                    const tone = item.status === "sent" ? "preparing" : "new";
                    const paseCocina = getCocinaCardCourseLabel(item.course);
                    return (
                      <div
                        key={item.id}
                        className={`carta-kitchen-card carta-kitchen-card--${tone}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => advanceLineStatusKitchen(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            advanceLineStatusKitchen(item.id);
                          }
                        }}
                      >
                        <div className="carta-kitchen-qty">x{item.quantity}</div>
                        <div
                          style={{
                            flex: "1 1 auto",
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            paddingTop: 2,
                          }}
                        >
                          <div className="carta-kitchen-name">
                            {comandaLineDisplayName(item)}
                          </div>
                          {paseCocina ? (
                            <div className="carta-kitchen-course">{paseCocina}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </HostlyPageContainer>
      ) : (
        <HostlyPageContainer
          wide
          className={showTableMap ? "carta-map-page-fill" : undefined}
          style={
            showTableMap
              ? undefined
              : {
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  paddingTop: 18,
                  paddingBottom: 18,
                }
          }
        >
          {showTableMap ? (
            <div
              className="carta-table-map-shell"
              style={
                cartaHeaderMobile && !embeddedInOperacion
                  ? {
                      width: "100%",
                      minHeight: "420px",
                      height: "auto",
                      overflow: "visible",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                    }
                  : {
                      position: "relative",
                      flex: 1,
                      minHeight: 0,
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }
              }
            >
              <div
                role="status"
                aria-live="polite"
                className={
                  mapSummaryAlertLevel === "critical"
                    ? "carta-map-summary-shell--critical carta-map-summary-block"
                    : "carta-map-summary-shell carta-map-summary-block"
                }
                style={{
                  border:
                    mapSummaryAlertLevel === "critical"
                      ? "2px solid rgba(239, 68, 68, 0.88)"
                      : mapSummaryAlertLevel === "warning"
                        ? "2px solid rgba(245, 158, 11, 0.85)"
                        : "1px solid rgba(148, 163, 184, 0.18)",
                  boxShadow:
                    mapSummaryAlertLevel === "critical"
                      ? "0 0 0 1px rgba(239, 68, 68, 0.35), 0 0 16px rgba(239, 68, 68, 0.22)"
                      : mapSummaryAlertLevel === "warning"
                        ? "0 0 0 1px rgba(245, 158, 11, 0.28), 0 0 14px rgba(245, 158, 11, 0.2)"
                        : undefined,
                  marginBottom: 0,
                }}
              >
                <div className="carta-map-top-strip-main">
                  <span className="carta-map-summary-pill carta-map-summary-pill--neutral">
                    {mapQuickSummary.total} mesas
                  </span>
                  <span className="carta-map-summary-pill carta-map-summary-pill--busy">
                    {mapQuickSummary.busy} ocupadas
                  </span>
                  <span className="carta-map-summary-pill carta-map-summary-pill--warn">
                    {mapQuickSummary.warning} atención
                  </span>
                  <span className="carta-map-summary-pill carta-map-summary-pill--crit">
                    {mapQuickSummary.critical} críticas
                  </span>
                  {reservationPressureCounts.upcoming > 0 ? (
                    <span
                      className="carta-map-summary-pill carta-map-summary-pill--warn"
                      title="Reservas próximas (90 min)"
                    >
                      {reservationPressureCounts.upcoming} próximas
                    </span>
                  ) : null}
                  {reservationPressureCounts.late > 0 ? (
                    <span
                      className="carta-map-summary-pill carta-map-summary-pill--crit"
                      title="Reservas retrasadas (≥15 min)"
                    >
                      {reservationPressureCounts.late} retrasadas
                    </span>
                  ) : null}
                  {mapZoneOptions.length > 1 ? (
                    <div className="carta-map-zones-inline" role="tablist">
                      <button
                        type="button"
                        className={`carta-table-map-zone-btn${
                          mapZoneFilter === "__all__"
                            ? " carta-table-map-zone-btn--on"
                            : ""
                        }`}
                        onClick={() => setMapZoneFilter("__all__")}
                      >
                        {t("cartaTpv.mapZonesAll")}
                      </button>
                      {mapZoneOptions.map((z) => (
                        <button
                          key={z}
                          type="button"
                          className={`carta-table-map-zone-btn${
                            mapZoneFilter === z
                              ? " carta-table-map-zone-btn--on"
                              : ""
                          }`}
                          onClick={() => setMapZoneFilter(z)}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span className="carta-map-summary-status">
                  {mapSummaryAlertLevel === "critical"
                    ? "Atención urgente"
                    : mapSummaryAlertLevel === "warning"
                      ? "Revisar mesas"
                      : "Servicio estable"}
                </span>
              </div>
              <div className="carta-map-waiter-row">
                <label className="carta-map-waiter-compact">
                  <span style={{ opacity: 0.75 }}>Camarero</span>
                  <select
                    value={waiterFilter}
                    onChange={(e) => {
                      setWaiterFilter(e.target.value);
                    }}
                  >
                    <option value="all">Todas</option>
                    <option value="me">Mis mesas</option>
                    {restaurantWaiters.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div
                ref={mapRef}
                className="carta-table-map-grid"
                style={
                  cartaHeaderMobile && !embeddedInOperacion
                    ? {
                        position: "relative",
                        width: "100%",
                        minHeight: "420px",
                        height: "auto",
                        overflow: "visible",
                        cursor: "default",
                      }
                    : {
                        position: "relative",
                        flex: 1,
                        minHeight: 0,
                        width: "100%",
                        height: "100%",
                        overflow: "hidden",
                        cursor: "default",
                      }
                }
                onWheel={handleMapWheel}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height:
                      cartaHeaderMobile && !embeddedInOperacion ? "auto" : "100%",
                    minHeight:
                      cartaHeaderMobile && !embeddedInOperacion ? "420px" : 0,
                  }}
                >
                {tablesVisibleOnMap.length === 0 ? (
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      margin: 0,
                      width: "100%",
                    }}
                  >
                    {t("cartaTpv.mapEmpty")}
                  </p>
                ) : mapTablesOrderedByVisualPriority.length === 0 ? (
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      margin: 0,
                      width: "100%",
                    }}
                  >
                    No hay mesas para este filtro de camarero.
                  </p>
                ) : (
                  <PinchZoomMap
                    enabled={cartaHeaderMobile && embeddedInOperacion}
                    minZoom={0.6}
                    maxZoom={2.5}
                    initialZoom={1}
                  >
                  <EditableFloorMap
                    editable={false}
                    elements={mapTablesOrderedByVisualPriority}
                    renderElement={(ctx) => {
                      const tableId = ctx.elementId;
                      const stableTable = tablesById[tableId] ?? ctx.element;
                      const mapLayoutX = ctx.mapLayoutX;
                      const mapLayoutY = ctx.mapLayoutY;
                      const mapTileWidth = ctx.mapTileWidth;
                      const mapTileHeight = ctx.mapTileHeight;
                      const priorityTable =
                        mapTablesOrderedByVisualPriority.find(
                          (t) => String(t.id).trim() === tableId,
                        ) ?? ctx.element;
                      const busy = isTableOccupiedOnMap(tableId);
                      const isBusy = Boolean(openOrdersByTable[tableId]);
                      const tileVisual = mapTileOccupancyVisual(tableId, busy);
                      const durationLabel =
                        busy && firestoreOccupiedTableIds.has(tableId)
                          ? formatMapOccupiedDuration(tableId)
                          : null;
                      const activeLineCount = ordersByTable[tableId]?.length ?? 0;
                      const showProductCount = busy && activeLineCount > 0;
                      const badgeTier =
                        activeLineCount >= 8
                          ? "high"
                          : activeLineCount >= 4
                            ? "medium"
                            : "low";
                      const occupancyStartMs = firestoreOccupancyStartMsByTable[tableId];
                      const minutesOccupied =
                        occupancyStartMs != null
                          ? Math.max(0, (now - occupancyStartMs) / 60000)
                          : 0;
                      const isCriticalTable =
                        busy &&
                        occupancyStartMs != null &&
                        minutesOccupied >= 45 &&
                        activeLineCount >= 8;
                      const ariaTileBusy = busy
                        ? `${String(stableTable.name ?? "").trim()}${durationLabel ? `, ${durationLabel}` : ""}${showProductCount ? ` (${activeLineCount})` : ""}, ${t("cartaTpv.mapOcupada")}`
                        : "";

                      const total = orderTotalsByTable[tableId];
                      const openedAt = orderOpenedAtByTable[tableId];
                      const openedAtMs =
                        typeof openedAt === "number" && Number.isFinite(openedAt)
                          ? openedAt
                          : undefined;
                      const priorityLevel = computeMapVisualPriorityLevel(
                        openedAtMs,
                        now,
                        typeof total === "number" && Number.isFinite(total)
                          ? total
                          : undefined,
                      );
                      const lastActivityAt = lastActivityAtByTable[tableId];
                      const inactiveMinutes =
                        isBusy &&
                        lastActivityAt != null &&
                        Number.isFinite(lastActivityAt)
                          ? Math.max(
                              0,
                              Math.floor((now - lastActivityAt) / 60000),
                            )
                          : 0;

                      const dinersRaw =
                        (stableTable as unknown as { dinersCount?: unknown; guestCount?: unknown })
                          ?.dinersCount ??
                        (stableTable as unknown as { guestCount?: unknown })?.guestCount;
                      const dinersCount =
                        typeof dinersRaw === "number" && Number.isFinite(dinersRaw)
                          ? Math.max(0, Math.floor(dinersRaw))
                          : 0;
                      const paxLabel = dinersCount > 0 ? `${dinersCount} pax` : "";

                      return (
                        <ElementCard
                          key={stableTable.id}
                          table={stableTable}
                          tableId={tableId}
                          busy={busy}
                          tileVisual={tileVisual}
                          durationLabel={durationLabel}
                          showProductCount={showProductCount}
                          activeLineCount={activeLineCount}
                          badgeTier={badgeTier}
                          isCriticalTable={isCriticalTable}
                          ariaLabel={busy ? ariaTileBusy : undefined}
                          mapLibreLabel={paxLabel || tableMapLibreLabel}
                          onTableClick={handleTableMapTileClick}
                          occupancyStart={
                            firestoreOccupancyStartMsByTable[tableId] || 0
                          }
                          priority={mapTablePriorityScore(priorityTable)}
                          setNodeRef={getTableFlipRefCallback(tableId)}
                          prefersReducedMotion={prefersReducedMotion}
                          isUltraFastMode={isUltraFastMode}
                          mapLayoutX={mapLayoutX}
                          mapLayoutY={mapLayoutY}
                          mapTileWidth={mapTileWidth}
                          mapTileHeight={mapTileHeight}
                          tableShape={
                            stableTable.tableShape === "round"
                              ? "round"
                              : "square"
                          }
                          seats={dinersCount > 0 ? dinersCount : stableTable.seats}
                          tableMapStatus={stableTable.status}
                          hasOpenOrder={isBusy}
                          orderTotal={total}
                          openedAt={openedAtMs}
                          mapNow={openedAtMs != null ? now : undefined}
                          priorityLevel={priorityLevel}
                          inactiveMinutes={inactiveMinutes}
                          waiterShortLabel={formatWaiterMapBadgeLabel(
                            stableTable.waiterName,
                          )}
                          billRequested={firestoreBillRequestedTableIds.has(
                            tableId,
                          )}
                          reservationBadge={
                            reservedByTableId[tableId]
                              ? {
                                  label: "Reservada",
                                  subLabel:
                                    reservedByTableId[tableId]?.time ||
                                    undefined,
                                }
                              : null
                          }
                          reservationPressure={
                            reservationPressureByTableId[tableId]
                              ? {
                                  type:
                                    reservationPressureByTableId[tableId]!.type,
                                  time:
                                    reservationPressureByTableId[tableId]!.time,
                                }
                              : null
                          }
                        />
                      );
                    }}
                  />
                  </PinchZoomMap>
                )}
                </div>
              </div>
            </div>
          ) : (
          <div className="carta-layout">
        {showComandaAside ? (
        <aside
          className="carta-aside carta-comanda relative"
          style={{
            boxSizing: "border-box",
            color: "#0f172a",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            alignSelf: "stretch",
            minHeight: 0,
            overflow: "hidden",
            borderRadius: 18,
            boxShadow:
              "4px 0 24px rgba(2,6,23,0.06), inset 0 0 0 1px rgba(148,163,184,0.2)",
          }}
        >
        <div className="carta-top-shell">
          <div
            className="carta-top-toolbar carta-aside-meta-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              minHeight: 48,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div
                className={
                  selectedTableId || orderIdFromUrl
                    ? "carta-active-mesa"
                    : "carta-active-mesa carta-active-mesa--empty"
                }
                title={
                  selectedTableId
                    ? tablesList.find((t) => t.id === selectedTableId)?.name ||
                      selectedTableId
                    : orderIdFromUrl
                      ? orderIdFromUrl
                      : undefined
                }
              >
                <div className="grid grid-cols-3 items-center w-full mb-1">
                  <div className="text-left font-semibold text-lg" style={{ minWidth: 0 }}>
                    <p
                      className="carta-comanda-headline truncate min-w-0"
                      style={{
                        fontSize: 18,
                        fontWeight: 950,
                        letterSpacing: "-0.01em",
                        textAlign: "left",
                        justifyContent: "flex-start",
                        margin: 0,
                        padding: 0,
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {selectedTableId ? (
                        formatActiveMesaIndicator(
                          tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
                            selectedTableId,
                        )
                      ) : orderIdFromUrl ? (
                        orderUrlTableId
                          ? formatActiveMesaIndicator(
                              tablesList.find((t) => t.id === orderUrlTableId)?.name?.trim() ||
                                orderUrlTableId,
                            )
                          : "Comanda"
                      ) : (
                        <span style={{ color: "rgba(15, 23, 42, 0.38)" }}>
                          Sin mesa
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-center text-xs text-gray-500">
                    {tpvComandaHeaderTime ? (
                      <span
                        className="carta-comanda-headline-time"
                        style={{ color: tpvComandaHeaderTime.color }}
                      >
                        {tpvComandaHeaderTime.label}
                      </span>
                    ) : null}
                    {totalPendingItems > 0 ? (
                      <span
                        className="carta-pending-indicator"
                        aria-label={`${totalPendingItems} unidades pendientes de enviar`}
                      >
                        {totalPendingItems} pendientes
                      </span>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    {!orderIdFromUrl &&
                    (tpvEntryMode === "tpv" || tpvEntryMode === "summary") ? (
                      <button
                        type="button"
                        className="carta-tpv-to-map-btn"
                        onClick={handleBackToMap}
                        style={{ flexShrink: 0 }}
                      >
                        {t("cartaTpv.mapNavVisible")}
                      </button>
                    ) : null}
                  </div>
                </div>
                {((!orderDocIsPaid &&
                  billRequestedForComanda &&
                  (selectedTableId || orderIdFromUrl)) ||
                  (remoteOrderNote.trim() !== "" &&
                    (selectedTableId || orderIdFromUrl))) ? (
                  <div className="carta-comanda-meta-badges">
                    {!orderDocIsPaid &&
                    billRequestedForComanda &&
                    (selectedTableId || orderIdFromUrl) ? (
                      <span
                        className="carta-comanda-meta-badge"
                        style={{
                          background: "rgba(254, 243, 199, 0.95)",
                          color: "#92400e",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                        }}
                      >
                        Cuenta pedida
                      </span>
                    ) : null}
                    {remoteOrderNote.trim() !== "" &&
                    (selectedTableId || orderIdFromUrl) ? (
                      <span
                        className="carta-comanda-meta-badge"
                        style={{
                          background: "rgba(241, 245, 249, 0.95)",
                          color: "#475569",
                          border: "1px solid rgba(148, 163, 184, 0.4)",
                        }}
                      >
                        Nota guardada
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {viewMode === "normal" && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                alignItems: "center",
              }}
            >
              {selectedTableId ? (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#0f172a",
                    background: "rgba(15,23,42,0.06)",
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ whiteSpace: "nowrap" }}>Comensales:</span>
                  <button
                    type="button"
                    onClick={() => void persistGuestCount(guestCount - 1)}
                    disabled={guestCount <= 0}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      border: "1px solid rgba(15,23,42,0.12)",
                      background: "#fff",
                      cursor: guestCount <= 0 ? "not-allowed" : "pointer",
                      opacity: guestCount <= 0 ? 0.6 : 1,
                      fontWeight: 500,
                      lineHeight: "24px",
                    }}
                  >
                    -
                  </button>
                  <span
                    style={{
                      minWidth: 12,
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.1,
                    }}
                  >
                    {guestCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => void persistGuestCount(guestCount + 1)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      border: "1px solid rgba(37, 99, 235, 0.25)",
                      background: "rgba(59,130,246,0.12)",
                      cursor: "pointer",
                      fontWeight: 500,
                      lineHeight: "24px",
                    }}
                  >
                    +
                  </button>
                </div>
              ) : null}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#0f172a",
                  background: "rgba(15,23,42,0.06)",
                  border: "1px solid rgba(15,23,42,0.12)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  lineHeight: 1.1,
                }}
              >
                Pendiente {linesPending.length}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#1e3a8a",
                  background: "rgba(59,130,246,0.14)",
                  border: "1px solid rgba(37, 99, 235, 0.25)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  lineHeight: 1.1,
                }}
              >
                Enviado {linesSent.length}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#9a3412",
                  background: "rgba(245,158,11,0.14)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  lineHeight: 1.1,
                }}
              >
                Preparado {linesPrepared.length}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#166534",
                  background: "rgba(34,197,94,0.14)",
                  border: "1px solid rgba(34, 197, 94, 0.25)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  lineHeight: 1.1,
                }}
              >
                Servido {linesServed.length}
              </span>
            </div>
          )}
        </div>
        <div className="carta-aside-scroll">
          {viewMode === "barra" ? (
            <div style={{ margin: "0 0 12px" }}>
              {(() => {
                const area = "barra";
                const groupedByTable = Object.entries(ordersByTable)
                  .map(([mesaKey, items]) => {
                    const filtered = (items || [])
                      .filter(
                        (item) =>
                          item.status !== "served" &&
                          ((item.product as Product & { preparationArea?: string })
                            .preparationArea || "cocina") === area,
                      )
                      .sort((a, b) => {
                        const getPriority = (item: CartOrderLine) => {
                          const timeInfo = getItemTimeInfo(item.createdAt);

                          if (timeInfo.label === "URGENTE") return 3;
                          if (timeInfo.label === "EN CURSO") return 2;
                          return 1;
                        };

                        const priorityDiff = getPriority(b) - getPriority(a);

                        if (priorityDiff !== 0) return priorityDiff;

                        return (a.createdAt || 0) - (b.createdAt || 0);
                      });

                    return {
                      mesa: mesaKey,
                      items: filtered,
                    };
                  })
                  .filter((group) => group.items.length > 0);

                return groupedByTable.map((group) => (
                  <div key={group.mesa} style={{ marginBottom: "20px" }}>
                    <div
                      style={{
                        fontWeight: "bold",
                        marginBottom: "8px",
                        fontSize: "16px",
                      }}
                    >
                      MESA{" "}
                      {tablesList.find((t) => t.id === group.mesa)?.name?.trim() ||
                        group.mesa}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleMarkTableAsDone(group.mesa)}
                      style={{
                        marginBottom: "10px",
                        padding: "6px 10px",
                        backgroundColor: "#222",
                        color: "white",
                        borderRadius: "4px",
                        cursor: "pointer",
                        border: "none",
                      }}
                    >
                      Marcar todo como hecho
                    </button>

                    {group.items.map((item) => {
                      const timeInfo = getItemTimeInfo(item.createdAt);
                      return (
                        <div
                          key={`${item.product.id}${item.createdAt ?? ""}`}
                          className={`item ${timeInfo.label === "URGENTE" ? "urgent" : ""}`}
                          style={{
                            backgroundColor: getItemColor(item.createdAt),
                            padding: "10px",
                            marginBottom: "5px",
                            borderRadius: "6px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "bold",
                              color: timeInfo.color,
                              marginBottom: "4px",
                            }}
                          >
                            {timeInfo.minutes} min · {timeInfo.label}
                          </div>
                          {item.product.nombre} x{item.quantity}
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          ) : (
            <>
              {order.length === 0 ? (
                <div
                  style={{
                    padding: "28px 12px",
                    textAlign: "center",
                    color: "#64748b",
                    fontWeight: 600,
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  Aún no hay productos en esta comanda
                </div>
              ) : (
                <>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                    }}
                  >
                    {visibleLinesDebug.length === -1 ? null : null}
                    {linesPending.map((item, idx) =>
                      renderComandaLine(item, "Pendiente", {
                        attachFirstPendingRef: idx === 0,
                      }),
                    )}
                    {linesSent.map((item) => renderComandaLine(item, "Enviado", {}))}
                    {linesPrepared.map((item) =>
                      renderComandaLine(item, "Preparado", {}),
                    )}
                    {viewMode === "normal"
                      ? linesServed.map((item) =>
                          renderComandaLine(item, "Servido", { strike: true }),
                        )
                      : null}
                  </ul>

                </>
              )}
            </>
          )}
          <div ref={tpvBillScrollAnchorRef} className="carta-aside-footer" />
        </div>
        {viewMode === "normal" &&
        (selectedTableId || orderIdFromUrl) &&
        restaurantId &&
        isFirebaseConfigured ? (
          <div
            ref={tpvBillScrollAnchorRef}
            className="carta-tpv-payment-dock"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  alignItems: "stretch",
                }}
              >
                <button
                  type="button"
                  className="carta-comanda-button"
                  onClick={() => {
                    if (!hasPendingItems) return;
                    void handleComandaAndExit();
                  }}
                  disabled={
                    isComandaSending ||
                    order.length === 0 ||
                    !selectedTableId ||
                    !hasPendingItems
                  }
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor:
                      isComandaSending ||
                      order.length === 0 ||
                      !selectedTableId ||
                      !hasPendingItems
                        ? "not-allowed"
                        : "pointer",
                    borderRadius: 14,
                    border: "1px solid rgba(15, 23, 42, 0.12)",
                    background: "#e5e7eb",
                    color: "#111827",
                    minHeight: 44,
                    opacity:
                      isComandaSending ||
                      order.length === 0 ||
                      !selectedTableId ||
                      !hasPendingItems
                        ? 0.5
                        : 1,
                    filter: comandaSentFlash ? "brightness(1.06)" : "none",
                    transition:
                      "filter 120ms ease, opacity 120ms ease, background-color 120ms ease",
                    boxShadow: "0 1px 2px rgba(2,6,23,0.06)",
                  }}
                >
                  {comandaSentFlash ? "Comanda enviada" : "Comanda"}
                </button>
                <div style={{ minWidth: 0, display: "flex" }}>
                  <button
                    type="button"
                    onClick={handlePrintPreTicket}
                    className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-3 rounded-xl text-sm font-medium transition"
                    style={{ minHeight: 44 }}
                  >
                    Pre-ticket
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  alignItems: "stretch",
                }}
              >
                <div
                  className="carta-tpv-payment-dock-total"
                  style={{
                    marginBottom: 0,
                    width: "100%",
                    minHeight: 44,
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: "rgba(2, 6, 23, 0.35)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <div className="carta-tpv-payment-dock-total-label">Total</div>
                  <div className="carta-tpv-payment-dock-total-value">
                    {Number.isFinite(total) ? total.toFixed(2) : "0.00"}{" "}
                    <span className="carta-tpv-payment-dock-total-eur">€</span>
                  </div>
                </div>

                <div style={{ minWidth: 0, display: "flex" }}>
                  {selectedTableId ? (
                    <button
                      type="button"
                      onClick={() => setIsPaymentOpen(true)}
                      disabled={
                        isPayTableOrderSending ||
                        order.length === 0 ||
                        !restaurantId ||
                        !isFirebaseConfigured
                      }
                      title={
                        order.length === 0
                          ? "No hay productos en la comanda"
                          : "Cobrar esta mesa"
                      }
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        fontWeight: 900,
                        fontSize: 14,
                        cursor:
                          isPayTableOrderSending ||
                          order.length === 0 ||
                          !restaurantId ||
                          !isFirebaseConfigured
                            ? "not-allowed"
                            : "pointer",
                        borderRadius: 14,
                        border: "1px solid rgba(37, 99, 235, 0.35)",
                        background:
                          "linear-gradient(180deg, rgba(59,130,246,1) 0%, rgba(29,78,216,1) 100%)",
                        color: "#fff",
                        boxShadow: "0 12px 22px rgba(37,99,235,0.38)",
                        opacity:
                          isPayTableOrderSending ||
                          order.length === 0 ||
                          !restaurantId ||
                          !isFirebaseConfigured
                            ? 0.55
                            : 1,
                        minHeight: 44,
                        lineHeight: 1.1,
                      }}
                    >
                      {isPayTableOrderSending ? "…" : "💳 Cobrar"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        </aside>
        ) : null}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }

            #pre-ticket-print,
            #pre-ticket-print * {
              visibility: visible;
            }

            #pre-ticket-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
              padding: 8px;
              font-family: monospace;
              font-size: 12px;
              color: black;
              background: white;
            }

            @page {
              size: 80mm auto;
              margin: 0;
            }
          }
        `}</style>
        <div id="pre-ticket-print" className="hidden print:block">
          <div style={{ textAlign: "center", fontWeight: 800 }}>
            {isFinalTicketOpen ? "TICKET" : "PRE-TICKET"}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, marginTop: 2 }}>
            {(selectedTableId
              ? tablesList.find((t) => t.id === selectedTableId)?.name?.trim() || "Mesa"
              : "Mesa")}{" "}
            · {new Date().toLocaleString()}
          </div>
          {isFinalTicketOpen && (
            <div style={{ textAlign: "center", fontSize: 11, marginTop: 2, marginBottom: 6 }}>
              Ticket: {lastPaymentInfo?.ticketNumber ?? "—"}
              {lastPaymentInfo?.invoiceNumber
                ? ` · Factura: ${lastPaymentInfo.invoiceNumber}`
                : ""}
            </div>
          )}
          {!isFinalTicketOpen && <div style={{ marginBottom: 8 }} />}
          <div style={{ borderTop: "1px dashed #111827", margin: "8px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(isFinalTicketOpen ? lastOrderSnapshot : order).map((item) => {
              const isGifted = Boolean(item.isComped);
              const unit = comandaLineUnitPriceWithExtras(item);
              const qty = Number(item.quantity) || 0;
              const lineTotal = isGifted ? 0 : unit * qty;
              return (
                <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.quantity} x {comandaLineDisplayName(item)}
                    </span>
                    <span>{(Number.isFinite(lineTotal) ? lineTotal : 0).toFixed(2)}€</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 11,
                      opacity: 0.85,
                    }}
                  >
                    <span>{isGifted ? "(INVITADO)" : ""}</span>
                    <span>Precio unitario: {(Number.isFinite(unit) ? unit : 0).toFixed(2)}€</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px dashed #111827", margin: "8px 0" }} />
          {isFinalTicketOpen ? (
            lastTicketBreakdown && lastTicketBreakdown.discountTotal > 0 ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal</span>
                    <span>{lastTicketBreakdown.originalTotal.toFixed(2)}€</span>
                  </div>
                  {lastTicketBreakdown.invPart > 0 ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Invitación</span>
                      <span>-{lastTicketBreakdown.invPart.toFixed(2)}€</span>
                    </div>
                  ) : null}
                  {lastTicketBreakdown.percentValue > 0 && lastTicketBreakdown.pctPart > 0 ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Descuento {lastTicketBreakdown.percentValue}%</span>
                      <span>-{lastTicketBreakdown.pctPart.toFixed(2)}€</span>
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 800,
                    marginTop: 6,
                  }}
                >
                  <span>TOTAL</span>
                  <span>{lastTicketBreakdown.finalTotal.toFixed(2)}€</span>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span>TOTAL</span>
                <span>
                  {(lastTicketBreakdown
                    ? lastTicketBreakdown.finalTotal
                    : sumCartOrderLinesTotal(lastOrderSnapshot)
                  ).toFixed(2)}
                  €
                </span>
              </div>
            )
          ) : discountTotal > 0 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal</span>
                  <span>{originalTotal.toFixed(2)}€</span>
                </div>
                {preticketDisc.invPart > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Invitación</span>
                    <span>-{preticketDisc.invPart.toFixed(2)}€</span>
                  </div>
                ) : null}
                {discountPercentValue > 0 && preticketDisc.pctPart > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Descuento {discountPercentValue}%</span>
                    <span>-{preticketDisc.pctPart.toFixed(2)}€</span>
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                <span>TOTAL</span>
                <span>{finalTotal.toFixed(2)}€</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
              <span>TOTAL</span>
              <span>{(Number.isFinite(total) ? total : 0).toFixed(2)}€</span>
            </div>
          )}
        </div>
        {isPaymentOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-3">
            <div className="bg-white text-gray-900 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-32px)] overflow-hidden">
              <div
                className={
                  isSimplePaymentMode
                    ? "flex-1 px-2.5 sm:px-3 pt-2 pb-2 flex flex-col justify-between"
                    : "flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-3 pt-2 pb-0"
                }
              >
                {isSimplePaymentMode ? (
                  <div className="flex flex-col justify-between min-h-0 flex-1">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-900 leading-tight">
                        <span>Cobrar mesa</span>
                        <button
                          type="button"
                          onClick={() => setSoundEnabled((v) => !v)}
                          className="text-[10px] text-gray-500 shrink-0"
                        >
                          🔊 {soundEnabled ? "On" : "Off"}
                        </button>
                      </div>

                      {(() => {
                        const payDisc = calculateFinalTotal(total);
                        const payTotal = payDisc.finalTotal;
                        const received = Number(cashReceived.replace(",", "."));
                        const change = Math.max(received - payTotal, 0);
                        const receivedCardRaw = Number(cardReceived.replace(",", ".") || 0);
                        const tipRaw =
                          receivedCardRaw > payTotal ? receivedCardRaw - payTotal : 0;
                        const voucherValueUi = parseMoney(voucherAmount);
                        const voucherUsedUi = Math.min(voucherValueUi, payTotal);
                        const voucherRemainingUi = Math.max(voucherValueUi - payTotal, 0);

                        return (
                          <>
                            <div className="flex items-end justify-between gap-2">
                              <div className="text-xs font-semibold text-gray-700 leading-none">
                                Total a pagar
                              </div>
                              <div className="text-2xl font-extrabold tracking-tight text-gray-900 leading-none">
                                {payTotal.toFixed(2)} €
                              </div>
                            </div>

                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                className={`flex-1 py-2 rounded-md text-xs font-semibold ${
                                  paymentMethod === "cash"
                                    ? "bg-blue-600 text-white shadow"
                                    : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                                }`}
                                onClick={() => {
                                  setPaymentMethod("cash");
                                  setCashReceived(
                                    (Number.isFinite(payTotal) ? payTotal : 0).toFixed(2),
                                  );
                                }}
                              >
                                Efectivo
                              </button>
                              <button
                                type="button"
                                className={`flex-1 py-2 rounded-md text-xs font-semibold ${
                                  paymentMethod === "card"
                                    ? "bg-blue-600 text-white shadow"
                                    : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                                }`}
                                onClick={() => {
                                  setPaymentMethod("card");
                                  setCardReceivedTouched(false);
                                  setCardReceived(
                                    (Number.isFinite(payTotal) ? payTotal : 0).toFixed(2),
                                  );
                                }}
                              >
                                Tarjeta
                              </button>
                              <button
                                type="button"
                                className={`flex-1 py-2 rounded-md text-xs font-semibold ${
                                  paymentMethod === "voucher"
                                    ? "bg-blue-600 text-white shadow"
                                    : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                                }`}
                                onClick={() => setPaymentMethod("voucher")}
                              >
                                Voucher
                              </button>
                            </div>

                            {paymentMethod === "card" && (
                              <>
                                <input
                                  type="text"
                                  placeholder="Importe cobrado"
                                  value={cardReceived}
                                  onChange={(e) => {
                                    setCardReceivedTouched(true);
                                    setCardReceived(e.target.value);
                                  }}
                                  className="w-full border rounded-md px-2 py-1.5 text-xs"
                                />
                                {tipRaw > 0 ? (
                                  <div className="flex justify-between text-xs text-green-600">
                                    <span>Propina</span>
                                    <span>{tipRaw.toFixed(2)} €</span>
                                  </div>
                                ) : receivedCardRaw > 0 ? (
                                  <div className="flex justify-between text-xs text-gray-400">
                                    <span>Propina</span>
                                    <span>0.00 €</span>
                                  </div>
                                ) : null}
                              </>
                            )}

                            {paymentMethod === "voucher" && (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  placeholder="Importe voucher"
                                  value={voucherAmount}
                                  onChange={(e) => setVoucherAmount(e.target.value)}
                                  className="w-full border rounded-md px-2 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  placeholder="Número de voucher"
                                  value={voucherNumber}
                                  onChange={(e) => setVoucherNumber(e.target.value)}
                                  className="w-full border rounded-md px-2 py-1.5 text-xs"
                                />
                                {voucherLookupBalance != null && (
                                  <div className="text-xs text-gray-600 leading-tight">
                                    Saldo disponible: {voucherLookupBalance.toFixed(2)} €
                                  </div>
                                )}
                                {voucherValueUi > 0 && (
                                  <div className="text-xs text-gray-600 leading-tight">
                                    Usado: {voucherUsedUi.toFixed(2)} €{" "}
                                    {voucherRemainingUi > 0 ? (
                                      <span className="text-amber-600">
                                        · Restante: {voucherRemainingUi.toFixed(2)} €
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            )}

                            {paymentMethod === "cash" && (
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-gray-700">
                                  Importe recibido
                                </div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={cashReceived}
                                  onChange={(e) => setCashReceived(e.target.value)}
                                  placeholder="0"
                                  className="w-full text-base px-2 py-2 border rounded-md text-center leading-tight"
                                  style={{
                                    borderColor: "rgba(15,23,42,0.14)",
                                    outline: "none",
                                  }}
                                />
                              </div>
                            )}

                            {paymentMethod === "cash" && (
                              <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2 text-sm font-semibold text-gray-900">
                                <span>Cambio</span>
                                <span>
                                  {Number.isFinite(received) && received >= payTotal
                                    ? `${change.toFixed(2)} €`
                                    : "0.00 €"}
                                </span>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={paymentMethod === null || !isPaymentValid(payTotal)}
                              className="w-full py-2.5 rounded-md text-sm font-semibold shadow"
                              style={{
                                background:
                                  paymentMethod === null || !isPaymentValid(payTotal)
                                    ? "rgba(148,163,184,0.55)"
                                    : "#2563eb",
                                color: "#fff",
                                cursor:
                                  paymentMethod === null || !isPaymentValid(payTotal)
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              onClick={() => {
                                if (paymentMethod === null) return;
                                void handleConfirmPayment();
                              }}
                            >
                              Confirmar cobro
                            </button>

                            <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1.5">
                              <div className="text-[11px] font-semibold text-gray-700 leading-tight">
                                Ajustes
                              </div>

                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Invitación (€)"
                                  value={discountAmount}
                                  onChange={(e) => setDiscountAmount(e.target.value)}
                                  className="flex-1 border rounded-md px-2 py-1 text-[11px] leading-tight bg-white"
                                />
                                <input
                                  type="text"
                                  placeholder="Descuento (%)"
                                  value={discountPercent}
                                  onChange={(e) => setDiscountPercent(e.target.value)}
                                  className="flex-1 border rounded-md px-2 py-1 text-[11px] leading-tight bg-white"
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-gray-700">Factura</span>
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 accent-blue-600 shrink-0"
                                  checked={isInvoice}
                                  onChange={(e) => setIsInvoice(e.target.checked)}
                                />
                              </div>

                              {isInvoice && (
                                <div className="grid gap-1">
                                  <input
                                    placeholder="Nombre / Empresa"
                                    className="input-base !py-1 !text-[11px]"
                                    value={invoiceName}
                                    onChange={(e) => setInvoiceName(e.target.value)}
                                  />
                                  <input
                                    placeholder="NIF / CIF"
                                    className="input-base !py-1 !text-[11px]"
                                    value={invoiceTaxId}
                                    onChange={(e) => setInvoiceTaxId(e.target.value)}
                                  />
                                  <input
                                    placeholder="Email"
                                    className="input-base !py-1 !text-[11px]"
                                    value={invoiceEmail}
                                    onChange={(e) => setInvoiceEmail(e.target.value)}
                                  />
                                </div>
                              )}

                              <div className="flex gap-2 pt-0.5">
                                <button
                                  type="button"
                                  className="flex-1 py-1.5 rounded-md text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-900 border border-gray-200"
                                  onClick={handlePrintPreTicket}
                                >
                                  Pre-ticket
                                </button>
                                <button
                                  type="button"
                                  className="flex-1 py-1.5 rounded-md text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-900 border border-gray-200"
                                  onClick={() => {
                                    setIsSplitMode(true);
                                    setIsSplitEqualMode(false);
                                    setSplitCount(2);
                                    setCurrentSplitIndex(1);
                                  }}
                                >
                                  Dividir cuenta
                                </button>
                              </div>

                              <button
                                type="button"
                                className="w-full py-2 rounded-lg font-semibold bg-white hover:bg-gray-100 text-gray-700 text-sm border border-gray-200"
                                onClick={() => {
                                  setIsPaymentOpen(false);
                                  setPaymentMethod(null);
                                  setIsInvoice(false);
                                  setInvoiceName("");
                                  setInvoiceTaxId("");
                                  setInvoiceEmail("");
                                  setCashReceived("");
                                  setCardReceived("");
                                  setVoucherAmount("");
                                  setVoucherNumber("");
                                  setDiscountAmount("");
                                  setDiscountPercent("");
                                  setIsSplitMode(false);
                                  setIsSplitEqualMode(false);
                                  setIsSplitItemsMode(false);
                                  setIsSplitItemsPayMode(false);
                                  setSelectedItemIds([]);
                                  setPaidSplitItemIds([]);
                                  setPartialPayments([]);
                                  setSplitCount(2);
                                  setCurrentSplitIndex(1);
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold mb-0.5 text-gray-900 leading-tight">
                      <span>{isSplitMode ? "Dividir cuenta" : "Cobrar mesa"}</span>
                      <button
                        type="button"
                        onClick={() => setSoundEnabled((v) => !v)}
                        className="text-[10px] text-gray-500 shrink-0"
                      >
                        🔊 {soundEnabled ? "On" : "Off"}
                      </button>
                    </div>

                    <div className="text-xl font-bold mb-1 tracking-tight text-gray-900 leading-none">
                      {isSplitMode ? `${total.toFixed(2)} €` : `${finalTotal.toFixed(2)} €`}
                    </div>
                    <div className="mb-1 space-y-0.5 text-xs text-gray-700 rounded-lg border border-gray-200 p-1.5">
                      <div className="font-semibold text-gray-900 text-[11px] leading-tight">
                        Ajustes de cuenta
                      </div>
                      <input
                        type="text"
                        placeholder="Invitación (€)"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-xs leading-tight"
                      />
                      <input
                        type="text"
                        placeholder="Descuento (%)"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-xs leading-tight"
                      />
                      <button
                        type="button"
                        onClick={handlePrintPreTicket}
                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-1 rounded-md text-[11px] font-medium transition leading-tight"
                      >
                        Pre-ticket
                      </button>
                    </div>
                    {!isSplitMode && (
                      <div className="mb-1 space-y-0 text-xs text-gray-700 leading-snug">
                        {(() => {
                          const d = calculateFinalTotal(total);
                          return (
                            <>
                              <div>Subtotal: {d.baseTotal.toFixed(2)} €</div>
                              {d.invPart > 0 ? (
                                <div>Invitación: -{d.invPart.toFixed(2)} €</div>
                              ) : null}
                              {d.discountPercentValue > 0 && d.pctPart > 0 ? (
                                <div>
                                  Descuento {d.discountPercentValue}%: -{d.pctPart.toFixed(2)} €
                                </div>
                              ) : null}
                              <div className="font-semibold text-gray-900 text-xs">
                                Total a pagar: {d.finalTotal.toFixed(2)} €
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className="border-t border-gray-200/80 my-1" />

              {isSplitMode && (
                <div className="mb-1 space-y-0.5 text-xs leading-snug">
                  {(() => {
                    const paidItems = order.filter((i) => paidSplitItemIds.includes(i.id));
                    const paidTotal = paidItems.reduce(
                      (acc, i) => acc + comandaLineTotalWithExtras(i),
                      0,
                    );
                    const remainingTotal = Math.max(total - paidTotal, 0);
                    return (
                      <>
                        <div>Total: {total.toFixed(2)} €</div>
                        <div style={{ color: "#16a34a" }}>
                          Pagado: {(Number.isFinite(paidTotal) ? paidTotal : 0).toFixed(2)} €
                        </div>
                        <div style={{ color: "#dc2626", fontWeight: 700 }}>
                          Pendiente:{" "}
                          {(Number.isFinite(remainingTotal) ? remainingTotal : 0).toFixed(2)} €
                        </div>
                        {isSplitItemsMode && partialPayments.length > 0 && (
                          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              Pagos realizados
                            </div>
                            {partialPayments.map((payment, idx) => (
                              <div
                                key={payment.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <span style={{ color: "#334155" }}>
                                  Pago #{idx + 1} -{" "}
                                  {paymentSaleAmount(payment).toFixed(2)} €
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleCancelPartialPayment(payment.id)}
                                  disabled={
                                    payment.status !== "paid" ||
                                    payment.type !== "split_by_items"
                                  }
                                  className="px-2 py-1 rounded-md text-xs font-semibold"
                                  style={{
                                    background: "rgba(148,163,184,0.25)",
                                    color: "#0f172a",
                                    cursor:
                                      payment.status !== "paid" ||
                                      payment.type !== "split_by_items"
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {isSplitMode ? (
                isSplitItemsMode ? (
                  isSplitItemsPayMode ? (
                    <div style={{ display: "grid", gap: 5 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
                        Cobrar productos seleccionados
                      </div>

                      {(() => {
                        const pendingItems = order.filter(
                          (i) => !paidSplitItemIds.includes(i.id),
                        );
                        const selectedItems = pendingItems.filter((i) =>
                          selectedItemIds.includes(i.id),
                        );
                        const selectedTotal = selectedItems.reduce(
                          (acc, i) => acc + comandaLineTotalWithExtras(i),
                          0,
                        );
                        const payDisc = calculateFinalTotal(selectedTotal);
                        const payTotal = payDisc.finalTotal;
                        const voucherValueUi = parseMoney(voucherAmount);
                        const voucherUsedUi = Math.min(voucherValueUi, payTotal);
                        const voucherRemainingUi = Math.max(
                          voucherValueUi - payTotal,
                          0,
                        );

                        const received = Number(cashReceived.replace(",", "."));
                        const change = Math.max(received - payTotal, 0);
                        const receivedCardRaw = Number(cardReceived.replace(",", ".") || 0);
                        const tipRaw =
                          receivedCardRaw > payTotal
                            ? receivedCardRaw - payTotal
                            : 0;
                        const receivedCard =
                          cardReceived.trim() === ""
                            ? payTotal
                            : Number(cardReceived.replace(",", ".") || 0);

                        return (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
                              Total seleccionado:{" "}
                              {(Number.isFinite(selectedTotal) ? selectedTotal : 0).toFixed(2)} €
                            </div>
                            <div className="text-xs space-y-0 text-gray-700 mb-1 leading-snug">
                              <div>Subtotal: {payDisc.baseTotal.toFixed(2)} €</div>
                              {payDisc.invPart > 0 ? (
                                <div>Invitación: -{payDisc.invPart.toFixed(2)} €</div>
                              ) : null}
                              {payDisc.discountPercentValue > 0 && payDisc.pctPart > 0 ? (
                                <div>
                                  Descuento {payDisc.discountPercentValue}%: -
                                  {payDisc.pctPart.toFixed(2)} €
                                </div>
                              ) : null}
                              <div className="font-semibold text-gray-900">
                                Total a pagar: {payDisc.finalTotal.toFixed(2)} €
                              </div>
                            </div>

                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 py-1.5 rounded-md text-xs font-medium"
                                onClick={() => {
                                  setPaymentMethod("cash");
                                  setCashReceived(
                                    (Number.isFinite(payTotal) ? payTotal : 0).toFixed(2),
                                  );
                                }}
                              >
                                Efectivo
                              </button>
                              <button
                                type="button"
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md text-xs font-semibold shadow"
                                onClick={() => setPaymentMethod("card")}
                              >
                                Tarjeta
                              </button>
                              <button
                                type="button"
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 py-1.5 rounded-md text-xs font-medium"
                                onClick={() => setPaymentMethod("voucher")}
                              >
                                Voucher
                              </button>
                            </div>

                            {paymentMethod === "cash" && (
                              <div style={{ display: "grid", gap: 4 }}>
                                <label style={{ display: "grid", gap: 3 }}>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: "#0f172a",
                                    }}
                                  >
                                    Importe recibido
                                  </div>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={cashReceived}
                                    onChange={(e) => setCashReceived(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm px-2 py-1 border rounded-md text-center leading-tight"
                                    style={{ borderColor: "rgba(15,23,42,0.14)", outline: "none" }}
                                  />
                                </label>

                                {Number.isFinite(received) && received >= payTotal && (
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "#0f172a",
                                    }}
                                    className="leading-tight"
                                  >
                                    Cambio: {change.toFixed(2)} €
                                  </div>
                                )}
                              </div>
                            )}
                            {paymentMethod === "card" && (
                              <>
                                <input
                                  type="text"
                                  placeholder="Importe cobrado"
                                  value={cardReceived}
                                  onChange={(e) => setCardReceived(e.target.value)}
                                  className="w-full border rounded-md px-2 py-1 text-xs"
                                />
                                {tipRaw > 0 ? (
                                  <div className="flex justify-between text-xs mt-0.5 text-green-600">
                                    <span>Propina</span>
                                    <span>{tipRaw.toFixed(2)} €</span>
                                  </div>
                                ) : receivedCardRaw > 0 ? (
                                  <div className="flex justify-between text-xs mt-0.5 text-gray-400">
                                    <span>Propina</span>
                                    <span>0.00 €</span>
                                  </div>
                                ) : null}
                              </>
                            )}
                            {paymentMethod === "voucher" && (
                              <div style={{ display: "grid", gap: 3 }}>
                                <input
                                  type="text"
                                  placeholder="Importe voucher"
                                  value={voucherAmount}
                                  onChange={(e) => setVoucherAmount(e.target.value)}
                                  className="w-full border rounded-md px-2 py-1 text-xs"
                                />
                                <input
                                  type="text"
                                  placeholder="Número de voucher"
                                  value={voucherNumber}
                                  onChange={(e) => setVoucherNumber(e.target.value)}
                                  className="w-full border rounded-md px-2 py-1 text-xs"
                                />
                                {voucherLookupBalance != null && (
                                  <div className="text-xs text-gray-600 leading-tight">
                                    Saldo disponible: {voucherLookupBalance.toFixed(2)} €
                                  </div>
                                )}
                                {voucherValueUi > 0 && (
                                  <>
                                    <div className="text-xs mt-0.5 text-gray-600">
                                      Usado: {voucherUsedUi.toFixed(2)} €
                                    </div>
                                    {voucherRemainingUi > 0 && (
                                      <div className="text-xs text-amber-600">
                                        Saldo restante: {voucherRemainingUi.toFixed(2)} €
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            <div className="sticky bottom-0 z-[2] mt-1 border-t border-slate-200/90 bg-white pt-1.5 pb-0.5">
                            <button
                              type="button"
                              disabled={
                                !isPaymentValid(payTotal) || selectedItemIds.length === 0
                              }
                              className="w-full py-2 rounded-md text-xs font-semibold shadow"
                              style={{
                                background:
                                  !isPaymentValid(payTotal) ||
                                  selectedItemIds.length === 0
                                    ? "rgba(148,163,184,0.55)"
                                    : "#2563eb",
                                color: "#fff",
                                cursor:
                                  !isPaymentValid(payTotal) ||
                                  selectedItemIds.length === 0
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              onClick={async () => {
                                if (!restaurantId) {
                                  window.alert("No se pudo registrar el cobro");
                                  return;
                                }
                                if (!paymentMethod) return;

                                const selectedTable = selectedTableId
                                  ? tablesList.find((t) => t.id === selectedTableId) ?? null
                                  : null;

                                const amountToPay = payTotal;
                                if (!isPaymentValid(amountToPay)) return;

                                const pm = paymentMethod;
                                const cashParsed = parseMoney(cashReceived);
                                const cardParsed = parseMoney(cardReceived);
                                const voucherValue = parseMoney(voucherAmount);
                                const voucherUsed = Math.min(voucherValue, amountToPay);
                                const voucherRemaining = Math.max(
                                  voucherValue - amountToPay,
                                  0,
                                );

                                const receivedVal =
                                  pm === "voucher"
                                    ? voucherValue
                                    : pm === "card"
                                      ? cardParsed || amountToPay
                                      : cashParsed;

                                const tipVal =
                                  pm === "card"
                                    ? Math.max((cardParsed || amountToPay) - amountToPay, 0)
                                    : 0;

                                const changeVal =
                                  pm === "cash" ? Math.max(cashParsed - amountToPay, 0) : 0;

                                if (paymentMethod === "card") {
                                  console.log("CARD PAYMENT", {
                                    total: amountToPay,
                                    receivedCard: receivedVal,
                                    tip: tipVal,
                                  });
                                }

                                try {
                                  const breakdown = calculateFinalTotal(selectedTotal);
                                  console.log("PAYMENT DEBUG", {
                                    baseTotal: selectedTotal,
                                    finalTotal: breakdown.finalTotal,
                                  });
                                  await addDoc(collection(db, "payments"), {
                                    restaurantId,
                                    tableId: selectedTableId || selectedTable?.id || null,
                                    tableName:
                                      selectedTable?.name ||
                                      (selectedTable as { label?: string } | null)?.label ||
                                      "",
                                    total: breakdown.finalTotal,
                                    originalTotal: selectedTotal,
                                    discountAmount: breakdown.discountAmountValue,
                                    discountPercent: breakdown.discountPercentValue,
                                    discountPercentAmount: breakdown.percentAmount,
                                    discountTotal: breakdown.discountTotal,
                                    finalTotal: breakdown.finalTotal,
                                    paymentMethod,
                                    orderSessionId: orderSessionId || null,
                                    waiterId,
                                    waiterEmail,
                                    tip: tipVal,
                                    received: receivedVal,
                                    voucherAmount: pm === "voucher" ? voucherValue : null,
                                    voucherUsed: pm === "voucher" ? voucherUsed : null,
                                    voucherRemaining: pm === "voucher" ? voucherRemaining : null,
                                    voucherNumber: pm === "voucher" ? voucherNumber.trim() : null,
                                    cashReceived: pm === "cash" ? cashParsed : null,
                                    change: changeVal,
                                    status: "paid",
                                    type: "split_by_items",
                                    itemIds: selectedItemIds,
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                  });
                                  if (pm === "voucher") {
                                    await upsertVoucherBalanceAfterPayment(
                                      db,
                                      restaurantId,
                                      voucherNumber,
                                      voucherValue,
                                      voucherRemaining,
                                    );
                                  }
                                } catch (error) {
                                  console.error("ERROR REGISTRANDO COBRO", error);
                                  window.alert("No se pudo registrar el cobro");
                                  return;
                                }

                                setPaidSplitItemIds((prev) => [
                                  ...prev,
                                  ...selectedItemIds.filter((id) => !prev.includes(id)),
                                ]);
                                setSelectedItemIds([]);
                                setCashReceived("");
                                setCardReceived("");
                                setVoucherAmount("");
                                setVoucherNumber("");
                                setPaymentMethod(null);
                                setIsSplitItemsPayMode(false);

                                const remainingAfter = pendingItems.filter(
                                  (i) => !selectedItemIds.includes(i.id),
                                );

                                if (remainingAfter.length === 0) {
                                  const tableIdToFinish = selectedTableId;
                                  if (tableIdToFinish) {
                                    try {
                                      const closeMs = Date.now();
                                      await handlePayTableOrder(tableIdToFinish, {
                                        db,
                                        restaurantId: restaurantId,
                                      });
                                      await updateDoc(doc(db, "tables", tableIdToFinish), {
                                        busy: false,
                                        status: "available",
                                        currentOrderId: null,
                                        activeOrderId: null,
                                        occupancyStartMs: null,
                                        occupiedAt: null,
                                        startedAt: null,
                                        openedAt: null,
                                        activeLineCount: 0,
                                        priorityScore: 0,
                                        total: 0,
                                        guestCount: 0,
                                        closedAt: closeMs,
                                        updatedAt: closeMs,
                                      });
                                      setGuestCount(0);
                                    } catch (error) {
                                      console.error("ERROR REGISTRANDO COBRO", error);
                                      window.alert("No se pudo registrar el cobro");
                                      return;
                                    }
                                  }

                                  finishPaymentAndReturnToMap(tableIdToFinish ?? null);
                                  window.alert("Cobro registrado");
                                  return;
                                }

                                window.alert("Pago parcial registrado");
                              }}
                            >
                              Confirmar cobro
                            </button>
                            </div>

                            <button
                              type="button"
                              className="w-full py-2 rounded-md text-xs font-semibold shadow"
                              style={{
                                background: "rgba(148,163,184,0.25)",
                                color: "#0f172a",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                setIsSplitItemsPayMode(false);
                                setCashReceived("");
                                setPaymentMethod(null);
                              }}
                            >
                              Volver
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 5 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
                        Dividir por productos
                      </div>

                      {(() => {
                        const pendingItems = order.filter(
                          (i) =>
                            !paidSplitItemIds.includes(i.id) &&
                            i.status !== "cancelled" &&
                            !i.isComped,
                        );
                        return (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gap: 6,
                                maxHeight: 240,
                                overflow: "auto",
                              }}
                            >
                              {order.map((it) => {
                                const isPaid = paidSplitItemIds.includes(it.id);
                                const isSelected = selectedItemIds.includes(it.id);
                                const isNotChargeable = it.status === "cancelled" || Boolean(it.isComped);
                                const lineTotal = comandaLineTotalWithExtras(it);
                                return (
                                  <button
                                    key={it.id}
                                    type="button"
                                    onClick={() => {
                                      if (isPaid || isNotChargeable) return;
                                      setSelectedItemIds((prev) =>
                                        prev.includes(it.id)
                                          ? prev.filter((x) => x !== it.id)
                                          : [...prev, it.id],
                                      );
                                    }}
                                    style={{
                                      textAlign: "left",
                                      width: "100%",
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(15,23,42,0.10)",
                                      background: isPaid
                                        ? "rgba(248,250,252,1)"
                                        : isSelected
                                          ? "rgba(59,130,246,0.10)"
                                          : "#fff",
                                      color: "#0f172a",
                                      opacity: isPaid || isNotChargeable ? 0.5 : 1,
                                      cursor: isPaid || isNotChargeable ? "default" : "pointer",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                      }}
                                    >
                                      <div style={{ fontWeight: 900 }}>
                                        {comandaLineDisplayName(it)}
                                        <span style={{ fontWeight: 800, color: "#334155" }}>
                                          {" "}
                                          × {it.quantity}
                                        </span>
                                        {isPaid && (
                                          <div
                                            style={{
                                              fontSize: 12,
                                              color: "#16a34a",
                                              fontWeight: 700,
                                              marginTop: 4,
                                            }}
                                          >
                                            Pagado
                                          </div>
                                        )}
                                        {!isPaid && it.isComped && (
                                          <div
                                            style={{
                                              fontSize: 12,
                                              color: "#92400e",
                                              fontWeight: 800,
                                              marginTop: 4,
                                            }}
                                          >
                                            INVITADO
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ fontWeight: 900 }}>
                                        {(Number.isFinite(lineTotal) ? lineTotal : 0).toFixed(2)} €
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
                              {(() => {
                                const selectedItems = pendingItems.filter((i) =>
                                  selectedItemIds.includes(i.id),
                                );
                                const selectedTotal = selectedItems.reduce(
                                  (acc, i) => acc + comandaLineTotalWithExtras(i),
                                  0,
                                );
                                return `Total seleccionado: ${(Number.isFinite(selectedTotal) ? selectedTotal : 0).toFixed(2)} €`;
                              })()}
                            </div>

                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 py-1.5 rounded-md text-xs font-medium"
                                onClick={() => {
                                  setIsSplitItemsMode(false);
                                  setIsSplitItemsPayMode(false);
                                  setSelectedItemIds([]);
                                  setPaidSplitItemIds([]);
                                }}
                              >
                                Volver
                              </button>
                              {selectedItemIds.length > 0 && (
                                <button
                                  type="button"
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md text-xs font-semibold shadow"
                                  onClick={() => {
                                    setCashReceived("");
                                    setVoucherAmount("");
                                    setVoucherNumber("");
                                    setPaymentMethod(null);
                                    setIsSplitItemsPayMode(true);
                                  }}
                                >
                                  Continuar
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )
                ) : isSplitEqualMode ? (
                  <div style={{ display: "grid", gap: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
                      Dividir entre {splitCount} personas
                    </div>

                    <label style={{ display: "grid", gap: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}>
                        Personas
                      </div>
                      <input
                        type="number"
                        min={2}
                        value={splitCount}
                        onChange={(e) => setSplitCount(Number(e.target.value) || 2)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(15,23,42,0.14)",
                          background: "#fff",
                          color: "#0f172a",
                          fontWeight: 900,
                          fontSize: 14,
                          outline: "none",
                        }}
                      />
                    </label>

                    <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                      {(() => {
                        const safeCount = Math.max(2, Math.floor(Number(splitCount) || 2));
                        const splitAmount = total / safeCount;
                        return `Cada persona paga: ${(Number.isFinite(splitAmount) ? splitAmount : 0).toFixed(2)} €`;
                      })()}
                    </div>

                    <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                      Pago {currentSplitIndex} de {Math.max(2, Math.floor(Number(splitCount) || 2))}
                    </div>

                    {(() => {
                      const safeCount = Math.max(2, Math.floor(Number(splitCount) || 2));
                      const splitAmount = total / safeCount;
                      const payDisc = calculateFinalTotal(splitAmount);
                      const payTotal = payDisc.finalTotal;
                      const voucherValueUi = parseMoney(voucherAmount);
                      const voucherUsedUi = Math.min(voucherValueUi, payTotal);
                      const voucherRemainingUi = Math.max(voucherValueUi - payTotal, 0);
                      const received = Number(cashReceived.replace(",", "."));
                      const change = Math.max(received - payTotal, 0);
                      const receivedCardRaw = Number(cardReceived.replace(",", ".") || 0);
                      const tipRaw =
                        receivedCardRaw > payTotal ? receivedCardRaw - payTotal : 0;
                      const receivedCard =
                        cardReceived.trim() === ""
                          ? payTotal
                          : Number(cardReceived.replace(",", ".") || 0);

                      return (
                        <div style={{ display: "grid", gap: 5 }}>
                          <div className="text-xs space-y-0 text-gray-700 leading-snug">
                            <div>Subtotal: {payDisc.baseTotal.toFixed(2)} €</div>
                            {payDisc.invPart > 0 ? (
                              <div>Invitación: -{payDisc.invPart.toFixed(2)} €</div>
                            ) : null}
                            {payDisc.discountPercentValue > 0 && payDisc.pctPart > 0 ? (
                              <div>
                                Descuento {payDisc.discountPercentValue}%: -{payDisc.pctPart.toFixed(2)} €
                              </div>
                            ) : null}
                            <div className="font-semibold text-gray-900 text-xs">
                              Total a pagar: {payDisc.finalTotal.toFixed(2)} €
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                                paymentMethod === "cash"
                                  ? "bg-blue-600 text-white shadow"
                                  : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                              }`}
                              onClick={() => {
                                setPaymentMethod("cash");
                                setCashReceived(
                                  (Number.isFinite(payTotal) ? payTotal : 0).toFixed(2),
                                );
                              }}
                            >
                              Efectivo
                            </button>
                            <button
                              type="button"
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                                paymentMethod === "card"
                                  ? "bg-blue-600 text-white shadow"
                                  : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                              }`}
                              onClick={() => setPaymentMethod("card")}
                            >
                              Tarjeta
                            </button>
                            <button
                              type="button"
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                                paymentMethod === "voucher"
                                  ? "bg-blue-600 text-white shadow"
                                  : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                              }`}
                              onClick={() => setPaymentMethod("voucher")}
                            >
                              Voucher
                            </button>
                          </div>

                          {paymentMethod === "cash" && (
                            <div style={{ display: "grid", gap: 3 }}>
                              <label style={{ display: "grid", gap: 3 }}>
                                <div
                                  style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}
                                >
                                  Importe recibido
                                </div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={cashReceived}
                                  onChange={(e) => setCashReceived(e.target.value)}
                                  placeholder="0"
                                  style={{
                                    width: "100%",
                                    padding: "7px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(15,23,42,0.14)",
                                    background: "#fff",
                                    color: "#0f172a",
                                    fontWeight: 900,
                                    fontSize: 15,
                                    outline: "none",
                                  }}
                                />
                              </label>

                              {Number.isFinite(received) && received >= payTotal && (
                                <div
                                  className="leading-tight"
                                  style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}
                                >
                                  Cambio: {change.toFixed(2)} €
                                </div>
                              )}
                            </div>
                          )}
                          {paymentMethod === "card" && (
                            <>
                              <input
                                type="text"
                                placeholder="Importe cobrado"
                                value={cardReceived}
                                onChange={(e) => setCardReceived(e.target.value)}
                                className="w-full border rounded-md px-2 py-1 text-xs"
                              />
                              {tipRaw > 0 ? (
                                <div className="flex justify-between text-xs mt-0.5 text-green-600">
                                  <span>Propina</span>
                                  <span>{tipRaw.toFixed(2)} €</span>
                                </div>
                              ) : receivedCardRaw > 0 ? (
                                <div className="flex justify-between text-xs mt-0.5 text-gray-400">
                                  <span>Propina</span>
                                  <span>0.00 €</span>
                                </div>
                              ) : null}
                            </>
                          )}
                          {paymentMethod === "voucher" && (
                            <div style={{ display: "grid", gap: 3 }}>
                              <input
                                type="text"
                                placeholder="Importe voucher"
                                value={voucherAmount}
                                onChange={(e) => setVoucherAmount(e.target.value)}
                                className="w-full border rounded-md px-2 py-1 text-xs"
                              />
                              <input
                                type="text"
                                placeholder="Número de voucher"
                                value={voucherNumber}
                                onChange={(e) => setVoucherNumber(e.target.value)}
                                className="w-full border rounded-md px-2 py-1 text-xs"
                              />
                              {voucherLookupBalance != null && (
                                <div className="text-xs text-gray-600 leading-tight">
                                  Saldo disponible: {voucherLookupBalance.toFixed(2)} €
                                </div>
                              )}
                              {voucherValueUi > 0 && (
                                <>
                                  <div className="text-xs mt-0.5 text-gray-600">
                                    Usado: {voucherUsedUi.toFixed(2)} €
                                  </div>
                                  {voucherRemainingUi > 0 && (
                                    <div className="text-xs text-amber-600">
                                      Saldo restante: {voucherRemainingUi.toFixed(2)} €
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                            <div className="sticky bottom-0 z-[2] mt-1 border-t border-slate-200/90 bg-white pt-1.5 pb-0.5">
                            <button
                            type="button"
                            disabled={!isPaymentValid(payTotal)}
                            className="w-full py-2 rounded-md text-xs font-semibold shadow"
                            style={{
                              background: !isPaymentValid(payTotal)
                                ? "rgba(148,163,184,0.55)"
                                  : "#2563eb",
                              color: "#fff",
                              cursor: !isPaymentValid(payTotal) ? "not-allowed" : "pointer",
                            }}
                            onClick={async () => {
                              if (paymentMethod === "card") {
                                const receivedCardFinal =
                                  cardReceived.trim() === ""
                                    ? payTotal
                                    : Number(cardReceived.replace(",", ".") || 0);
                                const tipFinal =
                                  receivedCardFinal > payTotal
                                    ? receivedCardFinal - payTotal
                                    : 0;
                                console.log("CARD PAYMENT", {
                                  total: payTotal,
                                  receivedCard: receivedCardFinal,
                                  tip: tipFinal,
                                });
                              }
                              const nextIndex = currentSplitIndex + 1;
                              const isLast = currentSplitIndex >= safeCount;
                              await handleConfirmPayment({
                                overrideTotal: splitAmount,
                                part: currentSplitIndex,
                                totalParts: safeCount,
                                keepModalOpen: !isLast,
                                skipCloseTable: !isLast,
                                minimalPaymentDoc: true,
                              });
                              if (!isLast) {
                                setCurrentSplitIndex(nextIndex);
                              }
                            }}
                          >
                            Confirmar cobro
                          </button>
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      className="w-full py-2 rounded-md text-xs font-semibold shadow"
                      style={{
                        background: "rgba(148,163,184,0.25)",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                      onClick={() => setIsSplitEqualMode(false)}
                    >
                      Volver
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 5 }}>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 py-1.5 rounded-md text-xs font-medium"
                        onClick={() => {
                          setSplitCount(2);
                          setCurrentSplitIndex(1);
                          setPaymentMethod(null);
                          setCashReceived("");
                          setCardReceived("");
                          setVoucherAmount("");
                          setVoucherNumber("");
                          setIsSplitEqualMode(true);
                        }}
                      >
                        Dividir por igual
                      </button>
                      <button
                        type="button"
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 py-1.5 rounded-md text-xs font-medium"
                        onClick={() => {
                          setSelectedItemIds([]);
                          setIsSplitItemsMode(true);
                        }}
                      >
                        Dividir por productos
                      </button>
                    </div>

                    <button
                      type="button"
                      className="w-full py-2 rounded-md text-xs font-semibold shadow"
                      style={{
                        background: "rgba(148,163,184,0.25)",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setIsSplitMode(false);
                        setIsSplitEqualMode(false);
                        setIsSplitItemsMode(false);
                        setSelectedItemIds([]);
                        setSplitCount(2);
                        setCurrentSplitIndex(1);
                        setPaymentMethod(null);
                        setCashReceived("");
                        setCardReceived("");
                        setVoucherAmount("");
                        setVoucherNumber("");
                      }}
                    >
                      Volver
                    </button>
                  </div>
                )
              ) : (
                <>
                  {(() => {
                    const payDisc = calculateFinalTotal(total);
                    const payTotal = payDisc.finalTotal;
                    const received = Number(cashReceived.replace(",", "."));
                    const change = Math.max(received - payTotal, 0);
                    const hasPartialPayments = paidSplitItemIds.length > 0;
                    const receivedCardRaw = Number(cardReceived.replace(",", ".") || 0);
                    const tipRaw = receivedCardRaw > payTotal ? receivedCardRaw - payTotal : 0;
                    const voucherValueUi = parseMoney(voucherAmount);
                    const voucherUsedUi = Math.min(voucherValueUi, payTotal);
                    const voucherRemainingUi = Math.max(voucherValueUi - payTotal, 0);
                    const receivedCard =
                      cardReceived.trim() === ""
                        ? payTotal
                        : Number(cardReceived.replace(",", ".") || 0);

                    return (
                      <div style={{ display: "grid", gap: 5 }}>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                              paymentMethod === "cash"
                                ? "bg-blue-600 text-white shadow"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                            }`}
                            onClick={() => {
                              setPaymentMethod("cash");
                              setCashReceived((Number.isFinite(payTotal) ? payTotal : 0).toFixed(2));
                            }}
                          >
                            Efectivo
                          </button>
                          <button
                            type="button"
                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                              paymentMethod === "card"
                                ? "bg-blue-600 text-white shadow"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                            }`}
                            onClick={() => {
                              setPaymentMethod("card");
                              setCardReceivedTouched(false);
                              setCardReceived(
                                (Number.isFinite(payTotal) ? payTotal : 0).toFixed(2),
                              );
                            }}
                          >
                            Tarjeta
                          </button>
                          <button
                            type="button"
                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                              paymentMethod === "voucher"
                                ? "bg-blue-600 text-white shadow"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                            }`}
                            onClick={() => setPaymentMethod("voucher")}
                          >
                            Voucher
                          </button>
                        </div>

                        {paymentMethod === "cash" && (
                          <div style={{ display: "grid", gap: 3 }}>
                            <label style={{ display: "grid", gap: 2 }}>
                              <div
                                style={{ fontSize: 11, fontWeight: 800, color: "#0f172a" }}
                              >
                                Importe recibido
                              </div>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cashReceived}
                                onChange={(e) => setCashReceived(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm px-2 py-1 border rounded-md text-center leading-tight"
                                style={{ borderColor: "rgba(15,23,42,0.14)", outline: "none" }}
                              />
                            </label>

                            {Number.isFinite(received) && received >= payTotal && (
                              <div
                                className="leading-tight"
                                style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}
                              >
                                Cambio: {change.toFixed(2)} €
                              </div>
                            )}
                          </div>
                        )}
                        {paymentMethod === "card" && (
                          <>
                            <input
                              type="text"
                              placeholder="Importe cobrado"
                              value={cardReceived}
                              onChange={(e) => {
                                setCardReceivedTouched(true);
                                setCardReceived(e.target.value);
                              }}
                              className="w-full border rounded-md px-2 py-1 text-xs"
                            />
                            {tipRaw > 0 ? (
                              <div className="flex justify-between text-xs mt-0.5 text-green-600">
                                <span>Propina</span>
                                <span>{tipRaw.toFixed(2)} €</span>
                              </div>
                            ) : receivedCardRaw > 0 ? (
                              <div className="flex justify-between text-xs mt-0.5 text-gray-400">
                                <span>Propina</span>
                                <span>0.00 €</span>
                              </div>
                            ) : null}
                          </>
                        )}
                        {paymentMethod === "voucher" && (
                          <div style={{ display: "grid", gap: 3 }}>
                            <input
                              type="text"
                              placeholder="Importe voucher"
                              value={voucherAmount}
                              onChange={(e) => setVoucherAmount(e.target.value)}
                              className="w-full border rounded-md px-2 py-1 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Número de voucher"
                              value={voucherNumber}
                              onChange={(e) => setVoucherNumber(e.target.value)}
                              className="w-full border rounded-md px-2 py-1 text-xs"
                            />
                            {voucherLookupBalance != null && (
                              <div className="text-xs text-gray-600 leading-tight">
                                Saldo disponible: {voucherLookupBalance.toFixed(2)} €
                              </div>
                            )}
                            {voucherValueUi > 0 && (
                              <>
                                <div className="text-xs mt-0.5 text-gray-600">
                                  Usado: {voucherUsedUi.toFixed(2)} €
                                </div>
                                {voucherRemainingUi > 0 && (
                                  <div className="text-xs text-amber-600">
                                    Saldo restante: {voucherRemainingUi.toFixed(2)} €
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        <div className="border-t border-gray-200/70 my-0.5" />
                        <div className="flex items-center justify-between gap-2 min-h-0">
                          <span className="text-xs text-gray-700">Factura</span>
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-blue-600 shrink-0"
                            checked={isInvoice}
                            onChange={(e) => setIsInvoice(e.target.checked)}
                          />
                        </div>

                        {isInvoice && (
                          <div className="mt-0.5 space-y-0.5">
                            <input
                              placeholder="Nombre / Empresa"
                              className="input-base !py-1 !text-xs"
                              value={invoiceName}
                              onChange={(e) => setInvoiceName(e.target.value)}
                            />
                            <input
                              placeholder="NIF / CIF"
                              className="input-base !py-1 !text-xs"
                              value={invoiceTaxId}
                              onChange={(e) => setInvoiceTaxId(e.target.value)}
                            />
                            <input
                              placeholder="Email"
                              className="input-base !py-1 !text-xs"
                              value={invoiceEmail}
                              onChange={(e) => setInvoiceEmail(e.target.value)}
                            />
                          </div>
                        )}

                        <div className="border-t border-gray-200/70 my-0.5" />
                        <button
                          type="button"
                          className="w-full py-1.5 rounded-md text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-900"
                          onClick={() => {
                            setIsSplitMode(true);
                            setIsSplitEqualMode(false);
                            setSplitCount(2);
                            setCurrentSplitIndex(1);
                          }}
                        >
                          Dividir cuenta
                        </button>

                        {paymentMethod !== null && (
                          <div className="sticky bottom-0 z-[2] mt-1 border-t border-slate-200/90 bg-white pt-1.5 pb-0.5">
                          <button
                            type="button"
                            disabled={!isPaymentValid(payTotal) || hasPartialPayments}
                            className={`w-full py-2 rounded-md text-xs font-semibold shadow ${
                              hasPartialPayments ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                            style={{
                              background: !isPaymentValid(payTotal) || hasPartialPayments
                                ? "rgba(148,163,184,0.55)"
                                : "#2563eb",
                              color: "#fff",
                              cursor:
                                !isPaymentValid(payTotal) || hasPartialPayments
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            onClick={() => {
                              if (hasPartialPayments) return;
                              if (paymentMethod === "card") {
                                const receivedCardFinal =
                                  cardReceived.trim() === ""
                                    ? payTotal
                                    : Number(cardReceived.replace(",", ".") || 0);
                                const tipFinal =
                                  receivedCardFinal > payTotal ? receivedCardFinal - payTotal : 0;
                                console.log("CARD PAYMENT", {
                                  total: payTotal,
                                  receivedCard: receivedCardFinal,
                                  tip: tipFinal,
                                });
                              }
                              void handleConfirmPayment();
                            }}
                          >
                            Confirmar cobro
                          </button>
                          </div>
                        )}
                        {hasPartialPayments && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              marginTop: -4,
                            }}
                          >
                            Hay pagos parciales realizados. Usa dividir cuenta.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}

                  </>
                )}
              </div>

              {!isSimplePaymentMode && (
                <div className="shrink-0 border-t border-gray-100 bg-white px-2.5 sm:px-3 pt-1.5 pb-2">
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs"
                    onClick={() => {
                      setIsPaymentOpen(false);
                      setPaymentMethod(null);
                      setIsInvoice(false);
                      setInvoiceName("");
                      setInvoiceTaxId("");
                      setInvoiceEmail("");
                      setCashReceived("");
                      setCardReceived("");
                      setVoucherAmount("");
                      setVoucherNumber("");
                      setDiscountAmount("");
                      setDiscountPercent("");
                      setIsSplitMode(false);
                      setIsSplitEqualMode(false);
                      setIsSplitItemsMode(false);
                      setIsSplitItemsPayMode(false);
                      setSelectedItemIds([]);
                      setPaidSplitItemIds([]);
                      setPartialPayments([]);
                      setSplitCount(2);
                      setCurrentSplitIndex(1);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {isFinalTicketOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white text-gray-900 rounded-lg p-4 w-[320px] shadow-2xl font-mono text-sm">
              <div>
                <div className="text-center font-bold text-base">TICKET</div>
                <div className="text-center text-xs text-gray-500 mb-3">
                  Ticket: {lastPaymentInfo?.ticketNumber ?? "—"}
                  {lastPaymentInfo?.invoiceNumber
                    ? ` · Factura: ${lastPaymentInfo.invoiceNumber}`
                    : ""}
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {lastOrderSnapshot.map((item) => {
                    const isGifted = Boolean(item.isComped);
                    const unit = comandaLineUnitPriceWithExtras(item);
                    const qty = Number(item.quantity) || 0;
                    const lineTotal = isGifted ? 0 : unit * qty;
                    return (
                      <div key={item.id} className="line" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>
                            {item.quantity} x {comandaLineDisplayName(item)}
                          </span>
                          <span>{(Number.isFinite(lineTotal) ? lineTotal : 0).toFixed(2)}€</span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            fontSize: 12,
                            color: "#6b7280",
                          }}
                        >
                          <span>{isGifted ? "(INVITADO)" : ""}</span>
                          <span>Precio unitario: {(Number.isFinite(unit) ? unit : 0).toFixed(2)}€</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-dashed my-2" />
                {lastTicketBreakdown && lastTicketBreakdown.discountTotal > 0 ? (
                  <div className="space-y-1 mt-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{lastTicketBreakdown.originalTotal.toFixed(2)}€</span>
                    </div>
                    {lastTicketBreakdown.invPart > 0 ? (
                      <div className="flex justify-between">
                        <span>Invitación</span>
                        <span>-{lastTicketBreakdown.invPart.toFixed(2)}€</span>
                      </div>
                    ) : null}
                    {lastTicketBreakdown.percentValue > 0 && lastTicketBreakdown.pctPart > 0 ? (
                      <div className="flex justify-between">
                        <span>Descuento {lastTicketBreakdown.percentValue}%</span>
                        <span>-{lastTicketBreakdown.pctPart.toFixed(2)}€</span>
                      </div>
                    ) : null}
                    <div className="total flex justify-between font-bold text-base mt-2">
                      <span>TOTAL</span>
                      <span>{lastTicketBreakdown.finalTotal.toFixed(2)}€</span>
                    </div>
                  </div>
                ) : (
                  <div className="total flex justify-between font-bold text-base mt-2">
                    <span>TOTAL</span>
                    <span>
                      {(lastTicketBreakdown
                        ? lastTicketBreakdown.finalTotal
                        : sumCartOrderLinesTotal(lastOrderSnapshot)
                      ).toFixed(2)}
                      €
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-medium"
                  onClick={handlePrintPreTicket}
                >
                  Imprimir
                </button>

                <button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium"
                  onClick={() => {
                    setLastTicketBreakdown(null);
                    setIsFinalTicketOpen(false);
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        {lastPaymentInfo && (
          <div className="fixed right-4 bottom-4 z-[60] bg-white text-gray-900 rounded-xl p-4 shadow-2xl border border-gray-200 max-w-sm w-[calc(100%-2rem)]">
            <div className="text-sm font-semibold">Cobro registrado</div>
            <div className="text-sm mt-1">Ticket: {lastPaymentInfo.ticketNumber}</div>
            {lastPaymentInfo.invoiceNumber && (
              <div className="text-sm">Factura: {lastPaymentInfo.invoiceNumber}</div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg text-sm"
                onClick={() => console.log("IMPRIMIR TICKET", lastPaymentInfo)}
              >
                Imprimir ticket
              </button>

              {lastPaymentInfo?.invoiceNumber && (
                <button
                  className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg text-sm"
                  onClick={() => console.log("ENVIAR FACTURA", lastPaymentInfo)}
                >
                  Enviar factura
                </button>
              )}
            </div>
          </div>
        )}
        {viewMode === "normal" && (
          <main
            className="carta-main carta-productos"
            style={{
              padding: 18,
              boxSizing: "border-box",
              borderRadius: 18,
              background: "rgba(2, 6, 23, 0.55)",
              border: "1px solid rgba(148, 163, 184, 0.14)",
              boxShadow: "0 18px 50px rgba(2,6,23,0.35)",
              minHeight: 0,
            }}
          >
            <div className="carta-main-fixed">
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                products.length > 0 && (
                  <>
                    <div
                      role="tablist"
                      aria-label={t("cartaTpv.menuGroupAria")}
                      style={{
                        display: "flex",
                        width: "100%",
                        maxWidth: 320,
                        marginBottom: 10,
                        padding: 3,
                        boxSizing: "border-box",
                        borderRadius: 11,
                        background: "rgba(2, 6, 23, 0.42)",
                        border: "1px solid rgba(148, 163, 184, 0.16)",
                        gap: 4,
                      }}
                    >
                      {(["bebida", "comida"] as const).map((g) => {
                        const active = menuGroup === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setMenuGroup(g)}
                            style={{
                              flex: 1,
                              minHeight: 30,
                              padding: "5px 10px",
                              borderRadius: 9,
                              border: active
                                ? "1px solid rgba(56, 189, 248, 0.45)"
                                : "1px solid transparent",
                              background: active
                                ? "rgba(56, 189, 248, 0.16)"
                                : "transparent",
                              color: active ? "#e0f2fe" : "#94a3b8",
                              fontSize: 12,
                              fontWeight: 800,
                              letterSpacing: "0.02em",
                              cursor: "pointer",
                              boxSizing: "border-box",
                              lineHeight: 1.1,
                            }}
                          >
                            {g === "bebida"
                              ? t("cartaTpv.menuGroupBebida")
                              : t("cartaTpv.menuGroupComida")}
                          </button>
                        );
                      })}
                    </div>
                  <div
                    className="carta-cats-wrap"
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {categoryTabNames.map((name) => {
                      const isSelected = effectiveSelectedCategory === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setSelectedCategory(name)}
                          className={isSelected ? "carta-cat-btn-active" : undefined}
                          style={{
                            minWidth: 84,
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: "1px solid rgba(148,163,184,0.28)",
                            background: isSelected
                              ? "rgba(56,189,248,0.18)"
                              : "rgba(2,6,23,0.15)",
                            color: isSelected ? "#bae6fd" : "#cbd5e1",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            boxSizing: "border-box",
                            lineHeight: 1.1,
                            minHeight: 34,
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  </>
                )}

              {displayMesas.length > 0 ? null : null}
            </div>

            <div className="carta-products-scroll">
              {effectiveSelectedCategory ? (
                <div className="carta-current-cat-title">{effectiveSelectedCategory}</div>
              ) : null}
              {(showAuthSpinner || showProductsSpinner) && <p>Cargando...</p>}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                isFirebaseConfigured &&
                !restaurantId && (
                  <p>No se pudo obtener el restaurante del usuario.</p>
                )}
              {!showAuthSpinner && !showProductsSpinner && !isFirebaseConfigured && (
                <p>{t("cartaTpv.missingFirebase")}</p>
              )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                isFirebaseConfigured &&
                error && <p>Error cargando productos</p>}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                products.length === 0 && (
                  <div
                    style={{
                      fontSize: 14,
                      opacity: 0.7,
                      padding: 16,
                      textAlign: "center",
                      margin: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    No hay productos activos
                  </div>
                )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                products.length > 0 && (
                  <div>
                    {Object.keys(groupedProducts)
                      .sort((a, b) => a.localeCompare(b, "es"))
                      .map((catName) => {
                        const items = groupedProducts[catName];
                        if (!items?.length) return null;

                        return (
                          <div key={catName} style={{ marginBottom: 24 }}>
                            {effectiveSelectedCategory == null ? (
                              <h3
                                style={{
                                  margin: "0 0 10px",
                                  color: "#cbd5e1",
                                  fontSize: 14,
                                  fontWeight: 900,
                                  letterSpacing: "0.06em",
                                  textTransform: "uppercase",
                                  opacity: 0.9,
                                }}
                              >
                                {catName}
                              </h3>
                            ) : null}

                            <div
                              className="carta-product-grid"
                              onPointerUp={() => {
                                dragAddActiveRef.current = false;
                                dragVisitedProductsRef.current.clear();
                              }}
                              onPointerCancel={() => {
                                dragAddActiveRef.current = false;
                                dragVisitedProductsRef.current.clear();
                              }}
                            >
                              {items.map((product) => {
                                const hasImg = Boolean(product.imageUrl?.trim());
                                const isAdding = Boolean(isAddingByProductId[product.id]);
                                const showPrecio = Number.isFinite(product.precio);
                                const isActive = activeProductId === product.id;
                                let qty = 0;
                                let pendingQty = 0;
                                let sentQty = 0;
                                let courseLatest: number | null = null;
                                let courseLatestAt = -1;
                                let hasSent = false;
                                for (const line of order) {
                                  if (line.product?.id !== product.id) continue;
                                  /* "Enviado" = ya salió del bucket pendiente
                                     y está en cocina/barra o ya servido.
                                     Cancelado NO cuenta como enviado. */
                                  if (
                                    line.status !== "pending" &&
                                    line.status !== "cancelled"
                                  ) {
                                    hasSent = true;
                                  }
                                  if (line.status === "cancelled") continue;
                                  const q = Number(line.quantity) || 0;
                                  qty += q;
                                  if (line.status === "pending") {
                                    pendingQty += q;
                                  } else {
                                    sentQty += q;
                                  }
                                  const at =
                                    Number(line.addedAt) ||
                                    Number(line.createdAt) ||
                                    0;
                                  if (at >= courseLatestAt) {
                                    courseLatestAt = at;
                                    courseLatest =
                                      normalizeComandaCourseForStorage(
                                        line.course,
                                      ) ?? null;
                                  }
                                }
                                const course = courseLatest;
                                const isMixedQty = pendingQty > 0 && sentQty > 0;
                                return (
                                  <button
                                    key={product.id}
                                    className={`carta-product-card transition transform duration-100${
                                      isAdding ? " carta-product-card--adding" : ""
                                    }${isActive ? " scale-95 bg-gray-200" : ""}${
                                      holdingProductId === product.id ? " holding" : ""
                                    }${
                                      repeatingProductId === product.id ? " repeating" : ""
                                    }${hasSent ? " has-sent" : ""}${
                                      dragAddingProductId === product.id ? " drag-adding" : ""
                                    }`}
                                    type="button"
                                    onClick={() => {
                                      const suppressUntil =
                                        suppressClickUntilByProductIdRef.current[product.id] ?? 0;
                                      if (suppressUntil > Date.now()) return;
                                      const now = Date.now();
                                      const last =
                                        lastClickAtByProductIdRef.current[product.id] ?? 0;
                                      if (now - last < 120) return;
                                      lastClickAtByProductIdRef.current[product.id] = now;
                                      setActiveProductId(product.id);
                                      if (activeProductTimeoutRef.current != null) {
                                        window.clearTimeout(activeProductTimeoutRef.current);
                                      }
                                      handleQuickAdd(product, { course: activeCourse });
                                      activeProductTimeoutRef.current = window.setTimeout(() => {
                                        setActiveProductId(null);
                                      }, 120);
                                    }}
                                    onPointerDown={(e) => {
                                      if (e.pointerType === "mouse" && e.button !== 0) return;
                                      dragAddActiveRef.current = true;
                                      dragVisitedProductsRef.current.clear();
                                      dragVisitedProductsRef.current.add(product.id);
                                      suppressClickUntilByProductIdRef.current[product.id] =
                                        Date.now() + 400;
                                      handleQuickAdd(product, { course: activeCourse });
                                      setDragAddingProductId(product.id);
                                      window.setTimeout(() => setDragAddingProductId(null), 180);
                                      removeIsHoldingRef.current = false;
                                      clearRepeatAndHoldGesture();
                                      // 200 ms: empieza modo HOLD-TO-REPEAT-ADD.
                                      // Reutiliza handleQuickAdd (sin tocarlo).
                                      removeHoldClassTimeoutRef.current = window.setTimeout(
                                        () => {
                                          stopHoldAdd();
                                          setRepeatingProductId(product.id);
                                          if (removeRepeatAddIntervalRef.current != null) {
                                            window.clearInterval(
                                              removeRepeatAddIntervalRef.current,
                                            );
                                          }
                                          removeRepeatAddIntervalRef.current = window.setInterval(
                                            () => {
                                              suppressClickUntilByProductIdRef.current[product.id] =
                                                Date.now() + 300;
                                              handleQuickAdd(product, { course: activeCourse });
                                            },
                                            120,
                                          );
                                        },
                                        200,
                                      );
                                      // 400 ms: REMOVE tiene PRIORIDAD. Si encuentra
                                      // línea pendiente, quita 1 y CANCELA el repeat-add.
                                      removeHoldTimeoutRef.current = window.setTimeout(() => {
                                        const removed = handleQuickRemoveOne(product);
                                        if (removed) {
                                          removeIsHoldingRef.current = true;
                                          if (removeRepeatAddIntervalRef.current != null) {
                                            window.clearInterval(
                                              removeRepeatAddIntervalRef.current,
                                            );
                                            removeRepeatAddIntervalRef.current = null;
                                          }
                                          setRepeatingProductId(null);
                                          setHoldingProductId(product.id);
                                          suppressClickUntilByProductIdRef.current[product.id] =
                                            Date.now() + 600;
                                        }
                                      }, 400);
                                    }}
                                    onPointerEnter={(e) => {
                                      if (!dragAddActiveRef.current) return;
                                      if (e.pointerType === "mouse" && e.buttons === 0) return;
                                      if (dragVisitedProductsRef.current.has(product.id)) return;
                                      dragVisitedProductsRef.current.add(product.id);
                                      suppressClickUntilByProductIdRef.current[product.id] =
                                        Date.now() + 400;
                                      handleQuickAdd(product, { course: activeCourse });
                                      setDragAddingProductId(product.id);
                                      window.setTimeout(() => setDragAddingProductId(null), 180);
                                    }}
                                    onPointerUp={() => {
                                      dragAddActiveRef.current = false;
                                      dragVisitedProductsRef.current.clear();
                                      if (removeIsHoldingRef.current) {
                                        suppressClickUntilByProductIdRef.current[product.id] =
                                          Date.now() + 500;
                                      }
                                      clearRepeatAndHoldGesture();
                                      removeIsHoldingRef.current = false;
                                    }}
                                    onPointerLeave={() => {
                                      if (removeIsHoldingRef.current) {
                                        suppressClickUntilByProductIdRef.current[product.id] =
                                          Date.now() + 500;
                                      }
                                      clearRepeatAndHoldGesture();
                                      removeIsHoldingRef.current = false;
                                    }}
                                    onPointerCancel={() => {
                                      dragAddActiveRef.current = false;
                                      dragVisitedProductsRef.current.clear();
                                      if (removeIsHoldingRef.current) {
                                        suppressClickUntilByProductIdRef.current[product.id] =
                                          Date.now() + 500;
                                      }
                                      clearRepeatAndHoldGesture();
                                      removeIsHoldingRef.current = false;
                                    }}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      stopHoldAdd();
                                      holdActiveProductIdRef.current = product.id;
                                      holdDidRepeatRef.current = false;
                                      holdTimeoutRef.current = window.setTimeout(() => {
                                        if (holdActiveProductIdRef.current !== product.id) return;
                                        holdDidRepeatRef.current = true;
                                        handleQuickAdd(product, { course: activeCourse });
                                        holdIntervalRef.current = window.setInterval(() => {
                                          if (holdActiveProductIdRef.current !== product.id) return;
                                          handleQuickAdd(product, { course: activeCourse });
                                        }, 120);
                                      }, 300);
                                    }}
                                    onMouseUp={stopHoldAdd}
                                    onMouseLeave={stopHoldAdd}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        const suppressUntil =
                                          suppressClickUntilByProductIdRef.current[product.id] ?? 0;
                                        if (suppressUntil > Date.now()) return;
                                        const now = Date.now();
                                        const last =
                                          lastClickAtByProductIdRef.current[product.id] ?? 0;
                                        if (now - last < 120) return;
                                        lastClickAtByProductIdRef.current[product.id] = now;
                                        handleQuickAdd(product, { course: activeCourse });
                                      }
                                    }}
                                    style={{
                                      position: "relative",
                                    }}
                                  >
                                    {isAdding ? (
                                      <span
                                        key={`bump-${product.id}-${isAddingByProductId[product.id]}`}
                                        className="carta-add-bump"
                                        aria-hidden="true"
                                      >
                                        +1
                                      </span>
                                    ) : null}
                                    {qty > 0 ? (
                                      <div
                                        className={`carta-product-qty-badge${
                                          isMixedQty ? " mixed" : ""
                                        }`}
                                        aria-label={
                                          isMixedQty
                                            ? `Cantidad: ${pendingQty} pendientes y ${sentQty} enviadas`
                                            : `Cantidad en comanda: ${qty}`
                                        }
                                      >
                                        {isMixedQty
                                          ? `${pendingQty}+${sentQty}`
                                          : qty}
                                      </div>
                                    ) : null}
                                    {course ? (
                                      <div
                                        className="carta-product-course-badge"
                                        aria-label={
                                          course === 1
                                            ? "Pase: Entrante"
                                            : course === 2
                                              ? "Pase: Segundo"
                                              : course === 3
                                                ? "Pase: Postre"
                                                : `Pase ${course}`
                                        }
                                      >
                                        {course === 1
                                          ? "E"
                                          : course === 2
                                            ? "S"
                                            : course === 3
                                              ? "P"
                                              : ""}
                                      </div>
                                    ) : null}
                                    <div className="h-10 shrink-0 flex items-center justify-center w-full">
                                      {hasImg ? (
                                        <img
                                          src={product.imageUrl}
                                          alt=""
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            borderRadius: 12,
                                            display: "block",
                                            backgroundColor: "#e5e7eb",
                                          }}
                                        />
                                      ) : (
                                        <div
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            borderRadius: 12,
                                            backgroundColor: softBackgroundFromName(
                                              product.nombre,
                                            ),
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: 20,
                                              fontWeight: 800,
                                              color: "#333333",
                                              lineHeight: 1,
                                              userSelect: "none",
                                            }}
                                          >
                                            {(
                                              product.nombre.trim().charAt(0) || "?"
                                            ).toUpperCase()}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-h-0 flex items-center justify-center px-1 w-full">
                                      <div
                                        className="text-xs font-semibold leading-tight text-center line-clamp-2"
                                        title={product.nombre}
                                      >
                                        {product.nombre}
                                      </div>
                                    </div>
                                    <div className="h-5 shrink-0 text-sm font-bold text-center w-full">
                                      {showPrecio ? `${product.precio.toFixed(2)} €` : ""}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
            </div>
        </main>
      )}
          </div>
          )}
        </HostlyPageContainer>
      )}
      </div>
      {lineEditorTarget ? (
        <div
          className="carta-line-editor-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setComandaLineEditorId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              lineEditorReadOnly ? "Detalle de línea de comanda" : "Editar línea de comanda"
            }
            className="carta-line-editor-panel"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="carta-line-editor-title">
              {lineEditorTarget.product.nombre}
            </div>
            <div className="carta-line-editor-sub">
              {`Cantidad en línea: ${lineEditorTarget.quantity}`}
            </div>
            {!lineEditorReadOnly && lineEditorTarget.quantity > 1 ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(248,250,252,0.98)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#0f172a",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editSplitEnabled}
                    onChange={() => setEditSplitEnabled((v) => !v)}
                  />
                  Modificar unidades seleccionadas
                </label>

                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                    Unidades a modificar
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={lineEditorTarget.quantity}
                    value={editSplitQty}
                    disabled={!editSplitEnabled}
                    onChange={(e) => setEditSplitQty(Number(e.target.value))}
                    style={{
                      width: 110,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(15,23,42,0.14)",
                      background: editSplitEnabled ? "#fff" : "rgba(226,232,240,0.65)",
                      color: "#0f172a",
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                    máx {lineEditorTarget.quantity}
                  </div>
                </div>
              </div>
            ) : null}
            {lineEditorReadOnly ? (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                    Estado
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                    {lineEditorTarget.status === "pending"
                      ? "Pendiente"
                      : lineEditorTarget.status === "sent"
                        ? "Enviado"
                        : lineEditorTarget.status === "prepared"
                          ? "Preparado"
                          : "Servido"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                    Destino
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                    {isBarProduct(lineEditorTarget.product) ? "Barra" : "Cocina"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                    Pase
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                    {(() => {
                      const c = normalizeComandaCourseForStorage(lineEditorTarget.course);
                      return c ? getCourseLabel(c) : "SIN PASE";
                    })()}
                  </div>
                </div>

                {lineEditorTarget.extras && lineEditorTarget.extras.length > 0 ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                      Extras
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {lineEditorTarget.extras.map((ex) => (
                        <div
                          key={`${ex.name}-${ex.price}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          <span>{ex.name}</span>
                          <span style={{ color: "#64748b" }}>
                            {formatComandaLineEuroEs(Number(ex.price) || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {lineEditorTarget.lineNote ? (
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                      Nota
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                      {lineEditorTarget.lineNote}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="carta-line-editor-field">
                  <div className="carta-line-editor-label" id="carta-line-pase-label">
                    Pase
                  </div>
                  <div
                    role="group"
                    aria-labelledby="carta-line-pase-label"
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    {(
                      [
                        { v: 1 as const, label: "Entrante" },
                        { v: 2 as const, label: "Primero" },
                        { v: 3 as const, label: "Segundo" },
                        { v: 4 as const, label: "Postre" },
                        { v: 0 as const, label: "Sin pase" },
                      ] as const
                    ).map(({ v, label }) => {
                      const active = lineEditDraft.pase === v;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setLineEditDraft((d) => ({ ...d, pase: v }))
                          }
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: active
                              ? "1px solid #2563eb"
                              : "1px solid rgba(15,23,42,0.12)",
                            background: active
                              ? "rgba(37,99,235,0.12)"
                              : "rgba(255,255,255,0.95)",
                            color: "#0f172a",
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="carta-line-editor-field">
                  <label
                    className="carta-line-editor-label"
                    htmlFor="carta-line-note"
                  >
                    Notas
                  </label>
                  <textarea
                    id="carta-line-note"
                    className="carta-line-editor-textarea"
                    value={lineEditDraft.lineNote}
                    onChange={(e) =>
                      setLineEditDraft((d) => ({ ...d, lineNote: e.target.value }))
                    }
                    placeholder="Indicaciones para cocina o barra"
                  />
                </div>
                <div className="carta-line-editor-field">
                  <button
                    type="button"
                    className="carta-line-editor-btn carta-line-editor-btn--ghost"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() =>
                      setLineEditDraft((d) => ({
                        ...d,
                        extrasPickerOpen: !d.extrasPickerOpen,
                      }))
                    }
                  >
                    Extras
                  </button>
                  {lineEditDraft.extrasPickerOpen ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid rgba(15,23,42,0.1)",
                        background: "rgba(248,250,252,0.98)",
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {CARTA_PRESET_EXTRAS.length === 0 ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 600,
                          }}
                        >
                          Lista de extras no configurada aún.
                        </div>
                      ) : (
                        CARTA_PRESET_EXTRAS.map((ex) => {
                          const on = lineEditDraft.selectedPresetExtraNames.includes(
                            ex.name,
                          );
                          return (
                            <label
                              key={ex.name}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 4px",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setLineEditDraft((d) => {
                                    const has = d.selectedPresetExtraNames.includes(
                                      ex.name,
                                    );
                                    return {
                                      ...d,
                                      selectedPresetExtraNames: has
                                        ? d.selectedPresetExtraNames.filter(
                                            (n) => n !== ex.name,
                                          )
                                        : [...d.selectedPresetExtraNames, ex.name],
                                    };
                                  })
                                }
                              />
                              <span style={{ flex: 1 }}>{ex.name}</span>
                              <span style={{ color: "#64748b", fontSize: 12 }}>
                                {formatComandaLineEuroEs(Number(ex.price) || 0)}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            )}
            {lineEditorReadOnly ? null : (
              <div className="carta-line-editor-field">
                <button
                  type="button"
                  disabled
                  title="Próximamente"
                  className="carta-line-editor-btn carta-line-editor-btn--ghost"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: 0.55,
                    cursor: "not-allowed",
                  }}
                >
                  Quitar ingredientes
                </button>
              </div>
            )}
            <div className="carta-line-editor-actions">
              <button
                type="button"
                className="carta-line-editor-btn carta-line-editor-btn--ghost"
                onClick={() => {
                  setEditSplitEnabled(false);
                  setEditSplitQty(1);
                  setComandaLineEditorId(null);
                }}
              >
                Cerrar
              </button>
              {!lineEditorReadOnly ? (
                <button
                  type="button"
                  className="carta-line-editor-btn carta-line-editor-btn--primary"
                  onClick={saveComandaLineEdit}
                >
                  Guardar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {closingFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-black/80 text-white px-6 py-4 rounded-2xl text-center shadow-xl animate-fade-in">
            <div className="text-lg font-semibold">
              {closingFeedback.tableName} cerrada
            </div>
            <div className="text-sm text-gray-300 mt-1">Cobro registrado</div>
          </div>
        </div>
      )}
    </div>
  );
}
