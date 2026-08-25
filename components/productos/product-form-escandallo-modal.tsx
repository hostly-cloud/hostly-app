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
