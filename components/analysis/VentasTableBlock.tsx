import type { VentasSelectorsTable } from "@/components/analysis/hooks/useVentasSelectors";

export type VentasTableBlockProps = {
  data: VentasSelectorsTable;
};

export function VentasTableBlock({ data }: VentasTableBlockProps) {
  if (data.rows.length === 0) {
    return null;
  }

  return (
    <div
      className="hostly-card"
      style={{
        padding: 14,
        borderRadius: "var(--hostly-radius-md)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(15, 23, 42, 0.55)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#e2e8f0",
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
                color: "#94a3b8",
                fontWeight: 800,
                borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
              }}
            >
              Fecha
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                color: "#94a3b8",
                fontWeight: 800,
                borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
              }}
            >
              Pedido
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                color: "#94a3b8",
                fontWeight: 800,
                borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
              }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={`${row.label}:${row.shortId ?? ""}:${i}`}>
              <td style={{ padding: "8px 10px", color: "#e2e8f0", fontWeight: 600 }}>{row.label}</td>
              <td style={{ padding: "8px 10px", color: "#e2e8f0", fontWeight: 600 }}>
                {row.shortId ?? "—"}
              </td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "#cbd5e1", fontWeight: 600 }}>
                {row.total.toFixed(2)} €
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
