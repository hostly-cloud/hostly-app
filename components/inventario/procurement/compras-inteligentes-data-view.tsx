"use client";

import Link from "next/link";
import { getProductKindDisplayLabel, type ProductKind } from "@/lib/carta/product-kind-options";
import type { PurchaseIntelligenceRow } from "@/lib/inventory/purchase-intelligence";
import { productTimelineHref } from "@/lib/inventory/product-timeline";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListItem,
  HostlyRowActions,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import {
  displayProcurementUnit,
  formatProcurementDays,
  formatProcurementEur,
  formatProcurementQty,
  purchaseRiskStatusTone,
} from "./procurement-display-utils";

export type ComprasInteligentesDataViewProps = {
  rows: PurchaseIntelligenceRow[];
  emptyMessage?: string;
  suggestedQtyByProductId?: Map<string, number>;
  estimatedCostByProductId?: Map<string, number | null>;
};

export function ComprasInteligentesDataView({
  rows,
  emptyMessage = "No hay productos para este filtro.",
  suggestedQtyByProductId,
  estimatedCostByProductId,
}: ComprasInteligentesDataViewProps) {
  if (rows.length === 0) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--compras">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__body">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--compras">
      <HostlyDataTable variant="compras">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Producto</HostlyDataCell>
            <HostlyDataCell align="end" col="stock">Stock</HostlyDataCell>
            <HostlyDataCell align="end" col="consumption">Consumo/día</HostlyDataCell>
            <HostlyDataCell align="end" col="coverage">Cobertura</HostlyDataCell>
            <HostlyDataCell align="center" col="status">Urgencia</HostlyDataCell>
            <HostlyDataCell align="end" col="suggest">Sugerido</HostlyDataCell>
            <HostlyDataCell align="end" col="cost">Coste est.</HostlyDataCell>
            <HostlyDataCell align="end" col="actions">Acciones</HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {rows.map((row) => {
              const suggested = suggestedQtyByProductId?.get(row.productId);
              const cost = estimatedCostByProductId?.get(row.productId);
              const kindLabel =
                row.kindLabel === "—"
                  ? "Sin clasificar"
                  : getProductKindDisplayLabel(row.kindLabel as ProductKind);

              return (
                <HostlyDataRow key={row.productId}>
                  <HostlyDataCell col="name">
                    <div className="hostly-data-table-primary">
                      <span className="hostly-data-table-primary__name" title={row.productName}>
                        {row.productName}
                      </span>
                      <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
                        {row.familyLabel} · {kindLabel}
                      </span>
                    </div>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="stock">
                    <span className="hostly-data-table-metric">
                      {formatProcurementQty(row.currentStock)} {displayProcurementUnit(row.unit)}
                    </span>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="consumption">
                    <span className="hostly-data-table-secondary">
                      {row.dailyConsumption != null
                        ? `${formatProcurementQty(row.dailyConsumption)} ${displayProcurementUnit(row.unit)}`
                        : "—"}
                    </span>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="coverage">
                    <span className="hostly-data-table-metric">
                      {row.daysRemaining == null ? "—" : `${formatProcurementDays(row.daysRemaining)} d`}
                    </span>
                  </HostlyDataCell>
                  <HostlyDataCell align="center" col="status">
                    <HostlyStatusBadge tone={purchaseRiskStatusTone(row.riskLevel)}>
                      {row.riskLabel}
                    </HostlyStatusBadge>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="suggest">
                    <span className="hostly-data-table-metric">
                      {suggested != null && suggested > 0
                        ? `${formatProcurementQty(suggested)} ${displayProcurementUnit(row.unit)}`
                        : "—"}
                    </span>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="cost">
                    <span className="hostly-cost-badge">{formatProcurementEur(cost ?? null)}</span>
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="actions">
                    <HostlyRowActions>
                      <Link
                        href={productTimelineHref(row.productId)}
                        className="hostly-row-actions__btn hostly-row-actions__btn--text"
                        prefetch
                      >
                        Historial
                      </Link>
                    </HostlyRowActions>
                  </HostlyDataCell>
                </HostlyDataRow>
              );
            })}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {rows.map((row) => {
          const suggested = suggestedQtyByProductId?.get(row.productId);
          const cost = estimatedCostByProductId?.get(row.productId);
          return (
            <HostlyMobileListItem
              key={row.productId}
              title={<span className="hostly-mobile-list-item__name">{row.productName}</span>}
              meta={
                <>
                  <HostlyStatusBadge tone={purchaseRiskStatusTone(row.riskLevel)}>{row.riskLabel}</HostlyStatusBadge>
                  <span className="hostly-mobile-list-item__dot" aria-hidden>
                    ·
                  </span>
                  <span>
                    {formatProcurementQty(row.currentStock)} {displayProcurementUnit(row.unit)}
                  </span>
                  <span className="hostly-mobile-list-item__dot" aria-hidden>
                    ·
                  </span>
                  <span>
                    {row.daysRemaining == null ? "—" : `${formatProcurementDays(row.daysRemaining)} d`}
                  </span>
                </>
              }
              aside={
                <>
                  {suggested != null && suggested > 0 ? (
                    <span className="hostly-data-table-metric">
                      +{formatProcurementQty(suggested)} {displayProcurementUnit(row.unit)}
                    </span>
                  ) : null}
                  <span className="hostly-cost-badge">{formatProcurementEur(cost ?? null)}</span>
                </>
              }
              actions={
                <Link href={productTimelineHref(row.productId)} className="hostly-button-secondary hostly-button-compact" prefetch>
                  Historial
                </Link>
              }
            />
          );
        })}
      </HostlyMobileList>
    </div>
  );
}
