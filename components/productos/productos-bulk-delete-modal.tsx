"use client";

import type { TranslateFn } from "@/lib/i18n";

export type ProductosBulkDeleteModalProps = {
  open: boolean;
  count: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: TranslateFn;
};

export function ProductosBulkDeleteModal({
  open,
  count,
  saving,
  onClose,
  onConfirm,
  t,
}: ProductosBulkDeleteModalProps) {
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
        aria-labelledby="productos-bulk-delete-title"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="productos-bulk-delete-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          {t("productos.bulkDeleteTitle", { count: String(count) })}
        </h2>
        <p className="hostly-productos-bulk-course-modal__hint">
          {t("productos.bulkDeleteHintNoDeps")}
        </p>
        <p className="hostly-productos-bulk-course-modal__hint hostly-productos-bulk-course-modal__hint--sub">
          {t("productos.bulkDeleteHintWithDeps")}
        </p>
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
            className="hostly-button-danger hostly-button-compact"
            disabled={saving || count < 1}
            onClick={onConfirm}
          >
            {saving ? t("common.saving") : t("productos.bulkDeleteConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
