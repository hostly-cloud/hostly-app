"use client";

import { HostlyTableBulkBar } from "@/components/ui/hostly/data-table";
import type { TranslateFn } from "@/lib/i18n";
import { ProductosCompactBulkActionsMenu, type BulkMenuItem } from "./productos-config-carta-compact-controls";

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
