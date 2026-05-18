"use client";

import type { CSSProperties } from "react";

const placeholderStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  borderRadius: 14,
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-muted)",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "center",
  lineHeight: 1.5,
};

export type ProductosAnalyticsSectionProps = {
  placeholder: string;
};

export function ProductosAnalyticsSection({ placeholder }: ProductosAnalyticsSectionProps) {
  return <div style={placeholderStyle}>{placeholder}</div>;
}
