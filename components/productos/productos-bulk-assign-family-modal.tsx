"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORY_PRODUCT_FAMILY_NONE } from "@/lib/carta/category-product-family";
import {
  PRODUCT_FAMILY_TYPE_LABELS,
  sortProductFamilies,
  type ProductFamilyDocument,
} from "@/lib/carta/product-family-types";
import type { TranslateFn } from "@/lib/i18n";

export type ProductosBulkAssignFamilyModalProps = {
  open: boolean;
  count: number;
  saving: boolean;
  families: readonly ProductFamilyDocument[];
  onClose: () => void;
  onConfirm: (familyId: string | null) => void;
  t: TranslateFn;
};

export function ProductosBulkAssignFamilyModal({
  open,
  count,
  saving,
  families,
  onClose,
  onConfirm,
  t,
}: ProductosBulkAssignFamilyModalProps) {
  const [familyId, setFamilyId] = useState(CATEGORY_PRODUCT_FAMILY_NONE);

  const sorted = useMemo(() => sortProductFamilies([...families]), [families]);

  useEffect(() => {
    if (open) setFamilyId(CATEGORY_PRODUCT_FAMILY_NONE);
  }, [open]);

  if (!open) return null;

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
        aria-labelledby="productos-bulk-assign-family-title"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="productos-bulk-assign-family-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          {t("productos.bulkAssignFamilyTitle")}
        </h2>
        <p className="hostly-productos-bulk-course-modal__hint">
          {t("productos.bulkAssignFamilyHint", { count: String(count) })}
        </p>
        <label
          className="hostly-productos-bulk-course-modal__label"
          htmlFor="productos-bulk-assign-family-select"
        >
          {t("productos.bulkAssignFamilySelectLabel")}
        </label>
        <select
          id="productos-bulk-assign-family-select"
          className="hostly-productos-bulk-course-modal__select"
          value={familyId}
          disabled={saving}
          onChange={(e) => setFamilyId(e.target.value)}
        >
          <option value={CATEGORY_PRODUCT_FAMILY_NONE}>
            {t("modifiersMvp.noFamilyShort")}
          </option>
          {sorted.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({PRODUCT_FAMILY_TYPE_LABELS[f.type]})
              {!f.active ? ` (${t("cartaCategories.inactiveShort")})` : ""}
            </option>
          ))}
        </select>
        <div className="hostly-productos-bulk-course-modal__actions">
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            disabled={saving}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="hostly-button-primary hostly-button-compact"
            disabled={saving || count < 1}
            onClick={() => {
              if (familyId === CATEGORY_PRODUCT_FAMILY_NONE) {
                onConfirm(null);
                return;
              }
              if (!sorted.some((f) => f.id === familyId)) return;
              onConfirm(familyId);
            }}
          >
            {saving ? t("common.saving") : t("productos.bulkAssignFamilyApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
