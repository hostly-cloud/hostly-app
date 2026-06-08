"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth/auth-context";
import { CategoryProductFamilySelect } from "@/components/carta/category-product-family-select";
import { ProductFormDrawerCollapsibleSection } from "@/components/productos/product-form-drawer-section";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
  ConfigCartaWorkbench,
} from "../../_components/config-carta-workbench";
import {
  buildCategoryProductFamilyFields,
  productFamilySelectValueFromCategory,
  resolveProductFamilyFromSelectValue,
} from "@/lib/carta/category-product-family";
import {
  createCartaCategoriaApi,
  fetchCartaCategorias,
  fetchCartaFamilias,
  patchCartaCategoriaApi,
} from "@/lib/carta-categorias/api-client";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import type { CartaCategoria, CartaCategoriaTipo, CartaFamilia } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import {
  ensureDefaultProductFamilies,
  listenProductFamilies,
} from "@/lib/firestore/product-families";
import {
  ensureDefaultDrinkModifierGroups,
  listenModifierGroups,
} from "@/lib/firestore/modifier-groups";
import {
  resolveEffectiveModifierGroupLabels,
  sanitizeModifierGroupIdsForSave,
} from "@/lib/modifiers/effective-product-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import { countProductsByCategoryIdFromCentral, countProductsByCategoryIdFromPlatos } from "@/lib/carta/catalog-category-counts";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { LegacyCatalogPendingNotice } from "@/components/carta/legacy-catalog-pending-notice";
import { loadPlatos } from "@/lib/platos-local";
import { CategoriasCartaDataView } from "@/components/carta/categorias-carta-data-view";

const inputClass = "hostly-input hostly-carta-config-field-input";

export default function ConfigCartaCategoriasPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restauranteId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
  });
  const isCentralCatalog = operationalCatalog.source === "central";

  const [items, setItems] = useState<CartaCategoria[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  const [productFamilies, setProductFamilies] = useState<ProductFamilyDocument[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<CartaCategoria | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<CartaCategoriaTipo>("general");
  const [draftFamilyId, setDraftFamilyId] = useState("");
  const [draftCartaMenuFamiliaId, setDraftCartaMenuFamiliaId] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [draftOrder, setDraftOrder] = useState(0);
  const [draftModifierGroupIds, setDraftModifierGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setCartaFamilias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, familias] = await Promise.all([
        fetchCartaCategorias(restauranteId),
        fetchCartaFamilias(restauranteId),
      ]);
      setItems(list);
      setCartaFamilias(familias);
    } catch {
      setError("No se pudieron cargar las categorías. Revisa la conexión.");
      setItems([]);
      setCartaFamilias([]);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  useEffect(() => {
    if (!authReady || !restauranteId) {
      setProductFamilies([]);
      return;
    }
    let defaultsEnsured = false;
    const unsub = listenProductFamilies(
      restauranteId,
      (list) => {
        setProductFamilies(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultProductFamilies(restauranteId).catch(console.error);
        }
      },
      console.error,
    );
    return () => unsub();
  }, [authReady, restauranteId]);

  useEffect(() => {
    if (!authReady || !restauranteId) {
      setModifierGroups([]);
      return;
    }
    let defaultsEnsured = false;
    const unsub = listenModifierGroups(
      restauranteId,
      (list) => {
        setModifierGroups(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultDrinkModifierGroups(restauranteId).catch(console.error);
        }
      },
      console.error,
    );
    return () => unsub();
  }, [authReady, restauranteId]);

  const activeModifierGroups = useMemo(
    () =>
      modifierGroups
        .filter((g) => g.active)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
        ),
    [modifierGroups],
  );

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      ),
    [items],
  );

  const sortedMenuFamilias = useMemo(
    () =>
      [...cartaFamilias].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      ),
    [cartaFamilias],
  );

  const menuFamiliaSelectOptions = useMemo(() => {
    const options = [...sortedMenuFamilias];
    const selectedId = draftCartaMenuFamiliaId.trim();
    if (selectedId && !options.some((f) => f.id === selectedId)) {
      options.push({
        id: selectedId,
        restauranteId: restauranteId ?? "",
        name: "Familia asignada (no disponible)",
        sortOrder: 999_999,
        isActive: false,
        createdAt: "",
        updatedAt: "",
      });
    }
    return options;
  }, [sortedMenuFamilias, draftCartaMenuFamiliaId, restauranteId]);

  const countsByCatId = useMemo(() => {
    if (!restauranteId) return new Map<string, number>();
    if (operationalCatalog.source === "central") {
      return countProductsByCategoryIdFromCentral([
        ...operationalCatalog.productDocumentsById.values(),
      ]);
    }
    return countProductsByCategoryIdFromPlatos(loadPlatos(restauranteId));
  }, [
    restauranteId,
    operationalCatalog.source,
    operationalCatalog.productDocumentsById,
  ]);

  function openNew() {
    setEditing(null);
    setDraftName("");
    setDraftType("general");
    setDraftFamilyId("");
    setDraftCartaMenuFamiliaId("");
    setDraftActive(true);
    setDraftOrder(sorted.length);
    setDraftModifierGroupIds([]);
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(c: CartaCategoria) {
    setEditing(c);
    setDraftName(c.name);
    setDraftType(c.type);
    setDraftFamilyId(productFamilySelectValueFromCategory(c));
    setDraftCartaMenuFamiliaId(c.cartaFamiliaId?.trim() ?? "");
    setDraftActive(c.isActive);
    setDraftOrder(c.sortOrder);
    setDraftModifierGroupIds(c.modifierGroupIds ?? []);
    setPanelOpen(true);
    setError(null);
  }

  function buildFamilyPayload() {
    const family = resolveProductFamilyFromSelectValue(
      draftFamilyId,
      productFamilies,
    );
    const fields = buildCategoryProductFamilyFields(family);
    if (!family) {
      return {
        productFamilyId: null as string | null,
        productFamilyName: null as string | null,
        productFamilyType: null,
      };
    }
    return {
      productFamilyId: fields.productFamilyId ?? null,
      productFamilyName: fields.productFamilyName ?? null,
      productFamilyType: fields.productFamilyType ?? null,
    };
  }

  function buildMenuFamilyPayload(): { cartaFamiliaId: string | null } {
    const id = draftCartaMenuFamiliaId.trim();
    return { cartaFamiliaId: id || null };
  }

  async function savePanel() {
    const name = draftName.trim();
    if (!name) {
      setError("Indica un nombre para la categoría.");
      return;
    }
    if (!restauranteId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const familyPayload = buildFamilyPayload();
    const menuFamilyPayload = buildMenuFamilyPayload();
    const modifierGroupIds = sanitizeModifierGroupIdsForSave(
      draftModifierGroupIds,
      modifierGroups,
    );
    try {
      if (editing) {
        const res = await patchCartaCategoriaApi(restauranteId, editing.id, {
          name,
          type: draftType,
          isActive: draftActive,
          sortOrder: draftOrder,
          modifierGroupIds,
          ...familyPayload,
          ...menuFamilyPayload,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createCartaCategoriaApi(restauranteId, {
          name,
          type: draftType,
          isActive: draftActive,
          sortOrder: draftOrder,
          modifierGroupIds,
          ...familyPayload,
          ...menuFamilyPayload,
        });
        if (!res.ok) throw new Error(res.error);
      }
      await refresh();
      setPanelOpen(false);
      setNotice("Categoría guardada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const canOrderProductsInCategory = useCallback(
    (c: CartaCategoria) => isCentralCatalog && (countsByCatId.get(c.id) ?? 0) > 0,
    [isCentralCatalog, countsByCatId],
  );

  const openOrderProducts = useCallback(
    (c: CartaCategoria) => {
      router.push(
        `/dashboard/configuracion/carta/categorias/${encodeURIComponent(c.id)}/ordenar`,
      );
    },
    [router],
  );

  async function toggleActive(c: CartaCategoria) {
    if (!restauranteId) return;
    const res = await patchCartaCategoriaApi(restauranteId, c.id, {
      isActive: !c.isActive,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
  }

  return (
    <ConfigCartaWorkbench
      title="Categorías de carta"
      description="Crea las secciones de tu carta (Pizzas, Vinos, Cafés…) y, si quieres, asígnalas a una familia de producto para filtros e informes."
    >
      <div className="hostly-carta-config-actions-row">
        <ConfigBtnPrimary type="button" disabled={!restauranteId} onClick={openNew}>
          Nueva categoría
        </ConfigBtnPrimary>
        <ConfigBtnSecondary disabled={loading || !restauranteId} onClick={() => void refresh()}>
          Recargar
        </ConfigBtnSecondary>
        <Link href="/dashboard/configuracion/familias-producto" className="hostly-carta-config-text-link">
          Gestionar familias de producto →
        </Link>
        <Link href="/dashboard/configuracion/carta/productos" className="hostly-carta-config-text-link">
          Ir a Productos →
        </Link>
      </div>

      {!restauranteId ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
          Selecciona un restaurante en la barra superior para ver categorías.
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

      <ConfigCard flush>
        <CategoriasCartaDataView
          items={sorted}
          loading={loading}
          countsByCatId={countsByCatId}
          productFamilies={productFamilies}
          modifierGroups={modifierGroups}
          onEdit={openEdit}
          onToggleActive={(c) => void toggleActive(c)}
          onOrderProducts={openOrderProducts}
          canOrderProducts={canOrderProductsInCategory}
          orderProductsTitle={t("cartaCategories.orderProductsAction")}
          orderProductsDisabledTitle={t("cartaCategories.orderProductsDisabledHint")}
          onCreateNew={openNew}
        />
      </ConfigCard>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop" role="dialog" aria-modal="true">
          <ConfigCard className="hostly-carta-config-drawer">
            <h2 className="hostly-carta-config-drawer__title">
              {editing ? "Editar categoría" : "Nueva categoría"}
            </h2>
            <div className="hostly-carta-config-form hostly-carta-config-drawer__body">
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Nombre</span>
                <input
                  className={inputClass}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Ginebras"
                />
              </label>
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Bloque de carta</span>
                <select
                  className={inputClass}
                  value={draftCartaMenuFamiliaId}
                  onChange={(e) => setDraftCartaMenuFamiliaId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Sin bloque de carta</option>
                  {menuFamiliaSelectOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.isActive === false ? " (inactiva)" : ""}
                    </option>
                  ))}
                </select>
                <p className="hostly-carta-config-form-hint">
                  Agrupa categorías visibles dentro de bloques como Platos o Bebidas.
                </p>
              </label>
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Tipo</span>
                <select
                  className={inputClass}
                  value={draftType}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isCartaCategoriaTipo(v)) setDraftType(v);
                  }}
                >
                  <option value="food">Comida</option>
                  <option value="drink">Bebida</option>
                  <option value="general">Mixto</option>
                </select>
              </label>
              <ProductFormDrawerCollapsibleSection
                key={editing?.id ?? "new"}
                title="Configuración avanzada"
                hint="Familia de producto, modificadores, orden y estado."
              >
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Familia de producto</span>
                  <div>
                    <CategoryProductFamilySelect
                      restaurantId={restauranteId}
                      value={draftFamilyId}
                      onChange={setDraftFamilyId}
                      disabled={saving}
                    />
                  </div>
                  <p className="hostly-carta-config-form-hint">
                    Opcional. Agrupa a nivel interno (informes, filtros). Distinto del bloque de carta, que ordena Platos y Bebidas en carta.
                  </p>
                </label>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Modificadores</span>
                {activeModifierGroups.length === 0 ? (
                  <p className="hostly-carta-config-form-hint">
                    No hay grupos activos. Créalos en{" "}
                    <Link href="/dashboard/configuracion/modificadores" className="hostly-carta-config-text-link">
                      Configuración → Modificadores
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="hostly-productos-carta-filter-chips">
                    {activeModifierGroups.map((group) => {
                      const selected = draftModifierGroupIds.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--category${selected ? " is-active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
                            onChange={() => {
                              setDraftModifierGroupIds((prev) =>
                                prev.includes(group.id)
                                  ? prev.filter((id) => id !== group.id)
                                  : [...prev, group.id],
                              );
                            }}
                          />
                          {group.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {draftModifierGroupIds.length > 0 ? (
                  <div className="hostly-productos-carta-filter-chips hostly-carta-config-form-chips">
                    {resolveEffectiveModifierGroupLabels(
                      null,
                      { modifierGroupIds: draftModifierGroupIds },
                      modifierGroups,
                    ).map((label) => (
                      <span key={label} className="hostly-carta-config-status-chip hostly-carta-config-status-chip--inactive">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="hostly-carta-config-form-hint">
                  Formatos y mixers para productos de esta sección (p. ej. chupito, copa + tónica). Los productos los heredan al asignar la categoría.
                </p>
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
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftActive}
                  onChange={(e) => setDraftActive(e.target.checked)}
                />
                <span className="hostly-carta-config-form-label">Categoría activa</span>
              </label>
              </ProductFormDrawerCollapsibleSection>
            </div>
            <div className="hostly-carta-config-drawer__footer">
              <ConfigBtnPrimary
                type="button"
                disabled={saving}
                onClick={() => void savePanel()}
              >
                {saving ? "Guardando…" : "Guardar categoría"}
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
              <ConfigBtnSecondary
                type="button"
                disabled={saving}
                onClick={() => setPanelOpen(false)}
              >
                Cancelar
              </ConfigBtnSecondary>
            </div>
          </ConfigCard>
        </div>
      ) : null}

      <p className="hostly-carta-config-section-body">
        Las categorías viven en{" "}
        <span className="font-mono text-[10px] text-slate-500">
          restaurantes/&#123;id&#125;/cartaCategorias
        </span>
        . El recuento de productos usa{" "}
        <span className="font-mono text-[10px] text-slate-500">categoriaCartaId</span> en
        artículos locales o central.
      </p>
    </ConfigCartaWorkbench>
  );
}
