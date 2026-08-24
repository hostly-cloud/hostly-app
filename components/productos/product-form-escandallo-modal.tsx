"use client";

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { CSSProperties } from "react";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { ProductProfitabilityPanel } from "@/components/carta/escandallos/product-profitability-panel";
import { formatMoney2 } from "@/components/carta/escandallos/escandallo-display-utils";
import { EscandalloRecipeStateBadge } from "@/components/carta/escandallos/escandallo-badges";
import { computeEscandalloVisualStateFromDraft } from "@/components/carta/escandallos/escandallo-row-visual-state";
import {
  computeProductProfitability,
  type ProductProfitabilityDraftRow,
} from "@/components/carta/escandallos/product-profitability-utils";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  ProductRecipeEditorSection,
  type RecipeIngredientDraftRow,
} from "@/components/productos/product-recipe-editor-section";
import type { InventoryProductLookup } from "@/lib/recipes/product-recipe-types";

const ESCANDALLO_SHEET_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 650,
  color: "#64748b",
  marginBottom: 6,
};

const ESCANDALLO_SHEET_INPUT_STYLE: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const escandalloMobileStyles = `
@media (max-width: 767px) {
  .hostly-product-escandallo-summary {
    padding: 9px 10px !important;
    border-radius: 10px !important;
    box-shadow: none !important;
  }

  .hostly-product-escandallo-summary__head {
    align-items: center !important;
    gap: 8px !important;
  }

  .hostly-product-escandallo-summary__title {
    font-size: 13px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-summary__head > button {
    min-height: 34px !important;
    padding: 5px 8px !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-escandallo-summary__state {
    margin-top: 5px !important;
  }

  .hostly-product-escandallo-summary__metrics {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px !important;
    margin-top: 7px !important;
  }

  .hostly-product-escandallo-summary__metric {
    min-width: 0;
    margin: 0 !important;
    padding: 6px 8px !important;
    border-radius: 8px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-escandallo-summary__metric-label {
    display: block;
    margin-bottom: 2px;
    font-size: 9px !important;
    line-height: 1.1 !important;
    color: var(--hostly-ink-faint) !important;
  }

  .hostly-product-escandallo-summary__metric strong,
  .hostly-product-escandallo-summary__metric > span:last-child {
    font-size: 14px !important;
    line-height: 1.05 !important;
  }

  .hostly-product-escandallo-modal-backdrop {
    padding: 0 !important;
    align-items: stretch !important;
  }

  .hostly-product-escandallo-modal {
    width: 100vw !important;
    max-width: none !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .hostly-product-escandallo-modal__header {
    align-items: center !important;
    padding: max(8px, env(safe-area-inset-top)) 10px 7px !important;
    gap: 8px !important;
  }

  .hostly-product-escandallo-modal__title {
    font-size: 17px !important;
    line-height: 1.12 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-product-escandallo-modal__subtitle {
    margin-top: 1px !important;
    max-width: 64vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-modal__header > button {
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11px !important;
  }

  .hostly-product-escandallo-modal__body {
    gap: 8px !important;
    padding: 8px 10px 12px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-escandallo-modal__section {
    margin: 0 !important;
  }

  .hostly-product-escandallo-modal__section .hostly-product-profitability {
    padding: 9px 10px !important;
    border-radius: 10px !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .hostly-product-escandallo-modal__section .hostly-product-profitability h4 {
    font-size: 12px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-modal__section .hostly-recipe-editor__kpi-strip {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px !important;
    margin-top: 7px !important;
  }

  .hostly-product-escandallo-modal__section .hostly-carta-config-kpi-pill {
    min-width: 0 !important;
    padding: 6px 7px !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }

  .hostly-product-escandallo-modal__section .hostly-carta-config-kpi-pill__label {
    font-size: 8.5px !important;
    line-height: 1.05 !important;
  }

  .hostly-product-escandallo-modal__section .hostly-carta-config-kpi-pill__value,
  .hostly-product-escandallo-modal__section .hostly-carta-config-kpi-pill__value .hostly-status-badge {
    font-size: 11px !important;
    line-height: 1.05 !important;
  }

  .hostly-product-escandallo-modal__section--recipe {
    background: #ffffff;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 10px;
    overflow: hidden;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__header-title {
    font-size: 13px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__header-subtitle {
    margin-top: 2px !important;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__toggle {
    gap: 5px !important;
    max-width: 118px !important;
    font-size: 10px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__toggle input {
    width: 18px !important;
    height: 18px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__body {
    margin-top: 7px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__list-heading {
    margin: 0 0 5px !important;
    font-size: 9px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__list {
    gap: 5px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__row {
    gap: 6px !important;
    padding: 8px !important;
    border-radius: 9px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__row-head {
    gap: 6px !important;
    align-items: center !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__row-name {
    min-width: 0;
    margin: 0 !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__remove {
    min-height: 32px !important;
    padding: 4px 7px !important;
    border-radius: 8px !important;
    background: transparent !important;
    font-size: 10px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__metrics {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__field-label {
    margin-bottom: 3px !important;
    font-size: 9px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__control {
    min-height: 40px !important;
    padding: 7px 9px !important;
    border-radius: 9px !important;
    font-size: 12px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__add {
    min-height: 40px !important;
    margin-top: 6px !important;
    padding: 7px 10px !important;
    border-radius: 9px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
    text-align: center !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__empty {
    padding: 10px !important;
    border-radius: 9px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__empty-title {
    font-size: 12px !important;
  }

  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__empty-body,
  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__hint,
  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__warning,
  .hostly-product-escandallo-modal__section--recipe .hostly-product-recipe-editor__self-ref {
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-escandallo-modal__footer {
    gap: 7px !important;
    padding: 7px 10px max(8px, env(safe-area-inset-bottom)) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-product-escandallo-modal__footer-hint {
    margin: 0 !important;
    font-size: 9px !important;
    line-height: 1.2 !important;
    color: var(--hostly-ink-faint) !important;
  }

  .hostly-product-escandallo-modal__footer > button {
    flex: 0 0 auto;
    min-height: 42px !important;
    padding: 7px 14px !important;
    border-radius: 10px !important;
    font-size: 11px !important;
  }
}
`;

export type ProductFormEscandalloSummaryCardProps = {
  recipeEnabled: boolean;
  recipeRows: readonly ProductProfitabilityDraftRow[];
  saleProductId: string | null;
  salePrice: number | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
  onEdit: () => void;
  disabled?: boolean;
  editLabel?: string;
};

export function ProductFormEscandalloSummaryCard({
  recipeEnabled,
  recipeRows,
  saleProductId,
  salePrice,
  productDocumentsById,
  onEdit,
  disabled = false,
  editLabel = "Editar escandallo",
}: ProductFormEscandalloSummaryCardProps) {
  const visualState = useMemo(
    () =>
      computeEscandalloVisualStateFromDraft({
        recipeEnabled,
        recipeRows,
        saleProductId,
        salePrice,
        productDocumentsById,
      }),
    [recipeEnabled, recipeRows, saleProductId, salePrice, productDocumentsById],
  );

  const profitability = useMemo(
    () =>
      visualState === "operativo"
        ? computeProductProfitability({
            recipeEnabled,
            recipeRows,
            saleProductId,
            salePrice,
            productDocumentsById,
          })
        : null,
    [
      visualState,
      recipeEnabled,
      recipeRows,
      saleProductId,
      salePrice,
      productDocumentsById,
    ],
  );

  return (
    <section className="hostly-product-escandallo-summary" aria-label="Escandallo">
      <style>{escandalloMobileStyles}</style>
      <div className="hostly-product-escandallo-summary__head">
        <h3 className="hostly-product-escandallo-summary__title">Escandallo</h3>
        <ConfigBtnSecondary type="button" disabled={disabled} onClick={onEdit}>
          {editLabel}
        </ConfigBtnSecondary>
      </div>
      <div className="hostly-product-escandallo-summary__state">
        <EscandalloRecipeStateBadge state={visualState} />
      </div>
      {visualState === "operativo" && profitability?.serviceCost != null ? (
        <div className="hostly-product-escandallo-summary__metrics">
          <p className="hostly-product-escandallo-summary__metric">
            <span className="hostly-product-escandallo-summary__metric-label">Coste</span>
            <strong>{formatMoney2(profitability.serviceCost)}</strong>
          </p>
          {profitability.sufficient && profitability.marginPct != null ? (
            <p className="hostly-product-escandallo-summary__metric">
              <span className="hostly-product-escandallo-summary__metric-label">Margen</span>
              <strong>{Math.round(profitability.marginPct)} %</strong>
            </p>
          ) : (
            <p className="hostly-product-escandallo-summary__metric hostly-product-escandallo-summary__metric--muted">
              <span className="hostly-product-escandallo-summary__metric-label">Margen</span>
              <span>—</span>
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export type ProductFormEscandalloModalProps = {
  open: boolean;
  productName: string;
  saleProductId: string | null;
  recipeEnabled: boolean;
  onRecipeEnabledChange: (value: boolean) => void;
  recipeRows: RecipeIngredientDraftRow[];
  onRecipeRowsChange: Dispatch<SetStateAction<RecipeIngredientDraftRow[]>>;
  salePrice: number | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
  inventoryProducts: readonly InventoryProductLookup[];
  recipeWarnings: readonly string[];
  disabled?: boolean;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
  onClose: () => void;
  doneLabel?: string;
};

export function ProductFormEscandalloModal({
  open,
  productName,
  saleProductId,
  recipeEnabled,
  onRecipeEnabledChange,
  recipeRows,
  onRecipeRowsChange,
  salePrice,
  productDocumentsById,
  inventoryProducts,
  recipeWarnings,
  disabled = false,
  onClose,
  doneLabel = "Listo",
}: ProductFormEscandalloModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, disabled, onClose]);

  if (!open) return null;

  const titleName = productName.trim() || "Producto";

  return (
    <div
      className="hostly-product-escandallo-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !disabled) onClose();
      }}
    >
      <style>{escandalloMobileStyles}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-escandallo-modal-title"
        className="hostly-product-escandallo-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hostly-product-escandallo-modal__header">
          <div className="hostly-product-escandallo-modal__header-text">
            <h2 id="product-form-escandallo-modal-title" className="hostly-product-escandallo-modal__title">
              Escandallo
            </h2>
            <p className="hostly-product-escandallo-modal__subtitle">{titleName}</p>
          </div>
          <ConfigBtnSecondary type="button" disabled={disabled} onClick={onClose}>
            Cerrar
          </ConfigBtnSecondary>
        </div>

        <div className="hostly-product-escandallo-modal__body">
          <section className="hostly-product-escandallo-modal__section">
            <ProductProfitabilityPanel
              recipeEnabled={recipeEnabled}
              recipeRows={recipeRows}
              saleProductId={saleProductId}
              salePrice={salePrice}
              productDocumentsById={productDocumentsById}
              appearance="sheet"
            />
          </section>

          <section className="hostly-product-escandallo-modal__section hostly-product-escandallo-modal__section--recipe">
            <ProductRecipeEditorSection
              saleProductId={saleProductId}
              enabled={recipeEnabled}
              onEnabledChange={onRecipeEnabledChange}
              rows={recipeRows}
              onRowsChange={onRecipeRowsChange}
              inventoryProducts={inventoryProducts}
              warnings={recipeWarnings}
              disabled={disabled}
              labelStyle={ESCANDALLO_SHEET_LABEL_STYLE}
              inputStyle={ESCANDALLO_SHEET_INPUT_STYLE}
              appearance="sheet"
            />
          </section>
        </div>

        <div className="hostly-product-escandallo-modal__footer">
          <p className="hostly-product-escandallo-modal__footer-hint">
            Los cambios del escandallo se guardan cuando guardas el producto.
          </p>
          <ConfigBtnPrimary type="button" disabled={disabled} onClick={onClose}>
            {doneLabel}
          </ConfigBtnPrimary>
        </div>
      </div>
    </div>
  );
}
