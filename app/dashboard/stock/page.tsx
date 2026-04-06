"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type StockProducto,
  type UnidadStock,
  UNIDADES_STOCK,
  STOCK_CHANGED_EVENT,
  isStockBajo,
  loadStock,
  newStockProductoId,
  saveStock,
} from "@/lib/stock-local";

type StockListFilter = "todos" | "correcto" | "bajo" | "revisar" | "sin_stock";

/** Debajo del mínimo, en el mínimo, o correcto. */
function stockTier(p: StockProducto): "revisar" | "bajo" | "correcto" {
  if (p.stock_actual < p.stock_minimo) return "revisar";
  if (isStockBajo(p)) return "bajo";
  return "correcto";
}

function tierRank(t: "revisar" | "bajo" | "correcto"): number {
  if (t === "revisar") return 0;
  if (t === "bajo") return 1;
  return 2;
}

function formatQtyDisplay(n: number, locale: "es" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    maximumFractionDigits: 3,
  }).format(n);
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const tabularFigures = {
  fontVariantNumeric: "tabular-nums" as const,
  fontFeatureSettings: '"tnum" 1',
} satisfies CSSProperties;

const qtyFormInputStyle = {
  fontVariantNumeric: "tabular-nums" as const,
  fontFeatureSettings: '"tnum" 1',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "-0.015em",
} satisfies CSSProperties;

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
} satisfies CSSProperties;

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 4,
} satisfies CSSProperties;

const colHeadStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  lineHeight: 1.2,
};

/** Rejilla alineada cabecera + filas (TPV). */
const stockRowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(72px, 0.75fr) minmax(72px, 0.75fr) minmax(92px, 0.95fr) minmax(148px, auto)",
  gap: 8,
  alignItems: "center",
};

type StatusTone = "ok" | "bajo" | "critico" | "sin_stock";

function rowStatus(p: StockProducto, t: (k: string) => string): { tone: StatusTone; label: string } {
  if (p.stock_actual === 0) {
    return { tone: "sin_stock", label: t("stock.tierSinStock") };
  }
  const tier = stockTier(p);
  if (tier === "revisar") return { tone: "critico", label: t("stock.tierRevisar") };
  if (tier === "bajo") return { tone: "bajo", label: t("stock.tierBajoMin") };
  return { tone: "ok", label: t("stock.ok") };
}

function statusPillStyle(tone: StatusTone): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
  switch (tone) {
    case "ok":
      return {
        ...base,
        background: "rgba(34, 197, 94, 0.2)",
        border: "1px solid rgba(74, 222, 128, 0.4)",
        color: "#bbf7d0",
      };
    case "bajo":
      return {
        ...base,
        background: "rgba(245, 158, 11, 0.14)",
        border: "1px solid rgba(251, 191, 36, 0.45)",
        color: "#fde68a",
      };
    case "critico":
      return {
        ...base,
        background: "rgba(239, 68, 68, 0.15)",
        border: "1px solid rgba(248, 113, 113, 0.45)",
        color: "#fecaca",
      };
    default:
      return {
        ...base,
        background: "rgba(127, 29, 29, 0.35)",
        border: "1px solid rgba(248, 113, 113, 0.55)",
        color: "#fecaca",
      };
  }
}

function rowStripeColor(tone: StatusTone): string {
  switch (tone) {
    case "ok":
      return "rgba(34, 197, 94, 0.55)";
    case "bajo":
      return "rgba(251, 191, 36, 0.55)";
    case "critico":
      return "rgba(248, 113, 113, 0.65)";
    default:
      return "rgba(220, 38, 38, 0.75)";
  }
}

export default function StockPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listFilter, setListFilter] = useState<StockListFilter>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftUnidad, setDraftUnidad] = useState<UnidadStock>("kg");
  const [draftActual, setDraftActual] = useState("");
  const [draftMinimo, setDraftMinimo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);

  const persist = useCallback((next: StockProducto[]) => {
    setItems(next);
    saveStock(next);
  }, []);

  useEffect(() => {
    function pull() {
      setItems(loadStock());
    }
    pull();
    setHydrated(true);
    window.addEventListener(STOCK_CHANGED_EVENT, pull);
    return () => window.removeEventListener(STOCK_CHANGED_EVENT, pull);
  }, []);

  const stockStats = useMemo(() => {
    let revisar = 0;
    let bajo = 0;
    let correcto = 0;
    let sinStock = 0;
    let qtySum = 0;
    for (const p of items) {
      qtySum += p.stock_actual;
      if (p.stock_actual === 0) sinStock += 1;
      const tier = stockTier(p);
      if (tier === "revisar") revisar += 1;
      else if (tier === "bajo") bajo += 1;
      else correcto += 1;
    }
    return { total: items.length, revisar, bajo, correcto, sinStock, qtySum };
  }, [items]);

  const tierFilteredSorted = useMemo(() => {
    let filtered =
      listFilter === "sin_stock"
        ? items.filter((p) => p.stock_actual === 0)
        : listFilter === "todos"
          ? items
          : items.filter((p) => stockTier(p) === listFilter);
    return [...filtered].sort((a, b) => {
      const ra = tierRank(stockTier(a));
      const rb = tierRank(stockTier(b));
      if (ra !== rb) return ra - rb;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [items, listFilter]);

  const displayedProducts = useMemo(() => {
    const q = normalizeForSearch(listSearch);
    if (!q) return tierFilteredSorted;
    return tierFilteredSorted.filter((p) => normalizeForSearch(p.nombre).includes(q));
  }, [tierFilteredSorted, listSearch]);

  const bajosCount = useMemo(() => items.filter(isStockBajo).length, [items]);

  const kpiCards = useMemo(
    () => [
      {
        key: "total",
        label: t("stock.metricTotalProducts"),
        value: String(stockStats.total),
        sub: t("stock.kpiTotalSub"),
        accent: "#94a3b8",
      },
      {
        key: "crit",
        label: t("stock.metricStockCritical"),
        value: String(stockStats.revisar),
        sub: t("stock.metricStockCriticalSub"),
        accent: "#fb7185",
      },
      {
        key: "zero",
        label: t("stock.metricSinStock"),
        value: String(stockStats.sinStock),
        sub: t("stock.metricSinStockSub"),
        accent: "#f87171",
      },
      {
        key: "sum",
        label: t("stock.metricQtySum"),
        value: formatQtyDisplay(stockStats.qtySum, locale),
        sub: t("stock.metricQtySumSub"),
        accent: "#2dd4bf",
      },
    ],
    [t, stockStats, locale],
  );

  const metricNum: CSSProperties = {
    ...tabularFigures,
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
    lineHeight: 1.1,
  };

  function openCreate() {
    setEditingId(null);
    setDraftNombre("");
    setDraftUnidad("kg");
    setDraftActual("");
    setDraftMinimo("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: StockProducto) {
    setEditingId(p.id);
    setDraftNombre(p.nombre);
    setDraftUnidad(p.unidad);
    setDraftActual(String(p.stock_actual));
    setDraftMinimo(String(p.stock_minimo));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function parseQty(s: string): number | null {
    const x = s.trim().replace(",", ".");
    if (x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function submitForm() {
    setFormError(null);
    const nombre = draftNombre.trim();
    if (!nombre) {
      setFormError("Indica el nombre del producto.");
      return;
    }
    const stock_actual = parseQty(draftActual);
    const stock_minimo = parseQty(draftMinimo);
    if (stock_actual === null || stock_minimo === null) {
      setFormError("Stock actual y mínimo deben ser números mayores o iguales a 0.");
      return;
    }

    if (editingId) {
      const next = items.map((p) =>
        p.id === editingId ? { ...p, nombre, unidad: draftUnidad, stock_actual, stock_minimo } : p,
      );
      persist(next);
      setNotice(t("stock.noticeProductUpdated"));
    } else {
      const nuevo: StockProducto = {
        id: newStockProductoId(),
        nombre,
        unidad: draftUnidad,
        stock_actual,
        stock_minimo,
      };
      persist([...items, nuevo]);
      setNotice(t("stock.noticeProductAdded"));
    }
    closeForm();
    window.setTimeout(() => setNotice(null), 3200);
  }

  function removeProduct(id: string) {
    if (!window.confirm(t("stock.confirmDeleteProduct"))) return;
    persist(items.filter((p) => p.id !== id));
    setNotice(t("stock.noticeProductDeleted"));
    window.setTimeout(() => setNotice(null), 3200);
    if (editingId === id) closeForm();
  }

  if (!hydrated) {
    return (
      <ModulePageShell
        title={t("stock.title")}
        subtitle={t("stock.loadingSubtitle")}
        maxWidth={1180}
        compactLayout
        lockViewport
      >
        <p style={{ color: "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("stock.title")}
      subtitle={t("stock.subtitle")}
      maxWidth={1180}
      compactLayout
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          style={{
            border: "none",
            background: "#22c55e",
            color: "#fff",
            padding: "7px 14px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {t("stock.addProduct")}
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
        {notice ? (
          <div
            style={{
              flexShrink: 0,
              padding: "5px 10px",
              borderRadius: 8,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#bbf7d0",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            {notice}
          </div>
        ) : null}

        {bajosCount > 0 ? (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "5px 10px",
              borderRadius: 8,
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.32)",
              color: "#fcd34d",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            {t("stock.lowStockBanner", { count: bajosCount })}
          </div>
        ) : null}

        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            gap: 6,
          }}
        >
          {kpiCards.map((m) => (
            <div
              key={m.key}
              style={{
                background: "#1e293b",
                borderRadius: 10,
                padding: "8px 10px",
                border: "1px solid #334155",
                boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
                borderTop: `2px solid ${m.accent}`,
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
                {m.label}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  ...metricNum,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={m.value}
              >
                {m.value}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color: "#94a3b8",
                  lineHeight: 1.3,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {m.sub}
              </p>
            </div>
          ))}
        </div>

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
              borderBottom: "1px solid #334155",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
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
                {t("stock.listTitle")}
              </h2>
              {items.length > 0 ? (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.3 }}>
                  {t("stock.listCount", { shown: displayedProducts.length, total: tierFilteredSorted.length })}
                </p>
              ) : null}
            </div>
          </div>

          {items.length === 0 ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 14px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>{t("stock.noProducts")}</p>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  marginTop: 12,
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("stock.addFirst")}
              </button>
            </div>
          ) : (
            <>
              <div style={{ flexShrink: 0, padding: "6px 10px 0" }}>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("stock.searchPlaceholder")}
                  autoComplete="off"
                  aria-label={t("stock.searchPlaceholder")}
                  style={{ ...inputStyle, padding: "7px 11px" }}
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
                {(
                  [
                    { id: "todos" as const, label: t("stock.filterAll") },
                    { id: "correcto" as const, label: t("stock.filterOk") },
                    { id: "bajo" as const, label: t("stock.filterLow") },
                    { id: "revisar" as const, label: t("stock.filterReview") },
                    { id: "sin_stock" as const, label: t("stock.filterSinStock") },
                  ] as const
                ).map((f) => {
                  const active = listFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setListFilter(f.id)}
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
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {formOpen ? (
                <div
                  style={{
                    flexShrink: 0,
                    maxHeight: "min(240px, 32vh)",
                    overflowY: "auto",
                    margin: "0 10px 8px",
                    padding: "10px 12px",
                    background: "#0f172a",
                    borderRadius: 10,
                    border: "1px solid #334155",
                  }}
                >
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: "#f8fafc" }}>
                    {editingId ? t("stock.editProduct") : t("stock.newProduct")}
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>{t("common.name")}</label>
                      <input value={draftNombre} onChange={(e) => setDraftNombre(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>{t("common.unit")}</label>
                      <select
                        value={draftUnidad}
                        onChange={(e) => setDraftUnidad(e.target.value as UnidadStock)}
                        style={inputStyle}
                      >
                        {UNIDADES_STOCK.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>{t("common.currentStock")}</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={draftActual}
                        onChange={(e) => setDraftActual(e.target.value)}
                        style={{ ...inputStyle, ...qtyFormInputStyle }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t("common.minStock")}</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={draftMinimo}
                        onChange={(e) => setDraftMinimo(e.target.value)}
                        style={{ ...inputStyle, ...qtyFormInputStyle }}
                      />
                    </div>
                  </div>
                  {formError ? (
                    <p style={{ color: "#fca5a5", marginTop: 8, marginBottom: 0, fontSize: 12 }}>{formError}</p>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={submitForm}
                      style={{
                        border: "none",
                        background: "#3b82f6",
                        color: "#fff",
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("common.saveChanges")}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      style={{
                        border: "1px solid #475569",
                        background: "transparent",
                        color: "#e2e8f0",
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  padding: "0 10px 10px",
                  overflow: "hidden",
                }}
              >
                {tierFilteredSorted.length === 0 ? (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    {t("stock.filterEmpty")}
                  </div>
                ) : displayedProducts.length === 0 ? (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    {t("stock.searchNoResults")}
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid #334155",
                      overflow: "hidden",
                      background: "#0f172a",
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        ...stockRowGrid,
                        padding: "6px 10px",
                        background: "#1e293b",
                        borderBottom: "1px solid #334155",
                      }}
                    >
                      <span style={colHeadStyle}>{t("stock.colProduct")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "right" }}>{t("stock.colActual")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "right" }}>{t("stock.colMin")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "center" }}>{t("stock.colStatus")}</span>
                      <span style={{ ...colHeadStyle, textAlign: "right" }}>{t("stock.colActions")}</span>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {displayedProducts.map((p, idx) => {
                        const st = rowStatus(p, t);
                        const isHover = hoverRowId === p.id;
                        const isLast = idx === displayedProducts.length - 1;
                        return (
                          <div
                            key={p.id}
                            onMouseEnter={() => setHoverRowId(p.id)}
                            onMouseLeave={() => setHoverRowId(null)}
                            style={{
                              ...stockRowGrid,
                              padding: "6px 10px",
                              borderBottom: isLast ? "none" : "1px solid #1e293b",
                              background: isHover ? "#172033" : "#0f172a",
                              boxShadow: `inset 3px 0 0 ${rowStripeColor(st.tone)}`,
                              transition: "background 0.12s ease",
                            }}
                          >
                            <div style={{ minWidth: 0, paddingLeft: 4 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#f8fafc",
                                  letterSpacing: "-0.02em",
                                  lineHeight: 1.25,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={p.nombre}
                              >
                                {p.nombre}
                              </div>
                              <div style={{ fontSize: 10, color: "#475569", marginTop: 2, lineHeight: 1.2 }}>
                                {t("common.unit")}: {p.unidad}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ ...tabularFigures, fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
                                {formatQtyDisplay(p.stock_actual, locale)}
                              </span>
                              <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{p.unidad}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ ...tabularFigures, fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>
                                {formatQtyDisplay(p.stock_minimo, locale)}
                              </span>
                              <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{p.unidad}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <span style={statusPillStyle(st.tone)}>{st.label}</span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                style={{
                                  border: "1px solid #475569",
                                  background: "rgba(30, 41, 59, 0.6)",
                                  color: "#e2e8f0",
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 10,
                                  lineHeight: 1.2,
                                }}
                              >
                                {t("common.edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                style={{
                                  border: "1px solid rgba(59, 130, 246, 0.4)",
                                  background: "rgba(59, 130, 246, 0.12)",
                                  color: "#93c5fd",
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 10,
                                  lineHeight: 1.2,
                                }}
                              >
                                {t("stock.actionAdjust")}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeProduct(p.id)}
                                style={{
                                  border: "1px solid rgba(239, 68, 68, 0.35)",
                                  background: "transparent",
                                  color: "#f87171",
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 10,
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
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </ModulePageShell>
  );
}
