"use client";

import { useEffect, useState } from "react";
import type { BulkCatalogKdsDestination } from "@/lib/firestore/central-catalog-write";
import type { TranslateFn } from "@/lib/i18n";

const DESTINATION_OPTIONS: ReadonlyArray<{
  value: BulkCatalogKdsDestination;
  labelKey: string;
}> = [
  { value: "kitchen", labelKey: "productos.bulkAssignDestinationKitchen" },
  { value: "bar", labelKey: "productos.bulkAssignDestinationBar" },
  { value: "cocktail", labelKey: "productos.bulkAssignDestinationCocktail" },
];

export type ProductosBulkAssignDestinationModalProps = {
  open: boolean;
  count: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (destination: BulkCatalogKdsDestination) => void;
  t: TranslateFn;
};

export function ProductosBulkAssignDestinationModal({
  open,
  count,
  saving,
  onClose,
  onConfirm,
  t,
}: ProductosBulkAssignDestinationModalProps) {
  const [destination, setDestination] = useState<BulkCatalogKdsDestination>("kitchen");

  useEffect(() => {
    if (open) setDestination("kitchen");
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
        aria-labelledby="productos-bulk-assign-destination-title"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="productos-bulk-assign-destination-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          {t("productos.bulkAssignDestinationTitle")}
        </h2>
        <p className="hostly-productos-bulk-course-modal__hint">
          {t("productos.bulkAssignDestinationHint", { count: String(count) })}
        </p>
        <p className="hostly-productos-bulk-course-modal__hint hostly-productos-bulk-course-modal__hint--sub">
          {t("productos.bulkAssignDestinationPostresNote")}
        </p>
        <label
          className="hostly-productos-bulk-course-modal__label"
          htmlFor="productos-bulk-assign-destination-select"
        >
          {t("productos.bulkAssignDestinationSelectLabel")}
        </label>
        <select
          id="productos-bulk-assign-destination-select"
          className="hostly-productos-bulk-course-modal__select"
          value={destination}
          disabled={saving}
          onChange={(e) =>
            setDestination(e.target.value as BulkCatalogKdsDestination)
          }
        >
          {DESTINATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
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
            disabled={saving || count < 1}
            onClick={() => onConfirm(destination)}
          >
            {saving ? t("common.saving") : t("productos.bulkAssignDestinationApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
