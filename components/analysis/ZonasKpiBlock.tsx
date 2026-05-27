import type { ZonasSelectorsKpis } from "@/components/analysis/hooks/useZonasSelectors";
import { HostlyKpiCard } from "@/components/ui/hostly";

export type ZonasKpiBlockData = ZonasSelectorsKpis;

type Props = {
  data: ZonasSelectorsKpis;
};

export function ZonasKpiBlock({ data }: Props) {
  const { totalZonas, mejorZona, peorZona, balanceOperativoZonas, confianzaZonas } = data;

  return (
    <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics">
      <HostlyKpiCard title="Zonas activas" value={totalZonas} />
      <HostlyKpiCard
        title="Mejor zona"
        value={mejorZona ? mejorZona.zoneName : "N/A"}
        helper={mejorZona ? `${Math.round(mejorZona.ocupacion * 100)}% ocupación` : undefined}
      />
      <HostlyKpiCard
        title="Peor zona"
        value={peorZona ? peorZona.zoneName : "N/A"}
        helper={peorZona ? `${Math.round(peorZona.ocupacion * 100)}% ocupación` : undefined}
      />
      <HostlyKpiCard title="Balance" value={balanceOperativoZonas} variant="soft" />
      <HostlyKpiCard title="Confianza" value={confianzaZonas} variant="soft" />
    </div>
  );
}
