"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type MermaLocal,
  type MermaMotivo,
  MERMA_MOTIVOS,
  formatFechaMerma,
  loadMermas,
  newMermaId,
  saveMermas,
} from "@/lib/mermas-local";
import { reconcileMermaStock, undoMermaStockEffect } from "@/lib/mermas-stock-sync";
import type { StockProducto } from "@/lib/stock-local";
import { loadStock, saveStock } from "@/lib/stock-local";

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  backgroundColor: "rgba(15, 23, 42, 0.85)",
  color: "#f8fafc",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 8,
  letterSpacing: "0.02em",
};

/** Input de búsqueda alineado con Stock / TPV (#1e293b). */
const tpvSearchInput: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const tabularQty: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseCantidadInput(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Fecha ISO (YYYY-MM-DD) de hace `days` días. */
function isoDaysAgo(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatMotivoLabel(m: string): string {
  return m
    .split(" ")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatEuro(n: number, locale: "es" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function topProductByQty(list: MermaLocal[]): string | null {
  if (list.length === 0) return null;
  const map = new Map<string, number>();
  for (const m of list) {
    const k = (m.producto_stock_nombre || "").trim() || m.producto_stock_id;
    map.set(k, (map.get(k) ?? 0) + m.cantidad);
  }
  let best: string | null = null;
  let max = 0;
  for (const [name, sum] of map) {
    if (sum > max) {
      max = sum;
      best = name;
    }
  }
  return best;
}

function topMotivo(list: MermaLocal[]): MermaMotivo | null {
  if (list.length === 0) return null;
  const map = new Map<MermaMotivo, number>();
  for (const m of list) {
    map.set(m.motivo, (map.get(m.motivo) ?? 0) + 1);
  }
  let best: MermaMotivo | null = null;
  let max = 0;
  for (const [mo, c] of map) {
    if (c > max) {
      max = c;
      best = mo;
    }
  }
  return best;
}

function motivoBadgeStyles(motivo: MermaMotivo): { bg: string; border: string; color: string } {
  switch (motivo) {
    case "caducado":
      return { bg: "rgba(245, 158, 11, 0.1)", border: "rgba(251, 191, 36, 0.22)", color: "#fcd34d" };
    case "roto":
      return { bg: "rgba(248, 113, 113, 0.1)", border: "rgba(252, 165, 165, 0.2)", color: "#fca5a5" };
    case "error cocina":
      return { bg: "rgba(96, 165, 250, 0.1)", border: "rgba(147, 197, 253, 0.22)", color: "#93c5fd" };
    case "invitación":
      return { bg: "rgba(167, 139, 250, 0.1)", border: "rgba(196, 181, 253, 0.22)", color: "#c4b5fd" };
    default:
      return { bg: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.2)", color: "#cbd5e1" };
  }
}

type MotivoListFilter = "todos" | MermaMotivo;

/** Módulo TPV: KPIs, alta, buscador, filtros y listado. Panel análisis (mermas.analysis*) retirado de la vista; strings siguen en locales. */
export default function MermasPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<MermaLocal[]>([]);
  const [stockRows, setStockRows] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFecha, setDraftFecha] = useState("");
  const [draftProductoId, setDraftProductoId] = useState("");
  const [draftCantidad, setDraftCantidad] = useState("");
  const [draftMotivo, setDraftMotivo] = useState<MermaMotivo>("otro");
  const [draftNotas, setDraftNotas] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [kpiHover, setKpiHover] = useState<number | null>(null);
  const [ctaHover, setCtaHover] = useState(false);
  const [hoveredMermaId, setHoveredMermaId] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [motivoListFilter, setMotivoListFilter] = useState<MotivoListFilter>("todos");

  const refresh = useCallback(() => {
    setItems(loadMermas());
    setStockRows(loadStock());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return b.id.localeCompare(a.id);
    });
  }, [items]);

  const motivoFiltered = useMemo(() => {
    if (motivoListFilter === "todos") return sorted;
    return sorted.filter((m) => m.motivo === motivoListFilter);
  }, [sorted, motivoListFilter]);

  const displayedMermas = useMemo(() => {
    const q = normalizeForSearch(listSearch);
    if (!q) return motivoFiltered;
    return motivoFiltered.filter((m) => {
      const name = normalizeForSearch(m.producto_stock_nombre || "");
      const motivo = normalizeForSearch(formatMotivoLabel(m.motivo));
      const notas = normalizeForSearch(m.notas || "");
      const fecha = normalizeForSearch(m.fecha);
      const id = normalizeForSearch(m.producto_stock_id);
      const shownFecha = normalizeForSearch(formatFechaMerma(m.fecha));
      return (
        name.includes(q) ||
        motivo.includes(q) ||
        notas.includes(q) ||
        fecha.includes(q) ||
        id.includes(q) ||
        shownFecha.includes(q)
      );
    });
  }, [motivoFiltered, listSearch]);

  const isoToday = todayIso();
  const cutoff30 = isoDaysAgo(30);

  const itemsLast30 = useMemo(() => items.filter((m) => m.fecha >= cutoff30), [items, cutoff30]);

  const lostCostEuro = useMemo(() => {
    return 0;
  }, []);

  const topProduct30 = useMemo(() => topProductByQty(itemsLast30), [itemsLast30]);
  const topProductAll = useMemo(() => (items.length > 0 ? topProductByQty(items) : null), [items]);
  const kpiTopProduct = topProduct30 ?? topProductAll;

  const topMotivo30 = useMemo(() => topMotivo(itemsLast30), [itemsLast30]);
  const topMotivoAll = useMemo(() => (items.length > 0 ? topMotivo(items) : null), [items]);
  const kpiTopMotivo = topMotivo30 ?? topMotivoAll;

  function openCreate() {
    setEditingId(null);
    setDraftFecha(isoToday);
    setDraftProductoId("");
    setDraftCantidad("");
    setDraftMotivo("otro");
    setDraftNotas("");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function openEdit(m: MermaLocal) {
    setEditingId(m.id);
    setDraftFecha(m.fecha);
    setDraftProductoId(m.producto_stock_id);
    setDraftCantidad(String(m.cantidad));
    setDraftMotivo(m.motivo);
    setDraftNotas(m.notas ?? "");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function submit() {
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFecha.trim())) {
      setFormError(t("mermas.errorInvalidDate"));
      return;
    }
    const pid = draftProductoId.trim();
    if (!pid) {
      setFormError(t("mermas.errorPickProduct"));
      return;
    }
    const qty = parseCantidadInput(draftCantidad);
    if (qty == null) {
      setFormError(t("mermas.errorQtyPositive"));
      return;
    }
    const stock = loadStock();
    const p = stock.find((x) => x.id === pid);
    const prev =
      editingId != null ? (loadMermas().find((x) => x.id === editingId) ?? null) : null;
    const nextRaw: MermaLocal = {
      id: editingId ?? newMermaId(),
      fecha: draftFecha.trim(),
      producto_stock_id: pid,
      producto_stock_nombre: p?.nombre ?? "",
      unidad: p?.unidad ?? "uds",
      cantidad: qty,
      motivo: draftMotivo,
      notas: draftNotas.trim() || undefined,
      stock_aplicado: false,
    };
    const { stock: newStock, merma, error } = reconcileMermaStock(prev, nextRaw, stock);
    if (error) {
      setFormError(error);
      return;
    }
    const nextMermas =
      editingId != null
        ? loadMermas().map((x) => (x.id === editingId ? merma : x))
        : [...loadMermas(), merma];
    saveMermas(nextMermas);
    saveStock(newStock);
    setItems(nextMermas);
    setStockRows(newStock);
    closeForm();
  }

  function remove(id: string) {
    if (!window.confirm(t("mermas.confirmDelete"))) return;
    const m = loadMermas().find((x) => x.id === id);
    if (!m) return;
    let st = loadStock();
    st = undoMermaStockEffect(m, st);
    const nextMermas = loadMermas().filter((x) => x.id !== id);
    saveMermas(nextMermas);
    saveStock(st);
    setItems(nextMermas);
    setStockRows(st);
    if (editingId === id) closeForm();
  }

  const kpiCards = useMemo(
    () => [
      {
        title: t("mermas.kpiLostCostTitle"),
        value: formatEuro(lostCostEuro, locale),
        sub: t("mermas.kpiLostCostSub"),
        accent: "#fbbf24",
      },
      {
        title: t("mermas.kpiRegisteredTitle"),
        value: String(items.length),
        sub: t("mermas.kpiRegisteredSub"),
        accent: "#60a5fa",
      },
      {
        title: t("mermas.kpiTopProductTitle"),
        value: kpiTopProduct ?? t("common.emDash"),
        sub: kpiTopProduct
          ? topProduct30 != null
            ? t("mermas.kpiBasedOnWindow")
            : t("mermas.kpiBasedOnAll")
          : t("mermas.kpiTopProductEmptySub"),
        accent: "#a78bfa",
      },
      {
        title: t("mermas.kpiTopReasonTitle"),
        value: kpiTopMotivo ? formatMotivoLabel(kpiTopMotivo) : t("common.emDash"),
        sub: kpiTopMotivo
          ? topMotivo30 != null
            ? t("mermas.kpiBasedOnWindow")
            : t("mermas.kpiBasedOnAll")
          : t("mermas.kpiTopReasonEmptySub"),
        accent: "#94a3b8",
      },
    ],
    [
      t,
      items.length,
      lostCostEuro,
      locale,
      kpiTopProduct,
      kpiTopMotivo,
      topProduct30,
      topMotivo30,
    ],
  );

  const metricFigure: CSSProperties = {
    ...tabularQty,
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    lineHeight: 1,
  };

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("mermas.title")}
        subtitle={t("mermas.loadingSubtitle")}
        maxWidth={1180}
        compactLayout
        lockViewport
      >
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparing")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("mermas.title")}
      subtitle={t("mermas.subtitle")}
      maxWidth={1180}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            border: "1px solid rgba(251, 191, 36, 0.22)",
            background: ctaHover
              ? "linear-gradient(180deg, #d9a066 0%, #b45309 100%)"
              : "linear-gradient(180deg, #ca8a3c 0%, #a05612 100%)",
            color: "#fff",
            padding: "7px 14px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            boxShadow: ctaHover
              ? "0 4px 18px rgba(160, 86, 18, 0.22)"
              : "0 2px 12px rgba(160, 86, 18, 0.14)",
            whiteSpace: "nowrap",
            transition: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
          }}
        >
          {t("mermas.registerMermaCta")}
        </button>
      }
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
        }}
      >
        {/* KPI — mismo criterio visual que Stock (tarjetas #1e293b + acento superior) */}
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            gap: 6,
          }}
        >
          {kpiCards.map((card, i) => (
            <div
              key={card.title}
              onMouseEnter={() => setKpiHover(i)}
              onMouseLeave={() => setKpiHover(null)}
              style={{
                background: "#1e293b",
                borderRadius: 10,
                padding: "8px 10px",
                border: "1px solid #334155",
                boxShadow:
                  kpiHover === i
                    ? "0 4px 18px rgba(0,0,0,0.22)"
                    : "0 2px 12px rgba(0,0,0,0.14)",
                borderTop: `2px solid ${card.accent}`,
                transform: kpiHover === i ? "translateY(-1px)" : "translateY(0)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                minWidth: 0,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  lineHeight: 1.2,
                }}
              >
                {card.title}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  ...metricFigure,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={card.value}
              >
                {card.value}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color: "#94a3b8",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {card.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Listado TPV: buscador + filtros fijos; scroll solo en filas */}
        <section
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 12,
            background: "#1e293b",
            border: "1px solid #334155",
            boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "8px 10px 6px",
              borderBottom: sorted.length > 0 ? "1px solid #334155" : undefined,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 200px" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#f8fafc",
                  lineHeight: 1.2,
                }}
              >
                {t("mermas.activityTitle")}
              </h2>
              {sorted.length > 0 ? (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.3 }}>
                  {displayedMermas.length} / {sorted.length}
                </p>
              ) : null}
            </div>
          </div>

          {sorted.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "10px 12px 12px",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: "1 1 280px", maxWidth: 560 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#f8fafc",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.25,
                    }}
                  >
                    {t("mermas.emptyPremiumTitle")}
                  </h3>
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                    {t("mermas.emptyPremiumBody")}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                {(
                  [
                    { title: t("mermas.insight1Title"), body: t("mermas.insight1Body") },
                    { title: t("mermas.insight2Title"), body: t("mermas.insight2Body") },
                    { title: t("mermas.insight3Title"), body: t("mermas.insight3Body") },
                  ] as const
                ).map((ins) => (
                  <div
                    key={ins.title}
                    style={{
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "#0f172a",
                      border: "1px solid #334155",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#f1f5f9",
                        letterSpacing: "-0.015em",
                        lineHeight: 1.3,
                      }}
                    >
                      {ins.title}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 11,
                        color: "#8b9aad",
                        lineHeight: 1.45,
                      }}
                    >
                      {ins.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{ flexShrink: 0, padding: "6px 10px 0" }}>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("mermas.searchPlaceholder")}
                  autoComplete="off"
                  aria-label={t("mermas.searchPlaceholder")}
                  style={tpvSearchInput}
                />
              </div>

              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  rowGap: 6,
                  padding: "8px 10px 8px",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#64748b",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {t("stock.filterHint")}
                </span>
                <button
                  type="button"
                  onClick={() => setMotivoListFilter("todos")}
                  style={{
                    border:
                      motivoListFilter === "todos"
                        ? "1px solid rgba(96, 165, 250, 0.55)"
                        : "1px solid #334155",
                    background: motivoListFilter === "todos" ? "rgba(59, 130, 246, 0.18)" : "#0f172a",
                    color: motivoListFilter === "todos" ? "#e2e8f0" : "#94a3b8",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 11,
                    lineHeight: 1.25,
                  }}
                >
                  {t("stock.filterAll")}
                </button>
                {MERMA_MOTIVOS.map((mo) => {
                  const active = motivoListFilter === mo;
                  return (
                    <button
                      key={mo}
                      type="button"
                      onClick={() => setMotivoListFilter(mo)}
                      style={{
                        border: active ? "1px solid rgba(96, 165, 250, 0.55)" : "1px solid #334155",
                        background: active ? "rgba(59, 130, 246, 0.18)" : "#0f172a",
                        color: active ? "#e2e8f0" : "#94a3b8",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 11,
                        lineHeight: 1.25,
                        maxWidth: "100%",
                      }}
                    >
                      {formatMotivoLabel(mo)}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "4px 10px 10px",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {displayedMermas.length === 0 ? (
                  <div style={{ padding: "14px 10px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    {t("mermas.searchNoResults")}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {displayedMermas.map((m) => {
                      const isHover = hoveredMermaId === m.id;
                      const badge = motivoBadgeStyles(m.motivo);
                      return (
                        <div
                          key={m.id}
                          onMouseEnter={() => setHoveredMermaId(m.id)}
                          onMouseLeave={() => setHoveredMermaId(null)}
                          style={{
                            borderRadius: 8,
                            padding: "6px 10px",
                            background: isHover
                              ? "linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.88) 100%)"
                              : "#0f172a",
                            border: `1px solid ${isHover ? "rgba(148, 163, 184, 0.22)" : "#334155"}`,
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            transition: "border-color 0.15s ease, background 0.15s ease",
                          }}
                        >
                          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "6px 10px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#f8fafc",
                                  letterSpacing: "-0.02em",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "100%",
                                }}
                                title={m.producto_stock_nombre}
                              >
                                {m.producto_stock_nombre}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" }}>
                                {formatFechaMerma(m.fecha)}
                              </span>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  letterSpacing: "0.02em",
                                  background: badge.bg,
                                  border: `1px solid ${badge.border}`,
                                  color: badge.color,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatMotivoLabel(m.motivo)}
                              </span>
                            </div>
                            {m.notas ? (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 10,
                                  color: "#64748b",
                                  fontStyle: "italic",
                                  lineHeight: 1.4,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={m.notas}
                              >
                                {m.notas}
                              </p>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 4,
                                padding: "4px 10px",
                                borderRadius: 8,
                                background: "rgba(15, 23, 42, 0.9)",
                                border: "1px solid #334155",
                              }}
                            >
                              <span
                                style={{
                                  ...tabularQty,
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: m.fecha === isoToday ? "#fdba74" : "#f8fafc",
                                  letterSpacing: "-0.03em",
                                  lineHeight: 1,
                                }}
                              >
                                {m.cantidad}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>{m.unidad}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              style={{
                                border: "1px solid #475569",
                                background: "transparent",
                                color: "#e2e8f0",
                                padding: "5px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 11,
                                lineHeight: 1.2,
                              }}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(m.id)}
                              style={{
                                border: "1px solid rgba(248, 113, 113, 0.35)",
                                background: "transparent",
                                color: "#f87171",
                                padding: "5px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 11,
                                lineHeight: 1.2,
                              }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merma-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(2, 6, 23, 0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "min(90vh, 720px)",
              overflowY: "auto",
              borderRadius: 22,
              padding: "28px 28px 26px",
              background: "linear-gradient(165deg, #1e293b 0%, #0f172a 100%)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
              boxShadow: "0 20px 56px rgba(0,0,0,0.42)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="merma-modal-title"
              style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#f8fafc" }}
            >
              {editingId ? t("mermas.modalEditTitle") : t("mermas.modalNewTitle")}
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "#94a3b8", lineHeight: 1.5 }}>{t("mermas.formHint")}</p>

            <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
              <div>
                <label style={labelStyle}>{t("common.date")}</label>
                <input type="date" value={draftFecha} onChange={(e) => setDraftFecha(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t("common.product")}</label>
                <select
                  value={draftProductoId}
                  onChange={(e) => setDraftProductoId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">{t("common.selectEllipsis")}</option>
                  {stockRows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.stock_actual} {p.unidad}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("common.quantity")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={draftCantidad}
                  onChange={(e) => setDraftCantidad(e.target.value)}
                  placeholder={t("mermas.qtyPlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("common.reason")}</label>
                <select
                  value={draftMotivo}
                  onChange={(e) => setDraftMotivo(e.target.value as MermaMotivo)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {MERMA_MOTIVOS.map((mo) => (
                    <option key={mo} value={mo}>
                      {formatMotivoLabel(mo)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("common.notesOptional")}</label>
                <input value={draftNotas} onChange={(e) => setDraftNotas(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 16, marginBottom: 0, fontSize: 14, lineHeight: 1.45 }}>{formError}</p>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
              <button
                type="button"
                onClick={submit}
                style={{
                  border: "1px solid rgba(96, 165, 250, 0.2)",
                  background: "#1e40af",
                  color: "#f8fafc",
                  padding: "13px 24px",
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "-0.01em",
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                  flex: "1 1 160px",
                }}
              >
                {t("mermas.saveMerma")}
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  background: "rgba(30, 41, 59, 0.55)",
                  color: "#cbd5e1",
                  padding: "13px 22px",
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "-0.01em",
                  cursor: "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}
