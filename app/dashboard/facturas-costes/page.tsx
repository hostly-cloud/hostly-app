"use client";

import type { CSSProperties, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HostlyFacturasCrossNavRestore } from "@/components/hostly-cross-module-nav";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { navigateWithCrossContext } from "@/lib/hostly/cross-module-nav";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
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

function CheckRow({ done, na, label, last }: { done: boolean; na?: boolean; label: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
        padding: "13px 0",
        minHeight: 46,
        boxSizing: "border-box",
        borderBottom: last ? "none" : "1px solid rgba(51, 65, 85, 0.32)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          marginTop: 2,
          borderRadius: 999,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: na ? "1px dashed rgba(100,116,139,0.4)" : done ? "none" : "1px solid rgba(100,116,139,0.45)",
          background: done ? "linear-gradient(145deg, rgba(245, 158, 11, 0.35) 0%, rgba(180, 83, 9, 0.45) 100%)" : na ? "transparent" : "rgba(15, 23, 42, 0.6)",
          boxShadow: done ? `inset 0 0 0 1px rgba(251, 191, 36, 0.35)` : undefined,
          fontSize: 11,
          fontWeight: 800,
          color: done ? "#fffbeb" : "transparent",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span style={{ fontSize: 12, color: na ? "#525c6c" : "#e2e8f0", lineHeight: 1.5, fontWeight: 600, paddingTop: 2 }}>{label}</span>
    </div>
  );
}

function PanelCabinaSection({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        marginTop: first ? 0 : 14,
        padding: "14px 15px 15px",
        borderRadius: 12,
        border: "1px solid rgba(100, 116, 139, 0.38)",
        background: "linear-gradient(168deg, rgba(26, 35, 58, 0.98) 0%, rgba(8, 12, 28, 0.9) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055), 0 6px 20px rgba(0,0,0,0.28)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: "#94a3b8",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid rgba(51, 65, 85, 0.45)",
        }}
      >
        {title}
      </div>
      {children}
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

  const handleFacturasCrossNavRestore = useCallback((focusId: string, openPanel: boolean) => {
    if (openPanel) setPanelId(focusId);
    else setPanelId(null);
    const run = () =>
      document.getElementById(`hostly-fc-row-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    requestAnimationFrame(run);
    setTimeout(run, 120);
    setTimeout(run, 400);
  }, []);

  const openComprasFromFacturas = useCallback(
    (compraId: string) => {
      navigateWithCrossContext(router.push, {
        targetPath: "/dashboard/compras",
        sourceModule: "facturas-costes",
        returnTo: "/dashboard/facturas-costes",
        focusId: compraId,
        openPanel: panelId === compraId,
      });
    },
    [router, panelId],
  );

  const openComprasFromFacturasHeader = useCallback(() => {
    navigateWithCrossContext(router.push, {
      targetPath: "/dashboard/compras",
      sourceModule: "facturas-costes",
      returnTo: "/dashboard/facturas-costes",
      focusId: panelId ?? "",
      openPanel: !!panelId,
    });
  }, [router, panelId]);

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

  const gridCols = "32px minmax(100px,1.22fr) minmax(54px,0.48fr) minmax(70px,0.62fr) 66px minmax(118px,1.08fr) 58px minmax(148px,auto)";

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("facturasCostes.title")}
        subtitle={t("facturasCostes.loadingSubtitle")}
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
      title={t("facturasCostes.title")}
      subtitle={t("facturasCostes.subtitle")}
      maxWidth={1200}
      compactLayout
      operationalFocus
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={openComprasFromFacturasHeader}
          style={{
            border: "1px solid rgba(245, 158, 11, 0.42)",
            background: "rgba(69, 26, 3, 0.35)",
            color: "#fde68a",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {t("facturasCostes.ctaUpload")}
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
        <Suspense fallback={null}>
          <HostlyFacturasCrossNavRestore onRestore={handleFacturasCrossNavRestore} />
        </Suspense>
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 6,
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
              <div style={{ marginTop: 2, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: k.color, letterSpacing: "-0.03em" }}>
                {k.v}
              </div>
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
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 8,
                    fontSize: 11,
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
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: open ? ACCENT : "rgba(51, 65, 85, 0.85)",
                    }}
                  />
                  <span>{chip.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8, fontSize: 10, fontWeight: 700 }}>{chip.n}</span>
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
            placeholder={t("facturasCostes.toolbarSearchPlaceholder")}
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
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.filterStatus")}</span>
            <select
              value={listFilter}
              onChange={(e) => {
                setEcoFocus(null);
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
              <option value="todas">{t("facturasCostes.filterAll")}</option>
              <option value="pendiente">{t("facturasCostes.filterPending")}</option>
              <option value="recibido">{t("facturasCostes.filterReceived")}</option>
              <option value="cancelado">{t("facturasCostes.filterCancelled")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 11, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.filterDate")}</span>
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
              <option value="todas">{t("facturasCostes.dateAll")}</option>
              <option value="hoy">{t("facturasCostes.dateToday")}</option>
              <option value="semana">{t("facturasCostes.dateWeek")}</option>
              <option value="mes">{t("facturasCostes.dateMonth")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: 11, color: "#64748b" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("facturasCostes.sortBy")}</span>
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
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("facturasCostes.toggleDiffOnly")}
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
              background: "#1e293b",
              boxShadow: `inset 3px 0 0 ${ACCENT_DIM}`,
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
                <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("facturasCostes.listTitle")}</h2>
                <p style={OPER_PRIMARY_COUNT_META}>
                  {t("facturasCostes.listCount", { shown: displayedRows.length, total: items.length })}
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
                {t("facturasCostes.emptyNone")}
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
                {t("facturasCostes.emptyFilter")}
              </div>
            ) : (
              <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, overflow: "auto" }}>
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
                    background: "linear-gradient(180deg,#1e293b 0%,#1e293bee 100%)",
                    borderBottom: "1px solid rgba(51,65,85,0.65)",
                    fontSize: 9.5,
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
                <div style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {displayedRows.map((c) => {
                    const fase = faseEconomica(c);
                    const diff = hasDiferenciaNotas(c);
                    const sinF = compraSinFacturaDoc(c);
                    const linked = !!(c.producto_stock_id ?? "").trim();
                    const stk = stockSyncUiKind(c);
                    const orderRecv = `${c.id.slice(-6)} · ${estadoCompraLabel(c.estado, t)}`;
                    const meta = buildEconMeta(c, t);
                    const faseAccent = FASE_ACCENT[fase];
                    const urgentRow =
                      sinF ||
                      diff ||
                      (c.estado === "recibido" && !linked) ||
                      stk === "not_applied" ||
                      fase === "revision";
                    const rowInset =
                      urgentRow
                        ? "inset 3px 0 0 rgba(251, 191, 36, 0.75)"
                        : fase === "lista_cierre"
                          ? "inset 2px 0 0 rgba(52, 211, 153, 0.35)"
                          : undefined;
                    const needsReview = fase === "revision" || fase === "validada" || fase === "pendiente";

                    return (
                      <div
                        key={c.id}
                        id={`hostly-fc-row-${c.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: "6px 10px",
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: urgentRow ? "1px solid rgba(251, 191, 36, 0.22)" : "1px solid rgba(51, 65, 85, 0.42)",
                          background: urgentRow
                            ? "linear-gradient(90deg, rgba(69, 26, 3, 0.32) 0%, rgba(45, 15, 18, 0.22) 38%, rgba(15, 23, 42, 0.4) 100%)"
                            : diff
                              ? "rgba(45, 15, 18, 0.28)"
                              : "rgba(15, 23, 42, 0.36)",
                          boxShadow: rowInset ? `${rowInset}, 0 2px 12px rgba(0,0,0,0.18)` : "0 2px 10px rgba(0,0,0,0.14)",
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
                            padding: "4px 0 4px 11px",
                            borderLeft: `3px solid ${faseAccent}`,
                          }}
                        >
                          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#f8fafc", letterSpacing: "0.01em", lineHeight: 1.2 }}>{faseEcoLabel(fase, t)}</div>
                          {fase !== "na" ? (
                            <div style={{ fontSize: 8, fontWeight: 600, color: "#7c8a9e", marginTop: 2, lineHeight: 1.25 }}>{faseEcoSub(fase, t)}</div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", minWidth: 0 }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "5px 9px",
                              borderRadius: 999,
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              lineHeight: 1.2,
                              ...(diff
                                ? {
                                    color: "#fecaca",
                                    background: "rgba(248, 113, 113, 0.1)",
                                    border: "1px solid rgba(248, 113, 113, 0.28)",
                                  }
                                : c.estado === "cancelado"
                                  ? { color: "#64748b", background: "transparent", border: "1px solid rgba(71, 85, 105, 0.35)" }
                                  : {
                                      color: "#94b8c9",
                                      background: "rgba(56, 189, 248, 0.06)",
                                      border: "1px solid rgba(56, 189, 248, 0.18)",
                                    }),
                            }}
                          >
                            {diff ? t("facturasCostes.diffNoMatch") : c.estado === "cancelado" ? "—" : t("facturasCostes.diffMatch")}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: needsReview ? "none" : "1px solid rgba(71, 85, 105, 0.45)",
                              background: needsReview
                                ? "linear-gradient(180deg, rgba(251, 191, 36, 0.95) 0%, rgba(217, 119, 6, 0.92) 100%)"
                                : "rgba(30, 27, 19, 0.55)",
                              color: needsReview ? "#1c1917" : "#a8a29e",
                              padding: needsReview ? "11px 16px" : "8px 12px",
                              borderRadius: 10,
                              fontSize: needsReview ? 13 : 12,
                              fontWeight: 800,
                              cursor: "pointer",
                              lineHeight: 1.2,
                              minHeight: 44,
                              boxSizing: "border-box",
                              touchAction: "manipulation",
                              boxShadow: needsReview ? "0 3px 14px rgba(245, 158, 11, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)" : "none",
                            }}
                          >
                            {t("facturasCostes.actionValidate")}
                          </button>
                          <button
                            type="button"
                            onClick={() => openComprasFromFacturas(c.id)}
                            style={{
                              border: "1px solid rgba(56, 189, 248, 0.28)",
                              background: "rgba(8, 47, 73, 0.25)",
                              color: "#bae6fd",
                              padding: "8px 12px",
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              lineHeight: 1.2,
                              minHeight: 40,
                              boxSizing: "border-box",
                              touchAction: "manipulation",
                            }}
                          >
                            {t("facturasCostes.actionLink")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPanelId(c.id)}
                            style={{
                              border: "1px solid transparent",
                              background: "transparent",
                              color: "#7c8694",
                              padding: "8px 10px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              lineHeight: 1.2,
                              minHeight: 40,
                              boxSizing: "border-box",
                              touchAction: "manipulation",
                              textDecoration: "underline",
                              textDecorationColor: "rgba(148, 163, 184, 0.35)",
                              textUnderlineOffset: 3,
                            }}
                          >
                            {t("facturasCostes.actionView")}
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
                                border: "1px solid rgba(51, 65, 85, 0.5)",
                                background: "rgba(15, 23, 42, 0.4)",
                                color: "#64748b",
                                padding: "0 8px",
                                minWidth: 36,
                                minHeight: 36,
                                fontSize: 16,
                                fontWeight: 700,
                                cursor: "pointer",
                                lineHeight: 1,
                                borderRadius: 8,
                                boxSizing: "border-box",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                touchAction: "manipulation",
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
                                  padding: 6,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuRowId(null);
                                    openComprasFromFacturas(c.id);
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
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
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
                width: 316,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                border: "1px solid rgba(251, 191, 36, 0.22)",
                borderRadius: 12,
                marginLeft: 10,
                background: "linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(2, 6, 23, 0.96) 55%, rgba(15, 23, 42, 0.99) 100%)",
                overflow: "hidden",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.35), 0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(253, 230, 138, 0.06)",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  padding: "11px 14px",
                  borderBottom: "1px solid rgba(51,65,85,0.55)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  background: "linear-gradient(90deg, rgba(120, 53, 15, 0.14) 0%, transparent 55%)",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#fef3c7", letterSpacing: "-0.02em" }}>{t("facturasCostes.panelTitle")}</h2>
                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    border: "1px solid rgba(71, 85, 105, 0.4)",
                    background: "transparent",
                    color: "#64748b",
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("facturasCostes.panelClose")}
                </button>
              </div>
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "12px 14px 14px",
                }}
              >
                <div
                  style={{
                    marginBottom: 14,
                    padding: "11px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(51, 65, 85, 0.5)",
                    background: "rgba(15, 23, 42, 0.55)",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                    {t("facturasCostes.panelSummary")}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", marginBottom: 4, lineHeight: 1.25 }}>{panelCompra.proveedor}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5, fontWeight: 600 }}>
                    {formatFechaCorta(panelCompra.fecha, locale)} · {formatEuro(typeof panelCompra.total === "number" ? panelCompra.total : 0, locale)}
                  </div>
                </div>

                {(() => {
                  const pf = faseEconomica(panelCompra);
                  const statusKind: "neutral" | "alert" | "ready" =
                    panelCompra.estado === "cancelado"
                      ? "neutral"
                      : panelCompra.estado === "pendiente" || pendienteCierreEconomico(panelCompra)
                        ? "alert"
                        : "ready";
                  const statusText =
                    panelCompra.estado === "pendiente"
                      ? t("facturasCostes.metaAwaitingRecv")
                      : statusKind === "ready"
                        ? t("facturasCostes.panelStatusReady")
                        : statusKind === "alert"
                          ? t("facturasCostes.panelStatusAlert")
                          : "—";
                  return (
                    <PanelCabinaSection title={t("facturasCostes.panelSectionState")} first>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 10px" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              padding: "5px 11px",
                              borderRadius: 8,
                              border: `1px solid ${FASE_ACCENT[pf]}`,
                              background: "rgba(15, 23, 42, 0.92)",
                              color: "#fef3c7",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {faseEcoLabel(pf, t)}
                          </span>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, lineHeight: 1.4, flex: "1 1 140px" }}>{faseEcoSub(pf, t)}</span>
                        </div>
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: 9,
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.45,
                            border:
                              statusKind === "ready"
                                ? "1px solid rgba(52, 211, 153, 0.28)"
                                : statusKind === "alert"
                                  ? "1px solid rgba(251, 191, 36, 0.35)"
                                  : "1px solid rgba(71, 85, 105, 0.45)",
                            background:
                              statusKind === "ready"
                                ? "rgba(6, 78, 59, 0.22)"
                                : statusKind === "alert"
                                  ? "rgba(69, 26, 3, 0.35)"
                                  : "rgba(15, 23, 42, 0.5)",
                            color: statusKind === "ready" ? "#a7f3d0" : statusKind === "alert" ? "#fde68a" : "#64748b",
                          }}
                        >
                          {statusText}
                        </div>
                      </div>
                    </PanelCabinaSection>
                  );
                })()}

                <PanelCabinaSection title={t("facturasCostes.panelSectionIssues")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#787f8f", marginBottom: 6 }}>{t("facturasCostes.panelOcr")}</div>
                      <div
                        style={{
                          padding: "9px 11px",
                          borderRadius: 8,
                          border: "1px dashed rgba(100, 116, 139, 0.4)",
                          background: "rgba(15, 23, 42, 0.65)",
                          fontSize: 10,
                          color: compraSinFacturaDoc(panelCompra) ? "#fcd34d" : "#787f8f",
                          lineHeight: 1.5,
                          fontWeight: 600,
                        }}
                      >
                        {compraSinFacturaDoc(panelCompra) ? t("facturasCostes.panelOcrPending") : t("facturasCostes.panelOcrPlaceholder")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#787f8f", marginBottom: 6 }}>{t("facturasCostes.panelEconDiff")}</div>
                      <div style={{ fontSize: 11, color: hasDiferenciaNotas(panelCompra) ? "#fcd34d" : "#94a3b8", fontWeight: 600, lineHeight: 1.45 }}>
                        {hasDiferenciaNotas(panelCompra) ? t("facturasCostes.panelDiffDetected") : t("facturasCostes.panelDiffNone")}
                      </div>
                    </div>
                  </div>
                </PanelCabinaSection>

                <PanelCabinaSection title={t("facturasCostes.panelSectionCross")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600, lineHeight: 1.45 }}>
                      {t("facturasCostes.panelRelatedLine", { id: panelCompra.id.slice(-8), estado: estadoCompraLabel(panelCompra.estado, t) })}
                    </div>
                    <div style={{ height: 1, background: "rgba(51, 65, 85, 0.5)", margin: "2px 0" }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#787f8f", marginBottom: 2 }}>{t("facturasCostes.panelEconStateLine")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#fef3c7" }}>{faseEcoLabel(faseEconomica(panelCompra), t)}</span>
                      <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{faseEcoSub(faseEconomica(panelCompra), t)}</span>
                    </div>
                  </div>
                </PanelCabinaSection>

                <PanelCabinaSection title={t("facturasCostes.panelChecklist")}>
                  <div style={{ marginTop: -4 }}>
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
                      last
                    />
                  </div>
                </PanelCabinaSection>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  padding: "12px 14px 14px",
                  borderTop: "1px solid rgba(51, 65, 85, 0.55)",
                  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.95) 100%)",
                  boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPanelId(null)}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "linear-gradient(180deg, rgba(251, 191, 36, 0.98) 0%, rgba(217, 119, 6, 0.95) 100%)",
                    color: "#1c1917",
                    padding: "14px 16px",
                    borderRadius: 11,
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    boxShadow: "0 4px 22px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                    letterSpacing: "-0.01em",
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
