"use client";

import { useRef, useEffect, useCallback } from "react";
import { CategoriaCartaFormField } from "@/components/carta/categoria-carta-form-field";
import { ConfigBtnPrimary, ConfigBtnSecondary } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import type {
  ProductQuickCreateSubmitMode,
  UseProductQuickCreateResult,
} from "@/components/productos/use-product-quick-create";
import type { ProductQuickCreateDraft } from "@/lib/productos/product-category-inheritance";
import type { ProductQuickCreateInheritedDraft } from "@/lib/productos/product-category-inheritance";

const drawerInputProminentClass =
  "hostly-input hostly-carta-config-field-input hostly-product-form-drawer-input hostly-product-form-drawer-input--prominent";

export type ProductQuickCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  quickCreate: UseProductQuickCreateResult;
  t: (key: string) => string;
  onCreated?: (productId: string) => void;
  onOpenAddCategory?: () => void;
  onOpenAdvancedConfig?: (
    draft: ProductQuickCreateDraft,
    inherited: ProductQuickCreateInheritedDraft,
  ) => void;
};

/**
 * Drawer de alta rápida (Productos V2) — modo operador con alta continua.
 */
export function ProductQuickCreateDrawer({
  open,
  onClose,
  quickCreate,
  t,
  onCreated,
  onOpenAddCategory,
  onOpenAdvancedConfig,
}: ProductQuickCreateDrawerProps) {
  const nombreInputRef = useRef<HTMLInputElement | null>(null);

  const focusNombre = useCallback(() => {
    window.setTimeout(() => nombreInputRef.current?.focus(), 30);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    focusNombre();
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, focusNombre]);

  if (!open) return null;

  async function handleSubmit(mode: ProductQuickCreateSubmitMode) {
    const result = await quickCreate.submitQuickCreate(mode);
    if (!result) return;
    onCreated?.(result.productId);
    if (mode === "close") {
      onClose();
      return;
    }
    focusNombre();
  }

  return (
    <div
      className="hostly-product-form-drawer-backdrop hostly-product-quick-create-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("carta.newProduct")}
      data-hostly-product-quick-create=""
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <aside
        className="hostly-product-form-drawer hostly-product-quick-create-drawer"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hostly-product-quick-create-drawer__header">
          <div className="hostly-product-quick-create-drawer__header-text">
            <h2 className="hostly-product-quick-create-drawer__title">{t("carta.newProduct")}</h2>
            <p className="hostly-product-quick-create-drawer__subtitle">
              Alta continua — introduce productos seguidos sin salir.
            </p>
          </div>
          <button
            type="button"
            className="hostly-product-quick-create-drawer__close"
            onClick={onClose}
            aria-label={t("common.cancel")}
          >
            ×
          </button>
        </div>

        <form
          className="hostly-product-quick-create-drawer__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (quickCreate.canSubmit) {
              void handleSubmit("continue");
            }
          }}
        >
          <div className="hostly-product-quick-create-drawer__body">
            {quickCreate.successFlash ? (
              <p
                className="hostly-product-quick-create-drawer__success-flash"
                role="status"
                aria-live="polite"
              >
                {quickCreate.successFlash}
              </p>
            ) : null}

            <label className="hostly-carta-config-form-field">
              <span className="hostly-carta-config-form-label">{t("carta.fieldNombre")}</span>
              <input
                ref={nombreInputRef}
                className={drawerInputProminentClass}
                value={quickCreate.draft.nombre}
                onChange={(e) => quickCreate.setNombre(e.target.value)}
                autoComplete="off"
                placeholder="Ej. Croquetas caseras"
                disabled={quickCreate.saving}
              />
            </label>

            <CategoriaCartaFormField
              t={t}
              categorias={quickCreate.categoriasForForm}
              selectedId={quickCreate.draft.categoriaCartaId}
              onSelectId={quickCreate.selectCategory}
              onOpenAddCategory={onOpenAddCategory ?? (() => undefined)}
              hintClassName="hostly-carta-config-form-hint hostly-product-quick-create-drawer__hint"
            />

            <label className="hostly-carta-config-form-field">
              <span className="hostly-carta-config-form-label">{t("carta.fieldPrecio")}</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                className={`${drawerInputProminentClass} tabular-nums`}
                value={quickCreate.draft.precio}
                onChange={(e) => quickCreate.setPrecio(e.target.value)}
                placeholder="0.00"
                disabled={quickCreate.saving}
              />
            </label>

            {quickCreate.error ? (
              <div
                className="hostly-carta-config-alert hostly-carta-config-alert--error"
                role="alert"
              >
                {quickCreate.error}
              </div>
            ) : null}
          </div>

          <div className="hostly-product-quick-create-drawer__footer">
            <div className="hostly-product-quick-create-drawer__actions">
              <ConfigBtnPrimary
                type="submit"
                className="hostly-product-form-drawer__footer-primary hostly-product-quick-create-drawer__save"
                disabled={quickCreate.saving || !quickCreate.canSubmit}
              >
                {quickCreate.saving ? t("common.preparing") : t("common.save")}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary
                type="button"
                className="hostly-product-quick-create-drawer__save-close"
                disabled={quickCreate.saving || !quickCreate.canSubmit}
                onClick={() => void handleSubmit("close")}
              >
                Guardar y cerrar
              </ConfigBtnSecondary>
            </div>

            {onOpenAdvancedConfig ? (
              <button
                type="button"
                className="hostly-product-quick-create-drawer__advanced-link"
                disabled={quickCreate.saving}
                onClick={() =>
                  onOpenAdvancedConfig(quickCreate.draft, quickCreate.inheritedDraft)
                }
              >
                Configuración avanzada
              </button>
            ) : null}
          </div>
        </form>
      </aside>
    </div>
  );
}
