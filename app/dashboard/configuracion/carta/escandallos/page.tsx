"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { ConfigCard, ConfigCartaWorkbench } from "../../_components/config-carta-workbench";
import { EscandallosCartaDataView } from "@/components/carta/escandallos/escandallos-carta-data-view";
import { EscandallosCartaToolbar, type EscandalloToolbarTier } from "@/components/carta/escandallos/escandallos-carta-toolbar";
import {
  computeEscandalloListStats,
  getDraftForItem,
  parseNullableNumber,
  resolveEscandalloRowEconomics,
  roundTo,
  type EscandalloDraftById,
} from "@/components/carta/escandallos/escandallo-display-utils";
import {
  computeEscandalloProfitability,
  computeEscandalloVisualState,
  computeEscandalloVisualStateCounts,
} from "@/components/carta/escandallos/escandallo-row-visual-state";
import { buildCanonicalEscandalloRows } from "@/lib/carta/escandallo-canonical";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  buildEscandalloRecipeEditHref,
  escandalloRecipeEditNavModeFromCatalogSource,
  escandalloRecipeLinkTitle,
} from "@/lib/carta/escandallo-product-edit-nav";

const EMPTY_DRAFTS: EscandalloDraftById = {};
const EMPTY_SAVING_BY_ID: Record<string, boolean> = {};
const RECIPE_EDIT_NAV_MODE = escandalloRecipeEditNavModeFromCatalogSource("central");
const RECIPE_EDIT_LINK_TITLE = escandalloRecipeLinkTitle(RECIPE_EDIT_NAV_MODE);

function noopUpdateDraft() {}
function noopSave() {}

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

  const productDocumentsById = operationalCatalog.productDocumentsById;
  const productDocumentsByIdForCost = operationalCatalog.allProductDocumentsById;
  const items = useMemo(
    () =>
      operationalCatalog.source === "central"
        ? buildCanonicalEscandalloRows([...productDocumentsById.values()])
        : [],
    [operationalCatalog.source, productDocumentsById],
  );

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<EscandalloToolbarTier>("all");

  const visualStateById = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeEscandalloVisualState>> = {};
    for (const row of items) {
      const key = String(row.id);
      const doc = productDocumentsById.get(key);
      const draft = getDraftForItem(row, EMPTY_DRAFTS);
      map[key] = computeEscandalloVisualState({
        recipe: doc?.recipe,
        saleProductId: key,
        salePrice:
          typeof doc?.price === "number" && Number.isFinite(doc.price)
            ? doc.price
            : parseNullableNumber(draft.precio_venta),
        productDocumentsById: productDocumentsByIdForCost,
        legacyFallback: false,
        rowCoste: parseNullableNumber(draft.coste_total),
      });
    }
    return map;
  }, [items, productDocumentsById, productDocumentsByIdForCost]);

  const profitabilityById = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeEscandalloProfitability>> = {};
    for (const row of items) {
      const key = String(row.id);
      const doc = productDocumentsById.get(key);
      const draft = getDraftForItem(row, EMPTY_DRAFTS);
      map[key] = computeEscandalloProfitability({
        recipe: doc?.recipe,
        saleProductId: key,
        salePrice:
          typeof doc?.price === "number" && Number.isFinite(doc.price)
            ? doc.price
            : parseNullableNumber(draft.precio_venta),
        productDocumentsById: productDocumentsByIdForCost,
      });
    }
    return map;
  }, [items, productDocumentsById, productDocumentsByIdForCost]);

  const escandalloStateStats = useMemo(
    () => computeEscandalloVisualStateCounts(Object.values(visualStateById)),
    [visualStateById],
  );

  const economicsOptions = useMemo(
    () => ({ profitabilityById, visualStateById }),
    [profitabilityById, visualStateById],
  );

  const listStats = useMemo(
    () => computeEscandalloListStats(items, EMPTY_DRAFTS, economicsOptions),
    [economicsOptions, items],
  );

  const filteredItems = useMemo(() => {
    let rows = listStats.sortedItems;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((item) =>
        (item.nombre_plato ?? "").toLowerCase().includes(q),
      );
    }
    if (tierFilter !== "all") {
      rows = rows.filter((item) => {
        const key = String(item.id);
        const economics = resolveEscandalloRowEconomics(
          key,
          getDraftForItem(item, EMPTY_DRAFTS),
          item,
          visualStateById[key],
          profitabilityById,
        );
        return economics.marginTier === tierFilter;
      });
    }
    return rows;
  }, [listStats.sortedItems, profitabilityById, search, tierFilter, visualStateById]);

  const bestWorstBar = useMemo(() => {
    const resolve = (key: string | null, prefix: "↑" | "↓") => {
      if (!key) return null;
      const item = items.find((row) => String(row.id) === key);
      if (!item) return null;
      const economics = resolveEscandalloRowEconomics(
        key,
        getDraftForItem(item, EMPTY_DRAFTS),
        item,
        visualStateById[key],
        profitabilityById,
      );
      if (economics.marginPct == null) return null;
      const raw = (item.nombre_plato ?? "").trim();
      const name = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw || "—";
      return `${prefix} ${roundTo(economics.marginPct, 1)
        .toFixed(1)
        .replace(".", ",")} % · ${name}`;
    };
    return {
      best: resolve(listStats.bestKey, "↑"),
      worst: resolve(listStats.worstKey, "↓"),
    };
  }, [items, listStats.bestKey, listStats.worstKey, profitabilityById, visualStateById]);

  return (
    <ConfigCartaWorkbench
      title="Escandallos y mermas"
      description="Coste, margen y recetas del catálogo central. Lectura operacional densa para cocina y dirección."
      lockViewport
      lockViewportFillParent
      headerActions={
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="hostly-button-secondary hostly-button-compact hostly-escandallos-products-link"
        >
          <span aria-hidden>←</span>
          Productos
        </Link>
      }
    >
      <div className="hostly-escandallos-workspace">
      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Necesitas un restaurante autenticado para gestionar escandallos.
        </div>
      ) : null}

      {restauranteId ? (
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Productos</span>
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
        <p className="hostly-escandallos-context-note">
          Coste y margen se calculan desde la receta. Ingredientes, mermas y PVP se editan en
          <Link href="/dashboard/configuracion/carta/productos"> Productos</Link>.
        </p>
      ) : null}

      {!operationalCatalog.loading && items.length > 0 ? (
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

      <ConfigCard flush className="hostly-escandallos-table-card">
        <EscandallosCartaDataView
          items={filteredItems}
          drafts={EMPTY_DRAFTS}
          savingById={EMPTY_SAVING_BY_ID}
          listStats={listStats}
          loading={operationalCatalog.loading}
          showFilteredEmpty={items.length > 0 && filteredItems.length === 0}
          recipeHref={(id) => buildEscandalloRecipeEditHref(id, RECIPE_EDIT_NAV_MODE)}
          recipeLinkTitle={RECIPE_EDIT_LINK_TITLE}
          onUpdateDraft={noopUpdateDraft}
          onSave={noopSave}
          showSaveAction={false}
          visualStateById={visualStateById}
          profitabilityById={profitabilityById}
        />
      </ConfigCard>

      </div>
    </ConfigCartaWorkbench>
  );
}
