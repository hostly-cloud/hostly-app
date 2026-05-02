"use client";

import { useMemo } from "react";
import {
  useZonasAnalytics,
  type UseZonasAnalyticsInput,
} from "@/components/analysis/hooks/useZonasAnalytics";
import type {
  ZonasExportsSnapshot as DomainZonasExportsSnapshot,
  ZonasKpis as DomainZonasKpis,
} from "@/components/analysis/types/zonas";

type ZonasAnalyticsSnapshot = ReturnType<typeof useZonasAnalytics>;

export type ZonasSelectorsKpis = DomainZonasKpis;

export type ZonasSelectorsTable = Pick<
  ZonasAnalyticsSnapshot,
  "zoneMetricsLimited" | "zoneMetricsFiltered" | "columnasZonasTablaCount"
>;

export type ZonasSelectorsInsights = Pick<
  ZonasAnalyticsSnapshot,
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
  | "resumenVistaZonas"
  | "filtrosActivosZonas"
  | "accionesRapidasZonas"
  | "exportacionesZonas"
  | "controlesActivosZonas"
  | "totalZonasFiltradas"
  | "interaccionTotalZonas"
  | "interaccionesPorSesionZonas"
  | "frecuenciaUsoZonas"
  | "actividadRecienteZonas"
  | "intensidadUsoZonas"
  | "eficienciaUsoZonas"
  | "madurezUsoZonas"
  | "estadoModuloZonas"
  | "saludModuloZonas"
  | "resumenGlobalZonas"
  | "insightEvolucionZona"
  | "resumenEvolucionZona"
  | "prioridadOperativaZonas"
  | "zonasProblema"
  | "checklistZonas"
  | "titularZonas"
  | "estadoGeneralZonas"
  | "topZonas"
  | "bottomZonas"
  | "topEficienciaZonas"
  | "bottomEficienciaZonas"
  | "topScoreZonas"
  | "bottomScoreZonas"
  | "insightScoreZona"
  | "conclusionesZonas"
  | "oportunidadesZonas"
  | "recomendacionesZonas"
  | "insightEficienciaZona"
  | "resumenZonas"
  | "insightZona"
  | "insightPrincipalZonas"
  | "tendenciaZonas"
  | "alertaConcentracionZona"
  | "zonaMayorPaxReserva"
  | "zoneMetrics"
>;

export type ZonasSelectorsExportsData = Pick<
  ZonasAnalyticsSnapshot,
  | "zoneMetricsLimited"
  | "zoneMetrics"
  | "totalZonasVisibles"
  | "totalZonasBase"
  | "ordenActivoLabel"
  | "columnasVisiblesZonas"
  | "totalColumnasZonas"
  | "estadoFiltrosZonas"
  | "modoVistaZonas"
  | "vistaDefaultZonas"
  | "idoneidadVistaZonas"
  | "totalZonas"
  | "mejorZona"
  | "peorZona"
  | "balanceOperativoZonas"
  | "confianzaZonas"
  | "resumenZonas"
  | "topScoreZonas"
  | "zonasCriticas"
  | "conclusionesZonas"
  | "oportunidadesZonas"
  | "recomendacionesZonas"
  | "insightPrincipalZonas"
  | "densidadVistaZonas"
  | "cargaVistaZonas"
  | "nivelPersonalizacionZonas"
  | "complejidadVistaZonas"
  | "estadoExportacionZonas"
  | "legibilidadVistaZonas"
  | "recomendacionVistaZonas"
> &
  Partial<Omit<DomainZonasExportsSnapshot, "zoneMetricsLimited">>;

export type UseZonasSelectorsResult = {
  analytics: ZonasAnalyticsSnapshot;
  kpis: ZonasSelectorsKpis;
  table: ZonasSelectorsTable;
  insights: ZonasSelectorsInsights;
  exportsData: ZonasSelectorsExportsData;
};

export function useZonasSelectors(input: UseZonasAnalyticsInput): UseZonasSelectorsResult {
  const analytics = useZonasAnalytics(input);

  const kpis = useMemo<ZonasSelectorsKpis>(
    () => ({
      totalZonas: analytics.totalZonas,
      mejorZona: analytics.mejorZona,
      peorZona: analytics.peorZona,
      balanceOperativoZonas: analytics.balanceOperativoZonas,
      confianzaZonas: analytics.confianzaZonas,
    }),
    [analytics],
  );

  const table = useMemo<ZonasSelectorsTable>(
    () => ({
      zoneMetricsLimited: analytics.zoneMetricsLimited,
      zoneMetricsFiltered: analytics.zoneMetricsFiltered,
      columnasZonasTablaCount: analytics.columnasZonasTablaCount,
    }),
    [analytics],
  );

  const insights = useMemo<ZonasSelectorsInsights>(
    () => ({
      totalZonasVisibles: analytics.totalZonasVisibles,
      totalZonasBase: analytics.totalZonasBase,
      ordenActivoLabel: analytics.ordenActivoLabel,
      columnasVisiblesZonas: analytics.columnasVisiblesZonas,
      totalColumnasZonas: analytics.totalColumnasZonas,
      estadoFiltrosZonas: analytics.estadoFiltrosZonas,
      modoVistaZonas: analytics.modoVistaZonas,
      vistaDefaultZonas: analytics.vistaDefaultZonas,
      densidadVistaZonas: analytics.densidadVistaZonas,
      cargaVistaZonas: analytics.cargaVistaZonas,
      nivelPersonalizacionZonas: analytics.nivelPersonalizacionZonas,
      complejidadVistaZonas: analytics.complejidadVistaZonas,
      estadoExportacionZonas: analytics.estadoExportacionZonas,
      legibilidadVistaZonas: analytics.legibilidadVistaZonas,
      recomendacionVistaZonas: analytics.recomendacionVistaZonas,
      idoneidadVistaZonas: analytics.idoneidadVistaZonas,
      resumenVistaZonas: analytics.resumenVistaZonas,
      filtrosActivosZonas: analytics.filtrosActivosZonas,
      accionesRapidasZonas: analytics.accionesRapidasZonas,
      exportacionesZonas: analytics.exportacionesZonas,
      controlesActivosZonas: analytics.controlesActivosZonas,
      totalZonasFiltradas: analytics.totalZonasFiltradas,
      interaccionTotalZonas: analytics.interaccionTotalZonas,
      interaccionesPorSesionZonas: analytics.interaccionesPorSesionZonas,
      frecuenciaUsoZonas: analytics.frecuenciaUsoZonas,
      actividadRecienteZonas: analytics.actividadRecienteZonas,
      intensidadUsoZonas: analytics.intensidadUsoZonas,
      eficienciaUsoZonas: analytics.eficienciaUsoZonas,
      madurezUsoZonas: analytics.madurezUsoZonas,
      estadoModuloZonas: analytics.estadoModuloZonas,
      saludModuloZonas: analytics.saludModuloZonas,
      resumenGlobalZonas: analytics.resumenGlobalZonas,
      insightEvolucionZona: analytics.insightEvolucionZona,
      resumenEvolucionZona: analytics.resumenEvolucionZona,
      prioridadOperativaZonas: analytics.prioridadOperativaZonas,
      zonasProblema: analytics.zonasProblema,
      checklistZonas: analytics.checklistZonas,
      titularZonas: analytics.titularZonas,
      estadoGeneralZonas: analytics.estadoGeneralZonas,
      topZonas: analytics.topZonas,
      bottomZonas: analytics.bottomZonas,
      topEficienciaZonas: analytics.topEficienciaZonas,
      bottomEficienciaZonas: analytics.bottomEficienciaZonas,
      topScoreZonas: analytics.topScoreZonas,
      bottomScoreZonas: analytics.bottomScoreZonas,
      insightScoreZona: analytics.insightScoreZona,
      conclusionesZonas: analytics.conclusionesZonas,
      oportunidadesZonas: analytics.oportunidadesZonas,
      recomendacionesZonas: analytics.recomendacionesZonas,
      insightEficienciaZona: analytics.insightEficienciaZona,
      resumenZonas: analytics.resumenZonas,
      insightZona: analytics.insightZona,
      insightPrincipalZonas: analytics.insightPrincipalZonas,
      tendenciaZonas: analytics.tendenciaZonas,
      alertaConcentracionZona: analytics.alertaConcentracionZona,
      zonaMayorPaxReserva: analytics.zonaMayorPaxReserva,
      zoneMetrics: analytics.zoneMetrics,
    }),
    [analytics],
  );

  const exportsData = useMemo<ZonasSelectorsExportsData>(
    () => ({
      zoneMetricsLimited: analytics.zoneMetricsLimited,
      zoneMetrics: analytics.zoneMetrics,
      totalZonasVisibles: analytics.totalZonasVisibles,
      totalZonasBase: analytics.totalZonasBase,
      ordenActivoLabel: analytics.ordenActivoLabel,
      columnasVisiblesZonas: analytics.columnasVisiblesZonas,
      totalColumnasZonas: analytics.totalColumnasZonas,
      estadoFiltrosZonas: analytics.estadoFiltrosZonas,
      modoVistaZonas: analytics.modoVistaZonas,
      vistaDefaultZonas: analytics.vistaDefaultZonas,
      idoneidadVistaZonas: analytics.idoneidadVistaZonas,
      totalZonas: analytics.totalZonas,
      mejorZona: analytics.mejorZona,
      peorZona: analytics.peorZona,
      balanceOperativoZonas: analytics.balanceOperativoZonas,
      confianzaZonas: analytics.confianzaZonas,
      resumenZonas: analytics.resumenZonas,
      topScoreZonas: analytics.topScoreZonas,
      zonasCriticas: analytics.zonasCriticas,
      conclusionesZonas: analytics.conclusionesZonas,
      oportunidadesZonas: analytics.oportunidadesZonas,
      recomendacionesZonas: analytics.recomendacionesZonas,
      insightPrincipalZonas: analytics.insightPrincipalZonas,
      densidadVistaZonas: analytics.densidadVistaZonas,
      cargaVistaZonas: analytics.cargaVistaZonas,
      nivelPersonalizacionZonas: analytics.nivelPersonalizacionZonas,
      complejidadVistaZonas: analytics.complejidadVistaZonas,
      estadoExportacionZonas: analytics.estadoExportacionZonas,
      legibilidadVistaZonas: analytics.legibilidadVistaZonas,
      recomendacionVistaZonas: analytics.recomendacionVistaZonas,
    }),
    [analytics],
  );

  return {
    analytics,
    kpis,
    table,
    insights,
    exportsData,
  };
}
