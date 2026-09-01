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
import {
  HostlyAlert,
  HostlyButton,
  HostlyLoadingState,
  HostlyOperationalEmptyState,
  HostlyPermissionState,
  HostlySectionHeader,
} from "@/components/ui/hostly";
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
import { hostlyHighlightInvoiceElementId } from "@/lib/inventory/product-timeline";
import { scheduleScrollAndHighlightById } from "@/lib/ui/scroll-and-highlight";
import { DeepLinkOutOfWindowNotice } from "@/components/inventario/deep-link-out-of-window-notice";
import {
  FacturasProveedorListDataView,
  mapSupplierInvoiceToListRow,
} from "@/components/inventario/procurement/facturas-proveedor-list-data-view";

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

type InvoiceSourceState = "loading" | "ready" | "error";

type InvoiceSourceSnapshot = {
  state: InvoiceSourceState;
  restaurantId: string | null;
};

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
  const [invoiceSourceSnapshot, setInvoiceSourceSnapshot] = useState<InvoiceSourceSnapshot>({
    state: "loading",
    restaurantId: null,
  });
  const [invoiceRetryKey, setInvoiceRetryKey] = useState(0);
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
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    let sourceFailed = false;
    return listenSupplierInvoices(
      restaurantId,
      (items) => {
        if (sourceFailed) return;
        setInvoices(items);
        setInvoiceSourceSnapshot({ state: "ready", restaurantId });
      },
      {
        onError: () => {
          sourceFailed = true;
          setInvoices([]);
          setInvoiceSourceSnapshot({ state: "error", restaurantId });
        },
      },
    );
  }, [authReady, invoiceRetryKey, restaurantId]);

  const invoicesSourceState: InvoiceSourceState | "missing-restaurant" = !authReady
    ? "loading"
    : !isFirebaseConfigured
      ? "error"
      : !restaurantId
        ? "missing-restaurant"
        : invoiceSourceSnapshot.restaurantId !== restaurantId
          ? "loading"
          : invoiceSourceSnapshot.state;

  const displayInvoices = useMemo(() => {
    if (!linkedOutOfWindowInvoice) return invoices;
    if (invoices.some((invoice) => invoice.id === linkedOutOfWindowInvoice.id)) {
      return invoices;
    }
    return [linkedOutOfWindowInvoice, ...invoices].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [invoices, linkedOutOfWindowInvoice]);

  const invoiceListRows = useMemo(
    () =>
      displayInvoices.map((invoice) =>
        mapSupplierInvoiceToListRow(invoice, {
          formatDate,
          formatEur,
          formatQty,
          formatShortId,
          highlightId: highlightInvoiceId || undefined,
        }),
      ),
    [displayInvoices, highlightInvoiceId],
  );

  useEffect(() => {
    if (!highlightInvoiceId || !authReady || !isFirebaseConfigured || !restaurantId) {
      setLinkedOutOfWindowInvoice(null);
      return;
    }
    if (invoicesSourceState !== "ready") return;

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
  }, [authReady, highlightInvoiceId, invoices, invoicesSourceState, restaurantId]);

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
      subtitle="Actualiza el coste real de los productos recibidos"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div className="hostly-mobile-op-page-stack">
        <HostlySectionHeader
          title="Registro de factura"
          description="Registra el coste real facturado sin modificar el stock. Las ventas anteriores conservarán el coste que tenían al cobrarse."
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
          <div className="hostly-panel p-3 hostly-procurement-form">
            <div className="hostly-procurement-form__grid">
              <label className="hostly-procurement-form__field">
                <span className="hostly-procurement-form__field-label">Proveedor</span>
                <input
                  className="hostly-input"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Sin proveedor"
                />
              </label>
              <label className="hostly-procurement-form__field">
                <span className="hostly-procurement-form__field-label">Nº factura</span>
                <input
                  className="hostly-input"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </label>
              <label className="hostly-procurement-form__field">
                <span className="hostly-procurement-form__field-label">Fecha factura</span>
                <input
                  className="hostly-input"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
            </div>

            <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--facturas-proveedor">
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
                        <div className="hostly-data-table-primary__meta">{displayUnit(line.unit)}</div>
                      </td>
                      <td className="hostly-inv-td-amount">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="hostly-input hostly-procurement-form__qty-input"
                          value={line.quantity}
                          onChange={(e) => handleLineQuantityChange(line.productId, e.target.value)}
                        />
                      </td>
                      <td className="hostly-inv-td-amount">
                        <div className="hostly-procurement-form__qty-cell">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="hostly-input hostly-procurement-form__qty-input"
                            value={line.realUnitCost}
                            onChange={(e) => handleLineUnitCostChange(line.productId, e.target.value)}
                          />
                          <span className="hostly-procurement-form__qty-unit">€</span>
                        </div>
                      </td>
                      <td className="hostly-inv-td-amount">
                        <span className="hostly-cost-badge">{formatEur(computeLineTotal(line))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="hostly-procurement-form__field">
              <span className="hostly-procurement-form__field-label">Notas</span>
              <textarea
                className="hostly-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{ resize: "vertical" }}
              />
            </label>

            <div className="hostly-procurement-draft-panel__head">
              <div className="hostly-procurement-draft-panel__title">
                Total factura: {formatEur(invoiceTotal)}
              </div>
              <button
                type="button"
                className="hostly-button-primary hostly-button-compact"
                disabled={isSubmitting || !canManageSupplierInvoices}
                title={capabilityDeniedTitle(canManageSupplierInvoices)}
                onClick={() => void handleSubmitInvoice()}
              >
                {isSubmitting ? "Registrando…" : "Registrar factura"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="hostly-panel p-3 hostly-procurement-form">
          {invoicesSourceState === "loading" ? (
            <HostlyLoadingState embedded label="Cargando facturas registradas…" />
          ) : null}

          {invoicesSourceState === "missing-restaurant" ? (
            <HostlyPermissionState embedded title="Selecciona un restaurante">
              Las facturas se muestran únicamente para el restaurante activo.
            </HostlyPermissionState>
          ) : null}

          {invoicesSourceState === "error" ? (
            <HostlyAlert tone="danger" title="No se han podido cargar las facturas">
              <p>No mostramos una lista vacía porque la fuente de datos no está disponible.</p>
              <HostlyButton
                variant="secondary"
                className="hostly-button-compact mt-3"
                onClick={() => {
                  setInvoiceSourceSnapshot({
                    state: "loading",
                    restaurantId: restaurantId ?? null,
                  });
                  setInvoiceRetryKey((value) => value + 1);
                }}
              >
                Reintentar
              </HostlyButton>
            </HostlyAlert>
          ) : null}

          {invoicesSourceState === "ready" ? (
            <>
              {linkedOutOfWindowInvoice ? <DeepLinkOutOfWindowNotice /> : null}
              {displayInvoices.length > 0 ? (
                <div className="hostly-procurement-draft-panel__title">
                  Facturas registradas ({displayInvoices.length})
                </div>
              ) : null}
              <FacturasProveedorListDataView
                rows={invoiceListRows}
                emptyContent={
                  <HostlyOperationalEmptyState
                    title="Sin facturas registradas"
                    text="Registra una factura desde un pedido recibido o sube una factura con OCR para actualizar costes reales."
                    actions={
                      <CapabilityGuard capability="supplier_invoices.manage">
                        <Link
                          href="/dashboard/inventario/facturas-proveedor/nueva"
                          className="hostly-button-primary hostly-button-compact hostly-operational-empty__action"
                          prefetch
                        >
                          Nueva factura (OCR)
                        </Link>
                      </CapabilityGuard>
                    }
                    hints={[
                      "Coste real por producto",
                      "Histórico de ventas protegido",
                      "Reconocimiento automático de productos",
                    ]}
                  />
                }
              />
            </>
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
