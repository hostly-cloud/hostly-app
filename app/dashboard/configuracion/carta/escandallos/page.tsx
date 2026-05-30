"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";
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
import { loadPlatos, syncPlatoPrecioFromEscandalloSave } from "@/lib/platos-local";

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

export default function ConfigCartaEscandallosPage() {
  const restauranteId = useMemo(() => getBrowserRestauranteId()?.trim() ?? "", []);
  const [items, setItems] = useState<EscandalloListRow[]>([]);
  const [drafts, setDrafts] = useState<EscandalloDraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<EscandalloToolbarTier>("all");

  const platosStats = useMemo(() => {
    const base = { activos: 0, con: 0, sin: 0, margenBajo: 0, costeMedio: null as number | null };
    if (!restauranteId) return base;
    const platos = loadPlatos(restauranteId);
    const activos = platos.filter((p) => p.activo);
    const con = activos.filter((p) => p.tieneEscandallo === true || p.escandalloSupabaseId != null);
    const sin = activos.filter((p) => !(p.tieneEscandallo === true || p.escandalloSupabaseId != null));
    return { ...base, activos: activos.length, con: con.length, sin: sin.length };
  }, [restauranteId]);

  const cargar = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const listStats = useMemo(() => computeEscandalloListStats(items, drafts), [items, drafts]);

  const kpiStats = useMemo(() => {
    let margenBajo = 0;
    const costes: number[] = [];
    for (const item of items) {
      const draft = getDraftForItem(item, drafts);
      const costeN = parseNullableNumber(draft.coste_total);
      const ventaN = parseNullableNumber(draft.precio_venta);
      const tier = marginHealthCategory(computeMarginPercent(costeN, ventaN));
      if (tier === "peligro" || tier === "ajustado") margenBajo += 1;
      if (costeN != null) costes.push(costeN);
    }
    const costeMedio =
      costes.length > 0 ? roundTo(costes.reduce((s, n) => s + n, 0) / costes.length, 2) : null;
    return { margenBajo, costeMedio };
  }, [items, drafts]);

  const filteredItems = useMemo(() => {
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
      const name = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw || "—";
      return `↑ ${roundTo(m, 1).toFixed(1).replace(".", ",")} % · ${name}`;
    };
    const resolveWorst = (k: string | null) => {
      if (!k) return null;
      const item = items.find((i) => String(i.id) === k);
      if (!item) return null;
      const draft = getDraftForItem(item, drafts);
      const m = computeMarginPercent(parseNullableNumber(draft.coste_total), parseNullableNumber(draft.precio_venta));
      if (m == null) return null;
      const raw = (item.nombre_plato ?? "").trim();
      const name = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw || "—";
      return `↓ ${roundTo(m, 1).toFixed(1).replace(".", ",")} % · ${name}`;
    };
    return { best: resolve(listStats.bestKey), worst: resolveWorst(listStats.worstKey) };
  }, [items, drafts, listStats.bestKey, listStats.worstKey]);

  const updateDraft = useCallback((id: string | number, field: "coste_total" | "precio_venta", value: string) => {
    const key = String(id);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        coste_total: prev[key]?.coste_total ?? "",
        precio_venta: prev[key]?.precio_venta ?? "",
        [field]: value,
      },
    }));
  }, []);

  const guardarFila = useCallback(async (id: string | number) => {
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
  }, [drafts]);

  return (
    <ConfigCartaWorkbench
      title="Escandallos y mermas"
      description="Coste, margen y recetas del catálogo. Lectura operacional densa para cocina y dirección."
      lockViewport
      lockViewportFillParent
      headerActions={
        <button type="button" className="hostly-button-secondary hostly-button-compact" onClick={() => void cargar()}>
          Recargar
        </button>
      }
    >
      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Selecciona un restaurante para gestionar escandallos.
        </div>
      ) : null}

      {error ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--error">{error}</div>
      ) : null}

      {restauranteId ? (
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
            <span className="hostly-carta-config-kpi-pill__label">Con receta</span>
            <span className="hostly-carta-config-kpi-pill__value">{platosStats.con}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--warning">
            <span className="hostly-carta-config-kpi-pill__label">Sin receta</span>
            <span className="hostly-carta-config-kpi-pill__value">{platosStats.sin}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Margen bajo</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpiStats.margenBajo}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Coste medio</span>
            <span className="hostly-carta-config-kpi-pill__value">
              {kpiStats.costeMedio != null ? `${kpiStats.costeMedio.toFixed(2).replace(".", ",")} €` : "—"}
            </span>
          </div>
          {listStats.avgMargin != null ? (
            <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
              <span className="hostly-carta-config-kpi-pill__label">Margen medio</span>
              <span className="hostly-carta-config-kpi-pill__value">
                {roundTo(listStats.avgMargin, 1).toFixed(1).replace(".", ",")} %
              </span>
            </div>
          ) : null}
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

      <ConfigCard flush>
        <EscandallosCartaDataView
          items={filteredItems}
          drafts={drafts}
          savingById={savingById}
          listStats={listStats}
          loading={loading}
          showFilteredEmpty={items.length > 0 && filteredItems.length === 0}
          recipeHref={(id) => `/dashboard/escandallos/${encodeURIComponent(String(id))}`}
          onUpdateDraft={updateDraft}
          onSave={(id) => void guardarFila(id)}
        />
      </ConfigCard>

      <div className="hostly-carta-config-alert hostly-carta-config-alert--info">
        <span className="font-semibold">Mermas: </span>
        prevé pérdidas por fileteado o cocción en la receta detallada.{" "}
        <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
          Vincular desde Productos
        </Link>
      </div>
    </ConfigCartaWorkbench>
  );
}
