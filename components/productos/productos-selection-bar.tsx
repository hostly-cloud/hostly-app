"use client";

import { HostlyTableBulkBar } from "@/components/ui/hostly/data-table";
import type { TranslateFn } from "@/lib/i18n";
import { ProductosCompactBulkActionsMenu, type BulkMenuItem } from "./productos-config-carta-compact-controls";

const productosSelectionMobileStyles = `
@media (max-width: 767px) {
  .hostly-data-table-bulk-bar--compact-config {
    position: sticky !important;
    bottom: max(8px, env(safe-area-inset-bottom)) !important;
    z-index: 18 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 6px 8px 8px !important;
    padding: 7px 8px !important;
    border: 1px solid rgba(49, 95, 125, 0.16) !important;
    border-radius: 12px !important;
    background: rgba(255, 255, 255, 0.97) !important;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.09) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow: visible !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-data-table-bulk-bar__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px !important;
    font-weight: 760 !important;
    line-height: 1.1 !important;
    color: var(--hostly-ink-strong) !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-data-table-bulk-bar__actions--compact {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 4px !important;
    min-width: 0;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu {
    position: relative;
    flex: 0 0 auto;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__trigger {
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1.1 !important;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__caret {
    margin-left: 3px !important;
    font-size: 8px !important;
    opacity: 0.58;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__panel {
    position: absolute !important;
    top: auto !important;
    right: 0 !important;
    bottom: calc(100% + 7px) !important;
    width: min(78vw, 260px) !important;
    min-width: 210px !important;
    max-height: min(58dvh, 360px) !important;
    overflow-y: auto !important;
    padding: 5px !important;
    border: 1px solid rgba(148, 163, 184, 0.17) !important;
    border-radius: 11px !important;
    background: rgba(255, 255, 255, 0.99) !important;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14) !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__item {
    width: 100%;
    min-height: 40px !important;
    padding: 7px 9px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    line-height: 1.15 !important;
    text-align: left !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__item--danger {
    margin-top: 5px !important;
    padding-top: 8px !important;
    border-top: 1px solid rgba(185, 28, 28, 0.12) !important;
    background: transparent !important;
    color: #b42318 !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-productos-bulk-actions-menu__item:disabled {
    opacity: 0.42 !important;
  }

  .hostly-data-table-bulk-bar--compact-config .hostly-data-table-bulk-bar__btn--clear {
    min-height: 36px !important;
    padding: 6px 8px !important;
    border-radius: 9px !important;
    border-color: transparent !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--hostly-ink-muted) !important;
    font-size: 10px !important;
    font-weight: 620 !important;
    line-height: 1.1 !important;
    white-space: nowrap;
  }
}
`;

export type ProductosSelectionBarProps = {
  count: number;
  /** Barra compacta con menú Acciones (Config → Carta → Productos). */
  variant?: "default" | "compact";
  onClear: () => void;
  onAssignPass?: () => void;
  assignPassDisabled?: boolean;
  assignPassDisabledTitle?: string;
  onAssignDestination?: () => void;
  assignDestinationDisabled?: boolean;
  assignDestinationDisabledTitle?: string;
  onAssignCategory?: () => void;
  assignCategoryDisabled?: boolean;
  assignCategoryDisabledTitle?: string;
  onAssignFamily?: () => void;
  assignFamilyDisabled?: boolean;
  assignFamilyDisabledTitle?: string;
  onBulkDelete?: () => void;
  bulkDeleteDisabled?: boolean;
  bulkDeleteDisabledTitle?: string;
  t: TranslateFn;
};

function isBulkMenuItem(item: BulkMenuItem | null): item is BulkMenuItem {
  return item !== null;
}

export function ProductosSelectionBar({
  count,
  variant = "default",
  onClear,
  onAssignPass,
  assignPassDisabled = false,
  assignPassDisabledTitle,
  onAssignDestination,
  assignDestinationDisabled = false,
  assignDestinationDisabledTitle,
  onAssignCategory,
  assignCategoryDisabled = false,
  assignCategoryDisabledTitle,
  onAssignFamily,
  assignFamilyDisabled = false,
  assignFamilyDisabledTitle,
  onBulkDelete,
  bulkDeleteDisabled = false,
  bulkDeleteDisabledTitle,
  t,
}: ProductosSelectionBarProps) {
  if (count <= 0) return null;

  if (variant === "compact") {
    const compactMenuCandidates: (BulkMenuItem | null)[] = [
      onAssignCategory
        ? {
            key: "category",
            label: t("productos.bulkAssignCategory"),
            onClick: onAssignCategory,
            disabled: assignCategoryDisabled,
            disabledTitle: assignCategoryDisabledTitle,
          }
        : null,
      onAssignFamily
        ? {
            key: "family",
            label: t("productos.bulkAssignFamily"),
            onClick: onAssignFamily,
            disabled: assignFamilyDisabled,
            disabledTitle: assignFamilyDisabledTitle,
          }
        : null,
      onAssignPass
        ? {
            key: "pass",
            label: t("productos.bulkAssignPass"),
            onClick: onAssignPass,
            disabled: assignPassDisabled,
            disabledTitle: assignPassDisabledTitle,
          }
        : null,
      onAssignDestination
        ? {
            key: "destination",
            label: t("productos.bulkAssignDestination"),
            onClick: onAssignDestination,
            disabled: assignDestinationDisabled,
            disabledTitle: assignDestinationDisabledTitle,
          }
        : null,
      onBulkDelete
        ? {
            key: "delete",
            label: t("productos.bulkDelete"),
            onClick: onBulkDelete,
            disabled: bulkDeleteDisabled,
            disabledTitle: bulkDeleteDisabledTitle,
            tone: "danger",
          }
        : null,
    ];
    const menuItems = compactMenuCandidates.filter(isBulkMenuItem);

    return (
      <>
        <style>{productosSelectionMobileStyles}</style>
        <HostlyTableBulkBar className="hostly-data-table-bulk-bar--compact-config">
          <span className="hostly-data-table-bulk-bar__label">
            {t("productos.selectedProductsCount", { count: String(count) })}
          </span>
          <div className="hostly-data-table-bulk-bar__actions hostly-data-table-bulk-bar__actions--compact">
            <ProductosCompactBulkActionsMenu items={menuItems} />
            <button
              type="button"
              className="hostly-button-ghost hostly-button-compact hostly-data-table-bulk-bar__btn hostly-data-table-bulk-bar__btn--clear"
              onClick={onClear}
            >
              {t("productos.clearSelection")}
            </button>
          </div>
        </HostlyTableBulkBar>
      </>
    );
  }

  return (
    <HostlyTableBulkBar>
      <span className="hostly-data-table-bulk-bar__label">
        {t("productos.selectedProductsCount", { count: String(count) })}
      </span>
      <div className="hostly-data-table-bulk-bar__actions">
        {onAssignPass ? (
          <button
            type="button"
            className="hostly-button-primary hostly-button-compact hostly-data-table-bulk-bar__btn"
            disabled={assignPassDisabled}
            title={assignPassDisabled ? assignPassDisabledTitle : undefined}
            onClick={onAssignPass}
          >
            {t("productos.bulkAssignPass")}
          </button>
        ) : null}
        {onAssignDestination ? (
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
            disabled={assignDestinationDisabled}
            title={
              assignDestinationDisabled ? assignDestinationDisabledTitle : undefined
            }
            onClick={onAssignDestination}
          >
            {t("productos.bulkAssignDestination")}
          </button>
        ) : null}
        {onAssignCategory ? (
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
            disabled={assignCategoryDisabled}
            title={
              assignCategoryDisabled ? assignCategoryDisabledTitle : undefined
            }
            onClick={onAssignCategory}
          >
            {t("productos.bulkAssignCategory")}
          </button>
        ) : null}
        {onAssignFamily ? (
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
            disabled={assignFamilyDisabled}
            title={assignFamilyDisabled ? assignFamilyDisabledTitle : undefined}
            onClick={onAssignFamily}
          >
            {t("productos.bulkAssignFamily")}
          </button>
        ) : null}
        {onBulkDelete ? (
          <button
            type="button"
            className="hostly-button-danger hostly-button-compact hostly-data-table-bulk-bar__btn"
            disabled={bulkDeleteDisabled}
            title={bulkDeleteDisabled ? bulkDeleteDisabledTitle : undefined}
            onClick={onBulkDelete}
          >
            {t("productos.bulkDelete")}
          </button>
        ) : null}
        <button
          type="button"
          className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
          onClick={onClear}
        >
          {t("productos.clearSelection")}
        </button>
      </div>
    </HostlyTableBulkBar>
  );
}
