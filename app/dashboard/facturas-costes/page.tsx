"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type CompraEstado,
  type CompraLocal,
  loadCompras,
  parseCantidadRecibida as coercedCantidadRecibida,
} from "@/lib/compras-local";
import type { Locale, TranslateFn } from "@/lib/i18n";

type ListFilter = "todas" | CompraEstado;
type DatePreset = "todas" | "hoy" | "semana" | "mes";
type ListSort = "fecha_desc" | "fecha_asc" | "importe_desc" | "importe_asc";
type EcoFocus = "sin_factura" | "con_diferencia" | "sin_vincular" | "importe_no_validado" | "pendiente_cierre";
type FaseEco = "lista_cierre" | "validada" | "revision" | "pendiente" | "na";

const metaSep: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 10,
  margin: "0 7px",
  background: "rgba(148, 163, 184, 0.18)",
  borderRadius: 1,
  verticalAlign: "middle",
  flexShrink: 0,
};

type MetaBadge = { text: string; warn?: boolean };

const ACCENT = "rgba(245, 158, 11, 0.85)";
const ACCENT_DIM = "rgba(217, 119, 6, 0.35)";

const FASE_ACCENT: Record<FaseEco, string> = {
  na: "rgba(100, 116, 139, 0.4)",
  pendiente: "rgba(234, 179, 8, 0.45)",
  revision: "rgba(248, 113, 113, 0.5)",
  validada: "rgba(56, 189, 248, 0.5)",
  lista_cierre: "rgba(52, 211, 153, 0.55)",
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

function monthPrefixFromIso(iso: string): string {
  return iso.slice(0, 7);
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

function importeNoValidado(c: CompraLocal): boolean {
  return c.estado === "recibido" && (compraSinFacturaDoc(c) || hasDiferenciaNotas(c));
}

function pendienteCierreEconomico(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  return (
    compraSinFacturaDoc(c) ||
    hasDiferenciaNotas(c) ||
    !(c.producto_stock_id ?? "").trim() ||
    stockSyncUiKind(c) === "not_applied"
  );
}

function faseEconomica(c: CompraLocal): FaseEco {
  if (c.estado === "cancelado") return "na";
  if (c.estado === "pendiente") return "pendiente";
  if (compraSinFacturaDoc(c) || hasDiferenciaNotas(c) || !(c.producto_stock_id ?? "").trim()) return "revision";
  if (stockSyncUiKind(c) === "not_applied") return "validada";
  return "lista_cierre";
}

/** Solo avisos que importan para decidir en <1s (el detalle sigue en panel / columnas). */
function buildEconMeta(c: CompraLocal, t: TranslateFn): MetaBadge[] {
  if (c.estado === "pendiente") return [{ text: t("facturasCostes.metaAwaitingRecv"), warn: true }];
  if (c.estado === "cancelado") return [];
  const sinF = compraSinFacturaDoc(c);
  const diff = hasDiferenciaNotas(c);
  const linked = !!(c.producto_stock_id ?? "").trim();
  const out: MetaBadge[] = [];
  if (diff) out.push({ text: t("facturasCostes.rowBadgeDiff"), warn: true });
  if (sinF) out.push({ text: t("facturasCostes.metaOcrPending"), warn: true });
  if (!linked) out.push({ text: t("facturasCostes.rowBadgeUnlinked"), warn: true });
  if (!diff && pendienteCierreEconomico(c)) out.push({ text: t("facturasCostes.metaClosePendingShort"), warn: true });
  return out.slice(0, 3);
}

function facturaRefDisplay(c: CompraLocal, t: (k: string) => string): string {
  if (c.estado === "cancelado") return "—";
  if (c.estado === "pendiente") return "—";
  if (compraSinFacturaDoc(c)) return t("facturasCostes.invoicePendingShort");
  const n = (c.notas ?? "").trim();
  return n.length > 16 ? `${n.slice(0, 14)}…` : n;
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

function faseEcoLabel(f: FaseEco, t: (k: string) => string): string {
  switch (f) {
    case "lista_cierre":
      return t("facturasCostes.valListaCierre");
    case "validada":
      return t("facturasCostes.valValidada");
    case "revision":
      return t("facturasCostes.valRevision");
    case "pendiente":
      return t("facturasCostes.valPendiente");
    default:
      return t("facturasCostes.valNa");
  }
}

function faseEcoSub(f: FaseEco, t: (k: string) => string): string {
  switch (f) {
    case "pendiente":
      return t("facturasCostes.faseSubPendiente");
    case "revision":
      return t("facturasCostes.faseSubRevision");
    case "validada":
      return t("facturasCostes.faseSubValidada");
    case "lista_cierre":
      return t("facturasCostes.faseSubLista");
    default:
      return "";
  }
}

function CheckRow({ done, na, label }: { done: boolean; na?: boolean; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid rgba(51, 65, 85, 0.45)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 13,
          height: 13,
          borderRadius: 999,
          flexShrink: 0,
          border: na ? "1px dashed rgba(100,116,139,0.35)" : done ? "none" : "1px solid rgba(100,116,139,0.4)",
          background: done ? "rgba(120, 53, 15, 0.35)" : na ? "transparent" : "transparent",
          boxShadow: done ? `inset 0 0 0 1px ${ACCENT_DIM}` : undefined,
        }}
      />
      <span style={{ fontSize: 11, color: na ? "#525c6c" : "#94a3b8", lineHeight: 1.35, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export default function FacturasCostesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todas");
  const [datePreset, setDatePreset] = useState<DatePreset>("todas");
  const [listSort, setListSort] = useState<ListSort>("fecha_desc");
  const [ecoFocus, setEcoFocus] = useState<EcoFocus | null>(null);
  const [soloDiferencias, setSoloDiferencias] = useState(false);
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
    if (!menuRowId) return;
    const close = () => setMenuRowId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuRowId]);

  const today = useMemo(() => todayIsoLocal(), []);
  const weekStart = useMemo(() => subtractDaysIso(today, 7), [today]);
  const monthStart = useMemo(() => subtractDaysIso(today, 30), [today]);
  const curMonth = useMemo(() => monthPrefixFromIso(today), [today]);

  const kpis = useMemo(() => {
    let pendFact = 0;
    let gastoMes = 0;
    let difs = 0;
    let sinVin = 0;
    for (const c of items) {
      if (compraSinFacturaDoc(c)) pendFact += 1;
      if (c.estado !== "cancelado" && c.fecha.startsWith(curMonth)) {
        gastoMes += typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
      }
      if (hasDiferenciaNotas(c)) difs += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVin += 1;
    }
    return { pendFact, gastoMes, difs, sinVin };
  }, [items, curMonth]);

  const ecoCounts = useMemo(() => {
    let sinFactura = 0;
    let conDiferencia = 0;
    let sinVincular = 0;
    let importeNoVal = 0;
    let pendCierre = 0;
    for (const c of items) {
      if (compraSinFacturaDoc(c)) sinFactura += 1;
      if (hasDiferenciaNotas(c)) conDiferencia += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVincular += 1;
      if (importeNoValidado(c)) importeNoVal += 1;
      if (pendienteCierreEconomico(c)) pendCierre += 1;
    }
    return { sinFactura, conDiferencia, sinVincular, importeNoVal, pendCierre };
  }, [items]);

  const displayedRows = useMemo(() => {
    let list = [...items];
    if (datePreset === "hoy") list = list.filter((c) => c.fecha === today);
    else if (datePreset === "semana") list = list.filter((c) => c.fecha >= weekStart && c.fecha <= today);
    else if (datePreset === "mes") list = list.filter((c) => c.fecha >= monthStart && c.fecha <= today);

    if (listFilter !== "todas") list = list.filter((c) => c.estado === listFilter);

    if (ecoFocus === "sin_factura") list = list.filter(compraSinFacturaDoc);
    else if (ecoFocus === "con_diferencia") list = list.filter(hasDiferenciaNotas);
    else if (ecoFocus === "sin_vincular") list = list.filter((c) => c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim());
    else if (ecoFocus === "importe_no_validado") list = list.filter(importeNoValidado);
    else if (ecoFocus === "pendiente_cierre") list = list.filter(pendienteCierreEconomico);

    if (soloDiferencias) list = list.filter(hasDiferenciaNotas);

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
  }, [items, listFilter, datePreset, today, weekStart, monthStart, listSearch, listSort, ecoFocus, soloDiferencias]);

  const panelCompra = useMemo(() => (panelId ? items.find((c) => c.id === panelId) ?? null : null), [panelId, items]);

  const gridCols = "32px minmax(100px,1.22fr) minmax(54px,0.48fr) minmax(70px,0.62fr) 66px minmax(118px,1.08fr) 58px 128px";

  if (!hydrated) {
    return (
      <ModulePageShell title={t("facturasCostes.title")} subtitle={t("facturasCostes.loadingSubtitle")} compactLayout lockViewport maxWidth={1200}>
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("facturasCostes.title")}
      subtitle={t("facturasCostes.subtitle")}
      maxWidth={1200}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard/compras")}
          style={{
            border: "none",
            background: `linear-gradient(180deg, #d97706 0%, #b45309 100%)`,
            color: "#fffbeb",
            padding: "7px 14px",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 12px rgba(217, 119, 6, 0.28)",
          }}
        >
          {t("facturasCostes.ctaUpload")}
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
            { label: t("facturasCostes.kpiPendingInv"), sub: t("facturasCostes.kpiPendingInvSub"), v: String(kpis.pendFact), color: "#fcd34d" },
            { label: t("facturasCostes.kpiSpendMonth"), sub: t("facturasCostes.kpiSpendMonthSub"), v: formatEuro(kpis.gastoMes, locale), color: "#fde68a" },
            { label: t("facturasCostes.kpiDiffs"), sub: t("facturasCostes.kpiDiffsSub"), v: String(kpis.difs), color: "#fbbf24" },
            { label: t("facturasCostes.kpiUnlinked"), sub: t("facturasCostes.kpiUnlinkedSub"), v: String(kpis.sinVin), color: "#d6d3d1" },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                border: "1px solid rgba(51, 65, 85, 0.42)",
                borderRadius: 8,
                background: "linear-gradient(155deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.78) 100%)",
                padding: "6px 9px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), inset 2px 0 0 rgba(217, 119, 6, 0.2)",
              }}
            >
              <div style={{ fontSize: 8.5, fontWeight: 700, color: "#64748b", letterSpacing: "0.07em", textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: k.color, letterSpacing: "-0.03em" }}>
                {k.v}
              </div>
              <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2, lineHeight: 1.3 }}>{k.sub}</div>
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
            padding: "5px 8px",
            borderRadius: 8,
            border: `1px solid ${ACCENT_DIM}`,
            background: "linear-gradient(90deg, rgba(69, 26, 3, 0.25) 0%, rgba(15, 23, 42, 0.5) 100%)",
            boxShadow: "inset 0 1px 0 rgba(245, 158, 11, 0.05)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingRight: 8,
              borderRight: "1px solid rgba(51, 65, 85, 0.55)",
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 800, color: ACCENT, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("facturasCostes.ecoTitle")}
            </span>
            <span style={{ fontSize: 8, color: "#5c6574", fontWeight: 600, marginTop: 2, lineHeight: 1.25, maxWidth: 128 }}>{t("facturasCostes.ecoSubtitle")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            {(
              [
                { id: "sin_factura" as const, label: t("facturasCostes.ecoNoInvoice"), n: ecoCounts.sinFactura },
                { id: "con_diferencia" as const, label: t("facturasCostes.ecoWithDiff"), n: ecoCounts.conDiferencia },
                { id: "sin_vincular" as const, label: t("facturasCostes.ecoUnlinked"), n: ecoCounts.sinVincular },
                { id: "importe_no_validado" as const, label: t("facturasCostes.ecoUnvalidated"), n: ecoCounts.importeNoVal },
                { id: "pendiente_cierre" as const, label: t("facturasCostes.ecoPendingClose"), n: ecoCounts.pendCierre },
              ] as const
            ).map((chip) => {
              const active = ecoFocus === chip.id;
              const open = chip.n > 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setEcoFocus((p) => (p === chip.id ? null : chip.id))}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 8px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    border: active ? `1px solid ${ACCENT_DIM}` : "1px solid rgba(51, 65, 85, 0.45)",
                    background: active ? "rgba(69, 26, 3, 0.3)" : "rgba(15, 23, 42, 0.5)",
                    color: active ? "#fde68a" : open ? "#cbd5e1" : "#6b7380",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: open ? ACCENT : "rgba(51, 65, 85, 0.85)",
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
            padding: "4px 8px",
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
            placeholder={t("facturasCostes.toolbarSearchPlaceholder")}
            style={{
              flex: "1 1 120px",
              minWidth: 96,
              maxWidth: 200,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#020617",
              color: "#f8fafc",
              fontSize: 11,
              boxSizing: "border-box",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.filterStatus")}</span>
            <select
              value={listFilter}
              onChange={(e) => {
                setEcoFocus(null);
                setListFilter(e.target.value as ListFilter);
              }}
              style={{
                padding: "3px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("facturasCostes.filterAll")}</option>
              <option value="pendiente">{t("facturasCostes.filterPending")}</option>
              <option value="recibido">{t("facturasCostes.filterReceived")}</option>
              <option value="cancelado">{t("facturasCostes.filterCancelled")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.filterDate")}</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={{
                padding: "3px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="todas">{t("facturasCostes.dateAll")}</option>
              <option value="hoy">{t("facturasCostes.dateToday")}</option>
              <option value="semana">{t("facturasCostes.dateWeek")}</option>
              <option value="mes">{t("facturasCostes.dateMonth")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 10, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.sortBy")}</span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              style={{
                padding: "3px 6px",
                borderRadius: 5,
                border: "1px solid #334155",
                background: "#020617",
                color: "#cbd5e1",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="fecha_desc">{t("facturasCostes.sortFechaDesc")}</option>
              <option value="fecha_asc">{t("facturasCostes.sortFechaAsc")}</option>
              <option value="importe_desc">{t("facturasCostes.sortImporteDesc")}</option>
              <option value="importe_asc">{t("facturasCostes.sortImporteAsc")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSoloDiferencias((v) => !v)}
            style={{
              flexShrink: 0,
              border: soloDiferencias ? `1px solid ${ACCENT_DIM}` : "1px solid rgba(51, 65, 85, 0.55)",
              background: soloDiferencias ? "rgba(69, 26, 3, 0.2)" : "transparent",
              color: soloDiferencias ? "#fde68a" : "#6b7380",
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("facturasCostes.toggleDiffOnly")}
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
              boxShadow: `inset 3px 0 0 ${ACCENT_DIM}`,
            }}
          >
            <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid rgba(51,65,85,0.55)" }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {t("facturasCostes.listTitle")}
              </h3>
              <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {t("facturasCostes.listCount", { shown: displayedRows.length, total: items.length })}
              </span>
            </div>
            {items.length === 0 ? (
              <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>{t("facturasCostes.emptyNone")}</div>
            ) : displayedRows.length === 0 ? (
              <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>{t("facturasCostes.emptyFilter")}</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: "4px 8px",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "linear-gradient(180deg,#1e293b 0%,#1e293bee 100%)",
                    borderBottom: "1px solid rgba(51,65,85,0.65)",
                    fontSize: 8.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                >
                  <span style={{ color: "#525c6c" }}>{t("facturasCostes.colDate")}</span>
                  <span style={{ color: "#e2e8f0" }}>{t("facturasCostes.colSupplier")}</span>
                  <span style={{ color: "#525c6c" }}>{t("facturasCostes.colInvoice")}</span>
                  <span style={{ color: "#525c6c" }}>{t("facturasCostes.colOrderRecv")}</span>
                  <span style={{ textAlign: "right", color: "#fef3c7", fontWeight: 800 }}>{t("facturasCostes.colAmount")}</span>
                  <span style={{ color: "#fcd34d", letterSpacing: "0.06em", fontWeight: 800 }}>{t("facturasCostes.colValidation")}</span>
                  <span style={{ color: "#a8a29e", fontWeight: 800 }}>{t("facturasCostes.colDiff")}</span>
                  <span style={{ textAlign: "right", color: "#94a3b8" }}>{t("facturasCostes.colActions")}</span>
                </div>
                <div style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {displayedRows.map((c) => {
                    const fase = faseEconomica(c);
                    const diff = hasDiferenciaNotas(c);
                    const sinF = compraSinFacturaDoc(c);
                    const orderRecv = `${c.id.slice(-6)} · ${estadoCompraLabel(c.estado, t)}`;
                    const meta = buildEconMeta(c, t);
                    const faseAccent = FASE_ACCENT[fase];
                    const rowInset =
                      fase === "revision"
                        ? "inset 2px 0 0 rgba(248, 113, 113, 0.35)"
                        : fase === "lista_cierre"
                          ? "inset 2px 0 0 rgba(52, 211, 153, 0.28)"
                          : fase === "validada"
                            ? "inset 2px 0 0 rgba(56, 189, 248, 0.28)"
                            : undefined;
                    const needsReview = fase === "revision" || fase === "validada" || fase === "pendiente";

                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: "4px 8px",
                          alignItems: "center",
                          padding: "7px 10px",
                          borderRadius: 7,
                          border: "1px solid rgba(51, 65, 85, 0.42)",
                          background: diff ? "rgba(45, 15, 18, 0.28)" : "rgba(15, 23, 42, 0.36)",
                          ...(rowInset ? { boxShadow: rowInset } : {}),
                        }}
                      >
                        <span style={{ fontSize: 9, color: "#5c6574", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{formatFechaCorta(c.fecha, locale)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "#f8fafc",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              lineHeight: 1.28,
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {c.proveedor}
                          </div>
                          {meta.length > 0 ? (
                            <div style={{ marginTop: 4, fontSize: 9.5, fontWeight: 600, lineHeight: 1.4 }}>
                              {meta.map((b, i) => (
                                <span key={i} style={{ display: "inline" }}>
                                  {i > 0 ? <span style={metaSep} aria-hidden /> : null}
                                  <span style={{ color: b.warn ? "rgba(252, 200, 160, 0.98)" : "#7c8794" }}>{b.text}</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 500,
                            color: sinF ? "rgba(196, 165, 116, 0.85)" : "rgba(100, 108, 120, 0.95)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={c.notas ?? ""}
                        >
                          {facturaRefDisplay(c, t)}
                        </span>
                        <span
                          style={{ fontSize: 9, color: "#575e6b", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                          title={c.id}
                        >
                          {orderRecv}
                        </span>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: "#fffbeb",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            letterSpacing: "-0.02em",
                            lineHeight: 1.2,
                          }}
                        >
                          {formatEuro(typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0, locale)}
                        </span>
                        <div
                          title={[faseEcoLabel(fase, t), faseEcoSub(fase, t)].filter(Boolean).join(" — ")}
                          style={{
                            minWidth: 0,
                            padding: "5px 8px 5px 9px",
                            borderRadius: 6,
                            border: "1px solid rgba(71, 85, 105, 0.55)",
                            background: "rgba(15, 23, 42, 0.65)",
                            borderLeft: `3px solid ${faseAccent}`,
                          }}
                        >
                          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#f8fafc", letterSpacing: "0.01em", lineHeight: 1.2 }}>{faseEcoLabel(fase, t)}</div>
                          {fase !== "na" ? (
                            <div style={{ fontSize: 8, fontWeight: 600, color: "#7c8a9e", marginTop: 2, lineHeight: 1.25 }}>{faseEcoSub(fase, t)}</div>
                          ) : null}
                        </div>
                        <div
                          style={{
                            padding: "5px 6px",
                            borderRadius: 6,
                            border: diff ? "1px solid rgba(248, 113, 113, 0.4)" : "1px solid rgba(51, 65, 85, 0.28)",
                            background: diff ? "rgba(55, 18, 22, 0.45)" : "rgba(15, 23, 42, 0.25)",
                            textAlign: "center",
                            lineHeight: 1.25,
                            minHeight: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: "0.05em",
                              color: diff ? "#fecaca" : c.estado === "cancelado" ? "#575e6b" : "#6b7c8c",
                            }}
                          >
                            {diff ? t("facturasCostes.diffNoMatch") : c.estado === "cancelado" ? "—" : t("facturasCostes.diffMatch")}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: `1px solid ${ACCENT_DIM}`,
                              background: "rgba(30, 20, 8, 0.4)",
                              color: "#fde68a",
                              padding: "5px 9px",
                              borderRadius: 5,
                              fontSize: 9.5,
                              fontWeight: 700,
                              cursor: "pointer",
                              lineHeight: 1.2,
                            }}
                          >
                            {t("facturasCostes.actionView")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: needsReview ? `1px solid rgba(251, 191, 36, 0.5)` : "1px solid rgba(51, 65, 85, 0.5)",
                              background: needsReview ? "rgba(69, 26, 3, 0.38)" : "rgba(15, 23, 42, 0.4)",
                              color: needsReview ? "#fef08a" : "#7c8694",
                              padding: "5px 9px",
                              borderRadius: 5,
                              fontSize: 9.5,
                              fontWeight: 800,
                              cursor: "pointer",
                              lineHeight: 1.2,
                            }}
                          >
                            {t("facturasCostes.actionValidate")}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push("/dashboard/compras")}
                            style={{
                              border: "1px solid rgba(56, 189, 248, 0.22)",
                              background: "rgba(8, 47, 73, 0.2)",
                              color: "#9ecae0",
                              padding: "5px 9px",
                              borderRadius: 5,
                              fontSize: 9.5,
                              fontWeight: 600,
                              cursor: "pointer",
                              lineHeight: 1.2,
                            }}
                          >
                            {t("facturasCostes.actionLink")}
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
                                color: "#6b7585",
                                padding: "4px 6px",
                                fontSize: 14,
                                cursor: "pointer",
                                lineHeight: 1,
                              }}
                            >
                              {t("facturasCostes.actionMore")}
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
                                  minWidth: 148,
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
                                  {t("facturasCostes.menuOpenCompra")}
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
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {t("facturasCostes.menuOpenRecepciones")}
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
                width: 292,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                border: `1px solid ${ACCENT_DIM}`,
                borderRadius: 10,
                marginLeft: 8,
                background: "#0f172a",
                overflow: "hidden",
                boxShadow: "inset 0 1px 0 rgba(245, 158, 11, 0.04)",
              }}
            >
              <div style={{ flexShrink: 0, padding: "7px 10px", borderBottom: "1px solid rgba(51,65,85,0.55)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#fef3c7", letterSpacing: "-0.02em" }}>{t("facturasCostes.panelTitle")}</h2>
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
                  {t("facturasCostes.panelClose")}
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{t("facturasCostes.panelSummary")}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{panelCompra.proveedor}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                  {formatFechaCorta(panelCompra.fecha, locale)} · {formatEuro(typeof panelCompra.total === "number" ? panelCompra.total : 0, locale)}
                </div>
                <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("facturasCostes.panelPhaseLabel")}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: `1px solid ${FASE_ACCENT[faseEconomica(panelCompra)]}`,
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#fef3c7",
                    }}
                  >
                    {faseEcoLabel(faseEconomica(panelCompra), t)}
                  </span>
                  <span style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{faseEcoSub(faseEconomica(panelCompra), t)}</span>
                </div>

                <div style={{ marginTop: 12, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("facturasCostes.panelOcr")}</div>
                <div
                  style={{
                    marginTop: 5,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px dashed rgba(100, 116, 139, 0.35)",
                    background: "rgba(15, 23, 42, 0.6)",
                    fontSize: 10,
                    color: "#787f8f",
                    lineHeight: 1.45,
                  }}
                >
                  {compraSinFacturaDoc(panelCompra) ? t("facturasCostes.panelOcrPending") : t("facturasCostes.panelOcrPlaceholder")}
                </div>

                <div style={{ marginTop: 12, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("facturasCostes.panelRelated")}</div>
                <div style={{ marginTop: 5, fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>
                  {t("facturasCostes.panelRelatedLine", { id: panelCompra.id.slice(-8), estado: estadoCompraLabel(panelCompra.estado, t) })}
                </div>

                <div style={{ marginTop: 12, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("facturasCostes.panelEconDiff")}</div>
                <div style={{ marginTop: 5, fontSize: 11, color: hasDiferenciaNotas(panelCompra) ? ACCENT : "#64748b", fontWeight: 600 }}>
                  {hasDiferenciaNotas(panelCompra) ? t("facturasCostes.panelDiffDetected") : t("facturasCostes.panelDiffNone")}
                </div>

                <div style={{ marginTop: 14, fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("facturasCostes.panelChecklist")}</div>
                <div style={{ marginTop: 4 }}>
                  <CheckRow done={!compraSinFacturaDoc(panelCompra)} na={panelCompra.estado !== "recibido"} label={t("facturasCostes.checkDoc")} />
                  <CheckRow done={!hasDiferenciaNotas(panelCompra)} na={panelCompra.estado === "cancelado"} label={t("facturasCostes.checkAmount")} />
                  <CheckRow
                    done={!!(panelCompra.producto_stock_id ?? "").trim()}
                    na={panelCompra.estado === "cancelado"}
                    label={t("facturasCostes.checkLink")}
                  />
                  <CheckRow
                    done={stockSyncUiKind(panelCompra) !== "not_applied"}
                    na={panelCompra.estado !== "recibido" || stockSyncUiKind(panelCompra) === "neutral"}
                    label={t("facturasCostes.checkStock")}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    marginTop: 14,
                    width: "100%",
                    border: `1px solid ${ACCENT_DIM}`,
                    background: "linear-gradient(180deg, rgba(120, 53, 15, 0.35) 0%, rgba(15, 23, 42, 0.9) 100%)",
                    color: "#fef3c7",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(217, 119, 6, 0.12)",
                  }}
                >
                  {t("facturasCostes.panelValidateCta")}
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
