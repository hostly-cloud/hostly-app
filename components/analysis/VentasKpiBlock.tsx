import type {
  VentasSelectorsKpis,
  VentasZonaMasVentas,
} from "@/components/analysis/hooks/useVentasSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";
import { formatCurrencyEs } from "@/components/analysis/formatCurrencyEs";
import { Banknote, CircleDollarSign, MapPinned, ReceiptText } from "lucide-react";

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
      <HostlyKpiCard
        title="Ventas totales"
        value={formatCurrencyEs(totalVentas)}
        icon={<Banknote size={17} />}
        className="hostly-analysis-kpi hostly-analysis-kpi--primary"
      />
      <HostlyKpiCard
        title="Cobros"
        value={totalTickets}
        icon={<ReceiptText size={17} />}
        className="hostly-analysis-kpi"
      />
      <HostlyKpiCard
        title="Cobro medio"
        value={formatCurrencyEs(ticketMedio)}
        icon={<CircleDollarSign size={17} />}
        className="hostly-analysis-kpi hostly-analysis-kpi--success"
      />
      <HostlyKpiCard
        title="Zona top"
        value={zonaMasVentas?.zoneName ?? "—"}
        helper={zonaMasVentas ? formatCurrencyEs(zonaMasVentas.total) : "Sin datos"}
        icon={<MapPinned size={17} />}
        className="hostly-analysis-kpi"
      />
    </div>
  );
}
