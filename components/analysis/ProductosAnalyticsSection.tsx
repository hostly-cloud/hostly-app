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
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#94a3b8",
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
