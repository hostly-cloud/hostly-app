"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import {
  ANALYSIS_CHART_HEIGHT,
  analysisRechartsAxisProps,
  analysisRechartsGridProps,
  analysisRechartsOnDark,
  analysisRechartsTooltipProps,
} from "@/components/analysis/analysis-recharts-surface";
import { AnalysisSectionEnd } from "@/components/analysis/AnalysisSectionEnd";
import { ZonasActions } from "@/components/analysis/ZonasActions";
import { ZonasKpiBlock } from "@/components/analysis/ZonasKpiBlock";
import { ZonasTable } from "@/components/analysis/ZonasTable";
import { ZonasViewState } from "@/components/analysis/ZonasViewState";
import type {
  ColumnasZonasPrefs,
  ZonaExportMetric,
} from "@/components/analysis/hooks/useZonasAnalytics";
import type {
  ZonasSelectorsExportsData,
  ZonasSelectorsInsights,
  ZonasSelectorsKpis,
  ZonasSelectorsTable,
} from "@/components/analysis/hooks/useZonasSelectors";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ZonasAnalyticsSnapshot = ReturnType<
  typeof import("@/components/analysis/hooks/useZonasAnalytics").useZonasAnalytics
>;

type ZonaMetricRow = ZonasAnalyticsSnapshot["zoneMetrics"][number];

const placeholderStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  borderRadius: 14,
  border: "1px solid rgba(180, 200, 230, 0.22)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-muted)",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "center",
  lineHeight: 1.5,
  boxShadow: "var(--hostly-shadow-hairline)",
};

export type ZonasAnalyticsSectionProps = {
  zonasAnalytics: ZonasAnalyticsSnapshot;
  zonasKpis: ZonasSelectorsKpis;
  zonasTableData: ZonasSelectorsTable;
  zonasInsights: ZonasSelectorsInsights;
  zonasExportsData: ZonasSelectorsExportsData;
  compactViewZonas: boolean;
  setCompactViewZonas: Dispatch<SetStateAction<boolean>>;
  ordenZonas: "total" | "ocupacion" | "eficiencia" | "score";
  setOrdenZonas: Dispatch<SetStateAction<"total" | "ocupacion" | "eficiencia" | "score">>;
  searchZona: string;
  setSearchZona: Dispatch<SetStateAction<string>>;
  limitZonas: number;
  setLimitZonas: Dispatch<SetStateAction<number>>;
  columnasZonas: ColumnasZonasPrefs;
  setColumnasZonas: Dispatch<SetStateAction<ColumnasZonasPrefs>>;
  usoAccionesZonas: number;
  resetUsoAccionesZonasCount: number;
  lastInteractionZonas: number | null;
  sesionesZonas: number;
  reservationsCount: number;
  limpiarFiltrosVistaZonas: () => void;
  aplicarVistaDefaultZonas: () => void;
  resetZonasPrefs: () => void;
  resetUsoAccionesZonas: () => void;
  resetAnaliticaUsoZonas: () => void;
  exportarZonas: (zoneMetricsLimited: ZonaExportMetric[], columnasZonas?: ColumnasZonasPrefs | null) => void;
  exportarZonasJSON: (zoneMetricsLimited: ZonaExportMetric[]) => void;
  copiarCsvZonas: () => void;
  copiarJsonZonas: () => void;
  copiarVistaActualZonas: () => void;
  copiarKpisZonas: () => void;
  copiarInsightZonas: () => void;
  copiarTopScoreZonas: () => void;
  copiarZonasCriticas: () => void;
  copiarResumenEjecutivoZonas: () => void;
  copiarEstadoVistaZonas: () => void;
  copiarTodoZonas: () => void;
  copiarResumenUltraZonas: () => void;
  exportarResumenZonas: () => void;
  copiarResumenZonas: () => void;
  formatLastInteraction: (ts: number | null) => string;
};

export function ZonasAnalyticsSection({
  zonasAnalytics,
  zonasKpis,
  zonasTableData,
  zonasInsights,
  zonasExportsData,
  compactViewZonas,
  setCompactViewZonas,
  ordenZonas,
  setOrdenZonas,
  searchZona,
  setSearchZona,
  limitZonas,
  setLimitZonas,
  columnasZonas,
  setColumnasZonas,
  usoAccionesZonas,
  resetUsoAccionesZonasCount,
  lastInteractionZonas,
  sesionesZonas,
  reservationsCount,
  limpiarFiltrosVistaZonas,
  aplicarVistaDefaultZonas,
  resetZonasPrefs,
  resetUsoAccionesZonas,
  resetAnaliticaUsoZonas,
  exportarZonas,
  exportarZonasJSON,
  copiarCsvZonas,
  copiarJsonZonas,
  copiarVistaActualZonas,
  copiarKpisZonas,
  copiarInsightZonas,
  copiarTopScoreZonas,
  copiarZonasCriticas,
  copiarResumenEjecutivoZonas,
  copiarEstadoVistaZonas,
  copiarTodoZonas,
  copiarResumenUltraZonas,
  exportarResumenZonas,
  copiarResumenZonas,
  formatLastInteraction,
}: ZonasAnalyticsSectionProps) {
  const {
    zoneMetrics,
    zoneMetricsLimited,
    totalZonasBase,
    totalZonasFiltradas,
    totalZonasVisibles,
    totalColumnasZonas,
    columnasVisiblesZonas,
    filtrosActivosZonas,
    ordenActivoLabel,
    resumenVistaZonas,
    estadoFiltrosZonas,
    accionesRapidasZonas,
    exportacionesZonas,
    controlesActivosZonas,
    vistaDefaultZonas,
    modoVistaZonas,
    densidadVistaZonas,
    cargaVistaZonas,
    nivelPersonalizacionZonas,
    complejidadVistaZonas,
    estadoExportacionZonas,
    legibilidadVistaZonas,
    recomendacionVistaZonas,
    idoneidadVistaZonas,
    interaccionTotalZonas,
    interaccionesPorSesionZonas,
    frecuenciaUsoZonas,
    actividadRecienteZonas,
    intensidadUsoZonas,
    eficienciaUsoZonas,
    madurezUsoZonas,
    estadoModuloZonas,
    saludModuloZonas,
    resumenGlobalZonas,
    insightEvolucionZona,
    resumenEvolucionZona,
    balanceOperativoZonas,
    zonasCriticas,
    prioridadOperativaZonas,
    totalZonas,
    mejorZona,
    peorZona,
    zonasProblema,
    checklistZonas,
    titularZonas,
    confianzaZonas,
    estadoGeneralZonas,
    topZonas,
    bottomZonas,
    topEficienciaZonas,
    bottomEficienciaZonas,
    topScoreZonas,
    bottomScoreZonas,
    insightScoreZona,
    conclusionesZonas,
    oportunidadesZonas,
    recomendacionesZonas,
    insightEficienciaZona,
    resumenZonas,
    insightZona,
    insightPrincipalZonas,
    tendenciaZonas,
    alertaConcentracionZona,
    zonaMayorPaxReserva,
  } = zonasAnalytics;

  return (
    <>
            <div className="mt-6">
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)] mb-3">Sin datos por zona</p>
              ) : (
                <ZonasKpiBlock data={zonasKpis} />
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <h3 className="text-lg font-semibold mb-0">Rendimiento por zona</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setCompactViewZonas(!compactViewZonas)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--hostly-line)",
                      background: compactViewZonas ? "var(--hostly-ice-100)" : "var(--hostly-surface-card-solid)",
                      color: compactViewZonas ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Vista compacta
                  </button>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--hostly-ink-muted)",
                    }}
                  >
                    Ordenar por
                    <select
                      value={ordenZonas}
                      onChange={(e) =>
                        setOrdenZonas(e.target.value as "total" | "ocupacion" | "eficiencia" | "score")
                      }
                      aria-label="Ordenar zonas por"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        background: "var(--hostly-surface-card-solid)",
                        color: "var(--hostly-ink-strong)",
                        fontSize: 13,
                        fontWeight: 700,
                        outline: "none",
                        cursor: "pointer",
                        textTransform: "none",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      <option value="total">Reservas</option>
                      <option value="ocupacion">Ocupación</option>
                      <option value="eficiencia">Eficiencia</option>
                      <option value="score">Score</option>
                    </select>
                  </label>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <input
                      type="search"
                      value={searchZona}
                      onChange={(e) => setSearchZona(e.target.value)}
                      placeholder="Buscar zona..."
                      aria-label="Buscar zona por nombre"
                      style={{
                        minWidth: 140,
                        maxWidth: 220,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        background: "var(--hostly-surface-card-solid)",
                        color: "var(--hostly-ink-strong)",
                        fontSize: 13,
                        fontWeight: 600,
                        outline: "none",
                      }}
                    />
                    {searchZona.trim().length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSearchZona("")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(148, 163, 184, 0.22)",
                          background: "var(--hostly-surface-card-solid)",
                          color: "var(--hostly-ink-muted)",
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "-0.02em",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        Limpiar
                      </button>
                    ) : null}
                  </span>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--hostly-ink-muted)",
                    }}
                  >
                    Mostrar
                    <select
                      value={String(limitZonas)}
                      onChange={(e) => setLimitZonas(Number(e.target.value))}
                      aria-label="Cantidad de zonas visibles en la tabla"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        background: "var(--hostly-surface-card-solid)",
                        color: "var(--hostly-ink-strong)",
                        fontSize: 13,
                        fontWeight: 700,
                        outline: "none",
                        cursor: "pointer",
                        textTransform: "none",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      <option value="0">Todas</option>
                      <option value="5">Top 5</option>
                      <option value="10">Top 10</option>
                      <option value="20">Top 20</option>
                    </select>
                  </label>
                  {searchZona.trim().length > 0 || limitZonas > 0 ? (
                    <button
                      type="button"
                      onClick={limpiarFiltrosVistaZonas}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        background: "var(--hostly-surface-card-solid)",
                        color: "var(--hostly-ink-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      Limpiar filtros
                    </button>
                  ) : null}
                  {vistaDefaultZonas !== "Vista por defecto" ? (
                    <button
                      type="button"
                      onClick={aplicarVistaDefaultZonas}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        background: "var(--hostly-surface-card-solid)",
                        color: "var(--hostly-ink-muted)",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      Vista por defecto
                    </button>
                  ) : null}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "4px 0",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "var(--hostly-ink-muted)",
                      }}
                    >
                      Columnas
                    </span>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.reservas}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, reservas: e.target.checked }))
                        }
                      />
                      Reservas
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.llegadas}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, llegadas: e.target.checked }))
                        }
                      />
                      Llegadas
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.noShow}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, noShow: e.target.checked }))
                        }
                      />
                      No-show
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.pax}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, pax: e.target.checked }))
                        }
                      />
                      Pax
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.ocupacion}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, ocupacion: e.target.checked }))
                        }
                      />
                      Ocupación
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.eficiencia}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, eficiencia: e.target.checked }))
                        }
                      />
                      Eficiencia
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--hostly-ink-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columnasZonas.score}
                        onChange={(e) =>
                          setColumnasZonas((prev) => ({ ...prev, score: e.target.checked }))
                        }
                      />
                      Score
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={resetZonasPrefs}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => exportarZonas(zoneMetricsLimited, columnasZonas)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Exportar zonas
                  </button>
                  <button
                    type="button"
                    onClick={() => exportarZonasJSON(zoneMetricsLimited)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Exportar JSON
                  </button>
                  <button
                    type="button"
                    onClick={copiarCsvZonas}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Copiar CSV
                  </button>
                  <button
                    type="button"
                    onClick={copiarJsonZonas}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Copiar JSON
                  </button>
                  <ZonasActions
                    data={zonasExportsData}
                    copiarVistaActualZonas={copiarVistaActualZonas}
                    copiarKpisZonas={copiarKpisZonas}
                    copiarInsightZonas={copiarInsightZonas}
                    copiarTopScoreZonas={copiarTopScoreZonas}
                    copiarZonasCriticas={copiarZonasCriticas}
                    copiarResumenEjecutivoZonas={copiarResumenEjecutivoZonas}
                    copiarEstadoVistaZonas={copiarEstadoVistaZonas}
                    copiarTodoZonas={copiarTodoZonas}
                    copiarResumenUltraZonas={copiarResumenUltraZonas}
                  />
                  <button
                    type="button"
                    onClick={exportarResumenZonas}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Exportar resumen
                  </button>
                  <button
                    type="button"
                    onClick={copiarResumenZonas}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "var(--hostly-surface-card-solid)",
                      color: "var(--hostly-ink-muted)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      cursor: "pointer",
                    }}
                  >
                    Copiar resumen
                  </button>
                </div>
              </div>

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 4,
                    marginBottom: 8,
                  }}
                >
                  Mostrando {totalZonasVisibles} de {totalZonasBase} zonas
                  {searchZona.trim() ? ` · Zonas filtradas: ${totalZonasFiltradas}` : ""}
                </p>
              ) : null}

              {totalZonasBase > 0 && filtrosActivosZonas.length > 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Filtros activos: {filtrosActivosZonas.join(" · ")}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Ordenado por: {ordenActivoLabel}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Columnas visibles: {columnasVisiblesZonas} de {totalColumnasZonas}
                </p>
              ) : null}

              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  marginTop: 0,
                  marginBottom: 8,
                }}
              >
                Vista actual: {resumenVistaZonas}
              </p>

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Estado: {estadoFiltrosZonas}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Acciones rápidas: {accionesRapidasZonas}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Modo de vista: {modoVistaZonas}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Exportación y copia: {exportacionesZonas}
                </p>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Controles activos: {controlesActivosZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  <span>Uso acciones: {usoAccionesZonas}</span>
                  {usoAccionesZonas > 0 ? (
                    <button
                      type="button"
                      onClick={resetUsoAccionesZonas}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        background: "var(--hostly-ice-50)",
                        color: "var(--hostly-ink-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        cursor: "pointer",
                      }}
                    >
                      Reset uso
                    </button>
                  ) : null}
                </div>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Resets uso: {resetUsoAccionesZonasCount}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Interacción total: {interaccionTotalZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Intensidad de uso: {intensidadUsoZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Eficiencia de uso: {eficienciaUsoZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Madurez de uso: {madurezUsoZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Estado del módulo: {estadoModuloZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Última interacción: {formatLastInteraction(lastInteractionZonas)}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Sesiones: {sesionesZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Interacciones/sesión: {interaccionesPorSesionZonas.toFixed(1)}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Frecuencia de uso: {frecuenciaUsoZonas}
                </p>
              ) : null}
              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Actividad: {actividadRecienteZonas}
                </p>
              ) : null}
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  marginTop: 0,
                  marginBottom: 8,
                }}
              >
                Salud del módulo: {totalZonasBase > 0 ? saludModuloZonas : "Sin uso"}
              </p>
              {totalZonasBase > 0 &&
              (usoAccionesZonas > 0 ||
                resetUsoAccionesZonasCount > 0 ||
                lastInteractionZonas !== null ||
                sesionesZonas > 0) ? (
                <button
                  type="button"
                  onClick={resetAnaliticaUsoZonas}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "rgba(248, 250, 252, 0.92)",
                    color: "var(--hostly-ink-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                    marginTop: 2,
                    marginBottom: 10,
                  }}
                >
                  Reset analítica uso
                </button>
              ) : null}

              {totalZonasBase > 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Configuración: {vistaDefaultZonas}
                </p>
              ) : null}

              <ZonasViewState data={zonasInsights} />

              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : zonasTableData.zoneMetricsFiltered.length === 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b">
                      <tr>
                        <th className="py-2">Zona</th>
                        {columnasZonas.reservas && <th className="py-2">Reservas</th>}
                        {columnasZonas.llegadas && <th className="py-2">Llegadas</th>}
                        {columnasZonas.noShow && <th className="py-2">No-show</th>}
                        {columnasZonas.pax && <th className="py-2">Pax</th>}
                        {columnasZonas.ocupacion && <th className="py-2">Ocupación</th>}
                        <th className="py-2">Ticket medio</th>
                        <th className="py-2">No-show %</th>
                        <th className="py-2">Peso %</th>
                        <th className="py-2">Pax/Reserva</th>
                        <th className="py-2">Estabilidad</th>
                        {columnasZonas.eficiencia && <th className="py-2">Eficiencia</th>}
                        <th className="py-2">Fiabilidad</th>
                        <th className="py-2">Peso Pax %</th>
                        <th className="py-2">Gap Pax</th>
                        <th className="py-2">Conv. Pax</th>
                        {columnasZonas.score && <th className="py-2">Score</th>}
                        <th className="py-2">Estado</th>
                        <th className="py-2">Δ Ocupación</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-4 text-sm text-[var(--hostly-ink-muted)]" colSpan={zonasTableData.columnasZonasTablaCount}>
                          Sin resultados
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <ZonasTable data={zonasTableData} />
                </div>
              )}
            </div>

            {!compactViewZonas ? (
              <>
            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 10,
                }}
              >
                Reservas por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
                  <BarChart
                    data={zoneMetrics}
                    margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
                    style={{ background: "transparent" }}
                  >
                    <CartesianGrid {...analysisRechartsGridProps} />
                    <XAxis dataKey="zoneName" {...analysisRechartsAxisProps} />
                    <YAxis allowDecimals={false} {...analysisRechartsAxisProps} />
                    <Tooltip
                      {...analysisRechartsTooltipProps}
                      formatter={(value) => [value, "Reservas"]}
                    />
                    <Bar dataKey="total" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 10,
                }}
              >
                Llegadas vs No-show por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
                  <BarChart
                    data={zoneMetrics}
                    margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
                    style={{ background: "transparent" }}
                  >
                    <CartesianGrid {...analysisRechartsGridProps} />
                    <XAxis dataKey="zoneName" {...analysisRechartsAxisProps} />
                    <YAxis allowDecimals={false} {...analysisRechartsAxisProps} />
                    <Tooltip {...analysisRechartsTooltipProps} />
                    <Bar dataKey="llegadas" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
                    <Bar dataKey="noShow" fill={analysisRechartsOnDark.barAccent} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 10,
                }}
              >
                Peso de reservas por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
                  <BarChart
                    data={zoneMetrics}
                    margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
                    style={{ background: "transparent" }}
                  >
                    <CartesianGrid {...analysisRechartsGridProps} />
                    <XAxis dataKey="zoneName" {...analysisRechartsAxisProps} />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                      domain={[0, 1]}
                      {...analysisRechartsAxisProps}
                    />
                    <Tooltip
                      {...analysisRechartsTooltipProps}
                      formatter={(value) => [`${Math.round(Number(value) * 100)}%`, "Peso"]}
                    />
                    <Bar dataKey="share" fill={analysisRechartsOnDark.barSecondary} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 10,
                }}
              >
                Zonas a revisar
              </div>
              {zonasProblema.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin zonas problemáticas</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {zonasProblema.map((z: ZonaMetricRow, i: number) => (
                    <div
                      key={`${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.14)",
                        background: "var(--hostly-ice-50)",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 8 }}>{z.zoneName}</div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--hostly-ink-muted)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div>Ocupación → {Math.round(z.ocupacion * 100)}%</div>
                        <div>No-show % → {Math.round(z.noShowRate * 100)}%</div>
                        <div>Reservas → {z.total}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 12,
                }}
              >
                Ranking de zonas
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Top ocupación
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {topZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`top:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Ocupación → {Math.round(z.ocupacion * 100)}% · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Baja ocupación
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {bottomZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`bottom:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Ocupación → {Math.round(z.ocupacion * 100)}% · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Insight
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {insightZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Tendencia
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {tendenciaZonas}
              </p>
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 12,
                }}
              >
                Ranking por eficiencia
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Alta eficiencia
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {topEficienciaZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`top-eff:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Eficiencia → {Math.round(z.eficiencia * 100)}% · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Baja eficiencia
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {bottomEficienciaZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`bottom-eff:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Eficiencia → {Math.round(z.eficiencia * 100)}% · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Insight de eficiencia
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {insightEficienciaZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Fiabilidad por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {zoneMetrics.map((z: ZonaMetricRow, i: number) => (
                    <div
                      key={`${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.14)",
                        background: "var(--hostly-ice-50)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--hostly-ink-muted)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div>{z.fiabilidad}</div>
                        <div>Eficiencia → {Math.round(z.eficiencia * 100)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Resumen ejecutivo
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {resumenZonas}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Alerta de concentración
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {alertaConcentracionZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Peso de comensales por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {zoneMetrics.map((z: ZonaMetricRow, i: number) => (
                    <div
                      key={`pax-share:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.14)",
                        background: "var(--hostly-ice-50)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--hostly-ink-muted)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div>Pax → {z.pax}</div>
                        <div>Peso pax → {Math.round(z.paxShare * 100)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Desajuste reservas vs pax
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...zoneMetrics]
                    .sort((a, b) => Math.abs(b.gapReservasPax) - Math.abs(a.gapReservasPax))
                    .map((z: ZonaMetricRow, i: number) => (
                      <div
                        key={`gap:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.14)",
                          background: "var(--hostly-ice-50)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--hostly-ink-muted)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div>Gap → {Math.round(z.gapReservasPax * 100)}%</div>
                          <div>Reservas → {z.total}</div>
                          <div>Pax → {z.pax}</div>
                          {z.gapReservasPax > 0 ? (
                            <span className="text-xs text-[var(--hostly-ink-muted)]">Más peso en pax</span>
                          ) : z.gapReservasPax < 0 ? (
                            <span className="text-xs text-[var(--hostly-ink-muted)]">Más peso en reservas</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Conversión de pax por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...zoneMetrics]
                    .sort((a, b) => b.conversionPax - a.conversionPax)
                    .map((z: ZonaMetricRow, i: number) => (
                      <div
                        key={`conv-pax:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.14)",
                          background: "var(--hostly-ice-50)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--hostly-ink-muted)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div>Conversión pax → {Math.round(z.conversionPax * 100)}%</div>
                          <div>Pax llegadas → {z.paxLlegadas}</div>
                          <div>Pax total → {z.pax}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Rendimiento global por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...zoneMetrics]
                    .sort((a, b) => b.score - a.score)
                    .map((z: ZonaMetricRow, i: number) => (
                      <div
                        key={`score:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.14)",
                          background: "var(--hostly-ice-50)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--hostly-ink-muted)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div>Score → {(z.score * 100).toFixed(1)}</div>
                          <div>Eficiencia → {Math.round(z.eficiencia * 100)}%</div>
                          <div>Peso reservas → {Math.round(z.share * 100)}%</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 12,
                }}
              >
                Ranking final por score
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Mayor score
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {topScoreZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`top-score:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Score → {(z.score * 100).toFixed(1)} · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
                      Menor score
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {bottomScoreZonas.map((z: ZonaMetricRow, i: number) => (
                        <div
                          key={`bottom-score:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.14)",
                            background: "var(--hostly-ice-50)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium" style={{ color: "var(--hostly-ink-strong)" }}>
                                #{i + 1}
                              </span>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>{z.zoneName}</span>
                                <span className="text-xs text-[var(--hostly-ink-muted)]">
                                  Score → {(z.score * 100).toFixed(1)} · Reservas → {z.total}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Insight final por score
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {insightScoreZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Conclusiones
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  lineHeight: 1.55,
                }}
              >
                {conclusionesZonas.map((linea: string, i: number) => (
                  <p key={i} style={{ margin: 0 }}>
                    {linea}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Oportunidades
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  lineHeight: 1.55,
                }}
              >
                {oportunidadesZonas.map((linea: string, i: number) => (
                  <p key={i} style={{ margin: 0 }}>
                    {linea}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Recomendaciones
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  lineHeight: 1.55,
                }}
              >
                {recomendacionesZonas.map((linea: string, i: number) => (
                  <p key={i} style={{ margin: 0 }}>
                    {linea}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Semáforo por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...zoneMetrics]
                    .sort((a, b) => b.score - a.score)
                    .map((z: ZonaMetricRow, i: number) => (
                      <div
                        key={`semaforo:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.14)",
                          background: "var(--hostly-ice-50)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--hostly-ink-muted)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div>{z.estadoZona}</div>
                          <div>Ocupación → {Math.round(z.ocupacion * 100)}%</div>
                          <div>Eficiencia → {Math.round(z.eficiencia * 100)}%</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Evolución por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...zoneMetrics]
                    .sort((a, b) => b.score - a.score)
                    .map((z: ZonaMetricRow, i: number) => (
                      <div
                        key={`evo:${z.zoneId ?? ""}:${z.zoneName}:${i}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(148, 163, 184, 0.14)",
                          background: "var(--hostly-ice-50)",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>{z.zoneName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--hostly-ink-muted)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div>Delta → {(z.deltaOcupacion * 100).toFixed(0)}%</div>
                          <div>Ocupación actual → {Math.round(z.ocupacion * 100)}%</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Insight de evolución
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {insightEvolucionZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Resumen de evolución
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {resumenEvolucionZona}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Balance operativo
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {balanceOperativoZonas}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Prioridad operativa
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  lineHeight: 1.55,
                }}
              >
                {prioridadOperativaZonas.map((linea: string, i: number) => (
                  <p key={i} style={{ margin: 0 }}>
                    {linea}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Checklist rápido
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
                  lineHeight: 1.55,
                }}
              >
                {checklistZonas.map((linea: string, i: number) => (
                  <p key={i} style={{ margin: 0 }}>
                    {linea}
                  </p>
                ))}
              </div>
            </div>
              </>
            ) : null}

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Resumen rápido
              </div>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--hostly-ink-strong)",
                  lineHeight: 1.45,
                  margin: 0,
                }}
              >
                {titularZonas}
              </p>
            </div>

            {!compactViewZonas ? (
              <>
            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Confianza del análisis
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                {confianzaZonas}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Estado general
              </div>
              <p
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  lineHeight: 1.45,
                  margin: 0,
                }}
              >
                {estadoGeneralZonas}
              </p>
            </div>

            <div className="mt-6" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  marginBottom: 8,
                }}
              >
                Tamaño medio por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.55, margin: 0 }}>
                  {zonaMayorPaxReserva?.zoneName}: {zonaMayorPaxReserva?.paxPorReserva.toFixed(1)}
                </p>
              )}
            </div>

            <div
              className="hostly-panel mt-6 p-4"
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--hostly-ink-strong)",
                  letterSpacing: "-0.01em",
                  marginBottom: 10,
                }}
              >
                Pax medio por reserva por zona
              </div>
              {zoneMetrics.length === 0 ? (
                <p className="text-sm text-[var(--hostly-ink-muted)]">Sin datos por zona</p>
              ) : (
                <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
                  <BarChart
                    data={zoneMetrics}
                    margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
                    style={{ background: "transparent" }}
                  >
                    <CartesianGrid {...analysisRechartsGridProps} />
                    <XAxis dataKey="zoneName" {...analysisRechartsAxisProps} />
                    <YAxis {...analysisRechartsAxisProps} />
                    <Tooltip
                      {...analysisRechartsTooltipProps}
                      formatter={(value) => [`${Number(value).toFixed(1)}`, "Pax/reserva"]}
                    />
                    <Bar dataKey="paxPorReserva" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
              </>
            ) : null}

            {reservationsCount === 0 ? (
              <div style={{ ...placeholderStyle, padding: "18px 16px", flex: "0 0 auto" }}>
                No hay reservas en este periodo
              </div>
            ) : null}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(148, 163, 184, 0.14)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)", letterSpacing: "-0.01em" }}>
                Resumen global
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.4 }}>
                {totalZonasBase > 0 ? resumenGlobalZonas : "Sin uso del módulo de zonas"}
              </div>
              <AnalysisSectionEnd label="zonas" />
            </div>
    </>
  );
}
