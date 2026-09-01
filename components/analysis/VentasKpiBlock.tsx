import type {
  VentasSelectorsKpis,
  VentasZonaMasVentas,
} from "@/components/analysis/hooks/useVentasSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";
import { formatCurrency } from "@/components/analysis/utils";

export type VentasKpiBlockData = VentasSelectorsKpis & {
  zonaMasVentas?: VentasZonaMasVentas;
};

export type VentasKpiBlockProps = {
  data: VentasKpiBlockData;
};

export function VentasKpiBlock({ data }: VentasKpiBlockProps) {
  const { totalVentas, totalTickets, ticketMedio, zonaMasVentas } = data;

  return (
    <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics">
      <HostlyKpiCard title="Ventas totales" value={formatCurrency(totalVentas)} />
      <HostlyKpiCard title="Cobros" value={totalTickets} />
      <HostlyKpiCard title="Cobro medio" value={formatCurrency(ticketMedio)} />
      <HostlyKpiCard
        title="Zona top"
        value={zonaMasVentas?.zoneName ?? "—"}
        helper={zonaMasVentas ? formatCurrency(zonaMasVentas.total) : "Sin datos"}
      />
    </div>
  );
}
