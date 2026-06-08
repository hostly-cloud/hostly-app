"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
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
} from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import {
  countOrganizedProductsFromCentral,
  countOrganizedProductsFromPlatos,
} from "@/lib/carta/catalog-category-counts";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { loadPlatos } from "@/lib/platos-local";
import { FamiliasCartaDataView } from "@/components/carta/familias-carta-data-view";

const inputClass = "hostly-input hostly-carta-config-field-input";

export default function ConfigCartaFamiliasPage() {
  const { restaurantId: profileRestaurantId } = useAuth();
  const restauranteId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
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
  const [saving, setSaving] = useState(false);

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
      setError("No se pudieron cargar las familias.");
      setItems([]);
      setCategorias([]);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(f: CartaFamilia) {
    setEditing(f);
    setDraftName(f.name);
    setDraftActive(f.isActive);
    setDraftOrder(f.sortOrder);
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
    try {
      if (editing) {
        const res = await patchCartaFamiliaApi(restauranteId, editing.id, {
          name,
          sortOrder: draftOrder,
          isActive: draftActive,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createCartaFamiliaApi(restauranteId, {
          name,
          sortOrder: draftOrder,
          isActive: draftActive,
        });
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
    <ConfigCartaWorkbench
      title="Familias de menú"
      description="Las familias de menú agrupan secciones de carta en bloques grandes (por ejemplo Platos y Bebidas). Ordenan lo que ve el camarero al tomar nota."
    >
      <div className="hostly-carta-config-actions-row">
        <ConfigBtnPrimary type="button" disabled={!restauranteId} onClick={openNew}>
          Nueva familia
        </ConfigBtnPrimary>
        <ConfigBtnSecondary disabled={loading || !restauranteId} onClick={() => void refresh()}>
          Recargar
        </ConfigBtnSecondary>
        <Link href="/dashboard/configuracion/carta/categorias" className="hostly-carta-config-text-link">
          Ir a Categorías →
        </Link>
        <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
          Ir a Productos →
        </Link>
      </div>

      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Selecciona un restaurante para listar familias.
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
            <span className="hostly-carta-config-kpi-pill__label">Familias activas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.activeFamilies}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Categorías vinculadas</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.linkedCategories}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Productos organizados</span>
            <span className="hostly-carta-config-kpi-pill__value">{stats.organizedProducts}</span>
          </div>
        </div>
      ) : null}

      <div className="hostly-carta-config-layout-panels">
        <ConfigCard flush>
          <FamiliasCartaDataView
            items={sorted}
            categorias={categorias}
            loading={loading}
            onEdit={openEdit}
            onToggleActive={(f) => void toggleActive(f)}
            onCreateNew={openNew}
          />
        </ConfigCard>

        <ConfigCard compact className="hostly-carta-config-card--muted">
          <p className="hostly-carta-config-section-title">Relación</p>
          <p className="hostly-carta-config-section-body">
            Cada categoría puede pertenecer a una familia de menú para ordenar la carta. Configúralo al editar la categoría.
          </p>
        </ConfigCard>
      </div>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop" role="dialog" aria-modal="true">
          <ConfigCard className="hostly-carta-config-drawer">
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
                  placeholder="Bebidas"
                  disabled={saving}
                />
              </label>
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Orden</span>
                <input
                  type="number"
                  className={inputClass}
                  value={draftOrder}
                  onChange={(e) =>
                    setDraftOrder(Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)
                  }
                  disabled={saving}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftActive}
                  onChange={(e) => setDraftActive(e.target.checked)}
                  disabled={saving}
                />
                <span className="hostly-carta-config-form-label">Familia activa</span>
              </label>
            </div>
            <div className="hostly-carta-config-drawer__footer">
              <ConfigBtnPrimary type="button" disabled={saving} onClick={() => void savePanel()}>
                {saving ? "Guardando…" : "Guardar familia"}
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
