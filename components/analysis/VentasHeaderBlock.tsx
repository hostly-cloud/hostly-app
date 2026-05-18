export type VentasHeaderBlockProps = {
  title?: string;
  subtitle?: string;
};

export function VentasHeaderBlock({ title = "Ventas", subtitle }: VentasHeaderBlockProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)", letterSpacing: "-0.02em" }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--hostly-ink-muted)", opacity: 0.78 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}
