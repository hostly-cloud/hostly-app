"use client";

import { useRef, useEffect, useCallback } from "react";
import { ConfigBtnPrimary, ConfigBtnSecondary } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { ProductQuickCreateDrinkFormat } from "@/components/productos/product-quick-create-drink-format";
import type {
  ProductQuickCreateSubmitMode,
  UseProductQuickCreateResult,
} from "@/components/productos/use-product-quick-create";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { ProductQuickCreateDraft } from "@/lib/productos/product-category-inheritance";
import type { ProductQuickCreateInheritedDraft } from "@/lib/productos/product-category-inheritance";

const drawerInputClass =
  "hostly-input hostly-carta-config-field-input hostly-product-quick-create-v3__input";

export type ProductQuickCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Misma lista que los chips/filtros de Productos (fuente: `cartaCategorias` del tenant). */
  categorias: readonly CartaCategoria[];
  quickCreate: UseProductQuickCreateResult;
  t: (key: string) => string;
  onCreated?: (productId: string) => void;
  onOpenAddCategory?: () => void;
  onOpenAdvancedConfig?: (
    draft: ProductQuickCreateDraft,
    inherited: ProductQuickCreateInheritedDraft,
  ) => void;
  /** Modal de categoría abierto encima — bloquea interacción con el alta rápida. */
  addCategoryOpen?: boolean;
};

/**
 * Alta rápida V3 · Fase 3 — flujo lineal, nombre protagonista, sin scroll.
 */
export function ProductQuickCreateDrawer({
  open,
  onClose,
  categorias,
  quickCreate,
  t,
  onCreated,
  onOpenAddCategory,
  onOpenAdvancedConfig,
  addCategoryOpen = false,
}: ProductQuickCreateDrawerProps) {
  const nombreInputRef = useRef<HTMLInputElement | null>(null);
  const showDrinkFormat = quickCreate.inheritedDraft.tipoVenta === "bebida";

  const focusNombre = useCallback((selectAll = false) => {
    window.setTimeout(() => {
      const el = nombreInputRef.current;
      if (!el) return;
      el.focus();
      if (selectAll) {
        el.select();
      }
    }, 30);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (addCategoryOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    focusNombre(false);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, focusNombre, addCategoryOpen]);

  if (!open) return null;

  async function handleSubmit(mode: ProductQuickCreateSubmitMode) {
    const result = await quickCreate.submitQuickCreate(mode);
    if (!result) return;
    onCreated?.(result.productId);
    if (mode === "close") {
      onClose();
      return;
    }
    focusNombre(true);
  }

  return (
    <div
      className={`hostly-product-quick-create-v3-backdrop${addCategoryOpen ? " hostly-product-quick-create-v3-backdrop--blocked" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("carta.newProduct")}
      data-hostly-product-quick-create=""
      onMouseDown={(e) => {
        if (addCategoryOpen) return;
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <aside
        className="hostly-product-quick-create-v3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="hostly-product-quick-create-v3__header">
          <div className="hostly-product-quick-create-v3__header-main">
            <h2 className="hostly-product-quick-create-v3__title">{t("carta.newProduct")}</h2>
            {quickCreate.successFlash ? (
              <span className="hostly-product-quick-create-v3__flash" role="status" aria-live="polite">
                {quickCreate.successFlash}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="hostly-product-quick-create-v3__close"
            onClick={onClose}
            aria-label={t("common.cancel")}
          >
            ×
          </button>
        </header>

        <form
          className="hostly-product-quick-create-v3__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (quickCreate.canSubmit) {
              void handleSubmit("continue");
            }
          }}
        >
          <div className="hostly-product-quick-create-v3__fields">
            <label className="hostly-product-quick-create-v3__field hostly-product-quick-create-v3__field--hero">
              <span className="hostly-product-quick-create-v3__label hostly-product-quick-create-v3__label--hero">
                Nombre comercial
              </span>
              <input
                ref={nombreInputRef}
                className={`${drawerInputClass} hostly-product-quick-create-v3__input--hero`}
                value={quickCreate.draft.nombre}
                onChange={(e) => quickCreate.setNombre(e.target.value)}
                autoComplete="off"
                placeholder="Ej. Fanta Naranja, Croquetas…"
                disabled={quickCreate.saving}
              />
            </label>

            <div className="hostly-product-quick-create-v3__field">
              <span className="hostly-product-quick-create-v3__label">{t("carta.fieldCategoria")}</span>
              <div className="hostly-product-quick-create-v3__category-row">
                <select
                  className={`${drawerInputClass} hostly-product-quick-create-v3__category-select`}
                  value={quickCreate.draft.categoriaCartaId ?? ""}
                  disabled={quickCreate.saving}
                  aria-label={t("carta.fieldCategoria")}
                  onChange={(e) => {
                    const v = e.target.value;
                    quickCreate.selectCategory(v === "" ? null : v);
                  }}
                >
                  <option value="">{t("cartaCategories.selectNone")}</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.isActive ? ` (${t("cartaCategories.inactiveShort")})` : ""}
                    </option>
                  ))}
                </select>
                {onOpenAddCategory ? (
                  <button
                    type="button"
                    className="hostly-product-quick-create-v3__category-add"
                    disabled={quickCreate.saving}
                    aria-label={t("cartaCategories.addFromForm")}
                    title="Nueva categoría"
                    onClick={onOpenAddCategory}
                  >
                    +
                  </button>
                ) : null}
              </div>
            </div>

            <label className="hostly-product-quick-create-v3__field hostly-product-quick-create-v3__field--price">
              <span className="hostly-product-quick-create-v3__label">{t("carta.fieldPrecio")}</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                className={`${drawerInputClass} tabular-nums hostly-product-quick-create-v3__input--price`}
                value={quickCreate.draft.precio}
                onChange={(e) => quickCreate.setPrecio(e.target.value)}
                placeholder="0.00"
                disabled={quickCreate.saving}
              />
            </label>

            {showDrinkFormat ? (
              <ProductQuickCreateDrinkFormat
                compositionType={quickCreate.inheritedDraft.productCompositionType}
              />
            ) : null}

            {quickCreate.error ? (
              <div
                className="hostly-carta-config-alert hostly-carta-config-alert--error hostly-product-quick-create-v3__error"
                role="alert"
              >
                {quickCreate.error}
              </div>
            ) : null}
          </div>

          <footer className="hostly-product-quick-create-v3__footer">
            <div className="hostly-product-quick-create-v3__actions">
              <ConfigBtnPrimary
                type="submit"
                className="hostly-product-quick-create-v3__save"
                disabled={quickCreate.saving || !quickCreate.canSubmit}
              >
                {quickCreate.saving ? t("common.preparing") : t("common.save")}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary
                type="button"
                className="hostly-product-quick-create-v3__save-close"
                disabled={quickCreate.saving || !quickCreate.canSubmit}
                onClick={() => void handleSubmit("close")}
              >
                Guardar y cerrar
              </ConfigBtnSecondary>
            </div>
            {onOpenAdvancedConfig ? (
              <button
                type="button"
                className="hostly-product-quick-create-v3__more-options"
                disabled={quickCreate.saving}
                onClick={() =>
                  onOpenAdvancedConfig(quickCreate.draft, quickCreate.inheritedDraft)
                }
              >
                Más opciones
              </button>
            ) : null}
          </footer>
        </form>
      </aside>
    </div>
  );
}
