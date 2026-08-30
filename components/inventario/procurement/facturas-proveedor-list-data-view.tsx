"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SupplierInvoiceDocument } from "@/lib/firestore/supplier-invoices";
import { productTimelineHref, hostlyHighlightInvoiceElementId } from "@/lib/inventory/product-timeline";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListItem,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import {
  displayProcurementUnit,
  formatProcurementEur,
  formatProcurementQty,
  supplierInvoiceStatusLabel,
  supplierInvoiceStatusTone,
} from "./procurement-display-utils";

export type FacturasProveedorListRow = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  dateLabel: string;
  lineCount: number;
  totalLabel: string;
  status: string;
  purchaseOrderId: string | null;
  purchaseOrderShortId: string | null;
  previewLines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    unitCostLabel: string;
    costDeltaLabel?: string | null;
  }>;
  highlightId?: string;
  footer?: ReactNode;
};

export type FacturasProveedorListDataViewProps = {
  rows: FacturasProveedorListRow[];
  emptyMessage?: string;
  emptyContent?: ReactNode;
};

export function FacturasProveedorListDataView({
  rows,
  emptyMessage = "Sin facturas todavía.",
  emptyContent,
}: FacturasProveedorListDataViewProps) {
  if (rows.length === 0) {
    if (emptyContent) {
      return emptyContent;
    }
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--facturas-proveedor">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__body">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--facturas-proveedor">
      <HostlyDataTable variant="facturas-proveedor">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="supplier">Proveedor</HostlyDataCell>
            <HostlyDataCell col="invoice">Factura</HostlyDataCell>
            <HostlyDataCell col="date">Fecha</HostlyDataCell>
            <HostlyDataCell align="end" col="lines">Líneas</HostlyDataCell>
            <HostlyDataCell align="end" col="total">Total</HostlyDataCell>
            <HostlyDataCell align="center" col="status">Estado</HostlyDataCell>
            <HostlyDataCell col="order">Pedido</HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {rows.map((row) => (
              <HostlyDataRow
                key={row.id}
                id={hostlyHighlightInvoiceElementId(row.id)}
                selected={row.highlightId === row.id}
                className={row.highlightId === row.id ? "hostly-highlight-target" : undefined}
              >
                <HostlyDataCell col="supplier">
                  <span className="hostly-data-table-primary__name">{row.supplierName}</span>
                </HostlyDataCell>
                <HostlyDataCell col="invoice">
                  <span className="hostly-data-table-secondary">{row.invoiceNumber || "—"}</span>
                </HostlyDataCell>
                <HostlyDataCell col="date">
                  <span className="hostly-data-table-secondary">{row.dateLabel}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="lines">
                  <span className="hostly-data-table-metric">{row.lineCount}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="total">
                  <span className="hostly-cost-badge">{row.totalLabel}</span>
                </HostlyDataCell>
                <HostlyDataCell align="center" col="status">
                  <HostlyStatusBadge tone={supplierInvoiceStatusTone(row.status)}>
                    {supplierInvoiceStatusLabel(row.status)}
                  </HostlyStatusBadge>
                </HostlyDataCell>
                <HostlyDataCell col="order">
                  {row.purchaseOrderId ? (
                    <Link
                      href={`/dashboard/inventario/pedidos-compra/${encodeURIComponent(row.purchaseOrderId)}`}
                      className="hostly-row-actions__btn hostly-row-actions__btn--text"
                      prefetch
                    >
                      Pedido {row.purchaseOrderShortId}
                    </Link>
                  ) : (
                    <span className="hostly-data-table-secondary">—</span>
                  )}
                </HostlyDataCell>
              </HostlyDataRow>
            ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {rows.map((row) => (
          <HostlyMobileListItem
            key={row.id}
            title={
              <span className="hostly-mobile-list-item__name">
                {row.supplierName}
                {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}
              </span>
            }
            meta={
              <>
                <HostlyStatusBadge tone={supplierInvoiceStatusTone(row.status)}>
                  {supplierInvoiceStatusLabel(row.status)}
                </HostlyStatusBadge>
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>{row.dateLabel}</span>
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>
                  {row.lineCount} línea{row.lineCount === 1 ? "" : "s"}
                </span>
              </>
            }
            aside={<span className="hostly-cost-badge">{row.totalLabel}</span>}
            actions={
              row.purchaseOrderId ? (
                <Link
                  href={`/dashboard/inventario/pedidos-compra/${encodeURIComponent(row.purchaseOrderId)}`}
                  className="hostly-button-secondary hostly-button-compact"
                  prefetch
                >
                  Pedido {row.purchaseOrderShortId}
                </Link>
              ) : undefined
            }
          >
            {row.status === "recorded" && row.previewLines.length > 0 ? (
              <div className="hostly-procurement-invoice-preview">
                {row.previewLines.map((line) => (
                  <div key={`${row.id}-${line.productId}`} className="hostly-procurement-invoice-preview__line">
                    <span className="hostly-procurement-invoice-preview__name">{line.productName}</span>
                    <span className="hostly-procurement-invoice-preview__meta">
                      {formatProcurementQty(line.quantity)} {displayProcurementUnit(line.unit)} · {line.unitCostLabel}
                      {line.costDeltaLabel ? ` ${line.costDeltaLabel}` : ""}
                    </span>
                    <Link
                      href={productTimelineHref(line.productId)}
                      className="hostly-row-actions__btn hostly-row-actions__btn--text"
                      prefetch
                    >
                      Historial
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </HostlyMobileListItem>
        ))}
      </HostlyMobileList>
    </div>
  );
}

export function mapSupplierInvoiceToListRow(
  invoice: SupplierInvoiceDocument,
  params: {
    formatDate: (value: number | null | undefined) => string;
    formatEur: (value: number | null | undefined) => string;
    formatQty: (value: number | null | undefined) => string;
    formatShortId: (id: string) => string;
    highlightId?: string;
  },
): FacturasProveedorListRow {
  return {
    id: invoice.id,
    supplierName: invoice.supplierName?.trim() || "Sin proveedor",
    invoiceNumber: invoice.invoiceNumber?.trim() || "",
    dateLabel: params.formatDate(invoice.invoiceDate ?? invoice.createdAt),
    lineCount: invoice.lines.length,
    totalLabel: params.formatEur(invoice.total),
    status: invoice.status,
    purchaseOrderId: invoice.purchaseOrderId ?? null,
    purchaseOrderShortId: invoice.purchaseOrderId ? params.formatShortId(invoice.purchaseOrderId) : null,
    highlightId: params.highlightId,
    previewLines: invoice.lines.slice(0, 4).map((line) => ({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unit: line.unit,
      unitCostLabel: `${params.formatEur(line.realUnitCost)}/ud`,
      costDeltaLabel:
        line.previousUnitCost != null && line.updatedInventoryUnitCost != null
          ? `(coste ${params.formatQty(line.previousUnitCost)} → ${params.formatQty(line.updatedInventoryUnitCost)})`
          : null,
    })),
  };
}
