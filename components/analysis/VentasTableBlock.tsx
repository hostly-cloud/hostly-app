import type { VentasSelectorsTable } from "@/components/analysis/hooks/useVentasSelectors";

export type VentasTableBlockProps = {
  data: VentasSelectorsTable;
};

export function VentasTableBlock({ data }: VentasTableBlockProps) {
  if (data.rows.length === 0) {
    return null;
  }

  return (
    <div className="hostly-panel p-4">
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--hostly-ink-strong)",
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        Últimos tickets
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                color: "var(--hostly-ink-muted)",
                fontWeight: 800,
                borderBottom: "1px solid var(--hostly-line)",
              }}
            >
              Fecha
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                color: "var(--hostly-ink-muted)",
                fontWeight: 800,
                borderBottom: "1px solid var(--hostly-line)",
              }}
            >
              Pedido
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                color: "var(--hostly-ink-muted)",
                fontWeight: 800,
                borderBottom: "1px solid var(--hostly-line)",
              }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={`${row.label}:${row.shortId ?? ""}:${i}`}>
              <td style={{ padding: "8px 10px", color: "var(--hostly-ink-strong)", fontWeight: 600 }}>{row.label}</td>
              <td style={{ padding: "8px 10px", color: "var(--hostly-ink-strong)", fontWeight: 600 }}>
                {row.shortId ?? "—"}
              </td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--hostly-ink)", fontWeight: 600 }}>
                {row.total.toFixed(2)} €
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
