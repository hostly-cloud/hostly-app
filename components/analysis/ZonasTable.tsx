import type { ZonasSelectorsTable } from "@/components/analysis/hooks/useZonasSelectors";

export type ZonasTableData = ZonasSelectorsTable;

type Props = {
  data: ZonasSelectorsTable;
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ZonasTable({ data }: Props) {
  const { zoneMetricsLimited, zoneMetricsFiltered, columnasZonasTablaCount } = data;

  void zoneMetricsFiltered;
  void columnasZonasTablaCount;

  if (!Array.isArray(zoneMetricsLimited) || zoneMetricsLimited.length === 0) {
    return (
      <div className="hostly-mobile-empty-state py-6">
        <p className="hostly-mobile-empty-state__title">Sin zonas para mostrar</p>
        <p className="hostly-mobile-empty-state__desc">
          Ajusta los filtros o amplía el límite de resultados para recuperar zonas en la tabla.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full min-w-[620px] text-left text-sm">
      <thead className="border-b border-[var(--hostly-table-divider-soft)] bg-[var(--hostly-table-head-surface)] text-[10px] uppercase tracking-[0.045em] text-[var(--hostly-ink-muted)]">
        <tr>
          <th className="px-3 py-2.5 font-bold">Zona</th>
          <th className="px-3 py-2.5 text-right font-bold">Reservas</th>
          <th className="px-3 py-2.5 text-right font-bold">Ocupación</th>
          <th className="px-3 py-2.5 text-right font-bold">Eficiencia</th>
          <th className="px-3 py-2.5 text-right font-bold">Score</th>
        </tr>
      </thead>

      <tbody>
        {zoneMetricsLimited.map((z) => (
          <tr
            key={z.zoneName}
            className="border-b border-[var(--hostly-table-divider-faint)] last:border-b-0 hover:bg-[var(--hostly-ice-50)]/65"
          >
            <td className="px-3 py-3 font-semibold text-[var(--hostly-ink-strong)]">
              {z.zoneName}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-[var(--hostly-ink-muted)]">
              {z.total}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-[var(--hostly-ink-muted)]">
              {formatPercent(z.ocupacion)}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-[var(--hostly-ink-muted)]">
              {formatPercent(z.eficiencia)}
            </td>
            <td className="px-3 py-3 text-right">
              <span className="inline-flex min-w-14 justify-center rounded-full border border-[var(--hostly-line)] bg-[var(--hostly-ice-50)] px-2 py-1 text-xs font-bold tabular-nums text-[var(--hostly-navy-deep)]">
                {(z.score * 100).toFixed(1)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
