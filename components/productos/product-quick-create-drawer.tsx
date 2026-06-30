"use client";

import { useRef, useEffect } from "react";
import { CategoriaCartaFormField } from "@/components/carta/categoria-carta-form-field";
import { ConfigBtnPrimary, ConfigBtnSecondary } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductDocument } from "@/lib/firestore/products";
import type { ProductFormSubmitMessages } from "@/lib/productos/product-form-submit-payload";
import { useProductQuickCreate } from "@/components/productos/use-product-quick-create";

const drawerInputProminentClass =
  "hostly-input hostly-carta-config-field-input hostly-product-form-drawer-input hostly-product-form-drawer-input--prominent";

export type ProductQuickCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  cartaCategorias: readonly CartaCategoria[];
  operationStations: readonly OperationStationDocument[];
  productFamilies: readonly ProductFamilyDocument[];
  modifierGroups: readonly ModifierGroupDocument[];
  inventoryProducts: readonly ProductDocument[];
  isCentralCatalog: boolean;
  messages: ProductFormSubmitMessages;
  t: (key: string) => string;
  /** Reservado para la siguiente iteración (alta continua, toast, etc.). */
  onCreated?: (productId: string) => void;
  onOpenAddCategory?: () => void;
};

/**
 * Drawer de alta rápida (Productos V2).
 * Infraestructura preparada; conectar en iteración posterior sin duplicar persistencia.
 */
export function ProductQuickCreateDrawer({
  open,
  onClose,
  restaurantId,
  cartaCategorias,
  operationStations,
  productFamilies,
  modifierGroups,
  inventoryProducts,
  isCentralCatalog,
  messages,
  t,
  onCreated,
  onOpenAddCategory,
}: ProductQuickCreateDrawerProps) {
  const nombreInputRef = useRef<HTMLInputElement | null>(null);

  const quickCreate = useProductQuickCreate({
    restaurantId,
    cartaCategorias,
    operationStations,
    productFamilies,
    modifierGroups,
    inventoryProducts,
    isCentralCatalog,
    messages,
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => nombreInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    const productId = await quickCreate.submitQuickCreate();
    if (productId) {
      onCreated?.(productId);
      onClose();
    }
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
        <div className="hostly-product-form-drawer__header">
          <div className="hostly-product-form-drawer__header-text">
            <h2 className="hostly-product-form-drawer__title">{t("carta.newProduct")}</h2>
            <p className="hostly-product-form-drawer__subtitle">
              Alta rápida — nombre, categoría y precio.
            </p>
          </div>
          <ConfigBtnSecondary type="button" onClick={onClose}>
            {t("common.cancel")}
          </ConfigBtnSecondary>
        </div>

        <div className="hostly-product-form-drawer__body">
          <section
            className="hostly-product-quick-create-drawer__fields"
            aria-label={t("carta.productFormBlockProduct")}
          >
            <label className="hostly-carta-config-form-field">
              <span className="hostly-carta-config-form-label">{t("carta.fieldNombre")}</span>
              <input
                ref={nombreInputRef}
                className={drawerInputProminentClass}
                value={quickCreate.draft.nombre}
                onChange={(e) => quickCreate.setNombre(e.target.value)}
                autoComplete="off"
              />
            </label>

            <CategoriaCartaFormField
              t={t}
              categorias={quickCreate.categoriasForForm}
              selectedId={quickCreate.draft.categoriaCartaId}
              onSelectId={quickCreate.selectCategory}
              onOpenAddCategory={onOpenAddCategory ?? (() => undefined)}
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
              />
            </label>
          </section>

          {quickCreate.error ? (
            <div
              className="hostly-carta-config-alert hostly-carta-config-alert--error hostly-product-form-drawer__inline-error"
              role="alert"
            >
              {quickCreate.error}
            </div>
          ) : null}
        </div>

        <div className="hostly-product-form-drawer__footer">
          <ConfigBtnPrimary
            type="button"
            className="hostly-product-form-drawer__footer-primary"
            disabled={quickCreate.saving}
            onClick={() => void handleSubmit()}
          >
            {quickCreate.saving ? t("common.preparing") : t("common.save")}
          </ConfigBtnPrimary>
          <ConfigBtnSecondary type="button" onClick={onClose}>
            {t("common.cancel")}
          </ConfigBtnSecondary>
        </div>
      </aside>
    </div>
  );
}
