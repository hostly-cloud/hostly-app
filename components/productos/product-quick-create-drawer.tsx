"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { ConfigBtnPrimary, ConfigBtnSecondary } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import type {
  ProductQuickCreateSubmitMode,
  UseProductQuickCreateResult,
} from "@/components/productos/use-product-quick-create";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { ProductQuickCreateDraft } from "@/lib/productos/product-category-inheritance";
import type { ProductQuickCreateInheritedDraft } from "@/lib/productos/product-category-inheritance";

const drawerInputClass =
  "hostly-input hostly-carta-config-field-input hostly-product-quick-create-v3__input";

const quickCreateMobileStyles = `
@media (max-width: 767px) {
  .hostly-product-quick-create-v3-backdrop {
    align-items: flex-end !important;
    padding: 0 !important;
    background: rgba(15, 39, 68, 0.28) !important;
  }

  .hostly-product-quick-create-v3 {
    width: 100vw !important;
    max-width: none !important;
    max-height: min(86dvh, 620px) !important;
    border-radius: 18px 18px 0 0 !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-bottom: 0 !important;
    box-shadow: 0 -14px 36px rgba(15, 23, 42, 0.12) !important;
  }

  .hostly-product-quick-create-v3__header {
    min-height: 48px !important;
    padding: 8px 10px 6px !important;
    border-bottom-color: rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
  }

  .hostly-product-quick-create-v3__header-main {
    gap: 6px !important;
    min-width: 0;
  }

  .hostly-product-quick-create-v3__title {
    font-size: 17px !important;
    line-height: 1.15 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-product-quick-create-v3__flash {
    min-height: 22px !important;
    padding: 3px 6px !important;
    border-radius: 7px !important;
    font-size: 9.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-quick-create-v3__close {
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    border-radius: 9px !important;
    font-size: 22px !important;
    line-height: 1 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-product-quick-create-v3__form {
    min-height: 0 !important;
    overflow: auto !important;
    -webkit-overflow-scrolling: touch;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-quick-create-v3__fields {
    flex: 0 0 auto !important;
    gap: 8px !important;
    padding: 9px 10px 8px !important;
    overflow: visible !important;
  }

  .hostly-product-quick-create-v3__field {
    gap: 4px !important;
  }

  .hostly-product-quick-create-v3__label {
    font-size: 10px !important;
    line-height: 1.1 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-product-quick-create-v3__label--hero {
    font-size: 10.5px !important;
    color: var(--hostly-ink-strong) !important;
  }

  .hostly-product-quick-create-v3__input,
  .hostly-product-quick-create-v3__category-select {
    min-height: 42px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    font-size: 13px !important;
    line-height: 1.2 !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-product-quick-create-v3__input--hero {
    min-height: 46px !important;
    padding: 9px 11px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    letter-spacing: -0.012em !important;
  }

  .hostly-product-quick-create-v3__input--price {
    font-size: 14px !important;
    font-weight: 720 !important;
  }

  .hostly-product-quick-create-v3__category-row {
    gap: 5px !important;
  }

  .hostly-product-quick-create-v3__category-add {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
    min-height: 42px !important;
    border-radius: 10px !important;
    font-size: 18px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-product-quick-create-v3__error {
    padding: 7px 9px !important;
    border-radius: 9px !important;
    font-size: 10px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-quick-create-v3__footer {
    gap: 6px !important;
    padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important;
    border-top-color: rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-product-quick-create-v3__actions {
    display: grid !important;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) !important;
    gap: 6px !important;
  }

  .hostly-product-quick-create-v3__actions > button {
    min-height: 44px !important;
    padding: 7px 9px !important;
    border-radius: 11px !important;
    font-size: 11px !important;
    line-height: 1.12 !important;
  }

  .hostly-product-quick-create-v3__save {
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-product-quick-create-v3__more-options {
    align-self: center !important;
    min-height: 34px !important;
    padding: 5px 9px !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--hostly-ink-muted) !important;
    font-size: 10.5px !important;
    font-weight: 650 !important;
    line-height: 1.1 !important;
  }

  .hostly-productos-bulk-course-modal-backdrop:has(#hostly-product-quick-create-discard-title) {
    padding: 12px !important;
  }

  .hostly-productos-bulk-course-modal:has(#hostly-product-quick-create-discard-title) {
    width: min(100%, 360px) !important;
    padding: 14px !important;
    border-radius: 12px !important;
  }
}
`;

function ProductQuickCreateDiscardConfirm({
  open,
  saving,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  saving: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  const discardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    keepEditingRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onKeepEditing();
        return;
      }
      if (event.key !== "Tab") return;

      const keepEditing = keepEditingRef.current;
      const discard = discardRef.current;
      if (!keepEditing || !discard) return;

      const focusables = [keepEditing, discard];
      const active = document.activeElement;
      const currentIndex = focusables.indexOf(active as HTMLButtonElement);

      if (currentIndex === -1) {
        event.preventDefault();
        keepEditing.focus();
        return;
      }

      event.preventDefault();
      const nextIndex = event.shiftKey
        ? currentIndex === 0
          ? focusables.length - 1
          : currentIndex - 1
        : currentIndex === focusables.length - 1
          ? 0
          : currentIndex + 1;
      focusables[nextIndex]?.focus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onKeepEditing]);

  if (!open) return null;

  return (
    <div
      className="hostly-productos-bulk-course-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onKeepEditing();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hostly-product-quick-create-discard-title"
        aria-describedby="hostly-product-quick-create-discard-message"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2
          id="hostly-product-quick-create-discard-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          ¿Descartar producto?
        </h2>
        <p
          id="hostly-product-quick-create-discard-message"
          className="hostly-productos-bulk-course-modal__hint"
        >
          Perderás los cambios que todavía no has guardado.
        </p>
        <div className="hostly-productos-bulk-course-modal__actions">
          <button
            ref={keepEditingRef}
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            disabled={saving}
            onClick={onKeepEditing}
          >
            Seguir editando
          </button>
          <button
            ref={discardRef}
            type="button"
            className="hostly-button-danger hostly-button-compact"
            disabled={saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const submitInFlightRef = useRef(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<ProductQuickCreateSubmitMode | null>(null);

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

  const dismissDiscardConfirm = useCallback(() => {
    setDiscardConfirmOpen(false);
    focusNombre(false);
  }, [focusNombre]);

  const requestClose = useCallback(() => {
    if (addCategoryOpen || quickCreate.saving || submittingMode !== null) return;
    if (quickCreate.hasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [addCategoryOpen, onClose, quickCreate.hasUnsavedChanges, quickCreate.saving, submittingMode]);

  const confirmDiscard = useCallback(() => {
    setDiscardConfirmOpen(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setDiscardConfirmOpen(false);
      setSubmittingMode(null);
      return;
    }
    quickCreate.syncBaseline();
    focusNombre(false);
  }, [open, quickCreate.syncBaseline, focusNombre]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (addCategoryOpen || discardConfirmOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose, addCategoryOpen, discardConfirmOpen]);

  if (!open) return null;

  const isSubmitting = quickCreate.saving || submittingMode !== null;
  const closeButtonBusy = submittingMode === "close" && quickCreate.saving;
  const continueButtonBusy = submittingMode === "continue" && quickCreate.saving;

  const handleSubmit = async (mode: ProductQuickCreateSubmitMode) => {
    if (submitInFlightRef.current) return;
    if (!quickCreate.canSubmit) return;

    submitInFlightRef.current = true;
    setSubmittingMode(mode);

    let clearSubmittingMode = true;
    try {
      const result = await quickCreate.submitQuickCreate(mode);
      if (!result) return;

      onCreated?.(result.productId);
      if (mode === "close") {
        onClose();
        clearSubmittingMode = false;
        return;
      }
      focusNombre(true);
    } finally {
      submitInFlightRef.current = false;
      if (clearSubmittingMode) {
        setSubmittingMode(null);
      }
    }
  };

  return (
    <>
    <style>{quickCreateMobileStyles}</style>
    <div
      className={`hostly-product-quick-create-v3-backdrop${addCategoryOpen ? " hostly-product-quick-create-v3-backdrop--blocked" : ""}${discardConfirmOpen ? " hostly-product-quick-create-v3-backdrop--blocked" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("carta.newProduct")}
      data-hostly-product-quick-create=""
      onMouseDown={(e) => {
        if (addCategoryOpen || discardConfirmOpen) return;
        if (e.currentTarget === e.target) requestClose();
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
            onClick={requestClose}
            aria-label={t("common.cancel")}
          >
            ×
          </button>
        </header>

        <form
          className="hostly-product-quick-create-v3__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (quickCreate.canSubmit && !isSubmitting) {
              void handleSubmit("close");
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
                disabled={isSubmitting}
              />
            </label>

            <div className="hostly-product-quick-create-v3__field">
              <span className="hostly-product-quick-create-v3__label">{t("carta.fieldCategoria")}</span>
              <div className="hostly-product-quick-create-v3__category-row">
                <select
                  className={`${drawerInputClass} hostly-product-quick-create-v3__category-select`}
                  value={quickCreate.draft.categoriaCartaId ?? ""}
                  disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                disabled={isSubmitting}
              />
            </label>

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
                className="hostly-product-quick-create-v3__save-close"
                disabled={isSubmitting || !quickCreate.canSubmit}
                aria-busy={closeButtonBusy || undefined}
              >
                {closeButtonBusy ? "Guardando…" : "Guardar"}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary
                type="button"
                className="hostly-product-quick-create-v3__save"
                disabled={isSubmitting || !quickCreate.canSubmit}
                aria-busy={continueButtonBusy || undefined}
                onClick={() => void handleSubmit("continue")}
              >
                {continueButtonBusy ? "Guardando…" : "Guardar y crear otro"}
              </ConfigBtnSecondary>
            </div>
            {onOpenAdvancedConfig ? (
              <button
                type="button"
                className="hostly-product-quick-create-v3__more-options"
                disabled={isSubmitting}
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
    <ProductQuickCreateDiscardConfirm
      open={discardConfirmOpen}
      saving={quickCreate.saving}
      onKeepEditing={dismissDiscardConfirm}
      onDiscard={confirmDiscard}
    />
    </>
  );
}
