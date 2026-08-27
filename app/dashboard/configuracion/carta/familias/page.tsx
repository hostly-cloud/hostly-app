"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { listenProductionStations } from "@/lib/firestore/production-stations";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
  ConfigCartaWorkbench,
} from "../../_components/config-carta-workbench";
import { LegacyCatalogPendingNotice } from "@/components/carta/legacy-catalog-pending-notice";
import {
  createCartaFamiliaApi,
  fetchCartaCategorias,
  fetchCartaFamilias,
  patchCartaFamiliaApi,
  reorderCartaFamiliasApi,
} from "@/lib/carta-categorias/api-client";
import {
  buildCartaFamiliaOperativaPayload,
  buildCartaFamiliaProductionStationRef,
  CARTA_FAMILIA_PASE_UI_VALUES,
  DEFAULT_CARTA_FAMILIA_OPERATIVA,
  getCartaFamiliaPaseLabel,
  getCartaFamiliaTypeLabel,
  normalizeCartaFamiliaPase,
  resolveCartaFamiliaOperativa,
  type CartaFamiliaOperativa,
} from "@/lib/carta-categorias/familia-operational-config";
import {
  filterActiveProductionStations,
  PRODUCTION_STATION_TYPE_LABELS,
  resolveFamiliaProductionStationId,
  type ProductionStationDocument,
} from "@/lib/produccion/production-station-types";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import {
  countOrganizedProductsFromCentral,
  countOrganizedProductsFromPlatos,
} from "@/lib/carta/catalog-category-counts";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos } from "@/lib/carta/legacy-platos-storage";
import { CartaCatalogConceptCollapsible } from "@/components/carta/carta-catalog-concept-collapsible";
import { FamiliasCartaDataView } from "@/components/carta/familias-carta-data-view";

const inputClass = "hostly-input hostly-carta-config-field-input";

type FamiliaFormDraft = Pick<
  CartaFamiliaOperativa,
  "familyType" | "trabajaPorPases" | "defaultPass" | "description"
> & {
  productionStationId: string;
};

const DEFAULT_FORM_DRAFT: FamiliaFormDraft = {
  familyType: DEFAULT_CARTA_FAMILIA_OPERATIVA.familyType,
  productionStationId: "",
  trabajaPorPases: false,
  defaultPass: "entrante",
  description: undefined,
};

export default function ConfigCartaFamiliasPage() {
  const { restaurantId: profileRestaurantId, profileReady } = useAuth();
  const restauranteId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId),
    [profileReady, profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
    requireAuthenticatedTenant: true,
  });
  const [items, setItems] = useState<CartaFamilia[]>([]);
  const [categorias, setCategorias] = useState<CartaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<CartaFamilia | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [draftOrder, setDraftOrder] = useState(0);
  const [draftForm, setDraftForm] = useState<FamiliaFormDraft>(DEFAULT_FORM_DRAFT);
  const [productionStations, setProductionStations] = useState<ProductionStationDocument[]>([]);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeProductionStations = useMemo(
    () => filterActiveProductionStations(productionStations),
    [productionStations],
  );

  const selectableProductionStations = useMemo(() => {
    const selectedId = draftForm.productionStationId.trim();
    if (!selectedId || activeProductionStations.some((s) => s.id === selectedId)) {
      return activeProductionStations;
    }
    const current = productionStations.find((s) => s.id === selectedId);
    return current ? [...activeProductionStations, current] : activeProductionStations;
  }, [activeProductionStations, draftForm.productionStationId, productionStations]);

  function resetDraftForm(
    source?: CartaFamilia | null,
    stations: ProductionStationDocument[] = productionStations,
  ) {
    if (!source) {
      setDraftForm({ ...DEFAULT_FORM_DRAFT });
      return;
    }
    const op = resolveCartaFamiliaOperativa(source);
    setDraftForm({
      familyType: op.familyType,
      productionStationId: resolveFamiliaProductionStationId(source, stations),
      trabajaPorPases: op.trabajaPorPases,
      defaultPass:
        op.trabajaPorPases && op.defaultPass !== "sin_pase" ? op.defaultPass : "entrante",
      description: op.description,
    });
  }

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setCategorias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        fetchCartaFamilias(restauranteId),
        fetchCartaCategorias(restauranteId),
      ]);
      setItems(list);
      setCategorias(cats);
    } catch {
      setError("No se pudieron cargar las familias de menú.");
      setItems([]);
      setCategorias([]);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!restauranteId) {
      setProductionStations([]);
      return;
    }
    return listenProductionStations(
      restauranteId,
      setProductionStations,
      () => setProductionStations([]),
    );
  }, [restauranteId]);

  useEffect(() => {
    if (!panelOpen || !editing || productionStations.length === 0) return;
    setDraftForm((prev) => {
      if (prev.productionStationId.trim()) return prev;
      const suggested = resolveFamiliaProductionStationId(editing, productionStations);
      if (!suggested) return prev;
      return { ...prev, productionStationId: suggested };
    });
  }, [panelOpen, editing, productionStations]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      ),
    [items],
  );

  function openNew() {
    setEditing(null);
    setDraftName("");
    setDraftActive(true);
    setDraftOrder(sorted.length);
    resetDraftForm(null);
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(f: CartaFamilia) {
    setEditing(f);
    setDraftName(f.name);
    setDraftActive(f.isActive);
    setDraftOrder(f.sortOrder);
    resetDraftForm(f);
    setPanelOpen(true);
    setError(null);
  }

  async function savePanel() {
    const name = draftName.trim();
    if (!name) {
      setError("Indica un nombre para la familia de menú.");
      return;
    }
    if (!restauranteId) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const selectedStation = draftForm.productionStationId.trim()
      ? productionStations.find((s) => s.id === draftForm.productionStationId.trim()) ?? null
      : null;
    const stationRef = buildCartaFamiliaProductionStationRef(selectedStation);

    const operativa = buildCartaFamiliaOperativaPayload(
      {
        familyType: draftForm.familyType,
        trabajaPorPases: draftForm.trabajaPorPases,
        defaultPass: draftForm.trabajaPorPases ? draftForm.defaultPass : "sin_pase",
        description: draftForm.description,
        suggestedDestination: stationRef.suggestedDestination,
      },
      editing,
    );

    const savePayload = {
      name,
      sortOrder: draftOrder,
      isActive: draftActive,
      ...operativa,
      productionStationId: stationRef.productionStationId ?? null,
      productionStationName: stationRef.productionStationName ?? null,
      productionStationType: stationRef.productionStationType ?? null,
    };

    try {
      if (editing) {
        const res = await patchCartaFamiliaApi(restauranteId, editing.id, savePayload);
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createCartaFamiliaApi(restauranteId, savePayload);
        if (!res.ok) throw new Error(res.error);
      }
      await refresh();
      setPanelOpen(false);
      setNotice("Familia de menú guardada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const reorderFamilias = useCallback(
    async (orderedIds: string[]) => {
      if (!restauranteId) return;
      const currentIds = sorted.map((f) => f.id);
      if (orderedIds.join("|") === currentIds.join("|")) return;

      const byId = new Map(sorted.map((f) => [f.id, f] as const));
      const optimisticItems: CartaFamilia[] = orderedIds
        .map((id, idx) => {
          const f = byId.get(id);
          return f ? { ...f, sortOrder: idx } : null;
        })
        .filter((f): f is CartaFamilia => f != null);
      for (const f of sorted) {
        if (!orderedIds.includes(f.id)) optimisticItems.push(f);
      }
      const previousItems = items;
      setItems(optimisticItems);
      setReorderBusyId(orderedIds[0] ?? null);
      setError(null);
      try {
        const res = await reorderCartaFamiliasApi(restauranteId, orderedIds);
        if (!res.ok) throw new Error(res.error);
        await refresh();
      } catch (e) {
        setItems(previousItems);
        setError(e instanceof Error ? e.message : "No se pudo cambiar el orden.");
      } finally {
        setReorderBusyId(null);
      }
    },
    [restauranteId, sorted, items, refresh],
  );

  async function toggleActive(f: CartaFamilia) {
    if (!restauranteId) return;
    const res = await patchCartaFamiliaApi(restauranteId, f.id, {
      isActive: !f.isActive,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const nextActive = !f.isActive;
    if (editing?.id === f.id) {
      setEditing({ ...f, isActive: nextActive });
      setDraftActive(nextActive);
    }
    await refresh();
  }

  const stats = useMemo(() => {
    if (!restauranteId) {
      return { activeFamilies: 0, linkedCategories: 0, organizedProducts: 0 };
    }
    const activeFamilies = items.filter((f) => f.isActive).length;
    const linkedCategories = categorias.filter((c) => Boolean(c.cartaFamiliaId?.trim())).length;
    const organizedProducts =
      operationalCatalog.source === "central"
        ? countOrganizedProductsFromCentral([
            ...operationalCatalog.productDocumentsById.values(),
          ])
        : countOrganizedProductsFromPlatos(loadPlatos(restauranteId));
    return { activeFamilies, linkedCategories, organizedProducts };
  }, [
    restauranteId,
    items,
    categorias,
    operationalCatalog.source,
    operationalCatalog.productDocumentsById,
  ]);

  return (
    <ConfigCartaWorkbench title="Familias de menú">
      <CartaCatalogConceptCollapsible
        focus="menu-family"
        description="Agrupa categorías que comparten comportamiento operativo."
      >
        <p className="hostly-carta-config-section-body">
          Ejemplos: <strong>Pizzas</strong>, <strong>Entrantes</strong>, <strong>Refrescos</strong>,{" "}
          <strong>Cócteles</strong>. Las familias de menú permiten definir estación de producción,
          pase y comportamiento común para las categorías que agrupan.
        </p>
        <p className="hostly-carta-config-form-hint hostly-carta-familia-concept__hint">
          No son las pestañas del TPV: eso son las <strong>categorías de carta</strong>. Aquí configuras
          el bloque operativo al que pertenecen.
        </p>
      </CartaCatalogConceptCollapsible>

      <div className="hostly-carta-config-actions-row">
        <ConfigBtnPrimary type="button" disabled={!restauranteId} onClick={openNew}>
          Nueva familia de menú
        </ConfigBtnPrimary>
        <ConfigBtnSecondary disabled={loading || !restauranteId} onClick={() => void refresh()}>
          Recargar
        </ConfigBtnSecondary>
        <Link href="/dashboard/configuracion/carta/categorias" className="hostly-carta-config-text-link">
          Ir a Categorías de carta →
        </Link>
      </div>

      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Selecciona un restaurante para listar familias de menú.
        </div>
      ) : null}

      {error ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="hostly-carta-config-alert hostly-carta-config-alert--success" role="status">
          {notice}
        </p>
      ) : null}

      {restauranteId ? (
        <LegacyCatalogPendingNotice
          restaurantId={restauranteId}
          catalogSource={operationalCatalog.source}
        />
      ) : null}

      {restauranteId && !loading && !error ? (
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Familias de menú activas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.activeFamilies}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Categorías de carta vinculadas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.linkedCategories}</span>
          </div>
        </div>
      ) : null}

      <ConfigCard flush>
        <FamiliasCartaDataView
          items={sorted}
          categorias={categorias}
          loading={loading}
          onEdit={openEdit}
          onToggleActive={(f) => void toggleActive(f)}
          onCreateNew={openNew}
          onReorderFamilias={(orderedIds) => void reorderFamilias(orderedIds)}
          reorderBusyId={reorderBusyId}
        />
      </ConfigCard>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop" role="dialog" aria-modal="true">
          <ConfigCard className="hostly-carta-config-drawer hostly-carta-familia-drawer">
            <h2 className="hostly-carta-config-drawer__title">
              {editing ? "Editar familia de menú" : "Nueva familia de menú"}
            </h2>
            <div className="hostly-carta-config-form hostly-carta-config-drawer__body">
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Nombre</span>
                <input
                  className={inputClass}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Pizzas, Cervezas, Postres…"
                  disabled={saving}
                />
              </label>

              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Tipo</span>
                <select
                  className={inputClass}
                  value={draftForm.familyType}
                  disabled={saving}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!isCartaCategoriaTipo(v)) return;
                    setDraftForm((prev) => ({ ...prev, familyType: v }));
                  }}
                >
                  {(["food", "drink", "general"] as const).map((type) => (
                    <option key={type} value={type}>
                      {getCartaFamiliaTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Estación de producción</span>
                {activeProductionStations.length === 0 ? (
                  <p className="hostly-carta-config-form-hint hostly-carta-familia-station-empty">
                    Crea primero una estación en{" "}
                    <Link href="/dashboard/configuracion/estaciones" className="hostly-carta-config-text-link">
                      Producción → Estaciones
                    </Link>
                    .
                  </p>
                ) : null}
                <div
                  className="hostly-carta-familia-station-picker"
                  role="radiogroup"
                  aria-label="Estación de producción"
                >
                  <button
                    type="button"
                    className={`hostly-carta-familia-station-picker__option${
                      !draftForm.productionStationId ? " is-selected" : ""
                    }`}
                    disabled={saving}
                    aria-checked={!draftForm.productionStationId}
                    role="radio"
                    onClick={() =>
                      setDraftForm((prev) => ({ ...prev, productionStationId: "" }))
                    }
                  >
                    <span className="hostly-carta-familia-station-picker__label">Sin estación asignada</span>
                  </button>
                  {selectableProductionStations.map((station) => {
                    const selected = draftForm.productionStationId === station.id;
                    return (
                      <button
                        key={station.id}
                        type="button"
                        className={`hostly-carta-familia-station-picker__option${
                          selected ? " is-selected" : ""
                        }${!station.active ? " is-inactive" : ""}`}
                        disabled={saving}
                        aria-checked={selected}
                        role="radio"
                        onClick={() =>
                          setDraftForm((prev) => ({
                            ...prev,
                            productionStationId: station.id,
                          }))
                        }
                      >
                        <span
                          className="hostly-carta-familia-station-picker__swatch"
                          style={{ backgroundColor: station.color }}
                          aria-hidden
                        />
                        <span className="hostly-carta-familia-station-picker__text">
                          <span className="hostly-carta-familia-station-picker__name">
                            {station.name}
                          </span>
                          <span className="hostly-carta-familia-station-picker__meta">
                            {PRODUCTION_STATION_TYPE_LABELS[station.type]}
                            {!station.active ? " · Inactiva" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="hostly-carta-config-form-hint">
                  La estación define dónde se preparará esta familia. Aún no afecta TPV ni cocina.
                </p>
              </div>

              <label className="hostly-carta-config-form-checkbox">
                <input
                  type="checkbox"
                  checked={draftForm.trabajaPorPases}
                  disabled={saving}
                  onChange={(e) =>
                    setDraftForm((prev) => ({
                      ...prev,
                      trabajaPorPases: e.target.checked,
                    }))
                  }
                />
                <span className="hostly-carta-config-form-label">Trabaja por pases</span>
              </label>

              {draftForm.trabajaPorPases ? (
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Pase por defecto</span>
                  <select
                    className={inputClass}
                    value={draftForm.defaultPass}
                    disabled={saving}
                    onChange={(e) =>
                      setDraftForm((prev) => ({
                        ...prev,
                        defaultPass: normalizeCartaFamiliaPase(e.target.value),
                      }))
                    }
                  >
                    {CARTA_FAMILIA_PASE_UI_VALUES.map((pase) => (
                      <option key={pase} value={pase}>
                        {getCartaFamiliaPaseLabel(pase)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Descripción (opcional)</span>
                <textarea
                  className={`${inputClass} hostly-carta-familia-description-input`}
                  value={draftForm.description ?? ""}
                  onChange={(e) =>
                    setDraftForm((prev) => ({
                      ...prev,
                      description: e.target.value || undefined,
                    }))
                  }
                  placeholder="Ej. Platos principales que salen de cocina caliente"
                  rows={2}
                  disabled={saving}
                />
              </label>

              <details className="hostly-carta-familia-advanced">
                <summary className="hostly-carta-config-form-label">Opciones avanzadas</summary>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Orden en la lista</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={draftOrder}
                    onChange={(e) =>
                      setDraftOrder(
                        Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
                      )
                    }
                    disabled={saving}
                  />
                </label>
                <label className="hostly-carta-config-form-checkbox">
                  <input
                    type="checkbox"
                    checked={draftActive}
                    onChange={(e) => setDraftActive(e.target.checked)}
                    disabled={saving}
                  />
                  <span className="hostly-carta-config-form-label">Familia de menú activa</span>
                </label>
              </details>
            </div>
            <div className="hostly-carta-config-drawer__footer">
              <ConfigBtnPrimary type="button" disabled={saving} onClick={() => void savePanel()}>
                {saving ? "Guardando…" : "Guardar familia de menú"}
              </ConfigBtnPrimary>
              {editing ? (
                <ConfigBtnSecondary
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleActive(editing)}
                >
                  {editing.isActive ? "Desactivar" : "Activar"}
                </ConfigBtnSecondary>
              ) : null}
              <ConfigBtnSecondary type="button" disabled={saving} onClick={() => setPanelOpen(false)}>
                Cancelar
              </ConfigBtnSecondary>
            </div>
          </ConfigCard>
        </div>
      ) : null}
    </ConfigCartaWorkbench>
  );
}
