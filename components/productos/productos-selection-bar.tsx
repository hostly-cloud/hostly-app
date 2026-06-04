"use client";

import { HostlyTableBulkBar } from "@/components/ui/hostly/data-table";
import type { TranslateFn } from "@/lib/i18n";

export type ProductosSelectionBarProps = {
  count: number;
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

export function ProductosSelectionBar({
  count,
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
