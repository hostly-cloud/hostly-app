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
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
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
import {
  dbgAddDoc,
  dbgUpdateDoc,
  DbgWriteBatch,
} from "@/lib/firestore/instrumentedWrites";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";
import { MONEY_EPS, roundMoney } from "@/lib/payments/roundMoney";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos, PLATOS_CHANGED_EVENT, type PlatoCarta } from "@/lib/platos-local";
import {
  computeBillableTotalFromOrderDocLike,
  isOrderStatusActiveForTableOccupancy,
  orderDocHasActiveLinesForMapOccupancy,
  readOrderCreatedAtMs,
  readOrderUpdatedAtMs,
} from "@/lib/firestore/order-table-occupancy";
import {
  fetchOpenOrderForTable,
  fetchOpenOrdersForTable,
  sortOpenOrderDocsByCreatedAt,
} from "@/lib/firestore/open-orders-same-table";
import { persistOpenOrderForTable } from "@/lib/firestore/persist-open-order-for-table";
import { handlePayTableOrder } from "@/lib/firestore/pay-table-order";
import {
  filterTablesForTpvMap,
  getTables,
  isDecorativePlanElementType,
  sortTablesForTpvMap,
  TABLE_MAP_STATUS_OCCUPIED,
  type Table,
} from "@/lib/firestore/tables";
import {
  effectiveTableFloorPlanId,
  entityBelongsToFloorPlan,
  getFloorPlans,
  resolveFloorPlanCanvasSize,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import { getZones, type Zone } from "@/lib/firestore/zones";
import { getUsersByRestaurant } from "@/lib/firestore/users";
import {
  EditableFloorMap,
  getPlanElementBaseVisualStyle,
} from "@/components/map/EditableFloorMap";
import { PinchZoomMap } from "./_components/pinch-zoom-map";
import { ElementCard } from "@/components/map/element-map-card";
import {
  listenReservationsForDate,
  type Reservation,
} from "@/lib/firestore/reservations";
import { isBarItem } from "@/lib/kds/bar-classification";
import type { Product } from "@/types/product";

const AUTO_PRINT_TICKET_STORAGE_KEY = "hostly:autoPrintTicket";

function tpvDecorativeElementStyle(
  element: Table,
  x: number,
  y: number,
  width: number,
  height: number,
): CSSProperties {
  const baseVisual = getPlanElementBaseVisualStyle(element, "premium");
  const readonlyLayer =
    element.type === "bar"
      ? 8
      : element.type === "wall"
        ? 3
        : element.type === "door"
          ? 8
          : isDecorativePlanElementType(element.type)
            ? 5
            : 6;
  return {
    position: "absolute",
    left: x,
    top: y,
    width,
    height,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    pointerEvents: "none",
    zIndex: readonlyLayer,
    ...baseVisual,
  };
}

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

/** Errores de red / backend / modo offline del cliente Firestore (listener TPV). */
function isFirestoreTpvConnectivityFailure(err: unknown): boolean {
  if (err instanceof FirebaseError) {
    const c = err.code;
    if (c === "unavailable" || c === "deadline-exceeded") return true;
    if (c.endsWith("/unavailable")) return true;
  }
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message).toLowerCase()
      : "";
  return (
    msg.includes("client is offline") ||
    msg.includes("could not reach cloud firestore") ||
    msg.includes("could not reach firestore")
  );
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

/** Misma regla que `resolveAlertDot` en `components/map/element-map-card.tsx`. */
function mapAlertDotFromTileInputs(
  isCriticalTable: boolean,
  priorityLevel: number,
  readyToClose: boolean,
  reservationPressure: { type: "upcoming" | "late"; time?: string } | null | undefined,
): "critical" | "attention" | null {
  if (isCriticalTable || priorityLevel >= 3) return "critical";
  if (
    priorityLevel === 1 ||
    priorityLevel === 2 ||
    readyToClose ||
    reservationPressure?.type === "late"
  ) {
    return "attention";
  }
  return null;
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

function getProductDefaultCourse(product: Product): number {
  const explicitCourse = normalizeComandaCourseForStorage(
    (product as unknown as { course?: unknown }).course,
  );
  if (explicitCourse) return explicitCourse;

  const raw =
    `${product.nombre ?? ""} ${product.categoria ?? ""} ${(product as unknown as { categoryName?: unknown }).categoryName ?? ""} ${(product as unknown as { category?: unknown }).category ?? ""} ${(product as unknown as { familia?: unknown }).familia ?? ""} ${(product as unknown as { family?: unknown }).family ?? ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  if (
    raw.includes("postre") ||
    raw.includes("dessert") ||
    raw.includes("tarta") ||
    raw.includes("dulce")
  ) {
    return 4;
  }

  if (
    raw.includes("pescado") ||
    raw.includes("carne") ||
    raw.includes("hamburgues") ||
    raw.includes("principal") ||
    raw.includes("segundo")
  ) {
    return 3;
  }

  if (
    raw.includes("arroz") ||
    raw.includes("paella") ||
    raw.includes("primero")
  ) {
    return 2;
  }

  if (
    raw.includes("entrante") ||
    raw.includes("ensalada") ||
    raw.includes("extra")
  ) {
    return 1;
  }

  return 1;
}

function lineCourseToPaseDraft(line: CartOrderLine): 0 | 1 | 2 | 3 | 4 {
  const u = normalizeComandaCourseForStorage(line.course);
  if (u == null) return 0;
  return u as 0 | 1 | 2 | 3 | 4;
}

/** Etiqueta de pase en editor TPV (`course` numérico 1–4). */
function getCourseLabel(course: number): string {
  switch (course) {
    case 1:
      return "Entrante";
    case 2:
      return "Primero";
    case 3:
      return "Segundo";
    case 4:
      return "Postre";
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

/** Pase en tarjetas vista Cocina integrada (TPV). course 1–4 en datos. */
function getCocinaCardCourseLabel(course?: number): string {
  const c = normalizeComandaCourseForStorage(course);
  if (c === 1) return "Entrante";
  if (c === 2) return "Primero";
  if (c === 3) return "Segundo";
  if (c === 4) return "Postre";
  return "";
}

type CocinaCourseBucket = 0 | 1 | 2 | 3 | 4;

function cocinaCourseBucket(line: CartOrderLine): CocinaCourseBucket {
  const c = normalizeComandaCourseForStorage(line.course);
  if (c === 1) return 1;
  if (c === 2) return 2;
  if (c === 3) return 3;
  if (c === 4) return 4;
  return 0;
}

function cocinaCourseSortOrder(line: CartOrderLine): number {
  const b = cocinaCourseBucket(line);
  if (b === 1) return 1;
  if (b === 2) return 2;
  if (b === 3) return 3;
  if (b === 4) return 4;
  return 999;
}

function getCocinaSectionTitle(bucket: CocinaCourseBucket): string {
  if (bucket === 1) return "ENTRANTES";
  if (bucket === 2) return "PRIMEROS";
  if (bucket === 3) return "SEGUNDOS";
  if (bucket === 4) return "POSTRES";
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

/** Listas de texto desde campos opcionales sin migración. */
function normListFromUnknown(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x).trim())
      .filter((s) => s !== "");
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    return t
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  return [];
}

function normStringUnknown(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Sí" : null;
  return null;
}

/** Heurística: vino / bebida tipo vino (categoría + nombre + flags en doc). */
function isWineLikeProduct(product: Product): boolean {
  const raw = product as unknown as Record<string, unknown>;
  if (normStringUnknown(raw.wineType ?? raw.tipoVino ?? raw.tipo_vino))
    return true;
  const blob = `${product.categoria} ${product.nombre}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(vino|vinos|tinto|tintos|blanco|blancos|rosado|rosados|cava|cavas|champagne|champan|champagn|espumoso|espumosos|priorat|rioja|ribera|rueda|rias baixas|verdejo|tempranillo|garnacha|monastrell|albarino|bobal|vermouth|vermut)\b/.test(
    blob,
  );
}

type QuickProductDetails = {
  ingredients: string[];
  allergens: string[];
  isWineLike: boolean;
  wineType: string | null;
  grape: string | null;
  region: string | null;
  tastingNotes: string | null;
  pairing: string | null;
  recommendedProductIds: string[];
  recommendedLabelsFromDoc: string[];
};

/** Detalle para ficha rápida (solo lectura; sin cambiar modelo Firestore). */
function extractQuickProductDetails(product: Product): QuickProductDetails {
  const r = product as unknown as Record<string, unknown>;
  const ingredients = normListFromUnknown(
    r.ingredientes ?? r.ingredients ?? r.ingredientList,
  );
  const allergens = normListFromUnknown(
    r.alergenos ?? r.alergenes ?? r.allergens ?? r.allergenes,
  );

  const wineType = normStringUnknown(r.wineType ?? r.tipoVino ?? r.tipo_vino);
  const grape = normStringUnknown(r.grape ?? r.uva);
  const region = normStringUnknown(
    r.region ?? r.denominacion ?? r.denominación ?? r.zona,
  );
  const tastingNotes = normStringUnknown(
    r.tastingNotes ?? r.notas ?? r.notasCata ?? r.notas_cata,
  );
  const pairing = normStringUnknown(r.pairing ?? r.maridaje);

  let recommendedProductIds: string[] = [];
  const rawRecIds = r.recommendedProductIds;
  if (Array.isArray(rawRecIds)) {
    recommendedProductIds = rawRecIds
      .map((x) => String(x).trim())
      .filter(Boolean);
  } else if (typeof rawRecIds === "string" && rawRecIds.trim()) {
    recommendedProductIds = rawRecIds
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let recommendedLabelsFromDoc: string[] = [];
  const rawRec = r.recommendedProducts ?? r.platosRecomendados;
  if (Array.isArray(rawRec)) {
    recommendedLabelsFromDoc = rawRec
      .map((x) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const n = o.nombre ?? o.name ?? o.label;
          if (typeof n === "string" && n.trim()) return n.trim();
        }
        return String(x).trim();
      })
      .filter((s) => s !== "");
  } else if (typeof rawRec === "string" && rawRec.trim()) {
    recommendedLabelsFromDoc = normListFromUnknown(rawRec);
  }

  const isWineLike = isWineLikeProduct(product);

  return {
    ingredients,
    allergens,
    isWineLike,
    wineType,
    grape,
    region,
    tastingNotes,
    pairing,
    recommendedProductIds,
    recommendedLabelsFromDoc,
  };
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

/** Shape flexible para hidratar líneas desde `orders.items` (evita `never` con `items` opcional). */
type FirestoreHydrationItem = {
  id?: string;
  productId?: string;
  nombre?: string;
  name?: string;
  precio?: number;
  quantity?: number;
  qty?: number;
  categoria?: string;
  categoryName?: string;
  [key: string]: unknown;
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

/**
 * Identidad mínima para hidratar líneas desde `orders.items`.
 * Tras actualizar desde KDS, los ítems pueden traer `name`/`qty`/`status` pero no `productId`
 * (el tablero solo persiste el shape `BoardItem`). Sin esto, el TPV filtra todo y la comanda queda vacía.
 */
function firestoreOrderItemHydratable(
  it: FirestoreHydrationItem | null | undefined,
): it is FirestoreHydrationItem {
  if (!it || typeof it !== "object") return false;
  const qty = Math.max(0, Number(it.qty ?? it.quantity) || 0);
  if (qty <= 0) return false;
  const pid =
    typeof it.productId === "string" ? it.productId.trim() : "";
  const name = String(it.name ?? it.nombre ?? "").trim();
  return pid !== "" || name !== "";
}

function resolveHydratedCartProductId(
  it: FirestoreHydrationItem,
  idx: number,
): string {
  const raw = it.productId;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  const lineId =
    typeof it.id === "string" && it.id.trim() !== ""
      ? it.id.trim()
      : `row-${idx}`;
  return `__hydrated_line:${lineId}`;
}

function mapFirestoreOrderDocToCartLines(
  data: FirestoreOrderDocForCart,
  restaurantId: string,
): CartOrderLine[] | null {
  if (data.restaurantId !== restaurantId) return null;
  const rawItems: FirestoreHydrationItem[] = Array.isArray(data.items)
    ? (data.items as FirestoreHydrationItem[])
    : [];
  const mapped = rawItems
    .filter((it: FirestoreHydrationItem): it is FirestoreHydrationItem =>
      firestoreOrderItemHydratable(it),
    )
    .map((it: FirestoreHydrationItem, idx) => {
      const qty = Math.max(0, Number(it.qty ?? it.quantity) || 0);
      const productIdResolved = resolveHydratedCartProductId(it, idx);
      const name =
        String(it.name ?? it.nombre ?? "").trim() || "Producto";
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
            : `legacy-${productIdResolved}-${idx}`,
        quantity: qty,
        product: {
          id: productIdResolved,
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
  const courseFromCatalog = normalizeComandaCourseForStorage(
    (p as PlatoCarta & { course?: unknown }).course,
  );
  return {
    id: p.id,
    nombre: p.nombre?.trim() ? p.nombre.trim() : "Sin nombre",
    categoria: cat || "Sin categoría",
    categoryId: p.categoriaCartaId,
    precio,
    ...(courseFromCatalog != null ? { course: courseFromCatalog } : {}),
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

type SessionPaymentHistoryRow = {
  id: string;
  amount: number;
  method: string;
  createdAt: number | null;
};

function formatTpveurEs(amount: number): string {
  if (!Number.isFinite(amount)) return "0,00 €";
  return (
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " €"
  );
}

function paymentMethodLabelEs(method: string): string {
  const m = String(method ?? "")
    .trim()
    .toLowerCase();
  if (m === "cash") return "efectivo";
  if (m === "card") return "tarjeta";
  if (m === "voucher") return "voucher";
  return m || "—";
}

/** Teclado TPV europeo: solo `,` como decimal; máximo 2 decimales. */
function tpvAppendDigit(prev: string, digit: string): string {
  let p = String(prev ?? "").replace(/\./g, ",");
  if (digit === "00") {
    if (p === "" || p === "0") return "0";
    const lastComma = p.lastIndexOf(",");
    const frac = lastComma >= 0 ? p.slice(lastComma + 1) : "";
    if (lastComma >= 0 && frac.length >= 2) return p;
    return p + "00";
  }
  if (digit === ",") {
    if (p.includes(",")) return p;
    return p === "" ? "0," : `${p},`;
  }
  if (!/^[0-9]$/.test(digit)) return p;
  const lastComma = p.lastIndexOf(",");
  const frac = lastComma >= 0 ? p.slice(lastComma + 1) : "";
  if (lastComma >= 0 && frac.length >= 2) return p;
  if (p === "0" && lastComma < 0) return digit;
  return p + digit;
}

const EMPTY_TABLES_READY_TO_CLOSE: ReadonlySet<string> = new Set();

export type CartaPageContentProps = {
  /** Oculta la cabecera Hostly en `/dashboard/operacion` (tabs Operación arriba). Solo layout. */
  embeddedInOperacion?: boolean;
  /** Mesas marcadas listas para cerrar (UI desde Sala vía evento `tablesReadyToClose:update`). */
  tablesReadyToClose?: Set<string>;
  /**
   * Agrupación opcional solo en cliente (estado típico en `app/dashboard/carta/page.tsx`).
   * Al abrir desde el mapa se usa `resolveMainTableId`; `getGroupedBadgeText` dibuja badges.
   * `joinTables` / `separateTable`: unir/separar mesas en mapa (persistencia vía página Carta cuando apliquen).
   */
  groupedTablesMapHandlers?: {
    resolveMainTableId: (tableId: string) => string;
    isGroupedTable: (tableId: string) => boolean;
    /** Mesa unida a otra: no se pinta en mapa como ficha propia. */
    isJoinedSecondaryTable?: (tableId: string) => boolean;
    /** Mesa principal con al menos una secundaria en el grupo. */
    isGroupedPrimaryTable?: (tableId: string) => boolean;
    getGroupedBadgeText: (tableId: string) => string | null;
    joinTables?: (mainTableId: string, secondaryTableId: string) => void;
    separateTable?: (tableId: string) => void;
  };
};

export function CartaPageContent({
  embeddedInOperacion = false,
  tablesReadyToClose,
  groupedTablesMapHandlers,
}: CartaPageContentProps) {
  const router = useRouter();
  const { t } = useI18n();
  const salaReadyToCloseTableIds =
    tablesReadyToClose ?? EMPTY_TABLES_READY_TO_CLOSE;
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
  /** Evita mezclar líneas al cambiar de mesa y vacía solo cuando toca (mesa ocupada sin caché tras switch). */
  const prevSelectedTableForOrderSyncRef = useRef<string | null>(null);
  const openingTableRef = useRef<string | null>(null);
  const restaurantId = profileRestaurantId ?? null;

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
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (!authReady || !user?.uid || !rid || !isFirebaseConfigured) {
      setTodayReservations([]);
      return;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const ymd = `${yyyy}-${mm}-${dd}`;
    const unsub = listenReservationsForDate(rid, ymd, (list) => {
      setTodayReservations(
        list.filter((r) => r.status === "booked" || r.status === "seated"),
      );
    });
    return () => unsub();
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  const reservedByTableId = useMemo(() => {
    const by: Record<string, Reservation> = {};
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    function resolveReservationMapTileId(rawTableId: string): string {
      const tid = String(rawTableId ?? "").trim();
      if (!tid) return "";
      const main = groupedTablesMapHandlers?.resolveMainTableId?.(tid);
      const out = String(main ?? tid).trim();
      return out || tid;
    }

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
      const mapKey = resolveReservationMapTileId(tid);
      if (!mapKey) continue;
      (groups[mapKey] ||= []).push(r);
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
  }, [todayReservations, groupedTablesMapHandlers]);

  const reservationPressureByTableId = useMemo(() => {
    const by: Record<
      string,
      { type: "upcoming" | "late"; time: string; customerName?: string }
    > = {};
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    function resolveReservationMapTileId(rawTableId: string): string {
      const tid = String(rawTableId ?? "").trim();
      if (!tid) return "";
      const main = groupedTablesMapHandlers?.resolveMainTableId?.(tid);
      const out = String(main ?? tid).trim();
      return out || tid;
    }

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
      const mapKey = resolveReservationMapTileId(tid);
      if (!mapKey) continue;
      (groups[mapKey] ||= []).push(r);
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
  }, [todayReservations, groupedTablesMapHandlers]);

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
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [selectedTpvFloorPlanId, setSelectedTpvFloorPlanId] =
    useState<string | null>(null);
  const operationalFloorPlansForTpv = useMemo(
    () => floorPlans.filter((p) => p.active !== false),
    [floorPlans],
  );
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
  /* Timer legacy (grid); limpiado con `clearRepeatAndHoldGesture`. */
  const removeHoldTimeoutRef = useRef<number | null>(null);
  const [holdingProductId, setHoldingProductId] = useState<string | null>(null);
  const productInfoLongPressTimerRef = useRef<number | null>(null);
  const [quickProductInfo, setQuickProductInfo] = useState<Product | null>(null);
  /** Evita disparar `onClick` → add si el dedo se movió (scroll / arrastre). */
  const productPointerStartRef = useRef<{
    productId: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  /** Tras pointerUp `start` es null antes del click; esto conserva si hubo scroll en la tarjeta. */
  const productPointerMovedClickBlockRef = useRef<string | null>(null);
  /** Solo móvil: evita click sintético tras deslizar el dedo (scroll sobre la rejilla). */
  const touchMovedRef = useRef(false);
  const touchStartYRef = useRef(0);
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
  /** Filtro por chip del resumen (misma semántica que colores / punto en el mapa). */
  const [activeMapFilter, setActiveMapFilter] = useState<
    "all" | "free" | "occupied" | "reserved" | "attention" | "critical" | "delayed"
  >("all");
  /** Filtro de camarero en mapa: todas, las del usuario actual, o id de usuario. */
  const [waiterFilter, setWaiterFilter] = useState<"all" | "me" | string>("all");
  /** Menú compacto de cambio de plano (TPV mapa); solo UX, misma `setSelectedTpvFloorPlanId`. */
  const [tpvFloorPlanMenuOpen, setTpvFloorPlanMenuOpen] = useState(false);
  const tpvFloorPlanMenuRef = useRef<HTMLDivElement | null>(null);
  const tpvFloorPlanMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [tpvFloorPlanMenuRect, setTpvFloorPlanMenuRect] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

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

  useEffect(() => {
    if (!tpvFloorPlanMenuOpen || !cartaHeaderMobile) return;
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      const wrap = tpvFloorPlanMenuRef.current;
      const panel = tpvFloorPlanMenuPanelRef.current;
      if (wrap?.contains(t) || panel?.contains(t)) return;
      setTpvFloorPlanMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTpvFloorPlanMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [tpvFloorPlanMenuOpen, cartaHeaderMobile]);

  useEffect(() => {
    if (!tpvFloorPlanMenuOpen || !cartaHeaderMobile) return;
    const onScroll = () => setTpvFloorPlanMenuOpen(false);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [tpvFloorPlanMenuOpen, cartaHeaderMobile]);

  useLayoutEffect(() => {
    if (!tpvFloorPlanMenuOpen || !cartaHeaderMobile) {
      setTpvFloorPlanMenuRect(null);
      return;
    }
    const place = () => {
      const wrap = tpvFloorPlanMenuRef.current;
      if (!wrap) return;
      const trig = wrap.querySelector(
        ".carta-tpv-floor-plan-trigger",
      ) as HTMLElement | null;
      if (!trig) return;
      const br = trig.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 10;
      const targetW = Math.min(260, Math.max(200, br.width));
      let left = br.left;
      if (left + targetW > vw - pad) {
        left = Math.max(pad, vw - pad - targetW);
      }
      if (left < pad) left = pad;
      let top = br.bottom + 6;
      const estH = Math.min(288, vh * 0.46);
      if (top + estH > vh - pad) {
        top = Math.max(pad, br.top - estH - 6);
      }
      setTpvFloorPlanMenuRect({
        top,
        left,
        minWidth: targetW,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tpvFloorPlanMenuOpen, cartaHeaderMobile]);

  useEffect(() => {
    setTpvFloorPlanMenuOpen(false);
  }, [selectedTpvFloorPlanId]);

  useEffect(() => {
    if (!cartaHeaderMobile) setTpvFloorPlanMenuOpen(false);
  }, [cartaHeaderMobile]);

  const selectOperationalTpvFloorPlan = useCallback((planId: string) => {
    setSelectedTpvFloorPlanId(planId);
    setMapZoneFilter("__all__");
    setActiveMapFilter("all");
    setTpvFloorPlanMenuOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (productInfoLongPressTimerRef.current != null) {
        window.clearTimeout(productInfoLongPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!quickProductInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickProductInfo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickProductInfo]);
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
  /**
   * Señal estable para efectos que deben reaccionar solo si la MESA SELECCIONADA
   * entra/sale de ocupación en Firestore. Evita re-disparar en cada cambio en otras mesas.
   */
  const selectedTableIsFirestoreOccupied = useMemo(() => {
    if (!selectedTableId) return false;
    const t = selectedTableId.trim();
    return t ? firestoreOccupiedTableIds.has(t) : false;
  }, [selectedTableId, firestoreOccupiedTableIds]);
  const firestoreOccupiedTableIdsRef = useRef<Set<string>>(firestoreOccupiedTableIds);
  firestoreOccupiedTableIdsRef.current = firestoreOccupiedTableIds;
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
  /** Firestore orders listener: sin red / backend o cliente offline (datos posiblemente solo locales). */
  const [isOffline, setIsOffline] = useState(false);
  const [isComandaSending, setIsComandaSending] = useState(false);
  const [comandaSentFlash, setComandaSentFlash] = useState(false);
  const [sentFeedbackMessage, setSentFeedbackMessage] = useState<string | null>(null);
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
  const [tableClosedFeedback, setTableClosedFeedback] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrintTicket, setAutoPrintTicket] = useState(true);
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
  /** Ancla visual del menú de acciones de línea (popover contextual, no modal centrado). */
  const [comandaLineActionsAnchorRect, setComandaLineActionsAnchorRect] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const lineActionsPopoverRef = useRef<HTMLDivElement | null>(null);
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
  /** Suma de cobros `table_amount` (y legados sin tipo) ya registrados para esta mesa/sesión (excluye split por ítems y cuotas dividir igual). */
  const [sessionTableAmountPaidSum, setSessionTableAmountPaidSum] = useState(0);
  const [sessionPaymentHistory, setSessionPaymentHistory] = useState<
    SessionPaymentHistoryRow[]
  >([]);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const simplePaymentAmountInputRef = useRef<HTMLInputElement | null>(null);
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
  /** `orders/{id}` reutilizado por mesa para borrador sincronizado con Firestore. */
  const openDraftOrderIdByTableRef = useRef<Record<string, string>>({});
  /** En navegador los timers son `number`; evitar `NodeJS.Timeout` del merge de tipos. */
  const draftPersistDebounceByTableRef = useRef<
    Record<string, number | undefined>
  >({});
  const draftPersistChainByTableRef = useRef<Record<string, Promise<void>>>(
    {},
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
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(AUTO_PRINT_TICKET_STORAGE_KEY);
      if (raw === "false") setAutoPrintTicket(false);
      else if (raw === "true") setAutoPrintTicket(true);
    } catch {
      /* ignore */
    }
  }, []);

  const persistAutoPrintTicket = useCallback((next: boolean) => {
    setAutoPrintTicket(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        AUTO_PRINT_TICKET_STORAGE_KEY,
        next ? "true" : "false",
      );
    } catch {
      /* ignore */
    }
  }, []);

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
        await dbgUpdateDoc(
          doc(db, "payments", paymentId),
          {
          status: "cancelled",
          updatedAt: Date.now(),
        },
          {
            label: "carta:handleCancelPartialPayment",
            collection: "payments",
            restaurantId,
            tableId: selectedTableId,
            paymentId,
          },
        );
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

  const flushPersistDraftOrderForTable = useCallback(
    async (tableId: string, lines: CartOrderLine[]) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      const tid = tableId.trim();
      if (!tid) return;
      try {
        const tableLabel =
          tablesList.find((t) => t.id === tid)?.name?.trim() || tid;
        const items = orderLinesToFirestoreItems(lines) as Record<
          string,
          unknown
        >[];
        const grandTotal = items.reduce(
          (acc, it) => acc + (Number(it.total) || 0),
          0,
        );
        let knownId =
          openDraftOrderIdByTableRef.current[tid]?.trim() || null;
        if (!knownId) {
          const snapDoc = await fetchOpenOrderForTable(db, restaurantId, tid);
          if (snapDoc) knownId = snapDoc.id;
        }
        const orderId = await persistOpenOrderForTable(db, {
          restaurantId,
          tableId: tid,
          tableLabel,
          items,
          total: Number.isFinite(grandTotal) ? grandTotal : 0,
          existingOrderId: knownId,
        });
        openDraftOrderIdByTableRef.current[tid] = orderId;
      } catch (e) {
        console.error("[persistOpenOrderDraft]", {
          tableId,
          restaurantId,
          error: e,
        });
      }
    },
    [restaurantId, isFirebaseConfigured, tablesList],
  );

  const schedulePersistDraftOrderForTable = useCallback(
    (tableId: string, lines: CartOrderLine[]) => {
      const tid = tableId.trim();
      if (!tid) return;
      const prevTimer = draftPersistDebounceByTableRef.current[tid];
      if (prevTimer != null) window.clearTimeout(prevTimer);
      draftPersistDebounceByTableRef.current[tid] = window.setTimeout(() => {
        draftPersistDebounceByTableRef.current[tid] = undefined;
        const tail =
          draftPersistChainByTableRef.current[tid] ?? Promise.resolve();
        draftPersistChainByTableRef.current[tid] = tail.then(() =>
          flushPersistDraftOrderForTable(tid, lines),
        );
      }, 380) as number;
    },
    [flushPersistDraftOrderForTable],
  );

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
        if (restaurantId && selectedTableId && isFirebaseConfigured) {
          schedulePersistDraftOrderForTable(selectedTableId, nextOrder);
        }
        return { ...prev, [selectedTableId]: nextOrder };
      });
      // Mantener `order` sincronizado para el render actual sin cambiar el resto del archivo.
      setOrder((prev) => updater(prev));
    },
    [
      orderIdFromUrl,
      selectedTableId,
      restaurantId,
      isFirebaseConfigured,
      schedulePersistDraftOrderForTable,
    ],
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

    const account = calculateFinalTotal(total).finalTotal;
    const remaining = roundMoney(Math.max(account - sessionTableAmountPaidSum, 0));
    const next = remaining.toFixed(2).replace(".", ",");
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
    sessionTableAmountPaidSum,
  ]);

  const isPaymentValid = useCallback(
    (remainingDue: number) => {
      if (!paymentMethod) return false;
      const r = roundMoney(remainingDue);
      if (r <= 0) return false;

      if (paymentMethod === "cash") {
        const c = roundMoney(parseMoney(cashReceived));
        return c > 0 && c <= r + MONEY_EPS;
      }

      if (paymentMethod === "card") {
        const raw = cardReceived.trim();
        const c = raw === "" ? r : roundMoney(parseMoney(cardReceived));
        return c > 0 && c <= r + MONEY_EPS;
      }

      if (paymentMethod === "voucher") {
        const v = roundMoney(parseMoney(voucherAmount));
        return (
          v > 0 &&
          v <= r + MONEY_EPS &&
          voucherNumber.trim().length > 0
        );
      }

      return false;
    },
    [paymentMethod, cashReceived, cardReceived, voucherAmount, voucherNumber, parseMoney],
  );

  const finishPaymentAndReturnToMap = useCallback((clearedTableId: string | null) => {
    if (clearedTableId) {
      groupedTablesMapHandlers?.separateTable?.(clearedTableId);
    }
    const selectedTable =
      clearedTableId != null
        ? tablesList.find((t) => t.id === clearedTableId) ?? null
        : null;
    const tableName =
      selectedTable?.name ||
      (selectedTable as { label?: string } | null)?.label ||
      "Mesa";

    setIsPaymentOpen(false);
    setSessionTableAmountPaidSum(0);
    setSessionPaymentHistory([]);
    setSelectedTableId(null);
    setOrder([]);
    if (clearedTableId) {
      window.dispatchEvent(
        new CustomEvent("tablesReadyToClose:clear", {
          detail: clearedTableId,
        }),
      );
    }
    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    setVoucherAmount("");
    setVoucherNumber("");
    setDiscountAmount("");
    setDiscountPercent("");
    if (clearedTableId) {
      delete openDraftOrderIdByTableRef.current[clearedTableId];
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
    window.setTimeout(() => {
      if (restaurantId) {
        void getTables(restaurantId).then((list) => {
          setTablesList(list);
        });
      }
    }, 0);
    if (clearedTableId) {
      setTableClosedFeedback(true);
      window.setTimeout(() => setTableClosedFeedback(false), 1500);
    }
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
  }, [groupedTablesMapHandlers, restaurantId, tablesList]);

  const reloadSessionTableAmountPaidSum = useCallback(async () => {
    if (!restaurantId?.trim() || !selectedTableId?.trim()) {
      setSessionTableAmountPaidSum(0);
      setSessionPaymentHistory([]);
      return;
    }
    const rid = restaurantId.trim();
    const tid = selectedTableId.trim();
    const sid = orderSessionId?.trim() ?? "";
    const oid = openOrderIdsForTable[0]?.trim() ?? "";
    try {
      let snap;
      if (sid) {
        snap = await getDocs(
          query(
            collection(db, "payments"),
            where("restaurantId", "==", rid),
            where("tableId", "==", tid),
            where("orderSessionId", "==", sid),
          ),
        );
      } else if (oid) {
        snap = await getDocs(
          query(
            collection(db, "payments"),
            where("restaurantId", "==", rid),
            where("tableId", "==", tid),
            where("orderId", "==", oid),
          ),
        );
      } else {
        setSessionTableAmountPaidSum(0);
        setSessionPaymentHistory([]);
        return;
      }
      const rows: SessionPaymentHistoryRow[] = [];
      let sum = 0;
      const readCreatedMs = (v: unknown): number | null => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (
          v &&
          typeof (v as { toMillis?: () => number }).toMillis === "function"
        ) {
          try {
            const ms = (v as { toMillis: () => number }).toMillis();
            return Number.isFinite(ms) ? ms : null;
          } catch {
            return null;
          }
        }
        return null;
      };
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const st = String(data.status ?? "").trim().toLowerCase();
        if (st === "cancelled" || st === "canceled") continue;
        if (data.type === "split_by_items") continue;
        if (data.type === "split_equal") continue;
        if (
          typeof data.part === "number" &&
          Number.isFinite(data.part) &&
          typeof data.totalParts === "number" &&
          Number.isFinite(data.totalParts)
        ) {
          continue;
        }
        const amt = paymentSaleAmount(data);
        if (amt <= MONEY_EPS) continue;
        sum += amt;
        rows.push({
          id: d.id,
          amount: roundMoney(amt),
          method: String(data.paymentMethod ?? "—"),
          createdAt: readCreatedMs(data.createdAt),
        });
      }
      rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      setSessionPaymentHistory(rows);
      setSessionTableAmountPaidSum(roundMoney(sum));
    } catch (e) {
      console.error("[reloadSessionTableAmountPaidSum]", e);
    }
  }, [restaurantId, selectedTableId, orderSessionId, openOrderIdsForTable]);

  useEffect(() => {
    if (!isPaymentOpen || !isFirebaseConfigured || !restaurantId?.trim()) return;
    if (!selectedTableId?.trim()) return;
    void reloadSessionTableAmountPaidSum();
  }, [
    isPaymentOpen,
    isFirebaseConfigured,
    restaurantId,
    selectedTableId,
    orderSessionId,
    openOrderIdsForTable,
    reloadSessionTableAmountPaidSum,
  ]);

  useLayoutEffect(() => {
    if (!isPaymentOpen || !isSimplePaymentMode) return;
    if (paymentMethod != null) return;
    const { finalTotal } = calculateFinalTotal(total);
    const remainingDue = roundMoney(
      Math.max(finalTotal - sessionTableAmountPaidSum, 0),
    );
    const prefill = remainingDue.toFixed(2).replace(".", ",");
    setPaymentMethod("cash");
    setCashReceived(prefill);
    setCardReceivedTouched(false);
  }, [
    isPaymentOpen,
    isSimplePaymentMode,
    paymentMethod,
    total,
    sessionTableAmountPaidSum,
    calculateFinalTotal,
  ]);

  useEffect(() => {
    if (!isPaymentOpen || !isSimplePaymentMode) return;
    if (!paymentMethod) return;
    const id = window.setTimeout(() => {
      simplePaymentAmountInputRef.current?.focus();
      simplePaymentAmountInputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(id);
  }, [isPaymentOpen, isSimplePaymentMode, paymentMethod]);

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

    const safeOpts = opts ?? {};

    const pm = paymentMethod;
    const cashParsed = parseMoney(cashReceived);
    const cardParsed = parseMoney(cardReceived);
    const voucherValue = parseMoney(voucherAmount);

    const baseTotal =
      typeof safeOpts.overrideTotal === "number" && Number.isFinite(safeOpts.overrideTotal)
        ? safeOpts.overrideTotal
        : total;

    const isSplitEqualInstallment =
      safeOpts.minimalPaymentDoc === true &&
      typeof safeOpts.overrideTotal === "number" &&
      Number.isFinite(safeOpts.overrideTotal);

    let breakdown = calculateFinalTotal(baseTotal);
    let chargeAmount = roundMoney(breakdown.finalTotal);
    let remainingBeforePay = 0;
    let remainingAfterPay = 0;
    let isAccountFinalPayment = false;
    let accountFinalForMeta: number | null = null;

    if (isSplitEqualInstallment) {
      if (!isPaymentValid(chargeAmount)) return;
    } else {
      const fullDisc = calculateFinalTotal(total);
      accountFinalForMeta = roundMoney(fullDisc.finalTotal);
      remainingBeforePay = roundMoney(
        accountFinalForMeta - sessionTableAmountPaidSum,
      );
      if (remainingBeforePay <= MONEY_EPS) {
        window.alert("No queda importe pendiente.");
        return;
      }
      if (!isPaymentValid(remainingBeforePay)) return;

      if (pm === "cash") {
        chargeAmount = roundMoney(cashParsed);
      } else if (pm === "card") {
        chargeAmount =
          cardReceived.trim() === ""
            ? remainingBeforePay
            : roundMoney(cardParsed);
      } else {
        chargeAmount = roundMoney(Math.min(voucherValue, remainingBeforePay));
      }

      if (chargeAmount <= MONEY_EPS) {
        window.alert("El importe a cobrar debe ser mayor que 0.");
        return;
      }
      if (chargeAmount > remainingBeforePay + MONEY_EPS) {
        window.alert(
          `El importe (${chargeAmount.toFixed(2)} €) no puede ser mayor que el pendiente (${remainingBeforePay.toFixed(2)} €).`,
        );
        return;
      }

      remainingAfterPay = roundMoney(remainingBeforePay - chargeAmount);
      isAccountFinalPayment = remainingAfterPay <= MONEY_EPS;

      if (sessionTableAmountPaidSum <= MONEY_EPS && isAccountFinalPayment) {
        breakdown = fullDisc;
        chargeAmount = roundMoney(fullDisc.finalTotal);
      } else if (isAccountFinalPayment) {
        breakdown = fullDisc;
        chargeAmount = remainingBeforePay;
      } else {
        breakdown = {
          baseTotal: chargeAmount,
          discountAmountValue: 0,
          discountPercentValue: 0,
          percentAmount: 0,
          discountTotal: 0,
          finalTotal: chargeAmount,
          invPart: 0,
          pctPart: 0,
        };
        chargeAmount = roundMoney(chargeAmount);
      }
    }

    const voucherUsed =
      pm === "voucher" ? Math.min(voucherValue, chargeAmount) : 0;
    const voucherRemaining =
      pm === "voucher" ? Math.max(voucherValue - chargeAmount, 0) : 0;

    const receivedVal =
      pm === "voucher"
        ? voucherValue
        : pm === "card"
          ? cardParsed || chargeAmount
          : cashParsed;

    const tipVal =
      pm === "card"
        ? Math.max((cardParsed || chargeAmount) - chargeAmount, 0)
        : 0;

    const changeVal =
      pm === "cash" ? Math.max(cashParsed - chargeAmount, 0) : 0;

    const keepModalOpen = isSplitEqualInstallment
      ? Boolean(safeOpts.keepModalOpen)
      : safeOpts.keepModalOpen ?? !isAccountFinalPayment;

    const selectedTable = selectedTableId
      ? tablesList.find((t) => t.id === selectedTableId) ?? null
      : null;
    const primaryOrderId =
      (orderIdFromUrl?.trim() ? orderIdFromUrl.trim() : null) ??
      (openOrderIdsForTable[0]?.trim() ? openOrderIdsForTable[0]!.trim() : null);

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.getTime().toString().slice(-6);
    const ticketNumber = `T-${datePart}-${timePart}`;
    const invoiceNumber = `F-${datePart}-${timePart}`;

    try {
      const tableIdForFinish = selectedTableId;
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

      const minimalPayload = {
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
        orderId: primaryOrderId,
        waiterId,
        waiterEmail,
        tip: tipVal,
        received: receivedVal,
        voucherAmount: pm === "voucher" ? voucherValue : null,
        voucherUsed: pm === "voucher" ? voucherUsed : null,
        voucherRemaining: pm === "voucher" ? voucherRemaining : null,
        voucherNumber: pm === "voucher" ? voucherNumber.trim() : null,
        part: safeOpts.part ?? null,
        totalParts: safeOpts.totalParts ?? null,
        ticketNumber,
        createdAt: Date.now(),
        type: "split_equal",
        ...invoiceData,
      };

      const fullTableAmountPayload = {
        restaurantId,
        tableId: selectedTableId || selectedTable?.id || null,
        tableName:
          selectedTable?.name ||
          (selectedTable as { label?: string } | null)?.label ||
          "",
        total: chargeAmount,
        amount: chargeAmount,
        originalTotal: remainingBeforePay,
        discountAmount: breakdown.discountAmountValue,
        discountPercent: breakdown.discountPercentValue,
        discountPercentAmount: breakdown.percentAmount,
        discountTotal: breakdown.discountTotal,
        finalTotal: chargeAmount,
        paymentMethod,
        orderSessionId: orderSessionId || null,
        orderId: primaryOrderId,
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
        type: "table_amount",
        paymentKind: isAccountFinalPayment ? "final" : "partial",
        isPartial: !isAccountFinalPayment,
        remainingAfterPayment: roundMoney(
          isAccountFinalPayment ? 0 : remainingAfterPay,
        ),
        accountFinalTotal:
          accountFinalForMeta ?? roundMoney(breakdown.finalTotal),
        createdBy:
          (user as { uid?: string } | null | undefined)?.uid ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...invoiceData,
      };

      await dbgAddDoc(
        collection(db, "payments"),
        safeOpts.minimalPaymentDoc ? minimalPayload : fullTableAmountPayload,
        {
          label: "carta:handleConfirmPayment",
          collection: "payments",
          restaurantId,
          tableId: selectedTableId || selectedTable?.id || null,
          orderId: primaryOrderId,
        },
      );

      if (!isSplitEqualInstallment) {
        void reloadSessionTableAmountPaidSum();
      }

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
      if (autoPrintTicket && !keepModalOpen) {
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
      }

      const shouldCloseTable =
        Boolean(selectedTableId) &&
        !safeOpts.skipCloseTable &&
        (isSplitEqualInstallment || isAccountFinalPayment);

      if (shouldCloseTable) {
        const tid = selectedTableId!;
        const closeMs = Date.now();
        await handlePayTableOrder(tid, { db, restaurantId });
        await updateDoc(doc(db, "tables", tid), {
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

      if (!keepModalOpen) {
        finishPaymentAndReturnToMap(tableIdForFinish ?? null);
      }
    } catch (error) {
      console.error("ERROR REGISTRANDO COBRO", error);
      window.alert("No se pudo registrar el cobro");
      return;
    }

    if (keepModalOpen) {
      setCashReceived("");
      setCardReceived("");
      setCardReceivedTouched(false);
      setVoucherAmount("");
      setVoucherNumber("");
      setInvoiceName("");
      setInvoiceTaxId("");
      setInvoiceEmail("");
    }

    const alertMsg = isSplitEqualInstallment
      ? `Cobro registrado\nTicket: ${ticketNumber}${
          isInvoice ? `\nFactura: ${invoiceNumber}` : ""
        }`
      : keepModalOpen
        ? `Pago parcial registrado (${chargeAmount.toFixed(2)} €).\nPendiente: ${remainingAfterPay.toFixed(2)} €\nTicket: ${ticketNumber}${
            isInvoice ? `\nFactura: ${invoiceNumber}` : ""
          }`
        : `Cobro registrado\nTicket: ${ticketNumber}${
            isInvoice ? `\nFactura: ${invoiceNumber}` : ""
          }`;
    window.alert(alertMsg);
  }, [
    cardReceived,
    cashReceived,
    calculateFinalTotal,
    finishPaymentAndReturnToMap,
    isPaymentValid,
    openOrderIdsForTable,
    order,
    orderIdFromUrl,
    orderSessionId,
    parseMoney,
    playClickSound,
    invoiceEmail,
    invoiceName,
    invoiceTaxId,
    isInvoice,
    autoPrintTicket,
    lastPaymentInfo,
    paymentMethod,
    reloadSessionTableAmountPaidSum,
    restaurantId,
    selectedTableId,
    sessionTableAmountPaidSum,
    soundEnabled,
    tablesList,
    total,
    user,
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
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (
      !authReady ||
      !user?.uid ||
      !rid ||
      !isFirebaseConfigured
    ) {
      setTablesList([]);
      return;
    }
    let cancelled = false;
    void getTables(rid).then((list) => {
      if (cancelled) return;
      setTablesList(list);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (!authReady || !user?.uid || !rid || !isFirebaseConfigured) {
      setFloorPlans([]);
      setZonesList([]);
      setSelectedTpvFloorPlanId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [plans, zones] = await Promise.all([
          getFloorPlans(rid),
          getZones(rid),
        ]);
        if (cancelled) return;
        setFloorPlans(plans);
        setZonesList(zones);
        setSelectedTpvFloorPlanId((current) => {
          const op = plans.filter((p) => p.active !== false);
          const pool = op.length > 0 ? op : plans;
          if (current) {
            const cur = plans.find((p) => p.id === current);
            if (cur && cur.active !== false && pool.some((p) => p.id === current)) {
              return current;
            }
          }
          const def = pool.find((p) => p.isDefault === true);
          return def?.id ?? pool[0]?.id ?? null;
        });
      } catch {
        if (cancelled) return;
        setFloorPlans([]);
        setZonesList([]);
        setSelectedTpvFloorPlanId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

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
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (
      !authReady ||
      !user?.uid ||
      !isFirebaseConfigured ||
      !rid ||
      !isAuthReady()
    ) {
      setFirestoreOccupiedTableIds(new Set());
      setFirestoreOccupancyStartMsByTable({});
      setOrderTotalsByTable({});
      setLastActivityAtByTable({});
      setFirestorePaidTableIds(new Set());
      setFirestoreBillRequestedTableIds(new Set());
      setFirestoreOrderNoteByTable({});
      setIsOffline(false);
      return;
    }

    let cancelled = false;
    const ordersQuery = query(
      collection(db, "orders"),
      where("restaurantId", "==", rid),
    );

    const unsub = onSnapshot(
      ordersQuery,
      (snapshot) => {
        if (cancelled) return;
        if (!snapshot.metadata.fromCache) {
          setIsOffline(false);
        }

        const occupiedTableIds = new Set<string>();
      const oldestActiveCreatedAtMsByTableId: Record<string, number> = {};

      for (const d of snapshot.docs) {
        const data = d.data() as {
          tableId?: string | null;
          status?: string;
          createdAt?: unknown;
          openedAt?: unknown;
          items?: unknown;
          total?: unknown;
        };
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        occupiedTableIds.add(tid);
        const openedMs = readOrderCreatedAtMs(data.openedAt);
        const createdMs = readOrderCreatedAtMs(data.createdAt);
        const ms = openedMs ?? createdMs;
        if (ms == null) continue;
        const prev = oldestActiveCreatedAtMsByTableId[tid];
        if (prev == null || ms < prev) oldestActiveCreatedAtMsByTableId[tid] = ms;
      }

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
            status?: unknown;
          }>;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        const amount = computeBillableTotalFromOrderDocLike(data);
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
          items?: unknown;
          total?: unknown;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
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
          items?: unknown;
          total?: unknown;
        };
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
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
          items?: unknown;
          total?: unknown;
        };
        if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
        if (!orderDocHasActiveLinesForMapOccupancy(data)) continue;
        const tid =
          typeof data.tableId === "string" ? data.tableId.trim() : "";
        if (!tid) continue;
        const noteStr = typeof data.note === "string" ? data.note : "";
        if (!(tid in notesByTable)) notesByTable[tid] = noteStr;
      }
      setFirestoreOrderNoteByTable(notesByTable);
    },
    (error) => {
      if (cancelled) return;
      if (isFirestoreTpvConnectivityFailure(error)) {
        setIsOffline(true);
      }
      console.error(error);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (appliedOrderFromUrlRef.current) return;
    if (!orderIdFromUrl || !isFirebaseConfigured || !restaurantId) return;
    if (!isAuthReady()) return;
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
    if (!isAuthReady()) {
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
    }, (err) => {
      console.error(err);
    });
    return () => unsub();
  }, [orderIdFromUrl, isFirebaseConfigured, restaurantId]);

  const mergeTableIdForOpenOrders = useMemo(() => {
    if (orderIdFromUrl) return orderUrlTableId?.trim() || null;
    return selectedTableId?.trim() || null;
  }, [orderIdFromUrl, orderUrlTableId, selectedTableId]);

  const openOrdersSnapAuthReady = authReady;
  const openOrdersSnapUid = user?.uid ?? null;
  const openOrdersSnapRestaurantId = restaurantId ?? null;
  const openOrdersSnapFirebaseOk = isFirebaseConfigured;
  const openOrdersSnapTableId = mergeTableIdForOpenOrders ?? null;

  useEffect(() => {
    if (
      !openOrdersSnapAuthReady ||
      !openOrdersSnapUid ||
      !openOrdersSnapRestaurantId?.trim() ||
      !openOrdersSnapFirebaseOk ||
      !openOrdersSnapTableId ||
      !isAuthReady()
    ) {
      setOpenOrderIdsForTable([]);
      return;
    }
    const tid = openOrdersSnapTableId;
    const rid = openOrdersSnapRestaurantId.trim();
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", rid),
      where("tableId", "==", tid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const activeIds = snap.docs
        .filter((d) =>
          isOrderStatusActiveForTableOccupancy(
            (d.data() as { status?: string }).status,
          ),
        )
        .sort((a, b) => {
          const da = a.data() as { updatedAt?: unknown; createdAt?: unknown };
          const db_ = b.data() as { updatedAt?: unknown; createdAt?: unknown };
          const ua =
            readOrderUpdatedAtMs(da.updatedAt) ??
            readOrderCreatedAtMs(da.createdAt) ??
            0;
          const ub =
            readOrderUpdatedAtMs(db_.updatedAt) ??
            readOrderCreatedAtMs(db_.createdAt) ??
            0;
          return ub - ua;
        })
        .map((d) => d.id);
      setOpenOrderIdsForTable(activeIds);
    }, (err) => {
      console.error(err);
    });
    return () => unsub();
  }, [
    authReady,
    user?.uid ?? null,
    restaurantId ?? "",
    isFirebaseConfigured,
    mergeTableIdForOpenOrders ?? null,
  ]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!tableIdFromUrl?.trim()) return;
    const id = tableIdFromUrl.trim();
    setSelectedTableId(id);
    setTpvEntryMode(tpvViewFromUrl === "summary" ? "summary" : "tpv");
  }, [orderIdFromUrl, tableIdFromUrl, tpvViewFromUrl]);

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
      prevSelectedTableForOrderSyncRef.current = null;
      return;
    }
    const prevSel = prevSelectedTableForOrderSyncRef.current;
    const switched = prevSel !== null && prevSel !== selectedTableId;
    prevSelectedTableForOrderSyncRef.current = selectedTableId;

    const lines = ordersByTable[selectedTableId];
    if (lines !== undefined) {
      setOrder(lines);
      return;
    }
    if (switched) {
      setOrder([]);
    }
  }, [selectedTableId, ordersByTable, orderIdFromUrl]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!isFirebaseConfigured || !restaurantId || !selectedTableId) return;
    if (!isAuthReady()) return;
    const tid = selectedTableId.trim();
    if (!tid) return;
    if (Object.prototype.hasOwnProperty.call(ordersByTable, tid)) return;

    let cancelled = false;
    void (async () => {
      try {
        const snapDoc = await fetchOpenOrderForTable(db, restaurantId, tid);
        if (cancelled) return;
        if (!snapDoc) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrder([]);
            setOrdersByTable((prev) => {
              const next = { ...prev };
              delete next[tid];
              return next;
            });
          }
          return;
        }
        const data = snapDoc.data() as FirestoreOrderDocForCart;
        const mapped = mapFirestoreOrderDocToCartLines(data, restaurantId);
        if (!mapped || mapped.length === 0) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrder([]);
            setOrdersByTable((prev) => {
              const next = { ...prev };
              delete next[tid];
              return next;
            });
          }
          return;
        }
        openDraftOrderIdByTableRef.current[tid] = snapDoc.id;
        setOrdersByTable((prev) => {
          const curLocal = prev[tid];
          if (curLocal !== undefined && curLocal.length > 0) {
            return prev;
          }
          return { ...prev, [tid]: mapped };
        });
      } catch (e) {
        console.error("[hydrateOrder]", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orderIdFromUrl,
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    ordersByTable,
    selectedTableIsFirestoreOccupied,
  ]);

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

  const handleQuickAdd = (product: Product) => {
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

    const productCourse = getProductDefaultCourse(product);

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
          /* Solo merge si comparten pase (definido en catálogo en línea nueva).
             Sin course en línea existente → equivalente a pase 1. */
          (normalizeComandaCourseForStorage(i.course) ?? 1) === productCourse,
      );

      if (existingIndex !== -1) {
        const updated = [...prev];
        const cur = updated[existingIndex]!;
        const bumped: CartOrderLine = {
          ...cur,
          quantity: cur.quantity + 1,
        };
        updated[existingIndex] = bumped;
        return updated;
      }

      const pendingStatus: OrderLineStatus = "pending";
      const newLine: CartOrderLine = {
        id: generateOrderLineId(),
        product,
        quantity: 1,
        status: pendingStatus,
        addedAt: Date.now(),
        createdAt: Date.now(),
        course: productCourse,
      };

      const merged = [...prev, newLine];
      return merged;
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
          const payloadItems = orderLinesToFirestoreItems(next);
          await dbgUpdateDoc(
            doc(db, "orders", orderIdFromUrl),
            {
            items: payloadItems,
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleSendItem",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: orderIdFromUrl,
            },
          );
        } catch (e) {
          console.error("handleSendItem", e);
        }
      }
    },
    [
      orderIdFromUrl,
      isFirebaseConfigured,
      updateCurrentTableOrder,
      restaurantId,
      selectedTableId,
    ],
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
      const payloadItems = orderLinesToFirestoreItems(next);
      await dbgUpdateDoc(
        doc(db, "orders", orderIdFromUrl),
        {
        items: payloadItems,
        updatedAt: serverTimestamp(),
      },
        {
          label: "carta:handleSendAllItems",
          collection: "orders",
          restaurantId,
          tableId: selectedTableId,
          orderId: orderIdFromUrl,
        },
      );
    } catch (e) {
      console.error("handleSendAllItems", e);
    }
  }, [
    orderIdFromUrl,
    isFirebaseConfigured,
    updateCurrentTableOrder,
    restaurantId,
    selectedTableId,
  ]);

  const handleServeItem = useCallback(
    async (itemId: string) => {
      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          const st = normalizeOrderLineStatus(l.status);
          if (
            l.id === itemId &&
            (st === "sent" || st === "prepared")
          ) {
            return { ...l, status: "served" as const, servedAt: Date.now() };
          }
          return l;
        });
        return next;
      });
      const orderDocId =
        orderIdFromUrl && orderIdFromUrl.trim() !== ""
          ? orderIdFromUrl
          : openOrderIdsForTable.length > 0
            ? openOrderIdsForTable[0]!
            : null;
      if (orderDocId && isFirebaseConfigured) {
        try {
          await dbgUpdateDoc(
            doc(db, "orders", orderDocId),
            {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleServeItem",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: orderDocId,
            },
          );
        } catch (e) {
          console.error("handleServeItem", e);
        }
      }
    },
    [
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
    ],
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
        await dbgUpdateDoc(
          doc(db, "orders", orderIdFromUrl),
          {
          items: orderLinesToFirestoreItems(next),
          updatedAt: serverTimestamp(),
        },
          {
            label: "carta:handleCancelPersistedLine",
            collection: "orders",
            restaurantId,
            tableId: selectedTableId,
            orderId: orderIdFromUrl,
          },
        );
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
        await dbgUpdateDoc(
          doc(db, "orders", orderIdFromUrl),
          {
          items: orderLinesToFirestoreItems(next),
          updatedAt: serverTimestamp(),
        },
          {
            label: "carta:handleRemoveOnePersistedUnit",
            collection: "orders",
            restaurantId,
            tableId: selectedTableId,
            orderId: orderIdFromUrl,
          },
        );
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
            await dbgUpdateDoc(
              doc(db, "orderItems", orderItemDocId),
              {
              ...payloadBase,
              status: "cancelled",
              cancelledAt: Date.now(),
            },
              {
                label: "carta:handleRemoveOneUnitFromLine:orderItems",
                collection: "orderItems",
                restaurantId,
                tableId: selectedTableId,
                orderId: orderDocId ?? undefined,
              },
            );
          } else {
            const existingHasQtyField = Object.prototype.hasOwnProperty.call(lineAny, "qty");
            await dbgUpdateDoc(
              doc(db, "orderItems", orderItemDocId),
              {
              ...payloadBase,
              quantity: nextQty,
              ...(existingHasQtyField ? { qty: nextQty } : {}),
            } as Record<string, unknown>,
              {
                label: "carta:handleRemoveOneUnitFromLine:orderItems",
                collection: "orderItems",
                restaurantId,
                tableId: selectedTableId,
                orderId: orderDocId ?? undefined,
              },
            );
          }

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
          await dbgUpdateDoc(
            doc(db, "orders", orderDocId),
            {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleRemoveOneUnitFromLine:orders",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: orderDocId,
            },
          );
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
        await dbgUpdateDoc(
          doc(db, "orders", orderDocId),
          {
          items: orderLinesToFirestoreItems(next),
          updatedAt: Date.now(),
        },
          {
            label: "carta:handleCancelProductFromLine",
            collection: "orders",
            restaurantId,
            tableId: selectedTableId,
            orderId: orderDocId,
          },
        );
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

      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          if (l.id !== lineEditorTarget.id) return l;
          return {
            ...l,
            isComped: true,
            compedAt: nowMs,
            compedReason: "Invitación",
          };
        });
        return next;
      });

      try {
        // 1) orderItems/{id} (si existe)
        if (orderItemDocId) {
          await dbgUpdateDoc(
            doc(db, "orderItems", orderItemDocId),
            {
            isComped: true,
            compedAt: nowMs,
            compedReason: "Invitación",
            updatedAt: nowMs,
          },
            {
              label: "carta:handleCompProductFromLine:orderItems",
              collection: "orderItems",
              restaurantId,
              tableId: selectedTableId,
              orderId,
            },
          );
        }

        // 2) orders/{id}.items[] (si existe)
        if (orderId) {
          await dbgUpdateDoc(
            doc(db, "orders", orderId),
            {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleCompProductFromLine:orders",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId,
            },
          );
        }

      } catch (error) {
        console.error("COMP PRODUCT FIRESTORE ERROR", error);
      }

      setComandaLineActionsOpen(false);
      setComandaLineActionsTargetId(null);
      setComandaLineActionsAnchorRect(null);
    },
    [
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
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
          await dbgUpdateDoc(
            doc(db, "orders", orderIdFromUrl),
            {
            items: orderLinesToFirestoreItems(next),
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleRepeatItem",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: orderIdFromUrl,
            },
          );
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

  /** Limpia timers de long-press sobre tarjeta de producto (ficha info / repetir envío). */
  const clearRepeatAndHoldGesture = () => {
    if (removeHoldTimeoutRef.current != null) {
      window.clearTimeout(removeHoldTimeoutRef.current);
      removeHoldTimeoutRef.current = null;
    }
    setHoldingProductId(null);
  };

  const clearProductInfoLongPressTimer = () => {
    if (productInfoLongPressTimerRef.current != null) {
      window.clearTimeout(productInfoLongPressTimerRef.current);
      productInfoLongPressTimerRef.current = null;
    }
  };

  const handleRemoveLine = (lineId: string) => {
    updateCurrentTableOrder((prev) =>
      prev.filter((item) => !(item.id === lineId && item.status === "pending")),
    );
  };

  const handleGuardarComandaLocal = () => {
    if (!selectedTableId) return;
    setOrdersByTable((prev) => ({
      ...prev,
      [selectedTableId]: order,
    }));
  };

  const handleMarkOrderClosed = async () => {
    if (!orderIdFromUrl || !isFirebaseConfigured) return;
    const ref = doc(db, "orders", orderIdFromUrl);
    await dbgUpdateDoc(
      ref,
      {
      status: "closed",
      closedAt: serverTimestamp(),
    },
      {
        label: "carta:handleMarkOrderClosed",
        collection: "orders",
        restaurantId,
        tableId: selectedTableId,
        orderId: orderIdFromUrl,
      },
    );
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
  const hasVisibleProductsForCurrentMenu = useMemo(
    () => Object.values(groupedProducts).some((items) => items.length > 0),
    [groupedProducts],
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

  const planElementsForTpvMap = useMemo(() => {
    const activeElements = tablesList.filter(
      (element) => element.isActive !== false,
    );
    if (!selectedTpvFloorPlanId) return activeElements;
    return activeElements.filter((element) =>
      entityBelongsToFloorPlan(element, selectedTpvFloorPlanId, floorPlans),
    );
  }, [tablesList, selectedTpvFloorPlanId, floorPlans]);

  const zonesForTpvMap = useMemo(() => {
    if (!selectedTpvFloorPlanId) return zonesList;
    return zonesList.filter((zone) =>
      entityBelongsToFloorPlan(zone, selectedTpvFloorPlanId, floorPlans),
    );
  }, [zonesList, selectedTpvFloorPlanId, floorPlans]);

  /** TPV embebido: un plano = un espacio; no capa ni fitting por zonas legacy. */
  const zonesForOperationalMapRender = useMemo(
    () => (embeddedInOperacion ? [] : zonesForTpvMap),
    [embeddedInOperacion, zonesForTpvMap],
  );

  const selectedTpvFloorPlan = useMemo(() => {
    if (!selectedTpvFloorPlanId) return null;
    return floorPlans.find((plan) => plan.id === selectedTpvFloorPlanId) ?? null;
  }, [floorPlans, selectedTpvFloorPlanId]);

  const selectedTpvFloorPlanSize = useMemo(
    () => resolveFloorPlanCanvasSize(selectedTpvFloorPlan, floorPlans),
    [selectedTpvFloorPlan, floorPlans],
  );

  const tablesForTpvMap = useMemo(() => {
    const list = filterTablesForTpvMap(planElementsForTpvMap);
    return [...list].sort(sortTablesForTpvMap);
  }, [planElementsForTpvMap]);

  const mapZoneOptions = useMemo(() => {
    if (embeddedInOperacion) return [];
    const set = new Set<string>();
    for (const t of tablesForTpvMap) {
      set.add(t.zone ?? "restaurante");
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [embeddedInOperacion, tablesForTpvMap]);

  const tablesVisibleOnMap = useMemo(() => {
    if (embeddedInOperacion) return tablesForTpvMap;
    if (mapZoneFilter === "__all__") return tablesForTpvMap;
    return tablesForTpvMap.filter(
      (t) => (t.zone ?? "restaurante") === mapZoneFilter,
    );
  }, [embeddedInOperacion, tablesForTpvMap, mapZoneFilter]);

  const tablesFilteredByWaiter = useMemo(() => {
    const waiterScoped = embeddedInOperacion
      ? tablesVisibleOnMap
      : tablesVisibleOnMap.filter((table) => {
          if (waiterFilter === "all") return true;
          if (waiterFilter === "me") return table.waiterId === user?.uid;
          return table.waiterId === waiterFilter;
        });
    return waiterScoped.filter((table) => {
      const id = String(table.id ?? "").trim();
      if (!id) return true;
      return !groupedTablesMapHandlers?.isJoinedSecondaryTable?.(id);
    });
  }, [
    embeddedInOperacion,
    tablesVisibleOnMap,
    waiterFilter,
    user?.uid,
    groupedTablesMapHandlers,
  ]);

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

  /** Mesas con al menos una order activa en Firestore (regla `orderDocHasActiveLinesForMapOccupancy`). */
  const openOrdersByTable = useMemo(() => {
    const m: Record<string, true> = {};
    for (const id of firestoreOccupiedTableIds) {
      m[id] = true;
    }
    return m;
  }, [firestoreOccupiedTableIds]);

  /** Por mesa: instante de la comanda activa más antigua (ms), alineado con ocupación. */
  const orderOpenedAtByTable = firestoreOccupancyStartMsByTable;

  /** Resumen numérico de mesas visibles (respeta `tablesFilteredByWaiter`). Libres / ocupadas / reservadas
   *  alinean con colores del mapa: ocupada = comanda Firestore o líneas en memoria; reservada = libre de comanda y
   *  con reserva del día asignada a la mesa. */
  const mapQuickSummary = useMemo(() => {
    let total = 0;
    let free = 0;
    let reserved = 0;
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

      const mapOccupied =
        firestoreOccupiedTableIds.has(id) || (ordersByTable[id]?.length ?? 0) > 0;
      if (mapOccupied) {
        busy += 1;
      } else if (reservedByTableId[id]) {
        reserved += 1;
      } else {
        free += 1;
      }

      if (pl === 2) warning += 1;
      if (pl === 3) critical += 1;
    }
    return { total, free, reserved, busy, warning, critical };
  }, [
    tablesFilteredByWaiter,
    firestoreOccupiedTableIds,
    ordersByTable,
    reservedByTableId,
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

  /** Mesas mostradas en el plano según chip activo (encima de camarero/zona). */
  const mapTablesForChipFilter = useMemo(() => {
    if (activeMapFilter === "all") return mapTablesOrderedByVisualPriority;
    return mapTablesOrderedByVisualPriority.filter((t) => {
      const tableId = String(t.id ?? "").trim();
      if (!tableId) return false;

      const mapOccupied = isTableOccupiedOnMap(tableId);
      const hasReservation = Boolean(reservedByTableId[tableId]);

      if (activeMapFilter === "free") {
        return !mapOccupied && !hasReservation;
      }
      if (activeMapFilter === "occupied") {
        return mapOccupied;
      }
      if (activeMapFilter === "reserved") {
        return !mapOccupied && hasReservation;
      }

      const activeLineCount = ordersByTable[tableId]?.length ?? 0;
      const busy = mapOccupied;
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
      const openedAtMsRaw = orderOpenedAtByTable[tableId];
      const openedAtMs =
        typeof openedAtMsRaw === "number" && Number.isFinite(openedAtMsRaw)
          ? openedAtMsRaw
          : undefined;
      const ot = orderTotalsByTable[tableId];
      const orderTotal =
        typeof ot === "number" && Number.isFinite(ot) ? ot : undefined;
      const priorityLevel = computeMapVisualPriorityLevel(
        openedAtMs,
        now,
        orderTotal,
      );
      const readyToClose = salaReadyToCloseTableIds.has(tableId);
      const rp = reservationPressureByTableId[tableId];

      if (activeMapFilter === "delayed") {
        return rp?.type === "late";
      }

      const dot = mapAlertDotFromTileInputs(
        isCriticalTable,
        priorityLevel,
        readyToClose,
        rp ?? null,
      );

      if (activeMapFilter === "critical") {
        return dot === "critical";
      }
      if (activeMapFilter === "attention") {
        return dot === "attention";
      }
      return true;
    });
  }, [
    activeMapFilter,
    mapTablesOrderedByVisualPriority,
    isTableOccupiedOnMap,
    reservedByTableId,
    ordersByTable,
    firestoreOccupancyStartMsByTable,
    now,
    orderOpenedAtByTable,
    orderTotalsByTable,
    salaReadyToCloseTableIds,
    reservationPressureByTableId,
  ]);

  const decorativePlanElementsForTpv = useMemo(() => {
    return planElementsForTpvMap.filter((element) =>
      isDecorativePlanElementType(element.type),
    );
  }, [planElementsForTpvMap]);

  const mapElementsForTpvRender = useMemo(() => {
    const tableIds = new Set(
      mapTablesForChipFilter.map((table) => String(table.id ?? "").trim()),
    );
    const decorative = decorativePlanElementsForTpv.filter(
      (element) => !tableIds.has(String(element.id ?? "").trim()),
    );
    return [...decorative, ...mapTablesForChipFilter];
  }, [decorativePlanElementsForTpv, mapTablesForChipFilter]);

  const tpvMapAutoFitKey = useMemo(() => {
    const planKey = selectedTpvFloorPlanId ?? "legacy";
    return [
      planKey,
      selectedTpvFloorPlanSize.width,
      selectedTpvFloorPlanSize.height,
      mapElementsForTpvRender.length,
      planElementsForTpvMap.length,
      zonesForOperationalMapRender.length,
      mapElementsForTpvRender
        .map((element) =>
          [
            element.id,
            element.type,
            element.x,
            element.y,
            element.width,
            element.height,
          ].join(":"),
        )
        .join("|"),
      planElementsForTpvMap
        .map((element) =>
          [
            element.id,
            element.type,
            element.x,
            element.y,
            element.width,
            element.height,
          ].join(":"),
        )
        .join("|"),
      zonesForOperationalMapRender
        .map((zone) =>
          [zone.id, zone.x, zone.y, zone.width, zone.height].join(":"),
        )
        .join("|"),
    ].join("::");
  }, [
    selectedTpvFloorPlanId,
    selectedTpvFloorPlanSize,
    mapElementsForTpvRender,
    planElementsForTpvMap,
    zonesForOperationalMapRender,
  ]);

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

      if (openingTableRef.current === id) return;
      openingTableRef.current = id;

      setSelectedTableId(id);

      if (!orderIdFromUrl) {
        const cached = ordersByTable[id];
        if (cached !== undefined) {
          setOrder(cached);
        }
      } else {
        setOrdersByTable((prev) =>
          Object.prototype.hasOwnProperty.call(prev, id)
            ? prev
            : { ...prev, [id]: [] },
        );
      }

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
      window.setTimeout(() => {
        if (openingTableRef.current === id) {
          openingTableRef.current = null;
        }
      }, 300);
    },
    [
      embeddedInOperacion,
      orderIdFromUrl,
      ordersByTable,
      restaurantId,
      router,
    ],
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
      delete openDraftOrderIdByTableRef.current[selectedTableId];
      setOrder([]);
      setOrdersByTable((prev) => ({ ...prev, [selectedTableId]: [] }));
      setGuestCount(0);
      groupedTablesMapHandlers?.separateTable?.(selectedTableId);
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
    groupedTablesMapHandlers,
  ]);

  const updateActiveOrderPaymentRequest = useCallback(
    async (setRequested: boolean) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (orderIdFromUrl) {
        await dbgUpdateDoc(
          doc(db, "orders", orderIdFromUrl),
          {
          paymentRequestedAt: setRequested ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        },
          {
            label: "carta:updateActiveOrderPaymentRequest:byOrderId",
            collection: "orders",
            restaurantId,
            tableId: selectedTableId,
            orderId: orderIdFromUrl,
          },
        );
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
        await dbgUpdateDoc(
          d.ref,
          {
          paymentRequestedAt: setRequested ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        },
          {
            label: "carta:updateActiveOrderPaymentRequest:queryFirstActive",
            collection: "orders",
            restaurantId,
            tableId: selectedTableId,
            orderId: d.id,
          },
        );
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
          await dbgUpdateDoc(
            doc(db, "orders", orderIdFromUrl),
            {
            note: value,
            updatedAt: serverTimestamp(),
          },
            {
              label: "carta:handleSaveOrderNote:byOrderId",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: orderIdFromUrl,
            },
          );
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
            await dbgUpdateDoc(
              d.ref,
              {
              note: value,
              updatedAt: serverTimestamp(),
            },
              {
                label: "carta:handleSaveOrderNote:queryFirstActive",
                collection: "orders",
                restaurantId,
                tableId: selectedTableId,
                orderId: d.id,
              },
            );
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

      const batch = new DbgWriteBatch(db, {
        label: "carta:handleMergeOrders",
        collection: "orders",
        restaurantId,
        tableId,
        orderId: destDoc.id,
      });
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
      const mainTableId =
        groupedTablesMapHandlers?.resolveMainTableId(tid) ?? tid;

      const isSecondaryInClientGroup =
        Boolean(groupedTablesMapHandlers) &&
        mainTableId !== tid &&
        (groupedTablesMapHandlers?.isGroupedTable(tid) ?? false);

      if (salaReadyToCloseTableIds.has(tid)) {
        const fromLines = sumCartOrderLinesTotal(ordersByTable[tid] ?? []);
        const fromAggregate =
          typeof orderTotalsByTable[tid] === "number" &&
          Number.isFinite(orderTotalsByTable[tid])
            ? orderTotalsByTable[tid]
            : 0;
        const tablePendingTotal = Math.max(fromLines, fromAggregate);
        handleOpenTableOrder(mainTableId, { entry: "summary" });
        if (tablePendingTotal <= 0) {
          return;
        }
        window.setTimeout(() => {
          setIsPaymentOpen(true);
        }, 0);
        return;
      }

      const busy =
        firestoreOccupiedTableIds.has(tid) ||
        (isSecondaryInClientGroup &&
          firestoreOccupiedTableIds.has(mainTableId));
      if (!busy) {
        // Mesa libre en el mapa: siempre comanda nueva (no reutilizar estado local antiguo).
        delete openDraftOrderIdByTableRef.current[tid];
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

      handleOpenTableOrder(mainTableId);
    },
    [
      handleOpenTableOrder,
      salaReadyToCloseTableIds,
      setIsPaymentOpen,
      orderTotalsByTable,
      ordersByTable,
      firestoreOccupiedTableIds,
      setFirestoreOccupiedTableIds,
      setLastActivityAtByTable,
      setOrder,
      setOrderTotalsByTable,
      setFirestoreOccupancyStartMsByTable,
      setOrdersByTable,
      groupedTablesMapHandlers,
    ],
  );

  const handleMapTableJoinDrop = useCallback(
    (draggedTableId: string, targetTableId: string) => {
      const join = groupedTablesMapHandlers?.joinTables;
      if (!join) return;
      const d = String(draggedTableId).trim();
      const t = String(targetTableId).trim();
      if (!d || !t || d === t) return;
      const ta = tablesById[d];
      const tb = tablesById[t];
      if (!ta || !tb) return;
      const fpA = effectiveTableFloorPlanId(
        ta,
        selectedTpvFloorPlanId,
        floorPlans,
      );
      const fpB = effectiveTableFloorPlanId(
        tb,
        selectedTpvFloorPlanId,
        floorPlans,
      );
      if (fpA !== fpB) return;
      join(t, d);
    },
    [groupedTablesMapHandlers, tablesById, selectedTpvFloorPlanId, floorPlans],
  );

  const handleBackToMap = useCallback(() => {
    setTpvEntryMode("map");
    setSelectedTableId(null);
  }, []);

  const handlePrintPreTicket = useCallback(() => {
    window.print();
  }, []);

  const getItemColor = (createdAt?: number) => {
    const now = Date.now();
    const diff = now - (createdAt || now);

    const minutes = diff / 60000;

    if (minutes > 10) return "#ffcccc"; // rojo suave
    if (minutes > 5) return "#fff3cd"; // amarillo suave
    return "#e8f5e9"; // verde suave
  };

  const visibleOrderLines = useMemo(
    () =>
      order.filter(
        (line) => normalizeOrderLineStatus(line.status) !== "cancelled",
      ),
    [order],
  );

  const linesPending = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => normalizeOrderLineStatus(l.status) === "pending")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [visibleOrderLines],
  );

  const pendingDessertLines = useMemo(
    () =>
      linesPending.filter(
        (line) => (normalizeComandaCourseForStorage(line.course) ?? 1) === 4,
      ),
    [linesPending],
  );

  /** Primeros + segundos pendientes (course 2 ó 3). */
  const pendingPrimerosSegundos = useMemo(
    () =>
      linesPending.filter((line) => {
        const c = normalizeComandaCourseForStorage(line.course) ?? 1;
        return c === 2 || c === 3;
      }),
    [linesPending],
  );

  const hasPendingSegundos =
    pendingPrimerosSegundos.length > 0;

  const hasPendingPostres = pendingDessertLines.length > 0;

  const linesSent = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => normalizeOrderLineStatus(l.status) === "sent")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [visibleOrderLines],
  );
  const linesPrepared = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => normalizeOrderLineStatus(l.status) === "prepared")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [visibleOrderLines],
  );
  const linesServed = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => normalizeOrderLineStatus(l.status) === "served")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [visibleOrderLines],
  );

  const groupedLines = useMemo(() => {
    const buckets: Record<1 | 2 | 3 | 4, CartOrderLine[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    const pushByCourse = (line: CartOrderLine) => {
      const course = (normalizeComandaCourseForStorage(line.course) ??
        1) as 1 | 2 | 3 | 4;
      buckets[course].push(line);
    };
    linesPending.forEach(pushByCourse);
    linesSent.forEach(pushByCourse);
    linesPrepared.forEach(pushByCourse);
    if (viewMode === "normal") {
      linesServed.forEach(pushByCourse);
    }
    return buckets;
  }, [linesPending, linesSent, linesPrepared, linesServed, viewMode]);

  const sendLinesToComanda = useCallback(
    async (linesToSend: CartOrderLine[]): Promise<boolean> => {
      if (!selectedTableId) return false;
      if (!restaurantId || !isFirebaseConfigured) return false;
      if (linesToSend.length === 0) return false;
      if (isComandaSending) return false;

      const tableLabel =
        tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
        selectedTableId;

      setIsComandaSending(true);
      try {
        const now = Date.now();
        const sendIds = new Set(linesToSend.map((l) => l.id));

        const nextOrder = order.map((l) =>
          l.status === "pending" && sendIds.has(l.id)
            ? { ...l, status: "sent" as const, sentAt: l.sentAt ?? now }
            : l,
        );

        updateCurrentTableOrder(() => nextOrder);

        const items = orderLinesToFirestoreItems(nextOrder);
        const grandTotal = items.reduce(
          (acc, it) => acc + (Number(it.total) || 0),
          0,
        );

        const draftOrderId =
          openDraftOrderIdByTableRef.current[selectedTableId]?.trim() || "";
        const existingOrderId =
          orderIdFromUrl && orderIdFromUrl.trim() !== ""
            ? orderIdFromUrl
            : draftOrderId
              ? draftOrderId
              : openOrderIdsForTable.length > 0
                ? openOrderIdsForTable[0]!
                : null;

        const persistedOrderRef = existingOrderId
          ? doc(db, "orders", existingOrderId)
          : await dbgAddDoc(
              collection(db, "orders"),
              {
              restaurantId,
              tableId: selectedTableId,
              table: tableLabel,
              status: "sent",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              items,
              total: Number.isFinite(grandTotal) ? grandTotal : 0,
            },
              {
                label: "carta:sendLinesToComanda:createOrder",
                collection: "orders",
                restaurantId,
                tableId: selectedTableId,
              },
            );

        openDraftOrderIdByTableRef.current[selectedTableId] =
          persistedOrderRef.id;

        if (existingOrderId) {
          await dbgUpdateDoc(
            persistedOrderRef,
            {
            status: "sent",
            updatedAt: serverTimestamp(),
            items,
            total: Number.isFinite(grandTotal) ? grandTotal : 0,
          },
            {
              label: "carta:sendLinesToComanda:updateOrder",
              collection: "orders",
              restaurantId,
              tableId: selectedTableId,
              orderId: persistedOrderRef.id,
            },
          );
        }

        const batch = new DbgWriteBatch(db, {
          label: "carta:sendLinesToComanda:orderItemsBatch",
          collection: "orderItems",
          restaurantId,
          tableId: selectedTableId,
          orderId: persistedOrderRef.id,
        });
        linesToSend.forEach((l) => {
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
    },
    [
      selectedTableId,
      tablesList,
      restaurantId,
      isFirebaseConfigured,
      order,
      isComandaSending,
      updateCurrentTableOrder,
      orderIdFromUrl,
      openOrderIdsForTable,
    ],
  );

  const handleComanda = useCallback(async (): Promise<boolean> => {
    if (isComandaSending) {
      return false;
    }
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (order.length === 0) return false;
    if (!order.some((l) => l.status === "pending")) return false;

    const linesToSend = order.filter((l) => l.status === "pending");
    const ok = await sendLinesToComanda(linesToSend);
    if (ok) {
      showSentFeedback("Comanda enviada");
    }
    return ok;
  }, [
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    order,
    isComandaSending,
    sendLinesToComanda,
  ]);

  const showSentFeedback = (message: string) => {
    setSentFeedbackMessage(message);

    setTimeout(() => {
      setSentFeedbackMessage(null);
    }, 1500);
  };

  const handleComandaAndExit = useCallback(async () => {
    if (!order.some((l) => l.status === "pending")) return;
    const ok = await handleComanda();
    if (!ok) {
      if (order.some((l) => l.status === "pending")) {
        window.alert("No se pudo enviar la comanda. Inténtalo otra vez.");
      }
      return;
    }
    await new Promise((r) => window.setTimeout(r, 900));
    handleBackToMap();
  }, [handleComanda, handleBackToMap, order]);

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

  const tpvComandaEstadosChipsEl = useMemo(
    () => (
      <>
        <span
          style={{
            color: "#0f172a",
            background: "rgba(15,23,42,0.06)",
            border: "1px solid rgba(15,23,42,0.12)",
          }}
        >
          {cartaHeaderMobile
            ? `Pen ${linesPending.length}`
            : `Pendiente ${linesPending.length}`}
        </span>
        {hasPendingSegundos ? (
          <span
            className="ml-2 shrink-0 px-2 py-0.5 rounded bg-orange-100 text-orange-600 text-xs font-medium whitespace-nowrap border border-orange-200/80"
            title="Hay primeros o segundos pendientes de marchar"
          >
            Segundos pendientes
          </span>
        ) : null}
        {hasPendingPostres && (
          <span
            className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600"
            title="Hay postres pendientes de marchar"
          >
            Postres pendientes
          </span>
        )}
        <span
          style={{
            color: "#1e3a8a",
            background: "rgba(59,130,246,0.14)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
          }}
        >
          {cartaHeaderMobile
            ? `Env ${linesSent.length}`
            : `Enviado ${linesSent.length}`}
        </span>
        <span
          style={{
            color: "#9a3412",
            background: "rgba(245,158,11,0.14)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          {cartaHeaderMobile
            ? `Prep ${linesPrepared.length}`
            : `Preparado ${linesPrepared.length}`}
        </span>
        <span
          style={{
            color: "#166534",
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34, 197, 94, 0.25)",
          }}
        >
          {cartaHeaderMobile
            ? `Ser ${linesServed.length}`
            : `Servido ${linesServed.length}`}
        </span>
      </>
    ),
    [
      cartaHeaderMobile,
      linesPending.length,
      hasPendingSegundos,
      hasPendingPostres,
      linesSent.length,
      linesPrepared.length,
      linesServed.length,
    ],
  );

  /** Sin selector manual de pase: no hay “pase activo” para resaltar filas. */
  const activeCourseNum = -1;

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
    const keys: CocinaCourseBucket[] = [1, 2, 3, 4, 0];
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

  useLayoutEffect(() => {
    if (
      !comandaLineActionsOpen ||
      !comandaLineActionsAnchorRect ||
      !lineActionsPopoverRef.current
    ) {
      return;
    }
    const panel = lineActionsPopoverRef.current;
    const rect = comandaLineActionsAnchorRect;
    const margin = 8;
    const gap = 6;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let top = rect.bottom + gap;
    let left = rect.right - pw;
    if (top + ph > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - ph - gap);
    }
    if (top < margin) top = margin;
    if (left < margin) left = margin;
    if (left + pw > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pw - margin);
    }
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }, [
    comandaLineActionsOpen,
    comandaLineActionsAnchorRect,
    comandaLineActionsTarget,
  ]);

  useEffect(() => {
    if (!comandaLineActionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setComandaLineActionsOpen(false);
        setComandaLineActionsTargetId(null);
        setComandaLineActionsAnchorRect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comandaLineActionsOpen]);

  const renderComandaLine = (
    item: CartOrderLine,
    statusLabel: "Pendiente" | "Enviado" | "Preparado" | "Servido",
    opts: { strike?: boolean; attachFirstPendingRef?: boolean },
  ) => {
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
    /* Etiqueta breve del pase (`course` 1–4 en línea). Coherente con el editor:
       1 Entrante, 2 Primero, 3 Segundo, 4 Postre. */
    const lineCourseLabel =
      courseForBadge === 1
        ? "Entrante"
        : courseForBadge === 2
          ? "Primero"
          : courseForBadge === 3
            ? "Segundo"
            : courseForBadge === 4
              ? "Postre"
              : null;
    const lineSt = normalizeOrderLineStatus(item.status);
    const statusChipClickable = lineSt === "sent" || lineSt === "prepared";
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
        }${item.status === "pending" ? " is-pending" : ""}`}
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
                  className={
                    statusChipClickable
                      ? "carta-comanda-status-chip--clickable"
                      : undefined
                  }
                  role={statusChipClickable ? "button" : undefined}
                  tabIndex={statusChipClickable ? 0 : undefined}
                  aria-label={
                    statusChipClickable
                      ? `Marcar como servido (${statusLabel}). Pulse para confirmar.`
                      : undefined
                  }
                  onClick={
                    statusChipClickable
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleServeItem(item.id);
                        }
                      : undefined
                  }
                  onKeyDown={
                    statusChipClickable
                      ? (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          void handleServeItem(item.id);
                        }
                      : undefined
                  }
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
                  const el = e.currentTarget;
                  const r = el.getBoundingClientRect();
                  setComandaLineActionsAnchorRect({
                    top: r.top,
                    left: r.left,
                    right: r.right,
                    bottom: r.bottom,
                    width: r.width,
                    height: r.height,
                  });
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
        background: embeddedInOperacion
          ? "linear-gradient(180deg, #f5f8fc 0%, #eef3f9 42%, #e8f0f8 100%)"
          : "linear-gradient(180deg, var(--hostly-surface-page-soft) 0%, var(--hostly-surface-page) 48%, #e8eff6 100%)",
        color: "var(--hostly-ink)",
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
      {quickProductInfo ? (
        <div
          className="fixed inset-0 z-[79] flex items-center justify-center bg-black/45 p-3"
          role="presentation"
          onClick={() => setQuickProductInfo(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="carta-quick-product-info-title"
            className="relative max-h-[min(520px,85vh)] w-full max-w-[340px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Cerrar"
              onClick={() => setQuickProductInfo(null)}
            >
              ×
            </button>
            <h2
              id="carta-quick-product-info-title"
              className="pr-8 text-base font-bold leading-snug"
            >
              {quickProductInfo.nombre}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {Number.isFinite(quickProductInfo.precio)
                ? formatComandaLineEuroEs(quickProductInfo.precio)
                : "—"}
            </p>
            {(() => {
              const d = extractQuickProductDetails(quickProductInfo);
              const recNames: string[] = [...d.recommendedLabelsFromDoc];
              const seen = new Set(
                recNames.map((s) => s.toLowerCase()),
              );
              for (const id of d.recommendedProductIds) {
                const p = products.find(
                  (x) => String(x.id) === String(id),
                );
                const label = p?.nombre?.trim();
                if (label) {
                  const k = label.toLowerCase();
                  if (!seen.has(k)) {
                    seen.add(k);
                    recNames.push(label);
                  }
                } else if (id) {
                  const stub = `Referencia: ${id}`;
                  if (!seen.has(stub.toLowerCase())) {
                    seen.add(stub.toLowerCase());
                    recNames.push(stub);
                  }
                }
              }
              const hasMaridajeInfo =
                Boolean(d.pairing?.trim()) ||
                Boolean(d.tastingNotes?.trim()) ||
                recNames.length > 0;

              const wineDetailRows: Array<{ label: string; value: string }> =
                [];
              if (d.isWineLike) {
                if (d.wineType) {
                  wineDetailRows.push({
                    label: "Tipo de vino",
                    value: d.wineType,
                  });
                }
                if (d.grape) wineDetailRows.push({ label: "Uva", value: d.grape });
                if (d.region) {
                  wineDetailRows.push({
                    label: "Denominación / zona",
                    value: d.region,
                  });
                }
              }

              return (
                <>
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Ingredientes
                    </div>
                    {d.ingredients.length > 0 ? (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-slate-800">
                        {d.ingredients.map((t, i) => (
                          <li key={`ing-${i}-${t}`}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm italic text-slate-500">
                        Sin ingredientes registrados
                      </p>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Alérgenos
                    </div>
                    {d.allergens.length > 0 ? (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-slate-800">
                        {d.allergens.map((t, i) => (
                          <li key={`alg-${i}-${t}`}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm italic text-slate-500">
                        Sin alérgenos registrados
                      </p>
                    )}
                  </div>

                  {d.isWineLike && wineDetailRows.length > 0 ? (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Vino
                      </div>
                      <dl className="mt-2 space-y-1.5 text-sm text-slate-800">
                        {wineDetailRows.map((row) => (
                          <div key={row.label}>
                            <dt className="text-[11px] font-semibold text-slate-500">
                              {row.label}
                            </dt>
                            <dd className="mt-0.5">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  {d.isWineLike ? (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Maridaje y recomendaciones
                      </div>
                      {hasMaridajeInfo ? (
                        <div className="mt-2 space-y-2 text-sm text-slate-800">
                          {d.tastingNotes ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Notas
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap">
                                {d.tastingNotes}
                              </p>
                            </div>
                          ) : null}
                          {d.pairing ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Maridaje
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap">
                                {d.pairing}
                              </p>
                            </div>
                          ) : null}
                          {recNames.length > 0 ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Platos recomendados
                              </div>
                              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                {recNames.map((t, i) => (
                                  <li key={`rec-${i}-${t}`}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm italic text-slate-500">
                          Sin información de maridaje registrada
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
      {comandaLineActionsOpen && comandaLineActionsTarget ? (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/35"
            aria-hidden
            onClick={() => {
              setComandaLineActionsOpen(false);
              setComandaLineActionsTargetId(null);
              setComandaLineActionsAnchorRect(null);
            }}
          />
          <div
            ref={lineActionsPopoverRef}
            role="dialog"
            aria-modal="true"
            aria-label="Acciones de línea"
            className="fixed z-[81] w-[min(15.75rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-slate-600/60 bg-slate-900/97 text-slate-100 shadow-[0_16px_40px_rgba(2,6,23,0.55)] backdrop-blur-sm"
            style={{ top: 0, left: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const status = comandaLineActionsTarget.status;
              const allowInvite = status === "sent" || status === "prepared";
              const allowRemoveOne = status === "sent";
              const close = () => {
                setComandaLineActionsOpen(false);
                setComandaLineActionsTargetId(null);
                setComandaLineActionsAnchorRect(null);
              };
              return (
                <>
                  <div className="relative border-b border-slate-700/80 px-2.5 py-1.5 pr-9">
                    <button
                      type="button"
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      aria-label="Cerrar"
                      onClick={close}
                    >
                      ×
                    </button>
                    <div className="text-[11px] font-semibold leading-snug text-slate-400">
                      Línea
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {comandaLineDisplayName(comandaLineActionsTarget)} ×
                      {comandaLineActionsTarget.quantity}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 p-1.5">
                    <button
                      type="button"
                      disabled={!allowRemoveOne}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold leading-tight ${
                        allowRemoveOne
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-800"
                          : "cursor-not-allowed opacity-45 text-slate-500"
                      }`}
                      style={
                        allowRemoveOne
                          ? { boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)" }
                          : undefined
                      }
                      onClick={() => {
                        if (!allowRemoveOne) {
                          return;
                        }
                        void handleRemoveOneUnitFromLine(comandaLineActionsTarget);
                        close();
                      }}
                    >
                      Quitar 1 unidad
                    </button>

                    <button
                      type="button"
                      disabled={!allowInvite}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold leading-tight ${
                        allowInvite
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-800"
                          : "cursor-not-allowed opacity-45 text-slate-500"
                      }`}
                      style={
                        allowInvite
                          ? { boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)" }
                          : undefined
                      }
                      onClick={() => {
                        if (!allowInvite) {
                          return;
                        }
                        void handleCompProductFromLine(comandaLineActionsTarget);
                      }}
                    >
                      Invitar producto
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </>
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

/* Modal mapa: juntar / separar mesas (producción) */
.carta-tablegroups-map-trigger {
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(124, 58, 237, 0.38);
  background: rgba(124, 58, 237, 0.1);
  font-size: 11px;
  font-weight: 800;
  color: #5b21b6;
  cursor: pointer;
  flex-shrink: 0;
}

.carta-tablegroups-map-trigger:hover {
  background: rgba(124, 58, 237, 0.16);
}

.carta-tablegroups-modal {
  width: min(400px, 100%);
  max-height: min(90dvh, 620px);
  overflow-y: auto;
  background: white;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}

.carta-tablegroups-modal h3 {
  font-size: 18px;
  font-weight: 800;
  margin: 0 0 6px;
}

.carta-tablegroups-modal__hint {
  font-size: 12px;
  line-height: 1.35;
  color: #64748b;
  margin: 0 0 14px;
}

.carta-tablegroups-modal__section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.carta-tablegroups-modal__section:last-of-type {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.carta-tablegroups-modal label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 6px;
}

.carta-tablegroups-modal label + select {
  margin-bottom: 0;
}

.carta-tablegroups-modal select {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 8px 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  background: #fff;
}

.carta-tablegroups-modal__field-gap {
  margin-top: 10px;
}

.carta-tablegroups-modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.carta-tablegroups-modal__actions .carta-tablegroups-modal__btn {
  flex: 1;
  min-height: 44px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 13px;
  border: none;
  cursor: pointer;
}

.carta-tablegroups-modal__btn-primary {
  background: #111827;
  color: white;
}

.carta-tablegroups-modal__btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.carta-tablegroups-modal__btn-secondary {
  background: #e5e7eb;
  color: #111827;
}

.carta-tablegroups-modal__sep-btn {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 13px;
  border: none;
  cursor: pointer;
  margin-top: 12px;
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}

.carta-tablegroups-modal__sep-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Layout responsive (/dashboard/carta) */
.carta-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  min-height: 0;
  overflow: hidden;
  /* Más ancho útil en escritorio sin tocar variables globales fuera de Carta */
  --hostly-content-max-wide: 1520px;
}

@media (min-width: 1280px) {
  .carta-root {
    --hostly-content-max-wide: 1620px;
  }
}

@media (min-width: 1536px) {
  .carta-root {
    --hostly-content-max-wide: 1740px;
  }
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
  width: 100% !important;
  max-width: 100vw !important;
  overflow: hidden !important;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  padding-bottom: 0 !important;
  background: var(--hostly-surface-page) !important;
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

.carta-root .hostly-page-title {
  font-size: 17px;
  line-height: 1.08;
}

.carta-root .hostly-page-subtitle {
  margin-top: 0;
  font-size: 11px;
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
  margin-top: 8px;
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
  margin: 0 !important;
  padding: 0 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-page-fill {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  margin: 0 !important;
  padding: 0 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-table-map-shell {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  position: relative !important;
  margin: 0 !important;
  padding: 0 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-table-map-grid {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-table-map-grid > div {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-page-fill {
  width: 100% !important;
  max-width: 100vw !important;
  min-width: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  box-sizing: border-box !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
  .carta-map-page-fill.hostly-container-wide {
  max-width: none !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  width: 100% !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-metrics-strip-host.carta-map-summary-shell.carta-map-summary-block,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-metrics-strip-host.carta-map-summary-shell--critical.carta-map-summary-block {
  position: absolute !important;
  top: 2px !important;
  left: 2px !important;
  right: 2px !important;
  z-index: 12 !important;
  height: 24px !important;
  min-height: 24px !important;
  max-height: 24px !important;
  padding: 1px 2px !important;
  align-items: center !important;
  overflow: hidden !important;
  gap: 2px !important;
  flex: 0 0 auto !important;
  border-radius: 0 !important;
  border-width: 0 0 1px !important;
  box-shadow: none !important;
  background: rgba(255, 255, 255, 0.94) !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  width: auto !important;
  gap: 3px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main::-webkit-scrollbar {
  display: none;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-zones-inline {
  flex: 0 0 auto !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  height: 20px !important;
  min-height: 20px !important;
  max-height: 20px !important;
  gap: 3px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-map-summary-pill,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-map-summary-pill--interactive,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-table-map-zone-btn {
  flex: 0 0 auto !important;
  max-width: none !important;
  height: 20px !important;
  min-height: 20px !important;
  max-height: 20px !important;
  padding-left: 5px !important;
  padding-right: 5px !important;
  font-size: 8.5px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-map-waiter-compact {
  flex: 0 0 auto !important;
  height: 20px !important;
  min-height: 20px !important;
  max-height: 20px !important;
  padding: 1px 5px !important;
  gap: 3px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-map-waiter-compact select {
  height: 16px !important;
  min-height: 16px !important;
  max-height: 16px !important;
  font-size: 9px !important;
  line-height: 1 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-tpv-floor-plan-wrap {
  flex: 0 0 auto !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-tpv-floor-plan-trigger {
  max-width: min(148px, 30vw) !important;
  min-height: 20px !important;
  height: 20px !important;
  max-height: 20px !important;
  padding: 1px 6px 1px 5px !important;
  gap: 3px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-tpv-floor-plan-trigger-label {
  display: none !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-tpv-floor-plan-trigger-name {
  font-size: 8.5px !important;
  font-weight: 750 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-main .carta-tpv-floor-plan-trigger-chevron {
  font-size: 8px !important;
}

.carta-tpv-floor-plan-menu--portal[data-carta-tpv-compact-menu="true"] {
  min-width: min(220px, calc(100vw - 20px)) !important;
  max-height: min(260px, 50vh) !important;
  padding: 4px !important;
}

.carta-tpv-floor-plan-menu--portal[data-carta-tpv-compact-menu="true"] .carta-tpv-floor-plan-option {
  padding: 7px 8px !important;
  font-size: 12px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-summary-status {
  flex: 0 0 auto !important;
  width: auto !important;
  max-width: 54px !important;
  margin-left: 0 !important;
  white-space: nowrap !important;
  line-height: 1 !important;
  font-size: 8px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
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
  padding: 3px 0 4px;
}

.carta-map-summary-block {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.carta-map-summary-status {
  font-size: 9px;
  font-weight: 700;
  line-height: 1.2;
  height: auto;
  min-height: 0;
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.02em;
  color: var(--hostly-ink-muted);
  flex-shrink: 0;
  margin: 0;
  margin-left: auto;
  max-width: 100%;
  white-space: nowrap;
}

.carta-map-waiter-row {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0 6px 3px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.carta-map-top-strip-main {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  align-content: center;
  gap: 2px 4px;
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  max-width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.carta-map-waiter-compact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  color: var(--hostly-ink-muted);
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
  border: 1px solid var(--hostly-line);
  background: rgba(255, 255, 255, 0.86);
  color: var(--hostly-ink);
  cursor: pointer;
  box-sizing: border-box;
}

.carta-tpv-floor-plan-wrap {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  z-index: 4;
}

/* Desktop/tablet (≥768px): pills segmentadas; móvil sigue con chip + popover. */
.carta-tpv-floor-plan-seg {
  display: flex;
  flex: 0 1 auto;
  align-self: center;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: min(400px, 48vw);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  padding: 1px 0 2px;
  box-sizing: border-box;
  flex-shrink: 1;
  z-index: 4;
}

.carta-tpv-floor-plan-seg::-webkit-scrollbar {
  height: 3px;
}

.carta-tpv-floor-plan-seg::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.42);
  border-radius: 999px;
}

.carta-tpv-floor-plan-seg-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 3px 11px;
  min-height: 26px;
  max-width: 148px;
  border-radius: 999px;
  border: 1px solid var(--hostly-line);
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  box-sizing: border-box;
}

.carta-tpv-floor-plan-seg-pill:hover {
  background: rgba(241, 245, 249, 0.92);
  color: #334155;
}

.carta-tpv-floor-plan-seg-pill:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.5);
  outline-offset: 1px;
}

.carta-tpv-floor-plan-seg-pill--active {
  background: linear-gradient(
    180deg,
    rgba(239, 246, 255, 0.98) 0%,
    rgba(224, 242, 254, 0.86) 100%
  );
  border-color: rgba(30, 58, 95, 0.22);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.07);
  color: #0f172a;
  font-weight: 750;
}

.carta-tpv-floor-plan-seg-pill--active:hover {
  background: linear-gradient(
    180deg,
    rgba(239, 246, 255, 1) 0%,
    rgba(224, 242, 254, 0.94) 100%
  );
  color: #0f172a;
}

.carta-tpv-floor-plan-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(210px, 38vw);
  padding: 3px 9px 3px 8px;
  min-height: 28px;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid var(--hostly-line);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(246, 250, 253, 0.94) 100%
  );
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  font-family: inherit;
  color: #0f172a;
}

.carta-tpv-floor-plan-trigger:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.55);
  outline-offset: 1px;
}

.carta-tpv-floor-plan-trigger-label {
  flex: 0 0 auto;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.58);
}

.carta-tpv-floor-plan-trigger-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-tpv-floor-plan-trigger-chevron {
  flex: 0 0 auto;
  font-size: 9px;
  line-height: 1;
  opacity: 0.55;
  margin-left: 1px;
}

.carta-tpv-floor-plan-menu {
  max-width: min(280px, calc(100vw - 24px));
  max-height: min(288px, 46vh);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 5px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.06);
  box-sizing: border-box;
}

.carta-tpv-floor-plan-menu--portal {
  margin: 0;
}

.carta-tpv-floor-plan-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin: 0;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.carta-tpv-floor-plan-option:hover {
  background: rgba(241, 245, 249, 0.75);
}

.carta-tpv-floor-plan-option:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.5);
  outline-offset: 0;
}

.carta-tpv-floor-plan-option--active {
  background: linear-gradient(
    180deg,
    rgba(239, 246, 255, 0.95) 0%,
    rgba(224, 242, 254, 0.65) 100%
  );
  color: #0f172a;
  font-weight: 750;
}

.carta-tpv-floor-plan-option-check {
  flex: 0 0 auto;
  width: 1em;
  font-size: 12px;
  font-weight: 800;
  color: #0369a1;
  line-height: 1;
}

.carta-tpv-floor-plan-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}

.carta-top-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  min-width: 0;
}

.carta-top-view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.carta-top-toolbar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.carta-map-summary-shell,
.carta-map-summary-shell--critical {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--hostly-line);
  box-shadow: var(--hostly-shadow-card);
}

.carta-map-summary-shell.carta-map-summary-block,
.carta-map-summary-shell--critical.carta-map-summary-block {
  align-items: center;
  padding-top: 0;
  padding-bottom: 0;
  padding-left: 6px;
  padding-right: 6px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border-radius: 6px;
  box-sizing: border-box;
}

/* Alto fijo del strip de métricas (prioridad máxima; evita fugas desde padding/global). */
.carta-map-metrics-strip-host.carta-map-summary-shell.carta-map-summary-block,
.carta-map-metrics-strip-host.carta-map-summary-shell--critical.carta-map-summary-block {
  height: 1.1cm !important;
  min-height: 1.1cm !important;
  max-height: 1.1cm !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  overflow: hidden !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}

.carta-map-metrics-strip-host .carta-map-top-strip-main .carta-map-summary-pill,
.carta-map-metrics-strip-host .carta-map-top-strip-main .carta-map-summary-pill--interactive,
.carta-map-metrics-strip-host .carta-map-top-strip-main .carta-table-map-zone-btn {
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.carta-map-metrics-strip-host .carta-map-summary-status {
  line-height: 1 !important;
  max-height: 100%;
  overflow: hidden;
}

.carta-map-summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

.carta-map-summary-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  min-height: 22px;
  max-height: 22px;
  padding-top: 0;
  padding-bottom: 0;
  padding-left: 5px;
  padding-right: 5px;
  border-radius: 10px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: var(--hostly-ink);
  box-sizing: border-box;
  box-shadow: none;
  border: 1px solid var(--hostly-line);
  vertical-align: middle;
  margin: 0;
}

.carta-map-summary-pill--neutral {
  background: rgba(255, 255, 255, 0.9);
}
.carta-map-summary-pill--free {
  background: #dff0e4;
  border-color: rgba(47, 93, 60, 0.18);
}
.carta-map-summary-pill--busy {
  background: #dcecf3;
  border-color: rgba(45, 82, 97, 0.2);
}
.carta-map-summary-pill--reserved {
  background: #ebe4f4;
  border-color: rgba(91, 80, 104, 0.2);
}
.carta-map-summary-pill--warn {
  background: #f4ead5;
  border-color: rgba(184, 121, 34, 0.22);
}
.carta-map-summary-pill--crit {
  background: #f3e0df;
  border-color: rgba(185, 76, 70, 0.22);
}
.carta-map-summary-pill--delayed {
  background: #f2dca8;
  border-color: rgba(184, 121, 34, 0.24);
}
.carta-map-summary-pill--interactive {
  margin: 0;
  font-family: inherit;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  height: 22px;
  min-height: 22px;
  max-height: 22px;
  color: var(--hostly-ink);
  appearance: none;
  -webkit-appearance: none;
  box-shadow: none;
  cursor: default;
  padding-top: 0;
  padding-bottom: 0;
  padding-left: 5px;
  padding-right: 5px;
  border-radius: 10px;
}
.carta-map-summary-pill--interactive:focus {
  outline: none;
}
.carta-map-summary-pill--interactive:focus-visible {
  outline: 1px dotted rgba(148, 163, 184, 0.9);
  outline-offset: 0;
}

.carta-map-top-strip-main .carta-map-summary-pill,
.carta-map-top-strip-main .carta-map-summary-pill--interactive {
  height: 22px;
  min-height: 22px;
  max-height: 22px;
  padding-top: 0;
  padding-bottom: 0;
  padding-left: 5px;
  padding-right: 5px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  color: var(--hostly-ink);
}

.carta-map-top-strip-main .carta-map-summary-pill span,
.carta-map-top-strip-main .carta-map-summary-pill--interactive span {
  display: inline-flex;
  align-items: center;
  line-height: 1;
  color: #000000;
  margin: 0;
  padding: 0;
}

.carta-map-top-strip-main .carta-map-zones-inline {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  align-content: center;
  gap: 2px 4px;
  min-width: 0;
  max-width: max-content;
  flex-shrink: 0;
}

.carta-map-top-strip-main .carta-table-map-zone-btn {
  min-height: 22px !important;
  height: 22px !important;
  max-height: 22px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-left: 5px !important;
  padding-right: 5px !important;
  line-height: 1 !important;
  font-size: 9px !important;
  border-radius: 10px !important;
  box-sizing: border-box;
}

.carta-map-top-strip .carta-table-map-zone-btn {
  background: rgba(255, 255, 255, 0.84);
  border-color: var(--hostly-line);
  color: var(--hostly-ink-muted);
}

.carta-map-top-strip .carta-table-map-zone-btn--on {
  border-color: var(--hostly-line-strong);
  background: var(--hostly-accent-soft);
  color: var(--hostly-accent);
}

.carta-map-toolbar {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.carta-map-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
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
  border: 1px solid var(--hostly-line);
  background: rgba(248, 251, 254, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

.carta-mode-seg--compact {
  padding: 2px 4px 2px 3px;
  gap: 3px;
  width: fit-content;
  max-width: 100%;
}

.carta-operativa-mode-strip .carta-mode-seg--compact {
  background: rgba(248, 251, 254, 0.72);
  border-color: var(--hostly-line);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.carta-operativa-mode-strip .carta-mode-btn--compact {
  color: var(--hostly-ink-muted) !important;
}

.carta-operativa-mode-strip .carta-mode-btn--compact[aria-pressed="true"] {
  background: #ffffff !important;
  border-color: var(--hostly-line-strong) !important;
  color: var(--hostly-ink) !important;
  box-shadow: var(--hostly-shadow-card) !important;
}

.carta-operativa-mode-strip .carta-mode-btn--compact[aria-pressed="false"]:hover {
  background: rgba(255, 255, 255, 0.9) !important;
}

.carta-mode-btn {
  flex-shrink: 0 !important;
  min-height: 36px !important;
  min-width: 88px !important;
  padding: 10px 18px !important;
  border-radius: 999px !important;
  border: 1px solid var(--hostly-line) !important;
  background: rgba(255, 255, 255, 0.86) !important;
  color: var(--hostly-ink-muted) !important;
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
  box-shadow: var(--hostly-shadow-card) !important;
}

.carta-mode-btn:active {
  transform: translateY(0.5px);
}

.carta-mode-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(63, 100, 120, 0.18) !important;
}

.carta-mode-btn[aria-pressed="false"]:hover {
  background: #ffffff !important;
  border-color: var(--hostly-line-strong) !important;
}

.carta-aside-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.carta-aside-meta-row .carta-tpv-to-map-btn {
  margin-left: auto;
}

.carta-header-compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
  flex-wrap: nowrap;
  min-width: 0;
}

.carta-header-compact.carta-comanda-header-compact {
  justify-content: flex-start;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.carta-header-compact.carta-comanda-header-compact::-webkit-scrollbar {
  display: none;
}

.carta-header-compact.carta-comanda-header-compact .carta-estados {
  flex: 1 1 auto;
  justify-content: space-between;
  align-self: stretch;
  min-width: 0;
  width: 100%;
  gap: 10px;
}

.carta-comensales-compact.carta-comensales--pill {
  max-width: 180px;
  height: 36px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: visible;
  background: #f9fafb;
  border: 1px solid rgba(15, 23, 42, 0.12);
}

.carta-comensales-label {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.carta-comensales-count {
  font-size: 14px;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.carta-comensales-compact.carta-comensales--pill > button {
  box-sizing: border-box !important;
  width: 22px !important;
  height: 18px !important;
  min-width: 22px !important;
  min-height: 18px !important;
  max-height: 18px !important;
  border-radius: 7px;
  background: #ffffff;
  color: #111827;
  border: 1px solid rgba(15, 23, 42, 0.18);
  font-size: 12px;
  font-weight: 900;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  padding: 1px 0 !important;
  cursor: pointer;
}

.carta-comensales-compact.carta-comensales--pill > button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.carta-estados {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.carta-estados span {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 6px;
  border-radius: 6px;
  line-height: 1.2;
  white-space: nowrap;
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

/* Cabecera comanda: laterales 1fr (aire real) | centro auto (mesa) | laterales 1fr.
   Equivale a 1fr auto 1fr con minmax(0,1fr) para truncado sin romper grid. */
.carta-comanda-head-top-grid {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  row-gap: 0;
  box-sizing: border-box;
}

.carta-comanda-head-cell--left {
  justify-self: start;
  align-self: center;
  text-align: left;
  margin-left: -8px;
}

.carta-comanda-head-cell--center {
  min-width: 0;
  justify-self: center;
  align-self: center;
  max-width: 100%;
  padding-left: 4px;
  padding-right: 4px;
}

.carta-comanda-head-cell--right {
  justify-self: end;
  align-self: center;
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.carta-comanda-headline-time {
  font-weight: 800;
}

.carta-comanda-meta-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
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
  padding: 6px 0 0;
  background: transparent;
  border-top: none;
  box-shadow: none;
}

.carta-tpv-payment-dock-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.carta-tpv-payment-dock-total {
  margin-bottom: 6px;
}

.carta-tpv-payment-dock-total-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.85);
  margin-bottom: 2px;
}

.carta-tpv-payment-dock-total-value {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1.1;
}

.carta-tpv-payment-dock-total-eur {
  font-size: 17px;
  font-weight: 800;
  opacity: 0.72;
  color: #475569;
}

.carta-tpv-final-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
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
  padding: 8px 0 0;
  margin-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.carta-active-mesa--empty {
  color: rgba(15, 23, 42, 0.38);
  font-weight: 500;
}

.carta-tpv-to-map-btn {
  flex-shrink: 0;
  margin-left: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.72);
  color: #334155;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(8px);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.08s ease;
}

.carta-tpv-to-map-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(56, 189, 248, 0.42);
  color: #0f172a;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.carta-tpv-to-map-btn:active {
  transform: translateY(0.5px);
  background: rgba(241, 245, 249, 0.95);
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: none;
}

.carta-tpv-to-map-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
}

.carta-cats-wrap {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.carta-cat-btn-active {
  background: linear-gradient(
    180deg,
    rgba(239, 246, 255, 0.98) 0%,
    rgba(224, 242, 254, 0.88) 100%
  ) !important;
  border-color: rgba(56, 189, 248, 0.38) !important;
  color: #0f172a !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.carta-current-cat-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
  opacity: 1;
}

.carta-table-map-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
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
  border: 1px solid var(--hostly-line);
  background: rgba(255, 255, 255, 0.84);
  font-size: 11px;
  font-weight: 800;
  color: var(--hostly-ink-muted);
  cursor: pointer;
}

.carta-table-map-zone-btn--on {
  border-color: var(--hostly-line-strong);
  background: var(--hostly-accent-soft);
  color: var(--hostly-accent);
}

.carta-table-map-grid {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(244, 248, 252, 0.72) 0%, rgba(232, 239, 246, 0.7) 100%);
  border: 1px solid var(--hostly-line);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.52);
}

.carta-table-map-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 16px;
  border: 1px solid var(--hostly-line);
  background: rgba(255, 255, 255, 0.92) !important;
  cursor: pointer;
  box-sizing: border-box;
  font: inherit;
  text-align: center;
  min-height: 92px;
  color: var(--hostly-ink);
  box-shadow: var(--hostly-shadow-card);
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
  border-color: rgba(93, 132, 93, 0.28);
  background: var(--hostly-success-soft) !important;
}

.carta-table-map-tile--busy-short {
  border-color: rgba(93, 132, 93, 0.32);
  background: var(--hostly-success-soft) !important;
  box-shadow: var(--hostly-shadow-card);
}

.carta-table-map-tile--busy-medium {
  border-color: rgba(196, 144, 61, 0.34);
  background: var(--hostly-warning-soft) !important;
  box-shadow: var(--hostly-shadow-card);
}

.carta-table-map-tile--busy-long {
  border-color: rgba(201, 99, 91, 0.34);
  background: var(--hostly-danger-soft);
  box-shadow: var(--hostly-shadow-card);
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
  outline: 2px solid rgba(201, 99, 91, 0.28);
  outline-offset: 2px;
  box-shadow: var(--hostly-shadow-card);
  animation: none;
}

.carta-table-map-tile-name {
  font-size: 18px;
  font-weight: 900;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: var(--hostly-ink);
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
  color: var(--hostly-ink-muted);
}

.carta-table-map-tile-badge--medium {
  font-weight: 600;
  background: rgba(148, 163, 184, 0.35);
  color: var(--hostly-ink);
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
  color: var(--hostly-ink);
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
  color: var(--hostly-ink-muted);
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
  background: var(--hostly-ink-muted);
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
      var(--hostly-shadow-card);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(201, 99, 91, 0.24);
  }
}

.carta-map-summary-shell--critical {
  animation: none;
}

.carta-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 10px;
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
  background: linear-gradient(180deg, #ffffff 0%, #fafbfd 100%);
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  box-sizing: border-box;
}

.carta-aside-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  padding-bottom: 4px;
  padding-left: 2px;
}

.carta-aside-footer {
  margin-top: 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.carta-comanda-line {
  padding: 6px 8px 7px 10px;
  margin-left: 0;
  margin-right: 0;
  border-radius: 8px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  transition: background-color 0.1s ease;
}

.carta-comanda-line.is-pending {
  position: relative;
  padding-left: 14px !important;
  background: rgba(15, 23, 42, 0.04) !important;
  border: 1px solid rgba(15, 23, 42, 0.11) !important;
}

.carta-comanda-line.is-pending::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: calc(100% - 10px);
  max-height: 32px;
  border-radius: 2px;
  background: rgba(30, 41, 59, 0.72);
  pointer-events: none;
}

.carta-comanda-group {
  margin-bottom: 7px;
}

.carta-comanda-group-title {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 8px 0 5px;
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

.carta-comanda-status-chip--clickable {
  cursor: pointer;
  transition: opacity 120ms ease, filter 120ms ease;
}

.carta-comanda-status-chip--clickable:hover {
  opacity: 0.92;
  filter: brightness(1.06);
}

.carta-comanda-status-chip--clickable:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.26);
  outline-offset: 1px;
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

.carta-mobile-products-scroll-shell {
  display: contents;
}

.carta-products-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

.carta-products-empty-state {
  box-sizing: border-box;
  max-width: 360px;
  margin: 12px auto 0;
  padding: 24px 20px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.45;
  color: #64748b;
  background: rgba(255, 255, 255, 0.72);
  border: 1px dashed rgba(186, 198, 212, 0.85);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.carta-product-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(4, 1fr);
  align-items: stretch;
  gap: 10px;
}

.carta-product-card {
  height: 120px;
  min-height: 72px;
  padding: 10px !important;
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
  background: #ffffff;
  color: #0f172a;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 6px 16px rgba(15, 23, 42, 0.04);
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
  transition:
    transform 80ms ease,
    box-shadow 140ms ease,
    border-color 140ms ease,
    background-color 140ms ease;
  width: 100%;
}

.carta-product-card:hover {
  border-color: rgba(186, 230, 253, 0.95);
  box-shadow:
    0 2px 4px rgba(15, 23, 42, 0.05),
    0 8px 20px rgba(15, 23, 42, 0.06);
}

.carta-product-card * {
  pointer-events: none;
}

.carta-product-card:active {
  transform: scale(0.97);
  box-shadow:
    0 0 0 2px rgba(56, 189, 248, 0.35),
    0 4px 12px rgba(15, 23, 42, 0.06);
}

.carta-product-card--adding {
  animation: cartaProductAddFlash 160ms ease-out both;
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
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
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
   campo numérico course (1 E, 2 P, 3 S, 4 D) ya existente en CartOrderLine. */
.carta-product-course-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(30, 58, 95, 0.88);
  color: white;
  font-size: 10px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 5px;
  pointer-events: none;
  opacity: 0.95;
  line-height: 1;
  z-index: 2;
}

.carta-comanda-button:hover:not(:disabled) {
  background: #f1f5f9 !important;
  border-color: rgba(56, 189, 248, 0.35) !important;
}

.carta-comanda-button:disabled {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  background: #e5e7eb !important;
  color: #6b7280 !important;
  box-shadow: none !important;
  filter: none !important;
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

/* Fila intermedia tiempo + pendientes: el gap del flex ya separa del tiempo. */
.carta-pending-indicator.carta-pending-indicator--meta-row {
  margin-left: 0;
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
  background: rgba(255, 255, 255, 0.95);
  color: #0f766e;
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 5px;
  border: 1px solid rgba(45, 212, 191, 0.45);
  pointer-events: none;
  z-index: 2;
}

/* Feedback visual mientras se mantiene pulsada la tarjeta para quitar 1
   unidad (long-press). La clase holding se añade a los 200 ms y se
   retira al soltar/cancelar. El color rojo señala "vas a quitar". */
.carta-product-card.holding {
  transform: scale(0.92);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.28);
}

.carta-product-media {
  max-width: 74px;
  height: 50px;
}

/* Tablet/desktop: panel comanda más ancho (~+2.5 cm aquí; +4 cm desde 1024px).
   Móvil sigue gobernado por @media (max-width: 767.98px). */
@media (min-width: 768px) and (max-width: 1023.98px) {
  .carta-aside,
  .carta-comanda {
    width: calc(35% + 2.5cm);
    min-width: calc(320px + 2.5cm);
  }
}

@media (min-width: 768px) {
  .carta-product-card { height: 120px; min-height: 72px; padding: 10px !important; gap: 4px; }
  .carta-product-media { max-width: 82px; height: 56px; }
}

@media (min-width: 768px) and (max-width: 899.98px) {
  .carta-product-grid { grid-template-columns: repeat(4, 1fr); }
}

@media (min-width: 900px) and (max-width: 1023.98px) {
  .carta-product-grid { grid-template-columns: repeat(5, 1fr); }
}

@media (min-width: 1024px) {
  .carta-aside,
  .carta-comanda {
    width: calc(35% + 4cm);
    min-width: calc(320px + 4cm);
  }
  .carta-product-grid { grid-template-columns: repeat(6, 1fr); }
  .carta-product-card { height: 120px; min-height: 72px; padding: 10px !important; gap: 4px; }
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
    gap: 6px !important;
  }
  .carta-aside,
  .carta-comanda {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    flex-shrink: 0;
    border-right: none;
    display: flex;
    flex-direction: column;
    max-height: 48vh;
    overflow: hidden;
    margin-bottom: 0 !important;
  }
  .carta-aside-scroll {
    flex: 1 1 auto;
    min-height: 110px;
    max-height: 220px;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .carta-tpv-payment-dock .carta-tpv-dock-pre-ticket-wrap,
  .carta-tpv-payment-dock .carta-tpv-dock-cobrar-wrap {
    display: none !important;
  }

  .carta-tpv-payment-dock-stack {
    display: grid !important;
    grid-template-columns: 1fr 130px !important;
    gap: 8px !important;
    align-items: stretch !important;
  }

  .carta-tpv-payment-dock-stack > .carta-tpv-payment-dock-grid {
    display: contents !important;
  }

  .carta-tpv-payment-dock {
    flex-shrink: 0;
  }
  .carta-main.carta-productos {
    flex: 1 1 0% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .carta-mobile-products-scroll-shell {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: 100% !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y !important;
  }

  .carta-main-fixed {
    flex: 0 0 auto !important;
  }

  .carta-products-scroll {
    flex: 1 1 auto !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    -webkit-overflow-scrolling: touch !important;
  }

  .carta-product-card {
    touch-action: manipulation !important;
  }

  .carta-comanda-header-compact {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    justify-content: flex-start !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
  }

  .carta-comanda-header-compact .carta-estados {
    flex: 1 1 auto !important;
    justify-content: space-between !important;
    align-self: stretch !important;
    min-width: 0 !important;
    width: 100% !important;
    gap: 10px !important;
  }

  .carta-comensales-compact.carta-comensales--pill {
    display: grid !important;
    grid-template-columns: auto 1fr auto auto !important;
    align-items: center !important;
    gap: 4px !important;
    height: 34px !important;
    min-height: 34px !important;
    padding: 2px 6px !important;
    border-radius: 10px !important;
    max-width: 180px !important;
    overflow: visible !important;
  }

  .carta-comensales-label {
    font-size: 11px !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
  }

  .carta-comensales-count {
    font-size: 13px !important;
    font-weight: 700 !important;
    text-align: center !important;
    min-width: 16px !important;
  }

  .carta-comensales-compact.carta-comensales--pill > button {
    box-sizing: border-box !important;
    width: 22px !important;
    height: 18px !important;
    min-width: 22px !important;
    min-height: 18px !important;
    max-height: 18px !important;
    border-radius: 5px !important;
    font-size: 12px !important;
    font-weight: 900 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: #ffffff !important;
    color: #111827 !important;
    border: 1px solid rgba(0, 0, 0, 0.15) !important;
    line-height: 1 !important;
    padding: 1px 0 !important;
  }

  .carta-comanda-status-row {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: nowrap;
    flex: 0 1 auto;
    min-width: 0;
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .carta-comanda-status-row::-webkit-scrollbar {
    display: none;
  }

  .carta-comanda-status-row span,
  .carta-comanda-status-row div,
  .carta-comanda-status-row button {
    flex: 0 0 auto;
    font-size: 9px !important;
    padding: 2px 4px !important;
    line-height: 1 !important;
    border-radius: 999px !important;
    white-space: nowrap;
  }

  .carta-comanda-line {
    padding: 6px 8px !important;
    min-height: 46px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .carta-comanda-line.is-pending {
    padding: 6px 8px 6px 14px !important;
  }

  .carta-comanda-line > div:first-child {
    min-width: 0;
    flex: 1;
  }

  .carta-comanda-name {
    font-size: 13px !important;
    max-width: 110px;
  }

  .carta-comanda-line-pricing {
    font-size: 11px !important;
  }

  .carta-line-course-badge {
    font-size: 9px !important;
    padding: 2px 5px !important;
  }

  .carta-comanda-qty-controls {
    gap: 3px !important;
  }

  .carta-comanda-qty-btn {
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    min-height: 28px !important;
    border-radius: 8px !important;
    font-size: 13px !important;
  }

  .carta-comanda-button {
    width: 100% !important;
    min-height: 56px !important;
    font-size: 15px !important;
    border-radius: 12px !important;
  }

  .carta-tpv-payment-dock-total {
    margin-bottom: 0 !important;
    min-height: 56px !important;
    padding: 8px 10px !important;
    box-sizing: border-box !important;
  }

  .carta-tpv-payment-dock-total strong,
  .carta-tpv-payment-dock-total .total-amount {
    font-size: 24px !important;
  }
}

/* === Mobile + embedded en Operación: viewport locked, productos con
   scroll propio para evitar el clip por overflow:hidden de los padres === */
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-layout {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  gap: 2px !important;
  height: auto !important;
  display: flex !important;
  flex-direction: column !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-aside,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda {
  flex: 0 1 auto !important;
  min-height: 0 !important;
  max-height: 36dvh !important;
  padding: 3px !important;
  border-radius: 8px !important;
  overflow: hidden !important;
  border-right: none !important;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06) !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-top-shell {
  gap: 1px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-top-toolbar {
  gap: 2px !important;
  min-height: 0 !important;
  align-items: center !important;
  padding: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-aside-meta-row {
  min-height: 0 !important;
  gap: 2px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-active-mesa {
  padding: 0 !important;
  line-height: 1.05 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-top-grid {
  min-height: 21px !important;
  column-gap: 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-cell--left {
  margin-left: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-cell--center {
  padding-left: 2px !important;
  padding-right: 2px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-cell--right {
  gap: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-headline {
  font-size: 15px !important;
  font-weight: 900 !important;
  letter-spacing: -0.02em !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-headline-time {
  font-size: 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-to-map-btn {
  min-height: 18px !important;
  max-width: 54px !important;
  padding: 2px 4px !important;
  border-radius: 7px !important;
  font-size: 9px !important;
  line-height: 1 !important;
  box-shadow: none !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  opacity: 0.78 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-header-compact {
  gap: 1px !important;
  margin-top: 0 !important;
  min-height: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-header-compact .carta-estados,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-row {
  gap: 1px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-row span,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-row div,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-row button {
  font-size: 8px !important;
  padding: 1px 2px !important;
  min-height: 14px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comensales-compact.carta-comensales--pill {
  height: 24px !important;
  min-height: 24px !important;
  max-width: 132px !important;
  gap: 2px !important;
  padding: 1px 4px !important;
  border-radius: 8px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comensales-label {
  font-size: 9px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comensales-count {
  font-size: 11px !important;
  min-width: 12px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comensales-compact.carta-comensales--pill > button {
  width: 17px !important;
  height: 15px !important;
  min-width: 17px !important;
  min-height: 15px !important;
  max-height: 15px !important;
  border-radius: 5px !important;
  font-size: 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-aside-scroll {
  flex: 0 1 auto !important;
  min-height: 0 !important;
  max-height: 19dvh !important;
  overflow-y: auto !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-aside-scroll > div[style*="padding: 28px"] {
  padding: 10px 8px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-group {
  margin-bottom: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-group-title {
  margin: 2px 0 2px !important;
  font-size: 9px !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line {
  min-height: 36px !important;
  padding: 3px 6px !important;
  border-radius: 6px !important;
  gap: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line.is-pending {
  padding: 3px 6px 3px 11px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line-grid {
  column-gap: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-name {
  font-size: 12px !important;
  line-height: 1.05 !important;
  max-width: 132px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line-pricing,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pu,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pu-suffix {
  font-size: 9px !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-line-course-badge {
  font-size: 8px !important;
  padding: 1px 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-qty-controls {
  gap: 2px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-qty-btn {
  width: 23px !important;
  height: 23px !important;
  min-width: 23px !important;
  min-height: 23px !important;
  border-radius: 7px !important;
  font-size: 12px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock {
  padding-top: 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock-stack {
  grid-template-columns: minmax(0, 1fr) 96px !important;
  gap: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-button {
  min-height: 42px !important;
  padding: 7px 10px !important;
  border-radius: 10px !important;
  font-size: 16px !important;
  font-weight: 900 !important;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%) !important;
  color: #ffffff !important;
  border-color: rgba(37, 99, 235, 0.36) !important;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.22) !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock-total {
  min-height: 42px !important;
  padding: 5px 7px !important;
  border-radius: 10px !important;
  background: rgba(15, 23, 42, 0.08) !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock-total-label {
  font-size: 8px !important;
  color: rgba(15, 23, 42, 0.48) !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock-total-value,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-payment-dock-total .total-amount {
  font-size: 16px !important;
  color: #0f172a !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main.carta-productos {
  flex: 1 1 0% !important;
  min-height: 88px !important;
  height: auto !important;
  max-height: none !important;
  padding: 4px !important;
  border-radius: 9px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main.carta-productos[data-products-empty="true"] {
  flex: 0 0 auto !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-mobile-products-scroll-shell {
  flex: 1 1 auto !important;
  min-height: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-products-scroll {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main.carta-productos[data-products-empty="true"] .carta-products-scroll {
  flex: 0 0 auto !important;
  min-height: 0 !important;
  overflow: visible !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-products-empty-state {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 24px !important;
  max-height: 30px !important;
  padding: 3px 6px !important;
  border-radius: 7px !important;
  background: transparent !important;
  border: 0 !important;
  color: var(--hostly-ink-muted) !important;
  font-size: 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-current-cat-title {
  margin: 0 0 3px !important;
  font-size: 11px !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-cats-wrap {
  gap: 4px !important;
  padding-bottom: 4px !important;
  margin-bottom: 5px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-cats-wrap button {
  min-height: 26px !important;
  min-width: 68px !important;
  padding: 5px 8px !important;
  font-size: 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-main.carta-productos[data-products-empty="true"] .carta-current-cat-title {
  display: none !important;
}

/* TPV táctil: quita highlight/focus azul del motor en teselas del plano (role=button). */
.carta-root[data-carta-mobile="true"] .hostly-map-table {
  -webkit-tap-highlight-color: transparent;
}
.carta-root[data-carta-mobile="true"] .hostly-map-table:focus {
  outline: none;
}
.carta-root[data-carta-mobile="true"] .hostly-map-table:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.22);
  outline-offset: 2px;
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
          compactSpacing
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
            paddingTop: 4,
            paddingBottom: cartaHeaderMobile ? 8 : 4,
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
            paddingTop: 8,
            paddingBottom: 14,
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
                  paddingTop: 12,
                  paddingBottom: 12,
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
              {cartaHeaderMobile &&
              embeddedInOperacion &&
              mapSummaryAlertLevel === "normal" &&
              activeMapFilter === "all" &&
              operationalFloorPlansForTpv.length <= 1 ? null : (
                <div
                  role="status"
                  aria-live="polite"
                  className={
                    mapSummaryAlertLevel === "critical"
                      ? "carta-map-metrics-strip-host carta-map-summary-shell--critical carta-map-summary-block"
                      : "carta-map-metrics-strip-host carta-map-summary-shell carta-map-summary-block"
                  }
                  style={{
                    boxSizing: "border-box",
                    paddingLeft: 6,
                    paddingRight: 6,
                    flexShrink: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    border:
                      mapSummaryAlertLevel === "critical"
                        ? "1px solid rgba(201, 99, 91, 0.38)"
                        : mapSummaryAlertLevel === "warning"
                          ? "1px solid rgba(196, 144, 61, 0.36)"
                          : "1px solid var(--hostly-line)",
                    boxShadow: "var(--hostly-shadow-card)",
                    marginBottom: 0,
                  }}
                >
                <div className="carta-map-top-strip-main">
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--neutral carta-map-summary-pill--interactive"
                    aria-pressed={activeMapFilter === "all"}
                    onClick={() => setActiveMapFilter("all")}
                  >
                    {mapQuickSummary.total}{" "}
                    {mapQuickSummary.total === 1 ? "mesa" : "mesas"}
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--free carta-map-summary-pill--interactive"
                    title="Sin comanda y sin reserva asignada hoy"
                    aria-pressed={activeMapFilter === "free"}
                    onClick={() => setActiveMapFilter("free")}
                  >
                    {mapQuickSummary.free}{" "}
                    {mapQuickSummary.free === 1 ? "libre" : "libres"}
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--busy carta-map-summary-pill--interactive"
                    title="Con comanda activa o líneas en curso"
                    aria-pressed={activeMapFilter === "occupied"}
                    onClick={() => setActiveMapFilter("occupied")}
                  >
                    {mapQuickSummary.busy}{" "}
                    {mapQuickSummary.busy === 1 ? "ocupada" : "ocupadas"}
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--reserved carta-map-summary-pill--interactive"
                    title="Reserva del día, mesa libre de comanda"
                    aria-pressed={activeMapFilter === "reserved"}
                    onClick={() => setActiveMapFilter("reserved")}
                  >
                    {mapQuickSummary.reserved}{" "}
                    {mapQuickSummary.reserved === 1 ? "reservada" : "reservadas"}
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--warn carta-map-summary-pill--interactive"
                    aria-pressed={activeMapFilter === "attention"}
                    onClick={() => setActiveMapFilter("attention")}
                  >
                    {mapQuickSummary.warning} atención
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--crit carta-map-summary-pill--interactive"
                    aria-pressed={activeMapFilter === "critical"}
                    onClick={() => setActiveMapFilter("critical")}
                  >
                    {mapQuickSummary.critical}{" "}
                    {mapQuickSummary.critical === 1 ? "crítica" : "críticas"}
                  </button>
                  <button
                    type="button"
                    className="carta-map-summary-pill carta-map-summary-pill--delayed carta-map-summary-pill--interactive"
                    title="Reservas retrasadas (≥15 min)"
                    aria-pressed={activeMapFilter === "delayed"}
                    onClick={() => setActiveMapFilter("delayed")}
                  >
                    {reservationPressureCounts.late}{" "}
                    {reservationPressureCounts.late === 1
                      ? "retrasada"
                      : "retrasadas"}
                  </button>
                  {!embeddedInOperacion && mapZoneOptions.length > 1 ? (
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
                  {operationalFloorPlansForTpv.length > 1 ? (
                    cartaHeaderMobile ? (
                      <div
                        ref={tpvFloorPlanMenuRef}
                        className="carta-tpv-floor-plan-wrap"
                      >
                        <button
                          type="button"
                          className="carta-tpv-floor-plan-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={tpvFloorPlanMenuOpen}
                          aria-label={`Plano operativo: ${selectedTpvFloorPlan?.name?.trim() ?? "plano"}. Elegir otro plano.`}
                          onClick={() =>
                            setTpvFloorPlanMenuOpen((open) => !open)
                          }
                        >
                          <span className="carta-tpv-floor-plan-trigger-label">
                            Plano
                          </span>
                          <span className="carta-tpv-floor-plan-trigger-name">
                            {selectedTpvFloorPlan?.name?.trim() ?? "—"}
                          </span>
                          <span
                            className="carta-tpv-floor-plan-trigger-chevron"
                            aria-hidden
                          >
                            ▾
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div
                        className="carta-tpv-floor-plan-seg"
                        role="tablist"
                        aria-label="Planos operativos"
                      >
                        {operationalFloorPlansForTpv.map((plan) => {
                          const active =
                            plan.id === selectedTpvFloorPlanId;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              className={
                                active
                                  ? "carta-tpv-floor-plan-seg-pill carta-tpv-floor-plan-seg-pill--active"
                                  : "carta-tpv-floor-plan-seg-pill"
                              }
                              onClick={() =>
                                selectOperationalTpvFloorPlan(plan.id)
                              }
                            >
                              {plan.name}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                  {operationalFloorPlansForTpv.length > 1 &&
                  cartaHeaderMobile &&
                  tpvFloorPlanMenuOpen &&
                  tpvFloorPlanMenuRect &&
                  typeof document !== "undefined"
                    ? createPortal(
                        <div
                          ref={tpvFloorPlanMenuPanelRef}
                          className="carta-tpv-floor-plan-menu carta-tpv-floor-plan-menu--portal"
                          role="listbox"
                          aria-label="Planos operativos"
                          data-carta-tpv-compact-menu={
                            embeddedInOperacion && cartaHeaderMobile
                              ? "true"
                              : undefined
                          }
                          style={{
                            position: "fixed",
                            top: tpvFloorPlanMenuRect.top,
                            left: tpvFloorPlanMenuRect.left,
                            minWidth: tpvFloorPlanMenuRect.minWidth,
                            zIndex: 4500,
                          }}
                        >
                          {operationalFloorPlansForTpv.map((plan) => {
                            const active =
                              plan.id === selectedTpvFloorPlanId;
                            return (
                              <button
                                key={plan.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={
                                  active
                                    ? "carta-tpv-floor-plan-option carta-tpv-floor-plan-option--active"
                                    : "carta-tpv-floor-plan-option"
                                }
                                onClick={() =>
                                  selectOperationalTpvFloorPlan(plan.id)
                                }
                              >
                                <span
                                  className="carta-tpv-floor-plan-option-check"
                                  aria-hidden
                                >
                                  {active ? "✓" : "\u00a0"}
                                </span>
                                <span className="carta-tpv-floor-plan-option-name">
                                  {plan.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
                {cartaHeaderMobile &&
                embeddedInOperacion &&
                mapSummaryAlertLevel === "normal" ? null : (
                  <span className="carta-map-summary-status">
                    {mapSummaryAlertLevel === "critical"
                      ? "Atención urgente"
                      : mapSummaryAlertLevel === "warning"
                        ? "Revisar mesas"
                        : "Servicio estable"}
                  </span>
                )}
                </div>
              )}
              {!embeddedInOperacion ? (
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
              ) : null}
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
                ) : mapTablesForChipFilter.length === 0 ? (
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      margin: 0,
                      width: "100%",
                    }}
                  >
                    Ninguna mesa coincide con el filtro del resumen.
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
                    editorPlanSurface
                    editorVisualPreset="premium"
                    mapLayoutEmphasis
                    hideZoneOverlays
                    floorSurfacePreset={
                      cartaHeaderMobile && embeddedInOperacion
                        ? "stone"
                        : "ice"
                    }
                    viewportFitPaddingPx={
                      cartaHeaderMobile && embeddedInOperacion ? 0 : 16
                    }
                    viewportFitMode="content"
                    viewportFitElements={planElementsForTpvMap}
                    viewportFitZones={zonesForOperationalMapRender}
                    viewportFitZoomMax={
                      cartaHeaderMobile && embeddedInOperacion ? 2.35 : 1.78
                    }
                    mapAutoFitKey={tpvMapAutoFitKey}
                    planSize={selectedTpvFloorPlanSize}
                    elements={mapElementsForTpvRender}
                    zones={zonesForOperationalMapRender}
                    renderElement={(ctx) => {
                      const tableId = ctx.elementId;
                      if (isDecorativePlanElementType(ctx.element.type)) {
                        return (
                          <div
                            aria-hidden
                            style={tpvDecorativeElementStyle(
                              ctx.element,
                              ctx.mapLayoutX,
                              ctx.mapLayoutY,
                              ctx.mapTileWidth,
                              ctx.mapTileHeight,
                            )}
                          />
                        );
                      }
                      if (
                        groupedTablesMapHandlers?.isJoinedSecondaryTable?.(
                          tableId,
                        )
                      ) {
                        return null;
                      }
                      const stableTable = tablesById[tableId] ?? ctx.element;
                      const mapLayoutX = ctx.mapLayoutX;
                      const mapLayoutY = ctx.mapLayoutY;
                      const mapTileWidth = ctx.mapTileWidth;
                      const mapTileHeight = ctx.mapTileHeight;
                      const priorityTable =
                        mapTablesForChipFilter.find(
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
                        ? cartaHeaderMobile
                          ? `${String(stableTable.name ?? "").trim()}, ${t("cartaTpv.mapOcupada")}`
                          : `${String(stableTable.name ?? "").trim()}${durationLabel ? `, ${durationLabel}` : ""}${showProductCount ? ` (${activeLineCount})` : ""}, ${t("cartaTpv.mapOcupada")}`
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
                      const groupedBadgeText =
                        groupedTablesMapHandlers?.getGroupedBadgeText(tableId) ??
                        null;

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
                          readyToClose={salaReadyToCloseTableIds.has(tableId)}
                          groupedBadgeText={groupedBadgeText}
                          mapJoinDragEnabled={Boolean(
                            groupedTablesMapHandlers?.joinTables,
                          )}
                          onMapTableJoinDrop={handleMapTableJoinDrop}
                          mapJoinClusterMainId={String(
                            groupedTablesMapHandlers?.resolveMainTableId?.(
                              tableId,
                            ) ?? tableId,
                          ).trim()}
                          showVisualChairs={true}
                          isMapGroupedPrimary={
                            stableTable.type === "table" &&
                            Boolean(
                              groupedTablesMapHandlers?.isGroupedPrimaryTable?.(
                                tableId,
                              ),
                            )
                          }
                          isMapGroupedSelectionElevated={Boolean(
                            groupedTablesMapHandlers?.isGroupedPrimaryTable?.(
                              tableId,
                            ) && selectedTableId === tableId,
                          )}
                          onRequestSeparateGroupedTables={
                            groupedTablesMapHandlers?.separateTable
                              ? (tid: string) => {
                                  const mainId =
                                    groupedTablesMapHandlers?.resolveMainTableId?.(
                                      tid,
                                    ) ?? tid;
                                  groupedTablesMapHandlers.separateTable?.(
                                    mainId,
                                  );
                                }
                              : undefined
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
            padding: 12,
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
              gap: 6,
              minHeight: 42,
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
                <div className="carta-comanda-head-top-stack w-full min-w-0">
                  <div className="carta-comanda-head-top-grid mb-0 w-full min-h-[32px]">
                    <div className="carta-comanda-head-cell--left">
                      {viewMode === "normal" && selectedTableId ? (
                        <div className="carta-comensales-compact carta-comensales--pill">
                          <span className="carta-comensales-label">
                            Comensales:
                          </span>
                          <button
                            type="button"
                            onClick={() => void persistGuestCount(guestCount - 1)}
                            disabled={guestCount <= 0}
                          >
                            -
                          </button>
                          <span className="carta-comensales-count">
                            {guestCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => void persistGuestCount(guestCount + 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="carta-comanda-head-cell--center">
                      <p
                        className="carta-comanda-headline min-w-0 truncate"
                        style={{
                          fontSize: 17,
                          fontWeight: 950,
                          letterSpacing: "-0.01em",
                          textAlign: "center",
                          margin: 0,
                          padding: 0,
                          minWidth: 0,
                          maxWidth: "100%",
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
                    <div className="carta-comanda-head-cell--right">
                      {tpvComandaHeaderTime ? (
                        <span
                          className="carta-comanda-headline-time shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none tracking-tight"
                          style={{ color: tpvComandaHeaderTime.color }}
                        >
                          {tpvComandaHeaderTime.label}
                        </span>
                      ) : null}
                      <div
                        className={
                          viewMode === "normal"
                            ? "flex shrink-0 justify-end md:hidden"
                            : "flex shrink-0 justify-end"
                        }
                      >
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
            <div className="carta-header-compact carta-comanda-header-compact">
              <div className="carta-estados carta-comanda-status-row">
                {tpvComandaEstadosChipsEl}
              </div>
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
              {visibleOrderLines.length === 0 ? (
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
                  <div
                    style={{
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    {([1, 2, 3, 4] as const).map((course) => {
                      const lines = groupedLines[course];
                      if (!lines.length) return null;

                      return (
                        <div key={course} className="carta-comanda-group">
                          <div className="carta-comanda-group-title">
                            {getCourseLabel(course).toUpperCase()}
                          </div>

                          <ul
                            style={{
                              margin: 0,
                              padding: 0,
                              listStyle: "none",
                            }}
                          >
                            {lines.map((line) => {
                              const st = normalizeOrderLineStatus(line.status);
                              if (st === "pending") {
                                return renderComandaLine(line, "Pendiente", {
                                  attachFirstPendingRef:
                                    line.id === linesPending[0]?.id,
                                });
                              }
                              if (st === "sent") {
                                return renderComandaLine(line, "Enviado", {});
                              }
                              if (st === "prepared") {
                                return renderComandaLine(line, "Preparado", {});
                              }
                              if (st === "served") {
                                return renderComandaLine(line, "Servido", {
                                  strike: true,
                                });
                              }
                              return renderComandaLine(line, "Pendiente", {});
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

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
            <div className="carta-tpv-payment-dock-stack">
              <div
                className="carta-tpv-payment-dock-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                <button
                  type="button"
                  className={`carta-comanda-button${
                    isComandaSending
                      ? " opacity-60 cursor-not-allowed"
                      : ""
                  }`}
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
                    border: "1px solid rgba(203, 213, 225, 0.9)",
                    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                    color: "#111827",
                    minHeight: 44,
                    opacity:
                      isComandaSending
                        ? 0.6
                        : order.length === 0 ||
                            !selectedTableId ||
                            !hasPendingItems
                          ? 0.5
                          : 1,
                    filter: comandaSentFlash ? "brightness(1.03)" : "none",
                    transition:
                      "filter 120ms ease, opacity 120ms ease, background-color 120ms ease",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  {comandaSentFlash ? "Comanda enviada" : "Comanda"}
                </button>
                <div
                  className="carta-tpv-dock-pre-ticket-wrap"
                  style={{ minWidth: 0, display: "flex" }}
                >
                  <button
                    type="button"
                    onClick={handlePrintPreTicket}
                    className="carta-tpv-dock-pre-ticket w-full py-3 rounded-xl text-sm font-semibold transition border border-amber-200/80 bg-amber-50/90 text-amber-900 hover:bg-amber-100/95 active:bg-amber-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    style={{ minHeight: 44 }}
                  >
                    Pre-ticket
                  </button>
                </div>
              </div>

              <div
                className="carta-tpv-payment-dock-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
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
                    background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
                    border: "1px solid rgba(203, 213, 225, 0.75)",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  <div className="carta-tpv-payment-dock-total-label">Total</div>
                  <div className="carta-tpv-payment-dock-total-value total-amount">
                    {Number.isFinite(total) ? total.toFixed(2) : "0.00"}{" "}
                    <span className="carta-tpv-payment-dock-total-eur">€</span>
                  </div>
                </div>

                <div
                  className="carta-tpv-dock-cobrar-wrap"
                  style={{ minWidth: 0, display: "flex" }}
                >
                  {selectedTableId ? (
                    <button
                      type="button"
                      className="carta-tpv-dock-cobrar"
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
                        border: "1px solid rgba(56, 189, 248, 0.42)",
                        background:
                          "linear-gradient(180deg, #38bdf8 0%, #0ea5e9 48%, #0284c7 100%)",
                        color: "#fff",
                        boxShadow: "0 4px 16px rgba(14, 165, 233, 0.28)",
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
            <div className="bg-white text-gray-900 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[calc(100vh-32px)] overflow-hidden">
              <div
                className={
                  isSimplePaymentMode
                    ? "flex-1 px-3 sm:px-4 pt-3 pb-3 flex flex-col justify-between"
                    : "flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-3 pt-2 pb-0"
                }
              >
                {isSimplePaymentMode ? (
                  <div className="flex flex-col justify-between min-h-0 flex-1">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm font-semibold text-gray-900 leading-tight">
                        <span className="min-w-0">Cobrar mesa</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-gray-500 normal-case select-none">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                              checked={autoPrintTicket}
                              onChange={(e) =>
                                persistAutoPrintTicket(e.target.checked)
                              }
                            />
                            <span className="whitespace-nowrap">
                              Auto imprimir ticket
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setSoundEnabled((v) => !v)}
                            className="text-[10px] text-gray-500 shrink-0"
                          >
                            🔊 {soundEnabled ? "On" : "Off"}
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const payDisc = calculateFinalTotal(total);
                        const payTotal = payDisc.finalTotal;
                        const remainingDue = roundMoney(
                          Math.max(payTotal - sessionTableAmountPaidSum, 0),
                        );
                        const cardRawTrim = cardReceived.trim();
                        const cardParsedNum = roundMoney(parseMoney(cardReceived));
                        const cashParsedNum = roundMoney(parseMoney(cashReceived));
                        const voucherParsedNum = roundMoney(parseMoney(voucherAmount));
                        const voucherValueUi = voucherParsedNum;
                        const voucherUsedUi = Math.min(voucherValueUi, remainingDue);
                        const voucherRemainingUi = Math.max(
                          voucherValueUi - remainingDue,
                          0,
                        );
                        const receivedCardRaw =
                          cardRawTrim === "" ? 0 : cardParsedNum;
                        const tipRaw =
                          paymentMethod === "card" &&
                          receivedCardRaw > remainingDue
                            ? receivedCardRaw - remainingDue
                            : 0;

                        let receivedDisplay = 0;
                        let changeDisplay = 0;
                        if (paymentMethod === "cash") {
                          receivedDisplay = cashParsedNum;
                          changeDisplay = Math.max(
                            receivedDisplay - remainingDue,
                            0,
                          );
                        } else if (paymentMethod === "card") {
                          receivedDisplay =
                            cardRawTrim === "" ? remainingDue : cardParsedNum;
                          changeDisplay = Math.max(
                            receivedDisplay - remainingDue,
                            0,
                          );
                        } else if (paymentMethod === "voucher") {
                          receivedDisplay = voucherUsedUi;
                          changeDisplay = 0;
                        }

                        let chargePreview = 0;
                        if (paymentMethod === "cash") {
                          chargePreview = cashParsedNum;
                        } else if (paymentMethod === "card") {
                          chargePreview =
                            cardRawTrim === ""
                              ? remainingDue
                              : roundMoney(
                                  Math.min(cardParsedNum, remainingDue),
                                );
                        } else if (paymentMethod === "voucher") {
                          chargePreview = Math.min(
                            voucherParsedNum,
                            remainingDue,
                          );
                        }

                        const willPayRemaining =
                          remainingDue > MONEY_EPS &&
                          chargePreview >= remainingDue - MONEY_EPS;

                        const amtShort = `${chargePreview
                          .toFixed(2)
                          .replace(".", ",")} €`;
                        let confirmLabel = `Cobrar ${amtShort}`;
                        if (
                          willPayRemaining &&
                          sessionTableAmountPaidSum > MONEY_EPS
                        ) {
                          confirmLabel = "Pagar restante";
                        } else if (
                          willPayRemaining &&
                          sessionTableAmountPaidSum <= MONEY_EPS
                        ) {
                          confirmLabel = "Finalizar cuenta";
                        }

                        const appendDigit = (d: string) => {
                          if (paymentMethod === "cash") {
                            setCashReceived((p) => tpvAppendDigit(p, d));
                          } else if (paymentMethod === "card") {
                            setCardReceivedTouched(true);
                            setCardReceived((p) => tpvAppendDigit(p, d));
                          } else if (paymentMethod === "voucher") {
                            setVoucherAmount((p) => tpvAppendDigit(p, d));
                          }
                        };
                        const backspaceDigit = () => {
                          if (paymentMethod === "cash") {
                            setCashReceived((p) => String(p).slice(0, -1));
                          } else if (paymentMethod === "card") {
                            setCardReceivedTouched(true);
                            setCardReceived((p) => String(p).slice(0, -1));
                          } else if (paymentMethod === "voucher") {
                            setVoucherAmount((p) => String(p).slice(0, -1));
                          }
                        };
                        const exactAmountStr = remainingDue
                          .toFixed(2)
                          .replace(".", ",");
                        const setExact = () => {
                          if (paymentMethod === "cash") {
                            setCashReceived(exactAmountStr);
                          } else if (paymentMethod === "card") {
                            setCardReceivedTouched(true);
                            setCardReceived(exactAmountStr);
                          } else if (paymentMethod === "voucher") {
                            setVoucherAmount(exactAmountStr);
                          }
                        };
                        const bumpBy = (delta: number) => {
                          const raw =
                            paymentMethod === "cash"
                              ? cashReceived
                              : paymentMethod === "card"
                                ? cardReceived
                                : voucherAmount;
                          const cur = roundMoney(parseMoney(raw));
                          const next = roundMoney(
                            Math.min(remainingDue, cur + delta),
                          );
                          const s = next.toFixed(2).replace(".", ",");
                          if (paymentMethod === "cash") {
                            setCashReceived(s);
                          } else if (paymentMethod === "card") {
                            setCardReceivedTouched(true);
                            setCardReceived(s);
                          } else if (paymentMethod === "voucher") {
                            setVoucherAmount(s);
                          }
                        };

                        const keypadTouchClass =
                          "min-h-[52px] rounded-2xl border-2 border-slate-200 bg-white text-xl font-bold text-slate-900 shadow-sm active:scale-[0.98] active:bg-slate-50 touch-manipulation select-none";
                        const keypadWideClass = `${keypadTouchClass} col-span-3 min-h-[54px] text-lg`;

                        const inputMoneyClass =
                          "w-full min-h-[52px] border-2 rounded-2xl px-4 text-center text-2xl font-bold tracking-tight text-slate-900 border-slate-200 bg-white touch-manipulation outline-none focus:border-blue-500 focus:ring-0";

                        return (
                          <>
                            {sessionPaymentHistory.length > 0 ? (
                              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Pagos realizados
                                </div>
                                <ul className="space-y-2 max-h-32 overflow-y-auto overscroll-contain pr-0.5">
                                  {sessionPaymentHistory.map((row) => (
                                    <li
                                      key={row.id}
                                      className="flex items-baseline justify-between gap-3 text-base font-semibold text-slate-800"
                                    >
                                      <span className="min-w-0 leading-snug">
                                        <span className="tabular-nums">
                                          {formatTpveurEs(row.amount)}
                                        </span>{" "}
                                        <span className="text-sm font-medium text-slate-500 normal-case">
                                          {paymentMethodLabelEs(row.method)}
                                        </span>
                                      </span>
                                      {row.createdAt != null ? (
                                        <span className="shrink-0 text-sm font-medium text-slate-400 tabular-nums">
                                          {new Date(
                                            row.createdAt,
                                          ).toLocaleTimeString("es-ES", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            <div className="rounded-2xl border-2 border-slate-900/10 bg-slate-900/[0.03] p-4 space-y-4">
                              {sessionTableAmountPaidSum > MONEY_EPS ? (
                                <div className="flex justify-between gap-2 text-sm font-semibold text-slate-500">
                                  <span>Total cuenta</span>
                                  <span className="tabular-nums text-slate-700">
                                    {formatTpveurEs(payTotal)}
                                  </span>
                                </div>
                              ) : null}
                              <div className="space-y-1">
                                <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                                  Pendiente
                                </div>
                                <div className="text-4xl sm:text-5xl font-black tabular-nums leading-none text-slate-900">
                                  {formatTpveurEs(remainingDue)}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                                    Recibido
                                  </div>
                                  <div className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-none text-slate-800">
                                    {formatTpveurEs(receivedDisplay)}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                                    Cambio
                                  </div>
                                  <div
                                    className={`text-3xl sm:text-4xl font-extrabold tabular-nums leading-none ${
                                      changeDisplay > MONEY_EPS
                                        ? "text-emerald-600"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {formatTpveurEs(changeDisplay)}
                                  </div>
                                </div>
                              </div>
                              {paymentMethod === "card" && tipRaw > 0 ? (
                                <div className="text-sm font-semibold text-emerald-700">
                                  Propina / exceso tarjeta:{" "}
                                  {formatTpveurEs(tipRaw)}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                className={`flex-1 min-h-[52px] rounded-2xl text-base font-bold shadow-sm touch-manipulation select-none ${
                                  paymentMethod === "cash"
                                    ? "bg-blue-600 text-white ring-2 ring-blue-600/40"
                                    : "bg-slate-100 text-slate-900 active:bg-slate-200"
                                }`}
                                onClick={() => {
                                  setPaymentMethod("cash");
                                  setCardReceivedTouched(false);
                                  setCashReceived(
                                    (Number.isFinite(remainingDue)
                                      ? remainingDue
                                      : 0
                                    )
                                      .toFixed(2)
                                      .replace(".", ","),
                                  );
                                }}
                              >
                                Efectivo
                              </button>
                              <button
                                type="button"
                                className={`flex-1 min-h-[52px] rounded-2xl text-base font-bold shadow-sm touch-manipulation select-none ${
                                  paymentMethod === "card"
                                    ? "bg-blue-600 text-white ring-2 ring-blue-600/40"
                                    : "bg-slate-100 text-slate-900 active:bg-slate-200"
                                }`}
                                onClick={() => {
                                  setPaymentMethod("card");
                                  setCardReceivedTouched(false);
                                  setCardReceived(
                                    (Number.isFinite(remainingDue)
                                      ? remainingDue
                                      : 0
                                    )
                                      .toFixed(2)
                                      .replace(".", ","),
                                  );
                                }}
                              >
                                Tarjeta
                              </button>
                              <button
                                type="button"
                                className={`flex-1 min-h-[52px] rounded-2xl text-base font-bold shadow-sm touch-manipulation select-none ${
                                  paymentMethod === "voucher"
                                    ? "bg-blue-600 text-white ring-2 ring-blue-600/40"
                                    : "bg-slate-100 text-slate-900 active:bg-slate-200"
                                }`}
                                onClick={() => setPaymentMethod("voucher")}
                              >
                                Voucher
                              </button>
                            </div>

                            {paymentMethod === "card" ? (
                              <input
                                ref={simplePaymentAmountInputRef}
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder="Importe cobrado"
                                value={cardReceived}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  setCardReceivedTouched(true);
                                  setCardReceived(e.target.value);
                                }}
                                className={inputMoneyClass}
                              />
                            ) : null}

                            {paymentMethod === "voucher" ? (
                              <div className="space-y-3">
                                <input
                                  ref={simplePaymentAmountInputRef}
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder="Importe voucher"
                                  value={voucherAmount}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) =>
                                    setVoucherAmount(e.target.value)
                                  }
                                  className={inputMoneyClass}
                                />
                                <input
                                  type="text"
                                  placeholder="Número de voucher"
                                  value={voucherNumber}
                                  onChange={(e) =>
                                    setVoucherNumber(e.target.value)
                                  }
                                  className="w-full min-h-[48px] border-2 rounded-2xl px-4 text-lg font-semibold border-slate-200 bg-white touch-manipulation outline-none focus:border-blue-500"
                                />
                                {voucherLookupBalance != null ? (
                                  <div className="text-base font-medium text-slate-600">
                                    Saldo disponible:{" "}
                                    {voucherLookupBalance
                                      .toFixed(2)
                                      .replace(".", ",")}{" "}
                                    €
                                  </div>
                                ) : null}
                                {voucherValueUi > 0 ? (
                                  <div className="text-base text-slate-600">
                                    Usado:{" "}
                                    {voucherUsedUi
                                      .toFixed(2)
                                      .replace(".", ",")}{" "}
                                    €
                                    {voucherRemainingUi > 0 ? (
                                      <span className="text-amber-700 font-semibold">
                                        {" "}
                                        · Restante en voucher:{" "}
                                        {voucherRemainingUi
                                          .toFixed(2)
                                          .replace(".", ",")}{" "}
                                        €
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {paymentMethod === "cash" ? (
                              <div className="space-y-2">
                                <input
                                  ref={simplePaymentAmountInputRef}
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  autoComplete="off"
                                  spellCheck={false}
                                  value={cashReceived}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) =>
                                    setCashReceived(e.target.value)
                                  }
                                  placeholder="0,00"
                                  aria-label="Importe recibido en efectivo"
                                  className={inputMoneyClass}
                                />
                              </div>
                            ) : null}

                            {paymentMethod === "cash" ||
                            paymentMethod === "card" ||
                            paymentMethod === "voucher" ? (
                              <div className="space-y-2.5 pt-1">
                                <div className="grid grid-cols-3 gap-2.5">
                                  {(
                                    [
                                      "1",
                                      "2",
                                      "3",
                                      "4",
                                      "5",
                                      "6",
                                      "7",
                                      "8",
                                      "9",
                                    ] as const
                                  ).map((k) => (
                                    <button
                                      key={k}
                                      type="button"
                                      className={keypadTouchClass}
                                      onClick={() => appendDigit(k)}
                                    >
                                      {k}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-3 gap-2.5">
                                  <button
                                    type="button"
                                    className={keypadTouchClass}
                                    onClick={() => appendDigit("0")}
                                  >
                                    0
                                  </button>
                                  <button
                                    type="button"
                                    className={keypadTouchClass}
                                    onClick={() => appendDigit(",")}
                                  >
                                    ,
                                  </button>
                                  <button
                                    type="button"
                                    className={keypadTouchClass}
                                    onClick={() => appendDigit("00")}
                                  >
                                    00
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className={keypadWideClass}
                                  onClick={backspaceDigit}
                                >
                                  ⌫ Borrar
                                </button>
                                <div className="grid grid-cols-3 gap-2.5">
                                  <button
                                    type="button"
                                    className={keypadTouchClass}
                                    onClick={() => bumpBy(5)}
                                  >
                                    +5 €
                                  </button>
                                  <button
                                    type="button"
                                    className={keypadTouchClass}
                                    onClick={() => bumpBy(10)}
                                  >
                                    +10 €
                                  </button>
                                  <button
                                    type="button"
                                    className={`${keypadTouchClass} bg-blue-50 border-blue-200 text-blue-900`}
                                    onClick={setExact}
                                  >
                                    Exacto
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            <button
                              type="button"
                              disabled={
                                paymentMethod === null ||
                                !isPaymentValid(remainingDue) ||
                                isConfirmingPayment
                              }
                              className="w-full min-h-[56px] rounded-2xl text-lg font-bold shadow-md touch-manipulation select-none disabled:opacity-60 disabled:cursor-not-allowed"
                              style={{
                                background:
                                  paymentMethod === null ||
                                  !isPaymentValid(remainingDue) ||
                                  isConfirmingPayment
                                    ? "rgba(148,163,184,0.55)"
                                    : "#2563eb",
                                color: "#fff",
                              }}
                              onClick={() => {
                                if (
                                  paymentMethod === null ||
                                  isConfirmingPayment
                                )
                                  return;
                                void (async () => {
                                  setIsConfirmingPayment(true);
                                  try {
                                    await handleConfirmPayment();
                                  } finally {
                                    setIsConfirmingPayment(false);
                                  }
                                })();
                              }}
                            >
                              {isConfirmingPayment
                                ? "Registrando…"
                                : confirmLabel}
                            </button>

                            <div className="mt-2 rounded-2xl border-2 border-gray-200 bg-gray-50 p-3 space-y-2.5">
                              <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                Ajustes
                              </div>

                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Invitación (€)"
                                  value={discountAmount}
                                  onChange={(e) =>
                                    setDiscountAmount(e.target.value)
                                  }
                                  className="flex-1 min-h-[44px] border rounded-xl px-2 text-sm bg-white"
                                />
                                <input
                                  type="text"
                                  placeholder="Descuento (%)"
                                  value={discountPercent}
                                  onChange={(e) =>
                                    setDiscountPercent(e.target.value)
                                  }
                                  className="flex-1 min-h-[44px] border rounded-xl px-2 text-sm bg-white"
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-gray-700">
                                  Factura
                                </span>
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 accent-blue-600 shrink-0 touch-manipulation"
                                  checked={isInvoice}
                                  onChange={(e) =>
                                    setIsInvoice(e.target.checked)
                                  }
                                />
                              </div>

                              {isInvoice ? (
                                <div className="grid gap-2">
                                  <input
                                    placeholder="Nombre / Empresa"
                                    className="input-base !py-2 !text-sm min-h-[44px]"
                                    value={invoiceName}
                                    onChange={(e) =>
                                      setInvoiceName(e.target.value)
                                    }
                                  />
                                  <input
                                    placeholder="NIF / CIF"
                                    className="input-base !py-2 !text-sm min-h-[44px]"
                                    value={invoiceTaxId}
                                    onChange={(e) =>
                                      setInvoiceTaxId(e.target.value)
                                    }
                                  />
                                  <input
                                    placeholder="Email"
                                    className="input-base !py-2 !text-sm min-h-[44px]"
                                    value={invoiceEmail}
                                    onChange={(e) =>
                                      setInvoiceEmail(e.target.value)
                                    }
                                  />
                                </div>
                              ) : null}

                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  className="flex-1 min-h-[48px] rounded-xl text-sm font-bold bg-white text-gray-900 border border-gray-200 active:bg-gray-100 touch-manipulation"
                                  onClick={handlePrintPreTicket}
                                >
                                  Pre-ticket
                                </button>
                                <button
                                  type="button"
                                  className="flex-1 min-h-[48px] rounded-xl text-sm font-bold bg-white text-gray-900 border border-gray-200 active:bg-gray-100 touch-manipulation"
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
                                className="w-full min-h-[52px] rounded-2xl font-bold bg-white text-gray-800 text-base border-2 border-gray-200 active:bg-gray-100 touch-manipulation"
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
                                  setSessionTableAmountPaidSum(0);
                                  setSessionPaymentHistory([]);
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
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm font-semibold mb-0.5 text-gray-900 leading-tight">
                      <span className="min-w-0">
                        {isSplitMode ? "Dividir cuenta" : "Cobrar mesa"}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] font-medium text-gray-500 normal-case select-none">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                            checked={autoPrintTicket}
                            onChange={(e) =>
                              persistAutoPrintTicket(e.target.checked)
                            }
                          />
                          <span className="whitespace-nowrap">
                            Auto imprimir ticket
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setSoundEnabled((v) => !v)}
                          className="text-[10px] text-gray-500 shrink-0"
                        >
                          🔊 {soundEnabled ? "On" : "Off"}
                        </button>
                      </div>
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
                                    onFocus={(e) => e.currentTarget.select()}
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
                                  onFocus={(e) => e.currentTarget.select()}
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

                                try {
                                  const breakdown = calculateFinalTotal(selectedTotal);
                                  await dbgAddDoc(
                                    collection(db, "payments"),
                                    {
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
                                  },
                                    {
                                      label: "carta:splitByItemsPayment",
                                      collection: "payments",
                                      restaurantId,
                                      tableId: selectedTableId || selectedTable?.id || null,
                                      orderId: orderIdFromUrl ?? null,
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

                                  finishPaymentAndReturnToMap(
                                    tableIdToFinish ?? selectedTableId ?? null,
                                  );
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
                                  onFocus={(e) => e.currentTarget.select()}
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
                                onFocus={(e) => e.currentTarget.select()}
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
                    const remainingDue = roundMoney(
                      Math.max(payTotal - sessionTableAmountPaidSum, 0),
                    );
                    const received = Number(cashReceived.replace(",", "."));
                    const change = Math.max(received - remainingDue, 0);
                    const hasPartialPayments = paidSplitItemIds.length > 0;
                    const receivedCardRaw = Number(cardReceived.replace(",", ".") || 0);
                    const tipRaw =
                      receivedCardRaw > remainingDue
                        ? receivedCardRaw - remainingDue
                        : 0;
                    const voucherValueUi = parseMoney(voucherAmount);
                    const voucherUsedUi = Math.min(voucherValueUi, remainingDue);
                    const voucherRemainingUi = Math.max(voucherValueUi - remainingDue, 0);
                    const receivedCard =
                      cardReceived.trim() === ""
                        ? remainingDue
                        : Number(cardReceived.replace(",", ".") || 0);

                    return (
                      <div style={{ display: "grid", gap: 5 }}>
                        {sessionTableAmountPaidSum > MONEY_EPS ? (
                          <div className="text-[11px] text-gray-700 leading-tight space-y-0.5">
                            <div>Total cuenta: {payTotal.toFixed(2)} €</div>
                            <div className="text-emerald-700 font-semibold">
                              Cobrado: {sessionTableAmountPaidSum.toFixed(2)} €
                            </div>
                            <div className="text-red-700 font-bold">
                              Pendiente: {remainingDue.toFixed(2)} €
                            </div>
                          </div>
                        ) : null}
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
                                (Number.isFinite(remainingDue) ? remainingDue : 0).toFixed(2),
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
                            onClick={() => {
                              setPaymentMethod("card");
                              setCardReceivedTouched(false);
                              setCardReceived(
                                (Number.isFinite(remainingDue) ? remainingDue : 0).toFixed(2),
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
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setCashReceived(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm px-2 py-1 border rounded-md text-center leading-tight"
                                style={{ borderColor: "rgba(15,23,42,0.14)", outline: "none" }}
                              />
                            </label>

                            {Number.isFinite(received) && received >= remainingDue && (
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
                              onFocus={(e) => e.currentTarget.select()}
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
                            disabled={!isPaymentValid(remainingDue) || hasPartialPayments}
                            className={`w-full py-2 rounded-md text-xs font-semibold shadow ${
                              hasPartialPayments ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                            style={{
                              background: !isPaymentValid(remainingDue) || hasPartialPayments
                                ? "rgba(148,163,184,0.55)"
                                : "#2563eb",
                              color: "#fff",
                              cursor:
                                !isPaymentValid(remainingDue) || hasPartialPayments
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            onClick={() => {
                              if (hasPartialPayments) return;
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
                      setSessionTableAmountPaidSum(0);
                      setSessionPaymentHistory([]);
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
                onClick={() => {}}
              >
                Imprimir ticket
              </button>

              {lastPaymentInfo?.invoiceNumber && (
                <button
                  className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg text-sm"
                  onClick={() => {}}
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
            data-products-empty={
              !showAuthSpinner &&
              !showProductsSpinner &&
              !error &&
              !hasVisibleProductsForCurrentMenu
                ? "true"
                : undefined
            }
            style={{
              padding: 12,
              boxSizing: "border-box",
              borderRadius: 16,
              background:
                "linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%)",
              border: "1px solid rgba(203, 213, 225, 0.65)",
              boxShadow:
                "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 28px rgba(15, 23, 42, 0.05)",
              minHeight: 0,
            }}
          >
            <div className="carta-mobile-products-scroll-shell">
              <div className="carta-main-fixed">
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                products.length > 0 && (
                  <>
                    <div className="mb-1.5 flex w-full flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
                      <div
                        role="tablist"
                        aria-label={t("cartaTpv.menuGroupAria")}
                        className="w-full shrink-0 md:max-w-[320px]"
                        style={{
                          display: "flex",
                          width: "100%",
                          maxWidth: 320,
                          padding: 3,
                          boxSizing: "border-box",
                          borderRadius: 12,
                          background: "rgba(255, 255, 255, 0.82)",
                          border: "1px solid rgba(203, 213, 225, 0.75)",
                          gap: 4,
                          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
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
                                ? "linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(224, 242, 254, 0.75) 100%)"
                                : "transparent",
                              color: active ? "#0f172a" : "#64748b",
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
                      <div className="hidden shrink-0 md:flex md:items-center md:justify-end">
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
                            border: "1px solid rgba(226, 232, 240, 0.95)",
                            background: isSelected
                              ? "linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(224, 242, 254, 0.82) 100%)"
                              : "rgba(255, 255, 255, 0.65)",
                            color: isSelected ? "#0f172a" : "#64748b",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            boxSizing: "border-box",
                            lineHeight: 1.1,
                            minHeight: 34,
                            boxShadow: isSelected
                              ? "0 1px 3px rgba(15, 23, 42, 0.05)"
                              : "none",
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
                products.length === 0 &&
                visibleOrderLines.length > 0 && (
                  <div className="carta-products-empty-state">
                    No hay productos activos
                  </div>
                )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                products.length > 0 &&
                !hasVisibleProductsForCurrentMenu &&
                visibleOrderLines.length > 0 && (
                  <div className="carta-products-empty-state">
                    No hay productos visibles en esta categoría
                  </div>
                )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !error &&
                hasVisibleProductsForCurrentMenu && (
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
                                  color: "#64748b",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  opacity: 1,
                                }}
                              >
                                {catName}
                              </h3>
                            ) : null}

                            <div className="carta-product-grid">
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
                                    }${isActive ? " scale-95 ring-2 ring-sky-200/70 bg-sky-50/90" : ""}${
                                      holdingProductId === product.id ? " holding" : ""
                                    }${hasSent ? " has-sent" : ""}`}
                                    type="button"
                                    onClick={(e) => {
                                      if (touchMovedRef.current) return;

                                      const start = productPointerStartRef.current;

                                      if (
                                        productPointerMovedClickBlockRef.current ===
                                          product.id ||
                                        (start?.productId === product.id && start.moved)
                                      ) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        productPointerMovedClickBlockRef.current = null;
                                        productPointerStartRef.current = null;
                                        return;
                                      }

                                      productPointerMovedClickBlockRef.current = null;
                                      productPointerStartRef.current = null;

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
                                      handleQuickAdd(product);
                                      activeProductTimeoutRef.current = window.setTimeout(() => {
                                        setActiveProductId(null);
                                      }, 120);
                                    }}
                                    onTouchStart={(e) => {
                                      touchMovedRef.current = false;
                                      touchStartYRef.current = e.touches[0]?.clientY ?? 0;
                                    }}
                                    onTouchMove={(e) => {
                                      const y = e.touches[0]?.clientY;
                                      if (y == null) return;
                                      const diff = Math.abs(y - touchStartYRef.current);
                                      if (diff > 10) {
                                        touchMovedRef.current = true;
                                        clearProductInfoLongPressTimer();
                                      }
                                    }}
                                    onPointerDown={(e) => {
                                      if (e.pointerType === "mouse" && e.button !== 0) return;
                                      productPointerMovedClickBlockRef.current = null;
                                      productPointerStartRef.current = {
                                        productId: product.id,
                                        x: e.clientX,
                                        y: e.clientY,
                                        moved: false,
                                      };
                                      clearRepeatAndHoldGesture();
                                      clearProductInfoLongPressTimer();
                                      productInfoLongPressTimerRef.current = window.setTimeout(() => {
                                        productInfoLongPressTimerRef.current = null;
                                        setQuickProductInfo(product);
                                        suppressClickUntilByProductIdRef.current[product.id] =
                                          Date.now() + 900;
                                        stopHoldAdd();
                                        clearRepeatAndHoldGesture();
                                      }, 1000);
                                    }}
                                    onPointerMove={(e) => {
                                      const start = productPointerStartRef.current;
                                      if (!start || start.productId !== product.id) return;
                                      const dx = Math.abs(e.clientX - start.x);
                                      const dy = Math.abs(e.clientY - start.y);
                                      if (dx > 8 || dy > 8) {
                                        start.moved = true;
                                        clearProductInfoLongPressTimer();
                                      }
                                    }}
                                    onPointerUp={() => {
                                      clearProductInfoLongPressTimer();
                                      const start = productPointerStartRef.current;
                                      if (start?.productId === product.id) {
                                        productPointerMovedClickBlockRef.current =
                                          start.moved ? product.id : null;
                                      }
                                      productPointerStartRef.current = null;
                                      clearRepeatAndHoldGesture();
                                    }}
                                    onPointerLeave={() => {
                                      clearProductInfoLongPressTimer();
                                      const start = productPointerStartRef.current;
                                      if (start?.productId === product.id) {
                                        productPointerMovedClickBlockRef.current =
                                          start.moved ? product.id : null;
                                      }
                                      productPointerStartRef.current = null;
                                      clearRepeatAndHoldGesture();
                                    }}
                                    onPointerCancel={() => {
                                      clearProductInfoLongPressTimer();
                                      const start = productPointerStartRef.current;
                                      if (start?.productId === product.id && start.moved) {
                                        productPointerMovedClickBlockRef.current = product.id;
                                      }
                                      productPointerStartRef.current = null;
                                      clearRepeatAndHoldGesture();
                                    }}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      stopHoldAdd();
                                      holdActiveProductIdRef.current = product.id;
                                      holdDidRepeatRef.current = false;
                                      holdTimeoutRef.current = window.setTimeout(() => {
                                        if (holdActiveProductIdRef.current !== product.id) return;
                                        holdDidRepeatRef.current = true;
                                        handleQuickAdd(product);
                                        holdIntervalRef.current = window.setInterval(() => {
                                          if (holdActiveProductIdRef.current !== product.id) return;
                                          handleQuickAdd(product);
                                        }, 120);
                                      }, 1050);
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
                                        handleQuickAdd(product);
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
                                              ? "Pase: Primero"
                                              : course === 3
                                                ? "Pase: Segundo"
                                                : course === 4
                                                  ? "Pase: Postre"
                                                  : `Pase ${course}`
                                        }
                                      >
                                        {course === 1
                                          ? "E"
                                          : course === 2
                                            ? "P"
                                            : course === 3
                                              ? "S"
                                              : course === 4
                                                ? "D"
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
                                        className="text-xs font-semibold leading-tight text-center line-clamp-2 text-slate-800"
                                        title={product.nombre}
                                      >
                                        {product.nombre}
                                      </div>
                                    </div>
                                    <div className="h-5 shrink-0 text-sm font-extrabold text-center w-full text-slate-900 tabular-nums">
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

      {isOffline ? (
        <div
          className="pointer-events-none fixed bottom-3 left-3 z-[38] max-w-[min(18rem,calc(100vw-1.5rem))]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-md border border-amber-500/40 bg-slate-950/88 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-100 shadow-md backdrop-blur-[2px]">
            Sin conexión. Mostrando datos locales.
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

      {tableClosedFeedback && !closingFeedback && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-green-600 px-4 py-2 text-sm text-white shadow-lg">
          Mesa cerrada
        </div>
      )}

      {sentFeedbackMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white text-sm px-4 py-2 rounded-full shadow">
            {sentFeedbackMessage}
          </div>
        </div>
      )}
    </div>
  );
}
