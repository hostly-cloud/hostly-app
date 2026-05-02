"use client";

import { useMemo } from "react";
import type { Reservation } from "@/lib/firestore/reservations";

function buildZoneMetrics(reservations: Reservation[]) {
  const map = new Map();

  reservations.forEach((r) => {
    const zoneId = r.zoneId || null;
    const zoneName = r.zoneName || "Sin zona";
    const key = zoneId || zoneName;

    if (!map.has(key)) {
      map.set(key, {
        zoneId,
        zoneName,
        total: 0,
        llegadas: 0,
        noShow: 0,
        pax: 0,
        ocupacion: 0,
        ticketMedio: 0,
        noShowRate: 0,
        share: 0,
        paxPorReserva: 0,
        estabilidad: "",
        eficiencia: 0,
        fiabilidad: "",
        paxLlegadas: 0,
        conversionPax: 0,
        score: 0,
      });
    }

    const item = map.get(key);

    item.total += 1;

    if (r.status === "seated" || r.status === "completed") {
      item.llegadas += 1;
      item.paxLlegadas += r.partySize || 0;
    }

    if (r.status === "no_show") {
      item.noShow += 1;
    }

    item.pax += r.partySize || 0;
  });

  for (const item of map.values()) {
    item.ocupacion = item.total > 0 ? item.llegadas / item.total : 0;
    item.ticketMedio = item.pax > 0 ? item.total / item.pax : 0;
    item.noShowRate = item.total > 0 ? item.noShow / item.total : 0;
    item.paxPorReserva = item.total > 0 ? item.pax / item.total : 0;
    if (item.noShowRate < 0.1) {
      item.estabilidad = "Alta";
    } else if (item.noShowRate < 0.25) {
      item.estabilidad = "Media";
    } else {
      item.estabilidad = "Baja";
    }
    item.eficiencia = item.ocupacion * (1 - item.noShowRate);
    if (item.eficiencia >= 0.7) {
      item.fiabilidad = "Alta";
    } else if (item.eficiencia >= 0.45) {
      item.fiabilidad = "Media";
    } else {
      item.fiabilidad = "Baja";
    }
    item.conversionPax = item.pax > 0 ? item.paxLlegadas / item.pax : 0;
  }

  let totalReservasZonas = 0;
  for (const item of map.values()) {
    totalReservasZonas += item.total;
  }
  for (const item of map.values()) {
    item.share = totalReservasZonas === 0 ? 0 : item.total / totalReservasZonas;
  }

  for (const item of map.values()) {
    item.score = item.eficiencia * (item.share || 0);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function buildZoneMetricsPrev(reservations: Reservation[], dateFrom: string, dateTo: string) {
  const diff = new Date(dateTo).getTime() - new Date(dateFrom).getTime();

  const prevFrom = new Date(new Date(dateFrom).getTime() - diff);
  const prevTo = new Date(new Date(dateTo).getTime() - diff);

  const prevReservations = reservations.filter((r) => {
    const d = new Date(r.date);
    return d >= prevFrom && d <= prevTo;
  });

  return buildZoneMetrics(prevReservations);
}

export type ZonaExportMetric = {
  zoneId: string | null;
  zoneName: string;
  total: number;
  llegadas: number;
  noShow: number;
  pax: number;
  ocupacion: number;
  noShowRate: number;
  share: number;
  paxShare: number;
  conversionPax: number;
  paxPorReserva: number;
  eficiencia: number;
  score: number;
  estadoZona: string;
  fiabilidad: string;
  estabilidad: string;
  deltaOcupacion: number;
};

export type ColumnasZonasPrefs = {
  reservas: boolean;
  llegadas: boolean;
  noShow: boolean;
  pax: boolean;
  ocupacion: boolean;
  eficiencia: boolean;
  score: boolean;
};

export type UseZonasAnalyticsInput = {
  reservations: Reservation[];
  dateFrom: string;
  dateTo: string;
  restaurantId?: string;
  searchZona: string;
  ordenZonas: "total" | "ocupacion" | "eficiencia" | "score";
  limitZonas: number;
  columnasZonas: ColumnasZonasPrefs;
  compactViewZonas: boolean;
  usoAccionesZonas: number;
  resetUsoAccionesZonasCount: number;
  sesionesZonas: number;
  lastInteractionZonas: number | null;
};

type ZonasCacheEntry = {
  timestamp: number;
  reservations: Reservation[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- module cache stores the full analytics result blob
  result: any;
};

const zonasAnalyticsCache = new Map<string, ZonasCacheEntry>();

const ZONAS_CACHE_TTL = 1000 * 60 * 2; // 2 minutos

const ZONAS_CACHE_MAX_SIZE = 50;

function cleanZonasCache() {
  const now = Date.now();

  const expiredKeys: string[] = [];
  for (const [key, entry] of zonasAnalyticsCache.entries()) {
    const isExpired = now - entry.timestamp >= ZONAS_CACHE_TTL;
    if (isExpired) {
      expiredKeys.push(key);
    }
  }
  for (const key of expiredKeys) {
    zonasAnalyticsCache.delete(key);
  }

  if (zonasAnalyticsCache.size > ZONAS_CACHE_MAX_SIZE) {
    const keys = zonasAnalyticsCache.keys();
    const firstKey = keys.next().value;
    if (firstKey) {
      zonasAnalyticsCache.delete(firstKey);
    }
  }
}

export function useZonasAnalytics(p: UseZonasAnalyticsInput) {
  cleanZonasCache();

  const {
    reservations,
    dateFrom,
    dateTo,
    restaurantId,
    searchZona,
    ordenZonas,
    limitZonas,
    columnasZonas,
    compactViewZonas,
    usoAccionesZonas,
    resetUsoAccionesZonasCount,
    sesionesZonas,
    lastInteractionZonas,
  } = p;

  const cacheKey =
    JSON.stringify({
      reservationsLength: reservations?.length,
      dateFrom,
      dateTo,
      restaurantId: restaurantId ?? null,
    }) +
    JSON.stringify({
      searchZona,
      ordenZonas,
      limitZonas,
      columnasZonas,
      compactViewZonas,
      usoAccionesZonas,
      resetUsoAccionesZonasCount,
      sesionesZonas,
      lastInteractionZonas,
    });

  const zoneMetricsBase = useMemo(() => {
    const rangeLo = dateFrom <= dateTo ? dateFrom : dateTo;
    const rangeHi = dateFrom <= dateTo ? dateTo : dateFrom;
    const reservationsCurrent = reservations.filter(
      (r) => typeof r.date === "string" && r.date >= rangeLo && r.date <= rangeHi,
    );
    const result = buildZoneMetrics(reservationsCurrent);
    return Array.isArray(result) ? result : [];
  }, [reservations, dateFrom, dateTo]);

  const rawZoneMetricsPrev = buildZoneMetricsPrev(reservations, dateFrom, dateTo);
  const zoneMetricsPrev = Array.isArray(rawZoneMetricsPrev) ? rawZoneMetricsPrev : [];
  const prevOcupacionByName = new Map(
    (Array.isArray(zoneMetricsPrev) ? zoneMetricsPrev : []).map((p) => [p.zoneName, p.ocupacion]),
  );
  const totalPaxZonas = useMemo(
    () => (Array.isArray(zoneMetricsBase) ? zoneMetricsBase : []).reduce((acc, z) => acc + z.pax, 0),
    [zoneMetricsBase],
  );
  const zoneMetrics = (Array.isArray(zoneMetricsBase) ? zoneMetricsBase : []).map((z) => {
    const paxShare = totalPaxZonas > 0 ? z.pax / totalPaxZonas : 0;
    let estadoZona = "Crítica";
    if (z.eficiencia >= 0.7 && z.ocupacion >= 0.7) {
      estadoZona = "Fuerte";
    } else if (z.eficiencia >= 0.45 && z.ocupacion >= 0.4) {
      estadoZona = "Estable";
    }
    const prevOcup = prevOcupacionByName.get(z.zoneName);
    const deltaOcupacion = prevOcup !== undefined ? z.ocupacion - prevOcup : 0;
    return {
      ...z,
      paxShare,
      gapReservasPax: paxShare - z.share,
      estadoZona,
      deltaOcupacion,
    };
  });

  const zoneMetricsFiltered = (Array.isArray(zoneMetrics) ? zoneMetrics : []).filter((z) =>
    z.zoneName.toLowerCase().includes(searchZona.toLowerCase()),
  );

  const zoneMetricsSorted = [...(Array.isArray(zoneMetricsFiltered) ? zoneMetricsFiltered : [])].sort((a, b) => {
    if (ordenZonas === "ocupacion") return b.ocupacion - a.ocupacion;
    if (ordenZonas === "eficiencia") return b.eficiencia - a.eficiencia;
    if (ordenZonas === "score") return b.score - a.score;
    return b.total - a.total;
  });

  const zoneMetricsLimited =
    limitZonas > 0 ? zoneMetricsSorted.slice(0, limitZonas) : zoneMetricsSorted;

  const totalZonasBase = useMemo(() => zoneMetrics.length, [zoneMetrics]);

  const totalZonasFiltradas = useMemo(() => zoneMetricsFiltered.length, [zoneMetricsFiltered]);

  const totalZonasVisibles = useMemo(() => zoneMetricsLimited.length, [zoneMetricsLimited]);

  const totalColumnasZonas = useMemo(() => Object.keys(columnasZonas || {}).length, [columnasZonas]);

  const columnasVisiblesZonas = useMemo(
    () => Object.values(columnasZonas || {}).filter(Boolean).length,
    [columnasZonas],
  );

  const filtrosActivosZonas = useMemo(() => {
    const filtrosActivosZonas: string[] = [];
    if (searchZona.trim()) {
      filtrosActivosZonas.push("Búsqueda");
    }
    if (limitZonas > 0) {
      filtrosActivosZonas.push(`Top ${limitZonas}`);
    }
    const visibles = Object.values(columnasZonas || {}).filter(Boolean).length;
    const totalCols = Object.keys(columnasZonas || {}).length;
    if (visibles < totalCols) {
      filtrosActivosZonas.push("Columnas personalizadas");
    }
    return filtrosActivosZonas;
  }, [searchZona, limitZonas, columnasZonas]);

  const ordenActivoLabel = useMemo(() => {
    if (ordenZonas === "ocupacion") return "Ocupación";
    if (ordenZonas === "eficiencia") return "Eficiencia";
    if (ordenZonas === "score") return "Score";
    return "Reservas";
  }, [ordenZonas]);

  const resumenVistaZonas = useMemo(() => {
    let resumenVistaZonas = "";
    if (totalZonasBase === 0) {
      resumenVistaZonas = "Sin datos por zona";
    } else {
      const partes = [
        `${totalZonasVisibles} de ${totalZonasBase} zonas visibles`,
        `orden: ${ordenActivoLabel}`,
        `columnas: ${columnasVisiblesZonas}/${totalColumnasZonas}`,
      ];

      if (searchZona.trim()) {
        partes.push(`filtradas: ${totalZonasFiltradas}`);
      }

      if (filtrosActivosZonas.length > 0) {
        partes.push(`filtros: ${filtrosActivosZonas.join(", ")}`);
      }

      resumenVistaZonas = partes.join(" · ");
    }
    return resumenVistaZonas;
  }, [
    totalZonasBase,
    totalZonasVisibles,
    ordenActivoLabel,
    columnasVisiblesZonas,
    totalColumnasZonas,
    searchZona,
    totalZonasFiltradas,
    filtrosActivosZonas,
  ]);

  const estadoFiltrosZonas = useMemo(() => {
    let estadoFiltrosZonas = "";
    const hayFiltros =
      searchZona.trim().length > 0 ||
      limitZonas > 0 ||
      (filtrosActivosZonas && filtrosActivosZonas.length > 0);

    if (!hayFiltros) {
      estadoFiltrosZonas = "Vista limpia";
    } else {
      estadoFiltrosZonas = "Vista filtrada";
    }
    return estadoFiltrosZonas;
  }, [searchZona, limitZonas, filtrosActivosZonas]);

  const accionesRapidasZonas = 6;
  const exportacionesZonas = 6;

  const controlesActivosZonas =
    (searchZona.trim() ? 1 : 0) +
    (limitZonas > 0 ? 1 : 0) +
    (ordenZonas !== "total" ? 1 : 0) +
    (compactViewZonas ? 1 : 0) +
    (Object.values(columnasZonas || {}).filter(Boolean).length < Object.keys(columnasZonas || {}).length ? 1 : 0);

  const columnasDefault = {
    reservas: true,
    llegadas: true,
    noShow: true,
    pax: true,
    ocupacion: true,
    eficiencia: true,
    score: true,
  };

  const esDefault =
    !searchZona.trim() &&
    limitZonas === 0 &&
    ordenZonas === "total" &&
    !compactViewZonas &&
    JSON.stringify(columnasZonas) === JSON.stringify(columnasDefault);

  let vistaDefaultZonas = "";
  vistaDefaultZonas = esDefault ? "Vista por defecto" : "Vista personalizada";

  const modoVistaZonas = useMemo(() => {
    return compactViewZonas ? "Compacta" : "Completa";
  }, [compactViewZonas]);

  const densidadVistaZonas = useMemo(() => {
    let densidadVistaZonas = "";
    if (totalZonasBase === 0) {
      densidadVistaZonas = "Sin datos por zona";
    } else {
      const vistaReducida =
        totalZonasVisibles <= 5 || columnasVisiblesZonas <= Math.ceil(totalColumnasZonas / 2);

      densidadVistaZonas = vistaReducida ? "Vista reducida" : "Vista amplia";
    }
    return densidadVistaZonas;
  }, [totalZonasBase, totalZonasVisibles, columnasVisiblesZonas, totalColumnasZonas]);

  const cargaVistaZonas = useMemo(() => {
    let cargaVistaZonas = "";
    if (totalZonasVisibles === 0) {
      cargaVistaZonas = "Sin datos";
    } else if (totalZonasVisibles > 15 || columnasVisiblesZonas > 6) {
      cargaVistaZonas = "Alta carga de información";
    } else if (totalZonasVisibles < 5 || columnasVisiblesZonas < 4) {
      cargaVistaZonas = "Baja carga de información";
    } else {
      cargaVistaZonas = "Carga equilibrada";
    }
    return cargaVistaZonas;
  }, [totalZonasVisibles, columnasVisiblesZonas]);

  const nivelPersonalizacionZonas = useMemo(() => {
    let nivelPersonalizacionZonas = "";
    const cambiosVistaZonas =
      (searchZona.trim() ? 1 : 0) +
      (limitZonas > 0 ? 1 : 0) +
      (ordenZonas !== "total" ? 1 : 0) +
      (compactViewZonas ? 1 : 0) +
      (Object.values(columnasZonas || {}).filter(Boolean).length <
      Object.keys(columnasZonas || {}).length
        ? 1
        : 0);

    if (cambiosVistaZonas === 0) {
      nivelPersonalizacionZonas = "Sin personalización";
    } else if (cambiosVistaZonas <= 2) {
      nivelPersonalizacionZonas = "Personalización baja";
    } else if (cambiosVistaZonas <= 4) {
      nivelPersonalizacionZonas = "Personalización media";
    } else {
      nivelPersonalizacionZonas = "Personalización alta";
    }
    return nivelPersonalizacionZonas;
  }, [searchZona, limitZonas, ordenZonas, compactViewZonas, columnasZonas]);

  const complejidadVistaZonas = useMemo(() => {
    let complejidadVistaZonas = "";
    if (totalColumnasZonas === 0) {
      complejidadVistaZonas = "Sin datos";
    } else {
      const ratioColumnas = columnasVisiblesZonas / totalColumnasZonas;

      if (controlesActivosZonas === 0 && ratioColumnas === 1) {
        complejidadVistaZonas = "Vista simple";
      } else if (controlesActivosZonas <= 2 && ratioColumnas >= 0.6) {
        complejidadVistaZonas = "Complejidad baja";
      } else if (controlesActivosZonas <= 4) {
        complejidadVistaZonas = "Complejidad media";
      } else {
        complejidadVistaZonas = "Vista compleja";
      }
    }
    return complejidadVistaZonas;
  }, [controlesActivosZonas, totalColumnasZonas, columnasVisiblesZonas]);

  const estadoExportacionZonas = useMemo(() => {
    let estadoExportacionZonas = "";
    if (totalZonasVisibles === 0) {
      estadoExportacionZonas = "Nada que exportar";
    } else if (totalZonasVisibles <= 3 || columnasVisiblesZonas <= 2) {
      estadoExportacionZonas = "Exportación parcial";
    } else {
      estadoExportacionZonas = "Lista para exportar";
    }
    return estadoExportacionZonas;
  }, [totalZonasVisibles, columnasVisiblesZonas]);

  const legibilidadVistaZonas = useMemo(() => {
    let legibilidadVistaZonas = "";
    if (totalZonasVisibles === 0) {
      legibilidadVistaZonas = "Sin datos";
    } else if (
      totalZonasVisibles <= 8 &&
      columnasVisiblesZonas <= 5 &&
      controlesActivosZonas <= 2 &&
      !compactViewZonas
    ) {
      legibilidadVistaZonas = "Alta legibilidad";
    } else if (
      totalZonasVisibles <= 15 &&
      columnasVisiblesZonas <= 7 &&
      controlesActivosZonas <= 4
    ) {
      legibilidadVistaZonas = "Legibilidad media";
    } else {
      legibilidadVistaZonas = "Legibilidad reducida";
    }
    return legibilidadVistaZonas;
  }, [totalZonasVisibles, columnasVisiblesZonas, controlesActivosZonas, compactViewZonas]);

  const recomendacionVistaZonas = useMemo(() => {
    let recomendacionVistaZonas = "";
    if (legibilidadVistaZonas === "Sin datos") {
      recomendacionVistaZonas = "Sin datos por zona";
    } else if (
      legibilidadVistaZonas === "Legibilidad reducida" ||
      cargaVistaZonas === "Alta carga de información"
    ) {
      recomendacionVistaZonas = "Reducir columnas o limitar zonas";
    } else if (
      cargaVistaZonas === "Baja carga de información" ||
      densidadVistaZonas === "Vista reducida"
    ) {
      recomendacionVistaZonas = "Ampliar vista para más contexto";
    } else {
      recomendacionVistaZonas = "Vista equilibrada";
    }
    return recomendacionVistaZonas;
  }, [legibilidadVistaZonas, cargaVistaZonas, densidadVistaZonas]);

  const idoneidadVistaZonas = useMemo(() => {
    let idoneidadVistaZonas = "";
    if (totalZonasVisibles === 0) {
      idoneidadVistaZonas = "Sin datos";
    } else if (
      estadoExportacionZonas === "Lista para exportar" &&
      legibilidadVistaZonas === "Alta legibilidad" &&
      recomendacionVistaZonas === "Vista equilibrada"
    ) {
      idoneidadVistaZonas = "Vista óptima";
    } else if (
      legibilidadVistaZonas === "Legibilidad reducida" ||
      recomendacionVistaZonas === "Reducir columnas o limitar zonas"
    ) {
      idoneidadVistaZonas = "Vista mejorable";
    } else {
      idoneidadVistaZonas = "Vista válida";
    }
    return idoneidadVistaZonas;
  }, [totalZonasVisibles, estadoExportacionZonas, legibilidadVistaZonas, recomendacionVistaZonas]);

  const interaccionTotalZonas = useMemo(
    () => usoAccionesZonas + resetUsoAccionesZonasCount,
    [usoAccionesZonas, resetUsoAccionesZonasCount],
  );

  const interaccionesPorSesionZonas = useMemo(
    () => (sesionesZonas > 0 ? interaccionTotalZonas / sesionesZonas : 0),
    [sesionesZonas, interaccionTotalZonas],
  );

  const frecuenciaUsoZonas = useMemo(() => {
    let frecuenciaUsoZonas = "";
    if (sesionesZonas === 0) {
      frecuenciaUsoZonas = "Sin uso";
    } else if (interaccionesPorSesionZonas < 1) {
      frecuenciaUsoZonas = "Consulta ligera";
    } else if (interaccionesPorSesionZonas < 3) {
      frecuenciaUsoZonas = "Uso moderado";
    } else {
      frecuenciaUsoZonas = "Uso intensivo por sesión";
    }
    return frecuenciaUsoZonas;
  }, [sesionesZonas, interaccionesPorSesionZonas]);

  const actividadRecienteZonas = useMemo(() => {
    let actividadRecienteZonas = "";
    if (!lastInteractionZonas) {
      actividadRecienteZonas = "Sin actividad";
    } else {
      // eslint-disable-next-line react-hooks/purity -- bucket relativo al instante de render
      const diff = Date.now() - lastInteractionZonas;

      const MIN = 60 * 1000;
      const HOUR = 60 * MIN;
      const DAY = 24 * HOUR;

      if (diff < 10 * MIN) {
        actividadRecienteZonas = "Actividad reciente";
      } else if (diff < HOUR) {
        actividadRecienteZonas = "Actividad en la última hora";
      } else if (diff < DAY) {
        actividadRecienteZonas = "Actividad hoy";
      } else {
        actividadRecienteZonas = "Sin actividad reciente";
      }
    }
    return actividadRecienteZonas;
  }, [lastInteractionZonas]);

  const intensidadUsoZonas = useMemo(() => {
    let intensidadUsoZonas = "";
    if (interaccionTotalZonas === 0) {
      intensidadUsoZonas = "Sin uso";
    } else if (interaccionTotalZonas <= 5) {
      intensidadUsoZonas = "Uso bajo";
    } else if (interaccionTotalZonas <= 15) {
      intensidadUsoZonas = "Uso medio";
    } else {
      intensidadUsoZonas = "Uso alto";
    }
    return intensidadUsoZonas;
  }, [interaccionTotalZonas]);

  const eficienciaUsoZonas = useMemo(() => {
    let eficienciaUsoZonas = "";
    if (totalZonasVisibles === 0) {
      eficienciaUsoZonas = "Sin datos";
    } else {
      const ratio = interaccionTotalZonas / totalZonasVisibles;

      if (ratio === 0) {
        eficienciaUsoZonas = "Sin interacción";
      } else if (ratio < 1) {
        eficienciaUsoZonas = "Uso bajo";
      } else if (ratio < 3) {
        eficienciaUsoZonas = "Uso eficiente";
      } else {
        eficienciaUsoZonas = "Uso intensivo";
      }
    }
    return eficienciaUsoZonas;
  }, [interaccionTotalZonas, totalZonasVisibles]);

  const madurezUsoZonas = useMemo(() => {
    let madurezUsoZonas = "";
    if (interaccionTotalZonas === 0) {
      madurezUsoZonas = "Sin adopción";
    } else if (
      intensidadUsoZonas === "Uso alto" &&
      (eficienciaUsoZonas === "Uso eficiente" || eficienciaUsoZonas === "Uso intensivo")
    ) {
      madurezUsoZonas = "Uso maduro";
    } else if (
      intensidadUsoZonas === "Uso medio" ||
      eficienciaUsoZonas === "Uso eficiente"
    ) {
      madurezUsoZonas = "Uso en crecimiento";
    } else {
      madurezUsoZonas = "Uso inicial";
    }
    return madurezUsoZonas;
  }, [interaccionTotalZonas, intensidadUsoZonas, eficienciaUsoZonas]);

  const estadoModuloZonas = useMemo(() => {
    let estadoModuloZonas = "";
    if (madurezUsoZonas === "Sin adopción") {
      estadoModuloZonas = "Módulo no utilizado";
    } else if (
      madurezUsoZonas === "Uso maduro" &&
      idoneidadVistaZonas === "Vista óptima"
    ) {
      estadoModuloZonas = "Módulo optimizado";
    } else if (
      idoneidadVistaZonas === "Vista mejorable" ||
      madurezUsoZonas === "Uso inicial"
    ) {
      estadoModuloZonas = "Módulo mejorable";
    } else {
      estadoModuloZonas = "Módulo en buen estado";
    }
    return estadoModuloZonas;
  }, [madurezUsoZonas, idoneidadVistaZonas]);

  const saludModuloZonas = useMemo(() => {
    let saludModuloZonas = "";
    if (estadoModuloZonas === "Módulo no utilizado") {
      saludModuloZonas = "Sin uso";
    } else if (
      estadoModuloZonas === "Módulo optimizado" &&
      madurezUsoZonas === "Uso maduro" &&
      actividadRecienteZonas === "Actividad reciente"
    ) {
      saludModuloZonas = "Salud óptima";
    } else if (
      estadoModuloZonas === "Módulo mejorable" ||
      madurezUsoZonas === "Uso inicial"
    ) {
      saludModuloZonas = "Salud mejorable";
    } else {
      saludModuloZonas = "Salud estable";
    }
    return saludModuloZonas;
  }, [estadoModuloZonas, madurezUsoZonas, actividadRecienteZonas]);

  const resumenGlobalZonas = useMemo(() => {
    let resumenGlobalZonas = "";
    if (estadoModuloZonas === "Módulo no utilizado") {
      resumenGlobalZonas = "Sin uso del módulo de zonas";
    } else {
      resumenGlobalZonas = `${saludModuloZonas}. ${estadoModuloZonas}. ${idoneidadVistaZonas}.`;
    }
    return resumenGlobalZonas;
  }, [estadoModuloZonas, saludModuloZonas, idoneidadVistaZonas]);

  const columnasZonasTablaCount =
    1 +
    (columnasZonas.reservas ? 1 : 0) +
    (columnasZonas.llegadas ? 1 : 0) +
    (columnasZonas.noShow ? 1 : 0) +
    (columnasZonas.pax ? 1 : 0) +
    (columnasZonas.ocupacion ? 1 : 0) +
    (columnasZonas.eficiencia ? 1 : 0) +
    (columnasZonas.score ? 1 : 0) +
    11;

  let insightEvolucionZona = "";
  if (zoneMetrics.length === 0) {
    insightEvolucionZona = "Sin datos por zona";
  } else {
    const mejorSubida = [...zoneMetrics].sort((a, b) => b.deltaOcupacion - a.deltaOcupacion)[0];
    const mayorCaida = [...zoneMetrics].sort((a, b) => a.deltaOcupacion - b.deltaOcupacion)[0];
    insightEvolucionZona = `La zona ${mejorSubida.zoneName} es la que más mejora (${(mejorSubida.deltaOcupacion * 100).toFixed(0)}%), mientras que ${mayorCaida.zoneName} muestra la mayor caída (${(mayorCaida.deltaOcupacion * 100).toFixed(0)}%).`;
  }

  let resumenEvolucionZona = "";
  if (zoneMetrics.length === 0) {
    resumenEvolucionZona = "Sin datos por zona";
  } else {
    const zonasAlAlza = zoneMetrics.filter((z) => z.deltaOcupacion > 0).length;
    const zonasALaBaja = zoneMetrics.filter((z) => z.deltaOcupacion < 0).length;
    const zonasPlanas = zoneMetrics.filter((z) => z.deltaOcupacion === 0).length;
    resumenEvolucionZona = `Hay ${zonasAlAlza} zona(s) al alza, ${zonasALaBaja} a la baja y ${zonasPlanas} sin cambios frente al periodo anterior.`;
  }

  const balanceOperativoZonas = useMemo(() => {
    let balanceOperativoZonas = "";
    if (zoneMetrics.length === 0) {
      balanceOperativoZonas = "Sin datos por zona";
    } else {
      const zonasFuertes = zoneMetrics.filter((z) => z.estadoZona === "Fuerte").length;
      const zonasEstables = zoneMetrics.filter((z) => z.estadoZona === "Estable").length;
      const zonasCriticasCount = zoneMetrics.filter((z) => z.estadoZona === "Crítica").length;
      balanceOperativoZonas = `El rango actual deja ${zonasFuertes} zona(s) fuertes, ${zonasEstables} estables y ${zonasCriticasCount} críticas.`;
    }
    return balanceOperativoZonas;
  }, [zoneMetrics]);

  const zonasCriticas = useMemo(() => {
    return (Array.isArray(zoneMetrics) ? zoneMetrics : []).filter(
      (z) => z.estadoZona === "Crítica" || z.deltaOcupacion < 0,
    );
  }, [zoneMetrics]);

  const zonasPrioritarias = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.estadoZona === "Crítica" || z.deltaOcupacion < 0)
      .sort((a, b) => {
        if (a.estadoZona !== b.estadoZona) {
          return a.estadoZona === "Crítica" ? -1 : 1;
        }
        return a.score - b.score;
      })
      .slice(0, 3);
  }, [zoneMetrics]);

  const prioridadOperativaZonas = useMemo((): string[] => {
    let prioridadOperativaZonas: string[] = [];
    if (zoneMetrics.length === 0) {
      prioridadOperativaZonas = ["Sin datos por zona"];
    } else {
      prioridadOperativaZonas =
        zonasPrioritarias.length > 0
          ? zonasPrioritarias.map(
              (z) =>
                `${z.zoneName}: ${z.estadoZona}, ocupación ${Math.round(z.ocupacion * 100)}%, eficiencia ${Math.round(z.eficiencia * 100)}% y variación ${(z.deltaOcupacion * 100).toFixed(0)}%.`,
            )
          : ["No hay zonas prioritarias detectadas."];
    }
    return prioridadOperativaZonas;
  }, [zoneMetrics, zonasPrioritarias]);

  const totalZonas = (Array.isArray(zoneMetrics) ? zoneMetrics : []).length;
  const mejorZona = (Array.isArray(zoneMetrics) ? zoneMetrics : [])[0] || null;
  const peorZona = useMemo(() => {
    return (
      [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])].sort((a, b) => a.ocupacion - b.ocupacion)[0] || null
    );
  }, [zoneMetrics]);

  const zonasProblema = useMemo(() => {
    return (Array.isArray(zoneMetrics) ? zoneMetrics : []).filter((z) => z.ocupacion < 0.4 && z.total >= 5);
  }, [zoneMetrics]);

  const checklistZonas = useMemo((): string[] => {
    let checklistZonas: string[] = [];
    if (zoneMetrics.length === 0) {
      checklistZonas = ["Sin datos por zona"];
    } else {
      checklistZonas = [
        peorZona ? `Revisar operativa de ${peorZona.zoneName}` : "Sin zona crítica identificada",
        zonasProblema.length > 0
          ? `Reducir no-show en ${zonasProblema.map((z) => z.zoneName).join(", ")}`
          : "Control de no-show estable",
        mejorZona ? `Replicar prácticas de ${mejorZona.zoneName}` : "Sin zona destacada",
      ];
    }
    return checklistZonas;
  }, [zoneMetrics, peorZona, zonasProblema, mejorZona]);

  const titularZonas = useMemo(() => {
    let titularZonas = "";
    if (zoneMetrics.length === 0) {
      titularZonas = "Sin datos por zona";
    } else {
      titularZonas = `${mejorZona?.zoneName || "Una zona"} lidera, mientras ${peorZona?.zoneName || "otra"} requiere atención.`;
    }
    return titularZonas;
  }, [zoneMetrics, mejorZona, peorZona]);

  const totalReservasZonas = useMemo(
    () => (Array.isArray(zoneMetrics) ? zoneMetrics : []).reduce((acc, z) => acc + z.total, 0),
    [zoneMetrics],
  );

  const confianzaZonas = useMemo(() => {
    let confianzaZonas = "";
    if (zoneMetrics.length === 0) {
      confianzaZonas = "Sin datos por zona";
    } else if (totalReservasZonas >= 100) {
      confianzaZonas = "Alta fiabilidad del análisis";
    } else if (totalReservasZonas >= 40) {
      confianzaZonas = "Fiabilidad media del análisis";
    } else {
      confianzaZonas = "Datos limitados, tomar con cautela";
    }
    return confianzaZonas;
  }, [zoneMetrics, totalReservasZonas]);

  const estadoGeneralZonas = useMemo(() => {
    let estadoGeneralZonas = "";
    if (zoneMetrics.length === 0) {
      estadoGeneralZonas = "Sin datos por zona";
    } else {
      estadoGeneralZonas = `${balanceOperativoZonas}. ${confianzaZonas}.`;
    }
    return estadoGeneralZonas;
  }, [zoneMetrics, balanceOperativoZonas, confianzaZonas]);

  const topZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => b.ocupacion - a.ocupacion)
      .slice(0, 3);
  }, [zoneMetrics]);

  const bottomZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => a.ocupacion - b.ocupacion)
      .slice(0, 3);
  }, [zoneMetrics]);

  const topEficienciaZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => b.eficiencia - a.eficiencia)
      .slice(0, 3);
  }, [zoneMetrics]);

  const bottomEficienciaZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => a.eficiencia - b.eficiencia)
      .slice(0, 3);
  }, [zoneMetrics]);

  const topScoreZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [zoneMetrics]);

  const bottomScoreZonas = useMemo(() => {
    return [...(Array.isArray(zoneMetrics) ? zoneMetrics : [])]
      .filter((z) => z.total > 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [zoneMetrics]);

  const mejorScoreZona = useMemo(() => {
    return topScoreZonas[0] || null;
  }, [topScoreZonas]);

  const peorScoreZona = useMemo(() => {
    return bottomScoreZonas[0] || null;
  }, [bottomScoreZonas]);

  let insightScoreZona = "";
  if (zoneMetrics.length === 0) {
    insightScoreZona = "Sin datos por zona";
  } else if (mejorScoreZona && peorScoreZona) {
    const diff = ((mejorScoreZona.score - peorScoreZona.score) * 100).toFixed(1);
    insightScoreZona = `La zona ${mejorScoreZona.zoneName} lidera el rendimiento global con un score de ${(mejorScoreZona.score * 100).toFixed(1)}, mientras que ${peorScoreZona.zoneName} cierra el ranking con ${(peorScoreZona.score * 100).toFixed(1)} (${diff} de diferencia).`;
  }

  const conclusionesZonas = useMemo((): string[] => {
    let conclusionesZonas: string[] = [];
    if (zoneMetrics.length === 0) {
      conclusionesZonas = ["Sin datos por zona"];
    } else {
      conclusionesZonas = [
        mejorZona
          ? `${mejorZona.zoneName} lidera en ocupación con ${Math.round(mejorZona.ocupacion * 100)}%.`
          : "Sin mejor zona disponible.",
        mejorScoreZona
          ? `${mejorScoreZona.zoneName} aporta más valor global con un score de ${(mejorScoreZona.score * 100).toFixed(1)}.`
          : "Sin score disponible.",
        zonasProblema.length > 0
          ? `${zonasProblema.length} zona(s) requieren revisión por baja ocupación.`
          : "No hay zonas problemáticas detectadas.",
      ];
    }
    return conclusionesZonas;
  }, [zoneMetrics, mejorZona, mejorScoreZona, zonasProblema]);

  const oportunidadesZonas = useMemo((): string[] => {
    let oportunidadesZonas: string[] = [];
    if (zoneMetrics.length === 0) {
      oportunidadesZonas = ["Sin datos por zona"];
    } else {
      oportunidadesZonas = [
        peorZona
          ? `${peorZona.zoneName} tiene la ocupación más baja con ${Math.round(peorZona.ocupacion * 100)}%.`
          : "Sin zona con baja ocupación identificada.",
        peorScoreZona
          ? `${peorScoreZona.zoneName} presenta el menor score global con ${(peorScoreZona.score * 100).toFixed(1)}.`
          : "Sin zona con bajo score identificada.",
        zonasProblema.length > 0
          ? `Prioridad de revisión en ${zonasProblema.map((z) => z.zoneName).join(", ")}.`
          : "No hay oportunidades críticas detectadas.",
      ];
    }
    return oportunidadesZonas;
  }, [zoneMetrics, peorZona, peorScoreZona, zonasProblema]);

  const recomendacionesZonas = useMemo((): string[] => {
    let recomendacionesZonas: string[] = [];
    if (zoneMetrics.length === 0) {
      recomendacionesZonas = ["Sin datos por zona"];
    } else {
      recomendacionesZonas = [
        mejorZona
          ? `Potenciar ${mejorZona.zoneName} replicando su operativa en otras zonas.`
          : "Sin zona destacada para potenciar.",
        peorZona
          ? `Revisar operativa de ${peorZona.zoneName} para mejorar ocupación.`
          : "Sin zona con baja ocupación.",
        zonasProblema.length > 0
          ? `Analizar causas de no-show y baja conversión en zonas: ${zonasProblema.map((z) => z.zoneName).join(", ")}.`
          : "Mantener operativa actual, sin incidencias relevantes.",
      ];
    }
    return recomendacionesZonas;
  }, [zoneMetrics, mejorZona, peorZona, zonasProblema]);

  const mejorEficienciaZona = topEficienciaZonas[0] || null;
  const peorEficienciaZona = bottomEficienciaZonas[0] || null;

  const insightEficienciaZona = useMemo(() => {
    let insightEficienciaZona = "";
    if (zoneMetrics.length === 0) {
      insightEficienciaZona = "Sin datos por zona";
    } else if (mejorEficienciaZona && peorEficienciaZona) {
      const diff = Math.round((mejorEficienciaZona.eficiencia - peorEficienciaZona.eficiencia) * 100);
      insightEficienciaZona = `La zona ${mejorEficienciaZona.zoneName} lidera en eficiencia con ${Math.round(mejorEficienciaZona.eficiencia * 100)}%, mientras que ${peorEficienciaZona.zoneName} se queda en ${Math.round(peorEficienciaZona.eficiencia * 100)}% (${diff}% de diferencia).`;
    }
    return insightEficienciaZona;
  }, [zoneMetrics, mejorEficienciaZona, peorEficienciaZona]);

  const resumenZonas = useMemo(() => {
    let resumenZonas = "";
    if (zoneMetrics.length === 0) {
      resumenZonas = "Sin datos por zona";
    } else {
      resumenZonas = `Hay ${totalZonas} zonas activas. ${mejorZona?.zoneName || "N/A"} lidera en ocupación y ${mejorEficienciaZona?.zoneName || "N/A"} destaca en eficiencia. ${peorZona?.zoneName || "N/A"} es la zona con menor ocupación y ${peorEficienciaZona?.zoneName || "N/A"} la que requiere más atención operativa.`;
    }
    return resumenZonas;
  }, [zoneMetrics, totalZonas, mejorZona, mejorEficienciaZona, peorZona, peorEficienciaZona]);

  const insightZona = useMemo(() => {
    let insightZona = "";
    if (zoneMetrics.length === 0) {
      insightZona = "Sin datos por zona";
    } else if (mejorZona && peorZona) {
      const diff = Math.round((mejorZona.ocupacion - peorZona.ocupacion) * 100);
      insightZona = `La zona ${mejorZona.zoneName} lidera con ${Math.round(mejorZona.ocupacion * 100)}% de ocupación, mientras que ${peorZona.zoneName} está en ${Math.round(peorZona.ocupacion * 100)}% (${diff}% de diferencia).`;
    }
    return insightZona;
  }, [zoneMetrics, mejorZona, peorZona]);

  const insightPrincipalZonas = useMemo(() => {
    let insightPrincipalZonas = "";
    if (zoneMetrics.length === 0) {
      insightPrincipalZonas = "Sin datos por zona";
    } else {
      insightPrincipalZonas =
        insightScoreZona || insightEficienciaZona || insightZona || "Sin insight disponible";
    }
    return insightPrincipalZonas;
  }, [zoneMetrics, insightScoreZona, insightEficienciaZona, insightZona]);

  const maxShare = useMemo(
    () => Math.max(...zoneMetrics.map((z) => z.share || 0), 0),
    [zoneMetrics],
  );

  const tendenciaZonas = useMemo(() => {
    let tendenciaZonas = "";
    if (zoneMetrics.length === 0) {
      tendenciaZonas = "Sin datos por zona";
    } else if (maxShare > 0.6) {
      tendenciaZonas = "Alta concentración de reservas en una zona";
    } else if (maxShare > 0.4) {
      tendenciaZonas = "Concentración moderada entre zonas";
    } else {
      tendenciaZonas = "Distribución equilibrada entre zonas";
    }
    return tendenciaZonas;
  }, [zoneMetrics, maxShare]);

  const alertaConcentracionZona = useMemo(() => {
    let alertaConcentracionZona = "";
    if (zoneMetrics.length === 0) {
      alertaConcentracionZona = "Sin datos por zona";
    } else if (maxShare >= 0.6) {
      alertaConcentracionZona = "Dependencia alta de una sola zona";
    } else if (maxShare >= 0.45) {
      alertaConcentracionZona = "Dependencia moderada de una zona principal";
    } else {
      alertaConcentracionZona = "Distribución sana entre zonas";
    }
    return alertaConcentracionZona;
  }, [zoneMetrics, maxShare]);

  const zonaMayorPaxReserva =
    zoneMetrics.length === 0
      ? null
      : [...zoneMetrics].reduce((best, z) => (z.paxPorReserva > best.paxPorReserva ? z : best), zoneMetrics[0]);

  const cached = zonasAnalyticsCache.get(cacheKey);

  if (cached) {
    // eslint-disable-next-line react-hooks/purity -- TTL relative to wall clock at render
    const isValid = Date.now() - cached.timestamp < ZONAS_CACHE_TTL;

    if (isValid && cached.reservations === reservations) {
      return cached.result;
    }
  }

  const result = {
    zoneMetricsBase,
    rawZoneMetricsPrev,
    zoneMetricsPrev,
    prevOcupacionByName,
    totalPaxZonas,
    zoneMetrics,
    zoneMetricsFiltered,
    zoneMetricsSorted,
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
    columnasDefault,
    esDefault,
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
    columnasZonasTablaCount,
    insightEvolucionZona,
    resumenEvolucionZona,
    balanceOperativoZonas,
    zonasCriticas,
    zonasPrioritarias,
    prioridadOperativaZonas,
    totalZonas,
    mejorZona,
    peorZona,
    zonasProblema,
    checklistZonas,
    titularZonas,
    totalReservasZonas,
    confianzaZonas,
    estadoGeneralZonas,
    topZonas,
    bottomZonas,
    topEficienciaZonas,
    bottomEficienciaZonas,
    topScoreZonas,
    bottomScoreZonas,
    mejorScoreZona,
    peorScoreZona,
    insightScoreZona,
    conclusionesZonas,
    oportunidadesZonas,
    recomendacionesZonas,
    mejorEficienciaZona,
    peorEficienciaZona,
    insightEficienciaZona,
    resumenZonas,
    insightZona,
    insightPrincipalZonas,
    maxShare,
    tendenciaZonas,
    alertaConcentracionZona,
    zonaMayorPaxReserva,
  };

  // eslint-disable-next-line react-hooks/purity -- cache entry wall clock at write time
  const zonasCacheWrittenAt = Date.now();
  zonasAnalyticsCache.set(cacheKey, {
    timestamp: zonasCacheWrittenAt,
    reservations,
    result,
  });

  return result;
}
