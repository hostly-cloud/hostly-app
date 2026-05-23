"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  CapabilityGuard,
  capabilityDeniedTitle,
} from "@/components/auth/capability-guard";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  listenPurchaseOrderById,
  type PurchaseOrderDocument,
} from "@/lib/firestore/purchase-orders";
import {
  createAndRecordSupplierInvoice,
  getSupplierInvoiceById,
  listenSupplierInvoices,
  SupplierInvoiceError,
  type SupplierInvoiceDocument,
} from "@/lib/firestore/supplier-invoices";
import { roundInventoryCost } from "@/lib/inventory/inventory-cost";
import {
  buildSupplierInvoiceDraftLinesFromPurchaseOrder,
  type SupplierInvoiceLineInput,
} from "@/lib/inventory/supplier-invoice-types";
import { productTimelineHref, hostlyHighlightInvoiceElementId } from "@/lib/inventory/product-timeline";
import { scheduleScrollAndHighlightById } from "@/lib/ui/scroll-and-highlight";
import { DeepLinkOutOfWindowNotice } from "@/components/inventario/deep-link-out-of-window-notice";

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 }).format(value);
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
  return new Date(ms).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

const actionButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "var(--hostly-ink-strong)",
  color: "#fff",
  border: "1px solid var(--hostly-ink-strong)",
};

type FormLine = SupplierInvoiceLineInput & { key: string };

function toFormLines(inputs: SupplierInvoiceLineInput[]): FormLine[] {
  return inputs.map((line, index) => ({
    ...line,
    key: `${line.productId}-${index}`,
  }));
}

function computeLineTotal(line: Pick<FormLine, "quantity" | "realUnitCost">): number {
  return roundInventoryCost(line.quantity * line.realUnitCost);
}

export default function FacturasProveedorPage() {
  const searchParams = useSearchParams();
  const purchaseOrderIdParam = searchParams.get("purchaseOrderId")?.trim() ?? "";
  const highlightInvoiceId = searchParams.get("invoiceId")?.trim() ?? "";
  const { restaurantId, ready: authReady } = useAuth();
  const { can } = useHostlyCapabilities();
  const canManageSupplierInvoices = can("supplier_invoices.manage");

  const [invoices, setInvoices] = useState<SupplierInvoiceDocument[]>([]);
  const [linkedOutOfWindowInvoice, setLinkedOutOfWindowInvoice] =
    useState<SupplierInvoiceDocument | null>(null);
  const [invoicesListenerReady, setInvoicesListenerReady] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<PurchaseOrderDocument | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setInvoices([]);
      setInvoicesListenerReady(false);
      return;
    }
    setInvoicesListenerReady(false);
    return listenSupplierInvoices(
      restaurantId,
      (items) => {
        setInvoices(items);
        setInvoicesListenerReady(true);
      },
      {
        onError: () => {
          setLoadError("No se pudieron cargar las facturas.");
          setInvoicesListenerReady(true);
        },
      },
    );
  }, [authReady, restaurantId]);

  const displayInvoices = useMemo(() => {
    if (!linkedOutOfWindowInvoice) return invoices;
    if (invoices.some((invoice) => invoice.id === linkedOutOfWindowInvoice.id)) {
      return invoices;
    }
    return [linkedOutOfWindowInvoice, ...invoices].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [invoices, linkedOutOfWindowInvoice]);

  useEffect(() => {
    if (!highlightInvoiceId || !authReady || !isFirebaseConfigured || !restaurantId) {
      setLinkedOutOfWindowInvoice(null);
      return;
    }
    if (!invoicesListenerReady) return;

    if (invoices.some((invoice) => invoice.id === highlightInvoiceId)) {
      setLinkedOutOfWindowInvoice(null);
      return scheduleScrollAndHighlightById(
        hostlyHighlightInvoiceElementId(highlightInvoiceId),
      );
    }

    let cancelled = false;
    void getSupplierInvoiceById(restaurantId, highlightInvoiceId).then((invoice) => {
      if (cancelled) return;
      if (!invoice) return;
      setLinkedOutOfWindowInvoice(invoice);
      scheduleScrollAndHighlightById(hostlyHighlightInvoiceElementId(invoice.id));
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, highlightInvoiceId, invoices, invoicesListenerReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !purchaseOrderIdParam) {
      setSourceOrder(null);
      setFormReady(!purchaseOrderIdParam);
      return;
    }

    setFormReady(false);
    return listenPurchaseOrderById(
      restaurantId,
      purchaseOrderIdParam,
      (order) => {
        setSourceOrder(order);
        if (order) {
          setSupplierName(order.supplierName?.trim() ?? "");
          setLines(toFormLines(buildSupplierInvoiceDraftLinesFromPurchaseOrder(order)));
        } else {
          setLines([]);
        }
        setFormReady(true);
      },
      {
        onError: () => {
          setLoadError("No se pudo cargar el pedido vinculado.");
          setFormReady(true);
        },
      },
    );
  }, [authReady, purchaseOrderIdParam, restaurantId]);

  const invoiceTotal = useMemo(
    () => lines.reduce((sum, line) => sum + computeLineTotal(line), 0),
    [lines],
  );

  const handleLineUnitCostChange = useCallback((productId: string, rawValue: string) => {
    const parsed = Number(rawValue.replace(",", "."));
    const realUnitCost = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.productId !== productId) return line;
        return {
          ...line,
          realUnitCost,
          realTotalCost: computeLineTotal({ ...line, realUnitCost }),
        };
      }),
    );
  }, []);

  const handleLineQuantityChange = useCallback((productId: string, rawValue: string) => {
    const parsed = Number(rawValue.replace(",", "."));
    const quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.productId !== productId) return line;
        return {
          ...line,
          quantity,
          realTotalCost: computeLineTotal({ ...line, quantity }),
        };
      }),
    );
  }, []);

  const handleSubmitInvoice = useCallback(async () => {
    if (!canManageSupplierInvoices) return;
    if (!restaurantId || isSubmitting || lines.length === 0) return;

    const validLines = lines.filter(
      (line) => line.quantity > 0 && line.realUnitCost > 0,
    );
    if (validLines.length === 0) {
      setFeedback("Indica cantidades y costes unitarios válidos.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const invoiceDateMs = invoiceDate
        ? new Date(`${invoiceDate}T12:00:00`).getTime()
        : null;

      const { invoiceId } = await createAndRecordSupplierInvoice({
        restaurantId,
        purchaseOrderId: purchaseOrderIdParam || sourceOrder?.id || null,
        supplierName: supplierName.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: Number.isFinite(invoiceDateMs) ? invoiceDateMs : null,
        notes: notes.trim() || null,
        lines: validLines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unit: line.unit,
          realUnitCost: line.realUnitCost,
          realTotalCost: computeLineTotal(line),
        })),
      });

      setFeedback(`Factura registrada · ${formatShortId(invoiceId)}. Costes de inventario actualizados.`);
      setInvoiceNumber("");
      setNotes("");
    } catch (error) {
      if (error instanceof SupplierInvoiceError && error.code === "cost_apply_failed") {
        setFeedback("No se pudo actualizar el coste de uno o más productos.");
      } else {
        setFeedback("No se pudo registrar la factura.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canManageSupplierInvoices,
    invoiceDate,
    invoiceNumber,
    isSubmitting,
    lines,
    notes,
    purchaseOrderIdParam,
    restaurantId,
    sourceOrder?.id,
    supplierName,
  ]);

  const showForm = Boolean(purchaseOrderIdParam && sourceOrder && lines.length > 0);

  return (
    <ModulePageShell
      title="Facturas de proveedor"
      subtitle="Coste real recibido · actualiza unitCost del inventario"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <HostlySectionHeader
          title="Registro de factura"
          description="Registra el coste real facturado. No modifica stock. Los márgenes históricos del TPV siguen usando snapshots persistidos."
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <CapabilityGuard capability="supplier_invoices.manage">
            <Link href="/dashboard/inventario/facturas-proveedor/nueva" style={primaryButtonStyle} prefetch>
              Nueva factura (OCR)
            </Link>
          </CapabilityGuard>
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

        {purchaseOrderIdParam ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link
              href={`/dashboard/inventario/pedidos-compra/${encodeURIComponent(purchaseOrderIdParam)}`}
              style={actionButtonStyle}
              prefetch
            >
              ← Volver al pedido
            </Link>
          </div>
        ) : null}

        {!purchaseOrderIdParam ? (
          <div className="hostly-panel p-4" style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
            Abre «Registrar factura» desde el detalle de un pedido recibido para cargar las líneas
            automáticamente.
          </div>
        ) : null}

        {purchaseOrderIdParam && formReady && !sourceOrder ? (
          <div className="hostly-panel p-4" style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
            Pedido no encontrado.
          </div>
        ) : null}

        {showForm ? (
          <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>Proveedor</span>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Sin proveedor"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    fontSize: 13,
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>Nº factura</span>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    fontSize: 13,
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>Fecha factura</span>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    fontSize: 13,
                  }}
                />
              </label>
            </div>

            <div style={{ overflow: "auto" }}>
              <table className="hostly-inv-native-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="hostly-inv-th-num">Cantidad</th>
                    <th className="hostly-inv-th-num">Coste unit. real</th>
                    <th className="hostly-inv-th-num">Total línea</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td className="hostly-inv-td-primary">
                        {line.productName}
                        <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                          {displayUnit(line.unit)}
                        </div>
                      </td>
                      <td className="hostly-inv-td-amount">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineQuantityChange(line.productId, e.target.value)
                          }
                          style={{
                            width: 88,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid rgba(148, 163, 184, 0.28)",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td className="hostly-inv-td-amount">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.realUnitCost}
                          onChange={(e) =>
                            handleLineUnitCostChange(line.productId, e.target.value)
                          }
                          style={{
                            width: 96,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid rgba(148, 163, 184, 0.28)",
                            textAlign: "right",
                          }}
                        />
                        <span style={{ marginLeft: 4, fontSize: 11 }}>€</span>
                      </td>
                      <td className="hostly-inv-td-amount">{formatEur(computeLineTotal(line))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>Notas</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  fontSize: 13,
                  resize: "vertical",
                }}
              />
            </label>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                Total factura: {formatEur(invoiceTotal)}
              </div>
              <button
                type="button"
                style={primaryButtonStyle}
                disabled={isSubmitting || !canManageSupplierInvoices}
                title={capabilityDeniedTitle(canManageSupplierInvoices)}
                onClick={() => void handleSubmitInvoice()}
              >
                {isSubmitting ? "Registrando…" : "Registrar factura"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {linkedOutOfWindowInvoice ? <DeepLinkOutOfWindowNotice /> : null}
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
            Facturas registradas ({displayInvoices.length})
          </div>
          {displayInvoices.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>Sin facturas todavía.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  id={hostlyHighlightInvoiceElementId(invoice.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                  }}
                >
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
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {invoice.supplierName?.trim() || "Sin proveedor"}
                        {invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 4 }}>
                        {formatDate(invoice.invoiceDate ?? invoice.createdAt)} ·{" "}
                        {invoice.lines.length} línea(s) · {formatEur(invoice.total)}
                      </div>
                      {invoice.purchaseOrderId ? (
                        <Link
                          href={`/dashboard/inventario/pedidos-compra/${encodeURIComponent(invoice.purchaseOrderId)}`}
                          style={{ fontSize: 12, color: "#1d4ed8", marginTop: 4, display: "inline-block" }}
                          prefetch
                        >
                          Pedido {formatShortId(invoice.purchaseOrderId)}
                        </Link>
                      ) : null}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background:
                          invoice.status === "recorded"
                            ? "rgba(16, 185, 129, 0.12)"
                            : "rgba(148, 163, 184, 0.16)",
                        color:
                          invoice.status === "recorded" ? "#047857" : "#64748b",
                      }}
                    >
                      {invoice.status === "recorded" ? "Registrada" : "Borrador"}
                    </span>
                  </div>
                  {invoice.status === "recorded" ? (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {invoice.lines.slice(0, 4).map((line) => (
                        <div
                          key={`${invoice.id}-${line.productId}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {line.productName}
                            <Link
                              href={productTimelineHref(line.productId)}
                              style={{ ...actionButtonStyle, padding: "2px 6px", fontSize: 10 }}
                              prefetch
                            >
                              Timeline
                            </Link>
                          </span>
                          <span style={{ whiteSpace: "nowrap" }}>
                            {formatQty(line.quantity)} {displayUnit(line.unit)} ·{" "}
                            {formatEur(line.realUnitCost)}/ud
                            {line.previousUnitCost != null && line.updatedInventoryUnitCost != null ? (
                              <span style={{ color: "var(--hostly-ink-muted)" }}>
                                {" "}
                                (coste {formatQty(line.previousUnitCost)} →{" "}
                                {formatQty(line.updatedInventoryUnitCost)})
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModulePageShell>
  );
}
