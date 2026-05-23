import type { CentralStockMovementListItem } from "@/lib/firestore/stock-movements";
import { centralStockMovementSourceLabel } from "@/lib/firestore/stock-movements";
import type { StockMovementListItem } from "@/lib/firestore/products";
import {
  aggregateConsumptionFromStockMovements,
  mapCentralMovementToPurchaseInput,
  PURCHASE_INTELLIGENCE_LOOKBACK_DAYS,
  resolvePurchaseIntelligencePeriod,
} from "@/lib/inventory/purchase-intelligence";
import type { SupplierInvoiceDocument } from "@/lib/inventory/supplier-invoice-types";
import { resolveStockStatus } from "@/lib/inventory/stock-status";
import type { PurchaseOrderDocument } from "@/lib/purchases/purchase-order-types";

export type ProductTimelineEventType =
  | "purchase_order_created"
  | "purchase_order_received"
  | "stock_in"
  | "stock_out"
  | "stock_reversal"
  | "recipe_consumption"
  | "modifier_consumption"
  | "cost_updated"
  | "low_stock"
  | "out_of_stock";

export type ProductTimelineEventSeverity = "neutral" | "info" | "success" | "warning" | "danger";

export type ProductTimelineEvent = {
  id: string;
  type: ProductTimelineEventType;
  timestamp: number;
  title: string;
  subtitle: string | null;
  delta: number | null;
  unit: string | null;
  stockBefore: number | null;
  stockAfter: number | null;
  costBefore: number | null;
  costAfter: number | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  purchaseReceiptId?: string | null;
  invoiceId: string | null;
  orderId: string | null;
  lineId: string | null;
  severity: ProductTimelineEventSeverity;
  sourceDocumentId: string | null;
  movementId?: string | null;
  applied?: boolean | null;
  applyError?: string | null;
  source?: string | null;
};

export type ProductTimelineFilter =
  | "all"
  | "consumption"
  | "purchases"
  | "costs"
  | "alerts"
  | "reversal";

export type ProductTimelineDateRange = {
  fromMs: number | null;
  toMs: number | null;
};

export type ProductTimelineProductInput = {
  productId: string;
  productName: string;
  unit: string;
  currentStock: number | null;
  minStock: number | null;
  unitCost: number | null;
  supplierName: string | null;
};

export type ProductTimelineBuildInput = {
  product: ProductTimelineProductInput;
  movements: readonly CentralStockMovementListItem[];
  legacyMovements?: readonly StockMovementListItem[];
  invoices: readonly SupplierInvoiceDocument[];
  purchaseOrders: readonly PurchaseOrderDocument[];
};

export type ProductTimelineKpiSummary = {
  currentStock: number | null;
  consumption14d: number;
  currentUnitCost: number | null;
  lastUnitCost: number | null;
  lastSupplierName: string | null;
  relatedSalesCount: number;
  alertCount: number;
};

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(value);
}

export function productTimelineHref(productId: string): string {
  return `/dashboard/inventario/productos/${encodeURIComponent(productId.trim())}/timeline`;
}

export const PRODUCT_TIMELINE_MOVEMENTS_REALTIME_LIMIT = 50;
export const PRODUCT_TIMELINE_MOVEMENTS_PAGE_SIZE = 50;

/** Fusiona listas de movimientos centrales sin duplicar id; orden desc por createdAt. */
export function mergeCentralStockMovementsDeduped(
  ...lists: readonly (readonly CentralStockMovementListItem[])[]
): CentralStockMovementListItem[] {
  const map = new Map<string, CentralStockMovementListItem>();
  for (const list of lists) {
    for (const item of list) {
      map.set(item.id, item);
    }
  }
  return [...map.values()].sort(
    (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
  );
}

export function hostlyHighlightInvoiceElementId(invoiceId: string): string {
  return `hostly-highlight-invoice-${invoiceId.trim()}`;
}

export function hostlyHighlightReceiptElementId(receiptId: string): string {
  return `hostly-highlight-receipt-${receiptId.trim()}`;
}

export function hostlyHighlightOrderLineElementId(lineId: string): string {
  return `hostly-highlight-order-line-${lineId.trim()}`;
}

export function supplierInvoiceTimelineDeepLink(invoiceId: string): string {
  return `/dashboard/inventario/facturas-proveedor?invoiceId=${encodeURIComponent(invoiceId.trim())}`;
}

export function purchaseOrderTimelineDeepLink(
  purchaseOrderId: string,
  receiptId?: string | null,
): string {
  const base = `/dashboard/inventario/pedidos-compra/${encodeURIComponent(purchaseOrderId.trim())}`;
  const rid = receiptId?.trim();
  if (!rid) return base;
  return `${base}?receiptId=${encodeURIComponent(rid)}`;
}

export function tpvOrderTimelineDeepLink(orderId: string, lineId?: string | null): string {
  const params = new URLSearchParams({ orderId: orderId.trim() });
  const lid = lineId?.trim();
  if (lid) params.set("lineId", lid);
  return `/dashboard/operacion/tpv?${params.toString()}`;
}

export function buildProductTimelineContextLinks(
  event: ProductTimelineEvent,
): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];

  if (event.purchaseOrderId) {
    links.push({
      href: purchaseOrderTimelineDeepLink(event.purchaseOrderId, event.purchaseReceiptId),
      label: event.purchaseReceiptId ? "Recepción" : "Pedido",
    });
  }

  if (event.invoiceId) {
    links.push({
      href: supplierInvoiceTimelineDeepLink(event.invoiceId),
      label: "Factura",
    });
  }

  if (event.orderId) {
    links.push({
      href: tpvOrderTimelineDeepLink(event.orderId, event.lineId),
      label: "TPV",
    });
  }

  return links;
}

function mapMovementToEventType(
  source: string,
  type: string,
  quantityDelta: number,
): ProductTimelineEventType {
  const key = (source || type || "").trim().toLowerCase();
  switch (key) {
    case "modifier_sale":
      return "modifier_consumption";
    case "recipe_sale":
      return "recipe_consumption";
    case "modifier_sale_reversal":
    case "recipe_sale_reversal":
      return "stock_reversal";
    case "purchase_receipt":
    case "inventory_receipt":
      return "stock_in";
    case "manual_adjustment":
      return quantityDelta >= 0 ? "stock_in" : "stock_out";
    default:
      return quantityDelta >= 0 ? "stock_in" : "stock_out";
  }
}

function movementSeverity(type: ProductTimelineEventType): ProductTimelineEventSeverity {
  switch (type) {
    case "stock_in":
    case "purchase_order_received":
      return "success";
    case "modifier_consumption":
    case "recipe_consumption":
    case "stock_out":
      return "info";
    case "stock_reversal":
      return "neutral";
    case "cost_updated":
    case "low_stock":
      return "warning";
    case "out_of_stock":
      return "danger";
    default:
      return "neutral";
  }
}

function buildMovementTitle(
  movement: CentralStockMovementListItem,
  eventType: ProductTimelineEventType,
): string {
  const label = centralStockMovementSourceLabel(movement.source, movement.type);
  if (eventType === "modifier_consumption" || eventType === "recipe_consumption") {
    const sale = movement.saleProductName?.trim();
    if (sale) return `${sale} vendido`;
    return label;
  }
  if (eventType === "stock_reversal") {
    return movement.saleProductName?.trim()
      ? `Reversión · ${movement.saleProductName.trim()}`
      : "Reversión de consumo";
  }
  if (eventType === "stock_in" && movement.quantityDelta > 0) {
    return `+${formatQty(movement.quantityDelta)} ${movement.unit} recibidas`;
  }
  if (eventType === "stock_out" && movement.quantityDelta < 0) {
    return `${formatQty(movement.quantityDelta)} ${movement.unit}`;
  }
  return label;
}

function buildMovementSubtitle(movement: CentralStockMovementListItem): string | null {
  const parts: string[] = [];
  if (movement.modifierOptionName) parts.push(movement.modifierOptionName);
  if (movement.saleProductName && !parts.includes(movement.saleProductName)) {
    parts.push(movement.saleProductName);
  }
  if (movement.purchaseOrderId) parts.push(`PO ${movement.purchaseOrderId.slice(-8)}`);
  if (movement.applyError) parts.push(`Error: ${movement.applyError}`);
  else if (movement.applied === false) parts.push("Pendiente de aplicar");
  return parts.length ? parts.join(" · ") : null;
}

export function mapCentralMovementToTimelineEvent(
  movement: CentralStockMovementListItem,
): ProductTimelineEvent | null {
  const timestamp = movement.createdAtMs;
  if (timestamp == null || !Number.isFinite(timestamp)) return null;

  const eventType = mapMovementToEventType(
    movement.source,
    movement.type,
    movement.quantityDelta,
  );

  return {
    id: `movement:${movement.id}`,
    type: eventType,
    timestamp,
    title: buildMovementTitle(movement, eventType),
    subtitle: buildMovementSubtitle(movement),
    delta: movement.quantityDelta,
    unit: movement.unit,
    stockBefore: movement.stockBefore,
    stockAfter: movement.stockAfter,
    costBefore: null,
    costAfter: null,
    supplierName: null,
    purchaseOrderId: movement.purchaseOrderId,
    purchaseReceiptId: movement.purchaseReceiptId,
    invoiceId: null,
    orderId: movement.orderId,
    lineId: movement.lineId,
    severity: movementSeverity(eventType),
    sourceDocumentId: movement.id,
    movementId: movement.id,
    applied: movement.applied,
    applyError: movement.applyError,
    source: movement.source,
  };
}

export function mapLegacyMovementToTimelineEvent(
  movement: StockMovementListItem,
): ProductTimelineEvent | null {
  const timestamp = movement.createdAtMs;
  if (timestamp == null || !Number.isFinite(timestamp)) return null;

  const eventType = mapMovementToEventType(movement.source, movement.type, movement.delta);

  return {
    id: `legacy:${movement.id}`,
    type: eventType,
    timestamp,
    title:
      movement.type === "receipt" || movement.source === "inventory_receipt"
        ? `+${formatQty(movement.delta)} ${movement.unit} recibidas`
        : movement.reason?.trim() || "Ajuste manual",
    subtitle: movement.receiptId ? `Recepción ${movement.receiptId.slice(-8)}` : movement.source,
    delta: movement.delta,
    unit: movement.unit,
    stockBefore: movement.previousStock,
    stockAfter: movement.newStock,
    costBefore: null,
    costAfter: null,
    supplierName: null,
    purchaseOrderId: null,
    invoiceId: null,
    orderId: null,
    lineId: null,
    severity: movementSeverity(eventType),
    sourceDocumentId: movement.id,
    movementId: movement.id,
    source: movement.source,
  };
}

export function mapInvoiceLineToTimelineEvent(
  invoice: SupplierInvoiceDocument,
  lineIndex: number,
): ProductTimelineEvent | null {
  if (invoice.status !== "recorded") return null;
  const line = invoice.lines[lineIndex];
  if (!line) return null;
  if (line.previousUnitCost == null && line.updatedInventoryUnitCost == null) return null;

  const before = line.previousUnitCost ?? null;
  const after = line.updatedInventoryUnitCost ?? line.realUnitCost;

  return {
    id: `invoice:${invoice.id}:${lineIndex}`,
    type: "cost_updated",
    timestamp: invoice.updatedAt,
    title: `Coste actualizado ${formatEur(before)} → ${formatEur(after)}/ud`,
    subtitle: invoice.invoiceNumber?.trim()
      ? `Factura ${invoice.invoiceNumber.trim()}`
      : `Factura ${invoice.id.slice(-8)}`,
    delta: null,
    unit: line.unit,
    stockBefore: null,
    stockAfter: null,
    costBefore: before,
    costAfter: after,
    supplierName: invoice.supplierName?.trim() ?? null,
    purchaseOrderId: invoice.purchaseOrderId ?? null,
    invoiceId: invoice.id,
    orderId: null,
    lineId: null,
    severity: "warning",
    sourceDocumentId: invoice.id,
    source: "supplier_invoice",
  };
}

export function mapPurchaseOrderToTimelineEvents(
  order: PurchaseOrderDocument,
  productId: string,
): ProductTimelineEvent[] {
  const pid = productId.trim();
  const line = order.lines.find((item) => item.productId.trim() === pid);
  if (!line) return [];

  const events: ProductTimelineEvent[] = [];
  const supplier = order.supplierName?.trim() ?? line.supplierName?.trim() ?? null;

  if (order.status !== "draft" && order.status !== "cancelled") {
    const orderedAt = order.orderedAt ?? order.createdAt;
    events.push({
      id: `po-created:${order.id}`,
      type: "purchase_order_created",
      timestamp: orderedAt,
      title: `Pedido creado · ${formatQty(line.quantity)} ${line.unit}`,
      subtitle: supplier ? `Proveedor ${supplier}` : null,
      delta: line.quantity,
      unit: line.unit,
      stockBefore: line.currentStock ?? null,
      stockAfter: null,
      costBefore: line.estimatedUnitCost ?? null,
      costAfter: null,
      supplierName: supplier,
      purchaseOrderId: order.id,
      invoiceId: null,
      orderId: null,
      lineId: null,
      severity: "neutral",
      sourceDocumentId: order.id,
      source: "purchase_order",
    });
  }

  if (order.status === "partially_received" || order.status === "received") {
    const receivedQty = line.receivedQuantity ?? 0;
    events.push({
      id: `po-received:${order.id}:${order.status}`,
      type: "purchase_order_received",
      timestamp: order.updatedAt,
      title:
        order.status === "received"
          ? `Pedido recibido · ${formatQty(receivedQty || line.quantity)} ${line.unit}`
          : `Recepción parcial · ${formatQty(receivedQty)} ${line.unit}`,
      subtitle: supplier ? `Proveedor ${supplier}` : null,
      delta: receivedQty > 0 ? receivedQty : line.quantity,
      unit: line.unit,
      stockBefore: null,
      stockAfter: null,
      costBefore: null,
      costAfter: line.estimatedUnitCost ?? null,
      supplierName: supplier,
      purchaseOrderId: order.id,
      invoiceId: null,
      orderId: null,
      lineId: null,
      severity: "success",
      sourceDocumentId: order.id,
      source: "purchase_order",
    });
  }

  return events;
}

function deriveStockAlertEvents(
  movements: readonly CentralStockMovementListItem[],
  minStock: number | null,
): ProductTimelineEvent[] {
  const alerts: ProductTimelineEvent[] = [];
  const min = minStock != null && minStock > 0 ? minStock : null;

  const sorted = [...movements]
    .filter((m) => m.createdAtMs != null && m.stockAfter != null)
    .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));

  for (const movement of sorted) {
    const ts = movement.createdAtMs!;
    const before = movement.stockBefore;
    const after = movement.stockAfter!;

    if (after <= 0 && (before == null || before > 0)) {
      alerts.push({
        id: `alert:out:${movement.id}`,
        type: "out_of_stock",
        timestamp: ts,
        title: "Sin stock detectado",
        subtitle: buildMovementSubtitle(movement),
        delta: movement.quantityDelta,
        unit: movement.unit,
        stockBefore: before,
        stockAfter: after,
        costBefore: null,
        costAfter: null,
        supplierName: null,
        purchaseOrderId: movement.purchaseOrderId,
        invoiceId: null,
        orderId: movement.orderId,
        lineId: movement.lineId,
        severity: "danger",
        sourceDocumentId: movement.id,
        movementId: movement.id,
        source: "stock_alert",
      });
    } else if (
      min != null &&
      after > 0 &&
      after <= min &&
      (before == null || before > min)
    ) {
      alerts.push({
        id: `alert:low:${movement.id}`,
        type: "low_stock",
        timestamp: ts,
        title: "Stock bajo detectado",
        subtitle: `Umbral ${formatQty(min)} ${movement.unit}`,
        delta: movement.quantityDelta,
        unit: movement.unit,
        stockBefore: before,
        stockAfter: after,
        costBefore: null,
        costAfter: null,
        supplierName: null,
        purchaseOrderId: movement.purchaseOrderId,
        invoiceId: null,
        orderId: movement.orderId,
        lineId: movement.lineId,
        severity: "warning",
        sourceDocumentId: movement.id,
        movementId: movement.id,
        source: "stock_alert",
      });
    }
  }

  return alerts;
}

export function buildProductTimelineEvents(input: ProductTimelineBuildInput): ProductTimelineEvent[] {
  const pid = input.product.productId.trim();
  const events: ProductTimelineEvent[] = [];

  for (const movement of input.movements) {
    const mapped = mapCentralMovementToTimelineEvent(movement);
    if (mapped) events.push(mapped);
  }

  for (const movement of input.legacyMovements ?? []) {
    const mapped = mapLegacyMovementToTimelineEvent(movement);
    if (mapped) events.push(mapped);
  }

  for (const invoice of input.invoices) {
    invoice.lines.forEach((line, index) => {
      if (line.productId.trim() !== pid) return;
      const mapped = mapInvoiceLineToTimelineEvent(invoice, index);
      if (mapped) events.push(mapped);
    });
  }

  for (const order of input.purchaseOrders) {
    events.push(...mapPurchaseOrderToTimelineEvents(order, pid));
  }

  events.push(...deriveStockAlertEvents(input.movements, input.product.minStock));

  const status = resolveStockStatus({
    currentStock: input.product.currentStock,
    minStock: input.product.minStock,
  });
  if (status === "out" || status === "low") {
    events.push({
      id: `alert:current:${status}`,
      type: status === "out" ? "out_of_stock" : "low_stock",
      timestamp: Date.now(),
      title: status === "out" ? "Sin stock actual" : "Stock bajo actual",
      subtitle: "Estado operativo en tiempo real",
      delta: null,
      unit: input.product.unit,
      stockBefore: null,
      stockAfter: input.product.currentStock,
      costBefore: null,
      costAfter: null,
      supplierName: input.product.supplierName,
      purchaseOrderId: null,
      invoiceId: null,
      orderId: null,
      lineId: null,
      severity: status === "out" ? "danger" : "warning",
      sourceDocumentId: null,
      source: "stock_status",
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

const CONSUMPTION_TYPES = new Set<ProductTimelineEventType>([
  "modifier_consumption",
  "recipe_consumption",
  "stock_out",
]);

const PURCHASE_TYPES = new Set<ProductTimelineEventType>([
  "purchase_order_created",
  "purchase_order_received",
  "stock_in",
]);

const REVERSAL_TYPES = new Set<ProductTimelineEventType>(["stock_reversal"]);

const ALERT_TYPES = new Set<ProductTimelineEventType>(["low_stock", "out_of_stock"]);

export function filterProductTimelineEvents(
  events: readonly ProductTimelineEvent[],
  filter: ProductTimelineFilter,
  range?: ProductTimelineDateRange,
): ProductTimelineEvent[] {
  let rows = [...events];

  if (range?.fromMs != null) {
    rows = rows.filter((event) => event.timestamp >= range.fromMs!);
  }
  if (range?.toMs != null) {
    rows = rows.filter((event) => event.timestamp <= range.toMs!);
  }

  if (filter === "all") return rows;

  return rows.filter((event) => {
    switch (filter) {
      case "consumption":
        return CONSUMPTION_TYPES.has(event.type);
      case "purchases":
        return PURCHASE_TYPES.has(event.type);
      case "costs":
        return event.type === "cost_updated";
      case "alerts":
        return ALERT_TYPES.has(event.type);
      case "reversal":
        return REVERSAL_TYPES.has(event.type);
      default:
        return true;
    }
  });
}

export function computeProductTimelineKpis(params: {
  product: ProductTimelineProductInput;
  events: readonly ProductTimelineEvent[];
  movements: readonly CentralStockMovementListItem[];
}): ProductTimelineKpiSummary {
  const period = resolvePurchaseIntelligencePeriod(PURCHASE_INTELLIGENCE_LOOKBACK_DAYS);
  const movementInputs = params.movements
    .map(mapCentralMovementToPurchaseInput)
    .filter((item): item is NonNullable<typeof item> => item != null);
  const consumption14d = aggregateConsumptionFromStockMovements({
    productId: params.product.productId,
    productUnit: params.product.unit,
    movements: movementInputs,
    period,
  });

  const costEvents = params.events
    .filter((event) => event.type === "cost_updated")
    .sort((a, b) => b.timestamp - a.timestamp);
  const lastCostEvent = costEvents[0];

  const supplierEvents = params.events
    .filter((event) => event.supplierName)
    .sort((a, b) => b.timestamp - a.timestamp);

  const relatedSalesCount = params.events.filter(
    (event) => event.type === "modifier_consumption" || event.type === "recipe_consumption",
  ).length;

  const alertCount = params.events.filter((event) => ALERT_TYPES.has(event.type)).length;

  return {
    currentStock: params.product.currentStock,
    consumption14d,
    currentUnitCost: params.product.unitCost,
    lastUnitCost: lastCostEvent?.costAfter ?? params.product.unitCost,
    lastSupplierName: supplierEvents[0]?.supplierName ?? params.product.supplierName,
    relatedSalesCount,
    alertCount,
  };
}

export function formatTimelineRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Hace un momento";
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 86_400_000 * 7) return `Hace ${Math.floor(diff / 86_400_000)} d`;
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PRODUCT_TIMELINE_FILTER_OPTIONS: ReadonlyArray<{
  id: ProductTimelineFilter;
  label: string;
}> = [
  { id: "all", label: "Todos" },
  { id: "consumption", label: "Consumo" },
  { id: "purchases", label: "Compras" },
  { id: "costs", label: "Costes" },
  { id: "alerts", label: "Alertas" },
  { id: "reversal", label: "Reversión" },
];
