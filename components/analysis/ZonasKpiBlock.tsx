import type { ZonasSelectorsKpis } from "@/components/analysis/hooks/useZonasSelectors";

export type ZonasKpiBlockData = ZonasSelectorsKpis;

type Props = {
  data: ZonasSelectorsKpis;
};

export function ZonasKpiBlock({ data }: Props) {
  const {
    totalZonas,
    mejorZona,
    peorZona,
    balanceOperativoZonas,
    confianzaZonas,
  } = data;

  return (
    <div>
      <p>Zonas activas: {totalZonas}</p>

      <p>
        Mejor:{" "}
        {mejorZona
          ? `${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
          : "N/A"}
      </p>

      <p>
        Peor:{" "}
        {peorZona
          ? `${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
          : "N/A"}
      </p>

      <p>Balance: {balanceOperativoZonas}</p>
      <p>Confianza: {confianzaZonas}</p>
    </div>
  );
}
