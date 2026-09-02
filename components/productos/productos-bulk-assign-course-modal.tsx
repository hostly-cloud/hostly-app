"use client";

import { useState } from "react";
import type { TranslateFn } from "@/lib/i18n";
import {
  BULK_SELECT_MIXED_VALUE,
  isBulkSelectMixedValue,
} from "./productos-bulk-initial-values";

const COURSE_SELECT_OPTIONS = [
  { value: "", labelKey: "productos.bulkAssignPassNone" },
  { value: "1", labelKey: "productos.bulkAssignPassEntrante" },
  { value: "2", labelKey: "productos.bulkAssignPassPrimero" },
  { value: "3", labelKey: "productos.bulkAssignPassSegundo" },
  { value: "4", labelKey: "productos.bulkAssignPassPostre" },
] as const;

export type ProductosBulkAssignCourseModalProps = {
  open: boolean;
  count: number;
  saving: boolean;
  initialSelectValue: string;
  onClose: () => void;
  onConfirm: (courseSelectValue: string) => void;
  t: TranslateFn;
};

export function ProductosBulkAssignCourseModal({
  ...props
}: ProductosBulkAssignCourseModalProps) {
  if (!props.open) return null;
  return (
    <ProductosBulkAssignCourseModalContent
      key={props.initialSelectValue}
      {...props}
    />
  );
}

function ProductosBulkAssignCourseModalContent({
  open,
  count,
  saving,
  initialSelectValue,
  onClose,
  onConfirm,
  t,
}: ProductosBulkAssignCourseModalProps) {
  const [courseValue, setCourseValue] = useState(initialSelectValue);

  if (!open) return null;

  const showMixedOption =
    isBulkSelectMixedValue(initialSelectValue) || isBulkSelectMixedValue(courseValue);

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
        aria-labelledby="productos-bulk-assign-course-title"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="productos-bulk-assign-course-title" className="hostly-productos-bulk-course-modal__title">
          {t("productos.bulkAssignPassTitle")}
        </h2>
        <p className="hostly-productos-bulk-course-modal__hint">
          {t("productos.bulkAssignPassHint", { count: String(count) })}
        </p>
        <label className="hostly-productos-bulk-course-modal__label" htmlFor="productos-bulk-assign-course-select">
          {t("productos.bulkAssignPassSelectLabel")}
        </label>
        <select
          id="productos-bulk-assign-course-select"
          className="hostly-productos-bulk-course-modal__select"
          value={courseValue}
          disabled={saving}
          onChange={(e) => setCourseValue(e.target.value)}
        >
          {showMixedOption ? (
            <option value={BULK_SELECT_MIXED_VALUE}>{t("productos.bulkEditMixedValues")}</option>
          ) : null}
          {COURSE_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value || "none"} value={opt.value}>
              {t(opt.labelKey)}
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
            disabled={saving || count < 1 || isBulkSelectMixedValue(courseValue)}
            onClick={() => onConfirm(courseValue)}
          >
            {saving ? t("common.saving") : t("productos.bulkAssignPassApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
