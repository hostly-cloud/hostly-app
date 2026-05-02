"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
import {
  type CompraEstado,
  type CompraLocal,
  loadCompras,
  parseCantidadRecibida as coercedCantidadRecibida,
} from "@/lib/compras-local";
import { STOCK_CHANGED_EVENT } from "@/lib/stock-local";
import type { Locale, TranslateFn } from "@/lib/i18n";

type ListFilter = "todas" | CompraEstado;
type DatePreset = "todas" | "hoy" | "semana" | "mes";
type ListSort = "fecha_desc" | "fecha_asc" | "importe_desc" | "importe_asc";
type ColaFocus = "nuevos" | "pendientes" | "duda_proveedor" | "diferencias" | "lineas_sin_reconocer";
type FaseEco = "lista_cierre" | "validada" | "revision" | "pendiente" | "na";
type RiesgoNivel = "critico" | "atencion" | "limpio";
type SuggestionTone = "positive" | "warm" | "neutral";
/** Carril visual de prioridad en la cola (sin cambiar datos ni textos). */
type RowLane = "inactivo" | "bloqueo" | "listo" | "tu_turno" | "espera";

const IA_ACCENT = "#c4b5fd";
const IA_ACCENT_STRONG = "rgba(167, 139, 250, 0.95)";
const IA_DIM = "rgba(139, 92, 246, 0.38)";

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

function lineItemCount(c: CompraLocal): number {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if ((c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return 1;
  return 0;
}

function missingLinesHint(c: CompraLocal): boolean {
  if (c.estado === "cancelado") return false;
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  return lineItemCount(c) === 0 && total > 0;
}

function faseEconomica(c: CompraLocal): FaseEco {
  if (c.estado === "cancelado") return "na";
  if (c.estado === "pendiente") return "pendiente";
  if (compraSinFacturaDoc(c) || hasDiferenciaNotas(c) || !(c.producto_stock_id ?? "").trim()) return "revision";
  if (stockSyncUiKind(c) === "not_applied") return "validada";
  return "lista_cierre";
}

function riesgoNivel(c: CompraLocal, f: FaseEco): RiesgoNivel {
  if (c.estado === "cancelado") return "limpio";
  if (hasDiferenciaNotas(c)) return "critico";
  if (missingLinesHint(c)) return "atencion";
  if (f === "lista_cierre") return "limpio";
  if (compraSinFacturaDoc(c) || !(c.producto_stock_id ?? "").trim() || stockSyncUiKind(c) === "not_applied") return "atencion";
  return "atencion";
}

function documentoLabel(c: CompraLocal, t: TranslateFn): string {
  if (c.estado === "cancelado") return "—";
  if (c.estado === "pendiente") return t("validacionInteligente.docPedido");
  if (compraSinFacturaDoc(c)) return t("validacionInteligente.docSinRef");
  const n = (c.notas ?? "").trim();
  return n.length > 18 ? `${n.slice(0, 16)}…` : n;
}

function rowSuggestion(c: CompraLocal, f: FaseEco): { key: string; tone: SuggestionTone } {
  if (c.estado === "cancelado") return { key: "suggestion_na", tone: "neutral" };
  if (f === "lista_cierre") return { key: "suggestion_ready_close", tone: "positive" };
  if (f === "validada") return { key: "suggestion_stock_pending", tone: "warm" };
  if (f === "revision") {
    if (hasDiferenciaNotas(c)) return { key: "suggestion_check_notes", tone: "warm" };
    if (missingLinesHint(c)) return { key: "suggestion_lines", tone: "warm" };
    if (compraSinFacturaDoc(c)) return { key: "suggestion_doc_ref", tone: "warm" };
    if (!(c.producto_stock_id ?? "").trim()) return { key: "suggestion_link_product", tone: "warm" };
    return { key: "suggestion_review", tone: "warm" };
  }
  if (c.estado === "pendiente") return { key: "suggestion_wait_reception", tone: "neutral" };
  return { key: "suggestion_na", tone: "neutral" };
}

function rowPending(c: CompraLocal, f: FaseEco): { key: string; urgent: boolean } {
  if (c.estado === "cancelado") return { key: "pending_na", urgent: false };
  if (f === "lista_cierre") return { key: "pending_none", urgent: false };
  if (f === "validada") return { key: "pending_apply_stock", urgent: true };
  if (hasDiferenciaNotas(c)) return { key: "pending_resolve_variance", urgent: true };
  if (missingLinesHint(c)) return { key: "pending_lines_detail", urgent: true };
  if (compraSinFacturaDoc(c)) return { key: "pending_doc_ref", urgent: true };
  if (c.estado === "recibido" && !(c.producto_stock_id ?? "").trim()) return { key: "pending_inventory", urgent: true };
  if (c.estado === "pendiente") return { key: "pending_when_received", urgent: false };
  return { key: "pending_review_generic", urgent: false };
}

function primaryActionKey(c: CompraLocal, f: FaseEco): string {
  if (c.estado === "cancelado") return "actionPrimary_review";
  if (f === "lista_cierre") return "actionPrimary_validate";
  if (f === "validada") return "actionPrimary_applyStock";
  if (hasDiferenciaNotas(c)) return "actionPrimary_fixVariance";
  if (missingLinesHint(c)) return "actionPrimary_fixLines";
  if (compraSinFacturaDoc(c)) return "actionPrimary_addDocRef";
  if (c.estado === "recibido" && !(c.producto_stock_id ?? "").trim()) return "actionPrimary_linkProduct";
  if (c.estado === "pendiente") return "actionPrimary_continueOrder";
  return "actionPrimary_review";
}

function suggestionToneColor(tone: SuggestionTone): string {
  if (tone === "positive") return "#86efac";
  if (tone === "warm") return "#fde68a";
  return "#94a3b8";
}

function rowLane(c: CompraLocal, f: FaseEco, riesgo: RiesgoNivel, pend: { urgent: boolean }): RowLane {
  if (c.estado === "cancelado") return "inactivo";
  if (riesgo === "critico") return "bloqueo";
  if (f === "lista_cierre") return "listo";
  if (pend.urgent) return "tu_turno";
  return "espera";
}

function laneRowChrome(lane: RowLane): { background: string; borderColor: string; boxShadow: string } {
  switch (lane) {
    case "listo":
      return {
        background: "linear-gradient(90deg, rgba(6, 78, 59, 0.2) 0%, rgba(15, 23, 42, 0.42) 42%)",
        borderColor: "rgba(52, 211, 153, 0.32)",
        boxShadow: "inset 3px 0 0 rgba(52, 211, 153, 0.62)",
      };
    case "bloqueo":
      return {
        background: "linear-gradient(90deg, rgba(127, 29, 29, 0.22) 0%, rgba(15, 23, 42, 0.48) 42%)",
        borderColor: "rgba(248, 113, 113, 0.38)",
        boxShadow: "inset 3px 0 0 rgba(248, 113, 113, 0.72)",
      };
    case "tu_turno":
      return {
        background: "linear-gradient(90deg, rgba(120, 53, 15, 0.18) 0%, rgba(15, 23, 42, 0.45) 40%)",
        borderColor: "rgba(251, 191, 36, 0.35)",
        boxShadow: "inset 3px 0 0 rgba(251, 191, 36, 0.55)",
      };
    case "espera":
      return {
        background: "rgba(15, 23, 42, 0.5)",
        borderColor: "rgba(51, 65, 85, 0.55)",
        boxShadow: "inset 3px 0 0 rgba(71, 85, 105, 0.45)",
      };
    case "inactivo":
    default:
      return {
        background: "rgba(15, 23, 42, 0.28)",
        borderColor: "rgba(51, 65, 85, 0.38)",
        boxShadow: "inset 3px 0 0 rgba(51, 65, 85, 0.35)",
      };
  }
}

function pendingInboxStyle(lane: RowLane): {
  wrap: Record<string, string | number>;
  text: Record<string, string | number>;
} {
  const base: Record<string, string | number> = {
    padding: "6px 0 6px 10px",
    minHeight: 0,
    display: "block",
    boxSizing: "border-box",
    border: "none",
    borderLeft: "3px solid transparent",
    background: "transparent",
    borderRadius: 0,
  };
  switch (lane) {
    case "inactivo":
      return {
        wrap: { ...base, borderLeftColor: "rgba(100, 116, 139, 0.55)" },
        text: { fontSize: 10, fontWeight: 700, color: "#64748b", lineHeight: 1.35 },
      };
    case "bloqueo":
      return {
        wrap: { ...base, borderLeftColor: "rgba(248, 113, 113, 0.65)" },
        text: { fontSize: 11, fontWeight: 800, color: "#fecaca", lineHeight: 1.35 },
      };
    case "listo":
      return {
        wrap: { ...base, borderLeftColor: "rgba(52, 211, 153, 0.55)" },
        text: { fontSize: 11, fontWeight: 700, color: "#a7f3d0", lineHeight: 1.35 },
      };
    case "tu_turno":
      return {
        wrap: { ...base, borderLeftColor: "rgba(251, 191, 36, 0.7)" },
        text: { fontSize: 11, fontWeight: 800, color: "#fef08a", lineHeight: 1.35 },
      };
    case "espera":
    default:
      return {
        wrap: { ...base, borderLeftColor: "rgba(71, 85, 105, 0.55)" },
        text: { fontSize: 10, fontWeight: 700, color: "#cbd5e1", lineHeight: 1.35 },
      };
  }
}

function primaryCtaLiftShadow(lane: RowLane): string {
  if (lane === "listo") return "0 5px 20px rgba(16, 185, 129, 0.32)";
  if (lane === "tu_turno") return "0 5px 20px rgba(245, 158, 11, 0.28)";
  if (lane === "bloqueo") return "0 5px 20px rgba(248, 113, 113, 0.22)";
  return "0 4px 16px rgba(0, 0, 0, 0.4)";
}

function estadoCompraLabel(estado: CompraEstado, t: (k: string) => string): string {
  switch (estado) {
    case "pendiente":
      return t("dashboard.compraEstadoPendiente");
    case "recibido":
      return t("dashboard.compraEstadoRecibido");
    default:
      return t("dashboard.compraEstadoCancelado");
  }
}

export default function ValidacionInteligentePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todas");
  const [datePreset, setDatePreset] = useState<DatePreset>("todas");
  const [listSort, setListSort] = useState<ListSort>("fecha_desc");
  const [colaFocus, setColaFocus] = useState<ColaFocus | null>(null);
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);

  const refresh = useCallback(() => setItems(loadCompras()), []);

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

  const today = useMemo(() => todayIsoLocal(), []);
  const weekStart = useMemo(() => subtractDaysIso(today, 7), [today]);
  const monthStart = useMemo(() => subtractDaysIso(today, 30), [today]);
  const nuevosDesde = useMemo(() => subtractDaysIso(today, 3), [today]);

  const kpis = useMemo(() => {
    let pend = 0;
    let coincid = 0;
    let inc = 0;
    let sinVin = 0;
    for (const c of items) {
      const f = faseEconomica(c);
      if (c.estado !== "cancelado" && f !== "lista_cierre" && f !== "na") pend += 1;
      if (f === "lista_cierre") coincid += 1;
      if (hasDiferenciaNotas(c) || missingLinesHint(c)) inc += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVin += 1;
    }
    return { pend, coincid, inc, sinVin };
  }, [items]);

  const colaCounts = useMemo(() => {
    let nuevos = 0;
    let pendientes = 0;
    let dudaProv = 0;
    let difs = 0;
    let lineas = 0;
    for (const c of items) {
      if (c.estado === "cancelado") continue;
      if (c.fecha >= nuevosDesde) nuevos += 1;
      if (c.estado === "pendiente" || faseEconomica(c) === "revision" || faseEconomica(c) === "validada") pendientes += 1;
      if (c.estado === "recibido" && compraSinFacturaDoc(c)) dudaProv += 1;
      if (hasDiferenciaNotas(c)) difs += 1;
      if (missingLinesHint(c)) lineas += 1;
    }
    return { nuevos, pendientes, dudaProv, difs, lineas };
  }, [items, nuevosDesde]);

  const displayedRows = useMemo(() => {
    let list = [...items];
    if (datePreset === "hoy") list = list.filter((c) => c.fecha === today);
    else if (datePreset === "semana") list = list.filter((c) => c.fecha >= weekStart && c.fecha <= today);
    else if (datePreset === "mes") list = list.filter((c) => c.fecha >= monthStart && c.fecha <= today);

    if (listFilter !== "todas") list = list.filter((c) => c.estado === listFilter);

    if (colaFocus === "nuevos") list = list.filter((c) => c.estado !== "cancelado" && c.fecha >= nuevosDesde);
    else if (colaFocus === "pendientes")
      list = list.filter((c) => c.estado === "pendiente" || faseEconomica(c) === "revision" || faseEconomica(c) === "validada");
    else if (colaFocus === "duda_proveedor") list = list.filter((c) => c.estado === "recibido" && compraSinFacturaDoc(c));
    else if (colaFocus === "diferencias") list = list.filter(hasDiferenciaNotas);
    else if (colaFocus === "lineas_sin_reconocer") list = list.filter(missingLinesHint);

    if (soloIncidencias) {
      list = list.filter((c) => {
        if (c.estado === "cancelado") return false;
        return riesgoNivel(c, faseEconomica(c)) !== "limpio";
      });
    }

    const q = normalizeForSearch(listSearch);
    if (q) {
      list = list.filter((c) => {
        const blob = [c.proveedor, c.id, c.notas ?? "", String(c.total ?? ""), c.fecha]
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
  }, [items, listFilter, datePreset, today, weekStart, monthStart, nuevosDesde, listSearch, listSort, colaFocus, soloIncidencias]);

  const panelCompra = useMemo(() => (panelId ? items.find((c) => c.id === panelId) ?? null : null), [panelId, items]);

  const gridCols = "46px minmax(168px,1.35fr) minmax(132px,1.05fr) minmax(128px,1.02fr) minmax(148px,auto)";

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("validacionInteligente.title")}
        subtitle={t("validacionInteligente.loadingSubtitle")}
        compactLayout
        operationalFocus
        lockViewport
        maxWidth={1200}
      >
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("validacionInteligente.title")}
      subtitle={t("validacionInteligente.subtitle")}
      maxWidth={1200}
      compactLayout
      operationalFocus
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard/compras")}
          style={{
            border: "1px solid rgba(167, 139, 250, 0.45)",
            background: "rgba(76, 29, 149, 0.22)",
            color: "#e9d5ff",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {t("validacionInteligente.ctaUpload")}
        </button>
      }
    >
      <div
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          overflow: "hidden",
        }}
      >
        <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {[
            { label: t("validacionInteligente.kpiPending"), sub: t("validacionInteligente.kpiPendingSub"), v: String(kpis.pend), color: IA_ACCENT },
            { label: t("validacionInteligente.kpiAuto"), sub: t("validacionInteligente.kpiAutoSub"), v: String(kpis.coincid), color: "#86efac" },
            { label: t("validacionInteligente.kpiIncidents"), sub: t("validacionInteligente.kpiIncidentsSub"), v: String(kpis.inc), color: "#fca5a5" },
            { label: t("validacionInteligente.kpiUnlinked"), sub: t("validacionInteligente.kpiUnlinkedSub"), v: String(kpis.sinVin), color: "#cbd5e1" },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                border: "1px solid rgba(51, 65, 85, 0.42)",
                borderRadius: 8,
                background: "linear-gradient(155deg, rgba(30, 27, 55, 0.55) 0%, rgba(15, 23, 42, 0.82) 100%)",
                padding: "6px 9px",
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), inset 2px 0 0 ${IA_DIM}`,
              }}
            >
              <div style={{ fontSize: 8.5, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ marginTop: 2, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: k.color, letterSpacing: "-0.03em" }}>{k.v}</div>
              <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 1, lineHeight: 1.3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "stretch",
            gap: 6,
            overflowX: "auto",
            padding: "5px 8px",
            borderRadius: 8,
            border: `1px solid ${IA_DIM}`,
            background: "linear-gradient(90deg, rgba(49, 46, 129, 0.22) 0%, rgba(15, 23, 42, 0.52) 100%)",
            boxShadow: "inset 0 1px 0 rgba(167, 139, 250, 0.06)",
          }}
        >
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 8, borderRight: "1px solid rgba(51, 65, 85, 0.55)" }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: IA_ACCENT_STRONG, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("validacionInteligente.colaTitle")}</span>
            <span style={{ fontSize: 8, color: "#5c6574", fontWeight: 600, marginTop: 2, lineHeight: 1.25, maxWidth: 132 }}>{t("validacionInteligente.colaSubtitle")}</span>
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
                { id: "nuevos" as const, label: t("validacionInteligente.colaNew"), n: colaCounts.nuevos },
                { id: "pendientes" as const, label: t("validacionInteligente.colaPending"), n: colaCounts.pendientes },
                { id: "duda_proveedor" as const, label: t("validacionInteligente.colaSupplierDoubt"), n: colaCounts.dudaProv },
                { id: "diferencias" as const, label: t("validacionInteligente.colaDiff"), n: colaCounts.difs },
                { id: "lineas_sin_reconocer" as const, label: t("validacionInteligente.colaLines"), n: colaCounts.lineas },
              ] as const
            ).map((chip) => {
              const active = colaFocus === chip.id;
              const open = chip.n > 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setColaFocus((p) => (p === chip.id ? null : chip.id))}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    border: active ? `1px solid ${IA_DIM}` : "1px solid rgba(51, 65, 85, 0.45)",
                    background: active ? "rgba(76, 29, 149, 0.28)" : "rgba(15, 23, 42, 0.5)",
                    color: active ? "#e9d5ff" : open ? "#cbd5e1" : "#6b7380",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: open ? IA_ACCENT_STRONG : "rgba(51, 65, 85, 0.85)",
                    }}
                  />
                  <span>{chip.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85, fontSize: 10, fontWeight: 700 }}>{chip.n}</span>
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
            gap: 6,
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
            placeholder={t("validacionInteligente.toolbarSearchPlaceholder")}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: "120px",
              minWidth: 96,
              maxWidth: 200,
              padding: "6px 9px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#020617",
              color: "#f8fafc",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 11, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("validacionInteligente.filterStatus")}</span>
            <select
              value={listFilter}
              onChange={(e) => {
                setColaFocus(null);
                setListFilter(e.target.value as ListFilter);
              }}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("validacionInteligente.filterAll")}</option>
              <option value="pendiente">{t("validacionInteligente.filterPending")}</option>
              <option value="recibido">{t("validacionInteligente.filterReceived")}</option>
              <option value="cancelado">{t("validacionInteligente.filterCancelled")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 11, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("validacionInteligente.filterDate")}</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("validacionInteligente.dateAll")}</option>
              <option value="hoy">{t("validacionInteligente.dateToday")}</option>
              <option value="semana">{t("validacionInteligente.dateWeek")}</option>
              <option value="mes">{t("validacionInteligente.dateMonth")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 11, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("validacionInteligente.sortBy")}</span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="fecha_desc">{t("validacionInteligente.sortFechaDesc")}</option>
              <option value="fecha_asc">{t("validacionInteligente.sortFechaAsc")}</option>
              <option value="importe_desc">{t("validacionInteligente.sortImporteDesc")}</option>
              <option value="importe_asc">{t("validacionInteligente.sortImporteAsc")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSoloIncidencias((v) => !v)}
            style={{
              flexShrink: 0,
              border: soloIncidencias ? `1px solid ${IA_DIM}` : "1px solid rgba(51, 65, 85, 0.55)",
              background: soloIncidencias ? "rgba(76, 29, 149, 0.22)" : "transparent",
              color: soloIncidencias ? "#e9d5ff" : "#6b7380",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("validacionInteligente.toggleIncidents")}
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
            gap: 0,
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
              border: "1px solid rgba(51, 65, 85, 0.55)",
              borderRadius: 10,
              background: "linear-gradient(165deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.92) 100%)",
              boxShadow: `inset 3px 0 0 ${IA_DIM}, inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 8,
                padding: "6px 10px",
                borderBottom: "1px solid rgba(51,65,85,0.55)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("validacionInteligente.listTitle")}</h2>
                <p style={OPER_PRIMARY_COUNT_META}>
                  {t("validacionInteligente.listCount", { shown: displayedRows.length, total: items.length })}
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
                {t("validacionInteligente.emptyNone")}
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
                {t("validacionInteligente.emptyFilter")}
              </div>
            ) : (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflow: "auto",
                  background: "linear-gradient(180deg, rgba(15,23,42,0.35) 0%, transparent 28px)",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: "5px 8px",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "linear-gradient(180deg,#1e293b 0%,#1a2332 100%)",
                    borderBottom: "1px solid rgba(51,65,85,0.65)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                >
                  <span style={{ color: "#525c6c" }}>{t("validacionInteligente.colDate")}</span>
                  <span style={{ color: "#f1f5f9", fontWeight: 800 }}>{t("validacionInteligente.colSupplierDoc")}</span>
                  <span style={{ color: "#bbf7d0", fontWeight: 800 }}>{t("validacionInteligente.colHostlyDid")}</span>
                  <span
                    style={{
                      color: "#fef08a",
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(251, 191, 36, 0.06)",
                      border: "1px solid rgba(251, 191, 36, 0.2)",
                    }}
                  >
                    {t("validacionInteligente.colYourTurn")}
                  </span>
                  <span style={{ textAlign: "right", color: "#e9d5ff", fontWeight: 800 }}>{t("validacionInteligente.colActions")}</span>
                </div>
                <div style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {displayedRows.map((c) => {
                    const f = faseEconomica(c);
                    const riesgo = riesgoNivel(c, f);
                    const sug = rowSuggestion(c, f);
                    const pend = rowPending(c, f);
                    const lane = rowLane(c, f, riesgo, pend);
                    const chrome = laneRowChrome(lane);
                    const inbox = pendingInboxStyle(lane);
                    const primaryKey = `validacionInteligente.${primaryActionKey(c, f)}`;
                    const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
                    const primaryToCompras = primaryActionKey(c, f) === "actionPrimary_applyStock";

                    const primaryIsPositive = f === "lista_cierre" && c.estado !== "cancelado";
                    const primaryStyle = primaryToCompras
                      ? {
                          border: "1px solid rgba(56, 189, 248, 0.35)",
                          background: "linear-gradient(180deg, rgba(14, 116, 144, 0.45) 0%, rgba(8, 47, 73, 0.55) 100%)",
                          color: "#e0f2fe",
                        }
                      : primaryIsPositive
                        ? {
                            border: "1px solid rgba(52, 211, 153, 0.4)",
                            background: "linear-gradient(180deg, rgba(6, 78, 59, 0.5) 0%, rgba(6, 46, 42, 0.65) 100%)",
                            color: "#d1fae5",
                          }
                        : pend.urgent
                          ? {
                              border: "1px solid rgba(251, 191, 36, 0.45)",
                              background: "linear-gradient(180deg, rgba(120, 53, 15, 0.4) 0%, rgba(67, 32, 6, 0.55) 100%)",
                              color: "#fef9c3",
                            }
                          : {
                              border: `1px solid ${IA_DIM}`,
                              background: "linear-gradient(180deg, rgba(76, 29, 149, 0.42) 0%, rgba(49, 46, 129, 0.5) 100%)",
                              color: "#f5f3ff",
                            };

                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: "8px 10px",
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${chrome.borderColor}`,
                          background: chrome.background,
                          boxShadow: `${chrome.boxShadow}, 0 2px 10px rgba(0,0,0,0.12)`,
                        }}
                      >
                        <span style={{ fontSize: 10, color: "#64748b", fontVariantNumeric: "tabular-nums", fontWeight: 700, lineHeight: 1.2 }}>
                          {formatFechaCorta(c.fecha, locale)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#f8fafc",
                              letterSpacing: "-0.02em",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.proveedor}
                          </div>
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#c4b5fd",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {documentoLabel(c, t)}
                          </div>
                          <div
                            style={{
                              marginTop: 5,
                              fontSize: 14,
                              fontWeight: 800,
                              fontVariantNumeric: "tabular-nums",
                              color: "#e2e8f0",
                            }}
                          >
                            {formatEuro(total, locale)}
                          </div>
                        </div>
                        <div style={{ minWidth: 0, opacity: lane === "espera" || lane === "inactivo" ? 0.88 : 1 }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: 10,
                              fontWeight: 700,
                              color: suggestionToneColor(sug.tone),
                              lineHeight: 1.35,
                              maxHeight: 30,
                              overflow: "hidden",
                            }}
                          >
                            {t(`validacionInteligente.${sug.key}`)}
                          </span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={inbox.wrap}>
                            <span style={{ ...inbox.text, display: "block", overflow: "hidden" }}>{t(`validacionInteligente.${pend.key}`)}</span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "stretch",
                            gap: 8,
                            minWidth: 0,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (primaryToCompras) router.push("/dashboard/compras");
                              else setPanelId(c.id);
                            }}
                            style={{
                              ...primaryStyle,
                              width: "100%",
                              minHeight: 44,
                              padding: "11px 14px",
                              borderRadius: 10,
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.2,
                              boxShadow: `${primaryCtaLiftShadow(lane)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
                            }}
                          >
                            {t(primaryKey)}
                          </button>
                          <div style={{ display: "flex", justifyContent: "flex-end", position: "relative" }}>
                            <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuRowId((p) => (p === c.id ? null : c.id));
                              }}
                              style={{
                                border: "1px solid rgba(71, 85, 105, 0.55)",
                                background: "transparent",
                                color: "#94a3b8",
                                padding: "0 12px",
                                minWidth: 44,
                                minHeight: 44,
                                fontSize: 18,
                                fontWeight: 700,
                                cursor: "pointer",
                                lineHeight: 1,
                                borderRadius: 10,
                                boxSizing: "border-box",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                touchAction: "manipulation",
                              }}
                            >
                              {t("validacionInteligente.actionMore")}
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
                                  minWidth: 168,
                                  borderRadius: 8,
                                  border: "1px solid #334155",
                                  background: "#020617",
                                  boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
                                  padding: 6,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuRowId(null);
                                    setPanelId(c.id);
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#e9d5ff",
                                    textAlign: "left",
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("validacionInteligente.menuOpenReview")}
                                </button>
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
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("validacionInteligente.menuCompras")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuRowId(null);
                                    router.push("/dashboard/recepciones");
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#cbd5e1",
                                    textAlign: "left",
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("validacionInteligente.menuRecepciones")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuRowId(null);
                                    router.push("/dashboard/facturas-costes");
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#cbd5e1",
                                    textAlign: "left",
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("validacionInteligente.menuFacturas")}
                                </button>
                              </div>
                            ) : null}
                            </div>
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
                width: 308,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                border: `1px solid ${IA_DIM}`,
                borderRadius: 10,
                marginLeft: 8,
                background: "#0f172a",
                overflow: "hidden",
                boxShadow: "inset 0 1px 0 rgba(167, 139, 250, 0.05)",
              }}
            >
              <div style={{ flexShrink: 0, padding: "9px 12px", borderBottom: "1px solid rgba(51,65,85,0.55)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#ede9fe", letterSpacing: "-0.02em" }}>{t("validacionInteligente.panelTitle")}</h2>
                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    border: "1px solid #334155",
                    background: "#020617",
                    color: "#94a3b8",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("validacionInteligente.panelClose")}
                </button>
              </div>
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{t("validacionInteligente.panelDetected")}</div>
                <div style={{ borderRadius: 8, border: "1px solid rgba(51,65,85,0.5)", background: "rgba(30, 27, 55, 0.35)", padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>{panelCompra.proveedor}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8", lineHeight: 1.55 }}>
                    <div>{t("validacionInteligente.panelDetDate", { date: formatFechaCorta(panelCompra.fecha, locale) })}</div>
                    <div>{t("validacionInteligente.panelDetTotal", { amount: formatEuro(typeof panelCompra.total === "number" ? panelCompra.total : 0, locale) })}</div>
                    <div style={{ marginTop: 4, color: "#7c8494" }}>{t("validacionInteligente.panelDetDoc", { ref: documentoLabel(panelCompra, t) })}</div>
                  </div>
                </div>

                <div style={{ marginTop: 14, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("validacionInteligente.panelLinked")}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#cbd5e1", lineHeight: 1.55, fontWeight: 600 }}>
                  <div>{t("validacionInteligente.panelSugCompra", { id: panelCompra.id.slice(-8), estado: estadoCompraLabel(panelCompra.estado, t) })}</div>
                  <div style={{ marginTop: 4 }}>{t("validacionInteligente.panelSugRecv")}</div>
                  <div style={{ marginTop: 4, color: "#a5b4fc" }}>{t("validacionInteligente.panelSugProv", { name: panelCompra.proveedor })}</div>
                </div>

                <div style={{ marginTop: 14, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("validacionInteligente.panelMismatch")}</div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "#94a3b8", lineHeight: 1.65 }}>
                  {hasDiferenciaNotas(panelCompra) ? <li style={{ color: "#fca5a5" }}>{t("validacionInteligente.mismatchAmount")}</li> : null}
                  {missingLinesHint(panelCompra) ? <li style={{ color: "#fcd34d" }}>{t("validacionInteligente.mismatchLine")}</li> : null}
                  {panelCompra.estado === "recibido" && compraSinFacturaDoc(panelCompra) ? <li style={{ color: "#fcd34d" }}>{t("validacionInteligente.mismatchSupplier")}</li> : null}
                  {panelCompra.estado === "recibido" && !(panelCompra.producto_stock_id ?? "").trim() ? (
                    <li style={{ color: "#fcd34d" }}>{t("validacionInteligente.mismatchProduct")}</li>
                  ) : null}
                  {!hasDiferenciaNotas(panelCompra) &&
                  !missingLinesHint(panelCompra) &&
                  !(panelCompra.estado === "recibido" && compraSinFacturaDoc(panelCompra)) &&
                  !(panelCompra.estado === "recibido" && !(panelCompra.producto_stock_id ?? "").trim()) ? (
                    <li style={{ color: "#6ee7b7" }}>{t("validacionInteligente.mismatchNone")}</li>
                  ) : null}
                </ul>

                <div style={{ marginTop: 16, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("validacionInteligente.panelActions")}</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    t("validacionInteligente.actAccept"),
                    t("validacionInteligente.actChangeSupplier"),
                    t("validacionInteligente.actLinkManual"),
                    t("validacionInteligente.actMarkReviewed"),
                    t("validacionInteligente.actValidateClose"),
                  ].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => router.push("/dashboard/compras")}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: `1px solid ${IA_DIM}`,
                        background: "rgba(30, 27, 55, 0.4)",
                        color: "#e9d5ff",
                        padding: "11px 14px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
