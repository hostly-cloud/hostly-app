import type { VentasSelectorsTable } from "@/components/analysis/hooks/useVentasSelectors";
import { formatCurrency } from "@/components/analysis/utils";

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
        Últimos cobros
      </div>
      <table className="hostly-inv-native-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Ticket</th>
            <th className="hostly-inv-th-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={`${row.label}:${row.shortId ?? ""}:${i}`}>
              <td className="hostly-inv-td-muted">{row.label}</td>
              <td className="hostly-inv-td-primary">{row.shortId ?? "Sin número"}</td>
              <td className="hostly-inv-td-amount">{formatCurrency(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
