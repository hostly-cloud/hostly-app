"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import Link from "next/link";
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

/** Pantalla principal de inventario (productos con stock activo). */
const INVENTORY_PRODUCTS_ROUTE = "/dashboard/inventario";

const inventoryCtaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 10,
  textDecoration: "none",
};

type RecipeEditorAppearance = "embedded" | "sheet";

type ProductRecipeEditorSectionProps = {
  saleProductId: string | null;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  rows: RecipeIngredientDraftRow[];
  onRowsChange: Dispatch<SetStateAction<RecipeIngredientDraftRow[]>>;
  inventoryProducts: readonly InventoryProductLookup[];
  warnings: readonly string[];
  disabled?: boolean;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
  /** `sheet` = modal Escandallo (tema claro). Por defecto `embedded`. */
  appearance?: RecipeEditorAppearance;
};

function recipeEditorTheme(appearance: RecipeEditorAppearance) {
  const sheet = appearance === "sheet";
  return {
    shell: {
      border: sheet ? "1px solid #e2e8f0" : "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: 12,
      padding: sheet ? "16px" : "12px 14px",
      background: sheet ? "#ffffff" : "rgba(15, 23, 42, 0.35)",
    } satisfies CSSProperties,
    title: {
      fontSize: 15,
      fontWeight: 800,
      color: sheet ? "#0f172a" : "#f8fafc",
      letterSpacing: "-0.02em",
    } satisfies CSSProperties,
    subtitle: {
      margin: "6px 0 0",
      fontSize: 12,
      color: sheet ? "#64748b" : "#94a3b8",
      lineHeight: 1.5,
    } satisfies CSSProperties,
    toggleLabel: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      fontWeight: 700,
      color: sheet ? "#334155" : "#e2e8f0",
      flexShrink: 0,
      maxWidth: 148,
      lineHeight: 1.35,
      textAlign: "right" as const,
    } satisfies CSSProperties,
    hint: {
      margin: "12px 0 0",
      fontSize: 12,
      color: "#64748b",
      lineHeight: 1.5,
    } satisfies CSSProperties,
    emptyBox: {
      padding: "14px 12px",
      borderRadius: 10,
      border: sheet ? "1px dashed #cbd5e1" : "1px dashed rgba(148, 163, 184, 0.28)",
      background: sheet ? "#f8fafc" : "rgba(2, 6, 23, 0.25)",
    } satisfies CSSProperties,
    emptyTitle: {
      margin: 0,
      fontSize: 13,
      fontWeight: 700,
      color: sheet ? "#334155" : "#cbd5e1",
    } satisfies CSSProperties,
    emptyBody: {
      margin: "8px 0 12px",
      fontSize: 12,
      color: sheet ? "#64748b" : "#94a3b8",
      lineHeight: 1.5,
    } satisfies CSSProperties,
    addButton: {
      border: sheet ? "1px dashed #93c5fd" : "1px dashed rgba(96, 165, 250, 0.45)",
      background: sheet ? "#f0f9ff" : "rgba(30, 58, 138, 0.2)",
      color: sheet ? "#0369a1" : "#bfdbfe",
      borderRadius: 10,
      padding: "12px 14px",
      fontWeight: 800,
      fontSize: 14,
      width: "100%",
      textAlign: "left" as const,
    } satisfies CSSProperties,
    previewBox: {
      padding: "12px 12px 10px",
      borderRadius: 10,
      border: sheet ? "1px solid #bbf7d0" : "1px solid rgba(34, 197, 94, 0.22)",
      background: sheet ? "#f0fdf4" : "rgba(6, 78, 59, 0.12)",
    } satisfies CSSProperties,
    previewHeading: {
      margin: "0 0 8px",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      color: sheet ? "#15803d" : "#86efac",
    } satisfies CSSProperties,
    previewLine: {
      fontSize: 14,
      fontWeight: 700,
      color: sheet ? "#0f172a" : "#f8fafc",
      lineHeight: 1.35,
      fontVariantNumeric: "tabular-nums" as const,
    } satisfies CSSProperties,
    sectionHeading: {
      margin: 0,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      color: "#64748b",
    } satisfies CSSProperties,
    rowCard: (selfRef: boolean) =>
      ({
        display: "grid",
        gap: 10,
        padding: "12px 12px 14px",
        borderRadius: 10,
        border: selfRef
          ? "1px solid rgba(248, 113, 113, 0.45)"
          : sheet
            ? "1px solid #e2e8f0"
            : "1px solid rgba(51, 65, 85, 0.65)",
        background: sheet ? "#f8fafc" : "rgba(2, 6, 23, 0.35)",
      }) satisfies CSSProperties,
    rowTitle: {
      margin: 0,
      fontSize: 15,
      fontWeight: 800,
      color: sheet ? "#0f172a" : "#f8fafc",
      lineHeight: 1.3,
    } satisfies CSSProperties,
    rowMeta: {
      color: sheet ? "#64748b" : "#94a3b8",
      fontWeight: 600,
    } satisfies CSSProperties,
    rowPending: {
      color: sheet ? "#b45309" : "#fbbf24",
      fontWeight: 600,
      fontSize: 12,
    } satisfies CSSProperties,
    newLine: {
      fontSize: 13,
      fontWeight: 700,
      color: sheet ? "#475569" : "#cbd5e1",
    } satisfies CSSProperties,
    removeButton: {
      border: "1px solid rgba(248, 113, 113, 0.35)",
      background: sheet ? "#fef2f2" : "rgba(127, 29, 29, 0.25)",
      color: sheet ? "#b91c1c" : "#fecaca",
      borderRadius: 8,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 700,
      flexShrink: 0,
    } satisfies CSSProperties,
    warningBox: {
      marginTop: 12,
      padding: "10px 12px",
      borderRadius: 10,
      border: sheet ? "1px solid #fcd34d" : "1px solid rgba(251, 191, 36, 0.35)",
      background: sheet ? "#fffbeb" : "rgba(120, 53, 15, 0.25)",
      color: sheet ? "#92400e" : "#fde68a",
      fontSize: 12,
      lineHeight: 1.45,
    } satisfies CSSProperties,
    selfRefError: {
      margin: "6px 0 0",
      fontSize: 12,
      color: sheet ? "#b91c1c" : "#fecaca",
    } satisfies CSSProperties,
  };
}

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

function sheetRecipeLabels(locale: string) {
  if (locale === "en") {
    return {
      listHeading: "Recipe ingredients",
      amount: "Quantity",
      unit: "Unit",
      pendingName: "Select ingredient",
    };
  }
  return {
    listHeading: "Ingredientes de la receta",
    amount: "Cantidad",
    unit: "Unidad",
    pendingName: "Selecciona ingrediente",
  };
}

function NoStockIngredientsEmpty({
  isSheet,
  theme,
  title,
  body,
  ctaLabel,
}: {
  isSheet: boolean;
  theme: ReturnType<typeof recipeEditorTheme>;
  title: string;
  body: string;
  ctaLabel: string;
}) {
  const cta = (
    <Link
      href={INVENTORY_PRODUCTS_ROUTE}
      className="hostly-button-primary hostly-button-compact"
      style={inventoryCtaStyle}
    >
      {ctaLabel}
    </Link>
  );

  if (isSheet) {
    return (
      <div className="hostly-product-recipe-editor__empty hostly-product-recipe-editor__empty--stock">
        <p className="hostly-product-recipe-editor__empty-title">{title}</p>
        <p className="hostly-product-recipe-editor__empty-body">{body}</p>
        {cta}
      </div>
    );
  }

  return (
    <div style={theme.emptyBox}>
      <p style={theme.emptyTitle}>{title}</p>
      <p style={theme.emptyBody}>{body}</p>
      {cta}
    </div>
  );
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
  appearance = "embedded",
}: ProductRecipeEditorSectionProps) {
  const { t, locale } = useI18n();
  const theme = recipeEditorTheme(appearance);
  const sheetLabels = sheetRecipeLabels(locale);
  const isSheet = appearance === "sheet";
  const saleId = saleProductId?.trim() ?? "";
  const hasStockProducts = inventoryProducts.length > 0;
  const ingredientControlsDisabled = disabled || !hasStockProducts;
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
    onRowsChange((prev) =>
      prev.map((row) => (row.clientRowId === rowId ? { ...row, ...patch } : row)),
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
    onRowsChange((prev) => [...prev, createEmptyRecipeIngredientRow()]);
  }

  function removeRow(rowId: string): void {
    onRowsChange((prev) => prev.filter((row) => row.clientRowId !== rowId));
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

  const headerBlock = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        {isSheet ? (
          <>
            <h3 className="hostly-product-recipe-editor__header-title">
              {t("carta.recipeEditor.title")}
            </h3>
            <p className="hostly-product-recipe-editor__header-subtitle">
              {t("carta.recipeEditor.subtitle")}
            </p>
          </>
        ) : (
          <>
            <div style={theme.title}>{t("carta.recipeEditor.title")}</div>
            <p style={theme.subtitle}>{t("carta.recipeEditor.subtitle")}</p>
          </>
        )}
      </div>
      <label
        className={isSheet ? "hostly-product-recipe-editor__toggle" : undefined}
        style={{
          ...theme.toggleLabel,
          cursor: disabled ? "not-allowed" : "pointer",
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
  );

  const sheetIngredientRows = rows.map((row) => {
    const product = row.productId ? productsById.get(row.productId) : undefined;
    const selfRef = saleId && row.productId === saleId;
    const displayName = product?.name?.trim();

    return (
      <li
        key={row.clientRowId}
        className={`hostly-product-recipe-editor__row${selfRef ? " hostly-product-recipe-editor__row--invalid" : ""}`}
      >
        <div className="hostly-product-recipe-editor__row-head">
          <p
            className={`hostly-product-recipe-editor__row-name${displayName ? "" : " hostly-product-recipe-editor__row-name--pending"}`}
          >
            {displayName ?? sheetLabels.pendingName}
          </p>
          <button
            type="button"
            className="hostly-product-recipe-editor__remove"
            disabled={disabled}
            onClick={() => removeRow(row.clientRowId)}
          >
            {t("carta.recipeEditor.remove")}
          </button>
        </div>

        <div>
          <select
            className="hostly-product-recipe-editor__control"
            value={row.productId}
            disabled={ingredientControlsDisabled}
            onChange={(e) => onSelectProduct(row.clientRowId, e.target.value)}
          >
            <option value="">{t("carta.recipeEditor.productPlaceholder")}</option>
            {selectableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selfRef ? (
            <p className="hostly-product-recipe-editor__self-ref">
              {t("carta.recipeEditor.selfReferenceError")}
            </p>
          ) : null}
        </div>

        <div className="hostly-product-recipe-editor__metrics">
          <div>
            <label className="hostly-product-recipe-editor__field-label">
              {sheetLabels.amount}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              className="hostly-product-recipe-editor__control"
              disabled={ingredientControlsDisabled}
              value={row.quantity}
              onChange={(e) => updateRow(row.clientRowId, { quantity: e.target.value })}
              placeholder={t("carta.recipeEditor.amountPlaceholder")}
            />
          </div>
          <div>
            <label className="hostly-product-recipe-editor__field-label">
              {sheetLabels.unit}
            </label>
            <select
              className="hostly-product-recipe-editor__control"
              value={row.unit}
              disabled={ingredientControlsDisabled}
              onChange={(e) =>
                updateRow(row.clientRowId, {
                  unit: e.target.value as RecipeInventoryUnit,
                })
              }
            >
              {RECIPE_INVENTORY_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </li>
    );
  });

  const embeddedIngredientRows = rows.map((row) => {
    const product = row.productId ? productsById.get(row.productId) : undefined;
    const selfRef = saleId && row.productId === saleId;
    const displayName = product?.name?.trim();
    const displayAmount = formatQuantityForDisplay(row.quantity, row.unit, unitLabel);

    return (
      <div key={row.clientRowId} style={theme.rowCard(Boolean(selfRef))}>
        {displayName ? (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <p style={theme.rowTitle}>
              {displayName}
              {displayAmount ? <span style={theme.rowMeta}> · {displayAmount}</span> : null}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.clientRowId)}
              style={{
                ...theme.removeButton,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {t("carta.recipeEditor.remove")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={theme.newLine}>{t("carta.recipeEditor.newLine")}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.clientRowId)}
              style={{
                ...theme.removeButton,
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
            disabled={ingredientControlsDisabled}
            onChange={(e) => onSelectProduct(row.clientRowId, e.target.value)}
            style={{
              ...inputStyle,
              minHeight: 48,
              cursor: ingredientControlsDisabled ? "not-allowed" : "pointer",
            }}
          >
            <option value="">{t("carta.recipeEditor.productPlaceholder")}</option>
            {selectableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selfRef ? (
            <p style={theme.selfRefError}>{t("carta.recipeEditor.selfReferenceError")}</p>
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
              disabled={ingredientControlsDisabled}
              value={row.quantity}
              onChange={(e) => updateRow(row.clientRowId, { quantity: e.target.value })}
              placeholder={t("carta.recipeEditor.amountPlaceholder")}
              style={{ ...inputStyle, minHeight: 48 }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t("carta.recipeEditor.fieldUnit")}</label>
            <select
              value={row.unit}
              disabled={ingredientControlsDisabled}
              onChange={(e) =>
                updateRow(row.clientRowId, {
                  unit: e.target.value as RecipeInventoryUnit,
                })
              }
              style={{
                ...inputStyle,
                minHeight: 48,
                cursor: ingredientControlsDisabled ? "not-allowed" : "pointer",
              }}
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
  });

  return (
    <div
      className={`hostly-product-recipe-editor${isSheet ? " hostly-product-recipe-editor--sheet" : ""}`}
      style={isSheet ? undefined : theme.shell}
    >
      {headerBlock}

      {!enabled ? (
        <p className={isSheet ? "hostly-product-recipe-editor__hint" : undefined} style={isSheet ? undefined : theme.hint}>
          {t("carta.recipeEditor.disabledHint")}
        </p>
      ) : null}

      {enabled ? (
        !hasStockProducts ? (
          <div
            className={isSheet ? "hostly-product-recipe-editor__body" : undefined}
            style={isSheet ? undefined : { marginTop: 14 }}
          >
            <NoStockIngredientsEmpty
              isSheet={isSheet}
              theme={theme}
              title={t("carta.recipeEditor.noStockTitle")}
              body={t("carta.recipeEditor.noStockBody")}
              ctaLabel={t("carta.recipeEditor.goToInventory")}
            />
          </div>
        ) : isSheet ? (
          <div className="hostly-product-recipe-editor__body">
            {rows.length === 0 ? (
              <div className="hostly-product-recipe-editor__empty">
                <p className="hostly-product-recipe-editor__empty-title">
                  {t("carta.recipeEditor.emptyTitle")}
                </p>
                <p className="hostly-product-recipe-editor__empty-body">
                  {t("carta.recipeEditor.emptyBody")}
                </p>
                <button
                  type="button"
                  className="hostly-product-recipe-editor__add"
                  disabled={disabled}
                  onClick={addRow}
                >
                  {t("carta.recipeEditor.addIngredient")}
                </button>
              </div>
            ) : (
              <>
                <p className="hostly-product-recipe-editor__list-heading">
                  {sheetLabels.listHeading}
                </p>
                <ul className="hostly-product-recipe-editor__list">{sheetIngredientRows}</ul>
                <button
                  type="button"
                  className="hostly-product-recipe-editor__add"
                  disabled={disabled}
                  onClick={addRow}
                >
                  {t("carta.recipeEditor.addIngredient")}
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {rows.length === 0 ? (
              <div style={theme.emptyBox}>
                <p style={theme.emptyTitle}>{t("carta.recipeEditor.emptyTitle")}</p>
                <p style={theme.emptyBody}>{t("carta.recipeEditor.emptyBody")}</p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addRow}
                  style={{
                    ...theme.addButton,
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
                  <div style={theme.previewBox}>
                    <p style={theme.previewHeading}>{t("carta.recipeEditor.previewHeading")}</p>
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
                        <li key={line.key} style={theme.previewLine}>
                          <span>{line.name}</span>
                          {line.amount ? (
                            <span style={theme.rowMeta}> · {line.amount}</span>
                          ) : (
                            <span style={theme.rowPending}>
                              {" "}
                              · {t("carta.recipeEditor.previewPendingAmount")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p style={theme.sectionHeading}>{t("carta.recipeEditor.editHeading")}</p>
                {embeddedIngredientRows}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addRow}
                  style={{
                    ...theme.addButton,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {t("carta.recipeEditor.addIngredient")}
                </button>
              </>
            )}
          </div>
        )
      ) : null}

      {warnings.length > 0 ? (
        <div
          className={isSheet ? "hostly-product-recipe-editor__warning" : undefined}
          style={isSheet ? undefined : theme.warningBox}
        >
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
