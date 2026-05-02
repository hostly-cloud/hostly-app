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

  if (totalZonasBase === 0) {
    return <p>Sin datos por zona</p>;
  }

  return (
    <div>
      <p>
        Zonas visibles: {totalZonasVisibles}/{totalZonasBase}
      </p>
      <p>Orden: {ordenActivoLabel}</p>
      <p>
        Columnas: {columnasVisiblesZonas}/{totalColumnasZonas}
      </p>
      <p>Filtros: {estadoFiltrosZonas}</p>
      <p>Modo: {modoVistaZonas}</p>
      <p>Configuración: {vistaDefaultZonas}</p>
      <p>Densidad: {densidadVistaZonas}</p>
      <p>Carga: {cargaVistaZonas}</p>
      <p>Personalización: {nivelPersonalizacionZonas}</p>
      <p>Complejidad: {complejidadVistaZonas}</p>
      <p>Exportación: {estadoExportacionZonas}</p>
      <p>Legibilidad: {legibilidadVistaZonas}</p>
      <p>Recomendación: {recomendacionVistaZonas}</p>
      <p>Idoneidad: {idoneidadVistaZonas}</p>
    </div>
  );
}
