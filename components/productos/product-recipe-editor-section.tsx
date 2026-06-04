"use client";

import type { CSSProperties } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  RECIPE_INVENTORY_UNITS,
  type RecipeInventoryUnit,
} from "@/lib/recipes/product-recipe-helpers";
import type { InventoryProductLookup } from "@/lib/recipes/product-recipe-types";
import { inventoryStockUnitToModifierUnit } from "@/lib/modifiers/modifier-inventory-consumption";

export type RecipeIngredientDraftRow = {
  clientRowId: string;
  productId: string;
  quantity: string;
  unit: RecipeInventoryUnit;
};

type ProductRecipeEditorSectionProps = {
  saleProductId: string | null;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  rows: RecipeIngredientDraftRow[];
  onRowsChange: (rows: RecipeIngredientDraftRow[]) => void;
  inventoryProducts: readonly InventoryProductLookup[];
  warnings: readonly string[];
  disabled?: boolean;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
};

function newDraftRowId(): string {
  return `recipe_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultUnitForProduct(
  product: InventoryProductLookup | undefined,
): RecipeInventoryUnit {
  const mapped = inventoryStockUnitToModifierUnit(product?.unit);
  if (mapped && (RECIPE_INVENTORY_UNITS as readonly string[]).includes(mapped)) {
    return mapped as RecipeInventoryUnit;
  }
  return "unit";
}

function parsePositiveQuantity(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatQuantityForDisplay(
  quantity: string,
  unit: RecipeInventoryUnit,
  unitLabel: (unit: RecipeInventoryUnit) => string,
): string | null {
  const qty = parsePositiveQuantity(quantity);
  if (qty == null) return null;
  const formatted = Number.isInteger(qty)
    ? String(qty)
    : qty.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
  return `${formatted} ${unitLabel(unit)}`;
}

export function createEmptyRecipeIngredientRow(): RecipeIngredientDraftRow {
  return {
    clientRowId: newDraftRowId(),
    productId: "",
    quantity: "",
    unit: "unit",
  };
}

const addButtonStyle: CSSProperties = {
  border: "1px dashed rgba(96, 165, 250, 0.45)",
  background: "rgba(30, 58, 138, 0.2)",
  color: "#bfdbfe",
  borderRadius: 10,
  padding: "12px 14px",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
};

export function ProductRecipeEditorSection({
  saleProductId,
  enabled,
  onEnabledChange,
  rows,
  onRowsChange,
  inventoryProducts,
  warnings,
  disabled = false,
  labelStyle,
  inputStyle,
}: ProductRecipeEditorSectionProps) {
  const { t } = useI18n();
  const saleId = saleProductId?.trim() ?? "";
  const productsById = new Map(inventoryProducts.map((p) => [p.id, p]));

  const unitLabel = (unit: RecipeInventoryUnit): string => {
    const key = `carta.recipeEditor.unit_${unit}` as const;
    const translated = t(key);
    return translated !== key ? translated : unit;
  };

  function updateRow(
    rowId: string,
    patch: Partial<RecipeIngredientDraftRow>,
  ): void {
    onRowsChange(
      rows.map((row) => (row.clientRowId === rowId ? { ...row, ...patch } : row)),
    );
  }

  function onSelectProduct(rowId: string, productId: string): void {
    const product = productsById.get(productId);
    updateRow(rowId, {
      productId,
      unit: defaultUnitForProduct(product),
    });
  }

  function addRow(): void {
    if (!enabled) onEnabledChange(true);
    onRowsChange([...rows, createEmptyRecipeIngredientRow()]);
  }

  function removeRow(rowId: string): void {
    onRowsChange(rows.filter((row) => row.clientRowId !== rowId));
  }

  const selectableProducts = inventoryProducts.filter((p) => p.id !== saleId);

  const recipePreviewLines = rows
    .map((row) => {
      const product = row.productId ? productsById.get(row.productId) : undefined;
      const name = product?.name?.trim();
      const amount = formatQuantityForDisplay(row.quantity, row.unit, unitLabel);
      if (name && amount) return { key: row.clientRowId, name, amount };
      if (name) return { key: row.clientRowId, name, amount: null };
      return null;
    })
    .filter((line): line is { key: string; name: string; amount: string | null } => line != null);

  const hasCompletePreview = recipePreviewLines.some((line) => line.amount != null);

  return (
    <div
      className="hostly-product-recipe-editor"
      style={{
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 12,
        padding: "12px 14px",
        background: "rgba(15, 23, 42, 0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            {t("carta.recipeEditor.title")}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
            {t("carta.recipeEditor.subtitle")}
          </p>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: "#e2e8f0",
            flexShrink: 0,
            maxWidth: 148,
            lineHeight: 1.35,
            textAlign: "right",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "#22c55e", flexShrink: 0 }}
          />
          {t("carta.recipeEditor.enableToggle")}
        </label>
      </div>

      {!enabled ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          {t("carta.recipeEditor.disabledHint")}
        </p>
      ) : null}

      {enabled ? (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {rows.length === 0 ? (
            <div
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                border: "1px dashed rgba(148, 163, 184, 0.28)",
                background: "rgba(2, 6, 23, 0.25)",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
                {t("carta.recipeEditor.emptyTitle")}
              </p>
              <p style={{ margin: "8px 0 12px", fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                {t("carta.recipeEditor.emptyBody")}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={addRow}
                style={{
                  ...addButtonStyle,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {t("carta.recipeEditor.addIngredient")}
              </button>
            </div>
          ) : (
            <>
              {hasCompletePreview ? (
                <div
                  style={{
                    padding: "12px 12px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(34, 197, 94, 0.22)",
                    background: "rgba(6, 78, 59, 0.12)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#86efac",
                    }}
                  >
                    {t("carta.recipeEditor.previewHeading")}
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {recipePreviewLines.map((line) => (
                      <li
                        key={line.key}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#f8fafc",
                          lineHeight: 1.35,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span>{line.name}</span>
                        {line.amount ? (
                          <span style={{ color: "#94a3b8", fontWeight: 600 }}> · {line.amount}</span>
                        ) : (
                          <span style={{ color: "#fbbf24", fontWeight: 600, fontSize: 12 }}>
                            {" "}
                            · {t("carta.recipeEditor.previewPendingAmount")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
              >
                {t("carta.recipeEditor.editHeading")}
              </p>

              {rows.map((row) => {
                const product = row.productId ? productsById.get(row.productId) : undefined;
                const selfRef = saleId && row.productId === saleId;
                const displayName = product?.name?.trim();
                const displayAmount = formatQuantityForDisplay(row.quantity, row.unit, unitLabel);

                return (
                  <div
                    key={row.clientRowId}
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: "12px 12px 14px",
                      borderRadius: 10,
                      border: selfRef
                        ? "1px solid rgba(248, 113, 113, 0.45)"
                        : "1px solid rgba(51, 65, 85, 0.65)",
                      background: "rgba(2, 6, 23, 0.35)",
                    }}
                  >
                    {displayName ? (
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#f8fafc", lineHeight: 1.3 }}>
                          {displayName}
                          {displayAmount ? (
                            <span style={{ color: "#94a3b8", fontWeight: 600 }}> · {displayAmount}</span>
                          ) : null}
                        </p>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeRow(row.clientRowId)}
                          style={{
                            border: "1px solid rgba(248, 113, 113, 0.35)",
                            background: "rgba(127, 29, 29, 0.25)",
                            color: "#fecaca",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: disabled ? "not-allowed" : "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {t("carta.recipeEditor.remove")}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
                          {t("carta.recipeEditor.newLine")}
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeRow(row.clientRowId)}
                          style={{
                            border: "1px solid rgba(248, 113, 113, 0.35)",
                            background: "rgba(127, 29, 29, 0.25)",
                            color: "#fecaca",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {t("carta.recipeEditor.remove")}
                        </button>
                      </div>
                    )}

                    <div>
                      <label style={labelStyle}>{t("carta.recipeEditor.fieldProduct")}</label>
                      <select
                        value={row.productId}
                        disabled={disabled}
                        onChange={(e) => onSelectProduct(row.clientRowId, e.target.value)}
                        style={{ ...inputStyle, minHeight: 48, cursor: disabled ? "not-allowed" : "pointer" }}
                      >
                        <option value="">{t("carta.recipeEditor.productPlaceholder")}</option>
                        {selectableProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {selfRef ? (
                        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#fecaca" }}>
                          {t("carta.recipeEditor.selfReferenceError")}
                        </p>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(110px, 130px)",
                        gap: 8,
                      }}
                    >
                      <div>
                        <label style={labelStyle}>{t("carta.recipeEditor.fieldAmount")}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          disabled={disabled}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(row.clientRowId, { quantity: e.target.value })
                          }
                          placeholder={t("carta.recipeEditor.amountPlaceholder")}
                          style={{ ...inputStyle, minHeight: 48 }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t("carta.recipeEditor.fieldUnit")}</label>
                        <select
                          value={row.unit}
                          disabled={disabled}
                          onChange={(e) =>
                            updateRow(row.clientRowId, {
                              unit: e.target.value as RecipeInventoryUnit,
                            })
                          }
                          style={{ ...inputStyle, minHeight: 48, cursor: disabled ? "not-allowed" : "pointer" }}
                        >
                          {RECIPE_INVENTORY_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unitLabel(unit)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                disabled={disabled}
                onClick={addRow}
                style={{
                  ...addButtonStyle,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {t("carta.recipeEditor.addIngredient")}
              </button>
            </>
          )}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(251, 191, 36, 0.35)",
            background: "rgba(120, 53, 15, 0.25)",
            color: "#fde68a",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      {inventoryProducts.length === 0 ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          {t("carta.recipeEditor.noStockProducts")}
        </p>
      ) : null}
    </div>
  );
}
