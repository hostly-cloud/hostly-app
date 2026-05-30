"use client";

import type { ReactNode } from "react";
import {
  ConfigBtnDanger,
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
} from "@/components/ui/hostly/data-table";
import { HostlyCostBadge, HostlyMarginBadge } from "./escandallo-badges";
import { formatMoney2 } from "./escandallo-display-utils";

export type EscandalloIngredientRow = {
  clientRowId: string;
  producto_id: string;
  cantidad: string;
  unidad: string;
};

export type EscandalloProductoOption = {
  id: number | string;
  nombre?: string | null;
  unidad?: string | null;
};

type EscandalloRecipeEditorProps = {
  costeRegistrado: number | null;
  precioVenta: number | null;
  costeCalculado: number;
  margenDisplay: string;
  ingredientes: EscandalloIngredientRow[];
  productosCatalog: EscandalloProductoOption[];
  loading?: boolean;
  saving?: boolean;
  disabled?: boolean;
  onAddIngredient: () => void;
  onSave: () => void;
  onRemoveIngredient: (rowId: string) => void;
  onSelectProducto: (rowId: string, productId: string) => void;
  onUpdateIngredient: (rowId: string, patch: Partial<EscandalloIngredientRow>) => void;
  nombreProductoDisplay: (productoId: string) => string;
  unitCostForProduct: (productoId: string) => number | null;
  lineCostForRow: (row: EscandalloIngredientRow) => number | null;
  labels: {
    costeRegistrado: string;
    precioVenta: string;
    margenEstimado: string;
    costeIngredientes: string;
    ingredients: string;
    addIngredient: string;
    saveChanges: string;
    saving: string;
    colProduct: string;
    colIngredient: string;
    colQty: string;
    colUnit: string;
    colUnitCost: string;
    colLineCost: string;
    colActions: string;
    selectProduct: string;
    placeholderQty: string;
    placeholderUnit: string;
    loadingIngredients: string;
    noIngredients: string;
    footerTotal: string;
    delete: string;
  };
  alerts?: ReactNode;
};

const inputClass = "hostly-input hostly-carta-config-field-input hostly-recipe-editor__cell-input";

export function EscandalloRecipeEditor({
  costeRegistrado,
  precioVenta,
  costeCalculado,
  margenDisplay,
  ingredientes,
  productosCatalog,
  loading = false,
  saving = false,
  disabled = false,
  onAddIngredient,
  onSave,
  onRemoveIngredient,
  onSelectProducto,
  onUpdateIngredient,
  nombreProductoDisplay,
  unitCostForProduct,
  lineCostForRow,
  labels,
  alerts,
}: EscandalloRecipeEditorProps) {
  const marginPct =
    precioVenta != null && precioVenta > 0 && costeCalculado != null
      ? ((precioVenta - costeCalculado) / precioVenta) * 100
      : null;

  return (
    <div className="hostly-recipe-editor">
      {alerts}

      <div className="hostly-recipe-editor__kpi-strip hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
        <div className="hostly-carta-config-kpi-pill">
          <span className="hostly-carta-config-kpi-pill__label">{labels.costeRegistrado}</span>
          <span className="hostly-carta-config-kpi-pill__value">
            <HostlyCostBadge value={formatMoney2(costeRegistrado)} />
          </span>
        </div>
        <div className="hostly-carta-config-kpi-pill">
          <span className="hostly-carta-config-kpi-pill__label">{labels.precioVenta}</span>
          <span className="hostly-carta-config-kpi-pill__value">
            <HostlyCostBadge value={formatMoney2(precioVenta)} />
          </span>
        </div>
        <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
          <span className="hostly-carta-config-kpi-pill__label">{labels.margenEstimado}</span>
          <span className="hostly-carta-config-kpi-pill__value">
            <HostlyMarginBadge
              marginPct={marginPct}
              coste={costeCalculado}
              venta={precioVenta}
              emphasize
            />
          </span>
        </div>
        <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--warning">
          <span className="hostly-carta-config-kpi-pill__label">{labels.costeIngredientes}</span>
          <span className="hostly-carta-config-kpi-pill__value">
            <HostlyCostBadge value={formatMoney2(costeCalculado)} className="hostly-cost-badge--accent" />
          </span>
        </div>
      </div>

      <ConfigCard flush className="hostly-recipe-editor__ingredients-card">
        <div className="hostly-recipe-editor__ingredients-head">
          <h2 className="hostly-carta-config-section-title">{labels.ingredients}</h2>
          <div className="hostly-recipe-editor__ingredients-actions">
            <ConfigBtnSecondary type="button" disabled={disabled} onClick={onAddIngredient}>
              {labels.addIngredient}
            </ConfigBtnSecondary>
            <ConfigBtnPrimary type="button" disabled={disabled || saving} onClick={onSave}>
              {saving ? labels.saving : labels.saveChanges}
            </ConfigBtnPrimary>
          </div>
        </div>

        <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded hostly-data-table-viewport--recipe-ingredients">
          {ingredientes.length === 0 ? (
            <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
              <p className="hostly-carta-config-empty__body">
                {loading ? labels.loadingIngredients : labels.noIngredients}
              </p>
            </div>
          ) : (
            <HostlyDataTable variant="recipe-ingredients">
              <HostlyDataTableScroll>
                <HostlyDataTableHead>
                  <HostlyDataCell col="product">{labels.colProduct}</HostlyDataCell>
                  <HostlyDataCell col="name">{labels.colIngredient}</HostlyDataCell>
                  <HostlyDataCell align="end" col="qty">
                    {labels.colQty}
                  </HostlyDataCell>
                  <HostlyDataCell col="unit">{labels.colUnit}</HostlyDataCell>
                  <HostlyDataCell align="end" col="unit-cost">
                    {labels.colUnitCost}
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="line-cost">
                    {labels.colLineCost}
                  </HostlyDataCell>
                  <HostlyDataCell align="end" col="actions">
                    {labels.colActions}
                  </HostlyDataCell>
                </HostlyDataTableHead>
                <HostlyDataTableBody>
                  {ingredientes.map((row) => {
                    const unitCost = unitCostForProduct(row.producto_id);
                    const lineTotal = lineCostForRow(row);

                    return (
                      <HostlyDataRow key={row.clientRowId}>
                        <HostlyDataCell col="product">
                          <select
                            className={inputClass}
                            value={row.producto_id}
                            onChange={(e) => onSelectProducto(row.clientRowId, e.target.value)}
                            aria-label={labels.colProduct}
                          >
                            <option value="">{labels.selectProduct}</option>
                            {productosCatalog.map((prod) => (
                              <option key={String(prod.id)} value={String(prod.id)}>
                                {prod.nombre?.trim() || `#${prod.id}`}
                              </option>
                            ))}
                          </select>
                        </HostlyDataCell>
                        <HostlyDataCell col="name">
                          <span className="hostly-data-table-secondary">{nombreProductoDisplay(row.producto_id)}</span>
                        </HostlyDataCell>
                        <HostlyDataCell align="end" col="qty">
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            className={inputClass}
                            value={row.cantidad}
                            onChange={(e) => onUpdateIngredient(row.clientRowId, { cantidad: e.target.value })}
                            placeholder={labels.placeholderQty}
                            aria-label={labels.colQty}
                          />
                        </HostlyDataCell>
                        <HostlyDataCell col="unit">
                          <input
                            className={inputClass}
                            value={row.unidad}
                            onChange={(e) => onUpdateIngredient(row.clientRowId, { unidad: e.target.value })}
                            placeholder={labels.placeholderUnit}
                            aria-label={labels.colUnit}
                          />
                        </HostlyDataCell>
                        <HostlyDataCell align="end" col="unit-cost">
                          <HostlyCostBadge value={unitCost != null ? formatMoney2(unitCost) : "—"} />
                        </HostlyDataCell>
                        <HostlyDataCell align="end" col="line-cost">
                          <HostlyCostBadge
                            value={lineTotal != null ? formatMoney2(lineTotal) : "—"}
                            className="hostly-cost-badge--accent"
                          />
                        </HostlyDataCell>
                        <HostlyDataCell align="end" col="actions">
                          <ConfigBtnDanger type="button" onClick={() => onRemoveIngredient(row.clientRowId)}>
                            {labels.delete}
                          </ConfigBtnDanger>
                        </HostlyDataCell>
                      </HostlyDataRow>
                    );
                  })}
                </HostlyDataTableBody>
              </HostlyDataTableScroll>
            </HostlyDataTable>
          )}
        </div>

        {ingredientes.length > 0 ? (
          <div className="hostly-recipe-editor__footer-total">
            <span>{labels.footerTotal}</span>
            <HostlyCostBadge value={formatMoney2(costeCalculado)} className="hostly-cost-badge--accent hostly-cost-badge--lg" />
          </div>
        ) : null}
      </ConfigCard>

      <p className="hostly-recipe-editor__meta-hint">{margenDisplay}</p>
    </div>
  );
}
