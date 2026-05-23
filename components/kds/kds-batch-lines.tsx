"use client";

import type { KdsVisualBatchLine } from "@/lib/kds/kds-batch-group";

export function KdsVisualBatchSummary({
  batches,
  collapsed,
  onToggle,
}: {
  batches: readonly KdsVisualBatchLine[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (batches.length === 0) return null;

  return (
    <button
      type="button"
      className={`hostly-kds-batch-summary${collapsed ? " is-collapsed" : ""}`}
      onClick={onToggle}
    >
      <span className="hostly-kds-batch-summary-label">
        {collapsed ? "Ver detalle" : "Resumen batch"}
      </span>
      <div className="hostly-kds-batch-summary-lines">
        {batches.map((batch) => (
          <span key={batch.key} className="hostly-kds-batch-summary-item">
            {batch.displayLabel}
          </span>
        ))}
      </div>
    </button>
  );
}
