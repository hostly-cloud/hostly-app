import type {
  VentasSelectorsKpis,
  VentasZonaMasVentas,
} from "@/components/analysis/hooks/useVentasSelectors";

export type VentasKpiBlockData = VentasSelectorsKpis & {
  zonaMasVentas?: VentasZonaMasVentas;
};

export type VentasKpiBlockProps = {
  data: VentasKpiBlockData;
};

export function VentasKpiBlock({ data }: VentasKpiBlockProps) {
  const { totalVentas, totalTickets, ticketMedio, zonaMasVentas } = data;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      <div className="hostly-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Ventas totales</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{totalVentas.toFixed(2)} €</div>
      </div>

      <div className="hostly-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Total tickets</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{totalTickets}</div>
      </div>

      <div className="hostly-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Ticket medio</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{ticketMedio.toFixed(2)} €</div>
      </div>

      <div className="hostly-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Zona top</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          {zonaMasVentas?.zoneName ?? "—"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {zonaMasVentas
            ? `${zonaMasVentas.total.toFixed(2)} €`
            : "Sin datos"}
        </div>
      </div>
    </div>
  );
}
