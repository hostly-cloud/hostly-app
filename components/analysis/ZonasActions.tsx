import type { ZonasSelectorsExportsData } from "@/components/analysis/hooks/useZonasSelectors";
import { HostlyButton } from "@/components/ui/hostly";

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
    <div className="hostly-analysis-actions" aria-label="Acciones de exportación por zonas">
      <HostlyButton variant="tableAction" onClick={copiarVistaActualZonas}>
        Copiar vista
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarKpisZonas}>
        Copiar KPIs
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarInsightZonas}>
        Copiar insight
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarTopScoreZonas}>
        Copiar top score
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarZonasCriticas}>
        Copiar zonas críticas
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarResumenEjecutivoZonas}>
        Copiar resumen ejecutivo
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarEstadoVistaZonas}>
        Copiar estado vista
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarTodoZonas}>
        Copiar todo
      </HostlyButton>
      <HostlyButton variant="tableAction" onClick={copiarResumenUltraZonas}>
        Copiar ultra
      </HostlyButton>
    </div>
  );
}
