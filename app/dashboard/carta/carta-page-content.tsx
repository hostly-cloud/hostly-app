"use client";

import {
  addDoc,
  arrayUnion,
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
import { useActiveOperator } from "@/components/tpv/active-operator-context";
import { ActiveOperatorTopBarButton } from "@/components/tpv/active-operator-top-bar-button";
import { PaymentBillingSection } from "@/components/tpv/payment/payment-billing-section";
import { PaymentModalAdjustmentsSection } from "@/components/tpv/payment/payment-modal-adjustments-section";
import { BillingInvoiceCompletionPanel } from "@/components/tpv/payment/billing-invoice-completion-panel";
import { createBillingInvoiceFromPayment } from "@/lib/billing/create-billing-invoice-from-payment";
import { mapTpvOrderLinesToBillingLines } from "@/lib/billing/map-tpv-order-lines-to-billing-lines";
import { HostlyBackButton } from "@/components/hostly/back-button";
import { HostlyMiniIconButton } from "@/components/hostly/mini-icon-button";
import {
  formatTpvActiveLayoutLabel,
  useFloorPlanLayoutsConfig,
} from "@/hooks/useFloorPlanLayoutsConfig";
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
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { compareOperationalProducts } from "@/lib/carta/product-sort-order";
import {
  clampComandaPanelWidthPct,
  COMANDA_PANEL_WIDTH_DEFAULT,
  COMANDA_PANEL_WIDTH_MAX,
  COMANDA_PANEL_WIDTH_MIN,
} from "@/lib/tpv/comanda-panel-width-preference";
import type { TableOperatorAssignment } from "@/lib/tpv/table-operator-assignment";
import type { ActiveOperatorSession } from "@/lib/tpv/active-operator-session";
import { clearOperacionTpvUrlParams } from "@/lib/tpv/clear-operacion-tpv-url";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import {
  buildTpvInventoryProductsById,
  getStockWarningLabel,
  resolveProductStockWarning,
  stockWarningBadgeClassName,
  type StockWarningLevel,
} from "@/lib/inventory/tpv-stock-warnings";
import { hostlyHighlightOrderLineElementId } from "@/lib/inventory/product-timeline";
import { scheduleScrollAndHighlightById } from "@/lib/ui/scroll-and-highlight";
import { DeepLinkContextNotice } from "@/components/inventario/deep-link-out-of-window-notice";
import {
  buildTpvLineInventoryCostSnapshot,
  calculateTpvLineInventoryCost,
  formatInventoryCost,
  formatInventoryCostSnapshot,
  inventoryCostSnapshotToFirestore,
  parseFirestoreLineInventoryCost,
  type CartOrderLineInventoryCost,
} from "@/lib/inventory/tpv-line-cost";
import {
  isTpvDrinkProduct,
  resolveTpvMenuGroup,
  resolveTpvMenuGroupFromCategoryName,
  type TpvMenuGroup,
} from "@/lib/carta/tpv-menu-group";
import {
  computeBillableTotalFromOrderDocLike,
  isOrderStatusActiveForTableOccupancy,
  orderDocHasActiveLinesForMapOccupancy,
  readOrderCreatedAtMs,
  readOrderUpdatedAtMs,
} from "@/lib/firestore/order-table-occupancy";
import {
  fetchOpenOrderForTable,
} from "@/lib/firestore/open-orders-same-table";
import { mergeOpenOrdersForTableGroup } from "@/lib/firestore/merge-table-group-orders";
import {
  logTableJoinMerge,
  TABLE_GROUP_ORDERS_MERGED_EVENT,
  TABLE_GROUP_ORDERS_SPLIT_EVENT,
  type TableGroupOrdersMergedDetail,
  type TableGroupOrdersSplitDetail,
} from "@/lib/firestore/table-join-merge-diagnostic";
import { persistOpenOrderForTable } from "@/lib/firestore/persist-open-order-for-table";
import { syncOrderItemsViaApi } from "@/lib/firestore/sync-order-items-via-api";
import {
  autoCloseTableViaApi,
  chargeOrderViaApi,
  closeOrderViaApi,
  compLineViaApi,
  patchOrderMetadataViaApi,
  removeLineUnitViaApi,
  transitionLineStatusViaApi,
  voidPaymentViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";
import type { TpvOrderItemsOperation } from "@/lib/server/tpv/order-mutation-contract";
import {
  cartLinesProductionSnapshotEqual,
  mergeLocalLinesProductionFromServerItems,
} from "@/lib/carta/sync-open-order-lines-from-server";
import {
  assignTableOperatorOnFirstOpen,
  clearTableOperatorAssignment,
  tableOperatorAssignmentClearFields,
} from "@/lib/firestore/table-operator-assignment";
import { handlePayTableOrder } from "@/lib/firestore/pay-table-order";
import {
  buildActivityMetadata,
  createActivityLog,
} from "@/lib/firestore/activity-log";
import {
  filterTablesForTpvMap,
  listenTablesByRestaurantId,
  isDecorativePlanElementType,
  readTableDinersCount,
  sortTablesForTpvMap,
  TABLE_MAP_STATUS_OCCUPIED,
  type Table,
} from "@/lib/firestore/tables";
import {
  effectiveTableFloorPlanId,
  entityBelongsToFloorPlan,
  listenFloorPlansByRestaurantId,
  resolveFloorPlanCanvasSize,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import {
  filterTpvOperationalViewportFitElements,
  TPV_OPERATIONAL_FIT_OFFSET_X,
  TPV_OPERATIONAL_FIT_OFFSET_Y,
  TPV_OPERATIONAL_FIT_PADDING_PX,
  TPV_OPERATIONAL_FIT_ZOOM_MAX_DESKTOP,
  TPV_OPERATIONAL_FIT_ZOOM_MAX_MOBILE,
  TPV_OPERATIONAL_FINAL_ZOOM_MULTIPLIER,
} from "@/lib/map/tpv-operational-map-visual";
import { listenZonesByRestaurantId, type Zone } from "@/lib/firestore/zones";
import {
  getUsersByRestaurant,
  RestaurantRosterError,
  type RestaurantRosterErrorKind,
} from "@/lib/firestore/users";
import {
  EditableFloorMap,
  getPlanElementBaseVisualStyle,
} from "@/components/map/EditableFloorMap";
import { SalaEditorReadonlyMap } from "@/components/sala-editor/readonly/sala-editor-readonly-map";
import { PinchZoomMap } from "./_components/pinch-zoom-map";
import { ElementCard } from "@/components/map/element-map-card";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { loadSalaEditorDraft } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { buildEditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import type { SalaEditorReadonlyTpvOperationalState } from "@/components/sala-editor/readonly/sala-editor-readonly-operational-layer";
import {
  buildTableOperationalVisualInput,
  computeMapVisualPriorityLevel,
} from "@/lib/map/build-table-operational-visual-input";
import {
  resolveTableOperationalVisualState,
  type TableOperationalVisualState,
} from "@/lib/map/table-operational-state";
import { projectOperationalElement } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import {
  listenReservationsForDate,
  type Reservation,
} from "@/lib/firestore/reservations";
import {
  resolveKdsDestination,
  type KdsDestination,
} from "@/lib/kds/kds-destination";
import {
  isPendingMarchPostresLine,
  isPendingMarchPrimeroLine,
  isPendingMarchSegundosLine,
  isTpvComandaLineHeldForMarch,
  resolveComandaLineKdsDestination,
  resolveComandaLineStationFields,
  selectLinesToReleaseOnComanda,
  type ComandaReleaseAction,
} from "@/lib/carta/comanda-line-release";
import { resolveComandaNoAutoReleaseFeedback } from "@/lib/carta/comanda-send-feedback";
import {
  readComandaLineCourseFromFirestoreRecord,
  resolveComandaLineCourseNum,
  resolveEffectiveComandaLineCourse,
  resolveProductDefaultCourse,
} from "@/lib/carta/comanda-line-course";
import {
  resolveOperationalLineFieldsForCartLine,
  resolveOperationalLineFieldsFromProduct,
} from "@/lib/carta/operational-line-fields-phase1";
import {
  detectPendingMarchPassAlerts,
  resolvePendingMarchPassMapHint,
  type PendingMarchPassAlert,
} from "@/lib/carta/pending-march-pass-alert";
import {
  readOperationStationFieldsFromFirestoreRecord,
  readStationFieldsFromFirestoreRecord,
  operationStationFieldsToFirestorePayload,
  resolveDisplayPreparationAreaForCartLine,
  resolveOperationStationFieldsForCartLine,
  resolveOperationStationFieldsFromProduct,
  resolveStationFieldsFromProduct,
  stationFieldsToFirestorePayload,
  warnDevIfSentLineMissingStation,
  type OrderLinePreparationArea,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";
import type { Product } from "@/types/product";
import type { BillingCustomer } from "@/types/billing-customer";
import type { BillingInvoice } from "@/types/billing-invoice";
import { getPrinterConfig } from "@/lib/firestore/printer-config";
import {
  cancelPrintJobsForOrderLine,
  createPrintJobsForComandaLines,
} from "@/lib/firestore/print-jobs";
import {
  applyCreatedStockMovements,
  createStockMovementsForRecipeConsumption,
  createStockReversalMovementsForModifierConsumption,
  createStockReversalMovementsForRecipeConsumption,
} from "@/lib/firestore/stock-movements";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import { listenModifierGroups } from "@/lib/firestore/modifier-groups";
import { listenOperationStations } from "@/lib/firestore/operation-stations";
import { listProductionStations } from "@/lib/firestore/production-stations";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import {
  buildProductResolverParityContextFromProduct,
  type ProductResolverParityCatalogSources,
} from "@/lib/productos/product-operational-routing-audit";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import {
  buildCartLineDisplayName,
  buildCartLineModifierSubtitle,
  cartLineModifiersMergeKey,
  parseFirestoreSelectedModifiers,
  resolveActiveEffectiveModifierGroups,
  resolveCategoryForProduct,
  resolveLineModifierTotal,
  resolveOrderLineModifierPresentation,
  selectedModifiersToFirestorePayload,
  type CartOrderLineSelectedModifier,
} from "@/lib/modifiers/cart-order-modifiers";
import { TpvProductModifiersModal } from "./_components/tpv-product-modifiers-modal";
import { TpvLineGestureRow } from "./_components/tpv/tpv-line-gesture-row";
import {
  TpvQuickActionsMenu,
  type TpvQuickActionItem,
} from "./_components/tpv/tpv-quick-actions-menu";
import { TpvTablePresenceIndicators } from "./_components/tpv/tpv-table-presence-indicators";
import {
  Beer,
  MapPin,
  Martini,
  type LucideIcon,
} from "lucide-react";
import { useTablePresenceHeartbeat } from "@/hooks/useTablePresenceHeartbeat";
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { capabilityDeniedTitle } from "@/components/auth/capability-guard";
import { confirmCriticalActionIfUnstable } from "@/lib/client/connectivity-critical-action";
import { ConnectivityStatusPill } from "@/components/system/connectivity-status-pill";
import { computeTpvRushMode } from "./_components/tpv/tpv-rush-mode";
import {
  TpvInlineMixerChips,
  buildMixerSelectionForLine,
  lineShowsInlineMixerPicker,
  resolveSimpleMixerGroup,
} from "./_components/tpv/tpv-inline-mixer-chips";

const AUTO_PRINT_TICKET_STORAGE_KEY = "hostly:autoPrintTicket";

function parseStoredGuestCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  return null;
}

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

const COMANDA_DESTINATION_LABEL: Record<KdsDestination, string> = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
  none: "—",
};

/** Badge de destino en comanda TPV: prioriza estación configurada del producto/línea. */
function resolveComandaLineDestinationBadge(line: CartOrderLine): {
  label: string;
  useBarStyle: boolean;
} {
  const opFields = resolveOperationStationFieldsForCartLine(line);
  const stationFields = resolveComandaLineStationFields(line);
  const dest = resolveKdsDestination({
    station: stationFields.station,
    preparationArea: stationFields.preparationArea,
    categoria: line.product.categoria,
    categoryName: line.product.categoria,
    name: line.product.nombre,
    nombre: line.product.nombre,
  });
  const useBarStyle = dest === "bar" || dest === "cocktail";
  const opName = opFields.operationStationName?.trim();
  if (opName) {
    return { label: opName, useBarStyle };
  }
  return { label: COMANDA_DESTINATION_LABEL[dest], useBarStyle };
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
const MAP_MY_TABLES_SCOPE_STORAGE_KEY = "hostly.carta.mapMyTablesScope";
const OPERATOR_CHANGE_NAV_RESET_KEY = "hostly.tpv.operatorNavReset";
const TPV_OPERATOR_PICKER_POST_ACTION_DELAY_MS = 300;

function readStoredMapMyTablesScope(): "all" | "mine" {
  if (typeof window === "undefined") return "all";
  try {
    const v = localStorage.getItem(MAP_MY_TABLES_SCOPE_STORAGE_KEY);
    if (v === "all" || v === "mine") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

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

function mapAlertDotFromOperationalState(
  state: TableOperationalVisualState,
): "critical" | "attention" | null {
  if (state === "critica") return "critical";
  if (state === "atencion" || state === "retrasada") return "attention";
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

type OrderLineStatus =
  | "pending"
  | "sent"
  | "preparing"
  | "prepared"
  | "served"
  | "cancelled";

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
  cancelledBy?: string | null;
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
  /** Estación canónica (catálogo central); opcional en líneas legacy. */
  station?: OrderLineStation;
  /** Área operativa TPV/KDS; opcional en líneas legacy. */
  preparationArea?: OrderLinePreparationArea;
  /** Estación operativa configurable; metadata para KDS/impresión futura. */
  operationStationId?: string;
  operationStationName?: string;
  /** Modificadores elegidos en TPV (formato, mixer, etc.). */
  selectedModifiers?: CartOrderLineSelectedModifier[];
  /** Suma de priceDelta de selectedModifiers. */
  modifierTotal?: number;
  /** Nombre visible en comanda/KDS (p. ej. "Law · Tónica"). */
  displayName?: string;
  /** Coste de inventario estimado (snapshot al enviar comanda). */
  inventoryCost?: CartOrderLineInventoryCost;
  /** `orderItems/{id}` creado al enviar comanda; enlace directo para cancelación/KDS. */
  orderItemDocId?: string;
  /** Procedencia explícita al unir mesas; permite separar sin inferir por nombre/posición. */
  tableGroupSourceTableId?: string;
  tableGroupSourceOrderId?: string;
};

const CARTA_PRESET_EXTRAS: readonly CartOrderLineExtra[] = [];

function normalizeComandaCourseForStorage(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(4, Math.max(1, Math.floor(n)));
}

/** Etiqueta corta de pase para chip TPV (solo presentación). */
function comandaCoursePassChipLabel(rawCourse: unknown): string {
  const course = normalizeComandaCourseForStorage(rawCourse);
  if (course === undefined) return "S/P";
  if (course === 1) return "ENTR.";
  if (course === 2) return "1º";
  if (course === 3) return "2º";
  if (course === 4) return "POST.";
  return "S/P";
}

function comandaCoursePassChipAriaLabel(rawCourse: unknown): string {
  const course = normalizeComandaCourseForStorage(rawCourse);
  if (course === undefined) return "Sin pase";
  if (course === 1) return "Entrante";
  if (course === 2) return "Primero";
  if (course === 3) return "Segundo";
  if (course === 4) return "Postre";
  return "Sin pase";
}

function comandaCoursePassChipStyle(): CSSProperties {
  return {
    background: "rgba(100, 116, 139, 0.17)",
    color: "#475569",
    border: "1px solid rgba(100, 116, 139, 0.34)",
  };
}

function isActiveComandaLineForOps(line: CartOrderLine): boolean {
  return normalizeOrderLineStatus(line.status) !== "cancelled";
}

function isComandaKitchenLine(line: CartOrderLine): boolean {
  return resolveComandaLineKdsDestination(line) === "kitchen";
}

function isComandaBebidaLine(line: CartOrderLine): boolean {
  const dest = resolveComandaLineKdsDestination(line);
  return dest === "bar" || dest === "cocktail";
}

function comandaLineCourseNum(line: CartOrderLine): number {
  return resolveComandaLineCourseNum(line);
}

function enrichCartLineCourseFromCatalog(
  line: CartOrderLine,
  catalogById: ReadonlyMap<string, { course?: number | null }>,
): CartOrderLine {
  if (normalizeComandaCourseForStorage(line.course) != null) return line;
  const doc = catalogById.get(line.product.id);
  if (!doc || doc.course === undefined) return line;
  const enrichedProduct: Product = { ...line.product, course: doc.course };
  const effective = resolveEffectiveComandaLineCourse({
    course: line.course,
    product: enrichedProduct,
  });
  if (effective == null) {
    return { ...line, product: enrichedProduct };
  }
  return { ...line, product: enrichedProduct, course: effective };
}

function lineCourseToPaseDraft(line: CartOrderLine): 0 | 1 | 2 | 3 | 4 {
  const u = resolveEffectiveComandaLineCourse(line);
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
  const c = resolveEffectiveComandaLineCourse(line);
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

const TPV_PRE_ADD_QUANTITY_MAX = 99;

function normalizeTpvPreAddQuantity(value: unknown): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.min(numeric, TPV_PRE_ADD_QUANTITY_MAX);
}

function normalizeOrderLineStatus(raw: unknown): OrderLineStatus {
  if (
    raw === "pending" ||
    raw === "sent" ||
    raw === "preparing" ||
    raw === "prepared" ||
    raw === "served" ||
    raw === "cancelled"
  )
    return raw;
  if (raw === "ready") return "prepared";
  if (raw === "new" || raw == null) return "pending";
  return "pending";
}

function isSentBucketOrderLineStatus(status: OrderLineStatus): boolean {
  return status === "sent" || status === "preparing";
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

function comandaHeldForMarchBadgeStyle(): CSSProperties {
  return {
    background: "rgba(245, 158, 11, 0.22)",
    color: "#92400e",
    border: "1px solid rgba(245, 158, 11, 0.4)",
  };
}

function comandaLineRowBgHeldForMarch(opts: { hover: boolean }): string {
  if (opts.hover) return "rgba(245, 158, 11, 0.12)";
  return "rgba(245, 158, 11, 0.06)";
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

/** Precio unitario efectivo: base + extras + modificadores. */
function comandaLineUnitPriceWithExtras(line: CartOrderLine): number {
  const base = Number(line.product.precio);
  const b = Number.isFinite(base) ? base : 0;
  return b + sumLineExtrasPrices(line) + resolveLineModifierTotal(line);
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

function isComandaAlreadyIssuedForLines(lines: CartOrderLine[]): boolean {
  return lines.some((line) => {
    const st = normalizeOrderLineStatus(line.status);
    return st === "sent" || st === "prepared" || st === "served";
  });
}

function tableOperatorAssignmentHintFromTable(
  table: Table | null | undefined,
): TableOperatorAssignment | null {
  const id = table?.assignedOperatorId?.trim();
  const name = table?.assignedOperatorName?.trim();
  if (!id || !name) return null;
  return {
    assignedOperatorId: id,
    assignedOperatorName: name,
    ...(typeof table?.assignedAt === "number" && Number.isFinite(table.assignedAt)
      ? { assignedAt: table.assignedAt }
      : {}),
  };
}

function resolveOperatorAssignmentForNewOrder(
  tableId: string,
  tables: readonly Table[],
  activeOperator: ActiveOperatorSession | null,
): Pick<
  TableOperatorAssignment,
  "assignedOperatorId" | "assignedOperatorName"
> | null {
  const fromTable = tableOperatorAssignmentHintFromTable(
    tables.find((row) => row.id === tableId),
  );
  if (fromTable) {
    return {
      assignedOperatorId: fromTable.assignedOperatorId,
      assignedOperatorName: fromTable.assignedOperatorName,
    };
  }
  if (!activeOperator) return null;
  return {
    assignedOperatorId: activeOperator.activeOperatorId,
    assignedOperatorName: activeOperator.activeOperatorName,
  };
}

function countActiveComandaLines(lines: CartOrderLine[]): number {
  return lines.filter(
    (line) => normalizeOrderLineStatus(line.status) !== "cancelled",
  ).length;
}

/** Mesa sin líneas activas pero con sesión (comanda vacía/cancelada) → cerrar como al cobrar. */
function tableEmptySessionWarrantsAutoClose(args: {
  lines: CartOrderLine[];
  cachedTableLines?: CartOrderLine[];
  openOrderIds: readonly string[];
  firestoreOccupied: boolean;
  draftOrderId: string | null;
  tableHasOperationalSession: boolean;
}): boolean {
  if (countActiveComandaLines(args.lines) > 0) return false;
  if (countActiveComandaLines(args.cachedTableLines ?? []) > 0) return false;
  if (args.lines.length > 0) return true;
  if (args.openOrderIds.length > 0) return true;
  if (args.draftOrderId) return true;
  if (args.firestoreOccupied) return true;
  if (args.tableHasOperationalSession) return true;
  return false;
}

function tableDocHasOperationalSession(
  table: Table | undefined,
): boolean {
  if (!table) return false;
  const row = table as Table & {
    busy?: boolean;
    activeOrderId?: unknown;
    currentOrderId?: unknown;
  };
  if (row.busy) return true;
  const activeOrderId =
    typeof row.activeOrderId === "string" ? row.activeOrderId.trim() : "";
  if (activeOrderId) return true;
  const currentOrderId =
    typeof row.currentOrderId === "string" ? row.currentOrderId.trim() : "";
  return Boolean(currentOrderId);
}

function isOrderLineCancellable(line: CartOrderLine): boolean {
  const st = normalizeOrderLineStatus(line.status);
  return st !== "pending" && st !== "cancelled";
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
  const display = line.displayName?.trim();
  if (display) return display;
  const v = line.variantLabel?.trim();
  return v ? `${line.product.nombre} (${v})` : line.product.nombre;
}

function mapCartOrderLinesToBillingSources(lines: CartOrderLine[]) {
  return mapTpvOrderLinesToBillingLines(
    lines.filter(isActiveComandaLineForOps).map((item) => {
      const isGifted = Boolean(item.isComped);
      const unit = comandaLineUnitPriceWithExtras(item);
      const qty = Number(item.quantity) || 0;
      const lineTotal = isGifted ? 0 : unit * qty;
      return {
        id: item.id,
        name: comandaLineDisplayName(item),
        quantity: qty,
        unitPrice: isGifted ? 0 : unit,
        lineTotal: Number.isFinite(lineTotal) ? roundMoney(lineTotal) : 0,
        isComped: isGifted,
      };
    }),
  );
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

/** Pending en comanda: el último tocado primero (addedAt / createdAt). */
function compareComandaPendingLinesNewestFirst(
  a: CartOrderLine,
  b: CartOrderLine,
): number {
  const d = comandaLineSortKey(b) - comandaLineSortKey(a);
  if (d !== 0) return d;
  return a.id.localeCompare(b.id);
}

function enrichProductWithStationFields(
  product: Product,
  fields: ReturnType<typeof resolveStationFieldsFromProduct>,
  opFields?: ReturnType<typeof resolveOperationStationFieldsFromProduct>,
): Product {
  return {
    ...product,
    ...(fields.preparationArea
      ? { preparationArea: fields.preparationArea }
      : {}),
    ...(fields.station ? { station: fields.station } : {}),
    ...(opFields?.operationStationId
      ? { operationStationId: opFields.operationStationId }
      : {}),
    ...(opFields?.operationStationName
      ? { operationStationName: opFields.operationStationName }
      : {}),
  };
}

function orderLinesToFirestoreItems(
  lines: CartOrderLine[],
  shadowCatalogSources?: ProductResolverParityCatalogSources,
) {
  return lines.map((line) => {
    const shadowCatalog = shadowCatalogSources
      ? buildProductResolverParityContextFromProduct(
          line.product,
          shadowCatalogSources,
        )
      : undefined;
    const { stationFields, opFields } = resolveOperationalLineFieldsForCartLine(
      line,
      shadowCatalog,
    );
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
    const modifierTotal = resolveLineModifierTotal(line);
    const unitWithExtras = baseUnit + extrasSum + modifierTotal;
    const lineTotal = unitWithExtras * quantity;
    const selectedModifiers = selectedModifiersToFirestorePayload(
      line.selectedModifiers,
    );
    const displayName =
      line.displayName?.trim() ||
      (selectedModifiers.length > 0
        ? buildCartLineDisplayName(String(line.product.nombre ?? ""), selectedModifiers)
        : undefined);
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
      ...(line.cancelledBy ? { cancelledBy: line.cancelledBy } : {}),
      isComped: Boolean(line.isComped),
      compedAt: line.compedAt ?? null,
      compedReason: line.compedReason ?? null,
      price: baseUnit,
      precio: baseUnit,
      extras,
      ...(selectedModifiers.length > 0 ? { selectedModifiers } : {}),
      ...(selectedModifiers.length > 0 ? { modifierTotal } : {}),
      ...(displayName ? { displayName } : {}),
      total: Number.isFinite(lineTotal) ? lineTotal : 0,
      categoria: String(line.product.categoria ?? ""),
      ...(String(line.product.categoria ?? "").trim()
        ? { categoryName: String(line.product.categoria).trim() }
        : {}),
      productName: String(line.product.nombre ?? ""),
      ...stationFieldsToFirestorePayload(stationFields),
      ...operationStationFieldsToFirestorePayload(opFields),
      ...(line.lineNote?.trim() ? { note: line.lineNote.trim() } : {}),
      ...(courseStored != null ? { course: courseStored } : {}),
      ...(line.inventoryCost
        ? { inventoryCost: inventoryCostSnapshotToFirestore(line.inventoryCost) }
        : {}),
      ...(line.orderItemDocId?.trim()
        ? { orderItemDocId: line.orderItemDocId.trim() }
        : {}),
      ...(line.tableGroupSourceTableId?.trim()
        ? { tableGroupSourceTableId: line.tableGroupSourceTableId.trim() }
        : {}),
      ...(line.tableGroupSourceOrderId?.trim()
        ? { tableGroupSourceOrderId: line.tableGroupSourceOrderId.trim() }
        : {}),
    };
  });
}

type FirestoreOrderDocForCart = {
  restaurantId?: string;
  cancelledLineIds?: string[];
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
  catalogById?: ReadonlyMap<string, { course?: number | null }>,
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
      const selectedModifiers = parseFirestoreSelectedModifiers(
        (it as { selectedModifiers?: unknown }).selectedModifiers,
      );
      const modifierTotalRaw = (it as { modifierTotal?: unknown }).modifierTotal;
      const modifierTotal =
        typeof modifierTotalRaw === "number" && Number.isFinite(modifierTotalRaw)
          ? modifierTotalRaw
          : selectedModifiers.length > 0
            ? resolveLineModifierTotal({ selectedModifiers })
            : undefined;
      const displayNameRaw = (it as { displayName?: unknown }).displayName;
      const displayName =
        typeof displayNameRaw === "string" && displayNameRaw.trim()
          ? displayNameRaw.trim()
          : selectedModifiers.length > 0
            ? buildCartLineDisplayName(name, selectedModifiers)
            : undefined;
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
      const catalogDoc = catalogById?.get(productIdResolved);
      const courseStoredFromItem = readComandaLineCourseFromFirestoreRecord(
        it as Record<string, unknown>,
      );
      let courseStored = normalizeComandaCourseForStorage(courseStoredFromItem);
      const inventoryCost = parseFirestoreLineInventoryCost(
        (it as { inventoryCost?: unknown }).inventoryCost,
      );
      const orderItemDocIdRaw = (it as { orderItemDocId?: unknown }).orderItemDocId;
      const orderItemDocId =
        typeof orderItemDocIdRaw === "string" && orderItemDocIdRaw.trim()
          ? orderItemDocIdRaw.trim()
          : undefined;
      const tableGroupSourceTableIdRaw = (it as {
        tableGroupSourceTableId?: unknown;
      }).tableGroupSourceTableId;
      const tableGroupSourceTableId =
        typeof tableGroupSourceTableIdRaw === "string" &&
        tableGroupSourceTableIdRaw.trim()
          ? tableGroupSourceTableIdRaw.trim()
          : undefined;
      const tableGroupSourceOrderIdRaw = (it as {
        tableGroupSourceOrderId?: unknown;
      }).tableGroupSourceOrderId;
      const tableGroupSourceOrderId =
        typeof tableGroupSourceOrderIdRaw === "string" &&
        tableGroupSourceOrderIdRaw.trim()
          ? tableGroupSourceOrderIdRaw.trim()
          : undefined;
      const stationFields = readStationFieldsFromFirestoreRecord(
        it as Record<string, unknown>,
      );
      const opFields = readOperationStationFieldsFromFirestoreRecord(
        it as Record<string, unknown>,
      );
      const categoryLabel = String(
        it.categoryName ?? it.categoria ?? "",
      ).trim();
      const baseProduct: Product = {
        id: productIdResolved,
        nombre: name,
        precio: basePrecio,
        categoria: categoryLabel || "Sin categoría",
        ...(catalogDoc?.course !== undefined
          ? { course: catalogDoc.course }
          : {}),
        ...(stationFields.preparationArea
          ? { preparationArea: stationFields.preparationArea }
          : {}),
        ...(stationFields.station ? { station: stationFields.station } : {}),
        ...(opFields.operationStationId
          ? { operationStationId: opFields.operationStationId }
          : {}),
        ...(opFields.operationStationName
          ? { operationStationName: opFields.operationStationName }
          : {}),
      };
      if (courseStored == null) {
        const fromCatalog = resolveProductDefaultCourse(baseProduct);
        if (fromCatalog != null) courseStored = fromCatalog;
      }
      return {
        id:
          typeof it.id === "string" && it.id.trim() !== ""
            ? it.id
            : `legacy-${productIdResolved}-${idx}`,
        quantity: qty,
        product: enrichProductWithStationFields(
          baseProduct,
          stationFields,
          opFields,
        ),
        ...(stationFields.station ? { station: stationFields.station } : {}),
        ...(stationFields.preparationArea
          ? { preparationArea: stationFields.preparationArea }
          : {}),
        ...(opFields.operationStationId
          ? { operationStationId: opFields.operationStationId }
          : {}),
        ...(opFields.operationStationName
          ? { operationStationName: opFields.operationStationName }
          : {}),
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
        ...(selectedModifiers.length > 0 ? { selectedModifiers } : {}),
        ...(modifierTotal != null ? { modifierTotal } : {}),
        ...(displayName ? { displayName } : {}),
        ...(lineNoteFromDoc ? { lineNote: lineNoteFromDoc } : {}),
        ...(courseStored != null ? { course: courseStored } : {}),
        ...(inventoryCost ? { inventoryCost } : {}),
        ...(orderItemDocId ? { orderItemDocId } : {}),
        ...(tableGroupSourceTableId ? { tableGroupSourceTableId } : {}),
        ...(tableGroupSourceOrderId ? { tableGroupSourceOrderId } : {}),
      };
    })
    .filter((row) => row.quantity > 0);
  return mapped;
}

function buildSyncedOrderLinesFromServerDoc(
  localLines: CartOrderLine[],
  data: FirestoreOrderDocForCart,
  restaurantId: string,
  catalogById?: ReadonlyMap<string, { course?: number | null }>,
  opts?: { localDraftAuthoritative?: boolean },
): CartOrderLine[] {
  const serverMapped =
    mapFirestoreOrderDocToCartLines(data, restaurantId, catalogById) ?? [];
  const useLocalBase =
    opts?.localDraftAuthoritative === true || localLines.length > 0;
  const baseLocal = useLocalBase ? localLines : serverMapped;
  const mergedProduction = mergeLocalLinesProductionFromServerItems(
    baseLocal,
    data.items,
    (line) => orderLinesToFirestoreItems([line])[0]!,
    normalizeOrderLineStatus,
  );
  const mergedIds = new Set(mergedProduction.map((line) => line.id));
  const serverOnly = serverMapped.filter((line) => {
    if (mergedIds.has(line.id)) return false;
    if (
      normalizeOrderLineStatus(line.status) === "pending" &&
      useLocalBase
    ) {
      return false;
    }
    return true;
  });
  return [...mergedProduction, ...serverOnly];
}

type CartaMenuGroup = TpvMenuGroup;

function tpvMenuGroupForProduct(product: Product): CartaMenuGroup {
  return resolveTpvMenuGroup({
    productFamilyType: product.productFamilyType,
    categoryName: product.categoria,
    categoria: product.categoria,
    tipoVenta: product.tipoVenta,
  });
}

function comandaCoursesMatch(
  lineCourse: number | undefined,
  productCourse: number | undefined,
  opts?: { treatMissingLineCourseAsEntrante?: boolean },
): boolean {
  const a = normalizeComandaCourseForStorage(lineCourse);
  const b = normalizeComandaCourseForStorage(productCourse);
  if (a == null && b == null) return true;
  if (a == null && b != null) {
    return opts?.treatMissingLineCourseAsEntrante === true && b === 1;
  }
  if (a != null && b == null) return false;
  return a === b;
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

function resolveTpvFloorPlanIcon(planName: string): LucideIcon | null {
  const n = planName.trim().toLowerCase();
  if (!n) return null;
  if (n.includes("cocktail") || n.includes("martini")) return Martini;
  if (/\bbar\b/.test(n) && !n.includes("cocktail")) return Beer;
  if (n.includes("principal") || n.includes("main")) return MapPin;
  return null;
}

function TpvFloorPlanIcon({
  planName,
  className,
}: {
  planName: string;
  className?: string;
}) {
  const Icon = resolveTpvFloorPlanIcon(planName);
  if (!Icon) return null;
  return (
    <Icon
      className={className}
      size={12}
      strokeWidth={2.25}
      aria-hidden
    />
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
    getGroupTableIds?: (tableId: string) => string[];
    isGroupedTable: (tableId: string) => boolean;
    /** Mesa unida a otra: no se pinta en mapa como ficha propia. */
    isJoinedSecondaryTable?: (tableId: string) => boolean;
    /** Mesa principal con al menos una secundaria en el grupo. */
    isGroupedPrimaryTable?: (tableId: string) => boolean;
    getGroupedBadgeText: (tableId: string) => string | null;
    joinTables?: (mainTableId: string, secondaryTableId: string) => void;
    separateTable?: (tableId: string) => void;
  };
  /** Solo layout embebido en Operación: ocultar barra superior del shell dentro de mesa. */
  onEmbeddedOperacionChromeChange?: (state: { hideShellTopBar: boolean }) => void;
};

type JoinedTableGroupMapState = {
  mainTableId: string;
  memberIds: string[];
  serviceTableId: string;
  busy: boolean;
};

function resolveJoinedTableGroupMapState(
  tableId: string,
  groupedTablesMapHandlers: CartaPageContentProps["groupedTablesMapHandlers"],
  firestoreOccupiedTableIds: ReadonlySet<string>,
  ordersByTable: Record<string, CartOrderLine[]>,
): JoinedTableGroupMapState {
  const id = String(tableId ?? "").trim();
  const mainTableId = groupedTablesMapHandlers?.resolveMainTableId?.(id) ?? id;
  const memberIds =
    groupedTablesMapHandlers?.getGroupTableIds?.(id) ?? (id ? [id] : []);

  let serviceTableId = mainTableId || id;
  for (const memberId of memberIds) {
    if (firestoreOccupiedTableIds.has(memberId)) {
      serviceTableId = memberId;
      break;
    }
  }
  if (!firestoreOccupiedTableIds.has(serviceTableId)) {
    for (const memberId of memberIds) {
      if (countActiveComandaLines(ordersByTable[memberId] ?? []) > 0) {
        serviceTableId = memberId;
        break;
      }
    }
  }

  const busy = memberIds.some(
    (memberId) =>
      firestoreOccupiedTableIds.has(memberId) ||
      countActiveComandaLines(ordersByTable[memberId] ?? []) > 0,
  );

  return { mainTableId: mainTableId || id, memberIds, serviceTableId, busy };
}

function resolveGroupMemberIdsForTable(
  tableId: string,
  groupedTablesMapHandlers: CartaPageContentProps["groupedTablesMapHandlers"],
): string[] {
  const id = String(tableId ?? "").trim();
  if (!id) return [];
  return groupedTablesMapHandlers?.getGroupTableIds?.(id) ?? [id];
}

function buildTableAvailableClosePayload(closeMs: number) {
  return {
    busy: false,
    status: "available" as const,
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
    dinersCount: 0,
    updatedAt: closeMs,
    closedAt: closeMs,
    ...tableOperatorAssignmentClearFields(),
  };
}

export function CartaPageContent({
  embeddedInOperacion = false,
  tablesReadyToClose,
  groupedTablesMapHandlers,
  onEmbeddedOperacionChromeChange,
}: CartaPageContentProps) {
  const router = useRouter();
  const { t } = useI18n();
  const salaReadyToCloseTableIds =
    tablesReadyToClose ?? EMPTY_TABLES_READY_TO_CLOSE;
  const {
    user,
    restaurantId: profileRestaurantId,
    role,
    ready: authReady,
  } = useAuth();
  const { activeOperator, requestOperatorChange } = useActiveOperator();
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId");
  const lineIdFromUrl = searchParams.get("lineId")?.trim() ?? "";
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
  /** Evita mezclar líneas al cambiar de mesa (sync `order` ← `ordersByTable`). */
  const openingTableRef = useRef<string | null>(null);
  const sessionTableScopeRef = useRef<string | null>(null);
  const suppressUrlTableSelectionRef = useRef(false);
  /** Mesa abierta desde el mapa (no deep link / URL obsoleta). */
  const userOpenedTableFromMapRef = useRef<string | null>(null);
  const restaurantId = profileRestaurantId ?? null;
  const operationalRestaurantId = useMemo(
    () => resolveOperationalRestaurantId(restaurantId),
    [restaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(operationalRestaurantId, {
    scope: "tpv_menu",
  });

  const [cartaHeaderMobile, setCartaHeaderMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setCartaHeaderMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const cartaLayoutRef = useRef<HTMLDivElement | null>(null);
  const comandaSplitterPointerIdRef = useRef<number | null>(null);
  const comandaSplitterPointerStartRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const comandaSplitterDidDragRef = useRef(false);
  const comandaSplitterLastTapAtRef = useRef(0);
  const comandaSplitterWindowCleanupRef = useRef<(() => void) | null>(null);
  const [comandaPanelWidthPct, setComandaPanelWidthPct] = useState(
    COMANDA_PANEL_WIDTH_DEFAULT,
  );
  const [isComandaPanelResizing, setIsComandaPanelResizing] = useState(false);

  const [restaurantWaiters, setRestaurantWaiters] = useState<
    { id: string; name: string }[]
  >([]);
  const [restaurantWaitersLoadStatus, setRestaurantWaitersLoadStatus] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const [
    restaurantWaitersErrorKind,
    setRestaurantWaitersErrorKind,
  ] = useState<RestaurantRosterErrorKind | null>(null);
  const [restaurantWaitersReloadToken, setRestaurantWaitersReloadToken] =
    useState(0);

  useEffect(() => {
    if (!isComandaPanelResizing) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isComandaPanelResizing]);

  const firebaseUserId =
    (user as { uid?: string; id?: string } | null | undefined)?.uid ||
    (user as { uid?: string; id?: string } | null | undefined)?.id ||
    null;
  const waiterEmail =
    (user as { email?: string } | null | undefined)?.email || null;
  const waiterId = activeOperator?.activeOperatorId ?? firebaseUserId;
  const activityActorName =
    activeOperator?.activeOperatorName ||
    (user as { displayName?: string } | null | undefined)?.displayName?.trim() ||
    waiterEmail ||
    undefined;
  const activityActorRole =
    activeOperator?.activeOperatorRole || role || undefined;

  const { status: connectivityStatus } = useConnectivityStatus();
  const { can } = useHostlyCapabilities();
  const canCharge = can("tpv.charge");
  const canCancelLine = can("tpv.cancel_line");
  const canKdsManage = can("kds.manage");
  const canJoinTables = can("tpv.join_tables");

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

  useEffect(() => {
    const rid = operationalRestaurantId?.trim();
    if (!rid || !authReady) {
      setCartaCategories([]);
      return;
    }
    let cancelled = false;
    void fetchCartaCategorias(rid).then((cats) => {
      if (cancelled) return;
      setCartaCategories(cats.filter((c) => c.isActive !== false));
    });
    return () => {
      cancelled = true;
    };
  }, [operationalRestaurantId, authReady]);

  useEffect(() => {
    const rid = operationalRestaurantId?.trim();
    if (!rid || !authReady) {
      setCartaFamilias([]);
      setProductionStations([]);
      return;
    }
    let cancelled = false;
    void Promise.all([fetchCartaFamilias(rid), listProductionStations(rid)]).then(
      ([fams, prodStations]) => {
        if (cancelled) return;
        setCartaFamilias(fams);
        setProductionStations(prodStations);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operationalRestaurantId, authReady]);

  useEffect(() => {
    const rid = operationalRestaurantId?.trim();
    if (!rid || !authReady || !isFirebaseConfigured) {
      setOperationStations([]);
      return;
    }
    const unsub = listenOperationStations(
      rid,
      setOperationStations,
      (err) => {
        console.warn("[Hostly TPV] operationStations listener", err);
        setOperationStations([]);
      },
    );
    return () => unsub();
  }, [operationalRestaurantId, authReady, isFirebaseConfigured]);

  useEffect(() => {
    const rid = operationalRestaurantId?.trim();
    if (!rid || !authReady || !isFirebaseConfigured) {
      setModifierGroups([]);
      return;
    }
    const unsub = listenModifierGroups(
      rid,
      setModifierGroups,
      (err) => {
        console.warn("[Hostly TPV] modifierGroups listener", err);
        setModifierGroups([]);
      },
    );
    return () => unsub();
  }, [operationalRestaurantId, authReady, isFirebaseConfigured]);

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

  const products = operationalCatalog.products;
  const productsLoading = operationalCatalog.loading;
  const catalogLoadError = operationalCatalog.source === "legacy_fallback";

  const inventoryProductsById = useMemo(
    () => buildTpvInventoryProductsById(operationalCatalog.productDocumentsById),
    [operationalCatalog.productDocumentsById],
  );

  const productStockWarningById = useMemo(() => {
    const map = new Map<string, StockWarningLevel>();
    if (operationalCatalog.source !== "central") return map;
    for (const product of products) {
      const doc = operationalCatalog.productDocumentsById.get(product.id);
      const level = resolveProductStockWarning(doc, inventoryProductsById);
      if (level !== "none") map.set(product.id, level);
    }
    return map;
  }, [
    inventoryProductsById,
    operationalCatalog.productDocumentsById,
    operationalCatalog.source,
    products,
  ]);

  const [tablesList, setTablesList] = useState<Table[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [salaEditorDraftDocument, setSalaEditorDraftDocument] =
    useState<SalaEditorDocument | null>(null);
  const [salaEditorDraftLoadError, setSalaEditorDraftLoadError] =
    useState<string | null>(null);
  const [selectedTpvFloorPlanId, setSelectedTpvFloorPlanId] =
    useState<string | null>(null);

  useEffect(() => {
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (!authReady || !user?.uid || !rid || !isFirebaseConfigured) {
      setSalaEditorDraftDocument(null);
      setSalaEditorDraftLoadError(null);
      return;
    }

    let cancelled = false;
    void loadSalaEditorDraft(rid)
      .then((draft) => {
        if (cancelled) return;
        setSalaEditorDraftDocument(draft?.document ?? null);
        setSalaEditorDraftLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : String(error ?? "unknown");
        setSalaEditorDraftDocument(null);
        setSalaEditorDraftLoadError(message);
        console.warn("[TPV] readonly map draft load fallback", {
          restaurantId: rid,
          error: message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.uid, restaurantId, isFirebaseConfigured]);

  const operationalFloorPlansForTpv = useMemo(
    () => floorPlans.filter((p) => p.active !== false && p.showInTpv !== false),
    [floorPlans],
  );
  const { getActiveLayoutForPlan } = useFloorPlanLayoutsConfig(restaurantId);
  const tpvActiveLayoutLabel = useMemo(
    () =>
      formatTpvActiveLayoutLabel(getActiveLayoutForPlan(selectedTpvFloorPlanId)),
    [getActiveLayoutForPlan, selectedTpvFloorPlanId],
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
  const [preAddQuantity, setPreAddQuantity] = useState(1);
  const [preAddQuantityInputActive, setPreAddQuantityInputActive] =
    useState(false);
  const [modifierModalPreAddQuantity, setModifierModalPreAddQuantity] =
    useState(1);
  const preAddQuantityRef = useRef(1);
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
  /** TPV operación: todas las mesas del plano o solo las del operador activo (+ libres). */
  const [myTablesMapScope, setMyTablesMapScope] = useState<"all" | "mine">("all");
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
    setMyTablesMapScope(readStoredMapMyTablesScope());
  }, []);

  useEffect(() => {
    preAddQuantityRef.current = normalizeTpvPreAddQuantity(preAddQuantity);
  }, [preAddQuantity]);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_WAITER_FILTER_STORAGE_KEY, waiterFilter);
    } catch {
      /* ignore */
    }
  }, [waiterFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_MY_TABLES_SCOPE_STORAGE_KEY, myTablesMapScope);
    } catch {
      /* ignore */
    }
  }, [myTablesMapScope]);

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
  const selectedTableIdRef = useRef<string | null>(null);
  selectedTableIdRef.current = selectedTableId;
  const [order, setOrder] = useState<CartOrderLine[]>([]);
  const tpvLineInventoryCostLabelByLineId = useMemo(() => {
    const map = new Map<string, string>();
    if (operationalCatalog.source !== "central") return map;
    for (const line of order) {
      if (line.status === "cancelled") continue;
      if (line.status !== "pending" && line.inventoryCost) {
        const label = formatInventoryCostSnapshot(line.inventoryCost);
        if (label) map.set(line.id, label);
        continue;
      }
      if (line.status !== "pending") continue;
      const doc = operationalCatalog.productDocumentsById.get(line.product.id);
      const result = calculateTpvLineInventoryCost({
        line,
        inventoryProductsById,
        recipe: doc?.recipe ?? null,
        saleProductId: line.product.id,
      });
      const label = formatInventoryCost(result);
      if (label) map.set(line.id, label);
    }
    return map;
  }, [
    inventoryProductsById,
    operationalCatalog.productDocumentsById,
    operationalCatalog.source,
    order,
  ]);
  /** Comandas locales por mesa; clave = `table.id` de Firestore. */
  const [ordersByTable, setOrdersByTable] = useState<
    Record<string, CartOrderLine[]>
  >({});
  const ordersByTableRef = useRef(ordersByTable);
  ordersByTableRef.current = ordersByTable;
  const orderRef = useRef(order);
  orderRef.current = order;
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
  const [selectedBillingCustomer, setSelectedBillingCustomer] =
    useState<BillingCustomer | null>(null);
  const [lastBillingInvoice, setLastBillingInvoice] =
    useState<BillingInvoice | null>(null);
  const [isBillingInvoicePanelOpen, setIsBillingInvoicePanelOpen] =
    useState(false);
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
  const [tpvQuickActionsAnchor, setTpvQuickActionsAnchor] = useState<{
    lineId: string;
    x: number;
    y: number;
  } | null>(null);
  const [qtyBumpLineId, setQtyBumpLineId] = useState<string | null>(null);
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
  const [cancellingLineIds, setCancellingLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const isComandaSendingRef = useRef(isComandaSending);
  isComandaSendingRef.current = isComandaSending;
  const cancellingLineIdsRef = useRef(cancellingLineIds);
  cancellingLineIdsRef.current = cancellingLineIds;
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
  const [orderDeepLinkNotice, setOrderDeepLinkNotice] = useState<string | null>(
    null,
  );
  const [orderDeepLinkLineNotice, setOrderDeepLinkLineNotice] = useState<
    string | null
  >(null);
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
  const [cartaCategories, setCartaCategories] = useState<CartaCategoria[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  /** Fase 2.0 shadow: fetch único (misma estrategia que Config → Productos). */
  const [productionStations, setProductionStations] = useState<
    ProductionStationDocument[]
  >([]);
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
  >([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDocument[]>(
    [],
  );

  const operationalShadowCatalogSources = useMemo(
    (): ProductResolverParityCatalogSources => ({
      operationStations,
      productionStations,
      cartaCategorias: cartaCategories,
      cartaFamilias,
    }),
    [operationStations, productionStations, cartaCategories, cartaFamilias],
  );

  const serializeOrderLinesToFirestoreItems = useCallback(
    (lines: CartOrderLine[]) =>
      orderLinesToFirestoreItems(lines, operationalShadowCatalogSources),
    [operationalShadowCatalogSources],
  );

  const syncEmbeddedOrderItems = useCallback(
    async (params: {
      operation: TpvOrderItemsOperation;
      orderId?: string | null;
      lines: CartOrderLine[];
      cancelledLineIds?: string[];
      markSent?: boolean;
    }) => {
      const tableLabel =
        tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
        selectedTableId ||
        "";
      const result = await syncOrderItemsViaApi({
        operation: params.operation,
        orderId: params.orderId,
        tableId: selectedTableId ?? undefined,
        tableLabel,
        items: serializeOrderLinesToFirestoreItems(params.lines) as Record<
          string,
          unknown
        >[],
        cancelledLineIds: params.cancelledLineIds,
        markSent: params.markSent,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result;
    },
    [
      tablesList,
      selectedTableId,
      serializeOrderLinesToFirestoreItems,
    ],
  );

  const [modifierModalProduct, setModifierModalProduct] = useState<Product | null>(
    null,
  );
  const [modifierModalGroups, setModifierModalGroups] = useState<
    ModifierGroupDocument[]
  >([]);
  const [marchConfirmDialog, setMarchConfirmDialog] = useState<null | {
    kind: "primeros" | "segundos" | "postres";
    count: number;
  }>(null);
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
  /** Evita que el listener realtime pise comensales durante persistGuestCount. */
  const guestCountPersistRef = useRef<{
    tableId: string;
    value: number;
    at: number;
  } | null>(null);
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
    if (isPaymentOpen) return;
    setSelectedBillingCustomer(null);
    setLastBillingInvoice(null);
    setIsBillingInvoicePanelOpen(false);
  }, [isPaymentOpen]);

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
        const result = await voidPaymentViaApi({ paymentId });
        if (!result.ok) throw new Error(result.error);
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
        const items = serializeOrderLinesToFirestoreItems(lines) as Record<
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
          operatorAssignment: knownId
            ? null
            : resolveOperatorAssignmentForNewOrder(
                tid,
                tablesList,
                activeOperator,
              ),
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
    [restaurantId, isFirebaseConfigured, tablesList, activeOperator],
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
          const activeLineCount = (lines: CartOrderLine[]) =>
            lines.filter(
              (l) => normalizeOrderLineStatus(l.status) !== "cancelled",
            ).length;
          const unitCount = (lines: CartOrderLine[]) =>
            lines.reduce((acc, l) => {
              if (normalizeOrderLineStatus(l.status) === "cancelled") return acc;
              return acc + (Number(l.quantity) || 0);
            }, 0);
          const isShrink =
            activeLineCount(nextOrder) < activeLineCount(cur) ||
            unitCount(nextOrder) < unitCount(cur);
          if (isShrink) {
            void flushPersistDraftOrderForTable(selectedTableId, nextOrder);
          } else {
            schedulePersistDraftOrderForTable(selectedTableId, nextOrder);
          }
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
      flushPersistDraftOrderForTable,
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
          cartLineModifiersMergeKey(l.selectedModifiers) ===
            cartLineModifiersMergeKey(editedLine.selectedModifiers) &&
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
        return c > MONEY_EPS;
      }

      if (paymentMethod === "card") {
        const raw = cardReceived.trim();
        const c = raw === "" ? r : roundMoney(parseMoney(cardReceived));
        return c > MONEY_EPS;
      }

      if (paymentMethod === "voucher") {
        const v = roundMoney(parseMoney(voucherAmount));
        return v > MONEY_EPS && voucherNumber.trim().length > 0;
      }

      return false;
    },
    [paymentMethod, cashReceived, cardReceived, voucherAmount, voucherNumber, parseMoney],
  );

  /** Cierra el panel de cobro sin registrar pago ni tocar comanda/mesa. */
  const handleCancelPaymentFlow = useCallback(() => {
    if (isConfirmingPayment) return;
    setIsPaymentOpen(false);
    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    setCardReceivedTouched(false);
    setVoucherAmount("");
    setVoucherNumber("");
    setVoucherLookupBalance(null);
    setIsInvoice(false);
    setInvoiceName("");
    setInvoiceTaxId("");
    setInvoiceEmail("");
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
  }, [isConfirmingPayment]);

  const clearLocalTableSessionState = useCallback((tableIds: string[]) => {
    const ids = [
      ...new Set(tableIds.map((t) => String(t ?? "").trim()).filter(Boolean)),
    ];
    if (ids.length === 0) return;
    for (const tid of ids) {
      delete openDraftOrderIdByTableRef.current[tid];
      window.dispatchEvent(
        new CustomEvent("tablesReadyToClose:clear", { detail: tid }),
      );
    }
    setOrdersByTable((prev) => {
      const next = { ...prev };
      for (const tid of ids) delete next[tid];
      return next;
    });
    setFirestoreOccupancyStartMsByTable((prev) => {
      const next = { ...prev };
      for (const tid of ids) delete next[tid];
      return next;
    });
    setOrderTotalsByTable((prev) => {
      const next = { ...prev };
      for (const tid of ids) delete next[tid];
      return next;
    });
    setLastActivityAtByTable((prev) => {
      const next = { ...prev };
      for (const tid of ids) delete next[tid];
      return next;
    });
    setFirestoreOccupiedTableIds((prev) => {
      const next = new Set(prev);
      for (const tid of ids) next.delete(tid);
      return next;
    });
  }, []);

  const closeTableGroupInFirestore = useCallback(
    async (anchorTableId: string) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      const memberIds = resolveGroupMemberIdsForTable(
        anchorTableId,
        groupedTablesMapHandlers,
      );
      const closeMs = Date.now();
      const payload = buildTableAvailableClosePayload(closeMs);
      for (const memberId of memberIds) {
        await handlePayTableOrder(memberId, { db, restaurantId });
      }
    },
    [restaurantId, isFirebaseConfigured, groupedTablesMapHandlers],
  );

  /** Limpia navegación local de mesa (sin tocar Firestore ni caché de comandas). */
  const resetTpvNavigationToMap = useCallback(() => {
    userOpenedTableFromMapRef.current = null;
    setTpvEntryMode("map");
    suppressUrlTableSelectionRef.current = true;
    setSelectedTableId(null);
    setOrder([]);
    sessionTableScopeRef.current = null;
    setIsPaymentOpen(false);
    if (embeddedInOperacion) {
      try {
        sessionStorage.setItem(OPERATOR_CHANGE_NAV_RESET_KEY, "1");
      } catch {
        /* ignore */
      }
      clearOperacionTpvUrlParams();
      router.replace("/dashboard/operacion/tpv");
    }
  }, [embeddedInOperacion, router]);

  /** TPV compartido: tras acción operativa, volver al selector de operador activo. */
  const returnToOperatorPickerAfterTpvAction = useCallback(() => {
    if (!embeddedInOperacion) return;
    resetTpvNavigationToMap();
    requestOperatorChange();
  }, [embeddedInOperacion, resetTpvNavigationToMap, requestOperatorChange]);

  const completeOperationalActionWithOperatorPicker = useCallback(
    async (actionSucceeded: boolean) => {
      if (!actionSucceeded || !embeddedInOperacion) return;
      await new Promise((r) =>
        window.setTimeout(r, TPV_OPERATOR_PICKER_POST_ACTION_DELAY_MS),
      );
      returnToOperatorPickerAfterTpvAction();
    },
    [embeddedInOperacion, returnToOperatorPickerAfterTpvAction],
  );

  const handleRequestOperatorChange = returnToOperatorPickerAfterTpvAction;

  const finishPaymentAndReturnToMap = useCallback((clearedTableId: string | null) => {
    const memberIds = clearedTableId
      ? resolveGroupMemberIdsForTable(
          clearedTableId,
          groupedTablesMapHandlers,
        )
      : [];
    const mainId =
      clearedTableId != null
        ? (groupedTablesMapHandlers?.resolveMainTableId?.(clearedTableId) ??
          clearedTableId)
        : null;

    if (mainId) {
      groupedTablesMapHandlers?.separateTable?.(mainId);
    }

    const feedbackTableId = mainId ?? clearedTableId;
    const selectedTable =
      feedbackTableId != null
        ? tablesList.find((t) => t.id === feedbackTableId) ?? null
        : null;
    const tableName =
      selectedTable?.name ||
      (selectedTable as { label?: string } | null)?.label ||
      "Mesa";

    setIsPaymentOpen(false);
    setSessionTableAmountPaidSum(0);
    setSessionPaymentHistory([]);
    sessionTableScopeRef.current = null;
    suppressUrlTableSelectionRef.current = true;
    setSelectedTableId(null);
    setOrder([]);

    const idsToClear =
      memberIds.length > 0
        ? memberIds
        : clearedTableId
          ? [clearedTableId]
          : [];
    clearLocalTableSessionState(idsToClear);

    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    setCardReceivedTouched(false);
    setVoucherAmount("");
    setVoucherNumber("");
    setDiscountAmount("");
    setDiscountPercent("");
    if (idsToClear.length > 0) {
      setTableClosedFeedback(true);
      window.setTimeout(() => setTableClosedFeedback(false), 1500);
    }
    setClosingFeedback({ tableName });
    setTpvEntryMode("map");
    window.setTimeout(() => {
      setClosingFeedback(null);
    }, 900);
    if (embeddedInOperacion) {
      returnToOperatorPickerAfterTpvAction();
    } else {
      router.replace("/dashboard/carta");
    }
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
  }, [
    embeddedInOperacion,
    groupedTablesMapHandlers,
    router,
    tablesList,
    clearLocalTableSessionState,
    returnToOperatorPickerAfterTpvAction,
  ]);

  const autoCloseEmptyTableInProgressRef = useRef<string | null>(null);

  const autoCloseEmptyTableIfNeeded = useCallback(
    async (
      tableId: string,
      lines: CartOrderLine[],
      cachedTableLines?: CartOrderLine[],
    ) => {
      const tid = tableId.trim();
      if (!tid) return;
      if (countActiveComandaLines(lines) > 0) return;
      if (countActiveComandaLines(cachedTableLines ?? []) > 0) return;
      if (autoCloseEmptyTableInProgressRef.current === tid) return;

      autoCloseEmptyTableInProgressRef.current = tid;
      try {
        if (restaurantId && isFirebaseConfigured) {
          const rid = restaurantId.trim();
          const snap = await getDocs(
            query(
              collection(db, "orders"),
              where("restaurantId", "==", rid),
              where("tableId", "==", tid),
            ),
          );
          for (const d of snap.docs) {
            const data = d.data() as {
              restaurantId?: string;
              status?: string;
              items?: unknown;
              total?: unknown;
            };
            if (data.restaurantId !== rid) continue;
            if (!isOrderStatusActiveForTableOccupancy(data.status)) continue;
            if (orderDocHasActiveLinesForMapOccupancy(data)) {
              return;
            }
          }
          await autoCloseTableViaApi({
            tableId: tid,
            idempotencyKey: `auto-close:${rid}:${tid}`,
          });
        }
        finishPaymentAndReturnToMap(tid);
      } catch (error) {
        console.error("[autoCloseEmptyTable]", error);
      } finally {
        if (autoCloseEmptyTableInProgressRef.current === tid) {
          autoCloseEmptyTableInProgressRef.current = null;
        }
      }
    },
    [
      restaurantId,
      isFirebaseConfigured,
      finishPaymentAndReturnToMap,
      groupedTablesMapHandlers,
    ],
  );

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
    if (remainingDue <= MONEY_EPS) return;
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

  const handleCloseZeroTotalAccount = useCallback(async () => {
    if (!canCharge) return;
    if (!restaurantId) {
      window.alert("No se pudo cerrar la cuenta");
      return;
    }
    if (!selectedTableId?.trim()) return;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return;

    const remainingBeforeClose = roundMoney(
      Math.max(
        calculateFinalTotal(total).finalTotal - sessionTableAmountPaidSum,
        0,
      ),
    );
    if (remainingBeforeClose > MONEY_EPS) return;

    const tableIdForFinish = selectedTableId.trim();
    try {
      await closeTableGroupInFirestore(tableIdForFinish);
      setGuestCount(0);
      if (soundEnabled) playClickSound();
      finishPaymentAndReturnToMap(tableIdForFinish);
    } catch (error) {
      console.error("[handleCloseZeroTotalAccount]", error);
      window.alert("No se pudo cerrar la cuenta");
    }
  }, [
    canCharge,
    restaurantId,
    selectedTableId,
    connectivityStatus,
    calculateFinalTotal,
    total,
    sessionTableAmountPaidSum,
    closeTableGroupInFirestore,
    finishPaymentAndReturnToMap,
    soundEnabled,
    playClickSound,
  ]);

  const handleConfirmPayment = useCallback(async (opts?: {
    overrideTotal?: number;
    part?: number;
    totalParts?: number;
    keepModalOpen?: boolean;
    skipCloseTable?: boolean;
    minimalPaymentDoc?: boolean;
  }) => {
    if (!canCharge) return;
    if (!restaurantId) {
      window.alert("No se pudo registrar el cobro");
      return;
    }
    if (!paymentMethod) return;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return;

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
        chargeAmount = roundMoney(
          Math.min(roundMoney(cashParsed), remainingBeforePay),
        );
      } else if (pm === "card") {
        chargeAmount =
          cardReceived.trim() === ""
            ? remainingBeforePay
            : roundMoney(Math.min(cardParsed, remainingBeforePay));
      } else {
        chargeAmount = roundMoney(Math.min(voucherValue, remainingBeforePay));
      }

      if (chargeAmount <= MONEY_EPS) {
        window.alert("El importe a cobrar debe ser mayor que 0.");
        return;
      }
      if (
        pm !== "cash" &&
        chargeAmount > remainingBeforePay + MONEY_EPS
      ) {
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
    if (!primaryOrderId) {
      window.alert("No se encontró la comanda activa para cobrar.");
      return;
    }

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

      console.log("[handleConfirmPayment] await chargeOrderViaApi start", {
        paymentMethod: pm,
        chargeAmount,
        isAccountFinalPayment,
      });
      const chargeResult = await chargeOrderViaApi({
        orderId: primaryOrderId,
        tableId: selectedTableId || selectedTable?.id || undefined,
        tableName:
          selectedTable?.name ||
          (selectedTable as { label?: string } | null)?.label ||
          undefined,
        paymentMethod: pm,
        type: isSplitEqualInstallment ? "split_equal" : "table_amount",
        amount: chargeAmount,
        part: safeOpts.part,
        totalParts: safeOpts.totalParts,
        orderSessionId: orderSessionId || undefined,
        idempotencyKey: `${primaryOrderId}:${ticketNumber}`,
        tip: tipVal,
        received: receivedVal,
        cashReceived: pm === "cash" ? cashParsed : undefined,
        change: changeVal,
        voucherAmount: pm === "voucher" ? voucherValue : undefined,
        voucherNumber: pm === "voucher" ? voucherNumber.trim() : undefined,
        ticketNumber,
        invoiceNumber: isInvoice ? invoiceNumber : undefined,
        invoice: isInvoice
          ? {
              name: invoiceName,
              taxId: invoiceTaxId,
              email: invoiceEmail,
            }
          : undefined,
        waiterId: waiterId ?? undefined,
        waiterEmail: waiterEmail ?? undefined,
      });
      if (!chargeResult.ok) {
        throw new Error(chargeResult.error);
      }
      const paymentRef = { id: chargeResult.paymentId };
      console.log("[handleConfirmPayment] await chargeOrderViaApi ok", {
        paymentId: paymentRef.id,
      });

      if (
        selectedBillingCustomer &&
        !isSplitEqualInstallment &&
        isAccountFinalPayment
      ) {
        const billingRestaurantId =
          (operationalRestaurantId ?? restaurantId)?.trim() ?? "";
        if (billingRestaurantId) {
          try {
            const createdBillingInvoice = await createBillingInvoiceFromPayment({
              restaurantId: billingRestaurantId,
              billingCustomer: selectedBillingCustomer,
              orderId: primaryOrderId,
              tableId: selectedTableId || selectedTable?.id || null,
              paymentMethod: pm,
              lines: mapCartOrderLinesToBillingSources(order),
              subtotal: roundMoney(breakdown.finalTotal),
              taxes: 0,
              total: roundMoney(breakdown.finalTotal),
            });
            setLastBillingInvoice(createdBillingInvoice);
            setIsBillingInvoicePanelOpen(true);
          } catch (billingError) {
            console.error(
              "[billing] createBillingInvoiceFromPayment",
              billingError,
            );
          }
        }
      }

      void createActivityLog({
        restaurantId,
        type: "payment_created",
        entityType: "payment",
        entityId: paymentRef.id,
        actorUserId: waiterId ?? undefined,
        actorUserName: activityActorName,
        actorRole: activityActorRole,
        metadata: buildActivityMetadata({
          tableId: selectedTableId || selectedTable?.id || null,
          tableName:
            selectedTable?.name ||
            (selectedTable as { label?: string } | null)?.label ||
            "",
          orderId: primaryOrderId,
          amount: chargeAmount,
          paymentMethod: pm,
          ticketNumber,
          paymentKind: isAccountFinalPayment ? "final" : "partial",
          isPartial: !isAccountFinalPayment,
          route: "tpv",
        }),
      });
      if (pm === "voucher") {
        console.log("[handleConfirmPayment] activity log dispatched (void, no await)");
      }

      if (!isSplitEqualInstallment) {
        void reloadSessionTableAmountPaidSum();
      }

      if (pm === "voucher") {
        console.log("[handleConfirmPayment] await upsertVoucherBalanceAfterPayment start", {
          voucherNumber: voucherNumber.trim(),
          voucherValue,
          voucherRemaining,
        });
        await upsertVoucherBalanceAfterPayment(
          db,
          restaurantId,
          voucherNumber,
          voucherValue,
          voucherRemaining,
        );
        console.log("[handleConfirmPayment] await upsertVoucherBalanceAfterPayment ok");
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
        console.log("[handleConfirmPayment] await closeTableGroupInFirestore start", {
          tableId: selectedTableId,
        });
        await closeTableGroupInFirestore(selectedTableId!);
        console.log("[handleConfirmPayment] await closeTableGroupInFirestore ok", {
          tableId: selectedTableId,
        });
        setGuestCount(0);
      }

      if (!keepModalOpen) {
        finishPaymentAndReturnToMap(tableIdForFinish ?? null);
      }
    } catch (error) {
      console.error(
        "[VOUCHER PAYMENT ERROR]",
        error,
        {
          code: (error as { code?: string })?.code,
          message: (error as { message?: string })?.message,
          stack: (error as { stack?: string })?.stack,
        },
      );
      console.error("ERROR REGISTRANDO COBRO", error);
      window.alert("No se pudo registrar el cobro");
      return;
    }

    if (keepModalOpen) {
      const prefillRemaining = remainingAfterPay.toFixed(2).replace(".", ",");
      if (paymentMethod === "cash") {
        setCashReceived(prefillRemaining);
      } else {
        setCashReceived("");
      }
      if (paymentMethod === "card") {
        setCardReceivedTouched(false);
        setCardReceived(prefillRemaining);
      } else {
        setCardReceived("");
        setCardReceivedTouched(false);
      }
      if (paymentMethod === "voucher") {
        setVoucherAmount(prefillRemaining);
      } else {
        setVoucherAmount("");
      }
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
    closeTableGroupInFirestore,
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
    operationalRestaurantId,
    selectedBillingCustomer,
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
    activityActorName,
    activityActorRole,
    connectivityStatus,
    canCharge,
  ]);

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
    const unsub = listenTablesByRestaurantId(
      rid,
      (list) => {
        setTablesList(list);
      },
      (err) => {
        console.error("[TPV] listenTables", err);
      },
    );
    return () => {
      unsub();
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (
      !authReady ||
      !user?.uid ||
      !rid ||
      !isFirebaseConfigured
    ) {
      setZonesList([]);
      return;
    }
    const unsub = listenZonesByRestaurantId(
      rid,
      (list) => {
        setZonesList(list);
      },
      (err) => {
        console.error("[TPV] listenZones", err);
      },
    );
    return () => {
      unsub();
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
    if (!authReady || !user?.uid || !rid || !isFirebaseConfigured) {
      setFloorPlans([]);
      setSelectedTpvFloorPlanId(null);
      return;
    }
    const unsub = listenFloorPlansByRestaurantId(
      rid,
      (plans) => {
        setFloorPlans(plans);
        setSelectedTpvFloorPlanId((current) => {
          const op = plans.filter(
            (p) => p.active !== false && p.showInTpv !== false,
          );
          const pool = op.length > 0 ? op : plans;
          if (current) {
            const cur = plans.find((p) => p.id === current);
            if (
              cur &&
              cur.active !== false &&
              cur.showInTpv !== false &&
              pool.some((p) => p.id === current)
            ) {
              return current;
            }
          }
          const def = pool.find((p) => p.isDefault === true);
          return def?.id ?? pool[0]?.id ?? null;
        });
      },
      (err) => {
        console.error("[TPV] listenFloorPlans", err);
      },
    );
    return () => {
      unsub();
    };
  }, [authReady, user?.uid ?? null, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setRestaurantWaiters([]);
      setRestaurantWaitersLoadStatus("idle");
      setRestaurantWaitersErrorKind(null);
      return;
    }
    setRestaurantWaiters([]);
    setRestaurantWaitersLoadStatus("loading");
    setRestaurantWaitersErrorKind(null);
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
        setRestaurantWaitersLoadStatus("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setRestaurantWaitersLoadStatus("error");
          setRestaurantWaitersErrorKind(
            e instanceof RestaurantRosterError ? e.kind : "network",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    restaurantId,
    isFirebaseConfigured,
    restaurantWaitersReloadToken,
  ]);

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
        if (!snap.exists()) {
          setOrderDeepLinkNotice("Comanda no encontrada");
          return;
        }
        const data = snap.data() as FirestoreOrderDocForCart;
        const st = String((data as { status?: string } | null)?.status ?? "")
          .trim()
          .toLowerCase();
        if (st === "paid" || st === "closed") {
          setOrderDeepLinkNotice("Comanda no está activa");
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
        const mapped = mapFirestoreOrderDocToCartLines(
          data,
          restaurantId,
          operationalCatalog.productDocumentsById,
        );
        if (mapped == null) return;
        if (cancelled) return;
        setOrderDeepLinkNotice(null);
        setOrder(mapped);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    orderIdFromUrl,
    restaurantId,
    isFirebaseConfigured,
    operationalCatalog.productDocumentsById,
  ]);

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
      setOrderDeepLinkNotice(null);
      setOrderDeepLinkLineNotice(null);
      return;
    }
    if (!isAuthReady()) {
      setOrderUrlDocStatus(null);
      setOrderUrlPaymentRequestedAt(false);
      setOrderUrlOpenedAtMs(null);
      setOrderUrlNote("");
      setOrderUrlTableId(null);
      setOrderDeepLinkNotice(null);
      setOrderDeepLinkLineNotice(null);
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
        setOrderDeepLinkNotice("Comanda no encontrada");
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
        setOrderDeepLinkNotice("Comanda no encontrada");
        return;
      }
      const st = data.status;
      const statusNorm =
        typeof st === "string" ? st.trim().toLowerCase() : "";
      setOrderUrlDocStatus(typeof st === "string" ? st : null);
      if (statusNorm === "paid" || statusNorm === "closed") {
        setOrderDeepLinkNotice("Comanda no está activa");
      } else {
        setOrderDeepLinkNotice(null);
      }
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

  useEffect(() => {
    if (!orderIdFromUrl || !lineIdFromUrl) {
      setOrderDeepLinkLineNotice(null);
      return;
    }
    if (orderDeepLinkNotice) {
      setOrderDeepLinkLineNotice(null);
      return;
    }
    if (order.length === 0) return;
    const hasLine = order.some((line) => line.id === lineIdFromUrl);
    if (!hasLine) {
      setOrderDeepLinkLineNotice("Línea enlazada no encontrada en esta comanda");
      return;
    }
    setOrderDeepLinkLineNotice(null);
    return scheduleScrollAndHighlightById(hostlyHighlightOrderLineElementId(lineIdFromUrl));
  }, [lineIdFromUrl, order, orderDeepLinkNotice, orderIdFromUrl]);

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

  /** Sync estados de producción (Cocina/Sala) → comanda TPV en mesa abierta. */
  useEffect(() => {
    if (!authReady || !user?.uid || !restaurantId?.trim() || !isFirebaseConfigured) {
      return;
    }
    if (!isAuthReady()) return;

    const activeOrderId = (() => {
      const fromUrl = orderIdFromUrl?.trim();
      if (fromUrl) return fromUrl;
      const tid = selectedTableId?.trim();
      if (!tid) return null;
      const fromDraft = openDraftOrderIdByTableRef.current[tid]?.trim();
      if (fromDraft) return fromDraft;
      return openOrderIdsForTable[0]?.trim() ?? null;
    })();

    if (!activeOrderId) return;

    const rid = restaurantId.trim();
    const ref = doc(db, "orders", activeOrderId);
    let cancelled = false;

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) return;
        if (isComandaSendingRef.current) return;
        if (cancellingLineIdsRef.current.size > 0) return;

        const data = snap.data() as FirestoreOrderDocForCart;
        if (data.restaurantId !== rid) return;

        const statusNorm = String(
          (data as { status?: string }).status ?? "",
        )
          .trim()
          .toLowerCase();
        if (statusNorm === "paid" || statusNorm === "closed") return;

        const tableId = (
          orderIdFromUrl
            ? orderUrlTableId
            : selectedTableIdRef.current
        )?.trim() ?? null;

        if (orderIdFromUrl) {
          const localLines = orderRef.current;
          const nextLines = buildSyncedOrderLinesFromServerDoc(
            localLines,
            data,
            rid,
            operationalCatalog.productDocumentsById,
            { localDraftAuthoritative: true },
          );
          setOrder((prev) =>
            cartLinesProductionSnapshotEqual(prev, nextLines) &&
            prev.length === nextLines.length
              ? prev
              : nextLines,
          );
          return;
        }

        if (!tableId) return;

        openDraftOrderIdByTableRef.current[tableId] = activeOrderId;

        const localTableLines = ordersByTableRef.current[tableId] ?? [];
        const hasLocalDraft = Object.prototype.hasOwnProperty.call(
          ordersByTableRef.current,
          tableId,
        );
        const nextTableLines = buildSyncedOrderLinesFromServerDoc(
          localTableLines,
          data,
          rid,
          operationalCatalog.productDocumentsById,
          { localDraftAuthoritative: hasLocalDraft },
        );

        setOrdersByTable((prev) => {
          const cur = prev[tableId] ?? [];
          if (
            cartLinesProductionSnapshotEqual(cur, nextTableLines) &&
            cur.length === nextTableLines.length
          ) {
            return prev;
          }
          return { ...prev, [tableId]: nextTableLines };
        });

        if (selectedTableIdRef.current === tableId) {
          setOrder((prev) =>
            cartLinesProductionSnapshotEqual(prev, nextTableLines) &&
            prev.length === nextTableLines.length
              ? prev
              : nextTableLines,
          );
        }
      },
      (err) => {
        console.error("[tpv:orderLinesRealtimeSync]", err);
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [
    authReady,
    user?.uid ?? null,
    restaurantId,
    isFirebaseConfigured,
    orderIdFromUrl,
    selectedTableId,
    openOrderIdsForTable,
    orderUrlTableId,
    operationalCatalog.productDocumentsById,
  ]);

  useEffect(() => {
    if (viewMode !== "normal") return;
    if (isPaymentOpen || isComandaSending || cancellingLineIds.size > 0) return;

    const tableId = (
      orderIdFromUrl ? orderUrlTableId : selectedTableId
    )?.trim();
    if (!tableId) return;

    const draftOrderId =
      openDraftOrderIdByTableRef.current[tableId]?.trim() || null;
    const cachedTableLines = ordersByTable[tableId];
    const tableRow = tablesList.find((t) => t.id === tableId);
    if (
      !tableEmptySessionWarrantsAutoClose({
        lines: order,
        cachedTableLines,
        openOrderIds: openOrderIdsForTable,
        firestoreOccupied: firestoreOccupiedTableIds.has(tableId),
        draftOrderId,
        tableHasOperationalSession: tableDocHasOperationalSession(tableRow),
      })
    ) {
      return;
    }

    void autoCloseEmptyTableIfNeeded(tableId, order, cachedTableLines);
  }, [
    order,
    ordersByTable,
    orderIdFromUrl,
    orderUrlTableId,
    selectedTableId,
    openOrderIdsForTable,
    firestoreOccupiedTableIds,
    tablesList,
    viewMode,
    isPaymentOpen,
    isComandaSending,
    cancellingLineIds,
    autoCloseEmptyTableIfNeeded,
  ]);

  useEffect(() => {
    if (!embeddedInOperacion) return;
    try {
      if (sessionStorage.getItem(OPERATOR_CHANGE_NAV_RESET_KEY) !== "1") return;
      sessionStorage.removeItem(OPERATOR_CHANGE_NAV_RESET_KEY);
    } catch {
      return;
    }
    suppressUrlTableSelectionRef.current = true;
    userOpenedTableFromMapRef.current = null;
    setSelectedTableId(null);
    setOrder([]);
    setTpvEntryMode("map");
    sessionTableScopeRef.current = null;
    clearOperacionTpvUrlParams();
  }, [embeddedInOperacion]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (suppressUrlTableSelectionRef.current) {
      if (!tableIdFromUrl?.trim()) {
        suppressUrlTableSelectionRef.current = false;
      }
      return;
    }
    if (!tableIdFromUrl?.trim()) return;
    const id = tableIdFromUrl.trim();
    setSelectedTableId(id);
    setTpvEntryMode(tpvViewFromUrl === "summary" ? "summary" : "tpv");
  }, [orderIdFromUrl, tableIdFromUrl, tpvViewFromUrl]);

  const tpvBasePath = embeddedInOperacion
    ? "/dashboard/operacion/tpv"
    : "/dashboard/carta";

  /** Sin mesa activa: nunca dejar catálogo TPV suelto (p. ej. tras refresh post-cobro). */
  useEffect(() => {
    if (orderIdFromUrl) return;
    if (selectedTableId?.trim()) return;
    if (tableIdFromUrl?.trim()) return;

    setOrder([]);
    if (tpvEntryMode !== "map") {
      setTpvEntryMode("map");
    }
  }, [orderIdFromUrl, selectedTableId, tpvEntryMode, tableIdFromUrl]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (selectedTableId?.trim() || tableIdFromUrl?.trim()) return;
    setTpvEntryMode("map");
  }, [
    orderIdFromUrl,
    selectedTableId,
    tableIdFromUrl,
    isFirebaseConfigured,
    authReady,
    restaurantId,
  ]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!selectedTableId) {
      setOrder([]);
      return;
    }
    const tid = selectedTableId.trim();
    if (openingTableRef.current === tid) {
      // La hidratación puede terminar mientras el gate de apertura bloquea el sync;
      // al liberar el gate, volcar `ordersByTable` a `order` (la UI renderiza `order`).
      const openId = tid;
      const t = window.setTimeout(() => {
        if (openingTableRef.current === openId) return;
        if (selectedTableIdRef.current !== openId) return;
        const lines = ordersByTableRef.current[openId];
        if (lines !== undefined) {
          setOrder(lines);
        }
      }, 320);
      return () => window.clearTimeout(t);
    }
    const lines = ordersByTable[tid];
    setOrder(lines ?? []);
  }, [selectedTableId, ordersByTable, orderIdFromUrl]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    const tid = selectedTableId?.trim() ?? null;
    if (sessionTableScopeRef.current === tid) return;
    sessionTableScopeRef.current = tid;
    setSessionTableAmountPaidSum(0);
    setSessionPaymentHistory([]);
    setIsPaymentOpen(false);
  }, [orderIdFromUrl, selectedTableId]);

  const invalidateTableGroupOrderCache = useCallback((memberIds: string[]) => {
    const ids = [
      ...new Set(memberIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
    ];
    if (ids.length === 0) return;
    for (const mid of ids) {
      delete openDraftOrderIdByTableRef.current[mid];
    }
    setOrdersByTable((prev) => {
      const next = { ...prev };
      for (const mid of ids) {
        delete next[mid];
      }
      return next;
    });
  }, []);

  const hydrateTableOrderFromFirestore = useCallback(
    async (tableId: string, opts?: { force?: boolean }) => {
      const tid = tableId.trim();
      if (!tid || !restaurantId || !isFirebaseConfigured || !isAuthReady()) {
        return;
      }
      try {
        const snapDoc = await fetchOpenOrderForTable(db, restaurantId, tid);
        if (!snapDoc) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrdersByTable((prev) => ({ ...prev, [tid]: prev[tid] ?? [] }));
            if (selectedTableIdRef.current === tid) {
              setOrder([]);
            }
          }
          return;
        }
        const data = snapDoc.data() as FirestoreOrderDocForCart;
        const mapped = mapFirestoreOrderDocToCartLines(
          data,
          restaurantId,
          operationalCatalog.productDocumentsById,
        );
        if (!mapped || mapped.length === 0) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrdersByTable((prev) => ({ ...prev, [tid]: prev[tid] ?? [] }));
            if (selectedTableIdRef.current === tid) {
              setOrder([]);
            }
          }
          return;
        }
        openDraftOrderIdByTableRef.current[tid] = snapDoc.id;
        setOrdersByTable((prev) => ({ ...prev, [tid]: mapped }));
        if (selectedTableIdRef.current === tid) {
          setOrder(mapped);
        }
        if (opts?.force) {
          console.group(
            "[Hostly:TableJoinMerge] TPV rehidratado desde Firestore",
          );
          console.log("tableId:", tid);
          console.log("orderId:", snapDoc.id);
          console.log(
            "items:",
            mapped.map(
              (line) =>
                `${line.quantity}x ${String(line.product?.nombre ?? "").trim()}`,
            ),
          );
          console.groupEnd();
        }
      } catch (e) {
        console.error("[hydrateTableOrderFromFirestore]", e);
      }
    },
    [
      restaurantId,
      isFirebaseConfigured,
      operationalCatalog.productDocumentsById,
    ],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableGroupOrdersMergedDetail>).detail;
      if (!detail?.mainTableId?.trim()) return;
      const rid = String(detail.restaurantId ?? "").trim();
      if (rid && restaurantId?.trim() !== rid) return;
      invalidateTableGroupOrderCache(detail.memberIds ?? []);
      void hydrateTableOrderFromFirestore(detail.mainTableId.trim(), {
        force: true,
      });
    };
    window.addEventListener(TABLE_GROUP_ORDERS_MERGED_EVENT, handler);
    return () => {
      window.removeEventListener(TABLE_GROUP_ORDERS_MERGED_EVENT, handler);
    };
  }, [
    restaurantId,
    invalidateTableGroupOrderCache,
    hydrateTableOrderFromFirestore,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableGroupOrdersSplitDetail>).detail;
      if (!detail?.mainTableId?.trim()) return;
      const rid = String(detail.restaurantId ?? "").trim();
      if (rid && restaurantId?.trim() !== rid) return;
      const memberIds = detail.memberIds ?? [];
      invalidateTableGroupOrderCache(memberIds);
      for (const memberId of memberIds) {
        void hydrateTableOrderFromFirestore(memberId);
      }
    };
    window.addEventListener(TABLE_GROUP_ORDERS_SPLIT_EVENT, handler);
    return () => {
      window.removeEventListener(TABLE_GROUP_ORDERS_SPLIT_EVENT, handler);
    };
  }, [
    restaurantId,
    invalidateTableGroupOrderCache,
    hydrateTableOrderFromFirestore,
  ]);

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
        const explicitMapOpen = userOpenedTableFromMapRef.current === tid;
        if (explicitMapOpen) {
          userOpenedTableFromMapRef.current = null;
        }
        if (!snapDoc) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrder([]);
            setOrdersByTable((prev) => ({ ...prev, [tid]: [] }));
            if (
              tableIdFromUrl?.trim() === tid &&
              !explicitMapOpen
            ) {
              suppressUrlTableSelectionRef.current = true;
              setSelectedTableId(null);
              setTpvEntryMode("map");
              router.replace(tpvBasePath);
            }
          }
          return;
        }
        const data = snapDoc.data() as FirestoreOrderDocForCart;
        const mapped = mapFirestoreOrderDocToCartLines(
          data,
          restaurantId,
          operationalCatalog.productDocumentsById,
        );
        if (!mapped || mapped.length === 0) {
          if (!firestoreOccupiedTableIdsRef.current.has(tid)) {
            setOrder([]);
            setOrdersByTable((prev) => ({ ...prev, [tid]: [] }));
            if (
              tableIdFromUrl?.trim() === tid &&
              !explicitMapOpen
            ) {
              suppressUrlTableSelectionRef.current = true;
              setSelectedTableId(null);
              setTpvEntryMode("map");
              router.replace(tpvBasePath);
            }
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
        if (selectedTableIdRef.current === tid) {
          setOrder(mapped);
        }
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
    tableIdFromUrl,
    router,
    tpvBasePath,
  ]);

  useEffect(() => {
    if (orderIdFromUrl) return;
    if (!selectedTableId) {
      setGuestCount(0);
      return;
    }
    const t = tablesList.find((x) => x.id === selectedTableId) ?? null;
    if (t == null || t.dinersCount === undefined) return;

    const next = readTableDinersCount(t);
    const pending = guestCountPersistRef.current;
    if (pending && pending.tableId === selectedTableId) {
      if (next === pending.value) {
        guestCountPersistRef.current = null;
        setGuestCount(next);
        return;
      }
      if (Date.now() - pending.at < 8000) {
        return;
      }
      guestCountPersistRef.current = null;
    }
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
        const next =
          parseStoredGuestCount(data?.dinersCount) ??
          parseStoredGuestCount(data?.guestCount);
        if (next == null) return;
        setGuestCount(next);
      } catch (e) {
        console.error("ERROR CARGANDO COMENSALES", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderIdFromUrl, selectedTableId, restaurantId, isFirebaseConfigured]);

  useEffect(() => {
    if (!modifierModalProduct) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModifierModalProduct(null);
        setModifierModalGroups([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modifierModalProduct]);

  useEffect(() => {
    if (!orderIdFromUrl || !firstPendingRef.current) return;
    firstPendingRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [orderIdFromUrl, order]);

  const appendProductToOrder = useCallback(
    (
      product: Product,
      modifierPayload?: {
        selectedModifiers: CartOrderLineSelectedModifier[];
        modifierTotal: number;
        displayName: string;
      },
      requestedQuantity = 1,
    ) => {
      const quantityToAdd = normalizeTpvPreAddQuantity(requestedQuantity);
      setIsAddingByProductId((prev) => ({
        ...prev,
        [product.id]: (prev[product.id] ?? 0) + quantityToAdd,
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
      }, 180);

      const productCourse = resolveProductDefaultCourse(product);
      const modifierKey = cartLineModifiersMergeKey(
        modifierPayload?.selectedModifiers,
      );

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
            cartLineModifiersMergeKey(i.selectedModifiers) === modifierKey &&
            comandaCoursesMatch(i.course, productCourse, {
              treatMissingLineCourseAsEntrante: productCourse != null,
            }),
        );

        if (existingIndex !== -1) {
          const updated = [...prev];
          const cur = updated[existingIndex]!;
          const touchedAt = Date.now();
          const bumped: CartOrderLine = {
            ...cur,
            quantity: cur.quantity + quantityToAdd,
            addedAt: touchedAt,
          };
          updated[existingIndex] = bumped;
          setQtyBumpLineId(bumped.id);
          window.setTimeout(() => {
            setQtyBumpLineId((current) =>
              current === bumped.id ? null : current,
            );
          }, 180);
          return updated;
        }

        const pendingStatus: OrderLineStatus = "pending";
        const shadowCatalog = buildProductResolverParityContextFromProduct(
          product,
          operationalShadowCatalogSources,
        );
        const { stationFields, opFields } = resolveOperationalLineFieldsFromProduct(
          product,
          shadowCatalog,
        );
        const selectedModifiers = modifierPayload?.selectedModifiers;
        const modifierTotal = modifierPayload?.modifierTotal;
        const displayName = modifierPayload?.displayName?.trim();
        const newLine: CartOrderLine = {
          id: generateOrderLineId(),
          product: enrichProductWithStationFields(
            product,
            stationFields,
            opFields,
          ),
          quantity: quantityToAdd,
          status: pendingStatus,
          addedAt: Date.now(),
          createdAt: Date.now(),
          ...(productCourse != null ? { course: productCourse } : {}),
          ...stationFields,
          ...opFields,
          ...(selectedModifiers && selectedModifiers.length > 0
            ? { selectedModifiers }
            : {}),
          ...(modifierTotal != null && Number.isFinite(modifierTotal)
            ? { modifierTotal }
            : {}),
          ...(displayName ? { displayName } : {}),
        };

        return [...prev, newLine];
      });
    },
    [updateCurrentTableOrder, operationalShadowCatalogSources],
  );

  const appendPreAddQuantityDigit = useCallback((digit: number) => {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
    setPreAddQuantity((prev) => {
      const base = preAddQuantityInputActive ? String(prev) : "";
      const next = Number(`${base}${digit}`);
      const normalized = normalizeTpvPreAddQuantity(next);
      preAddQuantityRef.current = normalized;
      return normalized;
    });
    if (digit > 0 || preAddQuantityInputActive) {
      setPreAddQuantityInputActive(true);
    }
  }, [preAddQuantityInputActive]);

  const clearPreAddQuantity = useCallback(() => {
    preAddQuantityRef.current = 1;
    setPreAddQuantity(1);
    setPreAddQuantityInputActive(false);
  }, []);

  const handleProductAddRequest = useCallback(
    (product: Product) => {
      const quantityToAdd = normalizeTpvPreAddQuantity(preAddQuantityRef.current);
      const category = resolveCategoryForProduct(product, cartaCategories);
      const groups = resolveActiveEffectiveModifierGroups(
        product,
        category,
        modifierGroups,
      );
      if (groups.length === 0) {
        appendProductToOrder(product, undefined, quantityToAdd);
        preAddQuantityRef.current = 1;
        setPreAddQuantity(1);
        setPreAddQuantityInputActive(false);
        return;
      }
      setModifierModalPreAddQuantity(quantityToAdd);
      setModifierModalProduct(product);
      setModifierModalGroups(groups);
    },
    [appendProductToOrder, cartaCategories, modifierGroups],
  );

  const handleQuickAdd = handleProductAddRequest;

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
          const payloadItems = serializeOrderLinesToFirestoreItems(next);
          await syncEmbeddedOrderItems({
            operation: "send_items",
            orderId: orderIdFromUrl,
            lines: next,
          });
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
      await syncEmbeddedOrderItems({
        operation: "send_items",
        orderId: orderIdFromUrl,
        lines: next,
      });
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
      if (!canKdsManage) return;
      const previous = order;
      let next: CartOrderLine[] = [];
      updateCurrentTableOrder((prev) => {
        next = prev.map((l) => {
          const st = normalizeOrderLineStatus(l.status);
          if (
            l.id === itemId &&
            (st === "sent" || st === "preparing" || st === "prepared")
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
        const line = previous.find((l) => l.id === itemId);
        const expectedStatus = line ? normalizeOrderLineStatus(line.status) : "prepared";
        try {
          const result = await transitionLineStatusViaApi({
            orderId: orderDocId,
            lineId: itemId,
            expectedStatus,
            nextStatus: "served",
          });
          if (!result.ok) {
            throw new Error(result.error);
          }
        } catch (e) {
          updateCurrentTableOrder(() => previous);
          console.error("handleServeItem", e);
          window.alert("No se pudo marcar como servido. Inténtalo de nuevo.");
        }
      }
    },
    [
      canKdsManage,
      order,
      orderIdFromUrl,
      openOrderIdsForTable,
      isFirebaseConfigured,
      updateCurrentTableOrder,
    ],
  );

  const handleCancelSentOrderLine = useCallback(
    async (line: CartOrderLine) => {
      if (!canCancelLine) return;
      if (!isFirebaseConfigured) return;
      if (cancellingLineIds.has(line.id)) return;

      const st = normalizeOrderLineStatus(line.status);
      if (st === "pending") return;
      if (st === "cancelled") return;

      const statusBeforeCancel = st;

      const confirmMessage =
        st === "served"
          ? "¿Anular esta línea ya servida?"
          : "¿Anular esta línea ya enviada?";
      const ok = window.confirm(confirmMessage);
      if (!ok) return;
      if (!confirmCriticalActionIfUnstable(connectivityStatus)) return;

      const lineAny = line as unknown as {
        orderItemDocId?: unknown;
        orderId?: unknown;
      };
      const orderItemDocIdFromLine =
        typeof lineAny.orderItemDocId === "string" &&
        lineAny.orderItemDocId.trim()
          ? lineAny.orderItemDocId.trim()
          : null;
      const draftOrderId =
        selectedTableId != null
          ? openDraftOrderIdByTableRef.current[selectedTableId]?.trim() || null
          : null;
      const orderDocId =
        (typeof lineAny.orderId === "string" && lineAny.orderId.trim()
          ? lineAny.orderId.trim()
          : null) ??
        (orderIdFromUrl && orderIdFromUrl.trim() ? orderIdFromUrl.trim() : null) ??
        (openOrderIdsForTable.length > 0 ? openOrderIdsForTable[0]! : null) ??
        draftOrderId;

      if (!orderDocId) {
        window.alert("No se encontró la comanda activa de esta mesa.");
        return;
      }

      const nowMs = Date.now();
      const cancelledBy = activeOperator?.activeOperatorId ?? firebaseUserId;

      setCancellingLineIds((prev) => new Set(prev).add(line.id));
      let orderCancellationPersisted = false;
      try {
        let next: CartOrderLine[] = [];
        updateCurrentTableOrder((prev) => {
          next = prev.map((l) => {
            if (l.id !== line.id) return l;
            return {
              ...l,
              status: "cancelled" as const,
              cancelledAt: nowMs,
              cancelledBy,
            };
          });
          return next;
        });

        const billableTotal = sumCartOrderLinesTotal(next);
        await syncEmbeddedOrderItems({
          operation: "cancel_lines",
          orderId: orderDocId,
          lines: next,
          cancelledLineIds: [line.id],
        });
        orderCancellationPersisted = true;

        if (restaurantId) {
          try {
            const printCancel = await cancelPrintJobsForOrderLine(
              restaurantId,
              orderDocId,
              line.id,
            );
            if (printCancel.errors > 0) {
              console.warn(
                "[Hostly Print] algunos jobs no se cancelaron al anular línea",
                printCancel,
              );
            }
          } catch (printCancelErr) {
            console.warn(
              "[Hostly Print] cola no disponible al cancelar línea; producto cancelado.",
              printCancelErr,
            );
          }
        }

        try {
          const inventoryRestaurantId = operationalRestaurantId ?? restaurantId;
          if (inventoryRestaurantId) {
            const reversalResult =
              await createStockReversalMovementsForModifierConsumption({
                restaurantId: inventoryRestaurantId,
                orderId: orderDocId,
                line: {
                  id: line.id,
                  quantity: line.quantity,
                  status: statusBeforeCancel,
                  product: {
                    id: line.product.id,
                    nombre: line.product.nombre,
                  },
                  selectedModifiers: line.selectedModifiers,
                },
                userId: cancelledBy,
              });
            if (
              reversalResult.eligible &&
              reversalResult.failed > 0
            ) {
              console.warn(
                "[Hostly Inventory] reversión de modificadores incompleta; línea cancelada.",
                reversalResult,
              );
            }

            const recipeReversalResult =
              await createStockReversalMovementsForRecipeConsumption({
                restaurantId: inventoryRestaurantId,
                orderId: orderDocId,
                line: {
                  id: line.id,
                  quantity: line.quantity,
                  status: statusBeforeCancel,
                  product: {
                    id: line.product.id,
                    nombre: line.product.nombre,
                  },
                  selectedModifiers: line.selectedModifiers,
                },
                userId: cancelledBy,
              });
            if (
              recipeReversalResult.eligible &&
              recipeReversalResult.failed > 0
            ) {
              console.warn(
                "[Hostly Inventory] reversión de escandallo incompleta; línea cancelada.",
                recipeReversalResult,
              );
            }
          }
        } catch (inventoryReversalErr) {
          console.warn(
            "[Hostly Inventory] reversión de inventario no disponible; línea cancelada.",
            inventoryReversalErr,
          );
        }

        if (restaurantId) {
          void createActivityLog({
            restaurantId,
            type: "order_updated",
            entityType: "order",
            entityId: orderDocId,
            actorUserId: cancelledBy ?? undefined,
            actorUserName: activityActorName,
            actorRole: activityActorRole,
            metadata: buildActivityMetadata({
              action: "line_cancelled",
              lineId: line.id,
              cancelledLineIds: [line.id],
              productId: String(line.product.id ?? ""),
              productName: String(line.product.nombre ?? "").trim(),
              statusBeforeCancel,
              tableId: selectedTableId,
              route: "tpv",
            }),
          });
        }
      } catch (error) {
        console.error("handleCancelSentOrderLine", error);
        if (!orderCancellationPersisted) {
          window.alert("No se pudo anular la línea. Inténtalo otra vez.");
        } else {
          console.warn(
            "[handleCancelSentOrderLine] paso secundario falló tras anular comanda; línea ya cancelada.",
            error,
          );
        }
      } finally {
        setCancellingLineIds((prev) => {
          const n = new Set(prev);
          n.delete(line.id);
          return n;
        });
      }

      setEditSplitEnabled(false);
      setEditSplitQty(1);
      setComandaLineEditorId(null);
      setComandaLineActionsOpen(false);
      setComandaLineActionsTargetId(null);
      setComandaLineActionsAnchorRect(null);
    },
    [
      cancellingLineIds,
      isFirebaseConfigured,
      orderIdFromUrl,
      openOrderIdsForTable,
      updateCurrentTableOrder,
      restaurantId,
      operationalRestaurantId,
      selectedTableId,
      user,
      activityActorName,
      activityActorRole,
      connectivityStatus,
      canCancelLine,
    ],
  );

  const handleCancelPersistedLine = useCallback(
    async (itemId: string) => {
      const target = order.find((l) => l.id === itemId) ?? null;
      if (!target) return;
      await handleCancelSentOrderLine(target);
    },
    [order, handleCancelSentOrderLine],
  );

  const handleCancelProductFromLine = handleCancelSentOrderLine;

  const handleRemoveOnePersistedUnit = useCallback(
    async (itemId: string) => {
      if (!orderIdFromUrl || !isFirebaseConfigured) return;
      const target = order.find((l) => l.id === itemId);
      if (!target) return;
      const lineStatus = normalizeOrderLineStatus(target.status);
      if (lineStatus === "cancelled") return;

      const ok = window.confirm("¿Quitar 1 unidad de este producto?");
      if (!ok) return;

      const qtyBefore = Number(target.quantity) || 0;
      const shouldCancelPersisted =
        lineStatus !== "pending" && qtyBefore <= 1;

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
        await syncEmbeddedOrderItems({
          operation: shouldCancelPersisted ? "cancel_lines" : "persist_items",
          orderId: orderIdFromUrl,
          lines: next,
          cancelledLineIds: shouldCancelPersisted ? [itemId] : undefined,
        });
      } catch (e) {
        console.error("handleRemoveOnePersistedUnit", e);
        window.alert("No se pudo actualizar la cantidad. Inténtalo otra vez.");
      }
    },
    [
      order,
      orderIdFromUrl,
      isFirebaseConfigured,
      updateCurrentTableOrder,
      restaurantId,
      selectedTableId,
    ],
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
      const lineStatus = normalizeOrderLineStatus(selectedLine.status);
      const shouldCancelPersisted =
        shouldCancel && lineStatus !== "pending" && lineStatus !== "cancelled";

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

      // Persistencia autoritativa server-side
      if (orderDocId) {
        try {
          const result = await removeLineUnitViaApi({
            orderId: orderDocId,
            lineId: selectedLine.id,
          });
          if (!result.ok) {
            console.error("REMOVE ONE API ERROR", result.error);
          }
        } catch (e) {
          console.error("REMOVE ONE API ERROR", e);
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
      restaurantId,
      selectedTableId,
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
        if (orderId) {
          const result = await compLineViaApi({
            orderId,
            lineId: lineEditorTarget.id,
            comped: true,
            reason: "Invitación",
          });
          if (!result.ok) {
            console.error("COMP PRODUCT API ERROR", result.error);
          }
        }
      } catch (error) {
        console.error("COMP PRODUCT API ERROR", error);
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
          await syncEmbeddedOrderItems({
            operation: "persist_items",
            orderId: orderIdFromUrl,
            lines: next,
          });
        } catch (e) {
          console.error("handleRepeatItem", e);
        }
      }
    },
    [orderIdFromUrl, isFirebaseConfigured, updateCurrentTableOrder],
  );

  const handleApplyInlineMixer = useCallback(
    (
      lineId: string,
      option: ModifierGroupDocument["options"][number],
      mixerGroup: ModifierGroupDocument,
    ) => {
      updateCurrentTableOrder((prev) =>
        prev.map((line) => {
          if (line.id !== lineId || line.status !== "pending") return line;
          const mixer = resolveSimpleMixerGroup([mixerGroup]);
          if (!mixer) return line;
          const selectedModifiers = buildMixerSelectionForLine(
            line.selectedModifiers,
            mixer,
            option,
          );
          const modifierTotal = selectedModifiers.reduce(
            (sum, mod) => sum + (Number.isFinite(mod.priceDelta) ? mod.priceDelta : 0),
            0,
          );
          return {
            ...line,
            selectedModifiers,
            modifierTotal,
            displayName: buildCartLineDisplayName(
              line.product.nombre,
              selectedModifiers,
            ),
          };
        }),
      );
    },
    [updateCurrentTableOrder],
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
    const result = await closeOrderViaApi({ orderId: orderIdFromUrl });
    if (!result.ok) {
      console.error("[handleMarkOrderClosed]", result.error);
      return;
    }
    setOrder([]);
  };

  const categoryTabNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const cat = p.categoria || "Sin categoría";
      if (resolveTpvMenuGroupFromCategoryName(cat) === menuGroup) set.add(cat);
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
        tpvMenuGroupForProduct(p) === menuGroup,
    );
    const scoped = !effectiveSelectedCategory
      ? inGroup
      : inGroup.filter(
          (p) => (p.categoria || "Sin categoría") === effectiveSelectedCategory,
        );
    return [...scoped].sort(compareOperationalProducts);
  }, [products, menuGroup, effectiveSelectedCategory]);

  const groupedProducts = useMemo(() => {
    const acc = filteredProducts.reduce<Record<string, Product[]>>((map, product) => {
      const cat = product.categoria || "Sin categoría";
      if (!map[cat]) map[cat] = [];
      map[cat].push(product);
      return map;
    }, {});
    for (const cat of Object.keys(acc)) {
      acc[cat]!.sort(compareOperationalProducts);
    }
    return acc;
  }, [filteredProducts]);
  const hasVisibleProductsForCurrentMenu = useMemo(
    () => Object.values(groupedProducts).some((items) => items.length > 0),
    [groupedProducts],
  );

  const showAuthSpinner = !authReady;
  const showProductsSpinner = authReady && productsLoading && !catalogLoadError;

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
    const visibleOperationalFloorPlans = floorPlans.filter(
      (plan) => plan.active !== false && plan.showInTpv !== false,
    );
    const hasMultipleOperationalFloorPlans = visibleOperationalFloorPlans.length > 1;
    return activeElements.filter((element) =>
      hasMultipleOperationalFloorPlans &&
      !isDecorativePlanElementType(element.type) &&
      !element.floorPlanId?.trim()
        ? false
        : entityBelongsToFloorPlan(element, selectedTpvFloorPlanId, floorPlans),
    );
  }, [tablesList, selectedTpvFloorPlanId, floorPlans]);

  const zonesForTpvMap = useMemo(() => {
    if (!selectedTpvFloorPlanId) return zonesList;
    return zonesList.filter((zone) =>
      entityBelongsToFloorPlan(zone, selectedTpvFloorPlanId, floorPlans),
    );
  }, [zonesList, selectedTpvFloorPlanId, floorPlans]);

  const readonlyMapIntegration = useMemo(() => {
    const hasV2Draft = salaEditorDraftDocument != null;
    const normalizedFloorPlanId = String(selectedTpvFloorPlanId ?? "").trim();
    let reasonForFallback: string | null = null;
    let matchedSpaceId: string | null = null;

    if (!hasV2Draft) {
      reasonForFallback = salaEditorDraftLoadError
        ? "draft-load-error"
        : "missing-v2-draft";
    } else if (!normalizedFloorPlanId) {
      reasonForFallback = "missing-selected-floor-plan";
    }

    const matchedSpace =
      hasV2Draft && normalizedFloorPlanId
        ? salaEditorDraftDocument.espacios.find(
            (space) =>
              String(space.legacyFloorPlanId ?? "").trim() === normalizedFloorPlanId,
          ) ?? null
        : null;

    if (matchedSpace) {
      matchedSpaceId = matchedSpace.id;
    } else if (!reasonForFallback && normalizedFloorPlanId) {
      reasonForFallback = "missing-linked-v2-space";
    }

    const contract =
      salaEditorDraftDocument && matchedSpace
        ? buildEditorTpvReadonlyVisualContract(
            salaEditorDraftDocument,
            matchedSpace.id,
          )
        : null;

    if (!contract && matchedSpace && !reasonForFallback) {
      reasonForFallback = "readonly-contract-unavailable";
    }

    const visualLayersEnabled = contract
      ? [
          contract.surfaces.length > 0 ? "surfaces" : "",
          contract.zones.length > 0 ? "zones" : "",
          contract.walls.length > 0 ? "walls" : "",
          contract.wallAttachments.length > 0 ? "wallAttachments" : "",
          contract.structuralElements.length > 0 ? "structural" : "",
          contract.landscapeElements.length > 0 ? "landscape" : "",
          contract.operationalElementInstances.length > 0
            ? "operationalInstances"
            : "",
        ].filter(Boolean)
      : [];

    return {
      hasV2Draft,
      matchedSpaceId,
      contract,
      rendererUsed: contract ? "v2-readonly" : "legacy-fallback",
      visualLayersEnabled,
      operationalOverlayEnabled: true,
      reasonForFallback,
    } as const;
  }, [
    salaEditorDraftDocument,
    salaEditorDraftLoadError,
    selectedTpvFloorPlanId,
  ]);

  const useReadonlyV2Map = readonlyMapIntegration.rendererUsed === "v2-readonly";

  /** TPV: las zonas son capa visual readonly del espacio, no elementos operativos. */
  const zonesForOperationalMapRender = useMemo(
    () => (useReadonlyV2Map ? [] : zonesForTpvMap),
    [useReadonlyV2Map, zonesForTpvMap],
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

  /** Operación TPV: mis mesas ocupadas del operador activo + todas las libres. */
  const tablesVisibleForMapFilter = useMemo(() => {
    if (!embeddedInOperacion || myTablesMapScope !== "mine") {
      return tablesFilteredByWaiter;
    }
    const operatorId = activeOperator?.activeOperatorId?.trim();
    if (!operatorId) return tablesFilteredByWaiter;

    const assignmentByTableId = new Map<string, string | undefined>();
    for (const row of tablesList) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      assignmentByTableId.set(id, row.assignedOperatorId?.trim());
    }

    return tablesFilteredByWaiter.filter((table) => {
      const id = String(table.id ?? "").trim();
      if (!id) return false;
      const group = resolveJoinedTableGroupMapState(
        id,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      if (!group.busy) return true;
      const assignedId =
        assignmentByTableId.get(group.serviceTableId) ??
        table.assignedOperatorId?.trim();
      return assignedId === operatorId;
    });
  }, [
    embeddedInOperacion,
    myTablesMapScope,
    activeOperator?.activeOperatorId,
    tablesFilteredByWaiter,
    tablesList,
    groupedTablesMapHandlers,
    firestoreOccupiedTableIds,
    ordersByTable,
  ]);

  const enrichedTables = useMemo(() => {
    const list = tablesVisibleForMapFilter.filter((tbl) => String(tbl.id ?? "").trim() !== "");
    return list.map((tbl) => {
      const tableId = String(tbl.id ?? "").trim();
      const group = resolveJoinedTableGroupMapState(
        tableId,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      return {
        ...tbl,
        activeLineCount: countActiveComandaLines(
          ordersByTable[group.serviceTableId] ?? [],
        ),
        busy: group.busy,
      };
    });
  }, [
    tablesVisibleForMapFilter,
    firestoreOccupiedTableIds,
    groupedTablesMapHandlers,
    ordersByTable,
  ]);

  /** Mapa TPV: pase pendiente de marcha por mesa (p. ej. «Segundos»). */
  const pendingMarchPassHintByTableId = useMemo(() => {
    const hints: Record<string, string> = {};
    for (const [tableId, lines] of Object.entries(ordersByTable)) {
      const scopedLines =
        operationalCatalog.source === "central"
          ? lines.map((line) =>
              enrichCartLineCourseFromCatalog(
                line,
                operationalCatalog.productDocumentsById,
              ),
            )
          : lines;
      const hint = resolvePendingMarchPassMapHint(
        scopedLines,
        isComandaAlreadyIssuedForLines(scopedLines),
      );
      if (hint) hints[tableId] = hint;
    }
    return hints;
  }, [ordersByTable, operationalCatalog.source, operationalCatalog.productDocumentsById]);

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

  const isTableOccupiedOnMap = useCallback(
    (tableId: string) =>
      resolveJoinedTableGroupMapState(
        tableId,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      ).busy,
    [firestoreOccupiedTableIds, groupedTablesMapHandlers, ordersByTable],
  );

  /** Resumen numérico de mesas visibles (respeta `tablesVisibleForMapFilter`). Libres / ocupadas / reservadas
   *  alinean con colores del mapa: ocupada = comanda Firestore o líneas en memoria; reservada = libre de comanda y
   *  con reserva del día asignada a la mesa. */
  const mapQuickSummary = useMemo(() => {
    let total = 0;
    let free = 0;
    let reserved = 0;
    let busy = 0;
    let warning = 0;
    let critical = 0;
    for (const t of tablesVisibleForMapFilter) {
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

      const mapOccupied = isTableOccupiedOnMap(id);
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
    tablesVisibleForMapFilter,
    isTableOccupiedOnMap,
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
      const group = resolveJoinedTableGroupMapState(
        tableId,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      const busy = group.busy;
      const occupancyStartMs =
        firestoreOccupancyStartMsByTable[group.serviceTableId] ?? null;
      const minutesOccupied =
        occupancyStartMs != null
          ? Math.max(0, (now - occupancyStartMs) / 60000)
          : 0;
      const activeLineCount = countActiveComandaLines(
        ordersByTable[group.serviceTableId] ?? [],
      );
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
    [
      firestoreOccupiedTableIds,
      firestoreOccupancyStartMsByTable,
      groupedTablesMapHandlers,
      ordersByTable,
      now,
    ],
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

  const handleMapWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const showTableMap = useMemo(
    () => {
      if (viewMode !== "normal" || orderIdFromUrl) return false;
      if (!selectedTableId?.trim()) return true;
      return (
        tpvEntryMode === "map" &&
        authReady &&
        isFirebaseConfigured &&
        Boolean(restaurantId)
      );
    },
    [
      viewMode,
      tpvEntryMode,
      orderIdFromUrl,
      authReady,
      isFirebaseConfigured,
      restaurantId,
      selectedTableId,
    ],
  );

  useEffect(() => {
    if (!embeddedInOperacion || !onEmbeddedOperacionChromeChange) return;
    onEmbeddedOperacionChromeChange({
      hideShellTopBar: !showTableMap,
    });
  }, [embeddedInOperacion, showTableMap, onEmbeddedOperacionChromeChange]);

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

      const group = resolveJoinedTableGroupMapState(
        tableId,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      const serviceTableId = group.serviceTableId;
      const tableLines = ordersByTable[serviceTableId] ?? [];
      const busy = mapOccupied;
      const openedAtMsRaw = orderOpenedAtByTable[serviceTableId];
      const openedAtMs =
        typeof openedAtMsRaw === "number" && Number.isFinite(openedAtMsRaw)
          ? openedAtMsRaw
          : undefined;
      const ot = orderTotalsByTable[serviceTableId];
      const orderTotal =
        typeof ot === "number" && Number.isFinite(ot) ? ot : undefined;
      const readyToClose = group.memberIds.some((memberId) =>
        salaReadyToCloseTableIds.has(memberId),
      );
      const rp = reservationPressureByTableId[tableId];
      const operationalState = resolveTableOperationalVisualState(
        buildTableOperationalVisualInput({
          busy,
          reserved: Boolean(reservedByTableId[tableId]),
          lines: tableLines,
          occupancyStartMs: firestoreOccupancyStartMsByTable[serviceTableId],
          orderOpenedAtMs: openedAtMs,
          orderTotal,
          mapNow: now,
          readyToClose,
          reservationPressure: rp ?? null,
        }),
      );

      if (activeMapFilter === "delayed") {
        return operationalState === "retrasada";
      }

      const dot = mapAlertDotFromOperationalState(operationalState);

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
    firestoreOccupiedTableIds,
    groupedTablesMapHandlers,
    firestoreOccupancyStartMsByTable,
    now,
    orderOpenedAtByTable,
    orderTotalsByTable,
    salaReadyToCloseTableIds,
    reservationPressureByTableId,
  ]);

  const readonlyV2TableHitboxParity = useMemo(() => {
    const contract = readonlyMapIntegration.contract;
    const visibleTableIds = new Set(
      mapTablesForChipFilter.map((table) => String(table.id ?? "").trim()).filter(Boolean),
    );
    const instanceByLegacyTableId = new Map<
      string,
      NonNullable<typeof contract>["operationalElementInstances"][number]
    >();
    const visibleV2WithoutTable: Array<{
      instanceId: string;
      name: string;
      legacyTableId: string | null;
      reason: "missing-legacy-table-id" | "table-not-renderable";
    }> = [];

    for (const instance of contract?.operationalElementInstances ?? []) {
      if (instance.elementType !== "TABLE") continue;
      const legacyTableId =
        typeof instance.metadata.legacyTableId === "string"
          ? instance.metadata.legacyTableId.trim()
          : "";
      if (legacyTableId && visibleTableIds.has(legacyTableId)) {
        instanceByLegacyTableId.set(legacyTableId, instance);
        continue;
      }
      visibleV2WithoutTable.push({
        instanceId: instance.id,
        name: instance.name,
        legacyTableId: legacyTableId || null,
        reason: legacyTableId ? "table-not-renderable" : "missing-legacy-table-id",
      });
    }

    const tableWithoutV2 = mapTablesForChipFilter
      .map((table) => ({
        tableId: String(table.id ?? "").trim(),
        name: String(table.name ?? "").trim(),
      }))
      .filter((table) => table.tableId && !instanceByLegacyTableId.has(table.tableId));

    const matchedInstanceIds = [...instanceByLegacyTableId.values()].map(
      (instance) => instance.id,
    );
    const rotatedMatches = [...instanceByLegacyTableId.values()].filter(
      (instance) =>
        typeof instance.rotation === "number" &&
        Number.isFinite(instance.rotation) &&
        Math.abs(instance.rotation) > 0.001,
    ).length;

    return {
      instanceByLegacyTableId,
      matchedInstanceIds,
      matchedTables: instanceByLegacyTableId.size,
      visibleV2WithoutTable,
      tableWithoutV2,
      rotatedMatches,
      fallbackLegacyVisible: tableWithoutV2.length,
    };
  }, [mapTablesForChipFilter, readonlyMapIntegration.contract]);

  const decorativePlanElementsForTpv = useMemo(() => {
    return planElementsForTpvMap.filter((element) =>
      isDecorativePlanElementType(element.type),
    );
  }, [planElementsForTpvMap]);

  const decorativeRenderedForTpvMap = useMemo(() => {
    const tableIds = new Set(
      mapTablesForChipFilter.map((table) => String(table.id ?? "").trim()),
    );
    return decorativePlanElementsForTpv.filter(
      (element) => !tableIds.has(String(element.id ?? "").trim()),
    );
  }, [decorativePlanElementsForTpv, mapTablesForChipFilter]);

  const mapElementsForTpvRender = useMemo(() => {
    if (useReadonlyV2Map) return [...mapTablesForChipFilter];
    return [...decorativeRenderedForTpvMap, ...mapTablesForChipFilter];
  }, [decorativeRenderedForTpvMap, mapTablesForChipFilter, useReadonlyV2Map]);

  const mapViewportFitSourceForTpv = useMemo<{
    source: "tables" | "decoratives" | "empty";
    elements: Table[];
  }>(() => {
    const tableFitElements =
      mapTablesForChipFilter.length > 0 ? mapTablesForChipFilter : tablesVisibleOnMap;
    if (tableFitElements.length > 0) {
      return { source: "tables", elements: tableFitElements };
    }
    if (decorativeRenderedForTpvMap.length > 0) {
      return { source: "decoratives", elements: decorativeRenderedForTpvMap };
    }
    return { source: "empty", elements: [] };
  }, [decorativeRenderedForTpvMap, mapTablesForChipFilter, tablesVisibleOnMap]);

  const mapViewportFitElementsForTpv = useMemo(() => {
    return mapViewportFitSourceForTpv.elements;
  }, [mapViewportFitSourceForTpv]);

  const viewportFitSourceForTpv = mapViewportFitSourceForTpv.source;

  const tpvOperationalMapElementsForRender = useMemo(() => {
    return mapElementsForTpvRender;
  }, [mapElementsForTpvRender]);

  const tpvOperationalPlanSizeForRender = useMemo(() => {
    return selectedTpvFloorPlanSize;
  }, [selectedTpvFloorPlanSize]);

  const tpvOperationalViewportFitElements = useMemo(() => {
    if (!embeddedInOperacion) return mapViewportFitElementsForTpv;
    return filterTpvOperationalViewportFitElements(
      mapViewportFitElementsForTpv,
    );
  }, [embeddedInOperacion, mapViewportFitElementsForTpv]);

  const tpvMapAutoFitKey = useMemo(() => {
    const planKey = selectedTpvFloorPlanId ?? "legacy";
    return [
      planKey,
      tpvOperationalPlanSizeForRender.width,
      tpvOperationalPlanSizeForRender.height,
      tpvOperationalMapElementsForRender.length,
      planElementsForTpvMap.length,
      zonesForOperationalMapRender.length,
      readonlyMapIntegration.rendererUsed,
      readonlyMapIntegration.matchedSpaceId ?? "",
      tpvOperationalMapElementsForRender
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
    embeddedInOperacion,
    tpvOperationalPlanSizeForRender,
    tpvOperationalMapElementsForRender,
    planElementsForTpvMap,
    readonlyMapIntegration.matchedSpaceId,
    readonlyMapIntegration.rendererUsed,
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

  const readonlyV2OperationalStateByLegacyTableId = useMemo(() => {
    if (!useReadonlyV2Map) return {};
    const stateByTableId: Record<string, SalaEditorReadonlyTpvOperationalState> = {};
    for (const table of mapTablesForChipFilter) {
      const tableId = String(table.id ?? "").trim();
      if (!tableId) continue;
      const group = resolveJoinedTableGroupMapState(
        tableId,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      const serviceTableId = group.serviceTableId;
      const busy = group.busy;
      const tableLines = ordersByTable[serviceTableId] ?? [];
      const openedAtMsRaw = orderOpenedAtByTable[serviceTableId];
      const openedAtMs =
        typeof openedAtMsRaw === "number" && Number.isFinite(openedAtMsRaw)
          ? openedAtMsRaw
          : undefined;
      const orderTotalRaw = orderTotalsByTable[serviceTableId];
      const orderTotal =
        typeof orderTotalRaw === "number" && Number.isFinite(orderTotalRaw)
          ? orderTotalRaw
          : undefined;
      const reservationPressure = reservationPressureByTableId[tableId] ?? null;
      const state = resolveTableOperationalVisualState(
        buildTableOperationalVisualInput({
          busy,
          reserved: Boolean(reservedByTableId[tableId]),
          lines: tableLines,
          occupancyStartMs: firestoreOccupancyStartMsByTable[serviceTableId],
          orderOpenedAtMs: openedAtMs,
          orderTotal,
          mapNow: now,
          readyToClose: salaReadyToCloseTableIds.has(serviceTableId),
          reservationPressure,
        }),
      );
      stateByTableId[tableId] = state;
    }
    return stateByTableId;
  }, [
    firestoreOccupancyStartMsByTable,
    firestoreOccupiedTableIds,
    groupedTablesMapHandlers,
    mapTablesForChipFilter,
    now,
    orderOpenedAtByTable,
    orderTotalsByTable,
    ordersByTable,
    reservationPressureByTableId,
    reservedByTableId,
    salaReadyToCloseTableIds,
    selectedTableId,
    useReadonlyV2Map,
  ]);

  const readonlyV2SelectedLegacyTableIds = useMemo(() => {
    if (!useReadonlyV2Map || !selectedTableId) return [];
    return mapTablesForChipFilter
      .map((table) => String(table.id ?? "").trim())
      .filter((tableId) => {
        if (!tableId) return false;
        return (
          selectedTableId === tableId ||
          groupedTablesMapHandlers?.resolveMainTableId?.(tableId) ===
            selectedTableId
        );
      });
  }, [
    groupedTablesMapHandlers,
    mapTablesForChipFilter,
    selectedTableId,
    useReadonlyV2Map,
  ]);

  const handleOpenTableOrder = useCallback(
    (tableId: string, options?: { entry?: "tpv" | "summary" }) => {
      const id = String(tableId).trim();
      if (!id) return;

      const memberIds = groupedTablesMapHandlers?.getGroupTableIds?.(id) ?? [
        id,
      ];
      const mainId = groupedTablesMapHandlers?.resolveMainTableId?.(id) ?? id;
      const isGrouped = memberIds.length > 1;
      const openId = isGrouped ? mainId : id;

      if (openingTableRef.current === openId) return;
      openingTableRef.current = openId;
      suppressUrlTableSelectionRef.current = false;

      if (isGrouped) {
        invalidateTableGroupOrderCache(memberIds);
      }

      selectedTableIdRef.current = openId;
      setSelectedTableId(openId);

      if (
        activeOperator &&
        restaurantId &&
        isFirebaseConfigured &&
        isAuthReady()
      ) {
        void assignTableOperatorOnFirstOpen({
          db,
          restaurantId,
          tableId: openId,
          operator: {
            assignedOperatorId: activeOperator.activeOperatorId,
            assignedOperatorName: activeOperator.activeOperatorName,
          },
          tableAssignmentHint: tableOperatorAssignmentHintFromTable(
            tablesList.find((row) => row.id === openId),
          ),
        }).catch((error) => {
          console.error("[assignTableOperatorOnFirstOpen]", {
            tableId: openId,
            restaurantId,
            error,
          });
        });
      }

      if (!orderIdFromUrl) {
        setOrder([]);
        userOpenedTableFromMapRef.current = openId;
        const tableOccupiedOnMap = memberIds.some((memberId) =>
          firestoreOccupiedTableIdsRef.current.has(memberId),
        );
        if (!tableOccupiedOnMap) {
          setOrdersByTable((prev) => ({
            ...prev,
            [openId]: prev[openId] ?? [],
          }));
          userOpenedTableFromMapRef.current = null;
        }
        void hydrateTableOrderFromFirestore(openId, { force: true });
      } else {
        setOrdersByTable((prev) =>
          Object.prototype.hasOwnProperty.call(prev, openId)
            ? prev
            : { ...prev, [openId]: [] },
        );
      }

      const entry = options?.entry ?? "tpv";
      setTpvEntryMode(entry === "summary" ? "summary" : "tpv");
      const qs = new URLSearchParams();
      qs.set("tableId", openId);
      if (entry === "summary") qs.set("tpvView", "summary");
      // Mantener la ruta embebida cuando estamos dentro de /dashboard/operacion/tpv
      // para no desmontar el OperacionModuleShell (eso era lo que provocaba el "paso
      // intermedio" / loader visible al tocar una mesa en móvil).
      const basePath = embeddedInOperacion
        ? "/dashboard/operacion/tpv"
        : "/dashboard/carta";
      router.push(`${basePath}?${qs.toString()}`);
      window.setTimeout(() => {
        if (openingTableRef.current === openId) {
          openingTableRef.current = null;
        }
        if (selectedTableIdRef.current === openId) {
          const lines = ordersByTableRef.current[openId];
          if (lines !== undefined) {
            setOrder(lines);
          }
        }
      }, 300);
    },
    [
      embeddedInOperacion,
      orderIdFromUrl,
      router,
      groupedTablesMapHandlers,
      invalidateTableGroupOrderCache,
      hydrateTableOrderFromFirestore,
      activeOperator,
      restaurantId,
      isFirebaseConfigured,
      tablesList,
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

      const tableId = selectedTableId;
      guestCountPersistRef.current = {
        tableId,
        value,
        at: Date.now(),
      };
      setGuestCount(value);
      try {
        await updateDoc(doc(db, "tables", tableId), {
          dinersCount: value,
          // backwards compatibility (otros sitios aún leen guestCount)
          guestCount: value,
          updatedAt: Date.now(),
        });
      } catch (error) {
        guestCountPersistRef.current = null;
        console.error("ERROR GUARDANDO COMENSALES", error);
        const t = tablesList.find((x) => x.id === tableId) ?? null;
        setGuestCount(readTableDinersCount(t));
        window.alert("No se pudo guardar el número de comensales");
      }
    },
    [guestCount, isFirebaseConfigured, restaurantId, selectedTableId, tablesList],
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
      await clearTableOperatorAssignment({
        db,
        restaurantId,
        tableId: selectedTableId,
      });
      await updateDoc(doc(db, "tables", selectedTableId), {
        guestCount: 0,
        updatedAt: Date.now(),
      });
      delete openDraftOrderIdByTableRef.current[selectedTableId];
      setOrder([]);
      setOrdersByTable((prev) => {
        const next = { ...prev };
        delete next[selectedTableId];
        return next;
      });
      setGuestCount(0);
      groupedTablesMapHandlers?.separateTable?.(selectedTableId);
      await completeOperationalActionWithOperatorPicker(true);
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
    completeOperationalActionWithOperatorPicker,
  ]);

  const updateActiveOrderPaymentRequest = useCallback(
    async (setRequested: boolean) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      if (orderIdFromUrl) {
        await patchOrderMetadataViaApi({
          orderId: orderIdFromUrl,
          paymentRequestedAt: setRequested ? Date.now() : null,
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
        await patchOrderMetadataViaApi({
          orderId: d.id,
          paymentRequestedAt: setRequested ? Date.now() : null,
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
          await patchOrderMetadataViaApi({
            orderId: orderIdFromUrl,
            note: value,
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
            await patchOrderMetadataViaApi({
              orderId: d.id,
              note: value,
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
      const result = await mergeOpenOrdersForTableGroup(
        db,
        restaurantId,
        tableId,
        [tableId],
      );
      if (!result.merged || !result.destOrderId) return;

      const destId = result.destOrderId;
      const hadSourceAsCurrentUrl =
        Boolean(orderIdFromUrl) && orderIdFromUrl !== destId;

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
          const mapped = mapFirestoreOrderDocToCartLines(
            data,
            restaurantId,
            operationalCatalog.productDocumentsById,
          );
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
      const group = resolveJoinedTableGroupMapState(
        tid,
        groupedTablesMapHandlers,
        firestoreOccupiedTableIds,
        ordersByTable,
      );
      const { mainTableId, memberIds, serviceTableId, busy } = group;

      const readyMemberId = memberIds.find((memberId) =>
        salaReadyToCloseTableIds.has(memberId),
      );
      if (readyMemberId) {
        const fromLines = sumCartOrderLinesTotal(ordersByTable[readyMemberId] ?? []);
        const fromAggregate =
          typeof orderTotalsByTable[readyMemberId] === "number" &&
          Number.isFinite(orderTotalsByTable[readyMemberId])
            ? orderTotalsByTable[readyMemberId]
            : 0;
        const tablePendingTotal = Math.max(fromLines, fromAggregate);
        handleOpenTableOrder(
          memberIds.length > 1 ? mainTableId : serviceTableId,
          { entry: "summary" },
        );
        if (tablePendingTotal <= 0) {
          return;
        }
        if (canCharge) {
          window.setTimeout(() => {
            setIsPaymentOpen(true);
          }, 0);
        }
        return;
      }

      if (!busy) {
        for (const memberId of memberIds) {
          delete openDraftOrderIdByTableRef.current[memberId];
        }
        setOrder([]);
        setOrdersByTable((prev) => {
          const next = { ...prev };
          for (const memberId of memberIds) {
            next[memberId] = [];
          }
          return next;
        });
        setFirestoreOccupancyStartMsByTable((prev) => {
          const next = { ...prev };
          for (const memberId of memberIds) {
            delete next[memberId];
          }
          return next;
        });
        setOrderTotalsByTable((prev) => {
          const next = { ...prev };
          for (const memberId of memberIds) {
            delete next[memberId];
          }
          return next;
        });
        setLastActivityAtByTable((prev) => {
          const next = { ...prev };
          for (const memberId of memberIds) {
            delete next[memberId];
          }
          return next;
        });
        setFirestoreOccupiedTableIds((prev) => {
          const next = new Set(prev);
          for (const memberId of memberIds) {
            next.delete(memberId);
          }
          return next;
        });
      }

      const openTableId =
        memberIds.length > 1 ? mainTableId : busy ? serviceTableId : mainTableId;
      if (memberIds.length > 1) {
        logTableJoinMerge("join:tpv-open-after-group", {
          clickedTableId: tid,
          mainTableId,
          serviceTableId,
          openTableId,
          memberIds,
          localCacheLines: Object.fromEntries(
            memberIds.map((memberId) => [
              memberId,
              (ordersByTable[memberId] ?? []).map(
                (line) =>
                  `${line.quantity}x ${String(line.product?.nombre ?? "").trim()}`,
              ),
            ]),
          ),
          hint: "Mesas agrupadas: se abre mainTableId y se rehidrata desde Firestore.",
        });
      }
      handleOpenTableOrder(openTableId);
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
      canCharge,
    ],
  );

  const handleMapTableJoinDrop = useCallback(
    (draggedTableId: string, targetTableId: string) => {
      if (!canJoinTables) return;
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
      logTableJoinMerge("join:ui-drop", {
        targetTableId: t,
        draggedTableId: d,
        localOrdersByTable: {
          [d]: (ordersByTable[d] ?? []).map(
            (line) =>
              `${line.quantity}x ${String(line.product?.nombre ?? "").trim()}`,
          ),
          [t]: (ordersByTable[t] ?? []).map(
            (line) =>
              `${line.quantity}x ${String(line.product?.nombre ?? "").trim()}`,
          ),
        },
        hint: "Estado local antes del join; si difiere de Firestore, merge puede ver solo una comanda.",
      });
      join(t, d);
    },
    [
      canJoinTables,
      groupedTablesMapHandlers,
      tablesById,
      selectedTpvFloorPlanId,
      floorPlans,
      ordersByTable,
    ],
  );

  const handleBackToMap = useCallback(() => {
    const tid = selectedTableId?.trim();
    userOpenedTableFromMapRef.current = null;
    if (tid) {
      delete openDraftOrderIdByTableRef.current[tid];
      setOrdersByTable((prev) => {
        const next = { ...prev };
        delete next[tid];
        return next;
      });
    }
    setTpvEntryMode("map");
    suppressUrlTableSelectionRef.current = true;
    setSelectedTableId(null);
    setOrder([]);
    sessionTableScopeRef.current = null;
    const basePath = embeddedInOperacion
      ? "/dashboard/operacion/tpv"
      : "/dashboard/carta";
    router.replace(basePath);
  }, [embeddedInOperacion, router, selectedTableId]);

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

  const visibleOrderLines = useMemo(() => {
    const active = order.filter(
      (line) => normalizeOrderLineStatus(line.status) !== "cancelled",
    );
    if (operationalCatalog.source !== "central") return active;
    return active.map((line) =>
      enrichCartLineCourseFromCatalog(
        line,
        operationalCatalog.productDocumentsById,
      ),
    );
  }, [
    order,
    operationalCatalog.source,
    operationalCatalog.productDocumentsById,
  ]);

  const linesPending = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => normalizeOrderLineStatus(l.status) === "pending")
        .slice()
        .sort(compareComandaPendingLinesNewestFirst),
    [visibleOrderLines],
  );

  /** Al menos una línea ya enviada/preparada/servida: Comanda ya se pulsó en esta mesa. */
  const comandaAlreadyIssuedForTable = useMemo(
    () => isComandaAlreadyIssuedForLines(visibleOrderLines),
    [visibleOrderLines],
  );

  /** Pases posteriores listos para marchar: anteriores servidos y líneas pending. */
  const pendingMarchPassAlerts = useMemo(
    (): PendingMarchPassAlert[] =>
      detectPendingMarchPassAlerts(
        visibleOrderLines,
        comandaAlreadyIssuedForTable,
      ),
    [visibleOrderLines, comandaAlreadyIssuedForTable],
  );

  const pendingMarchPassAlertsByAction = useMemo(() => {
    const map = new Map<
      PendingMarchPassAlert["action"],
      PendingMarchPassAlert
    >();
    for (const alert of pendingMarchPassAlerts) {
      map.set(alert.action, alert);
    }
    return map;
  }, [pendingMarchPassAlerts]);

  const linesSent = useMemo(
    () =>
      visibleOrderLines
        .filter((l) => isSentBucketOrderLineStatus(normalizeOrderLineStatus(l.status)))
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

  const linesCancelled = useMemo(
    () =>
      order
        .filter((l) => normalizeOrderLineStatus(l.status) === "cancelled")
        .slice()
        .sort((a, b) => {
          const d = comandaLineSortKey(a) - comandaLineSortKey(b);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        }),
    [order],
  );

  const groupedLines = useMemo(() => {
    const buckets: Record<1 | 2 | 3 | 4, CartOrderLine[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    const pushByCourse = (line: CartOrderLine) => {
      const course = resolveComandaLineCourseNum(line) as 1 | 2 | 3 | 4;
      buckets[course].push(line);
    };
    linesSent.forEach(pushByCourse);
    linesPrepared.forEach(pushByCourse);
    if (viewMode === "normal") {
      linesServed.forEach(pushByCourse);
    }
    linesCancelled.forEach(pushByCourse);
    return buckets;
  }, [linesSent, linesPrepared, linesServed, linesCancelled, viewMode]);

  /** Libera líneas pending → sent (Comanda parcial o Marchar). */
  const releaseLinesToProduction = useCallback(
    async (
      linesToSend: CartOrderLine[],
      options?: { releaseAction?: ComandaReleaseAction },
    ): Promise<boolean> => {
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
        const inventoryCostByLineId = new Map<string, CartOrderLineInventoryCost>();
        const orderItemRefByLineId = new Map<
          string,
          ReturnType<typeof doc>
        >();
        for (const l of linesToSend) {
          orderItemRefByLineId.set(l.id, doc(collection(db, "orderItems")));
        }

        const nextOrder = order.map((l) => {
          if (l.status !== "pending" || !sendIds.has(l.id)) return l;
          const inventoryCost =
            operationalCatalog.source === "central"
              ? buildTpvLineInventoryCostSnapshot({
                  line: l,
                  inventoryProductsById,
                  recipe:
                    operationalCatalog.productDocumentsById.get(l.product.id)
                      ?.recipe ?? null,
                  saleProductId: l.product.id,
                  calculatedAt: now,
                })
              : undefined;
          if (inventoryCost) inventoryCostByLineId.set(l.id, inventoryCost);
          const orderItemRef = orderItemRefByLineId.get(l.id);
          return {
            ...l,
            status: "sent" as const,
            sentAt: l.sentAt ?? now,
            ...(inventoryCost ? { inventoryCost } : {}),
            ...(orderItemRef ? { orderItemDocId: orderItemRef.id } : {}),
          };
        });

        updateCurrentTableOrder(() => nextOrder);

        // Solo las líneas liberables: incluir enviadas previas provoca
        // LINE_STATE_CONFLICT en mergeUpsertedLines y bloquea el lote.
        const items = serializeOrderLinesToFirestoreItems(linesToSend) as Record<
          string,
          unknown
        >[];

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

        const syncResult = await syncOrderItemsViaApi({
          operation: existingOrderId ? "send_items" : "create_open",
          orderId: existingOrderId,
          tableId: selectedTableId,
          tableLabel,
          items,
          markSent: !existingOrderId,
        });
        if (!syncResult.ok) {
          throw new Error(syncResult.error);
        }
        const persistedOrderRef = doc(db, "orders", syncResult.orderId);

        openDraftOrderIdByTableRef.current[selectedTableId] = syncResult.orderId;

        try {
          const inventoryRestaurantId = operationalRestaurantId ?? restaurantId;
          const recipeResult = await createStockMovementsForRecipeConsumption({
            restaurantId: inventoryRestaurantId,
            orderId: persistedOrderRef.id,
            lines: linesToSend,
            userId: waiterId,
          });
          if (recipeResult.failed > 0) {
            console.warn(
              "[Hostly Inventory] algunos movimientos de escandallo no se crearon; comanda enviada.",
              recipeResult,
            );
          }
          if (recipeResult.movementIds.length > 0) {
            const recipeApplyResult = await applyCreatedStockMovements({
              restaurantId: inventoryRestaurantId,
              movementIds: recipeResult.movementIds,
            });
            if (recipeApplyResult.failed > 0) {
              console.warn(
                "[Hostly Inventory] escandallo no aplicado al stock; comanda enviada.",
                recipeApplyResult,
              );
            }
          }
        } catch (inventoryErr) {
          console.warn(
            "[Hostly Inventory] ledger de inventario no disponible; comanda enviada.",
            inventoryErr,
          );
        }

        try {
          const printerConfig = await getPrinterConfig(restaurantId);
          const printResult = await createPrintJobsForComandaLines({
            restaurantId,
            orderId: persistedOrderRef.id,
            tableId: selectedTableId,
            tableName: tableLabel,
            lines: linesToSend,
            printerConfig,
          });
          if (printResult.failed > 0) {
            console.warn(
              "[Hostly Print] algunos jobs no se crearon; comanda enviada.",
              printResult,
            );
          }
        } catch (printErr) {
          console.warn(
            "[Hostly Print] cola no disponible; comanda enviada.",
            printErr,
          );
        }

        setComandaSentFlash(true);
        if (comandaFlashTimeoutRef.current != null) {
          window.clearTimeout(comandaFlashTimeoutRef.current);
        }
        comandaFlashTimeoutRef.current = window.setTimeout(() => {
          setComandaSentFlash(false);
          comandaFlashTimeoutRef.current = null;
        }, 1000);

        void createActivityLog({
          restaurantId,
          type: existingOrderId ? "order_updated" : "order_created",
          entityType: "order",
          entityId: persistedOrderRef.id,
          actorUserId: waiterId ?? undefined,
          actorUserName: activityActorName,
          actorRole: activityActorRole,
          metadata: buildActivityMetadata({
            tableId: selectedTableId,
            tableName: tableLabel,
            lineCount: linesToSend.length,
            lineIds: linesToSend.map((line) => line.id),
            total: Number.isFinite(syncResult.total) ? syncResult.total : 0,
            action: options?.releaseAction ?? "send_to_comanda",
            route: "tpv",
          }),
        });

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
      operationalRestaurantId,
      waiterId,
      inventoryProductsById,
      operationalCatalog.productDocumentsById,
      operationalCatalog.source,
      activityActorName,
      activityActorRole,
      operationalShadowCatalogSources,
    ],
  );

  const sendLinesToComanda = releaseLinesToProduction;

  const showSentFeedback = (message: string) => {
    setSentFeedbackMessage(message);

    setTimeout(() => {
      setSentFeedbackMessage(null);
    }, 1500);
  };

  const handleComanda = useCallback(async (): Promise<boolean> => {
    if (isComandaSending) {
      return false;
    }
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (order.length === 0) return false;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return false;

    const linesToSend = selectLinesToReleaseOnComanda(visibleOrderLines);
    if (linesToSend.length === 0) {
      showSentFeedback(
        resolveComandaNoAutoReleaseFeedback(visibleOrderLines),
      );
      return false;
    }

    const ok = await releaseLinesToProduction(linesToSend, {
      releaseAction: "send_to_comanda",
    });
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
    releaseLinesToProduction,
    connectivityStatus,
    visibleOrderLines,
  ]);

  const handleMarchPrimeros = useCallback(async (): Promise<boolean> => {
    if (isComandaSending) return false;
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return false;

    const linesToSend = visibleOrderLines.filter((l) =>
      isPendingMarchPrimeroLine(l),
    );
    if (linesToSend.length === 0) return false;

    const ok = await releaseLinesToProduction(linesToSend, {
      releaseAction: "march_primeros",
    });
    if (ok) {
      showSentFeedback("Primeros marchados");
      void completeOperationalActionWithOperatorPicker(true);
    }
    return ok;
  }, [
    isComandaSending,
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    visibleOrderLines,
    connectivityStatus,
    releaseLinesToProduction,
    completeOperationalActionWithOperatorPicker,
  ]);

  const handleMarchSegundos = useCallback(async (): Promise<boolean> => {
    if (isComandaSending) return false;
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return false;

    const linesToSend = visibleOrderLines.filter((l) =>
      isPendingMarchSegundosLine(l),
    );
    if (linesToSend.length === 0) return false;

    const ok = await releaseLinesToProduction(linesToSend, {
      releaseAction: "march_segundos",
    });
    if (ok) {
      showSentFeedback("Segundos marchados");
      void completeOperationalActionWithOperatorPicker(true);
    }
    return ok;
  }, [
    isComandaSending,
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    visibleOrderLines,
    connectivityStatus,
    releaseLinesToProduction,
    completeOperationalActionWithOperatorPicker,
  ]);

  const handleMarchPostres = useCallback(async (): Promise<boolean> => {
    if (isComandaSending) return false;
    if (!selectedTableId) return false;
    if (!restaurantId || !isFirebaseConfigured) return false;
    if (!confirmCriticalActionIfUnstable(connectivityStatus)) return false;

    const linesToSend = visibleOrderLines.filter((l) =>
      isPendingMarchPostresLine(l),
    );
    if (linesToSend.length === 0) return false;

    const ok = await releaseLinesToProduction(linesToSend, {
      releaseAction: "march_postres",
    });
    if (ok) {
      showSentFeedback("Postres marchados");
      void completeOperationalActionWithOperatorPicker(true);
    }
    return ok;
  }, [
    isComandaSending,
    selectedTableId,
    restaurantId,
    isFirebaseConfigured,
    visibleOrderLines,
    connectivityStatus,
    releaseLinesToProduction,
    completeOperationalActionWithOperatorPicker,
  ]);

  const closeMarchConfirmDialog = useCallback(() => {
    if (isComandaSending) return;
    setMarchConfirmDialog(null);
  }, [isComandaSending]);

  const confirmMarchFromDialog = useCallback(async () => {
    if (!marchConfirmDialog || isComandaSending) return;
    const kind = marchConfirmDialog.kind;
    setMarchConfirmDialog(null);
    if (kind === "primeros") {
      await handleMarchPrimeros();
      return;
    }
    if (kind === "segundos") {
      await handleMarchSegundos();
      return;
    }
    await handleMarchPostres();
  }, [
    marchConfirmDialog,
    isComandaSending,
    handleMarchPrimeros,
    handleMarchSegundos,
    handleMarchPostres,
  ]);

  const handleComandaAndExit = useCallback(async () => {
    const ok = await handleComanda();
    if (!ok) {
      const hadReleasablePending =
        selectLinesToReleaseOnComanda(visibleOrderLines).length > 0;
      if (hadReleasablePending) {
        window.alert("No se pudo enviar la comanda. Inténtalo otra vez.");
      }
      return;
    }
    if (embeddedInOperacion) {
      await completeOperationalActionWithOperatorPicker(true);
    } else {
      await new Promise((r) => window.setTimeout(r, 900));
      handleBackToMap();
    }
  }, [
    handleComanda,
    handleBackToMap,
    visibleOrderLines,
    embeddedInOperacion,
    completeOperationalActionWithOperatorPicker,
  ]);

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

  const tpvComandaEstadosGridEl = useMemo(
    () => (
      <div
        className="carta-comanda-status-grid"
        role="group"
        aria-label="Estados de la comanda"
      >
        <span
          className="carta-comanda-status-grid__cell carta-comanda-status-grid__cell--pending"
          style={{
            color: "#0f172a",
            background: "rgba(15,23,42,0.06)",
            border: "1px solid rgba(15,23,42,0.12)",
          }}
        >
          {`Pendiente ${linesPending.length}`}
        </span>
        <span
          className="carta-comanda-status-grid__cell carta-comanda-status-grid__cell--prepared"
          style={{
            color: "#9a3412",
            background: "rgba(245,158,11,0.14)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          {`Preparado ${linesPrepared.length}`}
        </span>
        <span
          className="carta-comanda-status-grid__cell carta-comanda-status-grid__cell--sent"
          style={{
            color: "#1e3a8a",
            background: "rgba(59,130,246,0.14)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
          }}
        >
          {`Enviado ${linesSent.length}`}
        </span>
        <span
          className="carta-comanda-status-grid__cell carta-comanda-status-grid__cell--served"
          style={{
            color: "#166534",
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34, 197, 94, 0.25)",
          }}
        >
          {`Servido ${linesServed.length}`}
        </span>
      </div>
    ),
    [
      linesPending.length,
      linesSent.length,
      linesPrepared.length,
      linesServed.length,
    ],
  );

  const tpvComandaCourseSummaryEl = useMemo(() => {
    const activeLines = visibleOrderLines;
    const entrantesLines = activeLines.filter(
      (line) => isComandaKitchenLine(line) && comandaLineCourseNum(line) === 1,
    );
    const primeroLines = activeLines.filter(
      (line) => isComandaKitchenLine(line) && comandaLineCourseNum(line) === 2,
    );
    const segundoLines = activeLines.filter(
      (line) => isComandaKitchenLine(line) && comandaLineCourseNum(line) === 3,
    );
    const postresLines = activeLines.filter(
      (line) => isComandaKitchenLine(line) && comandaLineCourseNum(line) === 4,
    );
    const bebidasLines = activeLines.filter((line) => isComandaBebidaLine(line));

    const primeroPendingMarch = primeroLines.filter((line) =>
      isPendingMarchPrimeroLine(line),
    ).length;
    const segundosPendingMarch = segundoLines.filter((line) =>
      isPendingMarchSegundosLine(line),
    ).length;
    const postresPendingMarch = postresLines.filter((line) =>
      isPendingMarchPostresLine(line),
    ).length;

    const primeroMarch = primeroPendingMarch;
    const segundoMarch = segundosPendingMarch;

    type CoursePassChipSegment = {
      key: string;
      label: string;
      count: number;
      tone: "entrantes" | "primero" | "segundo" | "postres" | "bebidas";
      action?: "primeros" | "segundos" | "postres";
      /** Pase listo para marchar (pases anteriores servidos). */
      pendingMarch?: boolean;
    };

    const segments: CoursePassChipSegment[] = [];

    if (entrantesLines.length > 0) {
      segments.push({
        key: "entrantes",
        label: "Entrantes",
        count: entrantesLines.length,
        tone: "entrantes",
      });
    }

    const primeroAlert = pendingMarchPassAlertsByAction.get("primeros");
    const segundosAlert = pendingMarchPassAlertsByAction.get("segundos");
    const postresAlert = pendingMarchPassAlertsByAction.get("postres");

    if (primeroLines.length > 0) {
      segments.push({
        key: "primero",
        label: "Primeros",
        count: primeroAlert
          ? primeroAlert.count
          : primeroMarch > 0
            ? primeroMarch
            : primeroLines.length,
        tone: "primero",
        ...(primeroAlert
          ? {
              action: "primeros" as const,
              pendingMarch: true,
            }
          : {}),
      });
    }

    if (segundoLines.length > 0) {
      segments.push({
        key: "segundo",
        label: "Segundos",
        count: segundosAlert
          ? segundosAlert.count
          : segundoMarch > 0
            ? segundoMarch
            : segundoLines.length,
        tone: "segundo",
        ...(segundosAlert
          ? {
              action: "segundos" as const,
              pendingMarch: true,
            }
          : {}),
      });
    }

    if (postresLines.length > 0) {
      segments.push({
        key: "postres",
        label: "Postres",
        count: postresAlert
          ? postresAlert.count
          : postresPendingMarch > 0
            ? postresPendingMarch
            : postresLines.length,
        tone: "postres",
        ...(postresAlert
          ? {
              action: "postres" as const,
              pendingMarch: true,
            }
          : {}),
      });
    }

    if (bebidasLines.length > 0) {
      segments.push({
        key: "bebidas",
        label: "Bebidas",
        count: bebidasLines.length,
        tone: "bebidas",
      });
    }

    if (segments.length === 0) return null;

    const openMarchPrimeros = () =>
      setMarchConfirmDialog({
        kind: "primeros",
        count: primeroPendingMarch,
      });
    const openMarchSegundos = () =>
      setMarchConfirmDialog({
        kind: "segundos",
        count: segundosPendingMarch,
      });
    const openMarchPostres = () =>
      setMarchConfirmDialog({
        kind: "postres",
        count: postresPendingMarch,
      });

    return (
      <div
        className="carta-comanda-pass-chips"
        role="group"
        aria-label="Resumen por pase"
      >
        {segments.map((segment) => {
          const onMarch =
            segment.action === "primeros"
              ? openMarchPrimeros
              : segment.action === "segundos"
                ? openMarchSegundos
                : segment.action === "postres"
                  ? openMarchPostres
                  : undefined;
          const chipClass = `carta-comanda-pass-chip carta-comanda-pass-chip--${segment.tone}${
            onMarch ? " is-action" : ""
          }${segment.pendingMarch ? " is-pending-march" : ""}`;
          const chipBody = (
            <>
              <span className="carta-comanda-pass-chip__label">{segment.label}</span>
              <span className="carta-comanda-pass-chip__count">{segment.count}</span>
            </>
          );

          if (onMarch) {
            return (
              <button
                key={segment.key}
                type="button"
                className={chipClass}
                disabled={isComandaSending}
                onClick={onMarch}
                aria-label={`${segment.label}: ${segment.count} pendientes de marchar`}
              >
                {chipBody}
              </button>
            );
          }

          return (
            <span
              key={segment.key}
              className={chipClass}
              aria-label={`${segment.label}: ${segment.count}`}
            >
              {chipBody}
            </span>
          );
        })}
      </div>
    );
  }, [visibleOrderLines, isComandaSending, pendingMarchPassAlertsByAction]);

  /** Sin selector manual de pase: no hay “pase activo” para resaltar filas. */
  const activeCourseNum = -1;

  const cocinaItems = useMemo(() => {
    return order
      .filter((it) => it.status === "sent")
      .filter(
        (it) => resolveDisplayPreparationAreaForCartLine(it) === "cocina",
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

  const hasPendingComandaRelease = useMemo(
    () => selectLinesToReleaseOnComanda(visibleOrderLines).length > 0,
    [visibleOrderLines],
  );

  const tpvRushMode = useMemo(
    () =>
      computeTpvRushMode({
        pendingLineCount: linesPending.length,
        occupiedTableCount: firestoreOccupiedTableIds.size,
      }),
    [firestoreOccupiedTableIds.size, linesPending.length],
  );

  const tpvQuickActionsLine = useMemo(() => {
    if (!tpvQuickActionsAnchor) return null;
    return order.find((line) => line.id === tpvQuickActionsAnchor.lineId) ?? null;
  }, [order, tpvQuickActionsAnchor]);

  const tpvQuickActionsItems = useMemo((): TpvQuickActionItem[] => {
    if (!tpvQuickActionsLine) return [];
    const line = tpvQuickActionsLine;
    const isPending = line.status === "pending";
    const canCancel = isOrderLineCancellable(line);
    const isCancelling = cancellingLineIds.has(line.id);
    return [
      {
        id: "duplicate",
        label: "Duplicar",
        onSelect: () => {
          void handleRepeatItem(line);
        },
      },
      {
        id: "edit-note",
        label: "Editar nota",
        disabled: !isPending,
        onSelect: () => openComandaLineEditor(line),
      },
      {
        id: "change-course",
        label: "Cambiar pase",
        disabled: !isPending,
        onSelect: () => openComandaLineEditor(line),
      },
      {
        id: "cancel-line",
        label: isPending ? "Eliminar línea" : "Anular línea",
        tone: "danger",
        disabled: isPending ? false : !canCancel || isCancelling || !canCancelLine,
        onSelect: () => {
          if (isPending) {
            handleRemoveLine(line.id);
            return;
          }
          if (canCancel && !isCancelling && canCancelLine) {
            void handleCancelSentOrderLine(line);
          }
        },
      },
    ];
  }, [
    cancellingLineIds,
    handleCancelSentOrderLine,
    handleRemoveLine,
    handleRepeatItem,
    openComandaLineEditor,
    tpvQuickActionsLine,
    canCancelLine,
  ]);

  const showComandaAside =
    viewMode !== "normal" || Boolean(selectedTableId || orderIdFromUrl);

  const showComandaPanelSplitter =
    !cartaHeaderMobile && showComandaAside && !showTableMap;

  const resetComandaPanelWidth = useCallback(() => {
    setComandaPanelWidthPct(COMANDA_PANEL_WIDTH_DEFAULT);
  }, []);

  const resolveComandaPanelWidthFromPointer = useCallback(
    (clientX: number) => {
      const layout = cartaLayoutRef.current;
      if (!layout) return null;
      const rect = layout.getBoundingClientRect();
      if (rect.width <= 0) return null;
      return clampComandaPanelWidthPct(
        ((clientX - rect.left) / rect.width) * 100,
      );
    },
    [],
  );

  const teardownComandaSplitterDrag = useCallback(() => {
    comandaSplitterWindowCleanupRef.current?.();
    comandaSplitterWindowCleanupRef.current = null;
    comandaSplitterPointerIdRef.current = null;
    comandaSplitterPointerStartRef.current = null;
    comandaSplitterDidDragRef.current = false;
    setIsComandaPanelResizing(false);
  }, []);

  useEffect(() => {
    if (showTableMap) {
      teardownComandaSplitterDrag();
      resetComandaPanelWidth();
    }
  }, [showTableMap, resetComandaPanelWidth, teardownComandaSplitterDrag]);

  useEffect(
    () => () => {
      teardownComandaSplitterDrag();
    },
    [teardownComandaSplitterDrag],
  );

  const handleComandaSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!showComandaPanelSplitter) return;
      if (e.button !== 0) return;

      teardownComandaSplitterDrag();
      e.preventDefault();
      e.stopPropagation();

      const splitterEl = e.currentTarget;
      const pointerId = e.pointerId;
      comandaSplitterPointerIdRef.current = pointerId;
      comandaSplitterPointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      comandaSplitterDidDragRef.current = false;
      setIsComandaPanelResizing(true);

      try {
        splitterEl.setPointerCapture(pointerId);
      } catch {
        // ignore capture failures on unsupported targets
      }

      const onWindowPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        const start = comandaSplitterPointerStartRef.current;
        if (
          start &&
          (Math.abs(ev.clientX - start.x) > 2 ||
            Math.abs(ev.clientY - start.y) > 2)
        ) {
          comandaSplitterDidDragRef.current = true;
        }

        ev.preventDefault();
        const next = resolveComandaPanelWidthFromPointer(ev.clientX);
        if (next != null) setComandaPanelWidthPct(next);
      };

      const onWindowPointerEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        comandaSplitterWindowCleanupRef.current?.();
        comandaSplitterWindowCleanupRef.current = null;

        if (comandaSplitterDidDragRef.current) {
          const finalPct = resolveComandaPanelWidthFromPointer(ev.clientX);
          if (finalPct != null) setComandaPanelWidthPct(finalPct);
        } else {
          const now = Date.now();
          if (now - comandaSplitterLastTapAtRef.current <= 320) {
            resetComandaPanelWidth();
            comandaSplitterLastTapAtRef.current = 0;
          } else {
            comandaSplitterLastTapAtRef.current = now;
          }
        }

        try {
          splitterEl.releasePointerCapture(pointerId);
        } catch {
          // ignore if capture was already released
        }

        comandaSplitterPointerIdRef.current = null;
        comandaSplitterPointerStartRef.current = null;
        comandaSplitterDidDragRef.current = false;
        setIsComandaPanelResizing(false);
      };

      window.addEventListener("pointermove", onWindowPointerMove, {
        passive: false,
      });
      window.addEventListener("pointerup", onWindowPointerEnd);
      window.addEventListener("pointercancel", onWindowPointerEnd);

      comandaSplitterWindowCleanupRef.current = () => {
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerEnd);
        window.removeEventListener("pointercancel", onWindowPointerEnd);
      };

      const initialPct = resolveComandaPanelWidthFromPointer(e.clientX);
      if (initialPct != null) setComandaPanelWidthPct(initialPct);
    },
    [
      showComandaPanelSplitter,
      teardownComandaSplitterDrag,
      resolveComandaPanelWidthFromPointer,
      resetComandaPanelWidth,
    ],
  );

  const handleComandaSplitterDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      resetComandaPanelWidth();
      comandaSplitterLastTapAtRef.current = 0;
    },
    [resetComandaPanelWidth],
  );

  const activeEditingOrderId = useMemo(() => {
    if (orderIdFromUrl?.trim()) return orderIdFromUrl.trim();
    if (openOrderIdsForTable[0]?.trim()) return openOrderIdsForTable[0]!.trim();
    return null;
  }, [orderIdFromUrl, openOrderIdsForTable]);

  const selectedTableNameForPresence = useMemo(() => {
    if (!selectedTableId) return null;
    return (
      tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
      selectedTableId
    );
  }, [selectedTableId, tablesList]);

  const tablePresence = useTablePresenceHeartbeat({
    enabled: Boolean(
      embeddedInOperacion &&
        restaurantId &&
        selectedTableId &&
        showComandaAside,
    ),
    restaurantId,
    tableId: selectedTableId,
    tableName: selectedTableNameForPresence,
    editingOrderId: activeEditingOrderId,
    userId: waiterId,
    userName: activityActorName,
    userRole: activityActorRole,
    route: "/dashboard/operacion/tpv",
  });

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
    statusLabel:
      | "Pendiente"
      | "Por marchar"
      | "Enviado"
      | "Preparando"
      | "Preparado"
      | "Servido"
      | "Cancelado",
    opts: { strike?: boolean; attachFirstPendingRef?: boolean },
  ) => {
    const heldForMarch =
      normalizeOrderLineStatus(item.status) === "pending" &&
      isTpvComandaLineHeldForMarch(item, comandaAlreadyIssuedForTable);
    const displayStatusLabel = heldForMarch ? "Por marchar" : statusLabel;
    const i = order.indexOf(item);
    const base = Number(item.product.precio);
    const extrasSum = sumLineExtrasPrices(item);
    const modifierSum = resolveLineModifierTotal(item);
    const hasUnit =
      (Number.isFinite(base) && base >= 0) || extrasSum > 0 || modifierSum > 0;
    const unit = hasUnit ? comandaLineUnitPriceWithExtras(item) : null;
    const lineTotal =
      unit !== null && Number.isFinite(item.quantity)
        ? unit * item.quantity
        : null;
    const firstPendingId = linesPending[0]?.id;
    const lineModifierPresentation = resolveOrderLineModifierPresentation({
      baseProductName: item.product.nombre,
      displayName: item.displayName,
      selectedModifiers: item.selectedModifiers,
      lineNote: item.lineNote,
    });
    const lineInventoryCostLabel = tpvLineInventoryCostLabelByLineId.get(item.id);
    const courseForBadge = resolveEffectiveComandaLineCourse(item);
    const isDrinkLine = isTpvDrinkProduct({
      productFamilyType: item.product.productFamilyType,
      categoryName: item.product.categoria,
      categoria: item.product.categoria,
      tipoVenta: item.product.tipoVenta,
    });
    const coursePassChipLabel = comandaCoursePassChipLabel(courseForBadge);
    const lineSt = normalizeOrderLineStatus(item.status);
    const statusChipClickable =
      canKdsManage &&
      (isSentBucketOrderLineStatus(lineSt) || lineSt === "prepared");
    /* ¿Esta línea pertenece al pase activo? Sirve para resaltar
       sutilmente la fila y oscurecer su badge inline, ayudando al
       camarero a localizar visualmente las líneas del pase actual.
       Las líneas SIN `course` explícito se tratan como pase 1
       (Entrantes), igual que en el fallback `|| 1` de `handleQuickAdd`.
       `activeCourseNum` viene del ámbito del componente. */
    const lineCourseNumForActiveHighlight = courseForBadge ?? 1;
    const isActiveCourseLine =
      lineCourseNumForActiveHighlight === activeCourseNum;
    const effectiveModifierGroupsForLine = resolveActiveEffectiveModifierGroups(
      item.product,
      resolveCategoryForProduct(item.product, cartaCategories),
      modifierGroups,
    );
    const showInlineMixerPicker =
      item.status === "pending" &&
      isDrinkLine &&
      lineShowsInlineMixerPicker(
        effectiveModifierGroupsForLine,
        item.selectedModifiers,
      );
    const inlineMixerGroup = showInlineMixerPicker
      ? resolveSimpleMixerGroup(
          effectiveModifierGroupsForLine,
          item.selectedModifiers,
        )
      : null;
    const modifierSubtitle = showInlineMixerPicker
      ? buildCartLineModifierSubtitle(item.selectedModifiers)
      : lineModifierPresentation.modifiersSubtitle || null;
    const comandaBaseName = showInlineMixerPicker
      ? item.product.nombre
      : lineModifierPresentation.baseProductName;
    const comandaModsLabel = showInlineMixerPicker
      ? (modifierSubtitle ?? "")
      : lineModifierPresentation.modifiersLabel;
    const comandaLineTitle =
      comandaModsLabel.trim().length > 0
        ? `${comandaBaseName} · ${comandaModsLabel}`
        : comandaBaseName;
    const selectedMixerOptionId =
      inlineMixerGroup != null
        ? item.selectedModifiers?.find(
            (mod) => mod.groupId === inlineMixerGroup.group.id,
          )?.optionId ?? null
        : null;
    const lineNoteTrimmed = item.lineNote?.trim() ?? "";
    const destinationBadge = resolveComandaLineDestinationBadge(item);
    return (
      <TpvLineGestureRow
        key={`line-gesture-${item.id}`}
        lineId={item.id}
        enabled={item.status !== "cancelled" && viewMode === "normal"}
        onSwipeLeft={() => {
          if (item.status === "pending") {
            handleRemoveLine(item.id);
          }
        }}
        onSwipeRight={() => {
          void handleRepeatItem(item);
        }}
        onLongPress={(anchor) => {
          setTpvQuickActionsAnchor({
            lineId: item.id,
            x: anchor.x,
            y: anchor.y,
          });
        }}
      >
      <li
        id={hostlyHighlightOrderLineElementId(item.id)}
        className={`carta-comanda-line${
          isActiveCourseLine ? " is-active-course-line" : ""
        }${heldForMarch ? " is-held-for-march" : item.status === "pending" ? " is-pending" : ""}${
          item.status === "cancelled" ? " is-cancelled" : ""
        }${opts.strike ? " is-line-muted" : ""}${qtyBumpLineId === item.id ? " hostly-tpv-line-add-flash" : ""}`}
        ref={
          opts.attachFirstPendingRef &&
          orderIdFromUrl &&
          firstPendingId === item.id
            ? firstPendingRef
            : null
        }
        onClick={
          item.status !== "cancelled"
            ? () => openComandaLineEditor(item)
            : undefined
        }
        onMouseEnter={() =>
          item.status !== "cancelled" ? setHoveredComandaLineIndex(i) : undefined
        }
        onMouseLeave={() =>
          item.status !== "cancelled" ? setHoveredComandaLineIndex(null) : undefined
        }
        style={{
          cursor: item.status !== "cancelled" ? "pointer" : "default",
          textDecoration: "none",
          opacity:
            item.status === "cancelled"
              ? 0.62
              : heldForMarch
                ? opts.strike
                  ? 0.88
                  : 0.86
                : item.status === "pending"
                  ? opts.strike
                    ? 0.92
                    : 1
                  : opts.strike
                    ? 0.78
                    : 0.75,
          backgroundColor: heldForMarch
            ? comandaLineRowBgHeldForMarch({
                hover: hoveredComandaLineIndex === i,
              })
            : comandaLineRowBg(item.status, {
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
          style={{ rowGap: 3 }}
        >
          <div className="carta-comanda-line-main">
            <div className="carta-comanda-line-head">
              <div className="carta-comanda-name-block">
                <div className="carta-comanda-name-row" title={comandaLineTitle}>
                  <span className="carta-comanda-name-primary">{comandaBaseName}</span>
                  {comandaModsLabel.trim().length > 0 ? (
                    <>
                      <span className="carta-comanda-name-dot" aria-hidden="true">
                        {" "}
                        ·{" "}
                      </span>
                      <span className="carta-comanda-name-mods">{comandaModsLabel}</span>
                    </>
                  ) : null}
                </div>
                {inlineMixerGroup ? (
                  <TpvInlineMixerChips
                    mixer={inlineMixerGroup}
                    selectedOptionId={selectedMixerOptionId}
                    onSelect={(option) =>
                      handleApplyInlineMixer(item.id, option, inlineMixerGroup.group)
                    }
                  />
                ) : null}
                {lineNoteTrimmed ? (
                  <div className="carta-comanda-line-meta-note">{lineNoteTrimmed}</div>
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
                  className="carta-comanda-course-pass-chip"
                  aria-label={`Pase: ${comandaCoursePassChipAriaLabel(item.course)}`}
                  title={comandaCoursePassChipAriaLabel(item.course)}
                  style={{
                    flexShrink: 0,
                    fontSize: 7,
                    fontWeight: 800,
                    letterSpacing: "0.035em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 999,
                    lineHeight: 1.1,
                    ...comandaCoursePassChipStyle(),
                  }}
                >
                  {coursePassChipLabel}
                </span>
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
                      ? `Marcar como servido (${displayStatusLabel}). Pulse para confirmar.`
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
                    ...(heldForMarch
                      ? comandaHeldForMarchBadgeStyle()
                      : comandaStatusBadgeStyle(item.status)),
                  }}
                >
                  {displayStatusLabel}
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
                    ...destinationBadgeStyle(destinationBadge.useBarStyle),
                  }}
                  title={`Se envía a ${destinationBadge.label}`}
                >
                  {destinationBadge.label}
                </span>
              </div>
            </div>
            <div className="carta-comanda-line-pricing">
              {unit !== null && lineTotal !== null ? (
                <>
                  <span
                    className={`carta-comanda-pu${
                      item.isComped || item.status === "cancelled"
                        ? " is-price-muted"
                        : ""
                    }`}
                  >
                    {formatComandaLineEuroEs(unit)}
                  </span>
                  <span className="carta-comanda-pu-suffix">/ud</span>
                  <span className="carta-comanda-pricing-sep" aria-hidden="true">
                    {" "}
                    ·{" "}
                  </span>
                  <span className="carta-comanda-total-lead">Total</span>
                  <span
                    className={`carta-comanda-line-total-value${
                      item.isComped || item.status === "cancelled"
                        ? " is-price-muted"
                        : ""
                    }`}
                  >
                    {formatComandaLineEuroEs(lineTotal)}
                  </span>
                </>
              ) : (
                <span className="carta-comanda-pricing-empty">— · Total —</span>
              )}
            </div>
            {lineInventoryCostLabel ? (
              <div className="carta-comanda-line-cost-hint">{lineInventoryCostLabel}</div>
            ) : null}
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

              <span
                className={`text-sm w-4 text-center${
                  qtyBumpLineId === item.id ? " hostly-tpv-qty-bump" : ""
                }`}
              >
                {item.quantity}
              </span>

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
                className="carta-comanda-more-btn"
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
      </TpvLineGestureRow>
    );
  };

  return (
    <div
      className="carta-root"
      data-catalog-source={operationalCatalog.source ?? undefined}
      data-catalog-legacy-fallback={
        operationalCatalog.usingLegacyFallback ? "true" : undefined
      }
      data-carta-mobile={cartaHeaderMobile ? "true" : undefined}
      data-carta-embedded={embeddedInOperacion ? "true" : undefined}
      data-tpv-rush={tpvRushMode ? "true" : undefined}
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
      {marchConfirmDialog ? (
        <div
          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/45 p-3"
          role="presentation"
          onClick={closeMarchConfirmDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="carta-march-confirm-title"
            className="carta-march-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="carta-march-confirm-title">
              {marchConfirmDialog.kind === "primeros"
                ? "Marchar primeros"
                : marchConfirmDialog.kind === "segundos"
                  ? "Marchar segundos"
                  : "Marchar postres"}
            </h3>
            <p className="carta-march-confirm-modal__hint">
              Se enviarán {marchConfirmDialog.count}{" "}
              {marchConfirmDialog.count === 1 ? "producto" : "productos"} a cocina.
            </p>
            <div className="carta-march-confirm-modal__actions">
              <button
                type="button"
                className="carta-march-confirm-modal__btn carta-march-confirm-modal__btn-secondary"
                disabled={isComandaSending}
                onClick={closeMarchConfirmDialog}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="carta-march-confirm-modal__btn carta-march-confirm-modal__btn-primary"
                disabled={isComandaSending}
                onClick={() => void confirmMarchFromDialog()}
              >
                Marchar
              </button>
            </div>
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
              const allowCancel =
                isOrderLineCancellable(comandaLineActionsTarget) && canCancelLine;
              const isCancelling = cancellingLineIds.has(
                comandaLineActionsTarget.id,
              );
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

                    <button
                      type="button"
                      disabled={!allowCancel || isCancelling}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold leading-tight ${
                        allowCancel && !isCancelling
                          ? "bg-red-950/40 text-red-100 hover:bg-red-900/50 active:bg-red-950/50"
                          : "cursor-not-allowed opacity-45 text-slate-500"
                      }`}
                      style={
                        allowCancel && !isCancelling
                          ? { boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.22)" }
                          : undefined
                      }
                      onClick={() => {
                        if (!allowCancel || isCancelling) return;
                        void handleCancelSentOrderLine(comandaLineActionsTarget);
                        close();
                      }}
                    >
                      {isCancelling ? "Anulando…" : "Anular línea"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      ) : null}
      <TpvQuickActionsMenu
        open={tpvQuickActionsAnchor != null && tpvQuickActionsLine != null}
        anchor={
          tpvQuickActionsAnchor
            ? { x: tpvQuickActionsAnchor.x, y: tpvQuickActionsAnchor.y }
            : null
        }
        title={
          tpvQuickActionsLine
            ? comandaLineDisplayName(tpvQuickActionsLine)
            : undefined
        }
        subtitle={
          tpvQuickActionsLine ? `×${tpvQuickActionsLine.quantity}` : undefined
        }
        actions={tpvQuickActionsItems}
        onClose={() => setTpvQuickActionsAnchor(null)}
      />
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

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-metrics-strip-host.carta-map-summary-shell.carta-map-summary-block,
.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-metrics-strip-host.carta-map-summary-shell--critical.carta-map-summary-block {
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding-left: 2px !important;
  padding-right: 2px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-top-strip-main
  .carta-map-summary-pill,
.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-top-strip-main
  .carta-map-summary-pill--interactive {
  min-height: 24px !important;
  height: 24px !important;
  max-height: 24px !important;
  padding-left: 6px !important;
  padding-right: 6px !important;
  font-size: 10px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-floor-plan-cluster
  .carta-tpv-floor-plan-seg-pill {
  min-height: 26px !important;
  height: 26px !important;
  max-height: 26px !important;
  padding-left: 7px !important;
  padding-right: 7px !important;
  font-size: 10px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-floor-plan-cluster
  .carta-tpv-layout-active-badge {
  min-height: 24px !important;
  max-height: 24px !important;
  padding-top: 1px !important;
  padding-bottom: 1px !important;
  font-size: 9px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-map-summary-status {
  font-size: 9px !important;
  max-width: 72px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-my-tables-map-scope {
  padding: 0 4px 0 !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"])
  .carta-my-tables-map-scope
  .carta-table-map-zone-btn {
  min-height: 20px !important;
  height: 20px !important;
  font-size: 10px !important;
  padding-left: 7px !important;
  padding-right: 7px !important;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"]) .carta-table-map-grid {
  padding: 4px;
  border-radius: 12px;
}

.carta-root[data-carta-embedded="true"]:not([data-carta-mobile="true"]) .carta-map-page-fill {
  padding-left: 4px !important;
  padding-right: 4px !important;
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
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  z-index: 2 !important;
  height: 22px !important;
  min-height: 22px !important;
  max-height: 22px !important;
  padding: 0 2px !important;
  align-items: center !important;
  overflow: hidden !important;
  gap: 2px !important;
  flex: 0 0 auto !important;
  border-radius: 0 !important;
  border-width: 0 0 1px !important;
  box-shadow: none !important;
  background: rgba(255, 255, 255, 0.96) !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-my-tables-map-scope {
  padding: 0 4px !important;
  gap: 3px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
  .carta-my-tables-map-scope
  .carta-table-map-zone-btn {
  min-height: 18px !important;
  height: 18px !important;
  max-height: 18px !important;
  padding-left: 6px !important;
  padding-right: 6px !important;
  font-size: 9px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-top-strip-line {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  flex-wrap: nowrap !important;
  gap: 2px !important;
  height: 100% !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster {
  flex: 0 0 auto !important;
  gap: 2px !important;
  min-width: 0 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-divider {
  height: 14px !important;
  margin: 0 1px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-label {
  font-size: 7.5px !important;
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
  height: 18px !important;
  min-height: 18px !important;
  max-height: 18px !important;
  padding-left: 4px !important;
  padding-right: 4px !important;
  font-size: 8px !important;
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

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-floor-plan-wrap {
  flex: 0 0 auto !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-floor-plan-trigger {
  max-width: min(132px, 28vw) !important;
  min-height: 18px !important;
  height: 18px !important;
  max-height: 18px !important;
  padding: 0 5px 0 4px !important;
  gap: 2px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-floor-plan-trigger-label {
  display: none !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-floor-plan-trigger-name {
  font-size: 8.5px !important;
  font-weight: 750 !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-floor-plan-trigger-chevron {
  font-size: 8px !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-map-floor-plan-cluster .carta-tpv-layout-active-badge {
  min-height: 20px !important;
  max-height: 20px !important;
  padding: 1px 6px !important;
  font-size: 8px !important;
  max-width: min(120px, 32vw) !important;
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

.carta-map-top-strip-line {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
}

.carta-map-floor-plan-cluster {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(520px, 52vw);
  box-sizing: border-box;
}

.carta-map-floor-plan-divider {
  flex: 0 0 auto;
  align-self: center;
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: rgba(148, 163, 184, 0.38);
  border-radius: 1px;
}

.carta-map-floor-plan-label {
  flex: 0 0 auto;
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(100, 116, 139, 0.82);
  white-space: nowrap;
  line-height: 1;
  user-select: none;
}

.carta-map-floor-plan-cluster .carta-tpv-floor-plan-seg {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  gap: 4px;
  padding: 0;
}

.carta-map-floor-plan-cluster .carta-tpv-layout-active-badge {
  flex: 0 1 auto;
  min-width: 0;
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

.carta-tpv-layout-active-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  align-self: center;
  min-height: 26px;
  max-width: min(180px, 34vw);
  padding: 3px 10px !important;
  border-radius: 999px !important;
  border: 1px solid var(--hostly-line) !important;
  background: rgba(255, 255, 255, 0.86) !important;
  font-size: 10px !important;
  font-weight: 650 !important;
  letter-spacing: -0.01em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  cursor: default;
  box-sizing: border-box;
  z-index: 4;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
  .carta-map-floor-plan-cluster
  .carta-tpv-layout-active-badge {
  min-height: 20px;
  max-width: min(120px, 36vw);
  padding: 1px 6px !important;
  font-size: 8px !important;
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
  gap: 5px;
  flex: 0 0 auto;
  padding: 0 12px;
  min-height: 34px;
  height: 34px;
  max-height: 34px;
  max-width: 160px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(255, 255, 255, 0.98);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  box-sizing: border-box;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease;
}

.carta-tpv-floor-plan-seg-pill-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-tpv-floor-plan-seg-pill-icon {
  flex: 0 0 auto;
  color: #64748b;
  opacity: 0.78;
}

.carta-tpv-floor-plan-seg-pill:hover {
  background: rgba(248, 250, 252, 1);
  border-color: rgba(100, 116, 139, 0.46);
  color: #1e293b;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.carta-tpv-floor-plan-seg-pill:hover .carta-tpv-floor-plan-seg-pill-icon {
  color: #475569;
  opacity: 0.92;
}

.carta-tpv-floor-plan-seg-pill:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.5);
  outline-offset: 1px;
}

.carta-tpv-floor-plan-seg-pill--active {
  background: linear-gradient(
    180deg,
    rgba(236, 246, 255, 0.98) 0%,
    rgba(219, 236, 250, 0.94) 100%
  );
  border-color: rgba(56, 120, 168, 0.42);
  box-shadow: 0 1px 3px rgba(30, 64, 112, 0.1);
  color: #0c4a6e;
  font-weight: 600;
}

.carta-tpv-floor-plan-seg-pill--active .carta-tpv-floor-plan-seg-pill-icon {
  color: #0369a1;
  opacity: 0.95;
}

.carta-tpv-floor-plan-seg-pill--active:hover {
  background: linear-gradient(
    180deg,
    rgba(236, 246, 255, 1) 0%,
    rgba(214, 234, 248, 0.98) 100%
  );
  border-color: rgba(56, 120, 168, 0.5);
  color: #0c4a6e;
  box-shadow: 0 1px 4px rgba(30, 64, 112, 0.12);
}

.carta-tpv-floor-plan-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(220px, 40vw);
  padding: 0 10px 0 9px;
  min-height: 34px;
  height: 34px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(56, 120, 168, 0.38);
  background: linear-gradient(
    180deg,
    rgba(236, 246, 255, 0.98) 0%,
    rgba(219, 236, 250, 0.94) 100%
  );
  box-shadow: 0 1px 3px rgba(30, 64, 112, 0.08);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  font-family: inherit;
  color: #0c4a6e;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.carta-tpv-floor-plan-trigger:hover {
  border-color: rgba(56, 120, 168, 0.5);
  box-shadow: 0 1px 4px rgba(30, 64, 112, 0.11);
}

.carta-tpv-floor-plan-trigger:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.55);
  outline-offset: 1px;
}

.carta-tpv-floor-plan-trigger-label {
  flex: 0 0 auto;
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(100, 116, 139, 0.82);
}

.carta-tpv-floor-plan-trigger-name {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-tpv-floor-plan-trigger-icon {
  flex: 0 0 auto;
  color: #0369a1;
  opacity: 0.92;
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
    rgba(236, 246, 255, 0.98) 0%,
    rgba(219, 236, 250, 0.92) 100%
  );
  border: 1px solid rgba(56, 120, 168, 0.28);
  color: #0c4a6e;
  font-weight: 650;
  box-shadow: 0 1px 2px rgba(30, 64, 112, 0.06);
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

/* Alto compacto del strip de métricas (una sola fila). */
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
  box-shadow: none !important;
}

.carta-map-metrics-strip-host .carta-map-top-strip-line .carta-map-top-strip-main .carta-map-summary-pill,
.carta-map-metrics-strip-host .carta-map-top-strip-line .carta-map-top-strip-main .carta-map-summary-pill--interactive,
.carta-map-metrics-strip-host .carta-map-top-strip-line .carta-map-top-strip-main .carta-table-map-zone-btn {
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.carta-map-metrics-strip-host .carta-map-top-strip-line .carta-map-summary-status {
  line-height: 1 !important;
  max-height: 100%;
  overflow: hidden;
  margin-left: auto;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .carta-map-metrics-strip-host.carta-map-summary-shell.carta-map-summary-block,
  .carta-map-metrics-strip-host.carta-map-summary-shell--critical.carta-map-summary-block {
    height: auto !important;
    min-height: 1.1cm !important;
    max-height: none !important;
    align-items: stretch !important;
  }

  .carta-map-top-strip-line {
    row-gap: 3px;
  }

  .carta-map-floor-plan-cluster {
    max-width: 100%;
    flex-basis: auto;
  }
}

.carta-map-floor-plan-cluster .carta-tpv-floor-plan-seg-pill {
  min-height: 34px;
  height: 34px;
  max-height: 34px;
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

.carta-my-tables-map-scope {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px 6px 2px;
  box-sizing: border-box;
}

.carta-my-tables-map-scope .carta-table-map-zone-btn {
  min-height: 24px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid var(--hostly-line);
  color: var(--hostly-ink-muted);
}

.carta-my-tables-map-scope .carta-table-map-zone-btn--on {
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

.carta-aside-meta-row .carta-tpv-to-map-btn--prominent {
  margin-left: 0;
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

.carta-comanda-header-ops-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  width: 100%;
  flex: 1 1 auto;
}

.carta-comanda-status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 4px;
  width: 100%;
  min-width: 0;
}

.carta-comanda-status-grid__cell {
  display: block;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1.15;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.carta-comanda-pass-chips {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.carta-comanda-pass-chips::-webkit-scrollbar {
  display: none;
}

.carta-comanda-pass-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(248, 250, 252, 0.95);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.15;
  color: #0f172a;
  white-space: nowrap;
  flex-shrink: 0;
}

button.carta-comanda-pass-chip {
  margin: 0;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

button.carta-comanda-pass-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.carta-comanda-pass-chip__count {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.carta-comanda-pass-chip--entrantes {
  border-color: rgba(34, 197, 94, 0.28);
  background: rgba(240, 253, 244, 0.95);
  color: #166534;
}

.carta-comanda-pass-chip--primero:not(.is-pending-march),
.carta-comanda-pass-chip--segundo:not(.is-pending-march) {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.carta-comanda-pass-chip--postres:not(.is-pending-march) {
  border-color: rgba(192, 132, 252, 0.28);
  background: rgba(250, 245, 255, 0.96);
  color: #7e22ce;
}

.carta-comanda-pass-chip.is-pending-march {
  min-height: 36px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 800;
  border-width: 1.5px;
  border-color: rgba(251, 146, 60, 0.62);
  background: rgba(255, 237, 213, 0.98);
  color: #9a3412;
  box-shadow:
    0 0 0 2px rgba(251, 146, 60, 0.18),
    0 2px 8px rgba(251, 146, 60, 0.2);
}

.carta-comanda-pass-chip--postres.is-pending-march {
  border-color: rgba(192, 132, 252, 0.55);
  background: rgba(243, 232, 255, 0.98);
  color: #7e22ce;
  box-shadow:
    0 0 0 2px rgba(192, 132, 252, 0.16),
    0 2px 8px rgba(168, 85, 247, 0.16);
}

.carta-comanda-pass-chip.is-pending-march .carta-comanda-pass-chip__count {
  min-width: 18px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(251, 146, 60, 0.28);
  color: #9a3412;
  line-height: 1.2;
}

.carta-comanda-pass-chip--postres.is-pending-march .carta-comanda-pass-chip__count {
  background: rgba(192, 132, 252, 0.24);
  color: #6b21a8;
}

button.carta-comanda-pass-chip.is-pending-march:hover:not(:disabled) {
  background: rgba(254, 215, 170, 0.99);
  border-color: rgba(249, 115, 22, 0.72);
}

button.carta-comanda-pass-chip.is-pending-march {
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 100ms ease;
}

button.carta-comanda-pass-chip.is-pending-march:active:not(:disabled) {
  transform: scale(0.97);
}

button.carta-comanda-pass-chip--postres.is-pending-march:hover:not(:disabled) {
  background: rgba(237, 233, 254, 0.99);
  border-color: rgba(168, 85, 247, 0.55);
}

.carta-comanda-pass-chip--bebidas {
  border-color: rgba(59, 130, 246, 0.32);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
}

.carta-march-confirm-modal {
  width: min(360px, 100%);
  background: #ffffff;
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}

.carta-march-confirm-modal h3 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}

.carta-march-confirm-modal__hint {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.4;
  color: #64748b;
}

.carta-march-confirm-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.carta-march-confirm-modal__btn {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    transform 100ms ease,
    box-shadow 120ms ease;
}

.carta-march-confirm-modal__btn:active:not(:disabled) {
  transform: scale(0.98);
}

.carta-march-confirm-modal__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.carta-march-confirm-modal__btn-secondary {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
}

.carta-march-confirm-modal__btn-primary {
  border: 1px solid #0f172a;
  background: #0f172a;
  color: #ffffff;
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

/* Cabecera comanda: extremos operativos — mapa (izq.) | mesa centrada | comensales (der.). */
.carta-comanda-head-compact-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 34px;
}

.carta-comanda-head-guests {
  grid-column: 3;
  justify-self: end;
  min-width: 0;
}

.carta-comensales--head-band {
  max-width: min(168px, 38vw);
  height: 32px;
  min-height: 32px;
  padding: 3px 6px;
  border-radius: 10px;
}

.carta-comensales--head-band .carta-comensales-label {
  font-size: 11px;
}

.carta-comensales--head-band .carta-comensales-count {
  font-size: 13px;
}

.carta-comanda-head-mesa-line {
  grid-column: 2;
  justify-self: center;
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  justify-content: center;
}

.carta-comanda-head-mesa-line .carta-comanda-headline {
  min-width: 0;
  flex: 0 1 auto;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-head-compact-band .carta-tpv-to-map-btn--prominent {
  grid-column: 1;
  justify-self: start;
  margin-left: 0;
  max-width: 100%;
}

.carta-comanda-head-sep {
  flex: 0 0 auto;
  color: rgba(15, 23, 42, 0.28);
  font-size: 12px;
  line-height: 1;
  user-select: none;
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
  box-sizing: border-box;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  border: none;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.08s ease;
}

.carta-tpv-to-map-btn--prominent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(14, 165, 233, 0.45);
  background: linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%);
  color: #0c4a6e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
  white-space: nowrap;
  box-shadow:
    0 1px 2px rgba(14, 165, 233, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.carta-tpv-to-map-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: rgba(14, 165, 233, 0.16);
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
}

.carta-tpv-to-map-btn__label {
  min-width: 0;
}

.carta-tpv-to-map-btn--prominent:hover {
  background: linear-gradient(180deg, #ffffff 0%, #e0f2fe 100%);
  border-color: rgba(2, 132, 199, 0.55);
  color: #082f49;
  box-shadow: 0 2px 10px rgba(14, 165, 233, 0.18);
}

.carta-tpv-to-map-btn--prominent:active {
  transform: translateY(0.5px);
  background: #e0f2fe;
  box-shadow: none;
}

.carta-tpv-to-map-btn--prominent:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px rgba(56, 189, 248, 0.45),
    0 2px 8px rgba(14, 165, 233, 0.15);
}

.carta-cats-wrap {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.carta-cat-btn {
  min-width: 84px;
  min-height: 34px;
  padding: 8px 14px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.72);
  background: rgba(248, 250, 252, 0.78);
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  box-sizing: border-box;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease,
    transform 120ms ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.carta-cat-btn:hover {
  background: var(--hostly-accent-soft);
  border-color: color-mix(in srgb, var(--hostly-accent) 28%, #e2e8f0);
  color: var(--hostly-accent);
}

.carta-cat-btn:active {
  transform: scale(0.98);
}

.carta-cat-btn:focus-visible {
  outline: none;
  box-shadow: var(--hostly-focus-ring);
}

.carta-cat-btn--active {
  background: #ffffff;
  border-color: color-mix(in srgb, var(--hostly-accent) 42%, #e2e8f0);
  color: var(--hostly-accent);
  box-shadow:
    0 5px 14px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.carta-cat-btn--active:hover {
  background: #ffffff;
  border-color: color-mix(in srgb, var(--hostly-accent) 52%, #e2e8f0);
  color: var(--hostly-accent);
}

.carta-tpv-preqty {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: 3px;
  border-radius: 12px;
  border: 1px solid rgba(203, 213, 225, 0.72);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.carta-tpv-preqty__badge {
  min-width: 58px;
  padding: 0 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.carta-tpv-preqty__badge--active {
  color: var(--hostly-accent);
}

.carta-tpv-preqty__keys {
  display: flex;
  align-items: center;
  gap: 4px;
}

.carta-tpv-preqty__key {
  min-width: 30px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: #475569;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 120ms ease,
    box-shadow 150ms ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.carta-tpv-preqty__key:hover {
  background: var(--hostly-accent-soft);
  border-color: color-mix(in srgb, var(--hostly-accent) 26%, #e2e8f0);
  color: var(--hostly-accent);
}

.carta-tpv-preqty__key:active {
  transform: scale(0.98);
}

.carta-tpv-preqty__key:focus-visible {
  outline: none;
  box-shadow: var(--hostly-focus-ring);
}

.carta-tpv-preqty__key--clear {
  min-width: 34px;
  color: #64748b;
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

.carta-layout[data-carta-split-active="true"] {
  gap: 0;
}

.carta-layout[data-carta-split-active="true"] .carta-aside,
.carta-layout[data-carta-split-active="true"] .carta-comanda {
  width: var(--carta-comanda-width, 40%) !important;
  min-width: 0 !important;
  max-width: 80%;
  flex-shrink: 0;
}

.carta-layout-splitter {
  flex: 0 0 12px;
  width: 12px;
  min-width: 12px;
  cursor: col-resize;
  touch-action: none;
  align-self: stretch;
  position: relative;
  z-index: 5;
  user-select: none;
  -webkit-user-select: none;
  background: transparent;
  flex-shrink: 0;
}

.carta-layout-splitter::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 12px;
  bottom: 12px;
  width: 3px;
  transform: translateX(-50%);
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.45);
  transition: background-color 0.12s ease;
  pointer-events: none;
}

.carta-layout-splitter:hover::after,
.carta-layout-splitter[data-dragging="true"]::after {
  background: rgba(59, 130, 246, 0.7);
}

.carta-root[data-carta-embedded="true"] .carta-products-operator-btn {
  min-height: 30px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 10px;
  box-shadow: none;
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.9);
}

.carta-root[data-carta-embedded="true"] .carta-products-operator-btn__name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-products-menu-row {
  flex-direction: row !important;
  align-items: center !important;
}

.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-products-operator-btn {
  min-height: 44px !important;
  min-width: 44px !important;
  padding: 6px 10px !important;
  font-size: 12px !important;
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
  padding: 4px 7px 4px 9px;
  margin-left: 0;
  margin-right: 0;
  border-radius: 8px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
  transform: translateZ(0);
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 100ms ease;
}

.carta-comanda-line:hover:not(.is-cancelled),
.carta-comanda-line:focus-within:not(.is-cancelled) {
  box-shadow:
    0 0 0 1px rgba(14, 165, 233, 0.18),
    0 5px 14px rgba(15, 23, 42, 0.07);
}

.carta-comanda-line:active:not(.is-cancelled) {
  transform: scale(0.992);
  box-shadow:
    0 0 0 2px rgba(14, 165, 233, 0.24),
    0 2px 7px rgba(15, 23, 42, 0.08);
}

.carta-comanda-line.is-pending {
  position: relative;
  padding-left: 12px !important;
  background: rgba(15, 23, 42, 0.04) !important;
  border: 1px solid rgba(15, 23, 42, 0.11) !important;
}

.carta-comanda-line.is-pending::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: calc(100% - 6px);
  max-height: 24px;
  border-radius: 2px;
  background: rgba(30, 41, 59, 0.72);
  pointer-events: none;
}

.carta-comanda-line.is-held-for-march {
  position: relative;
  padding-left: 12px !important;
  background: rgba(245, 158, 11, 0.08) !important;
  border: 1px solid rgba(245, 158, 11, 0.22) !important;
}

.carta-comanda-line.is-held-for-march::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: calc(100% - 6px);
  max-height: 24px;
  border-radius: 2px;
  background: rgba(217, 119, 6, 0.78);
  pointer-events: none;
}

.carta-comanda-group {
  margin-bottom: 4px;
}

.carta-comanda-group-title {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 5px 0 3px;
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
  gap: 4px;
  min-width: 0;
}

.carta-comanda-name-block {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.carta-comanda-name-row {
  display: flex;
  align-items: baseline;
  min-width: 0;
  max-width: 100%;
  line-height: 1.2;
  overflow: hidden;
}

.carta-comanda-name-primary {
  flex-shrink: 0;
  font-weight: 750;
  font-size: 14px;
  letter-spacing: -0.02em;
  color: #0f172a;
  white-space: nowrap;
}

.carta-comanda-name-dot {
  flex-shrink: 0;
  font-weight: 500;
  font-size: 12px;
  color: #94a3b8;
  white-space: pre;
}

.carta-comanda-name-mods {
  min-width: 0;
  flex: 1;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: -0.01em;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-line.is-line-muted .carta-comanda-name-primary,
.carta-comanda-line.is-line-muted .carta-comanda-name-mods,
.carta-comanda-line.is-cancelled .carta-comanda-name-primary,
.carta-comanda-line.is-cancelled .carta-comanda-name-mods {
  color: #64748b;
  text-decoration: line-through;
}

.carta-comanda-line.is-line-muted .carta-comanda-line-pricing,
.carta-comanda-line.is-cancelled .carta-comanda-line-pricing {
  color: #94a3b8;
}

.carta-comanda-course-pass-chip {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

/* Resaltado sutil de las líneas que pertenecen al pase actualmente activo. */
.carta-comanda-line.is-active-course-line {
  border-color: rgba(17, 24, 39, 0.24);
  background: rgba(17, 24, 39, 0.04);
}

.carta-comanda-line.is-active-course-line .carta-comanda-course-pass-chip {
  background: rgba(71, 85, 105, 0.14) !important;
  color: #334155 !important;
  border-color: rgba(71, 85, 105, 0.42) !important;
}

.carta-comanda-line-badges {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
}

.carta-comanda-status-chip--clickable {
  cursor: pointer;
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  padding: 4px 8px !important;
  transition:
    opacity 120ms ease,
    filter 120ms ease,
    transform 100ms ease,
    box-shadow 120ms ease;
}

.carta-comanda-status-chip--clickable:hover {
  opacity: 0.92;
  filter: brightness(1.06);
}

.carta-comanda-status-chip--clickable:focus-visible {
  outline: 2px solid rgba(15, 23, 42, 0.26);
  outline-offset: 1px;
}

.carta-comanda-status-chip--clickable:active {
  transform: scale(0.96);
}

.carta-comanda-qty-inline {
  flex-shrink: 0;
  font-weight: 750;
  font-size: 11px;
  line-height: 1.1;
  white-space: nowrap;
}

.carta-comanda-line-pricing {
  font-size: 11px;
  line-height: 1.15;
  color: #64748b;
  padding-left: 0;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-pricing-empty {
  font-weight: 600;
  color: #94a3b8;
}

.carta-comanda-line-cost-hint {
  display: none;
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
  line-height: 1.15;
  color: #64748b;
  margin-top: 1px;
}

.carta-comanda-extras-row {
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-comanda-pu {
  font-weight: 650;
  letter-spacing: -0.02em;
  font-size: 11px;
  color: #64748b;
}

.carta-comanda-pu.is-price-muted {
  color: #94a3b8;
  text-decoration: line-through;
}

.carta-comanda-pu-suffix {
  font-weight: 600;
  letter-spacing: -0.01em;
  font-size: 10px;
  color: #94a3b8;
}

.carta-comanda-pricing-sep {
  font-weight: 500;
  color: #cbd5e1;
  margin: 0 1px;
}

.carta-comanda-total-lead {
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-left: 3px;
}

.carta-comanda-line-total-value {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: -0.03em;
  color: #0f172a;
  margin-left: 3px;
}

.carta-comanda-line-total-value.is-price-muted {
  color: #64748b;
  text-decoration: line-through;
  opacity: 0.85;
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
  gap: 5px;
}

.carta-comanda-qty-btn {
  box-sizing: border-box;
  min-width: 38px;
  min-height: 38px;
  border-radius: 10px;
  font-size: 17px;
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
  transition:
    background-color 100ms ease,
    color 100ms ease,
    transform 100ms ease,
    box-shadow 120ms ease;
}

.carta-comanda-qty-btn:hover {
  background: #e5e7eb;
}

.carta-comanda-qty-btn:active {
  background: #d1d5db;
  transform: scale(0.94);
}

.carta-comanda-qty-btn--remove {
  color: #6b7280;
}

.carta-comanda-qty-btn--remove:hover {
  color: #dc2626;
}

.carta-comanda-more-btn {
  box-sizing: border-box;
  min-width: 38px;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 10px;
  background: #f8fafc;
  color: #475569;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  touch-action: manipulation;
  transition:
    background-color 100ms ease,
    color 100ms ease,
    transform 100ms ease,
    box-shadow 120ms ease;
}

.carta-comanda-more-btn:hover {
  background: #eef2f7;
  color: #0f172a;
}

.carta-comanda-more-btn:active {
  transform: scale(0.94);
}

.carta-comanda-more-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.3);
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

.carta-modifiers-modal-panel {
  max-width: 460px;
  max-height: min(88vh, 760px);
  overflow: auto;
}

.carta-modifiers-modal-groups {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.carta-modifiers-modal-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.carta-modifiers-modal-group-meta {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.carta-modifiers-modal-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
}

.carta-modifiers-option {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #0f172a;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  text-align: left;
  touch-action: manipulation;
}

.carta-modifiers-option--active {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(37, 99, 235, 0.1);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}

.carta-modifiers-option-name {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}

.carta-modifiers-option-delta {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}

.carta-modifiers-option-stock {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.carta-modifiers-option-stock.is-low {
  background: rgba(251, 230, 198, 0.92);
  color: #9a5d11;
}

.carta-modifiers-option-stock.is-out {
  background: rgba(254, 226, 226, 0.92);
  color: #b91c1c;
}

.carta-modifiers-stock-hint {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(254, 243, 199, 0.55);
  border: 1px solid rgba(217, 119, 6, 0.22);
  color: #92400e;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}

.carta-modifiers-modal-summary {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.92);
  display: grid;
  gap: 8px;
}

.carta-modifiers-modal-summary-label {
  font-size: 10px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.carta-modifiers-modal-summary-value {
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.25;
}

.carta-comanda-modifiers {
  margin-top: 1px;
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
  min-height: 44px;
  border-radius: 11px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    transform 100ms ease,
    box-shadow 120ms ease;
}

.carta-line-editor-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.carta-line-editor-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.3);
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
  animation: cartaProductAddFlash 140ms ease-out both;
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

.carta-product-stock-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  max-width: calc(100% - 12px);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 2px 6px;
  text-align: center;
  pointer-events: none;
  line-height: 1.15;
  z-index: 2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.carta-product-stock-badge.is-low {
  background: rgba(251, 230, 198, 0.96);
  color: #9a5d11;
  border: 1px solid rgba(217, 119, 6, 0.28);
}

.carta-product-stock-badge.is-out {
  background: rgba(254, 226, 226, 0.96);
  color: #b91c1c;
  border: 1px solid rgba(220, 38, 38, 0.28);
}
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

.carta-comanda-button {
  touch-action: manipulation;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    transform 100ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease !important;
}

.carta-comanda-button:active:not(:disabled) {
  transform: scale(0.985);
}

.carta-comanda-button.is-success {
  color: #065f46 !important;
  border-color: rgba(16, 185, 129, 0.38) !important;
  background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%) !important;
  box-shadow:
    0 0 0 2px rgba(16, 185, 129, 0.12),
    0 5px 14px rgba(16, 185, 129, 0.14) !important;
}

.carta-comanda-button:disabled {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  background: #e5e7eb !important;
  color: #6b7280 !important;
  box-shadow: none !important;
  filter: none !important;
}

.carta-comanda-button.is-success:disabled {
  opacity: 1 !important;
  color: #065f46 !important;
  border-color: rgba(16, 185, 129, 0.38) !important;
  background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%) !important;
  box-shadow:
    0 0 0 2px rgba(16, 185, 129, 0.12),
    0 5px 14px rgba(16, 185, 129, 0.14) !important;
}

.carta-tpv-dock-cobrar,
.carta-tpv-dock-pre-ticket {
  width: 100%;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 14px;
  font-family: inherit;
  line-height: 1.1;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 170ms ease,
    border-color 170ms ease,
    color 170ms ease,
    filter 140ms ease,
    transform 120ms ease,
    box-shadow 170ms ease,
    opacity 140ms ease;
}

.carta-tpv-dock-pre-ticket {
  border: 1px solid color-mix(in srgb, var(--hostly-accent) 18%, #cbd5e1);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  color: var(--hostly-accent);
  font-size: 14px;
  font-weight: 800;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.carta-tpv-dock-cobrar {
  border: 1px solid color-mix(in srgb, var(--hostly-accent) 26%, #0ea5e9);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 44%),
    linear-gradient(180deg, #38bdf8 0%, #0ea5e9 48%, #0284c7 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 900;
  box-shadow:
    0 10px 24px rgba(14, 165, 233, 0.24),
    0 2px 6px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.carta-tpv-dock-cobrar:hover:not(:disabled) {
  filter: brightness(1.045) saturate(1.05);
  box-shadow:
    0 12px 28px rgba(14, 165, 233, 0.3),
    0 3px 8px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.26);
}

.carta-tpv-dock-pre-ticket:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--hostly-accent) 30%, #cbd5e1);
  background: color-mix(in srgb, var(--hostly-accent-soft) 54%, #ffffff);
  color: var(--hostly-accent);
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.carta-tpv-dock-cobrar:active:not(:disabled),
.carta-tpv-dock-pre-ticket:active:not(:disabled) {
  transform: scale(0.985);
}

.carta-tpv-dock-cobrar:focus-visible,
.carta-tpv-dock-pre-ticket:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(56, 189, 248, 0.3),
    0 6px 18px rgba(14, 165, 233, 0.2) !important;
}

.carta-tpv-dock-cobrar:disabled,
.carta-tpv-dock-pre-ticket:disabled {
  cursor: not-allowed;
  opacity: 0.54;
  filter: grayscale(0.12);
  box-shadow: none;
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
  transition:
    background-color 120ms ease,
    box-shadow 120ms ease;
}

/* Fila intermedia tiempo + pendientes: el gap del flex ya separa del tiempo. */
.carta-pending-indicator.carta-pending-indicator--meta-row {
  margin-left: 0;
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
  transform: scale(0.96);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.28);
}

/* Zona de imagen: slot más alto y estrecho para que botellas verticales llenen el ancho con cover. */
.carta-product-media {
  flex-shrink: 0;
  width: min(100%, 50px);
  max-width: 50px;
  height: 46px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: #e5e7eb;
}

.carta-product-media__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  display: block;
}

.carta-product-media__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.carta-product-media__initial {
  font-size: 20px;
  font-weight: 800;
  color: #333333;
  line-height: 1;
  user-select: none;
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
  .carta-product-media {
    width: min(100%, 54px);
    max-width: 54px;
    height: 52px;
  }
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
  .carta-product-media {
    width: min(100%, 56px);
    max-width: 56px;
    height: 54px;
  }
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

  .carta-comanda-status-grid__cell {
    font-size: 9px !important;
    padding: 2px 4px !important;
  }

  .carta-comanda-pass-chip {
    font-size: 9px !important;
    min-height: 20px !important;
    padding: 2px 7px !important;
  }

  .carta-comanda-pass-chip.is-pending-march {
    font-size: 10px !important;
    min-height: 26px !important;
    padding: 3px 10px !important;
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

  .carta-comanda-line {
    padding: 4px 7px !important;
    min-height: 40px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .carta-comanda-line.is-pending {
    padding: 4px 7px 4px 11px !important;
  }

  .carta-comanda-line.is-held-for-march {
    padding: 4px 7px 4px 11px !important;
  }

  .carta-comanda-line > div:first-child {
    min-width: 0;
    flex: 1;
  }

  .carta-comanda-name-primary {
    font-size: 14px !important;
  }

  .carta-comanda-name-mods {
    font-size: 11px !important;
  }

  .carta-comanda-line-pricing {
    font-size: 11px !important;
  }

  .carta-comanda-line-total-value {
    font-size: 13px !important;
  }

  .carta-comanda-course-pass-chip {
    font-size: 7px !important;
    font-weight: 800 !important;
    padding: 1px 4px !important;
    color: #475569 !important;
    border-color: rgba(100, 116, 139, 0.34) !important;
  }

  .carta-comanda-qty-controls {
    gap: 3px !important;
  }

  .carta-comanda-qty-btn {
    width: 26px !important;
    height: 26px !important;
    min-width: 26px !important;
    min-height: 26px !important;
    border-radius: 7px !important;
    font-size: 12px !important;
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
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-compact-band {
  gap: 5px !important;
  min-height: 32px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-head-mesa-line {
  gap: 4px !important;
  min-width: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-headline {
  font-size: 16px !important;
  font-weight: 900 !important;
  letter-spacing: -0.02em !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-headline-time {
  font-size: 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-to-map-btn--prominent {
  min-height: 32px !important;
  padding: 5px 8px !important;
  border-radius: 9px !important;
  font-size: 10px !important;
  gap: 4px !important;
  max-width: none !important;
  opacity: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-tpv-to-map-btn__icon {
  width: 16px !important;
  height: 16px !important;
  font-size: 12px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comensales--head-band {
  max-width: 124px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-header-compact {
  gap: 1px !important;
  margin-top: 0 !important;
  min-height: 0 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-grid {
  gap: 1px 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-status-grid__cell {
  font-size: 8px !important;
  padding: 1px 3px !important;
  line-height: 1.05 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pass-chips {
  gap: 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pass-chip {
  font-size: 8px !important;
  min-height: 20px !important;
  padding: 2px 6px !important;
  gap: 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pass-chip.is-pending-march {
  font-size: 10px !important;
  min-height: 34px !important;
  padding: 5px 11px !important;
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
  margin-bottom: 2px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-group-title {
  margin: 1px 0 1px !important;
  font-size: 9px !important;
  line-height: 1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line {
  min-height: 32px !important;
  padding: 2px 5px !important;
  border-radius: 5px !important;
  gap: 3px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line.is-pending {
  padding: 2px 5px 2px 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line.is-held-for-march {
  padding: 2px 5px 2px 10px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line-grid {
  column-gap: 4px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-name-primary {
  font-size: 13px !important;
  line-height: 1.1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-name-mods {
  font-size: 11px !important;
  line-height: 1.1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line-pricing,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pu,
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-pu-suffix {
  font-size: 10px !important;
  line-height: 1.1 !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-line-total-value {
  font-size: 12px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-course-pass-chip {
  font-size: 6px !important;
  font-weight: 800 !important;
  padding: 1px 4px !important;
  color: #475569 !important;
  border-color: rgba(100, 116, 139, 0.34) !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-qty-controls {
  gap: 2px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-qty-btn {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  min-height: 34px !important;
  border-radius: 9px !important;
  font-size: 15px !important;
}
.carta-root[data-carta-embedded="true"][data-carta-mobile="true"] .carta-comanda-more-btn {
  min-width: 34px !important;
  min-height: 34px !important;
  padding: 0 8px !important;
  border-radius: 9px !important;
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
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={requestOperatorChange}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm font-semibold text-[var(--hostly-ink)] shadow-sm transition-colors hover:bg-[rgba(15,23,42,0.03)]"
                aria-label={`${activeOperator?.activeOperatorName ?? t("activeOperator.title")} · ${t("activeOperator.change")}`}
              >
                <span>{activeOperator?.activeOperatorName}</span>
                <span className="text-[var(--hostly-ink-muted)]">·</span>
                <span className="text-[var(--hostly-ink-muted)]">
                  {t("activeOperator.change")}
                </span>
              </button>
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
                    paddingLeft: embeddedInOperacion ? 4 : 6,
                    paddingRight: embeddedInOperacion ? 4 : 6,
                    flexShrink: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: embeddedInOperacion ? 4 : 6,
                    border:
                      mapSummaryAlertLevel === "critical"
                        ? "1px solid rgba(201, 99, 91, 0.38)"
                        : mapSummaryAlertLevel === "warning"
                          ? "1px solid rgba(196, 144, 61, 0.36)"
                          : "1px solid var(--hostly-line)",
                    boxShadow: "none",
                    marginBottom: 0,
                  }}
                >
                <div className="carta-map-top-strip-line">
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
                </div>
                {operationalFloorPlansForTpv.length > 1 ||
                (restaurantId && isFirebaseConfigured) ? (
                  <div
                    className="carta-map-floor-plan-cluster"
                    role="group"
                    aria-label="Plano"
                  >
                    <span
                      className="carta-map-floor-plan-divider"
                      aria-hidden="true"
                    />
                    <span className="carta-map-floor-plan-label">Plano</span>
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
                              <TpvFloorPlanIcon
                                planName={
                                  selectedTpvFloorPlan?.name?.trim() ?? ""
                                }
                                className="carta-tpv-floor-plan-trigger-icon"
                              />
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
                                <TpvFloorPlanIcon
                                  planName={plan.name}
                                  className="carta-tpv-floor-plan-seg-pill-icon"
                                />
                                <span className="carta-tpv-floor-plan-seg-pill-label">
                                  {plan.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )
                    ) : null}
                    {restaurantId && isFirebaseConfigured ? (
                      <span
                        className="carta-tpv-layout-active-badge hostly-pill hostly-muted"
                        title={tpvActiveLayoutLabel}
                        aria-live="polite"
                      >
                        {tpvActiveLayoutLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}
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
                                <TpvFloorPlanIcon
                                  planName={plan.name}
                                  className="carta-tpv-floor-plan-seg-pill-icon"
                                />
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
                {restaurantWaitersLoadStatus === "error" ? (
                  <div
                    className="hostly-carta-config-alert hostly-carta-config-alert--error flex min-w-0 flex-1 items-center justify-between gap-2"
                    role="alert"
                    data-error-kind={restaurantWaitersErrorKind ?? "network"}
                  >
                    <span>No se pudo cargar el equipo</span>
                    <button
                      type="button"
                      className="hostly-button-secondary hostly-button-compact"
                      onClick={() =>
                        setRestaurantWaitersReloadToken(
                          (current) => current + 1,
                        )
                      }
                    >
                      Reintentar
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}
              {embeddedInOperacion && activeOperator ? (
                <div
                  className="carta-my-tables-map-scope"
                  role="tablist"
                  aria-label={t("cartaTpv.mapOperatorScopeAria")}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={myTablesMapScope === "all"}
                    className={`carta-table-map-zone-btn${
                      myTablesMapScope === "all"
                        ? " carta-table-map-zone-btn--on"
                        : ""
                    }`}
                    onClick={() => setMyTablesMapScope("all")}
                  >
                    {t("cartaTpv.mapOperatorScopeAll")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={myTablesMapScope === "mine"}
                    className={`carta-table-map-zone-btn${
                      myTablesMapScope === "mine"
                        ? " carta-table-map-zone-btn--on"
                        : ""
                    }`}
                    onClick={() => setMyTablesMapScope("mine")}
                  >
                    {t("cartaTpv.mapOperatorScopeMine")}
                  </button>
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
                {tpvOperationalMapElementsForRender.length === 0 &&
                !useReadonlyV2Map ? (
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
                ) : tablesVisibleOnMap.length > 0 &&
                  mapTablesOrderedByVisualPriority.length === 0 ? (
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
                ) : tablesVisibleOnMap.length > 0 &&
                  mapTablesForChipFilter.length === 0 ? (
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
                    floorSurfacePreset={
                      cartaHeaderMobile && embeddedInOperacion
                        ? "stone"
                        : "ice"
                    }
                    viewportFitPaddingPx={
                      embeddedInOperacion
                        ? TPV_OPERATIONAL_FIT_PADDING_PX
                        : 8
                    }
                    viewportFitAlign="center"
                    viewportFitOffsetX={
                      embeddedInOperacion ? TPV_OPERATIONAL_FIT_OFFSET_X : 0
                    }
                    viewportFitOffsetY={
                      embeddedInOperacion ? TPV_OPERATIONAL_FIT_OFFSET_Y : 0
                    }
                    viewportFitZoomMultiplier={
                      embeddedInOperacion
                        ? TPV_OPERATIONAL_FINAL_ZOOM_MULTIPLIER
                        : 1
                    }
                    viewportFitMode="plan"
                    viewportFitElements={tpvOperationalViewportFitElements}
                    viewportFitZones={[]}
                    viewportFitZoomMax={
                      embeddedInOperacion
                        ? cartaHeaderMobile
                          ? TPV_OPERATIONAL_FIT_ZOOM_MAX_MOBILE
                          : TPV_OPERATIONAL_FIT_ZOOM_MAX_DESKTOP
                        : 1.78
                    }
                    mapAutoFitKey={tpvMapAutoFitKey}
                    planSize={tpvOperationalPlanSizeForRender}
                    elements={tpvOperationalMapElementsForRender}
                    zones={zonesForOperationalMapRender}
                    readonlyUnderlay={
                      useReadonlyV2Map && readonlyMapIntegration.contract ? (
                        <SalaEditorReadonlyMap
                          contract={readonlyMapIntegration.contract}
                          mode="logical-underlay"
                          operationalMode="tpv"
                          operationalStateByLegacyTableId={
                            readonlyV2OperationalStateByLegacyTableId
                          }
                          operationalSelectedLegacyTableIds={
                            readonlyV2SelectedLegacyTableIds
                          }
                          operationalVisibleInstanceIds={
                            readonlyV2TableHitboxParity.matchedInstanceIds
                          }
                          coordinateScale={1}
                        />
                      ) : null
                    }
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
                      const readonlyV2MatchedInstance = useReadonlyV2Map
                        ? readonlyV2TableHitboxParity.instanceByLegacyTableId.get(tableId) ??
                          null
                        : null;
                      const readonlyV2Geometry = readonlyV2MatchedInstance
                        ? projectOperationalElement(readonlyV2MatchedInstance)
                        : null;
                      const mapLayoutX = readonlyV2Geometry?.x ?? ctx.mapLayoutX;
                      const mapLayoutY = readonlyV2Geometry?.y ?? ctx.mapLayoutY;
                      const mapTileWidth = readonlyV2Geometry?.width ?? ctx.mapTileWidth;
                      const mapTileHeight = readonlyV2Geometry?.height ?? ctx.mapTileHeight;
                      const readonlyV2InteractionOnly =
                        useReadonlyV2Map && readonlyV2MatchedInstance != null;
                      const readonlyV2HitboxRotation =
                        readonlyV2Geometry?.rotation ?? 0;
                      const priorityTable =
                        mapTablesForChipFilter.find(
                          (t) => String(t.id).trim() === tableId,
                        ) ?? ctx.element;
                      const group = resolveJoinedTableGroupMapState(
                        tableId,
                        groupedTablesMapHandlers,
                        firestoreOccupiedTableIds,
                        ordersByTable,
                      );
                      const serviceTableId = group.serviceTableId;
                      const busy = group.busy;
                      const isBusy = Boolean(openOrdersByTable[serviceTableId]);
                      const tileVisual = mapTileOccupancyVisual(serviceTableId, busy);
                      const durationLabel =
                        busy && firestoreOccupiedTableIds.has(serviceTableId)
                          ? formatMapOccupiedDuration(serviceTableId)
                          : null;
                      const tableLines = ordersByTable[serviceTableId] ?? [];
                      const activeLineCount = countActiveComandaLines(tableLines);
                      const showProductCount = busy && activeLineCount > 0;
                      const badgeTier =
                        activeLineCount >= 8
                          ? "high"
                          : activeLineCount >= 4
                            ? "medium"
                            : "low";
                      const openedAt = orderOpenedAtByTable[serviceTableId];
                      const openedAtMs =
                        typeof openedAt === "number" && Number.isFinite(openedAt)
                          ? openedAt
                          : undefined;
                      const total = orderTotalsByTable[serviceTableId];
                      const orderTotal =
                        typeof total === "number" && Number.isFinite(total)
                          ? total
                          : undefined;
                      const mapOperationalInput = buildTableOperationalVisualInput({
                        busy,
                        reserved: Boolean(reservedByTableId[tableId]),
                        lines: tableLines,
                        occupancyStartMs:
                          firestoreOccupancyStartMsByTable[serviceTableId],
                        orderOpenedAtMs: openedAtMs,
                        orderTotal,
                        mapNow: now,
                        readyToClose: salaReadyToCloseTableIds.has(serviceTableId),
                        reservationPressure:
                          reservationPressureByTableId[tableId] ?? null,
                      });
                      const isCriticalTable = mapOperationalInput.isCriticalTable;
                      const priorityLevel = mapOperationalInput.priorityLevel;
                      const ariaTileBusy = busy
                        ? cartaHeaderMobile
                          ? `${String(stableTable.name ?? "").trim()}, ${t("cartaTpv.mapOcupada")}`
                          : `${String(stableTable.name ?? "").trim()}${durationLabel ? `, ${durationLabel}` : ""}${showProductCount ? ` (${activeLineCount})` : ""}, ${t("cartaTpv.mapOcupada")}`
                        : "";
                      const lastActivityAt = lastActivityAtByTable[serviceTableId];
                      const inactiveMinutes =
                        isBusy &&
                        lastActivityAt != null &&
                        Number.isFinite(lastActivityAt)
                          ? Math.max(
                              0,
                              Math.floor((now - lastActivityAt) / 60000),
                            )
                          : 0;

                      const dinersCount = readTableDinersCount(stableTable);
                      const paxLabel = dinersCount > 0 ? `${dinersCount} pax` : "";
                      const groupedBadgeText =
                        groupedTablesMapHandlers?.getGroupedBadgeText(tableId) ??
                        null;

                      return (
                        <div
                          key={stableTable.id}
                          data-hostly-tpv-legacy-table-overlay={
                            readonlyV2InteractionOnly
                              ? "interaction-only"
                              : useReadonlyV2Map
                                ? "legacy-fallback-visible"
                                : undefined
                          }
                        >
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
                            firestoreOccupancyStartMsByTable[serviceTableId] || 0
                          }
                          priority={mapTablePriorityScore(priorityTable)}
                          setNodeRef={getTableFlipRefCallback(tableId)}
                          prefersReducedMotion={prefersReducedMotion}
                          isUltraFastMode={isUltraFastMode}
                          mapLayoutX={mapLayoutX}
                          mapLayoutY={mapLayoutY}
                          mapTileWidth={mapTileWidth}
                          mapTileHeight={mapTileHeight}
                          mapRotation={readonlyV2HitboxRotation}
                          interactionOnly={readonlyV2InteractionOnly}
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
                            serviceTableId,
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
                          readyToClose={group.memberIds.some((memberId) =>
                            salaReadyToCloseTableIds.has(memberId),
                          )}
                          pendingMarchPassHint={
                            pendingMarchPassHintByTableId[serviceTableId] ??
                            null
                          }
                          groupedBadgeText={groupedBadgeText}
                          mapJoinDragEnabled={Boolean(
                            groupedTablesMapHandlers?.joinTables && canJoinTables,
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
                            groupedTablesMapHandlers?.separateTable &&
                            canJoinTables
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
                        </div>
                      );
                    }}
                  />
                  </PinchZoomMap>
                )}
                </div>
              </div>
            </div>
          ) : (
          <div
            ref={cartaLayoutRef}
            className="carta-layout"
            data-carta-split-active={
              showComandaPanelSplitter ? "true" : undefined
            }
            style={
              showComandaPanelSplitter
                ? ({
                    "--carta-comanda-width": `${comandaPanelWidthPct}%`,
                  } as CSSProperties)
                : undefined
            }
          >
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
              justifyContent: "flex-start",
              gap: 6,
              minHeight: 0,
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
                <div className="carta-comanda-head-compact-band w-full min-w-0">
                  {!orderIdFromUrl &&
                  (tpvEntryMode === "tpv" || tpvEntryMode === "summary") ? (
                    <button
                      type="button"
                      className="carta-tpv-to-map-btn carta-tpv-to-map-btn--prominent"
                      onClick={handleBackToMap}
                    >
                      <span className="carta-tpv-to-map-btn__icon" aria-hidden>
                        ←
                      </span>
                      <span className="carta-tpv-to-map-btn__label">
                        {t("cartaTpv.mapNavVisible")}
                      </span>
                    </button>
                  ) : null}
                  <div className="carta-comanda-head-mesa-line">
                    <p
                      className="carta-comanda-headline min-w-0 truncate"
                      style={{
                        fontSize: 17,
                        fontWeight: 950,
                        letterSpacing: "-0.01em",
                        textAlign: "left",
                        margin: 0,
                        padding: 0,
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
                        <span style={{ color: "rgba(15, 23, 42, 0.38)" }}>Sin mesa</span>
                      )}
                    </p>
                    {tpvComandaHeaderTime ? (
                      <>
                        <span className="carta-comanda-head-sep" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className="carta-comanda-headline-time shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none tracking-tight"
                          style={{ color: tpvComandaHeaderTime.color }}
                        >
                          {tpvComandaHeaderTime.label}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {viewMode === "normal" && selectedTableId ? (
                    <div className="carta-comanda-head-guests">
                      <div className="carta-comensales-compact carta-comensales--pill carta-comensales--head-band">
                        <span className="carta-comensales-label">Comensales</span>
                        <button
                          type="button"
                          onClick={() => void persistGuestCount(guestCount - 1)}
                          disabled={guestCount <= 0}
                          aria-label="Menos comensales"
                        >
                          -
                        </button>
                        <span className="carta-comensales-count">{guestCount}</span>
                        <button
                          type="button"
                          onClick={() => void persistGuestCount(guestCount + 1)}
                          aria-label="Más comensales"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                {embeddedInOperacion &&
                selectedTableId &&
                (tablePresence.displayLabel || tablePresence.showConcurrentBadge) ? (
                  <TpvTablePresenceIndicators
                    displayLabel={tablePresence.displayLabel}
                    showConcurrentBadge={tablePresence.showConcurrentBadge}
                  />
                ) : null}
                {embeddedInOperacion && selectedTableId ? (
                  <div
                    className="carta-comanda-connectivity-row"
                    style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}
                  >
                    <ConnectivityStatusPill status={connectivityStatus} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {viewMode === "normal" && (
            <div className="carta-header-compact carta-comanda-header-compact">
              <div className="carta-comanda-header-ops-wrap">
                {tpvComandaEstadosGridEl}
                {tpvComandaCourseSummaryEl}
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
                          resolveDisplayPreparationAreaForCartLine(item) === area,
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
              {orderDeepLinkNotice ? (
                <div style={{ padding: "0 8px 8px" }}>
                  <DeepLinkContextNotice message={orderDeepLinkNotice} />
                </div>
              ) : null}
              {orderDeepLinkLineNotice ? (
                <div style={{ padding: "0 8px 8px" }}>
                  <DeepLinkContextNotice message={orderDeepLinkLineNotice} />
                </div>
              ) : null}
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
                  <div
                    style={{
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    {linesPending.length > 0 ? (
                      <ul
                        style={{
                          margin: 0,
                          padding: 0,
                          listStyle: "none",
                        }}
                      >
                        {linesPending.map((line) =>
                          renderComandaLine(line, "Pendiente", {
                            attachFirstPendingRef:
                              line.id === linesPending[0]?.id,
                          }),
                        )}
                      </ul>
                    ) : null}
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
                              if (st === "preparing") {
                                return renderComandaLine(line, "Preparando", {});
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
                              if (st === "cancelled") {
                                return renderComandaLine(line, "Cancelado", {
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
                  }${comandaSentFlash ? " is-success" : ""}`}
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
                  {comandaSentFlash
                    ? "Comanda enviada"
                    : `Enviar comanda${linesPending.length > 0 ? ` · ${linesPending.length}` : ""}`}
                </button>
                <div
                  className="carta-tpv-dock-pre-ticket-wrap"
                  style={{ minWidth: 0, display: "flex" }}
                >
                  <button
                    type="button"
                    onClick={handlePrintPreTicket}
                    className="carta-tpv-dock-pre-ticket"
                  >
                    <span aria-hidden>🧾</span>
                    <span>Pre-ticket</span>
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
                      onClick={() => {
                        if (!canCharge) return;
                        setIsPaymentOpen(true);
                      }}
                      disabled={
                        isPayTableOrderSending ||
                        order.length === 0 ||
                        !restaurantId ||
                        !isFirebaseConfigured ||
                        !canCharge
                      }
                      title={capabilityDeniedTitle(
                        canCharge,
                        order.length === 0
                          ? "No hay productos en la comanda"
                          : "Cobrar esta mesa",
                      )}
                    >
                      {isPayTableOrderSending ? (
                        "…"
                      ) : (
                        <>
                          <span aria-hidden>💳</span>
                          <span>Cobrar</span>
                        </>
                      )}
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
          <div className="fixed inset-0 bg-slate-950/72 flex items-center justify-center z-50 p-2">
            <div className="bg-white text-gray-900 rounded-[26px] w-full max-w-[520px] shadow-[0_28px_80px_rgba(2,6,23,0.34)] flex flex-col max-h-[calc(100vh-16px)] overflow-hidden border border-white/70">
              <div
                className={
                  isSimplePaymentMode
                    ? "flex-1 min-h-0 flex flex-col px-3 sm:px-4 pt-3 pb-0 bg-gradient-to-b from-slate-50 via-white to-white"
                    : "flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-3 pt-2 pb-0"
                }
              >
                {isSimplePaymentMode ? (
                  <div className="flex flex-col min-h-0 flex-1">
                      <div className="shrink-0 flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={handleCancelPaymentFlow}
                            disabled={isConfirmingPayment}
                            className="shrink-0 min-h-[40px] px-3 rounded-2xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 shadow-sm active:bg-slate-50 touch-manipulation disabled:opacity-50"
                          >
                            ← Volver
                          </button>
                          <span className="min-w-0 text-[15px] font-extrabold text-slate-950 leading-tight truncate">
                            {selectedTableId
                              ? `Cobrar ${formatActiveMesaIndicator(
                                  tablesList.find((t) => t.id === selectedTableId)?.name?.trim() ||
                                    selectedTableId,
                                ).replace(/^Mesa/, "mesa")}`
                              : "Cobrar mesa"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer rounded-2xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 shadow-sm normal-case select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                              checked={autoPrintTicket}
                              onChange={(e) =>
                                persistAutoPrintTicket(e.target.checked)
                              }
                            />
                            <span className="whitespace-nowrap">
                              Auto imprimir ticket
                            </span>
                          </label>
                        </div>
                      </div>

                      {(() => {
                        const payDisc = calculateFinalTotal(total);
                        const payTotal = payDisc.finalTotal;
                        const remainingDue = roundMoney(
                          Math.max(payTotal - sessionTableAmountPaidSum, 0),
                        );
                        const isZeroAccountClose = remainingDue <= MONEY_EPS;
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
                        } else if (paymentMethod === "card") {
                          receivedDisplay =
                            cardRawTrim === "" ? remainingDue : cardParsedNum;
                        } else if (paymentMethod === "voucher") {
                          receivedDisplay = voucherUsedUi;
                          changeDisplay = 0;
                        }

                        let chargePreview = 0;
                        if (paymentMethod === "cash") {
                          chargePreview = roundMoney(
                            Math.min(cashParsedNum, remainingDue),
                          );
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

                        if (paymentMethod === "cash") {
                          changeDisplay = Math.max(
                            cashParsedNum - chargePreview,
                            0,
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
                          !willPayRemaining &&
                          chargePreview > MONEY_EPS &&
                          remainingDue > MONEY_EPS
                        ) {
                          confirmLabel = `Cobrar parcial ${amtShort}`;
                        } else if (
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
                          const next =
                            paymentMethod === "cash"
                              ? roundMoney(cur + delta)
                              : roundMoney(
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
                          "min-h-[44px] rounded-[16px] border border-slate-100 bg-white text-xl font-extrabold text-slate-950 shadow-[0_4px_12px_rgba(15,23,42,0.05)] active:scale-[0.985] active:bg-slate-50 touch-manipulation select-none transition";

                        const inputMoneyClass =
                          "w-full min-h-[44px] border border-slate-200 rounded-[16px] px-3 text-center text-xl font-black tracking-tight text-slate-950 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)] touch-manipulation outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

                        return (
                          <>
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 pb-1 pr-0.5">
                            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5 space-y-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
                              {sessionTableAmountPaidSum > MONEY_EPS ? (
                                <div className="flex justify-between gap-2 text-sm font-semibold text-slate-500">
                                  <span>Total cuenta</span>
                                  <span className="tabular-nums text-slate-700">
                                    {formatTpveurEs(payTotal)}
                                  </span>
                                </div>
                              ) : null}
                              <div className="space-y-0.5 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                  Pendiente
                                </div>
                                <div className="text-4xl font-black tabular-nums leading-none tracking-[-0.05em] text-slate-950">
                                  {formatTpveurEs(remainingDue)}
                                </div>
                              </div>
                              {!isZeroAccountClose ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-center">
                                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                                    Recibido
                                  </div>
                                  <div className="mt-0.5 text-lg font-black tabular-nums leading-none text-slate-800">
                                    {formatTpveurEs(receivedDisplay)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-center">
                                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                                    {paymentMethod === "card" ? "Propina" : "Cambio"}
                                  </div>
                                  <div
                                    className={`mt-0.5 text-lg font-black tabular-nums leading-none ${
                                      (paymentMethod === "card"
                                        ? tipRaw
                                        : changeDisplay) > MONEY_EPS
                                        ? "text-emerald-600"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {formatTpveurEs(
                                      paymentMethod === "card"
                                        ? tipRaw
                                        : changeDisplay,
                                    )}
                                  </div>
                                </div>
                              </div>
                              ) : null}
                            </div>

                            {isZeroAccountClose ? (
                              <p className="text-center text-sm font-medium text-slate-600 px-1">
                                Cuenta a 0 € — invitaciones aplicadas. No requiere
                                cobro.
                              </p>
                            ) : (
                              <>
                            <div className="grid grid-cols-3 gap-1 rounded-[18px] bg-slate-100 p-1 shadow-inner">
                              <button
                                type="button"
                                className={`min-h-[40px] rounded-[14px] text-sm font-black touch-manipulation select-none transition ${
                                  paymentMethod === "cash"
                                    ? "bg-white text-blue-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-white"
                                    : "text-slate-500 active:bg-white/70"
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
                                className={`min-h-[40px] rounded-[14px] text-sm font-black touch-manipulation select-none transition ${
                                  paymentMethod === "card"
                                    ? "bg-white text-blue-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-white"
                                    : "text-slate-500 active:bg-white/70"
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
                                className={`min-h-[40px] rounded-[14px] text-sm font-black touch-manipulation select-none transition ${
                                  paymentMethod === "voucher"
                                    ? "bg-white text-blue-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-white"
                                    : "text-slate-500 active:bg-white/70"
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
                              <div className="grid grid-cols-2 gap-2">
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
                                  className="w-full min-h-[44px] border border-slate-200 rounded-[16px] px-3 text-base font-semibold bg-white shadow-sm touch-manipulation outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                />
                                {voucherLookupBalance != null ? (
                                  <div className="col-span-2 text-sm font-medium text-slate-600">
                                    Saldo disponible:{" "}
                                    {voucherLookupBalance
                                      .toFixed(2)
                                      .replace(".", ",")}{" "}
                                    €
                                  </div>
                                ) : null}
                                {voucherValueUi > 0 ? (
                                  <div className="col-span-2 text-sm text-slate-600">
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
                              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                                {(
                                  [
                                    "1",
                                    "2",
                                    "3",
                                    "⌫",
                                    "4",
                                    "5",
                                    "6",
                                    "+5 €",
                                    "7",
                                    "8",
                                    "9",
                                    "+10 €",
                                    "0",
                                    ",",
                                    "00",
                                    "Exacto",
                                  ] as const
                                ).map((k) => {
                                  if (k === "⌫") {
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        className={keypadTouchClass}
                                        onClick={backspaceDigit}
                                        aria-label="Borrar"
                                      >
                                        ⌫
                                      </button>
                                    );
                                  }
                                  if (k === "+5 €") {
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        className={keypadTouchClass}
                                        onClick={() => bumpBy(5)}
                                      >
                                        +5 €
                                      </button>
                                    );
                                  }
                                  if (k === "+10 €") {
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        className={keypadTouchClass}
                                        onClick={() => bumpBy(10)}
                                      >
                                        +10 €
                                      </button>
                                    );
                                  }
                                  if (k === "Exacto") {
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        className={`${keypadTouchClass} !bg-blue-50 !border-blue-100 !text-blue-900 !text-base`}
                                        onClick={setExact}
                                      >
                                        Exacto
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      className={keypadTouchClass}
                                      onClick={() => appendDigit(k)}
                                    >
                                      {k}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                              </>
                            )}

                            <PaymentBillingSection
                              variant="dock"
                              restaurantId={operationalRestaurantId}
                              selectedCustomer={selectedBillingCustomer}
                              onSelectedCustomerChange={setSelectedBillingCustomer}
                            />

                            <PaymentModalAdjustmentsSection
                              discountAmount={discountAmount}
                              discountPercent={discountPercent}
                              onDiscountAmountChange={setDiscountAmount}
                              onDiscountPercentChange={setDiscountPercent}
                              onPrintPreTicket={handlePrintPreTicket}
                              onSplitAccount={() => {
                                setIsSplitMode(true);
                                setIsSplitEqualMode(false);
                                setSplitCount(2);
                                setCurrentSplitIndex(1);
                              }}
                            />
                            </div>

                            <div className="sticky bottom-0 -mx-3 sm:-mx-4 shrink-0 border-t border-slate-200/80 bg-white/95 px-3 sm:px-4 pt-1.5 pb-2.5 space-y-1 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
                              {isZeroAccountClose ? (
                                <button
                                  type="button"
                                  disabled={isConfirmingPayment || !canCharge}
                                  className="w-full min-h-[52px] rounded-[18px] text-base font-black shadow-[0_12px_24px_rgba(37,99,235,0.22)] touch-manipulation select-none disabled:opacity-60 disabled:cursor-not-allowed"
                                  style={{
                                    background:
                                      isConfirmingPayment || !canCharge
                                        ? "rgba(148,163,184,0.55)"
                                        : "#2563eb",
                                    color: "#fff",
                                  }}
                                  onClick={() => {
                                    if (isConfirmingPayment) return;
                                    void (async () => {
                                      setIsConfirmingPayment(true);
                                      try {
                                        await handleCloseZeroTotalAccount();
                                      } finally {
                                        setIsConfirmingPayment(false);
                                      }
                                    })();
                                  }}
                                >
                                  {isConfirmingPayment
                                    ? "Cerrando…"
                                    : "Cerrar cuenta"}
                                </button>
                              ) : (
                              <button
                                type="button"
                                disabled={
                                  paymentMethod === null ||
                                  !isPaymentValid(remainingDue) ||
                                  isConfirmingPayment ||
                                  !canCharge
                                }
                                className="w-full min-h-[52px] rounded-[18px] text-base font-black shadow-[0_12px_24px_rgba(37,99,235,0.22)] touch-manipulation select-none disabled:opacity-60 disabled:cursor-not-allowed"
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
                              )}
                            </div>
                          </>
                        );
                      })()}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 text-sm font-semibold mb-0.5 text-gray-900 leading-tight">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={handleCancelPaymentFlow}
                          disabled={isConfirmingPayment}
                          className="shrink-0 min-h-[40px] px-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 active:bg-slate-200 touch-manipulation disabled:opacity-50"
                        >
                          ← Volver
                        </button>
                        <span className="min-w-0 truncate">
                          {isSplitMode ? "Dividir cuenta" : "Cobrar mesa"}
                        </span>
                      </div>
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
                                  const primaryOrderId =
                                    (orderIdFromUrl?.trim() ? orderIdFromUrl.trim() : null) ??
                                    (openOrderIdsForTable[0]?.trim()
                                      ? openOrderIdsForTable[0]!.trim()
                                      : null);
                                  if (!primaryOrderId) {
                                    window.alert("No se encontró la comanda activa para cobrar.");
                                    return;
                                  }
                                  const chargeResult = await chargeOrderViaApi({
                                    orderId: primaryOrderId,
                                    tableId: selectedTableId || selectedTable?.id || undefined,
                                    tableName:
                                      selectedTable?.name ||
                                      (selectedTable as { label?: string } | null)?.label ||
                                      undefined,
                                    paymentMethod: pm,
                                    type: "split_by_items",
                                    amount: amountToPay,
                                    itemIds: selectedItemIds,
                                    orderSessionId: orderSessionId || undefined,
                                    tip: tipVal,
                                    received: receivedVal,
                                    cashReceived: pm === "cash" ? cashParsed : undefined,
                                    change: changeVal,
                                    voucherAmount: pm === "voucher" ? voucherValue : undefined,
                                    voucherNumber:
                                      pm === "voucher" ? voucherNumber.trim() : undefined,
                                    waiterId: waiterId ?? undefined,
                                    waiterEmail: waiterEmail ?? undefined,
                                    idempotencyKey: `${primaryOrderId}:split:${selectedItemIds.join(",")}`,
                                  });
                                  if (!chargeResult.ok) {
                                    throw new Error(chargeResult.error);
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
                                      await closeTableGroupInFirestore(
                                        tableIdToFinish,
                                      );
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
                            disabled={!isPaymentValid(payTotal) || !canCharge}
                            title={capabilityDeniedTitle(canCharge)}
                            className="w-full py-2 rounded-md text-xs font-semibold shadow"
                            style={{
                              background:
                                !isPaymentValid(payTotal) || !canCharge
                                ? "rgba(148,163,184,0.55)"
                                  : "#2563eb",
                              color: "#fff",
                              cursor:
                                !isPaymentValid(payTotal) || !canCharge
                                  ? "not-allowed"
                                  : "pointer",
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
                    const isZeroAccountClose = remainingDue <= MONEY_EPS;
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
                        {isZeroAccountClose ? (
                          <>
                            <div className="text-[11px] text-slate-600 leading-tight">
                              Cuenta a 0 € — invitaciones aplicadas. No requiere
                              cobro.
                            </div>
                            <div className="sticky bottom-0 z-[2] mt-1 border-t border-slate-200/90 bg-white pt-1.5 pb-0.5">
                              <button
                                type="button"
                                disabled={!canCharge}
                                title={capabilityDeniedTitle(canCharge)}
                                className="w-full py-2 rounded-md text-xs font-semibold shadow"
                                style={{
                                  background: !canCharge
                                    ? "rgba(148,163,184,0.55)"
                                    : "#2563eb",
                                  color: "#fff",
                                  cursor: !canCharge ? "not-allowed" : "pointer",
                                }}
                                onClick={() => {
                                  void handleCloseZeroTotalAccount();
                                }}
                              >
                                Cerrar cuenta
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
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

                        <PaymentBillingSection
                          variant="compact"
                          restaurantId={operationalRestaurantId}
                          selectedCustomer={selectedBillingCustomer}
                          onSelectedCustomerChange={setSelectedBillingCustomer}
                        />

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
                            disabled={
                              !isPaymentValid(remainingDue) ||
                              hasPartialPayments ||
                              !canCharge
                            }
                            title={capabilityDeniedTitle(canCharge)}
                            className={`w-full py-2 rounded-md text-xs font-semibold shadow ${
                              hasPartialPayments ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                            style={{
                              background:
                                !isPaymentValid(remainingDue) ||
                                hasPartialPayments ||
                                !canCharge
                                ? "rgba(148,163,184,0.55)"
                                : "#2563eb",
                              color: "#fff",
                              cursor:
                                !isPaymentValid(remainingDue) ||
                                hasPartialPayments ||
                                !canCharge
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
                          </>
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
                    className="w-full min-h-[44px] py-2 rounded-lg font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm touch-manipulation"
                    disabled={isConfirmingPayment}
                    onClick={handleCancelPaymentFlow}
                  >
                    Volver a comanda
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
        {isBillingInvoicePanelOpen && lastBillingInvoice ? (
          <BillingInvoiceCompletionPanel
            open={isBillingInvoicePanelOpen}
            invoice={lastBillingInvoice}
            onClose={() => {
              setIsBillingInvoicePanelOpen(false);
              setLastBillingInvoice(null);
            }}
          />
        ) : null}
        {showComandaPanelSplitter ? (
          <div
            className="carta-layout-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(comandaPanelWidthPct)}
            aria-valuemin={COMANDA_PANEL_WIDTH_MIN}
            aria-valuemax={COMANDA_PANEL_WIDTH_MAX}
            aria-label="Redimensionar panel comanda"
            data-dragging={isComandaPanelResizing ? "true" : undefined}
            onPointerDown={handleComandaSplitterPointerDown}
            onDoubleClick={handleComandaSplitterDoubleClick}
          />
        ) : null}
        {viewMode === "normal" && (
          <main
            className="carta-main carta-productos"
            data-products-empty={
              !showAuthSpinner &&
              !showProductsSpinner &&
              !catalogLoadError &&
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
              {((embeddedInOperacion && !showTableMap) ||
                (!showAuthSpinner &&
                  !showProductsSpinner &&
                  !catalogLoadError &&
                  products.length > 0)) && (
                  <>
                    <div className="carta-products-menu-row mb-1.5 flex w-full flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
                      {!showAuthSpinner &&
                      !showProductsSpinner &&
                      !catalogLoadError &&
                      products.length > 0 ? (
                      <>
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
                    <div
                      className="carta-tpv-preqty"
                      aria-label="Cantidad previa para añadir producto"
                    >
                      <div
                        className={`carta-tpv-preqty__badge${
                          preAddQuantity > 1
                            ? " carta-tpv-preqty__badge--active"
                            : ""
                        }`}
                        aria-live="polite"
                      >
                        {preAddQuantity > 1
                          ? `x${preAddQuantity} activo`
                          : "x1"}
                      </div>
                      <div className="carta-tpv-preqty__keys">
                        {([1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const).map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="carta-tpv-preqty__key"
                            onClick={() => appendPreAddQuantityDigit(n)}
                            aria-label={`Cantidad ${n}`}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="carta-tpv-preqty__key carta-tpv-preqty__key--clear"
                          onClick={clearPreAddQuantity}
                          aria-label="Borrar cantidad previa"
                        >
                          C
                        </button>
                      </div>
                    </div>
                    </>
                      ) : (
                        <div className="min-w-0 flex-1" aria-hidden />
                      )}
                      {embeddedInOperacion && !showTableMap ? (
                        <ActiveOperatorTopBarButton
                          className="carta-products-operator-btn ml-auto shrink-0"
                          onRequestOperatorChange={handleRequestOperatorChange}
                        />
                      ) : null}
                    </div>
                  {!showAuthSpinner &&
                  !showProductsSpinner &&
                  !catalogLoadError &&
                  products.length > 0 ? (
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
                          className={`carta-cat-btn${
                            isSelected ? " carta-cat-btn--active" : ""
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  ) : null}
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
                catalogLoadError && <p>Error cargando productos</p>}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !catalogLoadError &&
                products.length === 0 &&
                visibleOrderLines.length > 0 && (
                  <div className="carta-products-empty-state">
                    No hay productos activos
                  </div>
                )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !catalogLoadError &&
                products.length > 0 &&
                !hasVisibleProductsForCurrentMenu &&
                visibleOrderLines.length > 0 && (
                  <div className="carta-products-empty-state">
                    No hay productos visibles en esta categoría
                  </div>
                )}
              {!showAuthSpinner &&
                !showProductsSpinner &&
                !catalogLoadError &&
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
                                const stockWarning =
                                  productStockWarningById.get(product.id) ?? "none";
                                const stockWarningLabel =
                                  getStockWarningLabel(stockWarning);
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
                                      if (now - last < 80) return;
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
                                        if (now - last < 80) return;
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
                                        className="hostly-tpv-inline-plus-one"
                                        aria-hidden="true"
                                      >
                                        +{isAddingByProductId[product.id]}
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
                                    {stockWarningLabel ? (
                                      <div
                                        className={`carta-product-stock-badge ${stockWarningBadgeClassName(stockWarning)}`}
                                        aria-label={stockWarningLabel}
                                      >
                                        {stockWarningLabel}
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
                                    <div className="carta-product-media">
                                      {hasImg ? (
                                        <img
                                          src={product.imageUrl}
                                          alt=""
                                          className="carta-product-media__img"
                                        />
                                      ) : (
                                        <div
                                          className="carta-product-media__fallback"
                                          style={{
                                            backgroundColor: softBackgroundFromName(
                                              product.nombre,
                                            ),
                                          }}
                                        >
                                          <span className="carta-product-media__initial">
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
      {modifierModalProduct && modifierModalGroups.length > 0 ? (
        <TpvProductModifiersModal
          product={modifierModalProduct}
          groups={modifierModalGroups}
          inventoryProductsById={inventoryProductsById}
          onCancel={() => {
            setModifierModalProduct(null);
            setModifierModalGroups([]);
          }}
          onConfirm={(payload) => {
            appendProductToOrder(
              modifierModalProduct,
              payload,
              modifierModalPreAddQuantity,
            );
            preAddQuantityRef.current = 1;
            setPreAddQuantity(1);
            setPreAddQuantityInputActive(false);
            setModifierModalPreAddQuantity(1);
            setModifierModalProduct(null);
            setModifierModalGroups([]);
          }}
        />
      ) : null}
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
                    {resolveComandaLineDestinationBadge(lineEditorTarget).label}
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
