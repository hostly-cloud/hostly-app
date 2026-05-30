"use client";

import type { ReactNode } from "react";
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
  type HostlyStatusBadgeTone,
} from "@/components/ui/hostly/data-table";

export type RecepcionListDisplayRow = {
  id: string;
  supplierPrimary: string;
  supplierLegal?: string;
  dateLabel: string;
  orderLabel: string;
  itemsLabel: string;
  refSnippet?: string;
  phaseTitle: string;
  phaseSub: string;
  incidentText?: string;
  extraIncidents?: number;
  amountLabel: string;
  invoiceStatus: { label: string; tone: HostlyStatusBadgeTone };
  stockStatus: { label: string; tone: HostlyStatusBadgeTone };
  orderStatus: { label: string; tone: HostlyStatusBadgeTone };
  selected: boolean;
  attention: boolean;
};

export type RecepcionesListDataViewProps = {
  rows: RecepcionListDisplayRow[];
  onSelect: (id: string) => void;
  renderActions: (row: RecepcionListDisplayRow) => ReactNode;
  emptyMessage?: string;
};

export function RecepcionesListDataView({
  rows,
  onSelect,
  renderActions,
  emptyMessage = "Sin recepciones.",
}: RecepcionesListDataViewProps) {
  if (rows.length === 0) {
    return (
      <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
        <p className="hostly-carta-config-empty__body">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--recepciones hostly-receiving-list">
      <HostlyDataTable variant="recepciones">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="supplier">Proveedor</HostlyDataCell>
            <HostlyDataCell col="phase">Estado</HostlyDataCell>
            <HostlyDataCell col="lines">Líneas</HostlyDataCell>
            <HostlyDataCell col="flags">Factura / Stock</HostlyDataCell>
            <HostlyDataCell align="end" col="amount">Importe</HostlyDataCell>
            <HostlyDataCell align="end" col="actions">Acciones</HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {rows.map((row) => (
              <HostlyDataRow
                key={row.id}
                selected={row.selected}
                onClick={() => onSelect(row.id)}
                className={row.attention ? "hostly-receiving-row--attention" : undefined}
              >
                <HostlyDataCell col="supplier">
                  <div className="hostly-data-table-primary">
                    <span className="hostly-data-table-primary__name">{row.supplierPrimary}</span>
                    {row.supplierLegal ? (
                      <span className="hostly-data-table-primary__meta">{row.supplierLegal}</span>
                    ) : null}
                    <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
                      {row.dateLabel} · {row.orderLabel}
                    </span>
                  </div>
                </HostlyDataCell>
                <HostlyDataCell col="phase">
                  <div className="hostly-receiving-phase">
                    <span className="hostly-receiving-phase__title">{row.phaseTitle}</span>
                    <span className="hostly-receiving-phase__sub">{row.phaseSub}</span>
                    {row.incidentText ? (
                      <span className="hostly-receiving-phase__incident" title={row.incidentText}>
                        {row.incidentText}
                        {row.extraIncidents && row.extraIncidents > 0
                          ? ` · +${row.extraIncidents}`
                          : null}
                      </span>
                    ) : null}
                  </div>
                </HostlyDataCell>
                <HostlyDataCell col="lines">
                  <span className="hostly-data-table-secondary">{row.itemsLabel}</span>
                  {row.refSnippet ? (
                    <span className="hostly-data-table-primary__meta">{row.refSnippet}</span>
                  ) : null}
                </HostlyDataCell>
                <HostlyDataCell col="flags">
                  <div className="hostly-receiving-badges">
                    <HostlyStatusBadge tone={row.invoiceStatus.tone}>{row.invoiceStatus.label}</HostlyStatusBadge>
                    <HostlyStatusBadge tone={row.stockStatus.tone}>{row.stockStatus.label}</HostlyStatusBadge>
                    <HostlyStatusBadge tone={row.orderStatus.tone} className="hostly-data-table-col--tablet-only">
                      {row.orderStatus.label}
                    </HostlyStatusBadge>
                  </div>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="amount">
                  <span className="hostly-data-table-metric">{row.amountLabel}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="actions">
                  <div
                    className="hostly-receiving-row-actions"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderActions(row)}
                  </div>
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
            selected={row.selected}
            onClick={() => onSelect(row.id)}
            title={<span className="hostly-mobile-list-item__name">{row.supplierPrimary}</span>}
            meta={
              <>
                <HostlyStatusBadge tone={row.orderStatus.tone}>{row.orderStatus.label}</HostlyStatusBadge>
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>{row.dateLabel}</span>
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>{row.itemsLabel}</span>
              </>
            }
            aside={<span className="hostly-data-table-metric">{row.amountLabel}</span>}
            actions={renderActions(row)}
          >
            <div className="hostly-receiving-mobile-meta">
              <span className="hostly-receiving-phase__title">{row.phaseTitle}</span>
              <div className="hostly-receiving-badges">
                <HostlyStatusBadge tone={row.invoiceStatus.tone}>{row.invoiceStatus.label}</HostlyStatusBadge>
                <HostlyStatusBadge tone={row.stockStatus.tone}>{row.stockStatus.label}</HostlyStatusBadge>
              </div>
              {row.incidentText ? (
                <span className="hostly-receiving-phase__incident">{row.incidentText}</span>
              ) : null}
            </div>
          </HostlyMobileListItem>
        ))}
      </HostlyMobileList>
    </div>
  );
}
