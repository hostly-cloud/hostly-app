"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";
import { EscandallosCartaDataView } from "@/components/carta/escandallos/escandallos-carta-data-view";
import { EscandallosCartaToolbar, type EscandalloToolbarTier } from "@/components/carta/escandallos/escandallos-carta-toolbar";
import {
  computeEscandalloKpiStats,
  computeEscandalloListStats,
  getDraftForItem,
  parseNullableNumber,
  resolveEscandalloRowEconomics,
  roundTo,
  type EscandalloDraftById,
  type EscandalloListRow,
} from "@/components/carta/escandallos/escandallo-display-utils";
import {
  computeEscandalloProfitability,
  computeEscandalloVisualState,
  computeEscandalloVisualStateCounts,
} from "@/components/carta/escandallos/escandallo-row-visual-state";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { updateCentralProduct } from "@/lib/firestore/products";
import {
  ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY,
  fetchEscandalloMergedRowsForRestaurant,
  type EscandalloCatalogSource,
} from "@/lib/platos-escandallo-bridge";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import { syncPlatoPrecioFromEscandalloSave } from "@/lib/platos-local";
import {
  buildEscandalloRecipeEditHref,
  escandalloRecipeEditNavModeFromCatalogSource,
  escandalloRecipeLinkTitle,
} from "@/lib/carta/escandallo-product-edit-nav";

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
  const { profileReady, restaurantId: profileRestaurantId } = useAuth();
  const restauranteId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId) ?? "",
    [profileReady, profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
    requireAuthenticatedTenant: true,
  });
  const centralDocs = useMemo(() => {
    if (operationalCatalog.source !== "central") return null;
    return [...operationalCatalog.productDocumentsById.values()];
  }, [operationalCatalog.productDocumentsById, operationalCatalog.source]);

  const [items, setItems] = useState<EscandalloListRow[]>([]);
  const [drafts, setDrafts] = useState<EscandalloDraftById>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogSource, setCatalogSource] = useState<EscandalloCatalogSource>("legacy_local");
  const [legacyPendingCount, setLegacyPendingCount] = useState(0);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<EscandalloToolbarTier>("all");

  const productDocumentsById = operationalCatalog.productDocumentsById;
  const productDocumentsByIdForCost = operationalCatalog.allProductDocumentsById;
  const isCentralCatalog = (operationalCatalog.source ?? catalogSource) === "central";

  const visualStateById = useMemo(() => {
    const isLegacyCatalog = !isCentralCatalog;
    const map: Record<string, ReturnType<typeof computeEscandalloVisualState>> = {};
    for (const row of items) {
      const key = String(row.id);
      const doc = productDocumentsById.get(key);
      const draft = getDraftForItem(row, drafts);
      const rowCoste = parseNullableNumber(draft.coste_total);
      const salePrice =
        typeof doc?.price === "number" && Number.isFinite(doc.price)
          ? doc.price
          : parseNullableNumber(draft.precio_venta);
      map[key] = computeEscandalloVisualState({
        recipe: doc?.recipe,
        saleProductId: key,
        salePrice,
        productDocumentsById: productDocumentsByIdForCost,
        legacyFallback: isLegacyCatalog,
        rowCoste,
      });
    }
    return map;
  }, [
    catalogSource,
    drafts,
    isCentralCatalog,
    items,
    operationalCatalog.source,
    productDocumentsById,
    productDocumentsByIdForCost,
  ]);

  const profitabilityById = useMemo(() => {
    if (!isCentralCatalog) return undefined;
    const map: Record<string, ReturnType<typeof computeEscandalloProfitability>> = {};
    for (const row of items) {
      const key = String(row.id);
      const doc = productDocumentsById.get(key);
      const draft = getDraftForItem(row, drafts);
      const salePrice =
        typeof doc?.price === "number" && Number.isFinite(doc.price)
          ? doc.price
          : parseNullableNumber(draft.precio_venta);
      map[key] = computeEscandalloProfitability({
        recipe: doc?.recipe,
        saleProductId: key,
        salePrice,
        productDocumentsById: productDocumentsByIdForCost,
      });
    }
    return map;
  }, [drafts, isCentralCatalog, items, productDocumentsById, productDocumentsByIdForCost]);

  const escandalloStateStats = useMemo(
    () => computeEscandalloVisualStateCounts(Object.values(visualStateById)),
    [visualStateById],
  );

  const recipeEditNavMode = useMemo(
    () => escandalloRecipeEditNavModeFromCatalogSource(catalogSource),
    [catalogSource],
  );
  const recipeEditLinkTitle = useMemo(
    () => escandalloRecipeLinkTitle(recipeEditNavMode),
    [recipeEditNavMode],
  );

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

  const economicsOptions = useMemo(
    () =>
      isCentralCatalog && profitabilityById
        ? { profitabilityById, visualStateById }
        : undefined,
    [isCentralCatalog, profitabilityById, visualStateById],
  );

  const listStats = useMemo(
    () => computeEscandalloListStats(items, drafts, economicsOptions),
    [items, drafts, economicsOptions],
  );

  const kpiStats = useMemo(
    () => computeEscandalloKpiStats(items, drafts, economicsOptions),
    [items, drafts, economicsOptions],
  );

  const filteredItems = useMemo(() => {
    let rows = listStats.sortedItems;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((i) => (i.nombre_plato ?? "").toLowerCase().includes(q));
    }
    if (tierFilter !== "all") {
      rows = rows.filter((i) => {
        const key = String(i.id);
        const economics = resolveEscandalloRowEconomics(
          key,
          getDraftForItem(i, drafts),
          i,
          visualStateById[key],
          profitabilityById,
        );
        return economics.marginTier === tierFilter;
      });
    }
    return rows;
  }, [drafts, listStats.sortedItems, profitabilityById, search, tierFilter, visualStateById]);

  const bestWorstBar = useMemo(() => {
    const resolve = (k: string | null, prefix: "↑" | "↓") => {
      if (!k) return null;
      const item = items.find((i) => String(i.id) === k);
      if (!item) return null;
      const economics = resolveEscandalloRowEconomics(
        k,
        getDraftForItem(item, drafts),
        item,
        visualStateById[k],
        profitabilityById,
      );
      if (economics.marginPct == null) return null;
      const raw = (item.nombre_plato ?? "").trim();
      const name = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw || "—";
      return `${prefix} ${roundTo(economics.marginPct, 1).toFixed(1).replace(".", ",")} % · ${name}`;
    };
    return { best: resolve(listStats.bestKey, "↑"), worst: resolve(listStats.worstKey, "↓") };
  }, [drafts, items, listStats.bestKey, listStats.worstKey, profitabilityById, visualStateById]);

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

  const guardarFila = useCallback(
    async (id: string | number) => {
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

        setItems((prev) =>
          prev.map((r) => (String(r.id) === key ? { ...r, coste_total, precio_venta } : r)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar la fila.");
      } finally {
        setSavingById((prev) => ({ ...prev, [key]: false }));
      }
    },
    [catalogSource, drafts, restauranteId],
  );

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

      {restauranteId ? (
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Productos activos</span>
            <span className="hostly-carta-config-kpi-pill__value">{escandalloStateStats.activos}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--success">
            <span className="hostly-carta-config-kpi-pill__label">Operativos</span>
            <span className="hostly-carta-config-kpi-pill__value">{escandalloStateStats.operativos}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--warning">
            <span className="hostly-carta-config-kpi-pill__label">Incompletos</span>
            <span className="hostly-carta-config-kpi-pill__value">{escandalloStateStats.incompletos}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Sin escandallo</span>
            <span className="hostly-carta-config-kpi-pill__value">{escandalloStateStats.sinEscandallo}</span>
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

      {restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--info">
          Esta vista muestra todos los productos activos para revisar su rentabilidad. El escandallo se
          edita desde la ficha del producto (icono de receta → Configuración → Carta → Productos).
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
          loading={loading || (operationalCatalog.loading && items.length === 0)}
          showFilteredEmpty={items.length > 0 && filteredItems.length === 0}
          recipeHref={(id) => buildEscandalloRecipeEditHref(id, recipeEditNavMode)}
          recipeLinkTitle={recipeEditLinkTitle}
          onUpdateDraft={updateDraft}
          onSave={(id) => void guardarFila(id)}
          visualStateById={visualStateById}
          profitabilityById={profitabilityById}
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
