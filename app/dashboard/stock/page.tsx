"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
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
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: "-0.015em",
} satisfies CSSProperties;

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
  boxShadow: "var(--hostly-shadow-hairline)",
} satisfies CSSProperties;

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  marginBottom: 6,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const colHeadStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--hostly-ink-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  lineHeight: 1.2,
};

/** Rejilla alineada cabecera + filas (TPV). */
const stockRowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(72px, 0.75fr) minmax(72px, 0.75fr) minmax(92px, 0.95fr) minmax(148px, auto)",
  gap: 12,
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
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
  switch (tone) {
    case "ok":
      return {
        ...base,
        background: "var(--hostly-success-soft)",
        border: "1px solid rgba(22, 163, 74, 0.35)",
        color: "#166534",
      };
    case "bajo":
      return {
        ...base,
        background: "var(--hostly-warning-soft)",
        border: "1px solid rgba(217, 119, 6, 0.35)",
        color: "#92400e",
      };
    case "critico":
      return {
        ...base,
        background: "var(--hostly-danger-soft)",
        border: "1px solid rgba(220, 38, 38, 0.32)",
        color: "#991b1b",
      };
    default:
      return {
        ...base,
        background: "var(--hostly-danger-soft)",
        border: "1px solid rgba(127, 29, 29, 0.35)",
        color: "#7f1d1d",
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
        accent: "var(--hostly-ink-muted)",
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
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.025em",
    color: "var(--hostly-navy-deep)",
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
        compactLayout
        operationalFocus
        lockViewport
      >
        <p style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("stock.title")}
      subtitle={t("stock.subtitle")}
      compactLayout
      operationalFocus
      lockViewport
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          style={{
            border: "1px solid rgba(34, 197, 94, 0.32)",
            background: "var(--hostly-success-soft)",
            color: "var(--hostly-navy-deep)",
            padding: "9px 14px",
            borderRadius: 10,
            fontWeight: 600,
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
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--hostly-success-soft)",
              border: "1px solid rgba(22, 163, 74, 0.28)",
              color: "#166534",
              fontSize: 14,
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
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--hostly-warning-soft)",
              border: "1px solid rgba(217, 119, 6, 0.28)",
              color: "#92400e",
              fontSize: 13,
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
            gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
            gap: 7,
          }}
        >
          {kpiCards.map((m) => (
            <div
              key={m.key}
              style={{
                background: "var(--hostly-surface-card-solid)",
                borderRadius: 12,
                padding: "8px 10px",
                border: "1px solid var(--hostly-line)",
                boxShadow: "var(--hostly-shadow-card)",
                borderTop: `2px solid ${m.accent}`,
                minWidth: 0,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--hostly-ink-muted)",
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
                  color: "var(--hostly-ink-soft)",
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
            background: "var(--hostly-surface-card-soft)",
            border: "1px solid var(--hostly-line)",
            boxShadow: "var(--hostly-shadow-card)",
          }}
        >
            <div
            style={{
              flexShrink: 0,
              padding: "7px 10px 5px",
              borderBottom: "1px solid var(--hostly-line)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 200px" }}>
              <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("stock.listTitle")}</h2>
              {items.length > 0 ? (
                <p style={OPER_PRIMARY_COUNT_META}>
                  {t("stock.listCount", { shown: displayedProducts.length, total: tierFilteredSorted.length })}
                </p>
              ) : null}
            </div>
            {items.length > 0 ? (
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("stock.searchPlaceholder")}
                autoComplete="off"
                aria-label={t("stock.searchPlaceholder")}
                style={{
                  ...inputStyle,
                  minWidth: 160,
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: "220px",
                  maxWidth: 400,
                }}
              />
            ) : null}
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
              <p style={{ margin: 0, fontSize: 14, color: "var(--hostly-ink-muted)" }}>{t("stock.noProducts")}</p>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  marginTop: 12,
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "12px 22px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 15,
                }}
              >
                {t("stock.addFirst")}
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  rowGap: 8,
                  padding: "6px 10px 8px",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
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
                        border: active ? "1px solid rgba(49, 95, 125, 0.4)" : "1px solid var(--hostly-line)",
                        background: active ? "var(--hostly-accent-soft)" : "var(--hostly-surface-card-solid)",
                        color: active ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                        padding: "7px 12px",
                        borderRadius: 999,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1.25,
                        minHeight: 38,
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
                    padding: "9px 11px",
                    background: "var(--hostly-surface-card-solid)",
                    borderRadius: 10,
                    border: "1px solid var(--hostly-line)",
                    boxShadow: "var(--hostly-shadow-card)",
                  }}
                >
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, lineHeight: 1.2, color: "var(--hostly-ink-strong)" }}>
                    {editingId ? t("stock.editProduct") : t("stock.newProduct")}
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 12,
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
                  <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={submitForm}
                      style={{
                        border: "none",
                        background: "var(--hostly-accent)",
                        color: "#ffffff",
                        padding: "10px 18px",
                        borderRadius: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
                      {t("common.saveChanges")}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      style={{
                        border: "1px solid var(--hostly-line)",
                        background: "transparent",
                        color: "var(--hostly-ink-muted)",
                        padding: "10px 18px",
                        borderRadius: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 15,
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
                  padding: "0 8px 8px",
                  overflow: "hidden",
                }}
              >
                {tierFilteredSorted.length === 0 ? (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--hostly-ink-muted)", fontSize: 13 }}>
                    {t("stock.filterEmpty")}
                  </div>
                ) : displayedProducts.length === 0 ? (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--hostly-ink-muted)", fontSize: 13 }}>
                    {t("stock.searchNoResults")}
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid var(--hostly-line)",
                      overflow: "hidden",
                      background: "var(--hostly-surface-card-solid)",
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        ...stockRowGrid,
                        padding: "10px 12px",
                        background: "var(--hostly-surface-page-soft)",
                        borderBottom: "1px solid var(--hostly-line)",
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
                              padding: "12px 12px",
                              borderBottom: isLast ? "none" : "1px solid var(--hostly-line)",
                              background: isHover ? "var(--hostly-surface-page-soft)" : "var(--hostly-surface-card-solid)",
                              boxShadow: `inset 3px 0 0 ${rowStripeColor(st.tone)}`,
                              transition: "background 0.12s ease",
                            }}
                          >
                            <div style={{ minWidth: 0, paddingLeft: 4 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--hostly-ink-strong)",
                                  letterSpacing: "-0.015em",
                                  lineHeight: 1.25,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={p.nombre}
                              >
                                {p.nombre}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--hostly-ink-muted)", marginTop: 2, lineHeight: 1.2 }}>
                                {t("common.unit")}: {p.unidad}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ ...tabularFigures, fontSize: 14, fontWeight: 700, color: "var(--hostly-navy-deep)" }}>
                                {formatQtyDisplay(p.stock_actual, locale)}
                              </span>
                              <div style={{ fontSize: 10, color: "var(--hostly-ink-muted)", marginTop: 1 }}>{p.unidad}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ ...tabularFigures, fontSize: 13, fontWeight: 600, color: "var(--hostly-ink)" }}>
                                {formatQtyDisplay(p.stock_minimo, locale)}
                              </span>
                              <div style={{ fontSize: 10, color: "var(--hostly-ink-muted)", marginTop: 1 }}>{p.unidad}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <span style={statusPillStyle(st.tone)}>{st.label}</span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "flex-end", alignItems: "center" }}>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                style={{
                                  border: "1px solid var(--hostly-line)",
                                  background: "var(--hostly-surface-page-soft)",
                                  color: "var(--hostly-ink-muted)",
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 13,
                                  lineHeight: 1.2,
                                }}
                              >
                                {t("common.edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                style={{
                                  border: "1px solid rgba(49, 95, 125, 0.35)",
                                  background: "var(--hostly-info-soft)",
                                  color: "var(--hostly-navy-deep)",
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 13,
                                  lineHeight: 1.2,
                                }}
                              >
                                {t("stock.actionAdjust")}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeProduct(p.id)}
                                style={{
                                  border: "1px solid rgba(220, 38, 38, 0.35)",
                                  background: "var(--hostly-danger-soft)",
                                  color: "#991b1b",
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 13,
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
