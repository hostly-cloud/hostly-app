"use client";

import { useMemo, useState } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { TranslateFn } from "@/lib/i18n";
import {
  BULK_SELECT_MIXED_VALUE,
  isBulkSelectMixedValue,
} from "./productos-bulk-initial-values";

const UNCATEGORIZED_VALUE = "";

export type ProductosBulkAssignCategoryModalProps = {
  open: boolean;
  count: number;
  saving: boolean;
  categorias: readonly CartaCategoria[];
  initialSelectValue: string;
  onClose: () => void;
  onConfirm: (categoryId: string | null, categoryName: string) => void;
  t: TranslateFn;
};

export function ProductosBulkAssignCategoryModal({
  ...props
}: ProductosBulkAssignCategoryModalProps) {
  if (!props.open) return null;
  return (
    <ProductosBulkAssignCategoryModalContent
      key={props.initialSelectValue}
      {...props}
    />
  );
}

function ProductosBulkAssignCategoryModalContent({
  open,
  count,
  saving,
  categorias,
  initialSelectValue,
  onClose,
  onConfirm,
  t,
}: ProductosBulkAssignCategoryModalProps) {
  const [categoryId, setCategoryId] = useState(initialSelectValue);

  const sorted = useMemo(
    () =>
      [...categorias].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [categorias],
  );

  if (!open) return null;

  const showMixedOption =
    isBulkSelectMixedValue(initialSelectValue) || isBulkSelectMixedValue(categoryId);

  return (
    <div
      className="hostly-productos-bulk-course-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="productos-bulk-assign-category-title"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="productos-bulk-assign-category-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          {t("productos.bulkAssignCategoryTitle")}
        </h2>
        <p className="hostly-productos-bulk-course-modal__hint">
          {t("productos.bulkAssignCategoryHint", { count: String(count) })}
        </p>
        <label
          className="hostly-productos-bulk-course-modal__label"
          htmlFor="productos-bulk-assign-category-select"
        >
          {t("productos.bulkAssignCategorySelectLabel")}
        </label>
        <select
          id="productos-bulk-assign-category-select"
          className="hostly-productos-bulk-course-modal__select"
          value={categoryId}
          disabled={saving}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {showMixedOption ? (
            <option value={BULK_SELECT_MIXED_VALUE}>{t("productos.bulkEditMixedValues")}</option>
          ) : null}
          <option value={UNCATEGORIZED_VALUE}>
            {t("cartaCategories.selectNone")}
          </option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.isActive ? ` (${t("cartaCategories.inactiveShort")})` : ""}
            </option>
          ))}
        </select>
        <div className="hostly-productos-bulk-course-modal__actions">
          <HostlyButton
            variant="secondary"
            size="compact"
            disabled={saving}
            onClick={onClose}
          >
            {t("common.cancel")}
          </HostlyButton>
          <HostlyButton
            variant="primary"
            size="compact"
            disabled={saving || count < 1 || isBulkSelectMixedValue(categoryId)}
            onClick={() => {
              if (categoryId === UNCATEGORIZED_VALUE) {
                onConfirm(null, "");
                return;
              }
              const cat = sorted.find((c) => c.id === categoryId);
              if (!cat) return;
              onConfirm(cat.id, cat.name);
            }}
          >
            {saving ? t("common.saving") : t("productos.bulkAssignCategoryApply")}
          </HostlyButton>
        </div>
      </div>
    </div>
  );
}
