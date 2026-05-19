import type {
  VentasSelectorsKpis,
  VentasZonaMasVentas,
} from "@/components/analysis/hooks/useVentasSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";

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
      <HostlyKpiCard title="Ventas totales" value={`${totalVentas.toFixed(2)} €`} />
      <HostlyKpiCard title="Total tickets" value={totalTickets} />
      <HostlyKpiCard title="Ticket medio" value={`${ticketMedio.toFixed(2)} €`} />
      <HostlyKpiCard
        title="Zona top"
        value={zonaMasVentas?.zoneName ?? "—"}
        helper={zonaMasVentas ? `${zonaMasVentas.total.toFixed(2)} €` : "Sin datos"}
      />
    </div>
  );
}
