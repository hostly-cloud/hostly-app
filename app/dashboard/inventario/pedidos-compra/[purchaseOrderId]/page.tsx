"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton, HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  listenPurchaseOrderById,
  PurchaseOrderMarkAsOrderedError,
  updatePurchaseOrderStatusToOrdered,
  type PurchaseOrderDocument,
} from "@/lib/firestore/purchase-orders";
import {
  listenPurchaseReceiptsForOrder,
  getPurchaseReceiptById,
  type PurchaseReceiptDocument,
} from "@/lib/firestore/purchase-receipts";
import {
  listenStockMovementsForPurchaseOrder,
  type PurchaseOrderStockMovementListItem,
} from "@/lib/firestore/stock-movements";
import {
  buildPurchaseOrderMessage,
  copyPurchaseOrderMessageToClipboard,
  groupPurchaseOrderLinesBySupplier,
} from "@/lib/purchases/purchase-order-message";
import {
  canMarkPurchaseOrderAsOrdered,
  canPreparePurchaseOrderShipment,
  getPurchaseOrderLineRemainingQuantity,
  purchaseOrderStatusLabel,
  type PurchaseOrderStatus,
} from "@/lib/purchases/purchase-order-types";
import { hostlyHighlightReceiptElementId } from "@/lib/inventory/product-timeline";
import { scheduleScrollAndHighlightById } from "@/lib/ui/scroll-and-highlight";
import { DeepLinkOutOfWindowNotice } from "@/components/inventario/deep-link-out-of-window-notice";

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatDate(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayUnit(unit: string): string {
  return unit === "unit" ? "ud" : unit;
}

function formatShortId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed;
  return `…${trimmed.slice(-8)}`;
}

function statusPillStyle(status: PurchaseOrderStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  };
  switch (status) {
    case "partially_received":
      return { ...base, background: "rgba(245, 158, 11, 0.14)", color: "#b45309" };
    case "received":
      return { ...base, background: "rgba(16, 185, 129, 0.12)", color: "#047857" };
    case "cancelled":
      return { ...base, background: "rgba(148, 163, 184, 0.16)", color: "#64748b" };
    case "ordered":
      return {
        ...base,
        background: "rgba(59, 130, 246, 0.16)",
        color: "#1d4ed8",
        border: "1px solid rgba(59, 130, 246, 0.35)",
      };
    default:
      return { ...base, background: "rgba(148, 163, 184, 0.16)", color: "#475569" };
  }
}

function applyStatusLabel(movement: PurchaseOrderStockMovementListItem): string {
  if (movement.applyError) return `Error: ${movement.applyError}`;
  if (movement.applied === true) return "Aplicado";
  if (movement.applied === false) return "Pendiente";
  return "—";
}

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--hostly-ink-muted)",
  textDecoration: "none",
};

const cardStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const metaLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--hostly-ink-muted)",
};

function useNarrowLayout(maxWidth = 720): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);

  return narrow;
}

function OrderLineCards({
  order,
}: {
  order: PurchaseOrderDocument;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {order.lines.map((line) => {
        const received = line.receivedQuantity ?? 0;
        const pending = getPurchaseOrderLineRemainingQuantity(line);
        return (
          <div key={line.productId} style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
              {line.productName}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div>
                <div style={metaLabelStyle}>Pedido</div>
                <div>
                  {formatQty(line.quantity)} {displayUnit(line.unit)}
                </div>
              </div>
              <div>
                <div style={metaLabelStyle}>Recibido</div>
                <div>{formatQty(received)} {displayUnit(line.unit)}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>Pendiente</div>
                <div>{formatQty(pending)} {displayUnit(line.unit)}</div>
              </div>
              <div>
                <div style={metaLabelStyle}>Coste est.</div>
                <div>{formatEur(line.estimatedTotalCost)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PedidoCompraDetallePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const highlightReceiptId = searchParams.get("receiptId")?.trim() ?? "";
  const purchaseOrderId =
    typeof params?.purchaseOrderId === "string" ? params.purchaseOrderId.trim() : "";
  const { restaurantId, ready: authReady } = useAuth();
  const narrow = useNarrowLayout();

  const [order, setOrder] = useState<PurchaseOrderDocument | null>(null);
  const [receipts, setReceipts] = useState<PurchaseReceiptDocument[]>([]);
  const [linkedOutOfWindowReceipt, setLinkedOutOfWindowReceipt] =
    useState<PurchaseReceiptDocument | null>(null);
  const [receiptsListenerReady, setReceiptsListenerReady] = useState(false);
  const [movements, setMovements] = useState<PurchaseOrderStockMovementListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [shipmentMessage, setShipmentMessage] = useState("");
  const [shipmentFeedback, setShipmentFeedback] = useState<string | null>(null);
  const [isMarkingOrdered, setIsMarkingOrdered] = useState(false);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !purchaseOrderId) {
      setOrder(null);
      setOrderLoaded(true);
      return;
    }

    setOrderLoaded(false);
    setLoadError(null);

    return listenPurchaseOrderById(restaurantId, purchaseOrderId, (doc) => {
      setOrder(doc);
      setOrderLoaded(true);
    }, {
      onError: () => {
        setLoadError("No se pudo cargar el pedido.");
        setOrderLoaded(true);
      },
    });
  }, [authReady, purchaseOrderId, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !purchaseOrderId) {
      setReceipts([]);
      setReceiptsListenerReady(false);
      setLinkedOutOfWindowReceipt(null);
      return;
    }

    setReceiptsListenerReady(false);
    return listenPurchaseReceiptsForOrder(
      restaurantId,
      purchaseOrderId,
      (items) => {
        setReceipts(items);
        setReceiptsListenerReady(true);
      },
      {
        onError: () => {
          setLoadError("No se pudieron cargar las recepciones.");
          setReceiptsListenerReady(true);
        },
      },
    );
  }, [authReady, purchaseOrderId, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !purchaseOrderId) {
      setMovements([]);
      return;
    }

    return listenStockMovementsForPurchaseOrder(
      restaurantId,
      purchaseOrderId,
      setMovements,
      {
        onError: () => {
          setLoadError("No se pudieron cargar los movimientos de stock.");
        },
      },
    );
  }, [authReady, purchaseOrderId, restaurantId]);

  const displayReceipts = useMemo(() => {
    if (!linkedOutOfWindowReceipt) return receipts;
    if (receipts.some((receipt) => receipt.id === linkedOutOfWindowReceipt.id)) {
      return receipts;
    }
    return [linkedOutOfWindowReceipt, ...receipts].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }, [linkedOutOfWindowReceipt, receipts]);

  useEffect(() => {
    if (!highlightReceiptId || !authReady || !isFirebaseConfigured || !restaurantId || !purchaseOrderId) {
      setLinkedOutOfWindowReceipt(null);
      return;
    }
    if (!receiptsListenerReady) return;

    if (receipts.some((receipt) => receipt.id === highlightReceiptId)) {
      setLinkedOutOfWindowReceipt(null);
      return scheduleScrollAndHighlightById(
        hostlyHighlightReceiptElementId(highlightReceiptId),
      );
    }

    let cancelled = false;
    void getPurchaseReceiptById(restaurantId, highlightReceiptId).then((receipt) => {
      if (cancelled || !receipt) return;
      if (receipt.purchaseOrderId !== purchaseOrderId) return;
      setLinkedOutOfWindowReceipt(receipt);
      scheduleScrollAndHighlightById(hostlyHighlightReceiptElementId(receipt.id));
    });

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    highlightReceiptId,
    purchaseOrderId,
    receipts,
    receiptsListenerReady,
    restaurantId,
  ]);

  const orderSummary = useMemo(() => {
    if (!order) return null;
    const totalOrdered = order.lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalReceived = order.lines.reduce(
      (sum, line) => sum + (line.receivedQuantity ?? 0),
      0,
    );
    const totalPending = order.lines.reduce(
      (sum, line) => sum + getPurchaseOrderLineRemainingQuantity(line),
      0,
    );
    return { totalOrdered, totalReceived, totalPending };
  }, [order]);

  const pageTitle = order
    ? `Pedido ${formatShortId(order.id)}`
    : purchaseOrderId
      ? `Pedido ${formatShortId(purchaseOrderId)}`
      : "Detalle pedido";

  const supplierGroups = useMemo(
    () => (order ? groupPurchaseOrderLinesBySupplier(order.lines) : []),
    [order],
  );

  const canPrepareShipment = order ? canPreparePurchaseOrderShipment(order.status) : false;
  const canMarkOrdered = order ? canMarkPurchaseOrderAsOrdered(order.status) : false;

  const handleOpenShipmentModal = useCallback(() => {
    if (!order) return;
    setShipmentMessage(buildPurchaseOrderMessage(order));
    setShipmentFeedback(null);
    setShipmentModalOpen(true);
  }, [order]);

  const handleCloseShipmentModal = useCallback(() => {
    if (isMarkingOrdered) return;
    setShipmentModalOpen(false);
    setShipmentFeedback(null);
  }, [isMarkingOrdered]);

  const handleCopyShipmentMessage = useCallback(async () => {
    const copied = await copyPurchaseOrderMessageToClipboard(shipmentMessage);
    setShipmentFeedback(
      copied ? "Pedido copiado al portapapeles." : "No se pudo copiar. Selecciona el texto manualmente.",
    );
  }, [shipmentMessage]);

  const handleMarkAsOrdered = useCallback(async () => {
    if (!restaurantId || !purchaseOrderId || !order || isMarkingOrdered) return;
    setIsMarkingOrdered(true);
    setShipmentFeedback(null);
    try {
      const result = await updatePurchaseOrderStatusToOrdered({
        restaurantId,
        purchaseOrderId,
      });
      setShipmentFeedback(
        result.alreadyOrdered
          ? "El pedido ya estaba marcado como enviado."
          : "Pedido marcado como enviado al proveedor.",
      );
    } catch (error) {
      if (error instanceof PurchaseOrderMarkAsOrderedError) {
        setShipmentFeedback("No se puede marcar como enviado en el estado actual.");
      } else {
        setShipmentFeedback("No se pudo marcar el pedido como enviado.");
      }
    } finally {
      setIsMarkingOrdered(false);
    }
  }, [isMarkingOrdered, order, purchaseOrderId, restaurantId]);

  return (
    <ModulePageShell
      title={pageTitle}
      subtitle="Histórico del pedido · solo lectura"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <Link
          href="/dashboard/inventario/pedidos-compra"
          style={backLinkStyle}
          prefetch
        >
          ← Volver a pedidos
        </Link>

        {loadError ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            {loadError}
          </div>
        ) : null}

        {!orderLoaded ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            Cargando pedido…
          </div>
        ) : null}

        {orderLoaded && !order ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            Pedido no encontrado o no disponible.
          </div>
        ) : null}

        {order ? (
          <>
            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                      Pedido {formatShortId(order.id)}
                    </span>
                    <span style={statusPillStyle(order.status)}>
                      {purchaseOrderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 6 }}>
                    Creado {formatDate(order.createdAt)} · actualizado {formatDate(order.updatedAt)}
                  </div>
                  {order.orderedAt ? (
                    <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 4 }}>
                      Enviado {formatDate(order.orderedAt)}
                    </div>
                  ) : null}
                  {order.supplierName?.trim() ? (
                    <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 4 }}>
                      Proveedor: {order.supplierName}
                    </div>
                  ) : null}
                  <div
                    style={{ fontSize: 11, color: "var(--hostly-ink-muted)", marginTop: 4 }}
                    title={order.id}
                  >
                    Ref. {formatShortId(order.id)}
                  </div>
                </div>
                <div style={{ textAlign: narrow ? "left" : "right" }}>
                  <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>Total estimado</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                    {formatEur(order.totalEstimatedCost)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {canPrepareShipment ? (
                  <HostlyButton variant="primary" size="compact" onClick={handleOpenShipmentModal}>
                    Preparar envío
                  </HostlyButton>
                ) : null}
                {order.lines.some((line) => (line.receivedQuantity ?? 0) > 0) ? (
                  <Link
                    href={`/dashboard/inventario/facturas-proveedor?purchaseOrderId=${encodeURIComponent(order.id)}`}
                    className="hostly-button-secondary hostly-button-compact"
                    prefetch
                  >
                    Registrar factura
                  </Link>
                ) : null}
              </div>

              {orderSummary ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  <div style={cardStyle}>
                    <div style={metaLabelStyle}>Pedido total</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{formatQty(orderSummary.totalOrdered)} ud</div>
                  </div>
                  <div style={cardStyle}>
                    <div style={metaLabelStyle}>Recibido</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{formatQty(orderSummary.totalReceived)} ud</div>
                  </div>
                  <div style={cardStyle}>
                    <div style={metaLabelStyle}>Pendiente</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{formatQty(orderSummary.totalPending)} ud</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <HostlySectionHeader
                title="Líneas del pedido"
                description={`${order.lines.length} producto(s)`}
              />
              {narrow ? (
                <OrderLineCards order={order} />
              ) : (
                <div style={{ overflow: "auto" }}>
                  <table className="hostly-inv-native-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="hostly-inv-th-num">Pedido</th>
                        <th className="hostly-inv-th-num">Recibido</th>
                        <th className="hostly-inv-th-num">Pendiente</th>
                        <th className="hostly-inv-th-num">Coste est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => {
                        const received = line.receivedQuantity ?? 0;
                        const pending = getPurchaseOrderLineRemainingQuantity(line);
                        return (
                          <tr key={line.productId}>
                            <td className="hostly-inv-td-primary">
                              {line.productName}
                              <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                                {displayUnit(line.unit)}
                              </div>
                            </td>
                            <td className="hostly-inv-td-amount">{formatQty(line.quantity)}</td>
                            <td className="hostly-inv-td-amount">{formatQty(received)}</td>
                            <td className="hostly-inv-td-muted">{formatQty(pending)}</td>
                            <td className="hostly-inv-td-amount">{formatEur(line.estimatedTotalCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <HostlySectionHeader
                title="Recepciones"
                description={`${displayReceipts.length} recepción(es) registrada(s)`}
              />
              {linkedOutOfWindowReceipt ? <DeepLinkOutOfWindowNotice /> : null}
              {displayReceipts.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>Sin recepciones.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {displayReceipts.map((receipt) => (
                    <div key={receipt.id} id={hostlyHighlightReceiptElementId(receipt.id)} style={cardStyle}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                            {formatDate(receipt.createdAt)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)", marginTop: 2 }}>
                            Recepción {formatShortId(receipt.id)}
                            {receipt.createdBy ? ` · ${formatShortId(receipt.createdBy)}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {formatQty(receipt.totalReceivedQuantity)} ud recibidas
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {receipt.lines.map((line) => (
                          <div
                            key={`${receipt.id}-${line.productId}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              fontSize: 12,
                            }}
                          >
                            <span>{line.productName}</span>
                            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                              +{formatQty(line.quantity)} {displayUnit(line.unit)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {receipt.applySummary ? (
                        <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                          Apply: {receipt.applySummary.applied} aplicados · {receipt.applySummary.skipped} omitidos ·{" "}
                          {receipt.applySummary.failed} fallidos
                        </div>
                      ) : null}

                      {receipt.movementIds && receipt.movementIds.length > 0 ? (
                        <div style={{ fontSize: 10, color: "var(--hostly-ink-muted)", lineHeight: 1.5 }}>
                          Movimientos:{" "}
                          {receipt.movementIds.map((id) => formatShortId(id)).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <HostlySectionHeader
                title="Movimientos de stock"
                description="Cambios de stock generados por las recepciones de este pedido"
              />
              {movements.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>Sin movimientos.</div>
              ) : narrow ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {movements.map((movement) => (
                    <div key={movement.id} style={cardStyle}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{movement.productName ?? "Producto"}</div>
                      <div style={{ fontSize: 12 }}>
                        {movement.quantityDelta >= 0 ? "+" : ""}
                        {formatQty(movement.quantityDelta)} {displayUnit(movement.unit)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                        {applyStatusLabel(movement)}
                      </div>
                      {movement.stockBefore != null && movement.stockAfter != null ? (
                        <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                          Stock {formatQty(movement.stockBefore)} → {formatQty(movement.stockAfter)}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 10, color: "var(--hostly-ink-muted)" }} title={movement.id}>
                        {formatShortId(movement.id)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflow: "auto" }}>
                  <table className="hostly-inv-native-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="hostly-inv-th-num">Delta</th>
                        <th>Estado</th>
                        <th className="hostly-inv-th-num">Stock</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => (
                        <tr key={movement.id}>
                          <td className="hostly-inv-td-primary">
                            {movement.productName ?? "—"}
                            <div
                              style={{ fontSize: 10, color: "var(--hostly-ink-muted)" }}
                              title={movement.id}
                            >
                              {formatShortId(movement.id)}
                            </div>
                          </td>
                          <td className="hostly-inv-td-amount">
                            {movement.quantityDelta >= 0 ? "+" : ""}
                            {formatQty(movement.quantityDelta)} {displayUnit(movement.unit)}
                          </td>
                          <td className="hostly-inv-td-muted">{applyStatusLabel(movement)}</td>
                          <td className="hostly-inv-td-muted">
                            {movement.stockBefore != null && movement.stockAfter != null
                              ? `${formatQty(movement.stockBefore)} → ${formatQty(movement.stockAfter)}`
                              : "—"}
                          </td>
                          <td className="hostly-inv-td-muted">{formatDate(movement.createdAtMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {shipmentModalOpen && order ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preparar envío de pedido"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(2, 6, 23, 0.62)",
            backdropFilter: "blur(6px)",
          }}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !isMarkingOrdered) {
              handleCloseShipmentModal();
            }
          }}
        >
          <div
            className="hostly-panel"
            style={{
              width: "min(640px, 100%)",
              maxHeight: "min(90vh, 820px)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 16,
              overflow: "hidden",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
              Preparar envío manual
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>
              Copia el texto y envíalo tú al proveedor (email, WhatsApp, teléfono). Hostly no envía nada
              automáticamente.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", minHeight: 0 }}>
              {supplierGroups.map((group) => (
                <div key={group.supplierName} style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                    {group.supplierName}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.lines.map((line) => (
                      <div
                        key={line.productId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <span>{line.productName}</span>
                        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {formatQty(line.quantity)} {displayUnit(line.unit)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {group.totalEstimatedCost != null ? (
                    <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                      Total estimado: {formatEur(group.totalEstimatedCost)}
                    </div>
                  ) : null}
                </div>
              ))}

              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                Texto del pedido
              </label>
              <textarea
                value={shipmentMessage}
                onChange={(e) => setShipmentMessage(e.target.value)}
                rows={narrow ? 10 : 12}
                style={{
                  width: "100%",
                  minHeight: 180,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {shipmentFeedback ? (
              <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>{shipmentFeedback}</div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <HostlyButton
                variant="secondary"
                size="compact"
                onClick={handleCloseShipmentModal}
                disabled={isMarkingOrdered}
              >
                Cerrar
              </HostlyButton>
              <HostlyButton
                variant="tool"
                size="compact"
                onClick={() => void handleCopyShipmentMessage()}
              >
                Copiar pedido
              </HostlyButton>
              {canMarkOrdered ? (
                <HostlyButton
                  variant="primary"
                  size="compact"
                  onClick={() => void handleMarkAsOrdered()}
                  disabled={isMarkingOrdered}
                >
                  {isMarkingOrdered ? "Guardando…" : "Marcar como enviado"}
                </HostlyButton>
              ) : (
                <span style={{ fontSize: 12, color: "var(--hostly-ink-muted)", alignSelf: "center" }}>
                  Ya enviado al proveedor
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}