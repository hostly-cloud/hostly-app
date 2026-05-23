"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
import { fetchEscandalloMergedRowsForBrowser } from "@/lib/platos-escandallo-bridge";
import { syncPlatoPrecioFromEscandalloSave } from "@/lib/platos-local";

type EscandalloRow = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

type DraftById = Record<
  string,
  {
    coste_total: string;
    precio_venta: string;
  }
>;

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

function computeMarginPercent(costeTotal: number | null, precioVenta: number | null): number | null {
  if (precioVenta == null || precioVenta === 0) return null;
  if (costeTotal == null) return null;
  const m = ((precioVenta - costeTotal) / precioVenta) * 100;
  return Number.isFinite(m) ? m : null;
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function getDraftForItem(item: EscandalloRow, drafts: DraftById): { coste_total: string; precio_venta: string } {
  const key = String(item.id);
  return (
    drafts[key] ?? {
      coste_total: item.coste_total == null ? "" : String(item.coste_total),
      precio_venta: item.precio_venta == null ? "" : String(item.precio_venta),
    }
  );
}

type EscandalloListStats = {
  sortedItems: EscandalloRow[];
  avgMargin: number | null;
  bestKey: string | null;
  worstKey: string | null;
};

/** Orden por margen (borrador actual), media solo con márgenes válidos, mejor/peor solo si hay ≥2 y max≠min. */
function computeEscandalloListStats(items: EscandalloRow[], drafts: DraftById): EscandalloListStats {
  const entries = items.map((item) => {
    const key = String(item.id);
    const draft = getDraftForItem(item, drafts);
    const costeN = parseNullableNumber(draft.coste_total);
    const ventaN = parseNullableNumber(draft.precio_venta);
    const marginPct = computeMarginPercent(costeN, ventaN);
    return { item, key, marginPct };
  });

  const withMargin = entries.filter((e): e is (typeof entries)[number] & { marginPct: number } => e.marginPct != null);

  const avgMargin =
    withMargin.length > 0
      ? withMargin.reduce((s, e) => s + e.marginPct, 0) / withMargin.length
      : null;

  let bestKey: string | null = null;
  let worstKey: string | null = null;
  if (withMargin.length >= 2) {
    const maxM = Math.max(...withMargin.map((e) => e.marginPct));
    const minM = Math.min(...withMargin.map((e) => e.marginPct));
    if (maxM !== minM) {
      const maxKeys = withMargin
        .filter((e) => e.marginPct === maxM)
        .map((e) => e.key)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const minKeys = withMargin
        .filter((e) => e.marginPct === minM)
        .map((e) => e.key)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      bestKey = maxKeys[0] ?? null;
      worstKey = minKeys[0] ?? null;
    }
  }

  const sortedItems = [...entries]
    .sort((a, b) => {
      if (a.marginPct == null && b.marginPct == null) {
        return (a.item.nombre_plato ?? "").localeCompare(b.item.nombre_plato ?? "", undefined, {
          sensitivity: "base",
        });
      }
      if (a.marginPct == null) return 1;
      if (b.marginPct == null) return -1;
      if (b.marginPct !== a.marginPct) return b.marginPct - a.marginPct;
      return (a.item.nombre_plato ?? "").localeCompare(b.item.nombre_plato ?? "", undefined, {
        sensitivity: "base",
      });
    })
    .map((e) => e.item);

  return { sortedItems, avgMargin, bestKey, worstKey };
}

type MarginHealth = "none" | "excelente" | "bueno" | "ajustado" | "peligro";

/** Umbrales de negocio: &gt;75 excelente; 65–75 bueno; 55–65 ajustado; &lt;55 peligro. */
function marginHealthCategory(pct: number | null): MarginHealth {
  if (pct == null) return "none";
  if (pct > 75) return "excelente";
  if (pct >= 65) return "bueno";
  if (pct >= 55) return "ajustado";
  return "peligro";
}

function marginHealthPctColor(tier: MarginHealth): string {
  switch (tier) {
    case "excelente":
      return "#4ade80";
    case "bueno":
      return "#6ee7b7";
    case "ajustado":
      return "#fbbf24";
    case "peligro":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

function marginHealthBadgeBaseStyle(tier: MarginHealth): CSSProperties {
  switch (tier) {
    case "excelente":
      return {
        background: "rgba(74, 222, 128, 0.18)",
        border: "1px solid rgba(74, 222, 128, 0.45)",
        color: "#86efac",
      };
    case "bueno":
      return {
        background: "rgba(110, 231, 183, 0.14)",
        border: "1px solid rgba(110, 231, 183, 0.38)",
        color: "#6ee7b7",
      };
    case "ajustado":
      return {
        background: "rgba(251, 191, 36, 0.14)",
        border: "1px solid rgba(245, 158, 11, 0.42)",
        color: "#fcd34d",
      };
    case "peligro":
      return {
        background: "rgba(248, 113, 113, 0.16)",
        border: "1px solid rgba(248, 113, 113, 0.42)",
        color: "#fca5a5",
      };
    default:
      return {};
  }
}

function marginHealthBadgeI18nKey(tier: MarginHealth): string | null {
  switch (tier) {
    case "excelente":
      return "escandallos.marginBadgeExcellent";
    case "bueno":
      return "escandallos.marginBadgeGood";
    case "ajustado":
      return "escandallos.marginBadgeTight";
    case "peligro":
      return "escandallos.marginBadgeDanger";
    default:
      return null;
  }
}

function marginHealthHintI18nKey(tier: MarginHealth): string {
  switch (tier) {
    case "excelente":
      return "escandallos.marginHintExcellent";
    case "bueno":
      return "escandallos.marginHintGood";
    case "ajustado":
      return "escandallos.marginHintTight";
    case "peligro":
      return "escandallos.marginHintDanger";
    default:
      return "escandallos.marginHintIncomplete";
  }
}

/** Columnas alineadas cabecera + filas (listado TPV). */
const TPV_ROW_GRID: CSSProperties = {
  display: "grid",
  // Estructura fija: Producto | Coste | Venta | Margen | Estado | Guardar
  gridTemplateColumns: "minmax(220px, 1.6fr) 110px 110px 110px 140px 120px",
  gap: "6px 10px",
  alignItems: "center",
  padding: "9px 12px",
};

const tpvInputWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  justifyContent: "flex-end",
  width: "100%",
};

const tpvEuroInput: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 40,
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #475569",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  outline: "none",
  boxSizing: "border-box",
};

const tpvEuroSuffix: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  flexShrink: 0,
};

type TierFilterChoice = "all" | Exclude<MarginHealth, "none">;

const TIER_FILTER_CHOICES: { id: TierFilterChoice; labelKey: string }[] = [
  { id: "all", labelKey: "escandallos.tpvFilterAll" },
  { id: "excelente", labelKey: "escandallos.tpvFilterExcellent" },
  { id: "bueno", labelKey: "escandallos.tpvFilterGood" },
  { id: "ajustado", labelKey: "escandallos.tpvFilterTight" },
  { id: "peligro", labelKey: "escandallos.tpvFilterDanger" },
];

export default function EscandallosPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<EscandalloRow[]>([]);
  const [drafts, setDrafts] = useState<DraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilterChoice>("all");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setError(null);
    const { rows: baseRows, error: mergeError } = await fetchEscandalloMergedRowsForBrowser();

    if (mergeError) {
      setError(mergeError);
      setItems([]);
      return;
    }
    let overrides: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
      overrides = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      overrides = {};
    }

    const rows = baseRows.map((r) => {
      const key = String(r.id);
      const ov = overrides[key];
      return typeof ov === "number" && Number.isFinite(ov) ? { ...r, coste_total: ov } : r;
    });

    setItems(rows);
    setDrafts((prev) => {
      const next: DraftById = { ...prev };
      for (const r of rows) {
        const key = String(r.id);
        if (!next[key]) {
          next[key] = {
            coste_total: r.coste_total == null ? "" : formatMoney2OrDash(r.coste_total),
            precio_venta: r.precio_venta == null ? "" : formatMoneyUpTo2OrDash(r.precio_venta),
          };
        }
      }
      return next;
    });
  }

  function formatMoney2OrDash(value: number | null | undefined): string {
    if (value == null) return "-";
    if (!Number.isFinite(value)) return "-";
    return roundTo(value, 2).toFixed(2).replace(".", ",");
  }

  /** Alias por si el JSX o HMR aún referencian el nombre antiguo (evita ReferenceError). */
  function formatMoneyOrDash(value: number | null | undefined): string {
    return formatMoney2OrDash(value);
  }

  function formatMoneyUpTo2OrDash(value: number | null | undefined): string {
    if (value == null) return "-";
    if (!Number.isFinite(value)) return "-";
    const s = roundTo(value, 2).toFixed(2);
    return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1").replace(".", ",");
  }

  function formatMarginOrDash(costeTotal: number | null, precioVenta: number | null): string {
    if (precioVenta == null || precioVenta === 0) return "-";
    if (costeTotal == null) return "-";
    const m = ((precioVenta - costeTotal) / precioVenta) * 100;
    if (!Number.isFinite(m)) return "-";
    return `${m.toFixed(1).replace(".", ",")} %`;
  }

  function updateDraft(id: string | number, field: "coste_total" | "precio_venta", value: string) {
    const key = String(id);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        coste_total: prev[key]?.coste_total ?? "",
        precio_venta: prev[key]?.precio_venta ?? "",
        [field]: value,
      },
    }));
  }

  async function guardarFila(id: string | number) {
    const key = String(id);
    setError(null);
    setSavingById((prev) => ({ ...prev, [key]: true }));

    try {
      const draft = drafts[key] ?? { coste_total: "", precio_venta: "" };
      const coste_total = parseNullableNumber(draft.coste_total);
      const precio_venta = parseNullableNumber(draft.precio_venta);

      syncPlatoPrecioFromEscandalloSave(getBrowserRestauranteId(), Number(id), precio_venta);

      try {
        const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        if (coste_total != null && Number.isFinite(coste_total)) {
          parsed[key] = coste_total;
        } else if (parsed[key] != null) {
          delete parsed[key];
        }
        localStorage.setItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // noop
      }

      setItems((prev) =>
        prev.map((r) => (String(r.id) === key ? { ...r, coste_total, precio_venta } : r)),
      );
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  const listStats = useMemo(() => computeEscandalloListStats(items, drafts), [items, drafts]);

  const filteredSortedItems = useMemo(() => {
    let rows = listStats.sortedItems;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((i) => (i.nombre_plato ?? "").toLowerCase().includes(q));
    }
    if (tierFilter !== "all") {
      rows = rows.filter((i) => {
        const draft = getDraftForItem(i, drafts);
        const tier = marginHealthCategory(
          computeMarginPercent(parseNullableNumber(draft.coste_total), parseNullableNumber(draft.precio_venta)),
        );
        return tier === tierFilter;
      });
    }
    return rows;
  }, [listStats.sortedItems, search, tierFilter, drafts]);

  const bestWorstBar = useMemo(() => {
    const resolve = (k: string | null) => {
      if (!k) return null;
      const item = items.find((i) => String(i.id) === k);
      if (!item) return null;
      const draft = getDraftForItem(item, drafts);
      const m = computeMarginPercent(parseNullableNumber(draft.coste_total), parseNullableNumber(draft.precio_venta));
      if (m == null) return null;
      const raw = (item.nombre_plato ?? "").trim();
      const name = raw.length > 26 ? `${raw.slice(0, 24)}…` : raw || "—";
      return { pct: roundTo(m, 1).toFixed(1), name };
    };
    return { best: resolve(listStats.bestKey), worst: resolve(listStats.worstKey) };
  }, [items, drafts, listStats.bestKey, listStats.worstKey]);

  return (
    <ModulePageShell
      title={t("escandallos.title")}
      subtitle={t("escandallos.subtitle")}
      compactLayout
      operationalFocus
      lockViewport
      headerRight={
        <button
          onClick={cargar}
          type="button"
          style={{
            border: "1px solid rgba(71, 85, 105, 0.65)",
            background: "rgba(15, 23, 42, 0.55)",
            color: "#94a3b8",
            padding: "7px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {t("common.reload")}
        </button>
      }
    >
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          overflow: "hidden",
        }}
      >
        {error ? (
          <div
            style={{
              flexShrink: 0,
              border: "1px solid rgba(248, 113, 113, 0.45)",
              background: "rgba(127, 29, 29, 0.4)",
              color: "#fecaca",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            flexShrink: 0,
            border: "1px solid rgba(56, 189, 248, 0.28)",
            background: "rgba(8, 47, 73, 0.35)",
            color: "#bae6fd",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          El escandallo operativo para consumo de inventario vive en{" "}
          <Link href="/dashboard/productos" style={{ color: "#7dd3fc", fontWeight: 700 }}>
            Catálogo de venta → producto → Escandallo / receta
          </Link>
          . Esta pantalla legacy sigue mostrando coste y margen estimado.
        </div>

        {!error && items.length > 0 ? (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px 10px",
            }}
          >
            {listStats.avgMargin != null ? (
              <div
                style={{
                  padding: "6px 9px",
                  borderRadius: 10,
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                  background: "rgba(34, 197, 94, 0.06)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "#a7f3d0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {t("escandallos.businessAvgMargin", { pct: roundTo(listStats.avgMargin, 1).toFixed(1) })}
                </p>
              </div>
            ) : null}
            <p
              style={{
                margin: 0,
                flex: "1 1 200px",
                fontSize: 11,
                lineHeight: 1.35,
                color: "#5c6570",
                minWidth: 0,
              }}
            >
              {t("escandallos.contextHint")}
            </p>
          </div>
        ) : null}

        {!error && items.length === 0 ? (
          <div
            style={{
              padding: "40px 32px 44px",
              borderRadius: 18,
              border: "1px solid rgba(148, 163, 184, 0.12)",
              background: "linear-gradient(165deg, rgba(30, 41, 59, 0.65) 0%, rgba(15, 23, 42, 0.85) 100%)",
              textAlign: "center",
              boxShadow: "0 10px 36px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#f8fafc",
                lineHeight: 1.3,
              }}
            >
              {t("escandallos.listEmptyTitle")}
            </h2>
            <p
              style={{
                margin: "16px auto 0",
                maxWidth: 440,
                fontSize: 15,
                lineHeight: 1.6,
                color: "#94a3b8",
              }}
            >
              {t("escandallos.listEmptyBody")}
            </p>
            <Link
              href="/dashboard/carta"
              style={{
                display: "inline-block",
                marginTop: 26,
                padding: "12px 22px",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "rgba(15, 23, 42, 0.6)",
                color: "#e2e8f0",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("escandallos.listEmptyCtaCarta")}
            </Link>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div
            style={{
              flexShrink: 0,
              padding: "6px 8px",
              borderRadius: 10,
              border: "1px solid rgba(51, 65, 85, 0.65)",
              background: "#151b2e",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "8px 12px",
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#94a3b8",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t("escandallos.tpvTotalCount", { count: items.length })}
              </span>
              <span style={{ width: 1, height: 18, background: "#475569", flexShrink: 0 }} aria-hidden />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#86efac",
                  fontVariantNumeric: "tabular-nums",
                  maxWidth: 260,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={
                  bestWorstBar.best
                    ? t("escandallos.tpvBestSummary", {
                        pct: bestWorstBar.best.pct,
                        name: bestWorstBar.best.name,
                      })
                    : undefined
                }
              >
                {bestWorstBar.best
                  ? t("escandallos.tpvBestSummary", {
                      pct: bestWorstBar.best.pct,
                      name: bestWorstBar.best.name,
                    })
                  : t("escandallos.tpvBestEmpty")}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fca5a5",
                  fontVariantNumeric: "tabular-nums",
                  maxWidth: 260,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={
                  bestWorstBar.worst
                    ? t("escandallos.tpvWorstSummary", {
                        pct: bestWorstBar.worst.pct,
                        name: bestWorstBar.worst.name,
                      })
                    : undefined
                }
              >
                {bestWorstBar.worst
                  ? t("escandallos.tpvWorstSummary", {
                      pct: bestWorstBar.worst.pct,
                      name: bestWorstBar.worst.name,
                    })
                  : t("escandallos.tpvWorstEmpty")}
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("escandallos.tpvSearchPlaceholder")}
                aria-label={t("escandallos.tpvSearchPlaceholder")}
                style={{
                  marginLeft: "auto",
                  minWidth: 140,
                  flex: "1 1 200px",
                  maxWidth: 360,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #475569",
                  background: "#0f172a",
                  color: "#f8fafc",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {TIER_FILTER_CHOICES.map((opt) => {
                const active = tierFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTierFilter(opt.id)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 10,
                      border: active ? "1px solid rgba(34, 197, 94, 0.55)" : "1px solid rgba(71, 85, 105, 0.55)",
                      background: active ? "rgba(34, 197, 94, 0.18)" : "transparent",
                      color: active ? "#ecfdf5" : "#cbd5e1",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      minHeight: 36,
                      boxSizing: "border-box",
                      touchAction: "manipulation",
                    }}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #334155",
              borderRadius: 12,
              background: "#0f172a",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={{ minWidth: 820 }}>
                <div
                  style={{
                    flexShrink: 0,
                    padding: "6px 10px 5px",
                    borderBottom: "1px solid #334155",
                    background: "#0c1222",
                  }}
                >
                  <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("escandallos.tpvWorkbenchTitle")}</h2>
                </div>
                <div
                  role="row"
                  style={{
                    ...TPV_ROW_GRID,
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    background: "linear-gradient(180deg, #1e293b 0%, #1a2332 100%)",
                    borderBottom: "1px solid rgba(51, 65, 85, 0.85)",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#94a3b8",
                  }}
                >
                  <span>{t("escandallos.tpvHeadDish")}</span>
                  <span style={{ textAlign: "center" }}>{t("escandallos.tpvHeadCost")}</span>
                  <span style={{ textAlign: "center" }}>{t("escandallos.tpvHeadSale")}</span>
                  <span>{t("escandallos.tpvHeadMargin")}</span>
                  <span style={{ textAlign: "center" }}>{t("escandallos.tpvHeadStatus")}</span>
                  <span style={{ textAlign: "center" }}>{t("escandallos.tpvHeadSave")}</span>
                </div>

                {filteredSortedItems.length === 0 ? (
                  <div style={{ padding: "28px 16px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                    {t("escandallos.tpvNoResults")}
                  </div>
                ) : (
                  filteredSortedItems.map((item, rowIdx) => {
                    const key = String(item.id);
                    const draft = getDraftForItem(item, drafts);

                    const costeN = parseNullableNumber(draft.coste_total);
                    const ventaN = parseNullableNumber(draft.precio_venta);
                    const marginText = formatMarginOrDash(costeN, ventaN);
                    const marginTextDisplay = marginText === "-" ? "—" : marginText.replace(".", ",").replace("%", " %");
                    const marginPct = computeMarginPercent(costeN, ventaN);
                    const marginTier = marginHealthCategory(marginPct);
                    const marginColor = marginHealthPctColor(marginTier);
                    const badgeKey = marginHealthBadgeI18nKey(marginTier);
                    const hintKey = marginHealthHintI18nKey(marginTier);
                    const isBest = listStats.bestKey === key;
                    const isWorst = listStats.worstKey === key;
                    let vsAvgLine: string | null = null;
                    let vsAvgColor = "#94a3b8";
                    if (marginPct != null && listStats.avgMargin != null) {
                      const diff = roundTo(marginPct - listStats.avgMargin, 1);
                      if (Math.abs(diff) < 0.05) {
                        vsAvgLine = t("escandallos.marginVsAvgFlat");
                      } else if (diff > 0) {
                        vsAvgLine = t("escandallos.marginVsAvgAbove", { pct: Math.abs(diff).toFixed(1) });
                        vsAvgColor = "#6ee7b7";
                      } else {
                        vsAvgLine = t("escandallos.marginVsAvgBelow", { pct: Math.abs(diff).toFixed(1) });
                        vsAvgColor = "#fca5a5";
                      }
                    }

                    const zebra = rowIdx % 2 === 1 ? "rgba(30, 41, 59, 0.35)" : "transparent";

                    const ROW_GRID: CSSProperties = {
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1.6fr) 110px 110px 110px 140px 120px",
                      gap: "10px",
                      alignItems: "center",
                      width: "100%",
                      padding: "10px 12px",
                      boxSizing: "border-box",
                    };

                    const CELL_NUM: CSSProperties = {
                      width: "100%",
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                    };

                    return (
                      <div
                        key={key}
                        role="row"
                        style={{
                          ...TPV_ROW_GRID,
                          ...ROW_GRID,
                          borderBottom: "1px solid rgba(51, 65, 85, 0.65)",
                          background: zebra,
                        }}
                      >
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Link
                              href={`/dashboard/escandallos/${encodeURIComponent(String(item.id))}`}
                              className="hostly-tpv-row-link"
                              style={{
                                textDecoration: "none",
                                color: "#f8fafc",
                                fontWeight: 700,
                                fontSize: 14,
                                lineHeight: 1.25,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                                flex: "1 1 80px",
                              }}
                            >
                              {item.nombre_plato ?? t("common.emptyCell")}
                            </Link>
                          </div>
                          {(isBest || isWorst) && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {isBest ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 6px",
                                    borderRadius: 6,
                                    fontSize: 9,
                                    fontWeight: 800,
                                    letterSpacing: "0.04em",
                                    background: "rgba(34, 197, 94, 0.22)",
                                    border: "1px solid rgba(34, 197, 94, 0.5)",
                                    color: "#bbf7d0",
                                  }}
                                >
                                  {t("escandallos.badgeBestMargin")}
                                </span>
                              ) : null}
                              {isWorst ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 6px",
                                    borderRadius: 6,
                                    fontSize: 9,
                                    fontWeight: 800,
                                    letterSpacing: "0.04em",
                                    background: "rgba(248, 113, 113, 0.12)",
                                    border: "1px solid rgba(248, 113, 113, 0.32)",
                                    color: "#fecaca",
                                  }}
                                >
                                  {t("escandallos.badgeWorstMargin")}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>

                        <div style={CELL_NUM}>
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.coste_total}
                            onChange={(e) => updateDraft(item.id, "coste_total", e.target.value)}
                            placeholder={item.coste_total == null ? "" : formatMoney2OrDash(item.coste_total)}
                            aria-label={t("escandallos.ariaTotalCost", {
                              name: item.nombre_plato?.trim() || t("escandallos.unnamedDish"),
                            })}
                            style={{
                              ...tpvEuroInput,
                              width: 110,
                              height: 40,
                              padding: "9px 10px",
                              textAlign: "right",
                            }}
                          />
                          <span style={tpvEuroSuffix}>€</span>
                        </div>

                        <div style={CELL_NUM}>
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={draft.precio_venta}
                            onChange={(e) => updateDraft(item.id, "precio_venta", e.target.value)}
                            placeholder={item.precio_venta == null ? "" : formatMoneyUpTo2OrDash(item.precio_venta)}
                            aria-label={t("escandallos.ariaSalePrice", {
                              name: item.nombre_plato?.trim() || t("escandallos.unnamedDish"),
                            })}
                            style={{
                              ...tpvEuroInput,
                              width: 110,
                              height: 40,
                              padding: "9px 10px",
                              textAlign: "right",
                            }}
                          />
                          <span style={tpvEuroSuffix}>€</span>
                        </div>

                        <div style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 950,
                              fontVariantNumeric: "tabular-nums",
                              color: marginColor,
                              lineHeight: 1.1,
                              justifySelf: "start",
                            }}
                          >
                            {marginTextDisplay}
                          </span>
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 22 }}>
                            {badgeKey ? (
                              <span
                                style={{
                                  ...marginHealthBadgeBaseStyle(marginTier),
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 900,
                                  letterSpacing: "0.06em",
                                  lineHeight: 1.1,
                                  minWidth: 104,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {t(badgeKey)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", color: "#64748b" }}>—</span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              fontVariantNumeric: "tabular-nums",
                              color: vsAvgColor,
                              lineHeight: 1.15,
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={vsAvgLine ?? undefined}
                          >
                            {vsAvgLine ?? "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: "#94a3b8",
                              fontWeight: 550,
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={t(hintKey)}
                          >
                            {t(hintKey)}
                          </div>
                        </div>

                        <button
                          onClick={() => guardarFila(item.id)}
                          type="button"
                          disabled={Boolean(savingById[key])}
                          style={{
                            justifySelf: "center",
                            width: "100%",
                            border: "none",
                            background: savingById[key] ? "#166534" : "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
                            color: "#fff",
                            height: 40,
                            padding: "0 12px",
                            borderRadius: 10,
                            cursor: savingById[key] ? "not-allowed" : "pointer",
                            fontWeight: 800,
                            fontSize: 13,
                            letterSpacing: "0.02em",
                            opacity: savingById[key] ? 0.85 : 1,
                            boxShadow: savingById[key]
                              ? "none"
                              : "0 4px 14px rgba(34, 197, 94, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                            marginRight: 8,
                          }}
                        >
                          {savingById[key] ? t("common.saving") : t("common.save")}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModulePageShell>
  );
}