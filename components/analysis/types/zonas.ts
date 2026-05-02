export type ZonaMetric = {
  zoneName: string;
  ocupacion: number;
  reservas: number;
  pax: number;
};

export type ZonasKpis = {
  totalZonas: number;
  mejorZona: {
    zoneName: string;
    ocupacion: number;
  } | null;
  peorZona: {
    zoneName: string;
    ocupacion: number;
  } | null;
  balanceOperativoZonas: string;
  confianzaZonas: string;
};

export type ZonasTableState = {
  columnasZonasTablaCount: number;
};

export type ZonasInsightLines = {
  resumen: string[];
  conclusiones: string[];
  oportunidades: string[];
  recomendaciones: string[];
};

export type ZonasExportsSnapshot = {
  totalZonas: number;
  balanceOperativoZonas: string;
  confianzaZonas: string;
  zoneMetricsLimited: Array<{
    zoneName: string;
    ocupacion: number;
    reservas: number;
    pax: number;
  }>;
};

export type ZonasAnalyticsSnapshotBase = {
  kpis: ZonasKpis;
};

