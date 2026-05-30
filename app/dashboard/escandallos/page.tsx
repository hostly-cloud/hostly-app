"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import { EscandallosCartaDataView } from "@/components/carta/escandallos/escandallos-carta-data-view";
import { EscandallosCartaToolbar, type EscandalloToolbarTier } from "@/components/carta/escandallos/escandallos-carta-toolbar";
import {
  computeEscandalloListStats,
  computeMarginPercent,
  getDraftForItem,
  marginHealthCategory,
  parseNullableNumber,
  roundTo,
  type EscandalloDraftById,
  type EscandalloListRow,
} from "@/components/carta/escandallos/escandallo-display-utils";
import { fetchEscandalloMergedRowsForBrowser } from "@/lib/platos-escandallo-bridge";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { syncPlatoPrecioFromEscandalloSave } from "@/lib/platos-local";

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

function formatMoney2OrDash(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return roundTo(value, 2).toFixed(2).replace(".", ",");
}

function formatMoneyUpTo2OrDash(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const s = roundTo(value, 2).toFixed(2);
  return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1").replace(".", ",");
}

export default function EscandallosPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<EscandalloListRow[]>([]);
  const [drafts, setDrafts] = useState<EscandalloDraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<EscandalloToolbarTier>("all");

  async function cargar() {
    setLoading(true);
    setError(null);
    const { rows: baseRows, error: mergeError } = await fetchEscandalloMergedRowsForBrowser();

    if (mergeError) {
      setError(mergeError);
      setItems([]);
      setLoading(false);
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
      const next: EscandalloDraftById = { ...prev };
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
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

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
    const resolve = (k: string | null, prefix: string) => {
      if (!k) return null;
      const item = items.find((i) => String(i.id) === k);
      if (!item) return null;
      const draft = getDraftForItem(item, drafts);
      const m = computeMarginPercent(parseNullableNumber(draft.coste_total), parseNullableNumber(draft.precio_venta));
      if (m == null) return null;
      const raw = (item.nombre_plato ?? "").trim();
      const name = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw || "—";
      return `${prefix} ${roundTo(m, 1).toFixed(1).replace(".", ",")} % · ${name}`;
    };
    return { best: resolve(listStats.bestKey, "↑"), worst: resolve(listStats.worstKey, "↓") };
  }, [items, drafts, listStats.bestKey, listStats.worstKey]);

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

      setItems((prev) => prev.map((r) => (String(r.id) === key ? { ...r, coste_total, precio_venta } : r)));
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <ModulePageShell
      title={t("escandallos.title")}
      subtitle={t("escandallos.subtitle")}
      compactLayout
      operationalFocus
      denseWorkbench
      lockViewport
      headerRight={
        <button type="button" className="hostly-button-secondary hostly-button-compact" onClick={() => void cargar()}>
          {t("common.reload")}
        </button>
      }
    >
      <div className="hostly-recipe-editor__legacy-shell">
        {error ? (
          <div className="hostly-carta-config-alert hostly-carta-config-alert--error">{error}</div>
        ) : null}

        <div className="hostly-carta-config-alert hostly-carta-config-alert--info">
          El escandallo operativo para inventario vive en{" "}
          <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
            Configuración → Carta → Productos
          </Link>
          . Esta vista mantiene coste y margen estimado.
        </div>

        {!loading && !error && items.length > 0 && listStats.avgMargin != null ? (
          <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
            <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
              <span className="hostly-carta-config-kpi-pill__label">Margen medio</span>
              <span className="hostly-carta-config-kpi-pill__value">
                {roundTo(listStats.avgMargin, 1).toFixed(1).replace(".", ",")} %
              </span>
            </div>
          </div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <EscandallosCartaToolbar
            totalCount={items.length}
            search={search}
            tierFilter={tierFilter}
            onSearchChange={setSearch}
            onTierChange={setTierFilter}
            bestSummary={bestWorstBar.best}
            worstSummary={bestWorstBar.worst}
          />
        ) : null}

        <EscandallosCartaDataView
          items={filteredSortedItems}
          drafts={drafts}
          savingById={savingById}
          listStats={listStats}
          loading={loading}
          showFilteredEmpty={items.length > 0 && filteredSortedItems.length === 0}
          recipeHref={(id) => `/dashboard/escandallos/${encodeURIComponent(String(id))}`}
          onUpdateDraft={updateDraft}
          onSave={(id) => void guardarFila(id)}
          emptyTitle={t("escandallos.listEmptyTitle")}
          emptyBody={t("escandallos.listEmptyBody")}
          emptyCtaHref="/dashboard/carta"
          emptyCtaLabel={t("escandallos.listEmptyCtaCarta")}
          noResultsLabel={t("escandallos.tpvNoResults")}
        />
      </div>
    </ModulePageShell>
  );
}
