"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type CompraEstado,
  type CompraLocal,
  COMPRA_ESTADOS,
  loadCompras,
  parseCantidadRecibida as coercedCantidadRecibida,
  saveCompras,
} from "@/lib/compras-local";
import { reconcileCompraStock } from "@/lib/compras-stock-sync";
import { STOCK_CHANGED_EVENT, loadStock, saveStock } from "@/lib/stock-local";
import type { Locale } from "@/lib/i18n";

type ListFilter = "todas" | CompraEstado;
type DatePreset = "todas" | "hoy" | "semana" | "mes";
type ListSort = "fecha_desc" | "fecha_asc" | "importe_desc" | "importe_asc";
type OperFocus = "pendientes" | "diferencia" | "sin_factura" | "sin_vincular" | "stock_no" | "lineas_faltantes";

type ValidationPhase = "cancelada" | "pendiente" | "incidencia" | "validada";

const metaHairlineSep: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 8,
  margin: "0 6px",
  background: "rgba(148, 163, 184, 0.16)",
  borderRadius: 1,
  verticalAlign: "middle",
  flexShrink: 0,
};

function todayIsoLocal(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function subtractDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatEuro(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatFechaCorta(iso: string, loc: Locale): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso;
  try {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(loc === "en" ? "en-GB" : "es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compraSinFacturaDoc(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  const n = (c.notas ?? "").trim();
  if (n === "") return true;
  return !/\b(factura|fact\.|albar[aá]n|invoice|ticket|n[ºo]\s*[\w\d-]|#\s*\d)/i.test(n);
}

function stockSyncUiKind(c: CompraLocal): "applied" | "not_applied" | "neutral" {
  if (c.stock_aplicado) return "applied";
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if (c.estado === "recibido" && (c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return "not_applied";
  return "neutral";
}

function hasDiferenciaNotas(c: CompraLocal): boolean {
  const n = normalizeForSearch(c.notas ?? "");
  if (!n) return false;
  return (
    n.includes("diferencia") ||
    n.includes("falta") ||
    n.includes("sobra") ||
    n.includes("discrepancia") ||
    n.includes("incidencia")
  );
}

function missingLinesHint(c: CompraLocal): boolean {
  if (c.estado === "cancelado") return false;
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  return lineItemCount(c) === 0 && total > 0;
}

function blockersAfterReceipt(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  return (
    stockSyncUiKind(c) === "not_applied" ||
    compraSinFacturaDoc(c) ||
    hasDiferenciaNotas(c) ||
    !(c.producto_stock_id ?? "").trim() ||
    missingLinesHint(c)
  );
}

function validationPhase(c: CompraLocal): ValidationPhase {
  if (c.estado === "cancelado") return "cancelada";
  if (c.estado === "pendiente") return "pendiente";
  if (blockersAfterReceipt(c)) return "incidencia";
  return "validada";
}

function hasIncidencia(c: CompraLocal): boolean {
  if (c.estado === "cancelado") return false;
  if (missingLinesHint(c)) return true;
  if (stockSyncUiKind(c) === "not_applied") return true;
  if (hasDiferenciaNotas(c)) return true;
  if (compraSinFacturaDoc(c)) return true;
  if (!(c.producto_stock_id ?? "").trim()) return true;
  return false;
}

function lineItemCount(c: CompraLocal): number {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if ((c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return 1;
  return 0;
}

function estadoLabel(estado: CompraEstado, t: (k: string) => string): string {
  switch (estado) {
    case "pendiente":
      return t("dashboard.compraEstadoPendiente");
    case "recibido":
      return t("dashboard.compraEstadoRecibido");
    default:
      return t("dashboard.compraEstadoCancelado");
  }
}

const estadoLook: Record<CompraEstado, { border: string; bg: string; color: string }> = {
  recibido: {
    border: "rgba(51, 65, 85, 0.45)",
    bg: "rgba(15, 23, 42, 0.55)",
    color: "#9ca3af",
  },
  pendiente: {
    border: "rgba(234, 179, 8, 0.22)",
    bg: "rgba(66, 32, 6, 0.22)",
    color: "#e7d3a0",
  },
  cancelado: {
    border: "rgba(248, 113, 113, 0.22)",
    bg: "rgba(69, 10, 10, 0.2)",
    color: "#d6a4a4",
  },
};

const phaseAccent: Record<ValidationPhase, string> = {
  cancelada: "rgba(148, 163, 184, 0.45)",
  pendiente: "rgba(234, 179, 8, 0.42)",
  incidencia: "rgba(251, 113, 133, 0.52)",
  validada: "rgba(34, 211, 238, 0.55)",
};

function phaseLabels(phase: ValidationPhase, t: (k: string) => string): { title: string; sub: string } {
  switch (phase) {
    case "cancelada":
      return { title: t("recepciones.valPhaseCancelled"), sub: t("recepciones.valSubCancelled") };
    case "pendiente":
      return { title: t("recepciones.valPhasePending"), sub: t("recepciones.valSubPending") };
    case "incidencia":
      return { title: t("recepciones.valPhaseIncident"), sub: t("recepciones.valSubIncident") };
    default:
      return { title: t("recepciones.valPhaseValidated"), sub: t("recepciones.valSubValidated") };
  }
}

type RowIncident = { text: string; tone: "high" | "mid"; pri: number };

function collectRowIncidents(c: CompraLocal, sinF: boolean, sync: ReturnType<typeof stockSyncUiKind>, t: (k: string) => string): RowIncident[] {
  const out: RowIncident[] = [];
  if (sync === "not_applied") out.push({ text: t("recepciones.operStockPending"), tone: "high", pri: 1 });
  if (sinF && c.estado === "recibido") out.push({ text: t("recepciones.rowNoInvoice"), tone: "high", pri: 2 });
  if (hasDiferenciaNotas(c)) out.push({ text: t("recepciones.rowDiff"), tone: "high", pri: 3 });
  if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) out.push({ text: t("recepciones.rowUnlinked"), tone: "mid", pri: 4 });
  if (missingLinesHint(c)) out.push({ text: t("recepciones.rowLinesMissing"), tone: "mid", pri: 5 });
  out.sort((a, b) => a.pri - b.pri);
  return out;
}

function FlowStrip({ c, t }: { c: CompraLocal; t: (k: string) => string }) {
  const cancelled = c.estado === "cancelado";
  const rec = c.estado === "recibido";
  const phase = validationPhase(c);
  const sinF = compraSinFacturaDoc(c);
  const sync = stockSyncUiKind(c);
  const stk = sync === "applied";

  const Step = ({ on, warn, label }: { on: boolean; warn?: boolean; label: string }) => (
    <span
      style={{
        fontSize: 6.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: !on ? "rgba(61, 71, 84, 0.9)" : warn ? "rgba(180, 140, 110, 0.95)" : "rgba(100, 124, 130, 0.95)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );

  const sep = <span style={{ color: "rgba(51, 65, 85, 0.55)", fontSize: 6, fontWeight: 500, userSelect: "none" }}>·</span>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2, flexWrap: "wrap", opacity: 0.92 }} aria-hidden>
      <Step label={t("recepciones.flowPed")} on={!cancelled} />
      {sep}
      <Step label={t("recepciones.flowRec")} on={rec} />
      {sep}
      <Step label={t("recepciones.flowVal")} on={rec} warn={phase === "incidencia"} />
      {sep}
      <Step label={t("recepciones.flowFac")} on={rec && !sinF} warn={rec && sinF} />
      {sep}
      <Step label={t("recepciones.flowStk")} on={rec && (stk || sync === "not_applied")} warn={sync === "not_applied"} />
    </div>
  );
}

function CheckRow({ done, na, label }: { done: boolean; na?: boolean; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid rgba(51, 65, 85, 0.45)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          flexShrink: 0,
          border: na ? "1px dashed rgba(100,116,139,0.35)" : done ? "none" : "1px solid rgba(100,116,139,0.4)",
          background: done ? "rgba(6, 78, 90, 0.38)" : na ? "transparent" : "transparent",
          boxShadow: done ? "inset 0 0 0 1px rgba(34,211,238,0.42)" : undefined,
        }}
      />
      <span style={{ fontSize: 12, color: na ? "#525c6c" : "#94a3b8", lineHeight: 1.35, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export default function RecepcionesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todas");
  const [datePreset, setDatePreset] = useState<DatePreset>("todas");
  const [listSort, setListSort] = useState<ListSort>("fecha_desc");
  const [operFocus, setOperFocus] = useState<OperFocus | null>(null);
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(loadCompras());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => refresh();
    window.addEventListener(STOCK_CHANGED_EVENT, fn);
    return () => window.removeEventListener(STOCK_CHANGED_EVENT, fn);
  }, [refresh]);

  useEffect(() => {
    if (!menuRowId) return;
    const close = () => setMenuRowId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuRowId]);

  const persistCompras = useCallback((next: CompraLocal[]) => {
    setItems(next);
    saveCompras(next);
  }, []);

  const updateEstado = useCallback(
    (id: string, estado: CompraEstado) => {
      const prev = loadCompras().find((c) => c.id === id);
      if (!prev || prev.estado === estado) return;
      const nextRaw: CompraLocal = { ...prev, estado };
      const stock = loadStock();
      const { stock: newStock, compra } = reconcileCompraStock(prev, nextRaw, stock);
      saveStock(newStock);
      const nextList = loadCompras().map((c) => (c.id === id ? compra : c));
      persistCompras(nextList);
    },
    [persistCompras],
  );

  const today = useMemo(() => todayIsoLocal(), []);
  const weekStart = useMemo(() => subtractDaysIso(today, 7), [today]);
  const monthStart = useMemo(() => subtractDaysIso(today, 30), [today]);

  const kpis = useMemo(() => {
    const pend = items.filter((c) => c.estado === "pendiente").length;
    const hoy = items.filter((c) => c.estado === "recibido" && c.fecha === today).length;
    const inc = items.filter(hasIncidencia).length;
    const sinF = items.filter(compraSinFacturaDoc).length;
    return { pend, hoy, inc, sinF };
  }, [items, today]);

  const operCounts = useMemo(() => {
    let pendientes = 0;
    let diferencia = 0;
    let sinFactura = 0;
    let sinVincular = 0;
    let stockNo = 0;
    let lineasFaltantes = 0;
    for (const c of items) {
      if (c.estado === "pendiente") pendientes += 1;
      if (hasDiferenciaNotas(c)) diferencia += 1;
      if (compraSinFacturaDoc(c)) sinFactura += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVincular += 1;
      if (stockSyncUiKind(c) === "not_applied") stockNo += 1;
      if (missingLinesHint(c)) lineasFaltantes += 1;
    }
    return { pendientes, diferencia, sinFactura, sinVincular, stockNo, lineasFaltantes };
  }, [items]);

  const displayedRows = useMemo(() => {
    let list = [...items];
    if (datePreset === "hoy") list = list.filter((c) => c.fecha === today);
    else if (datePreset === "semana") list = list.filter((c) => c.fecha >= weekStart && c.fecha <= today);
    else if (datePreset === "mes") list = list.filter((c) => c.fecha >= monthStart && c.fecha <= today);

    if (listFilter !== "todas") list = list.filter((c) => c.estado === listFilter);

    if (operFocus === "pendientes") list = list.filter((c) => c.estado === "pendiente");
    else if (operFocus === "diferencia") list = list.filter(hasDiferenciaNotas);
    else if (operFocus === "sin_factura") list = list.filter(compraSinFacturaDoc);
    else if (operFocus === "sin_vincular") list = list.filter((c) => c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim());
    else if (operFocus === "stock_no") list = list.filter((c) => stockSyncUiKind(c) === "not_applied");
    else if (operFocus === "lineas_faltantes") list = list.filter(missingLinesHint);

    if (soloIncidencias) list = list.filter(hasIncidencia);

    const q = normalizeForSearch(listSearch);
    if (q) {
      list = list.filter((c) => {
        const blob = [
          c.proveedor,
          c.id,
          c.notas ?? "",
          c.producto_stock_nombre ?? "",
          String(c.total ?? ""),
          c.fecha,
        ]
          .map((x) => normalizeForSearch(String(x)))
          .join(" ");
        return blob.includes(q);
      });
    }

    list.sort((a, b) => {
      const ta = typeof a.total === "number" && Number.isFinite(a.total) ? a.total : 0;
      const tb = typeof b.total === "number" && Number.isFinite(b.total) ? b.total : 0;
      switch (listSort) {
        case "fecha_asc":
          return a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);
        case "importe_desc":
          return tb - ta || b.fecha.localeCompare(a.fecha);
        case "importe_asc":
          return ta - tb || a.fecha.localeCompare(b.fecha);
        case "fecha_desc":
        default:
          return b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id);
      }
    });
    return list;
  }, [
    items,
    listFilter,
    datePreset,
    today,
    weekStart,
    monthStart,
    listSearch,
    listSort,
    operFocus,
    soloIncidencias,
  ]);

  const panelCompra = useMemo(() => (panelId ? items.find((c) => c.id === panelId) ?? null : null), [panelId, items]);

  const gridCols = "30px minmax(88px,1.1fr) 52px 64px minmax(118px,0.95fr) 42px 46px 118px";

  if (!hydrated) {
    return (
      <ModulePageShell title={t("recepciones.title")} subtitle={t("recepciones.loadingSubtitle")} compactLayout lockViewport maxWidth={1200}>
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("recepciones.title")}
      subtitle={t("recepciones.subtitle")}
      maxWidth={1200}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard/compras")}
          style={{
            border: "none",
            background: "linear-gradient(180deg, #0891b2 0%, #0e7490 100%)",
            color: "#ecfeff",
            padding: "7px 14px",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 14px rgba(8, 145, 178, 0.35)",
          }}
        >
          {t("recepciones.ctaRegister")}
        </button>
      }
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {[
            { label: t("recepciones.kpiPending"), sub: t("recepciones.kpiPendingSub"), v: String(kpis.pend), color: "#e7d3a0" },
            { label: t("recepciones.kpiReceivedToday"), sub: t("recepciones.kpiReceivedTodaySub"), v: String(kpis.hoy), color: "#7dd3fc" },
            { label: t("recepciones.kpiIncidents"), sub: t("recepciones.kpiIncidentsSub"), v: String(kpis.inc), color: "#d4b8a8" },
            { label: t("recepciones.kpiNoInvoice"), sub: t("recepciones.kpiNoInvoiceSub"), v: String(kpis.sinF), color: "#b4a8b8" },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                border: "1px solid rgba(51, 65, 85, 0.42)",
                borderRadius: 8,
                background: "linear-gradient(155deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.78) 100%)",
                padding: "7px 10px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontSize: 8, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ marginTop: 2, fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: k.color, letterSpacing: "-0.03em" }}>
                {k.v}
              </div>
              <div style={{ fontSize: 9, color: "#525c6c", marginTop: 1 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "stretch",
            gap: 8,
            overflowX: "auto",
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(34, 211, 238, 0.14)",
            background: "linear-gradient(90deg, rgba(8, 51, 68, 0.4) 0%, rgba(15, 23, 42, 0.55) 100%)",
            boxShadow: "inset 0 1px 0 rgba(34, 211, 238, 0.05)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingRight: 8,
              marginRight: 2,
              borderRight: "1px solid rgba(51, 65, 85, 0.55)",
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 800, color: "#7dd3fc", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("recepciones.operTitle")}</span>
            <span style={{ fontSize: 8, color: "#5c6574", fontWeight: 600, marginTop: 2, lineHeight: 1.25, maxWidth: 132 }}>{t("recepciones.operSubtitle")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            {(
              [
                { id: "pendientes" as const, label: t("recepciones.operPendientes"), n: operCounts.pendientes, shadow: "inset 0 -2px 0 rgba(234, 179, 8, 0.45)" },
                { id: "diferencia" as const, label: t("recepciones.operDiff"), n: operCounts.diferencia, shadow: "inset 0 -2px 0 rgba(251, 146, 60, 0.4)" },
                { id: "sin_factura" as const, label: t("recepciones.operNoInvoice"), n: operCounts.sinFactura, shadow: "inset 0 -2px 0 rgba(248, 113, 113, 0.32)" },
                { id: "sin_vincular" as const, label: t("recepciones.operUnlinked"), n: operCounts.sinVincular, shadow: "inset 0 -2px 0 rgba(129, 140, 248, 0.35)" },
                { id: "stock_no" as const, label: t("recepciones.operStockPending"), n: operCounts.stockNo, shadow: "inset 0 -2px 0 rgba(34, 211, 238, 0.32)" },
                { id: "lineas_faltantes" as const, label: t("recepciones.operLinesMissing"), n: operCounts.lineasFaltantes, shadow: "inset 0 -2px 0 rgba(251, 191, 36, 0.35)" },
              ] as const
            ).map((chip) => {
              const active = operFocus === chip.id;
              const open = chip.n > 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setOperFocus((p) => (p === chip.id ? null : chip.id))}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 9px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    border: active ? "1px solid rgba(34, 211, 238, 0.28)" : "1px solid rgba(51, 65, 85, 0.45)",
                    background: active ? "rgba(12, 74, 90, 0.35)" : "rgba(15, 23, 42, 0.5)",
                    color: active ? "#e0f2fe" : open ? "#cbd5e1" : "#6b7380",
                    boxShadow: active ? chip.shadow : open ? "inset 0 0 0 1px rgba(251, 113, 133, 0.12)" : "none",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: open ? "rgba(251, 113, 133, 0.9)" : "rgba(51, 65, 85, 0.85)",
                      boxShadow: open ? "0 0 0 1px rgba(0,0,0,0.2)" : undefined,
                    }}
                  />
                  <span>{chip.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8, fontSize: 9, fontWeight: 700 }}>{chip.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: 8,
            padding: "5px 8px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            overflowX: "auto",
          }}
        >
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder={t("recepciones.toolbarSearchPlaceholder")}
            style={{
              flex: "1 1 120px",
              minWidth: 100,
              maxWidth: 220,
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#020617",
              color: "#f8fafc",
              fontSize: 11,
              boxSizing: "border-box",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("recepciones.filterStatus")}</span>
            <select
              value={listFilter}
              onChange={(e) => {
                setOperFocus(null);
                setListFilter(e.target.value as ListFilter);
              }}
              style={{
                padding: "4px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("recepciones.filterAll")}</option>
              <option value="pendiente">{t("recepciones.filterPending")}</option>
              <option value="recibido">{t("recepciones.filterReceived")}</option>
              <option value="cancelado">{t("recepciones.filterCancelled")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("recepciones.filterDate")}</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={{
                padding: "4px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("recepciones.dateAll")}</option>
              <option value="hoy">{t("recepciones.dateToday")}</option>
              <option value="semana">{t("recepciones.dateWeek")}</option>
              <option value="mes">{t("recepciones.dateMonth")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("recepciones.sortBy")}</span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              style={{
                padding: "4px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="fecha_desc">{t("recepciones.sortFechaDesc")}</option>
              <option value="fecha_asc">{t("recepciones.sortFechaAsc")}</option>
              <option value="importe_desc">{t("recepciones.sortImporteDesc")}</option>
              <option value="importe_asc">{t("recepciones.sortImporteAsc")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSoloIncidencias((v) => !v)}
            style={{
              flexShrink: 0,
              border: soloIncidencias ? "1px solid rgba(251, 146, 60, 0.35)" : "1px solid rgba(51, 65, 85, 0.55)",
              background: soloIncidencias ? "rgba(120, 53, 15, 0.15)" : "transparent",
              color: soloIncidencias ? "#e7c4a8" : "#6b7380",
              padding: "4px 8px",
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("recepciones.toggleIncidents")}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden", gap: 0 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid rgba(51, 65, 85, 0.55)",
              borderRadius: 10,
              background: "#1e293b",
              boxShadow: "inset 3px 0 0 rgba(34, 211, 238, 0.1)",
            }}
          >
            <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: "1px solid rgba(51,65,85,0.55)" }}>
              <h3 style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.09em", textTransform: "uppercase" }}>
                {t("recepciones.listTitle")}
              </h3>
              <span style={{ fontSize: 10, color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                {t("recepciones.listCount", { shown: displayedRows.length, total: items.length })}
              </span>
            </div>
            {items.length === 0 ? (
              <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>{t("recepciones.emptyNone")}</div>
            ) : displayedRows.length === 0 ? (
              <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>{t("recepciones.emptyFilter")}</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: "2px 5px",
                    alignItems: "center",
                    padding: "4px 6px",
                    background: "linear-gradient(180deg,#1e293b 0%,#1e293bee 100%)",
                    borderBottom: "1px solid rgba(51,65,85,0.65)",
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                >
                  <span>{t("recepciones.colDate")}</span>
                  <span style={{ color: "#94a3b8" }}>{t("recepciones.colSupplier")}</span>
                  <span>{t("recepciones.colOrder")}</span>
                  <span style={{ textAlign: "right", color: "#cbd5e1" }}>{t("recepciones.colAmount")}</span>
                  <span style={{ color: "#6bb8b0" }}>{t("recepciones.colValidation")}</span>
                  <span>{t("recepciones.colInvoice")}</span>
                  <span>{t("recepciones.colStock")}</span>
                  <span style={{ textAlign: "right" }}>{t("recepciones.colActions")}</span>
                </div>
                <div style={{ padding: "2px 4px 4px", display: "flex", flexDirection: "column", gap: 1 }}>
                  {displayedRows.map((c) => {
                    const look = estadoLook[c.estado];
                    const sync = stockSyncUiKind(c);
                    const sinF = compraSinFacturaDoc(c);
                    const phase = validationPhase(c);
                    const accent = phaseAccent[phase];
                    const { title: phaseTitle, sub: phaseSub } = phaseLabels(phase, t);
                    const nItems = lineItemCount(c);
                    const itemStr = nItems === 0 ? t("recepciones.rowItemsNone") : nItems === 1 ? t("recepciones.rowItemsOne") : t("recepciones.rowItemsMany", { count: nItems });
                    const notas = (c.notas ?? "").trim();
                    const refSnippet = notas ? (notas.length > 28 ? `${notas.slice(0, 26)}…` : notas) : "";
                    const incidents = collectRowIncidents(c, sinF, sync, t);
                    const primaryIncident = incidents[0];
                    const extraIncidents = incidents.length - 1;
                    const incidentsTitle = incidents.map((i) => i.text).join(" · ");
                    const orderLabel = `${t("recepciones.orderRef")} · ${c.id.slice(-6)}`;
                    const rowInset = phase === "incidencia" ? "inset 2px 0 0 rgba(251, 113, 133, 0.28)" : undefined;
                    const validatePrimary = phase === "pendiente" || phase === "incidencia";

                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: "2px 5px",
                          alignItems: "center",
                          padding: "2px 5px",
                          borderRadius: 5,
                          border: "1px solid rgba(51, 65, 85, 0.38)",
                          background: phase === "incidencia" ? "rgba(30, 15, 20, 0.35)" : "rgba(15, 23, 42, 0.32)",
                          ...(rowInset ? { boxShadow: rowInset } : {}),
                        }}
                      >
                        <span style={{ fontSize: 8.5, color: "#64748b", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{formatFechaCorta(c.fecha, locale)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{c.proveedor}</div>
                          <div style={{ marginTop: 1, display: "flex", flexWrap: "wrap", alignItems: "baseline", rowGap: 0, columnGap: 0 }}>
                            <span style={{ fontSize: 8, color: "#7d8698", fontWeight: 500 }}>{itemStr}</span>
                            {refSnippet ? (
                              <>
                                <span style={metaHairlineSep} aria-hidden />
                                <span style={{ fontSize: 8, color: "#525c6c", fontWeight: 500 }}>
                                  {t("recepciones.rowAlbaran")} {refSnippet}
                                </span>
                              </>
                            ) : null}
                            {primaryIncident ? (
                              <>
                                <span style={metaHairlineSep} aria-hidden />
                                <span
                                  title={extraIncidents > 0 ? incidentsTitle : undefined}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 3, maxWidth: "100%" }}
                                >
                                  <span
                                    style={{
                                      fontSize: 8,
                                      fontWeight: 700,
                                      letterSpacing: "0.01em",
                                      color: primaryIncident.tone === "high" ? "#e8a598" : "#b0a078",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {primaryIncident.text}
                                  </span>
                                  {extraIncidents > 0 ? (
                                    <span style={{ fontSize: 7.5, fontWeight: 600, color: "#5c6574", flexShrink: 0 }}>
                                      {t("recepciones.incidentsMore", { count: extraIncidents })}
                                    </span>
                                  ) : null}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <FlowStrip c={c} t={t} />
                        </div>
                        <span style={{ fontSize: 8, color: "#5c6574", fontVariantNumeric: "tabular-nums", fontWeight: 600 }} title={c.id}>
                          {orderLabel}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", textAlign: "right", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                          {formatEuro(typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0, locale)}
                        </span>
                        <div
                          title={`${phaseTitle} — ${phaseSub}`}
                          style={{
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "1px 0 1px 4px",
                            borderRadius: 4,
                            border: "1px solid rgba(51, 65, 85, 0.45)",
                            background: "rgba(15, 23, 42, 0.55)",
                            borderLeft: `2px solid ${accent}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 7.5,
                              fontWeight: 700,
                              color: "#cbd5e1",
                              letterSpacing: "0.02em",
                              flexShrink: 0,
                              maxWidth: 68,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              lineHeight: 1.2,
                            }}
                          >
                            {phaseTitle}
                          </span>
                          <select
                            value={c.estado}
                            onChange={(e) => updateEstado(c.id, e.target.value as CompraEstado)}
                            aria-label={t("recepciones.ariaEstado", { supplier: c.proveedor })}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: "1px 3px",
                              fontSize: 8,
                              fontWeight: 600,
                              borderRadius: 3,
                              border: `1px solid ${look.border}`,
                              background: look.bg,
                              color: look.color,
                              cursor: "pointer",
                              boxSizing: "border-box",
                              lineHeight: 1.2,
                            }}
                          >
                            {COMPRA_ESTADOS.map((e) => (
                              <option key={e} value={e}>
                                {estadoLabel(e, t)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                            color: c.estado !== "recibido" ? "#4a5160" : sinF ? "#c99a8e" : "#6b9d9a",
                          }}
                        >
                          {c.estado === "recibido" ? (sinF ? t("recepciones.invoiceMissing") : t("recepciones.invoiceOk")) : "—"}
                        </span>
                        <span
                          style={{
                            fontSize: 7.5,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: sync === "applied" ? "#6b9d9a" : sync === "not_applied" ? "#c99a8e" : "#4a5160",
                          }}
                        >
                          {sync === "applied" ? t("recepciones.stockOk") : sync === "not_applied" ? t("recepciones.stockPending") : t("recepciones.stockNA")}
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: "1px solid rgba(51, 65, 85, 0.55)",
                              background: "transparent",
                              color: "#8da4b0",
                              padding: "1px 4px",
                              borderRadius: 3,
                              fontSize: 8,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {t("recepciones.actionInvoice")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: validatePrimary ? "1px solid rgba(34, 211, 238, 0.32)" : "1px solid rgba(51, 65, 85, 0.5)",
                              background: validatePrimary ? "rgba(8, 51, 68, 0.28)" : "transparent",
                              color: validatePrimary ? "#8ec5d4" : "#6b7380",
                              padding: "1px 4px",
                              borderRadius: 3,
                              fontSize: 8,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {t("recepciones.actionValidatePrimary")}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push("/dashboard/compras")}
                            style={{
                              border: "1px solid rgba(51, 65, 85, 0.5)",
                              background: "transparent",
                              color: "#7a8794",
                              padding: "1px 4px",
                              borderRadius: 3,
                              fontSize: 8,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {t("recepciones.actionStock")}
                          </button>
                          <div style={{ position: "relative", display: "inline-flex" }}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuRowId((p) => (p === c.id ? null : c.id));
                              }}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#5c6574",
                                padding: "1px 3px",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              {t("recepciones.actionMore")}
                            </button>
                            {menuRowId === c.id ? (
                              <div
                                role="menu"
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: "100%",
                                  zIndex: 40,
                                  minWidth: 140,
                                  borderRadius: 8,
                                  border: "1px solid #334155",
                                  background: "#020617",
                                  boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
                                  padding: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuRowId(null);
                                    router.push("/dashboard/compras");
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#cbd5e1",
                                    textAlign: "left",
                                    width: "100%",
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("recepciones.menuEditCompra")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {panelCompra ? (
            <aside
              style={{
                width: 300,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                border: "1px solid rgba(34, 211, 238, 0.14)",
                borderRadius: 10,
                marginLeft: 8,
                background: "#0f172a",
                overflow: "hidden",
                boxShadow: "inset 0 1px 0 rgba(34, 211, 238, 0.04)",
              }}
            >
              <div style={{ flexShrink: 0, padding: "8px 10px", borderBottom: "1px solid rgba(51,65,85,0.55)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{t("recepciones.panelTitle")}</h2>
                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    border: "1px solid #334155",
                    background: "#020617",
                    color: "#94a3b8",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("recepciones.panelClose")}
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{t("recepciones.panelSummary")}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{panelCompra.proveedor}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                  {formatFechaCorta(panelCompra.fecha, locale)} · {formatEuro(typeof panelCompra.total === "number" ? panelCompra.total : 0, locale)}
                </div>
                <div style={{ marginTop: 10, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("recepciones.panelState")}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#cbd5e1", fontWeight: 600 }}>{estadoLabel(panelCompra.estado, t)}</div>

                <div style={{ marginTop: 14, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("recepciones.panelChecklist")}</div>
                <div style={{ marginTop: 4 }}>
                  <CheckRow done={panelCompra.estado === "recibido"} na={panelCompra.estado === "cancelado"} label={t("recepciones.panelCheckGoods")} />
                  <CheckRow
                    done={panelCompra.estado === "recibido" && !compraSinFacturaDoc(panelCompra)}
                    na={panelCompra.estado !== "recibido"}
                    label={t("recepciones.panelCheckDoc")}
                  />
                  <CheckRow
                    done={!!panelCompra.stock_aplicado}
                    na={panelCompra.estado !== "recibido" || stockSyncUiKind(panelCompra) === "neutral"}
                    label={t("recepciones.panelCheckStock")}
                  />
                  <CheckRow done={!hasDiferenciaNotas(panelCompra)} label={t("recepciones.panelCheckNoIncident")} />
                </div>

                <div style={{ marginTop: 16, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("recepciones.panelInvoiceZone")}</div>
                <div
                  style={{
                    marginTop: 6,
                    minHeight: 72,
                    borderRadius: 8,
                    border: "1px dashed rgba(100, 116, 139, 0.35)",
                    background: "rgba(15, 23, 42, 0.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{t("recepciones.panelInvoiceHint")}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    border: "1px solid rgba(34, 211, 238, 0.28)",
                    background: "linear-gradient(180deg, rgba(8, 51, 68, 0.55) 0%, rgba(15, 23, 42, 0.85) 100%)",
                    color: "#e0f2fe",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: "0 2px 12px rgba(8, 145, 178, 0.15)",
                  }}
                >
                  {t("recepciones.panelValidateCta")}
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
