"use client";

import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
} from "@/components/ui/hostly/data-table";
import type { SuggestedPurchaseDraftLine } from "@/lib/inventory/suggested-purchase-draft";
import {
  displayProcurementUnit,
  formatProcurementEur,
  formatProcurementQty,
} from "./procurement-display-utils";

export type ComprasDraftLinesDataViewProps = {
  lines: SuggestedPurchaseDraftLine[];
  onQuantityChange: (productId: string, value: string) => void;
  disabled?: boolean;
};

const qtyInputClass = "hostly-input hostly-carta-config-field-input hostly-procurement-form__qty-input";

export function ComprasDraftLinesDataView({
  lines,
  onQuantityChange,
  disabled = false,
}: ComprasDraftLinesDataViewProps) {
  if (lines.length === 0) {
    return (
      <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
        <p className="hostly-carta-config-empty__body">Sin líneas en el borrador.</p>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--compras-draft">
      <HostlyDataTable variant="compras-draft">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Producto</HostlyDataCell>
            <HostlyDataCell col="supplier">Proveedor</HostlyDataCell>
            <HostlyDataCell align="end" col="stock">Stock</HostlyDataCell>
            <HostlyDataCell align="end" col="consumption">Consumo/día</HostlyDataCell>
            <HostlyDataCell align="end" col="suggested">Sugerido</HostlyDataCell>
            <HostlyDataCell align="end" col="qty">Cantidad</HostlyDataCell>
            <HostlyDataCell align="end" col="cost">Coste est.</HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {lines.map((line) => (
              <HostlyDataRow key={line.productId}>
                <HostlyDataCell col="name">
                  <span className="hostly-data-table-primary__name">{line.productName}</span>
                </HostlyDataCell>
                <HostlyDataCell col="supplier">
                  <span className="hostly-data-table-secondary">{line.supplierName?.trim() || "—"}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="stock">
                  <span className="hostly-data-table-metric">
                    {formatProcurementQty(line.currentStock)} {displayProcurementUnit(line.unit)}
                  </span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="consumption">
                  <span className="hostly-data-table-secondary">
                    {formatProcurementQty(line.averageDailyConsumption)} {displayProcurementUnit(line.unit)}
                  </span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="suggested">
                  <span className="hostly-data-table-metric">
                    {formatProcurementQty(line.suggestedQuantity)} {displayProcurementUnit(line.unit)}
                  </span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="qty">
                  <div className="hostly-procurement-form__qty-cell">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={qtyInputClass}
                      value={line.editableQuantity}
                      disabled={disabled}
                      onChange={(e) => onQuantityChange(line.productId, e.target.value)}
                      aria-label={`Cantidad ${line.productName}`}
                    />
                    <span className="hostly-procurement-form__qty-unit">{displayProcurementUnit(line.unit)}</span>
                  </div>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="cost">
                  <span className="hostly-cost-badge">{formatProcurementEur(line.estimatedCost)}</span>
                </HostlyDataCell>
              </HostlyDataRow>
            ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>
    </div>
  );
}

export function ComprasDraftSummaryLines({ lines }: { lines: SuggestedPurchaseDraftLine[] }) {
  const activeLines = lines.filter((line) => line.editableQuantity > 0);

  if (activeLines.length === 0) {
    return (
      <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
        <p className="hostly-carta-config-empty__body">Sin líneas con cantidad.</p>
      </div>
    );
  }

  return (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--compras-draft">
      <HostlyDataTable variant="compras-draft">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            <HostlyDataCell col="name">Producto</HostlyDataCell>
            <HostlyDataCell col="supplier">Proveedor</HostlyDataCell>
            <HostlyDataCell align="end" col="qty">Cantidad</HostlyDataCell>
            <HostlyDataCell align="end" col="cost">Coste est.</HostlyDataCell>
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {activeLines.map((line) => (
              <HostlyDataRow key={line.productId}>
                <HostlyDataCell col="name">
                  <span className="hostly-data-table-primary__name">{line.productName}</span>
                </HostlyDataCell>
                <HostlyDataCell col="supplier">
                  <span className="hostly-data-table-secondary">{line.supplierName?.trim() || "—"}</span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="qty">
                  <span className="hostly-data-table-metric">
                    {formatProcurementQty(line.editableQuantity)} {displayProcurementUnit(line.unit)}
                  </span>
                </HostlyDataCell>
                <HostlyDataCell align="end" col="cost">
                  <span className="hostly-cost-badge">{formatProcurementEur(line.estimatedCost)}</span>
                </HostlyDataCell>
              </HostlyDataRow>
            ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>
    </div>
  );
}
