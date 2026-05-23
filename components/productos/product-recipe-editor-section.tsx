"use client";

import type { CSSProperties } from "react";
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

export function createEmptyRecipeIngredientRow(): RecipeIngredientDraftRow {
  return {
    clientRowId: newDraftRowId(),
    productId: "",
    quantity: "",
    unit: "unit",
  };
}

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
  const saleId = saleProductId?.trim() ?? "";
  const productsById = new Map(inventoryProducts.map((p) => [p.id, p]));

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
    onRowsChange([...rows, createEmptyRecipeIngredientRow()]);
  }

  function removeRow(rowId: string): void {
    onRowsChange(rows.filter((row) => row.clientRowId !== rowId));
  }

  const selectableProducts = inventoryProducts.filter((p) => p.id !== saleId);

  return (
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 12,
        padding: "12px 14px",
        background: "rgba(15, 23, 42, 0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>
            Escandallo / receta
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
            Ingredientes de inventario central consumidos al vender este producto. El descuento de stock
            se activará en una fase posterior.
          </p>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            color: "#e2e8f0",
            flexShrink: 0,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "#22c55e" }}
          />
          Activar
        </label>
      </div>

      {enabled ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Añade al menos un ingrediente de inventario.
            </p>
          ) : null}

          {rows.map((row, index) => {
            const product = row.productId ? productsById.get(row.productId) : undefined;
            const selfRef = saleId && row.productId === saleId;
            return (
              <div
                key={row.clientRowId}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "10px 10px 12px",
                  borderRadius: 10,
                  border: selfRef
                    ? "1px solid rgba(248, 113, 113, 0.45)"
                    : "1px solid rgba(51, 65, 85, 0.65)",
                  background: "rgba(2, 6, 23, 0.35)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                    Ingrediente {index + 1}
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
                    Quitar
                  </button>
                </div>

                <div>
                  <label style={labelStyle}>Producto inventario</label>
                  <select
                    value={row.productId}
                    disabled={disabled}
                    onChange={(e) => onSelectProduct(row.clientRowId, e.target.value)}
                    style={{ ...inputStyle, minHeight: 48, cursor: disabled ? "not-allowed" : "pointer" }}
                  >
                    <option value="">Seleccionar…</option>
                    {selectableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.unit ? ` (${p.unit})` : ""}
                      </option>
                    ))}
                  </select>
                  {product ? (
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>
                      Stock unit: {product.unit ?? "ud"}
                    </p>
                  ) : null}
                  {selfRef ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#fecaca" }}>
                      No puedes usar el propio producto vendido como ingrediente.
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
                    <label style={labelStyle}>Cantidad</label>
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
                      style={{ ...inputStyle, minHeight: 48 }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Unidad</label>
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
                          {unit}
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
              border: "1px dashed rgba(148, 163, 184, 0.35)",
              background: "transparent",
              color: "#93c5fd",
              borderRadius: 10,
              padding: "10px 12px",
              fontWeight: 700,
              fontSize: 13,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            + Añadir ingrediente
          </button>
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
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b" }}>
          No hay productos de inventario activos. Créalos en Inventario con stock habilitado.
        </p>
      ) : null}
    </div>
  );
}
