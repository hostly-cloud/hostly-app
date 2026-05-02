"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
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
  height: 9,
  margin: "0 7px",
  background: "rgba(148, 163, 184, 0.12)",
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
    border: "rgba(148, 163, 184, 0.45)",
    bg: "rgba(15, 23, 42, 0.88)",
    color: "#e2e8f0",
  },
  pendiente: {
    border: "rgba(251, 191, 36, 0.55)",
    bg: "rgba(66, 32, 6, 0.42)",
    color: "#fffbeb",
  },
  cancelado: {
    border: "rgba(252, 165, 165, 0.45)",
    bg: "rgba(69, 10, 10, 0.36)",
    color: "#ffe4e6",
  },
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

function CheckRow({ done, na, label }: { done: boolean; na?: boolean; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid rgba(51, 65, 85, 0.4)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          flexShrink: 0,
          border: na ? "1px dashed rgba(100,116,139,0.4)" : done ? "none" : "1px solid rgba(100,116,139,0.45)",
          background: done ? "rgba(6, 78, 90, 0.45)" : na ? "transparent" : "transparent",
          boxShadow: done ? "inset 0 0 0 2px rgba(34,211,238,0.45)" : undefined,
        }}
      />
      <span style={{ fontSize: 13, color: na ? "#64748b" : "#cbd5e1", lineHeight: 1.4, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

type RecepBadgeVariant = "neutral" | "ok" | "warn" | "bad" | "muted";

function RecepOperBadge({ label, value, variant }: { label: string; value: string; variant: RecepBadgeVariant }) {
  const pal: Record<RecepBadgeVariant, { bd: string; bg: string; lab: string; val: string }> = {
    neutral: {
      bd: "rgba(71, 85, 105, 0.55)",
      bg: "rgba(15, 23, 42, 0.72)",
      lab: "#64748b",
      val: "#e2e8f0",
    },
    ok: {
      bd: "rgba(45, 212, 191, 0.38)",
      bg: "rgba(6, 78, 59, 0.28)",
      lab: "#5eead4",
      val: "#ccfbf1",
    },
    warn: {
      bd: "rgba(251, 191, 36, 0.5)",
      bg: "rgba(120, 53, 15, 0.28)",
      lab: "#fcd34d",
      val: "#fffbeb",
    },
    bad: {
      bd: "rgba(248, 113, 113, 0.45)",
      bg: "rgba(127, 29, 29, 0.26)",
      lab: "#fca5a5",
      val: "#fecaca",
    },
    muted: {
      bd: "rgba(51, 65, 85, 0.5)",
      bg: "rgba(15, 23, 42, 0.45)",
      lab: "#64748b",
      val: "#94a3b8",
    },
  };
  const c = pal[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: c.lab,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: c.val,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </span>
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
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);

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

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("recepciones.title")}
        subtitle={t("recepciones.loadingSubtitle")}
        compactLayout
        denseWorkbench
        operationalFocus
        lockViewport
        maxWidth={1380}
      >
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("recepciones.title")}
      subtitle={t("recepciones.subtitle")}
      maxWidth={1380}
      compactLayout
      denseWorkbench
      operationalFocus
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard/compras")}
          style={{
            border: "1px solid rgba(34, 211, 238, 0.4)",
            background: "rgba(8, 51, 68, 0.45)",
            color: "#a5f3fc",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            minHeight: 44,
            whiteSpace: "nowrap",
            touchAction: "manipulation",
          }}
        >
          {t("recepciones.ctaRegister")}
        </button>
      }
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .hostly-recep-chip {
              transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
              touch-action: manipulation;
            }
            .hostly-recep-chip.hostly-recep-chip-idle:hover {
              border-color: rgba(34, 211, 238, 0.28) !important;
              background: rgba(12, 74, 90, 0.28) !important;
              color: #e0f2fe !important;
            }
            .hostly-recep-chip.hostly-recep-chip-idle:active { transform: scale(0.98); }
            .hostly-recep-chip.hostly-recep-chip-on:hover { filter: brightness(1.06); }
            .hostly-recep-chip.hostly-recep-chip-on:active { transform: scale(0.98); }
          `,
        }}
      />
      <div
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingTop: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 5,
          }}
        >
          {[
            { label: t("recepciones.kpiPending"), sub: t("recepciones.kpiPendingSub"), v: String(kpis.pend), color: "#fcd34d" },
            { label: t("recepciones.kpiReceivedToday"), sub: t("recepciones.kpiReceivedTodaySub"), v: String(kpis.hoy), color: "#7dd3fc" },
            { label: t("recepciones.kpiIncidents"), sub: t("recepciones.kpiIncidentsSub"), v: String(kpis.inc), color: "#fca5a5" },
            { label: t("recepciones.kpiNoInvoice"), sub: t("recepciones.kpiNoInvoiceSub"), v: String(kpis.sinF), color: "#c4b5fd" },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                border: "1px solid rgba(51, 65, 85, 0.42)",
                borderRadius: 10,
                background: "linear-gradient(155deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.78) 100%)",
                padding: "8px 10px",
                minHeight: 58,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                boxSizing: "border-box",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#94a3b8",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 18,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color: k.color,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.08,
                  textShadow: "0 1px 14px rgba(0,0,0,0.35)",
                }}
              >
                {k.v}
              </div>
              <div style={{ fontSize: 9, color: "#64748b", marginTop: 2, lineHeight: 1.3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflowX: "auto",
            overflowY: "hidden",
            padding: "5px 8px",
            borderRadius: 10,
            border: "1px solid rgba(34, 211, 238, 0.18)",
            background: "linear-gradient(90deg, rgba(8, 51, 68, 0.42) 0%, rgba(15, 23, 42, 0.6) 100%)",
            boxShadow: "inset 0 1px 0 rgba(34, 211, 238, 0.06)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingRight: 10,
              marginRight: 2,
              borderRight: "1px solid rgba(51, 65, 85, 0.5)",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: "#7dd3fc", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("recepciones.operTitle")}
            </span>
            <span style={{ fontSize: 9, color: "#64748b", fontWeight: 600, marginTop: 2, lineHeight: 1.3, maxWidth: 150 }}>
              {t("recepciones.operSubtitle")}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 0,
            }}
          >
            {(
              [
                {
                  id: "pendientes" as const,
                  label: t("recepciones.operPendientes"),
                  n: operCounts.pendientes,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(234, 179, 8, 0.35)",
                    background: "rgba(66, 32, 6, 0.35)",
                    color: "#fef3c7",
                    boxShadow: "inset 0 -2px 0 rgba(234, 179, 8, 0.45)",
                  },
                },
                {
                  id: "diferencia" as const,
                  label: t("recepciones.operDiff"),
                  n: operCounts.diferencia,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(251, 146, 60, 0.35)",
                    background: "rgba(67, 20, 7, 0.3)",
                    color: "#fed7aa",
                    boxShadow: "inset 0 -2px 0 rgba(251, 146, 60, 0.4)",
                  },
                },
                {
                  id: "sin_factura" as const,
                  label: t("recepciones.operNoInvoice"),
                  n: operCounts.sinFactura,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(248, 113, 113, 0.32)",
                    background: "rgba(50, 15, 15, 0.32)",
                    color: "#fecaca",
                    boxShadow: "inset 0 -2px 0 rgba(248, 113, 113, 0.32)",
                  },
                },
                {
                  id: "sin_vincular" as const,
                  label: t("recepciones.operUnlinked"),
                  n: operCounts.sinVincular,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(129, 140, 248, 0.38)",
                    background: "rgba(30, 27, 60, 0.38)",
                    color: "#e0e7ff",
                    boxShadow: "inset 0 -2px 0 rgba(129, 140, 248, 0.35)",
                  },
                },
                {
                  id: "stock_no" as const,
                  label: t("recepciones.operStockPending"),
                  n: operCounts.stockNo,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(34, 211, 238, 0.35)",
                    background: "rgba(8, 51, 68, 0.38)",
                    color: "#cffafe",
                    boxShadow: "inset 0 -2px 0 rgba(34, 211, 238, 0.32)",
                  },
                },
                {
                  id: "lineas_faltantes" as const,
                  label: t("recepciones.operLinesMissing"),
                  n: operCounts.lineasFaltantes,
                  idle: { border: "1px solid rgba(51, 65, 85, 0.5)", background: "rgba(15, 23, 42, 0.55)", color: "#a8b0c0" },
                  act: {
                    border: "1px solid rgba(251, 191, 36, 0.4)",
                    background: "rgba(55, 40, 10, 0.32)",
                    color: "#fde68a",
                    boxShadow: "inset 0 -2px 0 rgba(251, 191, 36, 0.35)",
                  },
                },
              ] as const
            ).map((chip) => {
              const active = operFocus === chip.id;
              const open = chip.n > 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`hostly-recep-chip ${active ? "hostly-recep-chip-on" : "hostly-recep-chip-idle"}`}
                  onClick={() => setOperFocus((p) => (p === chip.id ? null : chip.id))}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    minHeight: 36,
                    boxSizing: "border-box",
                    boxShadow: active ? undefined : open ? "inset 0 1px 0 rgba(255,255,255,0.04)" : undefined,
                    ...(active ? chip.act : { ...chip.idle, color: open ? chip.idle.color : "#5c6474" }),
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: open ? "rgba(251, 113, 133, 0.95)" : "rgba(51, 65, 85, 0.85)",
                      boxShadow: open ? "0 0 0 1px rgba(0,0,0,0.25)" : undefined,
                    }}
                  />
                  <span>{chip.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85, fontSize: 12, fontWeight: 800 }}>{chip.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="search"
          style={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#0f172a",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder={t("recepciones.toolbarSearchPlaceholder")}
            aria-label={t("recepciones.toolbarSearchPlaceholder")}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: "160px",
              minWidth: 140,
              minHeight: 36,
              padding: "7px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#020617",
              color: "#f8fafc",
              fontSize: 14,
              boxSizing: "border-box",
              touchAction: "manipulation",
            }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              fontSize: 11,
              color: "#64748b",
              minHeight: 36,
            }}
          >
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {t("recepciones.filterStatus")}
            </span>
            <select
              value={listFilter}
              onChange={(e) => {
                setOperFocus(null);
                setListFilter(e.target.value as ListFilter);
              }}
              style={{
                padding: "6px 9px",
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#020617",
                color: "#e2e8f0",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 36,
                maxWidth: 160,
                boxSizing: "border-box",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <option value="todas">{t("recepciones.filterAll")}</option>
              <option value="pendiente">{t("recepciones.filterPending")}</option>
              <option value="recibido">{t("recepciones.filterReceived")}</option>
              <option value="cancelado">{t("recepciones.filterCancelled")}</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              fontSize: 11,
              color: "#64748b",
              minHeight: 36,
            }}
          >
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {t("recepciones.filterDate")}
            </span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={{
                padding: "6px 9px",
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#020617",
                color: "#e2e8f0",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 36,
                boxSizing: "border-box",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <option value="todas">{t("recepciones.dateAll")}</option>
              <option value="hoy">{t("recepciones.dateToday")}</option>
              <option value="semana">{t("recepciones.dateWeek")}</option>
              <option value="mes">{t("recepciones.dateMonth")}</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              fontSize: 11,
              color: "#64748b",
              minHeight: 36,
            }}
          >
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {t("recepciones.sortBy")}
            </span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              style={{
                padding: "6px 9px",
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#020617",
                color: "#e2e8f0",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 36,
                maxWidth: 200,
                boxSizing: "border-box",
                cursor: "pointer",
                touchAction: "manipulation",
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
              border: soloIncidencias ? "1px solid rgba(251, 146, 60, 0.45)" : "1px solid rgba(51, 65, 85, 0.55)",
              background: soloIncidencias ? "rgba(120, 53, 15, 0.22)" : "transparent",
              color: soloIncidencias ? "#fde68a" : "#94a3b8",
              padding: "6px 11px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              minHeight: 36,
              boxSizing: "border-box",
              touchAction: "manipulation",
            }}
          >
            {t("recepciones.toggleIncidents")}
          </button>
        </div>

        <div
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "row",
            overflow: "hidden",
            gap: 6,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid rgba(51, 65, 85, 0.5)",
              borderRadius: 12,
              background: "linear-gradient(180deg, #1e293b 0%, #1a2332 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), inset 3px 0 0 rgba(34, 211, 238, 0.12)",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                padding: "7px 10px",
                borderBottom: "1px solid rgba(51,65,85,0.4)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("recepciones.listTitle")}</h2>
                <p style={OPER_PRIMARY_COUNT_META}>
                  {t("recepciones.listCount", { shown: displayedRows.length, total: items.length })}
                </p>
              </div>
            </div>
            {items.length === 0 ? (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "#94a3b8",
                  fontSize: 13,
                }}
              >
                {t("recepciones.emptyNone")}
              </div>
            ) : displayedRows.length === 0 ? (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "#94a3b8",
                  fontSize: 13,
                }}
              >
                {t("recepciones.emptyFilter")}
              </div>
            ) : (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflow: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <div style={{ padding: "8px 8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {displayedRows.map((c) => {
                    const look = estadoLook[c.estado];
                    const sync = stockSyncUiKind(c);
                    const sinF = compraSinFacturaDoc(c);
                    const phase = validationPhase(c);
                    const { title: phaseTitle, sub: phaseSub } = phaseLabels(phase, t);
                    const nItems = lineItemCount(c);
                    const itemStr = nItems === 0 ? t("recepciones.rowItemsNone") : nItems === 1 ? t("recepciones.rowItemsOne") : t("recepciones.rowItemsMany", { count: nItems });
                    const notas = (c.notas ?? "").trim();
                    const refSnippet = notas ? (notas.length > 36 ? `${notas.slice(0, 34)}…` : notas) : "";
                    const incidents = collectRowIncidents(c, sinF, sync, t);
                    const primaryIncident = incidents[0];
                    const extraIncidents = incidents.length - 1;
                    const incidentsTitle = incidents.map((i) => i.text).join(" · ");
                    const orderLabel = `${t("recepciones.orderRef")} · ${c.id.slice(-6)}`;
                    const validatePrimary = phase === "pendiente" || phase === "incidencia";
                    const selected = panelId === c.id;
                    const hovered = hoverRowId === c.id;
                    const attention = hasIncidencia(c);
                    const sinVin = c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim();
                    const boost: "high" | "mid" | "low" = attention
                      ? "high"
                      : (sinF && c.estado === "recibido") || sync === "not_applied" || sinVin
                        ? "mid"
                        : "low";

                    let rowBg: string = "rgba(15, 23, 42, 0.55)";
                    let rowInset = "inset 3px 0 0 rgba(34, 211, 238, 0.42)";
                    let rowGlow = "0 6px 22px rgba(0,0,0,0.22)";
                    if (boost === "high") {
                      rowBg = "linear-gradient(135deg, rgba(69, 26, 3, 0.38) 0%, rgba(50, 15, 22, 0.48) 100%)";
                      rowInset = "inset 4px 0 0 rgba(249, 115, 22, 0.9)";
                      rowGlow = "0 0 0 1px rgba(251, 146, 60, 0.22), 0 8px 30px rgba(0,0,0,0.3)";
                    } else if (boost === "mid") {
                      rowBg = "rgba(45, 35, 10, 0.36)";
                      rowInset = "inset 3px 0 0 rgba(234, 179, 8, 0.78)";
                      rowGlow = "0 0 0 1px rgba(234, 179, 8, 0.14), 0 6px 22px rgba(0,0,0,0.22)";
                    }

                    const invVariant: RecepBadgeVariant =
                      c.estado !== "recibido" ? "muted" : sinF ? "bad" : "ok";
                    const invVal =
                      c.estado !== "recibido" ? "—" : sinF ? t("recepciones.invoiceMissing") : t("recepciones.invoiceOk");
                    const stkVariant: RecepBadgeVariant =
                      sync === "applied" ? "ok" : sync === "not_applied" ? "warn" : "muted";
                    const stkVal = sync === "applied" ? t("recepciones.stockOk") : sync === "not_applied" ? t("recepciones.stockPending") : t("recepciones.stockNA");
                    const pedVariant: RecepBadgeVariant =
                      c.estado === "pendiente" ? "warn" : c.estado === "recibido" ? "ok" : "muted";

                    const borderColor = selected
                      ? "rgba(34, 211, 238, 0.55)"
                      : hovered
                        ? "rgba(148, 163, 184, 0.42)"
                        : boost === "high"
                          ? "rgba(251, 146, 60, 0.35)"
                          : "rgba(51, 65, 85, 0.55)";

                    return (
                      <div
                        key={c.id}
                        role="presentation"
                        onClick={() => {
                          setMenuRowId(null);
                          setPanelId(c.id);
                        }}
                        onMouseEnter={() => setHoverRowId(c.id)}
                        onMouseLeave={() => setHoverRowId(null)}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "stretch",
                          gap: 14,
                          padding: "14px 14px 16px",
                          borderRadius: 14,
                          border: `1px solid ${borderColor}`,
                          background: rowBg,
                          boxShadow: `${rowInset}, ${rowGlow}`,
                          cursor: "pointer",
                          touchAction: "manipulation",
                          boxSizing: "border-box",
                          transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
                        }}
                      >
                        {/* Identidad */}
                        <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div
                            style={{
                              fontSize: 19,
                              fontWeight: 800,
                              color: "#f8fafc",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              lineHeight: 1.2,
                              letterSpacing: "-0.025em",
                            }}
                          >
                            {c.proveedor}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#8896ab", fontVariantNumeric: "tabular-nums" }}>
                            {formatFechaCorta(c.fecha, locale)}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", fontVariantNumeric: "tabular-nums" }} title={c.id}>
                            {orderLabel}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: 6,
                              rowGap: 6,
                              paddingTop: 4,
                              borderTop: "1px solid rgba(148, 163, 184, 0.12)",
                            }}
                          >
                            <span style={{ fontSize: 10, color: "#7c8799", fontWeight: 600 }}>{itemStr}</span>
                            {refSnippet ? (
                              <>
                                <span style={metaHairlineSep} aria-hidden />
                                <span style={{ fontSize: 10, color: "#5f6b7c", fontWeight: 500 }}>
                                  {t("recepciones.rowAlbaran")} {refSnippet}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                            <RecepOperBadge label={t("recepciones.badgeLabelFactura")} value={invVal} variant={invVariant} />
                            <RecepOperBadge label={t("recepciones.badgeLabelStock")} value={stkVal} variant={stkVariant} />
                            <RecepOperBadge label={t("recepciones.badgeLabelPedido")} value={estadoLabel(c.estado, t)} variant={pedVariant} />
                          </div>
                        </div>

                        {/* Estado operativo */}
                        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
                          {attention ? (
                            <div
                              role="status"
                              style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(251, 146, 60, 0.45)",
                                background: "linear-gradient(180deg, rgba(127, 29, 29, 0.35) 0%, rgba(69, 26, 3, 0.4) 100%)",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }} aria-hidden>
                                  ⚠️
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 800,
                                      color: "#fed7aa",
                                      letterSpacing: "-0.02em",
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {t("recepciones.rowIncidentHeadline")}
                                  </div>
                                  {primaryIncident ? (
                                    <div
                                      style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#fecaca", lineHeight: 1.35 }}
                                      title={extraIncidents > 0 ? incidentsTitle : undefined}
                                    >
                                      {primaryIncident.text}
                                      {extraIncidents > 0 ? (
                                        <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                                          {" "}
                                          {t("recepciones.incidentsMore", { count: extraIncidents })}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                              {t("recepciones.colAmount")}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 24,
                                fontWeight: 800,
                                color: "#fffbeb",
                                fontVariantNumeric: "tabular-nums",
                                letterSpacing: "-0.03em",
                                lineHeight: 1.1,
                                textShadow: "0 0 28px rgba(251, 191, 36, 0.15)",
                              }}
                            >
                              {formatEuro(typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0, locale)}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", lineHeight: 1.35 }}>
                            <span style={{ color: "#cbd5e1" }}>{phaseTitle}</span>
                            <span style={{ color: "#64748b", fontWeight: 600 }}> · {phaseSub}</span>
                          </div>
                        </div>

                        {/* Acciones */}
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            flex: "0 1 200px",
                            minWidth: 168,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            alignItems: "stretch",
                            justifyContent: "center",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              width: "100%",
                              border: "none",
                              borderRadius: 12,
                              padding: "13px 16px",
                              fontSize: 14,
                              fontWeight: 800,
                              letterSpacing: "0.02em",
                              cursor: "pointer",
                              boxSizing: "border-box",
                              touchAction: "manipulation",
                              color: validatePrimary ? "#042f2e" : "#e2e8f0",
                              background: validatePrimary
                                ? "linear-gradient(180deg, #2dd4bf 0%, #14b8a6 48%, #0d9488 100%)"
                                : "rgba(51, 65, 85, 0.45)",
                              boxShadow: validatePrimary
                                ? "0 4px 18px rgba(20, 184, 166, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)"
                                : "inset 0 1px 0 rgba(255,255,255,0.06)",
                            }}
                          >
                            {t("recepciones.actionValidatePrimary")}
                          </button>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => setPanelId(c.id)}
                              style={{
                                border: "1px solid rgba(148, 163, 184, 0.35)",
                                background: "rgba(15, 23, 42, 0.5)",
                                color: "#cbd5e1",
                                padding: "8px 12px",
                                borderRadius: 10,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                minHeight: 40,
                                boxSizing: "border-box",
                                whiteSpace: "nowrap",
                                touchAction: "manipulation",
                              }}
                            >
                              {t("recepciones.actionInvoice")}
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push("/dashboard/compras")}
                              style={{
                                border: "1px solid rgba(51, 65, 85, 0.55)",
                                background: "transparent",
                                color: "#7c8a9e",
                                padding: "8px 10px",
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                minHeight: 40,
                                boxSizing: "border-box",
                                whiteSpace: "nowrap",
                                touchAction: "manipulation",
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
                                aria-expanded={menuRowId === c.id}
                                style={{
                                  border: "1px solid rgba(71, 85, 105, 0.5)",
                                  background: "rgba(15, 23, 42, 0.35)",
                                  color: "#94a3b8",
                                  padding: "0 10px",
                                  minWidth: 40,
                                  minHeight: 40,
                                  fontSize: 17,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  borderRadius: 10,
                                  boxSizing: "border-box",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  touchAction: "manipulation",
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
                                    top: "calc(100% + 8px)",
                                    zIndex: 40,
                                    minWidth: 200,
                                    borderRadius: 12,
                                    border: "1px solid #334155",
                                    background: "#020617",
                                    boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
                                    padding: 8,
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
                                      padding: "14px 16px",
                                      borderRadius: 10,
                                      fontSize: 14,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      minHeight: 48,
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    {t("recepciones.menuEditCompra")}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <select
                            value={c.estado}
                            onChange={(e) => updateEstado(c.id, e.target.value as CompraEstado)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("recepciones.ariaEstado", { supplier: c.proveedor })}
                            style={{
                              width: "100%",
                              minWidth: 0,
                              minHeight: 36,
                              padding: "6px 8px",
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 8,
                              border: `1px solid ${look.border}`,
                              background: look.bg,
                              color: look.color,
                              opacity: 0.92,
                              cursor: "pointer",
                              boxSizing: "border-box",
                              lineHeight: 1.2,
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                            }}
                          >
                            {COMPRA_ESTADOS.map((e) => (
                              <option key={e} value={e}>
                                {estadoLabel(e, t)}
                              </option>
                            ))}
                          </select>
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
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: "clamp(360px, 34vw, 480px)",
                maxWidth: "100%",
                minWidth: 300,
                display: "flex",
                flexDirection: "column",
                border: "1px solid rgba(34, 211, 238, 0.22)",
                borderRadius: 12,
                background: "linear-gradient(180deg, #0f172a 0%, #0c1222 100%)",
                overflow: "hidden",
                boxShadow: "inset 0 1px 0 rgba(34, 211, 238, 0.06), 0 4px 24px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(51,65,85,0.45)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                    {t("recepciones.panelTitle")}
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8", fontWeight: 600, lineHeight: 1.35 }}>{panelCompra.proveedor}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    flexShrink: 0,
                    border: "1px solid #334155",
                    background: "#020617",
                    color: "#cbd5e1",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 44,
                    boxSizing: "border-box",
                    touchAction: "manipulation",
                  }}
                >
                  {t("recepciones.panelClose")}
                </button>
              </div>
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  padding: "12px 12px 14px",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(51, 65, 85, 0.5)",
                    background: "rgba(15, 23, 42, 0.65)",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                    {t("recepciones.panelSummary")}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fffbeb", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                    {formatEuro(typeof panelCompra.total === "number" ? panelCompra.total : 0, locale)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", fontWeight: 600, lineHeight: 1.45 }}>
                    {formatFechaCorta(panelCompra.fecha, locale)} · {t("recepciones.orderRef")} · {panelCompra.id.slice(-6)}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {t("recepciones.panelState")}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>{estadoLabel(panelCompra.estado, t)}</div>
                </div>

                <div style={{ fontSize: 9, fontWeight: 700, color: "#5eead4", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                  {t("recepciones.panelChecklist")}
                </div>
                <div style={{ marginBottom: 12, borderTop: "1px solid rgba(51, 65, 85, 0.35)", paddingTop: 2 }}>
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

                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                  {t("recepciones.panelInvoiceZone")}
                </div>
                <div
                  style={{
                    minHeight: 72,
                    borderRadius: 10,
                    border: "1px dashed rgba(100, 116, 139, 0.4)",
                    background: "rgba(15, 23, 42, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, fontWeight: 500 }}>{t("recepciones.panelInvoiceHint")}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(34, 211, 238, 0.35)",
                    background: "linear-gradient(180deg, rgba(8, 51, 68, 0.6) 0%, rgba(15, 23, 42, 0.9) 100%)",
                    color: "#e0f2fe",
                    padding: "14px 16px",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                    minHeight: 48,
                    boxSizing: "border-box",
                    boxShadow: "0 2px 14px rgba(8, 145, 178, 0.2)",
                    touchAction: "manipulation",
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
