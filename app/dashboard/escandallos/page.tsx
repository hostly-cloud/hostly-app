"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
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
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { updateCentralProduct } from "@/lib/firestore/products";
import {
  ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY,
  fetchEscandalloMergedRowsForRestaurant,
  type EscandalloCatalogSource,
} from "@/lib/platos-escandallo-bridge";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { syncPlatoPrecioFromEscandalloSave } from "@/lib/platos-local";

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
  const { restaurantId: profileRestaurantId } = useAuth();
  const restauranteId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
  });
  const centralDocs = useMemo(() => {
    if (operationalCatalog.source !== "central") return null;
    return [...operationalCatalog.productDocumentsById.values()];
  }, [operationalCatalog.productDocumentsById, operationalCatalog.source]);

  const [items, setItems] = useState<EscandalloListRow[]>([]);
  const [drafts, setDrafts] = useState<EscandalloDraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<EscandalloToolbarTier>("all");
  const [catalogSource, setCatalogSource] = useState<EscandalloCatalogSource>("legacy_local");
  const [legacyPendingCount, setLegacyPendingCount] = useState(0);

  const cargar = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const waitForCentral =
      operationalCatalog.loading &&
      operationalCatalog.source === null &&
      centralDocs == null;

    if (waitForCentral) {
      return;
    }

    const {
      rows: baseRows,
      error: mergeError,
      source,
      legacyPendingCount: pending,
    } = await fetchEscandalloMergedRowsForRestaurant({
      profileRestaurantId,
      centralProducts: centralDocs,
      catalogSource: operationalCatalog.source,
    });

    if (mergeError) {
      setError(mergeError);
    }

    setCatalogSource(source);
    setLegacyPendingCount(pending);
    setItems(baseRows);
    setDrafts((prev) => {
      const next: EscandalloDraftById = { ...prev };
      for (const r of baseRows) {
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
  }, [
    centralDocs,
    operationalCatalog.loading,
    operationalCatalog.source,
    profileRestaurantId,
    restauranteId,
  ]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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

      if (catalogSource === "central") {
        if (precio_venta != null && Number.isFinite(precio_venta)) {
          await updateCentralProduct(restauranteId, key, { price: precio_venta });
        }
      } else {
        syncPlatoPrecioFromEscandalloSave(restauranteId, Number(id), precio_venta);
      }

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la fila.");
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
          Vista heredada. La gestión principal de escandallos está en{" "}
          <Link href="/dashboard/configuracion/carta/escandallos" className="hostly-carta-config-text-link">
            Configuración → Carta → Escandallos
          </Link>
          . Los datos mostrados aquí siguen la misma lectura central-first que esa pantalla.
        </div>

        {catalogSource === "central" && legacyPendingCount > 0 ? (
          <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
            <span className="font-semibold">{legacyPendingCount} producto(s) legacy</span> siguen en este navegador (
            <code className="text-[11px]">hostly.platos.v1</code>) y no forman parte del catálogo central mostrado
            aquí.{" "}
            <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
              Migrar desde Productos
            </Link>
          </div>
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
          loading={loading || (operationalCatalog.loading && items.length === 0)}
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
