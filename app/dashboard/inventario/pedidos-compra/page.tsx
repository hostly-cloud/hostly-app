"use client";

import Link from "next/link";
import { HostlyOperationalEmptyState } from "@/components/ui/hostly";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  createPurchaseReceiptFromOrder,
  PurchaseReceiptFromOrderError,
} from "@/lib/firestore/purchase-receipts";
import {
  listenPurchaseOrders,
  type PurchaseOrderDocument,
} from "@/lib/firestore/purchase-orders";
import {
  getPurchaseOrderLineRemainingQuantity,
  isPurchaseOrderReceivableStatus,
  purchaseOrderStatusLabel,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/purchases/purchase-order-types";

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

function formatDraftDate(ms: number): string {
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

function purchaseOrderDetailHref(orderId: string): string {
  return `/dashboard/inventario/pedidos-compra/${encodeURIComponent(orderId.trim())}`;
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

const actionButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "var(--hostly-ink-strong)",
  color: "#fff",
  border: "1px solid var(--hostly-ink-strong)",
};

type ReceiptDraftLine = {
  productId: string;
  productName: string;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  receiveQuantity: number;
};

function buildReceiptDraftLines(lines: PurchaseOrderLine[]): ReceiptDraftLine[] {
  return lines
    .map((line) => {
      const remainingQuantity = getPurchaseOrderLineRemainingQuantity(line);
      return {
        productId: line.productId,
        productName: line.productName,
        unit: line.unit,
        orderedQuantity: line.quantity,
        receivedQuantity: line.receivedQuantity ?? 0,
        remainingQuantity,
        receiveQuantity: remainingQuantity,
      };
    })
    .filter((line) => line.remainingQuantity > 0);
}

export default function PedidosCompraPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrderDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrderDocument | null>(null);
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
  const [receiptSuccess, setReceiptSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setOrders([]);
      return;
    }
    return listenPurchaseOrders(restaurantId, setOrders, {
      onError: () => {
        setLoadError("No se pudieron cargar los pedidos de compra.");
      },
    });
  }, [authReady, restaurantId]);

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          isPurchaseOrderReceivableStatus(order.status) &&
          order.lines.some((line) => getPurchaseOrderLineRemainingQuantity(line) > 0),
      ),
    [orders],
  );

  const completedOrders = useMemo(
    () => orders.filter((order) => order.status === "received" || order.status === "cancelled"),
    [orders],
  );

  const handleOpenReceive = useCallback((order: PurchaseOrderDocument) => {
    setReceivingOrder(order);
    setReceiptLines(buildReceiptDraftLines(order.lines));
    setReceiptSuccess(null);
    setFeedback(null);
  }, []);

  const handleCloseReceive = useCallback(() => {
    if (isSubmittingReceipt) return;
    setReceivingOrder(null);
    setReceiptLines([]);
    setReceiptSuccess(null);
  }, [isSubmittingReceipt]);

  const handleReceiveQuantityChange = useCallback(
    (productId: string, rawValue: string) => {
      setReceiptLines((prev) =>
        prev.map((line) => {
          if (line.productId !== productId) return line;
          const parsed = Number(rawValue.replace(",", "."));
          const qty = Number.isFinite(parsed) ? parsed : 0;
          const receiveQuantity = Math.min(Math.max(0, qty), line.remainingQuantity);
          return { ...line, receiveQuantity };
        }),
      );
    },
    [],
  );

  const receiptTotalQuantity = useMemo(
    () => receiptLines.reduce((sum, line) => sum + line.receiveQuantity, 0),
    [receiptLines],
  );

  const handleConfirmReceipt = useCallback(async () => {
    if (!restaurantId || !receivingOrder || isSubmittingReceipt) return;

    const linesToReceive = receiptLines
      .filter((line) => line.receiveQuantity > 0)
      .map((line) => ({ productId: line.productId, quantity: line.receiveQuantity }));

    if (linesToReceive.length === 0) {
      setFeedback("Indica al menos una cantidad a recibir.");
      return;
    }

    setIsSubmittingReceipt(true);
    setFeedback(null);
    setReceiptSuccess(null);

    try {
      const result = await createPurchaseReceiptFromOrder({
        restaurantId,
        purchaseOrderId: receivingOrder.id,
        lines: linesToReceive,
      });
      setReceiptSuccess(
        `Recepción registrada · pedido ${purchaseOrderStatusLabel(result.orderStatus).toLowerCase()}.`,
      );
      setFeedback(null);
    } catch (error) {
      if (error instanceof PurchaseReceiptFromOrderError) {
        switch (error.code) {
          case "order_not_receivable":
            setFeedback("Este pedido ya no admite recepciones.");
            break;
          case "quantity_exceeds_remaining":
            setFeedback("La cantidad supera lo pendiente de recibir.");
            break;
          case "empty_lines":
            setFeedback("No hay cantidades válidas para recibir.");
            break;
          default:
            setFeedback("No se pudo registrar la recepción.");
        }
      } else {
        setFeedback("No se pudo registrar la recepción.");
      }
    } finally {
      setIsSubmittingReceipt(false);
    }
  }, [isSubmittingReceipt, receiptLines, receivingOrder, restaurantId]);

  return (
    <ModulePageShell
      title="Pedidos de compra"
      subtitle="Recepción operativa · stock vía ledger central"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div className="hostly-mobile-op-page-stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <HostlySectionHeader
            title="Recepción de pedidos"
            description="Recibe total o parcialmente un pedido. El stock solo se actualiza mediante movimientos purchase_receipt en el ledger central."
          />
          <Link
            href="/dashboard/inventario/pedidos-compra/nuevo"
            style={{ ...primaryButtonStyle, display: "inline-flex", textDecoration: "none" }}
            prefetch
          >
            + Nuevo pedido
          </Link>
        </div>

        {loadError ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            {loadError}
          </div>
        ) : null}

        {feedback ? (
          <div className="hostly-panel p-3" style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
            {feedback}
          </div>
        ) : null}

        <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
            Pendientes de recibir ({pendingOrders.length})
          </div>
          {pendingOrders.length === 0 ? (
            <HostlyOperationalEmptyState
              title="Sin pedidos pendientes"
              text="Crea un pedido manual o convierte una compra sugerida. Aparecerá aquí para recibirlo total o parcialmente."
              primaryAction={{
                label: "Crear pedido manual",
                href: "/dashboard/inventario/pedidos-compra/nuevo",
              }}
              secondaryAction={{
                label: "Ver compras sugeridas",
                href: "/dashboard/inventario/compras-inteligentes",
              }}
              hints={[
                "Recepción total o parcial",
                "Stock actualizado por ledger",
                "Factura vinculable después",
              ]}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingOrders.map((order) => {
                const pendingLines = order.lines.filter(
                  (line) => getPurchaseOrderLineRemainingQuantity(line) > 0,
                ).length;
                return (
                  <div key={order.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.18)" }}>
                    <div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                          {order.lines.length} líneas · total {formatEur(order.totalEstimatedCost)}
                        </span>
                        <span style={statusPillStyle(order.status)}>{purchaseOrderStatusLabel(order.status)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 4 }}>
                        {formatDraftDate(order.updatedAt)} · {pendingLines} producto(s) pendiente(s)
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link href={purchaseOrderDetailHref(order.id)} style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex" }} prefetch>
                        Ver detalle
                      </Link>
                      <button type="button" style={primaryButtonStyle} onClick={() => handleOpenReceive(order)}>
                        Recibir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {completedOrders.length > 0 ? (
          <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>Histórico reciente</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {completedOrders.slice(0, 8).map((order) => (
                <div key={order.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.12)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                      {order.lines.length} líneas · {formatEur(order.totalEstimatedCost)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>{formatDraftDate(order.updatedAt)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={statusPillStyle(order.status)}>{purchaseOrderStatusLabel(order.status)}</span>
                    <Link href={purchaseOrderDetailHref(order.id)} style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-flex" }} prefetch>
                      Ver detalle
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {receivingOrder ? (
        <div role="dialog" aria-modal="true" aria-label="Recibir pedido de compra" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(2, 6, 23, 0.62)", backdropFilter: "blur(6px)" }} onMouseDown={(e) => { if (e.currentTarget === e.target && !isSubmittingReceipt) handleCloseReceive(); }}>
          <div className="hostly-panel" style={{ width: "min(640px, 100%)", maxHeight: "min(85vh, 760px)", display: "flex", flexDirection: "column", gap: 12, padding: 16, overflow: "hidden" }} onMouseDown={(e) => e.stopPropagation()}>
            {receiptSuccess ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>Recepción confirmada</div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>{receiptSuccess} El stock se ha actualizado mediante movimientos en el ledger central.</p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" style={primaryButtonStyle} onClick={handleCloseReceive}>Cerrar</button></div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>Recibir pedido</div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>Indica las cantidades a recibir. Puedes hacer recepciones parciales.</p>
                <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
                  <table className="hostly-inv-native-table">
                    <thead><tr><th>Producto</th><th className="hostly-inv-th-num">Pedido</th><th className="hostly-inv-th-num">Recibido</th><th className="hostly-inv-th-num">Pendiente</th><th className="hostly-inv-th-num">A recibir</th></tr></thead>
                    <tbody>
                      {receiptLines.map((line) => (
                        <tr key={line.productId}>
                          <td className="hostly-inv-td-primary">{line.productName}</td>
                          <td className="hostly-inv-td-amount">{formatQty(line.orderedQuantity)} {displayUnit(line.unit)}</td>
                          <td className="hostly-inv-td-muted">{formatQty(line.receivedQuantity)} {displayUnit(line.unit)}</td>
                          <td className="hostly-inv-td-muted">{formatQty(line.remainingQuantity)} {displayUnit(line.unit)}</td>
                          <td className="hostly-inv-td-amount">
                            <input type="number" min={0} max={line.remainingQuantity} step="any" value={line.receiveQuantity} onChange={(e) => handleReceiveQuantityChange(line.productId, e.target.value)} aria-label={`Cantidad a recibir de ${line.productName}`} style={{ width: 88, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(148, 163, 184, 0.28)", fontSize: 13, fontWeight: 600, textAlign: "right" }} />
                            <span style={{ marginLeft: 4, fontSize: 11, color: "var(--hostly-ink-muted)" }}>{displayUnit(line.unit)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>Total a recibir: {formatQty(receiptTotalQuantity)} unidades</div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" style={actionButtonStyle} onClick={handleCloseReceive} disabled={isSubmittingReceipt}>Cancelar</button>
                  <button type="button" style={primaryButtonStyle} onClick={() => void handleConfirmReceipt()} disabled={isSubmittingReceipt || receiptTotalQuantity <= 0}>{isSubmittingReceipt ? "Registrando…" : "Confirmar recepción"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}
