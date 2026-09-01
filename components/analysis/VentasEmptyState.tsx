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

export type VentasEmptyStateProps = {
  placeholder?: string;
  role?: "status" | "alert";
};

export function VentasEmptyState({ placeholder, role }: VentasEmptyStateProps) {
  return (
    <div style={placeholderStyle} role={role} aria-live={role === "status" ? "polite" : undefined}>
      {placeholder}
    </div>
  );
}
