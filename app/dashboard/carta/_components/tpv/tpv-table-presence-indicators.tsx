"use client";

import type { CSSProperties } from "react";

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 6,
};

const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

export type TpvTablePresenceIndicatorsProps = {
  displayLabel: string | null;
  showConcurrentBadge: boolean;
};

export function TpvTablePresenceIndicators({
  displayLabel,
  showConcurrentBadge,
}: TpvTablePresenceIndicatorsProps) {
  if (!displayLabel && !showConcurrentBadge) return null;

  return (
    <div
      className="carta-comanda-presence-row"
      style={rowStyle}
      aria-live="polite"
      aria-atomic="true"
    >
      {displayLabel ? (
        <span
          style={{
            ...pillBase,
            color: "#315f7d",
            background: "rgba(219, 234, 254, 0.72)",
            border: "1px solid rgba(49, 95, 125, 0.18)",
          }}
        >
          {displayLabel}
        </span>
      ) : null}
      {showConcurrentBadge ? (
        <span
          style={{
            ...pillBase,
            color: "#92400e",
            background: "rgba(254, 243, 199, 0.88)",
            border: "1px solid rgba(245, 158, 11, 0.32)",
          }}
        >
          Edición concurrente
        </span>
      ) : null}
    </div>
  );
}
