import type { ZonasSelectorsExportsData } from "@/components/analysis/hooks/useZonasSelectors";

export type ZonasActionsData = ZonasSelectorsExportsData;

type ZonasActionsProps = {
  data: ZonasActionsData;
  copiarVistaActualZonas: () => void;
  copiarKpisZonas: () => void;
  copiarInsightZonas: () => void;
  copiarTopScoreZonas: () => void;
  copiarZonasCriticas: () => void;
  copiarResumenEjecutivoZonas: () => void;
  copiarEstadoVistaZonas: () => void;
  copiarTodoZonas: () => void;
  copiarResumenUltraZonas: () => void;
};

export function ZonasActions({
  data,
  copiarVistaActualZonas,
  copiarKpisZonas,
  copiarInsightZonas,
  copiarTopScoreZonas,
  copiarZonasCriticas,
  copiarResumenEjecutivoZonas,
  copiarEstadoVistaZonas,
  copiarTodoZonas,
  copiarResumenUltraZonas,
}: ZonasActionsProps) {
  const {
    zoneMetricsLimited,
    zoneMetrics,
    totalZonasVisibles,
    totalZonasBase,
    ordenActivoLabel,
    columnasVisiblesZonas,
    totalColumnasZonas,
    estadoFiltrosZonas,
    modoVistaZonas,
    vistaDefaultZonas,
    idoneidadVistaZonas,
    totalZonas,
    mejorZona,
    peorZona,
    balanceOperativoZonas,
    confianzaZonas,
    resumenZonas,
    topScoreZonas,
    zonasCriticas,
    conclusionesZonas,
    oportunidadesZonas,
    recomendacionesZonas,
    insightPrincipalZonas,
    densidadVistaZonas,
    cargaVistaZonas,
    nivelPersonalizacionZonas,
    complejidadVistaZonas,
    estadoExportacionZonas,
    legibilidadVistaZonas,
    recomendacionVistaZonas,
  } = data;

  void [
    zoneMetricsLimited,
    zoneMetrics,
    totalZonasVisibles,
    totalZonasBase,
    ordenActivoLabel,
    columnasVisiblesZonas,
    totalColumnasZonas,
    estadoFiltrosZonas,
    modoVistaZonas,
    vistaDefaultZonas,
    idoneidadVistaZonas,
    totalZonas,
    mejorZona,
    peorZona,
    balanceOperativoZonas,
    confianzaZonas,
    resumenZonas,
    topScoreZonas,
    zonasCriticas,
    conclusionesZonas,
    oportunidadesZonas,
    recomendacionesZonas,
    insightPrincipalZonas,
    densidadVistaZonas,
    cargaVistaZonas,
    nivelPersonalizacionZonas,
    complejidadVistaZonas,
    estadoExportacionZonas,
    legibilidadVistaZonas,
    recomendacionVistaZonas,
  ];

  return (
    <div>
      <button type="button" onClick={copiarVistaActualZonas}>
        Copiar vista
      </button>
      <button type="button" onClick={copiarKpisZonas}>
        Copiar KPIs
      </button>
      <button type="button" onClick={copiarInsightZonas}>
        Copiar insight
      </button>
      <button type="button" onClick={copiarTopScoreZonas}>
        Copiar top score
      </button>
      <button type="button" onClick={copiarZonasCriticas}>
        Copiar zonas críticas
      </button>
      <button type="button" onClick={copiarResumenEjecutivoZonas}>
        Copiar resumen ejecutivo
      </button>
      <button type="button" onClick={copiarEstadoVistaZonas}>
        Copiar estado vista
      </button>
      <button type="button" onClick={copiarTodoZonas}>
        Copiar todo
      </button>
      <button type="button" onClick={copiarResumenUltraZonas}>
        Copiar ultra
      </button>
    </div>
  );
}
