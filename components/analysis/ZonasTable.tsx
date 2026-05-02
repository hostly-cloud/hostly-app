import type { ZonasSelectorsTable } from "@/components/analysis/hooks/useZonasSelectors";

export type ZonasTableData = ZonasSelectorsTable;

type Props = {
  data: ZonasSelectorsTable;
};

export function ZonasTable({ data }: Props) {
  const { zoneMetricsLimited, zoneMetricsFiltered, columnasZonasTablaCount } = data;

  void zoneMetricsFiltered;
  void columnasZonasTablaCount;

  if (!Array.isArray(zoneMetricsLimited) || zoneMetricsLimited.length === 0) {
    return <p>Sin datos por zona</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Zona</th>
          <th>Reservas</th>
          <th>Ocupación</th>
          <th>Eficiencia</th>
          <th>Score</th>
        </tr>
      </thead>

      <tbody>
        {zoneMetricsLimited.map((z) => (
          <tr key={z.zoneName}>
            <td>{z.zoneName}</td>
            <td>{z.total}</td>
            <td>{Math.round(z.ocupacion * 100)}%</td>
            <td>{Math.round(z.eficiencia * 100)}%</td>
            <td>{(z.score * 100).toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
