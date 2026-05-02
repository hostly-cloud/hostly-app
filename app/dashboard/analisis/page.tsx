"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import {
  AnalysisTabContent,
  type AnalysisTabContentProps,
  buildAnalysisTabContentProps,
  buildComensalesSectionProps,
  buildVentasOrdersAdapter,
  buildVentasSectionProps,
  type ComensalesAnalyticsSectionProps,
  type ColumnasZonasPrefs,
  type HorasAnalyticsSectionProps,
  type ProductosAnalyticsSectionProps,
  type VentasOrderInput,
  type ZonaExportMetric,
  useZonasData,
  useZonasSelectors,
} from "@/components/analysis";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { listenReservationsForRange, type Reservation } from "@/lib/firestore/reservations";
import { computeReservationRangeMetrics } from "@/lib/reservas/reservation-metrics";
import { Timestamp, collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type AnalisisTab = "ventas" | "horas" | "productos" | "comensales";

const TABS: { id: AnalisisTab; label: string; placeholder: string }[] = [
  { id: "ventas", label: "Ventas", placeholder: "Próximamente: análisis de ventas" },
  { id: "horas", label: "Horas", placeholder: "Próximamente: análisis por franjas horarias" },
  { id: "productos", label: "Productos", placeholder: "Próximamente: análisis por producto" },
  { id: "comensales", label: "Comensales", placeholder: "Próximamente: análisis de comensales" },
];

const tabBarStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "stretch",
  gap: 2,
  padding: 4,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 96,
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(56, 189, 248, 0.18)" : "transparent",
    color: active ? "#e0f2fe" : "#94a3b8",
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: "-0.02em",
    cursor: "pointer",
  };
}

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  const yyyy = Number.parseInt(m[1] ?? "1970", 10);
  const mm = Number.parseInt(m[2] ?? "1", 10);
  const dd = Number.parseInt(m[3] ?? "1", 10);
  const d = new Date(yyyy, mm - 1, dd);
  d.setDate(d.getDate() + deltaDays);
  const outY = d.getFullYear();
  const outM = String(d.getMonth() + 1).padStart(2, "0");
  const outD = String(d.getDate()).padStart(2, "0");
  return `${outY}-${outM}-${outD}`;
}

function daysBetweenInclusive(fromYmd: string, toYmd: string): string[] {
  const from = String(fromYmd ?? "").trim();
  const to = String(toYmd ?? "").trim();
  if (!from || !to) return [];
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  const out: string[] = [];
  let cur = lo;
  for (let i = 0; i < 400; i++) {
    out.push(cur);
    if (cur === hi) break;
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function formatDateEs(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatShortDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}`;
}

function readFirestoreTsMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

function startOfDayMs(day: Date): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(day: Date): number {
  const d = new Date(day);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function buildDailyReservations(
  reservations: Reservation[],
  dateFrom: string,
  dateTo: string,
): { date: string; label: string; total: number }[] {
  const dates = daysBetweenInclusive(dateFrom, dateTo);
  const counts: Record<string, number> = {};
  for (const d of dates) counts[d] = 0;
  for (const r of reservations) {
    const d = r.date;
    if (typeof d !== "string") continue;
    if (!(d in counts)) continue;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return dates.map((d) => ({
    date: d,
    label: formatShortDayLabel(d),
    total: counts[d] ?? 0,
  }));
}

function buildDailyAttendance(
  reservations: Reservation[],
  dateFrom: string,
  dateTo: string,
): { date: string; label: string; llegadas: number; noShow: number }[] {
  const dates = daysBetweenInclusive(dateFrom, dateTo);
  const attended: Record<string, number> = {};
  const noShow: Record<string, number> = {};
  for (const d of dates) {
    attended[d] = 0;
    noShow[d] = 0;
  }
  for (const r of reservations) {
    const d = r.date;
    if (typeof d !== "string") continue;
    if (!(d in attended)) continue;
    if (r.status === "seated" || r.status === "completed") {
      attended[d] = (attended[d] ?? 0) + 1;
    } else if (r.status === "no_show") {
      noShow[d] = (noShow[d] ?? 0) + 1;
    }
  }
  return dates.map((d) => ({
    date: d,
    label: formatShortDayLabel(d),
    llegadas: attended[d] ?? 0,
    noShow: noShow[d] ?? 0,
  }));
}


export default function AnalisisPage() {
  const [tab, setTab] = useState<AnalisisTab>("ventas");

  const { restaurantId: profileRestaurantId, user, ready: authReady } = useAuth();
  const restaurantId = profileRestaurantId ?? user?.uid ?? null;
  const today = useMemo(() => todayYmd(), []);
  const [dateTo, setDateTo] = useState<string>(today);
  const [dateFrom, setDateFrom] = useState<string>(() => addDaysYmd(today, -6));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [ordersDocs, setOrdersDocs] = useState<Array<Record<string, unknown>>>([]);
  const [compactViewZonas, setCompactViewZonas] = useState(false);
  const [ordenZonas, setOrdenZonas] = useState<"total" | "ocupacion" | "eficiencia" | "score">("total");
  const [searchZona, setSearchZona] = useState("");
  const [limitZonas, setLimitZonas] = useState(0);
  const [columnasZonas, setColumnasZonas] = useState({
    reservas: true,
    llegadas: true,
    noShow: true,
    pax: true,
    ocupacion: true,
    eficiencia: true,
    score: true,
  });
  const [usoAccionesZonas, setUsoAccionesZonas] = useState(0);
  const [resetUsoAccionesZonasCount, setResetUsoAccionesZonasCount] = useState(0);
  const [lastInteractionZonas, setLastInteractionZonas] = useState<number | null>(null);
  const [sesionesZonas, setSesionesZonas] = useState(0);

  const skipZonasPrefsSave = useRef(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("uso_acciones_zonas");
      if (saved) setUsoAccionesZonas(parseInt(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("uso_acciones_zonas", usoAccionesZonas.toString());
    } catch {
      /* ignore */
    }
  }, [usoAccionesZonas]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("reset_uso_acciones_zonas");
      if (saved) setResetUsoAccionesZonasCount(parseInt(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("reset_uso_acciones_zonas", resetUsoAccionesZonasCount.toString());
    } catch {
      /* ignore */
    }
  }, [resetUsoAccionesZonasCount]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("last_interaction_zonas");
      if (saved) setLastInteractionZonas(parseInt(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sesiones_zonas");
      if (saved) setSesionesZonas(parseInt(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const lastSession = localStorage.getItem("last_session_zonas");
      const now = Date.now();

      const NUEVA_SESION_MS = 30 * 60 * 1000;

      if (!lastSession || now - parseInt(lastSession) > NUEVA_SESION_MS) {
        setSesionesZonas((prev) => prev + 1);
        localStorage.setItem("last_session_zonas", now.toString());
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sesiones_zonas", sesionesZonas.toString());
    } catch {
      /* ignore */
    }
  }, [sesionesZonas]);

  useEffect(() => {
    try {
      if (lastInteractionZonas) {
        localStorage.setItem("last_interaction_zonas", lastInteractionZonas.toString());
      }
    } catch {
      /* ignore */
    }
  }, [lastInteractionZonas]);

  function formatLastInteraction(ts: number | null) {
    if (!ts) return "Sin interacción";
    const date = new Date(ts);
    return date.toLocaleString();
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("analisis_zonas_prefs");
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return;

      const orden = parsed.ordenZonas;
      if (orden === "total" || orden === "ocupacion" || orden === "eficiencia" || orden === "score") {
        setOrdenZonas(orden);
      }

      if (typeof parsed.searchZona === "string") {
        setSearchZona(parsed.searchZona);
      }

      const lim = Number(parsed.limitZonas);
      if (lim === 0 || lim === 5 || lim === 10 || lim === 20) {
        setLimitZonas(lim);
      }

      if (typeof parsed.compactViewZonas === "boolean") {
        setCompactViewZonas(parsed.compactViewZonas);
      }

      const c = parsed.columnasZonas;
      if (c && typeof c === "object" && c !== null && !Array.isArray(c)) {
        const col = c as Record<string, unknown>;
        setColumnasZonas({
          reservas: typeof col.reservas === "boolean" ? col.reservas : true,
          llegadas: typeof col.llegadas === "boolean" ? col.llegadas : true,
          noShow: typeof col.noShow === "boolean" ? col.noShow : true,
          pax: typeof col.pax === "boolean" ? col.pax : true,
          ocupacion: typeof col.ocupacion === "boolean" ? col.ocupacion : true,
          eficiencia: typeof col.eficiencia === "boolean" ? col.eficiencia : true,
          score: typeof col.score === "boolean" ? col.score : true,
        });
      }
    } catch {
      /* ignore corrupt or missing prefs */
    }
  }, []);

  useEffect(() => {
    if (skipZonasPrefsSave.current) {
      skipZonasPrefsSave.current = false;
      return;
    }
    try {
      const data = {
        ordenZonas,
        searchZona,
        limitZonas,
        compactViewZonas,
        columnasZonas,
      };
      localStorage.setItem("analisis_zonas_prefs", JSON.stringify(data));
    } catch {
      /* ignore quota / private mode */
    }
  }, [ordenZonas, searchZona, limitZonas, compactViewZonas, columnasZonas]);

  function resetZonasPrefs() {
    localStorage.removeItem("analisis_zonas_prefs");

    setOrdenZonas("total");
    setSearchZona("");
    setLimitZonas(0);
    setCompactViewZonas(false);
    setColumnasZonas({
      reservas: true,
      llegadas: true,
      noShow: true,
      pax: true,
      ocupacion: true,
      eficiencia: true,
      score: true,
    });
  }

  function limpiarFiltrosVistaZonas() {
    setSearchZona("");
    setLimitZonas(0);
  }

  function aplicarVistaDefaultZonas() {
    setOrdenZonas("total");
    setSearchZona("");
    setLimitZonas(0);
    setCompactViewZonas(false);
    setColumnasZonas({
      reservas: true,
      llegadas: true,
      noShow: true,
      pax: true,
      ocupacion: true,
      eficiencia: true,
      score: true,
    });
  }

  function resetUsoAccionesZonas() {
    setUsoAccionesZonas(0);
    setResetUsoAccionesZonasCount((prev) => prev + 1);
    localStorage.removeItem("uso_acciones_zonas");
  }

  function resetAnaliticaUsoZonas() {
    setUsoAccionesZonas(0);
    setResetUsoAccionesZonasCount(0);
    setLastInteractionZonas(null);
    setSesionesZonas(0);

    localStorage.removeItem("uso_acciones_zonas");
    localStorage.removeItem("reset_uso_acciones_zonas");
    localStorage.removeItem("last_interaction_zonas");
    localStorage.removeItem("sesiones_zonas");
    localStorage.removeItem("last_session_zonas");
  }

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured || !dateFrom || !dateTo) {
      setReservations([]);
      return;
    }
    const from = dateFrom <= dateTo ? dateFrom : dateTo;
    const to = dateFrom <= dateTo ? dateTo : dateFrom;
    const inclusives = daysBetweenInclusive(from, to);
    const n = Math.max(1, inclusives.length);
    const prevPeriodEnd = addDaysYmd(from, -1);
    const prevPeriodStart = addDaysYmd(prevPeriodEnd, -(n - 1));
    const listenFrom = prevPeriodStart < from ? prevPeriodStart : from;
    const unsub = listenReservationsForRange(restaurantId, listenFrom, to, setReservations);
    return () => unsub();
  }, [authReady, restaurantId, dateFrom, dateTo]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setOrdersDocs([]);
      return;
    }

    const q = query(collection(db, "orders"), where("restaurantId", "==", restaurantId));
    let cancelled = false;
    const unsub = onSnapshot(q, (snapshot) => {
      if (cancelled) return;
      setOrdersDocs(snapshot.docs.map((d) => d.data() as Record<string, unknown>));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    if (dateFrom <= dateTo) return;
    setDateFrom(dateTo);
    setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  const metrics = useMemo(() => computeReservationRangeMetrics(reservations, dateFrom, dateTo), [
    reservations,
    dateFrom,
    dateTo,
  ]);

  const dailyReservations = useMemo(
    () => buildDailyReservations(reservations, dateFrom, dateTo),
    [reservations, dateFrom, dateTo],
  );

  const dailyAttendance = useMemo(
    () => buildDailyAttendance(reservations, dateFrom, dateTo),
    [reservations, dateFrom, dateTo],
  );

  const { reservations: zonasReservations } = useZonasData({
    reservations,
    dateFrom,
    dateTo,
    restaurantId: restaurantId ?? undefined,
  });

  const {
    analytics: zonasAnalytics,
    kpis: zonasKpis,
    table: zonasTableData,
    insights: zonasInsights,
    exportsData: zonasExportsData,
  } = useZonasSelectors({
    reservations: zonasReservations,
    dateFrom,
    dateTo,
    restaurantId: restaurantId ?? undefined,
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


  function exportarZonas(zoneMetricsLimited: ZonaExportMetric[], columnasZonas?: ColumnasZonasPrefs | null) {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const cols = columnasZonas || {
      reservas: true,
      llegadas: true,
      noShow: true,
      pax: true,
      ocupacion: true,
      eficiencia: true,
      score: true,
    };

    const rows: Record<string, string | number>[] = [];
    for (const z of zoneMetricsLimited) {
      const row: Record<string, string | number> = { Zona: z.zoneName };
      if (cols.reservas) row.Reservas = z.total;
      if (cols.llegadas) row.Llegadas = z.llegadas;
      if (cols.noShow) row.NoShow = z.noShow;
      if (cols.pax) row.Pax = z.pax;
      if (cols.ocupacion) row.Ocupacion = Math.round(z.ocupacion * 100) + "%";
      if (cols.eficiencia) row.Eficiencia = Math.round(z.eficiencia * 100) + "%";
      if (cols.score) row.Score = (z.score * 100).toFixed(1);
      rows.push(row);
    }

    if (!rows.length) return;

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "analisis_zonas_completo.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportarZonasJSON(zoneMetricsLimited: ZonaExportMetric[]) {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const data = zoneMetricsLimited.map((z: ZonaExportMetric) => ({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      total: z.total,
      llegadas: z.llegadas,
      noShow: z.noShow,
      pax: z.pax,
      ocupacion: z.ocupacion,
      noShowRate: z.noShowRate,
      share: z.share,
      paxShare: z.paxShare,
      conversionPax: z.conversionPax,
      paxPorReserva: z.paxPorReserva,
      eficiencia: z.eficiencia,
      score: z.score,
      estadoZona: z.estadoZona,
      fiabilidad: z.fiabilidad,
      estabilidad: z.estabilidad,
      deltaOcupacion: z.deltaOcupacion,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "analisis_zonas.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }


  function copiarCsvZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const cols = columnasZonas || {
      reservas: true,
      llegadas: true,
      noShow: true,
      pax: true,
      ocupacion: true,
      eficiencia: true,
      score: true,
    };

    const rows: Record<string, string | number>[] = [];
    zoneMetricsLimited.forEach((z: ZonaExportMetric) => {
      const row: Record<string, string | number> = { Zona: z.zoneName };
      if (cols.reservas) row.Reservas = z.total;
      if (cols.llegadas) row.Llegadas = z.llegadas;
      if (cols.noShow) row.NoShow = z.noShow;
      if (cols.pax) row.Pax = z.pax;
      if (cols.ocupacion) row.Ocupacion = Math.round(z.ocupacion * 100) + "%";
      if (cols.eficiencia) row.Eficiencia = Math.round(z.eficiencia * 100) + "%";
      if (cols.score) row.Score = (z.score * 100).toFixed(1);
      rows.push(row);
    });

    if (!rows.length) return;

    const csv = [
      Object.keys(rows[0]).join(","),
      ...rows.map((r) => Object.values(r).join(",")),
    ].join("\n");

    navigator.clipboard.writeText(csv);
  }

  function copiarJsonZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const data = zoneMetricsLimited.map((z: ZonaExportMetric) => ({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      total: z.total,
      llegadas: z.llegadas,
      noShow: z.noShow,
      pax: z.pax,
      ocupacion: z.ocupacion,
      noShowRate: z.noShowRate,
      share: z.share,
      paxShare: z.paxShare,
      conversionPax: z.conversionPax,
      paxPorReserva: z.paxPorReserva,
      eficiencia: z.eficiencia,
      score: z.score,
      estadoZona: z.estadoZona,
      fiabilidad: z.fiabilidad,
      estabilidad: z.estabilidad,
      deltaOcupacion: z.deltaOcupacion,
    }));

    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }

  function copiarVistaActualZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const lineas = [
      `VISTA ACTUAL DE ZONAS`,
      ``,
      `Zonas visibles: ${totalZonasVisibles}/${totalZonasBase}`,
      `Orden: ${ordenActivoLabel}`,
      `Columnas visibles: ${columnasVisiblesZonas}/${totalColumnasZonas}`,
      `Estado: ${estadoFiltrosZonas}`,
      `Modo: ${modoVistaZonas}`,
      `Configuración: ${vistaDefaultZonas}`,
      `Idoneidad: ${idoneidadVistaZonas}`,
      ``,
      ...zoneMetricsLimited.map(
        (z: ZonaExportMetric) =>
          `${z.zoneName} · Reservas: ${z.total} · Ocupación: ${Math.round(z.ocupacion * 100)}% · Eficiencia: ${Math.round(z.eficiencia * 100)}% · Score: ${(z.score * 100).toFixed(1)}`,
      ),
    ];

    navigator.clipboard.writeText(lineas.join("\n"));
  }

  function copiarKpisZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length) return;

    const texto = [
      `KPIs ZONAS`,
      ``,
      `Zonas activas: ${totalZonas}`,
      mejorZona
        ? `Mejor: ${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
        : `Mejor: N/A`,
      peorZona
        ? `Peor: ${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
        : `Peor: N/A`,
      ``,
      `Balance: ${balanceOperativoZonas}`,
      `Confianza: ${confianzaZonas}`,
      `Idoneidad: ${idoneidadVistaZonas}`,
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }


  function exportarResumenZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length) return;

    const lineas = [
      `ANÁLISIS DE ZONAS`,
      ``,
      `Zonas activas: ${totalZonas}`,
      mejorZona
        ? `Mejor zona: ${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
        : `Mejor zona: N/A`,
      peorZona
        ? `Peor zona: ${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
        : `Peor zona: N/A`,
      ``,
      `Resumen: ${resumenZonas}`,
      `Balance: ${balanceOperativoZonas}`,
      `Confianza: ${confianzaZonas}`,
      ``,
      `Top zonas por score:`,
      ...topScoreZonas.map(
        (z: ZonaExportMetric, i: number) => `${i + 1}. ${z.zoneName} (${(z.score * 100).toFixed(1)})`,
      ),
    ];

    const content = lineas.join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "resumen_zonas.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copiarResumenZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length) return;

    const texto = [
      `ANÁLISIS DE ZONAS`,
      ``,
      `Zonas activas: ${totalZonas}`,
      mejorZona
        ? `Mejor zona: ${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
        : `Mejor zona: N/A`,
      peorZona
        ? `Peor zona: ${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
        : `Peor zona: N/A`,
      ``,
      `Resumen: ${resumenZonas}`,
      `Balance: ${balanceOperativoZonas}`,
      `Confianza: ${confianzaZonas}`,
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }


  function copiarInsightZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (zoneMetrics.length === 0) return;
    if (!insightPrincipalZonas) return;
    navigator.clipboard.writeText(insightPrincipalZonas);
  }

  function copiarTopScoreZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length || !topScoreZonas.length) return;

    const texto = [
      `TOP ZONAS POR SCORE`,
      ``,
      ...topScoreZonas.map(
        (z: ZonaExportMetric, i: number) =>
          `${i + 1}. ${z.zoneName} · Score ${(z.score * 100).toFixed(1)} · Ocupación ${Math.round(z.ocupacion * 100)}% · Eficiencia ${Math.round(z.eficiencia * 100)}%`,
      ),
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }

  function copiarZonasCriticas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zonasCriticas.length) return;

    const texto = [
      `ZONAS CRÍTICAS`,
      ``,
      ...zonasCriticas.map(
        (z: ZonaExportMetric) =>
          `${z.zoneName} · Ocupación ${Math.round(z.ocupacion * 100)}% · Eficiencia ${Math.round(z.eficiencia * 100)}% · Δ ${(z.deltaOcupacion * 100).toFixed(0)}%`,
      ),
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }

  function copiarResumenEjecutivoZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length) return;

    const texto = [
      `RESUMEN EJECUTIVO ZONAS`,
      ``,
      `Resumen: ${resumenZonas}`,
      `Balance: ${balanceOperativoZonas}`,
      `Confianza: ${confianzaZonas}`,
      ``,
      `Conclusiones:`,
      ...conclusionesZonas.map((c: string) => `- ${c}`),
      ``,
      `Oportunidades:`,
      ...oportunidadesZonas.map((o: string) => `- ${o}`),
      ``,
      `Recomendaciones:`,
      ...recomendacionesZonas.map((r: string) => `- ${r}`),
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }

  function copiarEstadoVistaZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (totalZonasBase === 0) return;

    const texto = [
      `ESTADO DE VISTA ZONAS`,
      ``,
      `Zonas visibles: ${totalZonasVisibles}/${totalZonasBase}`,
      `Orden: ${ordenActivoLabel}`,
      `Columnas: ${columnasVisiblesZonas}/${totalColumnasZonas}`,
      `Filtros: ${estadoFiltrosZonas}`,
      `Modo: ${modoVistaZonas}`,
      `Configuración: ${vistaDefaultZonas}`,
      `Densidad: ${densidadVistaZonas}`,
      `Carga: ${cargaVistaZonas}`,
      `Personalización: ${nivelPersonalizacionZonas}`,
      `Complejidad: ${complejidadVistaZonas}`,
      `Exportación: ${estadoExportacionZonas}`,
      `Legibilidad: ${legibilidadVistaZonas}`,
      `Recomendación: ${recomendacionVistaZonas}`,
      `Idoneidad: ${idoneidadVistaZonas}`,
    ].join("\n");

    navigator.clipboard.writeText(texto);
  }

  function copiarTodoZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetricsLimited.length) return;

    const header = [
      `ANÁLISIS COMPLETO DE ZONAS`,
      ``,
      `Zonas: ${totalZonasVisibles}/${totalZonasBase}`,
      `Orden: ${ordenActivoLabel}`,
      `Columnas: ${columnasVisiblesZonas}/${totalColumnasZonas}`,
      ``,
      `KPIs`,
      `Zonas activas: ${totalZonas}`,
      mejorZona
        ? `Mejor: ${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
        : `Mejor: N/A`,
      peorZona
        ? `Peor: ${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
        : `Peor: N/A`,
      ``,
    ];

    const tabla = [
      `TABLA`,
      ``,
      ...zoneMetricsLimited.map(
        (z: ZonaExportMetric) =>
          `${z.zoneName} · R:${z.total} · Oc:${Math.round(z.ocupacion * 100)}% · Ef:${Math.round(z.eficiencia * 100)}% · Sc:${(z.score * 100).toFixed(1)}`,
      ),
      ``,
    ];

    const resumen = [
      `RESUMEN`,
      ``,
      `Resumen: ${resumenZonas}`,
      `Balance: ${balanceOperativoZonas}`,
      `Confianza: ${confianzaZonas}`,
      `Idoneidad: ${idoneidadVistaZonas}`,
    ];

    const texto = [...header, ...tabla, ...resumen].join("\n");

    navigator.clipboard.writeText(texto);
  }

  function copiarResumenUltraZonas() {
    setUsoAccionesZonas((prev) => prev + 1);
    setLastInteractionZonas(Date.now());
    if (!zoneMetrics.length) return;

    const top = topScoreZonas[0];

    const texto = [
      `ZONAS`,
      `Activas: ${totalZonas}`,
      mejorZona
        ? `Top ocupación: ${mejorZona.zoneName} (${Math.round(mejorZona.ocupacion * 100)}%)`
        : `Top ocupación: N/A`,
      peorZona
        ? `Peor ocupación: ${peorZona.zoneName} (${Math.round(peorZona.ocupacion * 100)}%)`
        : `Peor ocupación: N/A`,
      top
        ? `Top score: ${top.zoneName} (${(top.score * 100).toFixed(1)})`
        : `Top score: N/A`,
      `Estado: ${idoneidadVistaZonas}`,
    ].join(" · ");

    navigator.clipboard.writeText(texto);
  }


  if (!zoneMetrics || !Array.isArray(zoneMetrics)) {
    return null;
  }

  const comensalesSectionProps = buildComensalesSectionProps({
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    metrics,
    dailyReservations,
    dailyAttendance,
    formatDateEs,
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
    reservationsCount: reservations.length,
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
  });

  // Fuente real (Firestore): colección `orders`. Se adapta a Ventas vía `buildVentasOrdersAdapter`.
  const ventasOrdersSource: Array<Record<string, unknown>> | null = useMemo(() => {
    if (!Array.isArray(ordersDocs) || ordersDocs.length === 0) return [];
    const fromMs = startOfDayMs(new Date(dateFrom));
    const toMs = endOfDayMs(new Date(dateTo));
    return ordersDocs.filter((o) => {
      const createdAtMs = readFirestoreTsMs(o.createdAt);
      if (createdAtMs == null) return false;
      return createdAtMs >= fromMs && createdAtMs <= toMs;
    });
  }, [ordersDocs, dateFrom, dateTo]);
  const ventasOrders: VentasOrderInput[] = buildVentasOrdersAdapter(ventasOrdersSource);

  const ventasSectionProps = {
    ...buildVentasSectionProps({
      placeholder: TABS[0].placeholder,
      restaurantId: restaurantId ?? undefined,
      orders: ventasOrders,
    }),
    zonasAnalytics,
  };

  const horasSectionProps: HorasAnalyticsSectionProps = {
    placeholder: TABS.find((t) => t.id === "horas")?.placeholder ?? "",
  };

  const productosSectionProps: ProductosAnalyticsSectionProps = {
    placeholder: TABS.find((t) => t.id === "productos")?.placeholder ?? "",
  };

  const analysisTabContentProps = buildAnalysisTabContentProps({
    tab,
    comensalesSectionProps,
    ventasSectionProps,
    horasSectionProps,
    productosSectionProps,
  });

  return (
    <ModulePageShell
      title="Análisis"
      subtitle="Métricas y reportes del negocio"
      maxWidth={1400}
      compactLayout
      operationalFocus
      lockViewport
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <AnalisisTabsBar active={tab} onChange={setTab} />
        </div>

        <AnalysisTabContent {...analysisTabContentProps} />
      </div>
    </ModulePageShell>
  );
}

function AnalisisTabsBar({
  active,
  onChange,
}: {
  active: AnalisisTab;
  onChange: (t: AnalisisTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Secciones de análisis" style={tabBarStyle}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          style={tabButtonStyle(active === t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
