import type { ZonasSelectorsInsights } from "@/components/analysis/hooks/useZonasSelectors";

export type ZonasViewStateData = Pick<
  ZonasSelectorsInsights,
  | "totalZonasVisibles"
  | "totalZonasBase"
  | "ordenActivoLabel"
  | "columnasVisiblesZonas"
  | "totalColumnasZonas"
  | "estadoFiltrosZonas"
  | "modoVistaZonas"
  | "vistaDefaultZonas"
  | "densidadVistaZonas"
  | "cargaVistaZonas"
  | "nivelPersonalizacionZonas"
  | "complejidadVistaZonas"
  | "estadoExportacionZonas"
  | "legibilidadVistaZonas"
  | "recomendacionVistaZonas"
  | "idoneidadVistaZonas"
>;

type Props = {
  data: ZonasViewStateData;
};

type ViewStateItem = {
  label: string;
  value: string;
};

export function ZonasViewState({ data }: Props) {
  const {
    totalZonasVisibles,
    totalZonasBase,
    ordenActivoLabel,
    columnasVisiblesZonas,
    totalColumnasZonas,
    estadoFiltrosZonas,
    modoVistaZonas,
    vistaDefaultZonas,
    densidadVistaZonas,
    cargaVistaZonas,
    nivelPersonalizacionZonas,
    complejidadVistaZonas,
    estadoExportacionZonas,
    legibilidadVistaZonas,
    recomendacionVistaZonas,
    idoneidadVistaZonas,
  } = data;

  if (totalZonasBase === 0) return null;

  const summaryItems: ViewStateItem[] = [
    { label: "Zonas", value: `${totalZonasVisibles}/${totalZonasBase}` },
    { label: "Orden", value: ordenActivoLabel },
    { label: "Columnas", value: `${columnasVisiblesZonas}/${totalColumnasZonas}` },
    { label: "Filtros", value: estadoFiltrosZonas },
    { label: "Modo", value: modoVistaZonas },
    { label: "Vista", value: vistaDefaultZonas },
  ];

  const diagnosticItems: ViewStateItem[] = [
    { label: "Densidad", value: densidadVistaZonas },
    { label: "Carga", value: cargaVistaZonas },
    { label: "Personalización", value: nivelPersonalizacionZonas },
    { label: "Complejidad", value: complejidadVistaZonas },
    { label: "Exportación", value: estadoExportacionZonas },
    { label: "Legibilidad", value: legibilidadVistaZonas },
    { label: "Idoneidad", value: idoneidadVistaZonas },
  ];

  return (
    <section
      className="hostly-panel my-3 p-3 sm:p-4"
      aria-label="Estado de la vista por zonas"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hostly-section-label mb-1">Estado de la vista</p>
          <p className="m-0 text-xs leading-relaxed text-[var(--hostly-ink-muted)]">
            Resumen de filtros, densidad y configuración aplicada a este análisis.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-[var(--hostly-line)] bg-[var(--hostly-ice-50)] px-2.5 py-1 text-[11px] font-semibold text-[var(--hostly-navy-deep)]">
          {recomendacionVistaZonas}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--hostly-radius-md)] border border-[var(--hostly-table-divider-faint)] bg-[var(--hostly-surface-card-solid)] px-3 py-2.5"
          >
            <dt className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--hostly-ink-muted)]">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--hostly-ink-strong)]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <details className="mt-3 rounded-[var(--hostly-radius-md)] border border-[var(--hostly-table-divider-faint)] bg-[var(--hostly-surface-muted)]/35 px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--hostly-navy-deep)]">
          Diagnóstico de vista
        </summary>
        <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {diagnosticItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--hostly-ink-muted)]">
                {item.label}
              </dt>
              <dd className="mt-0.5 truncate text-xs font-semibold text-[var(--hostly-ink-strong)]" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
