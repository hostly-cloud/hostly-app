"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth/auth-context";
import { CategoryProductFamilySelect } from "@/components/carta/category-product-family-select";
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
import { CartaDeleteChoiceModal } from "@/components/carta/carta-delete-choice-modal";
import {
  createCartaCategoriaApi,
  deleteCartaCategoriaApi,
  fetchCartaCategorias,
  fetchCartaFamilias,
  patchCartaCategoriaApi,
  reorderCartaCategoriasApi,
} from "@/lib/carta-categorias/api-client";
import { detachPlatosFromCategory } from "@/lib/carta-categorias/platos-category-sync";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import {
  categoryOperationalBehaviorsForType,
  coerceCategoryOperationalBehaviorForType,
  DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR,
  getCategoryOperationalBehaviorLabel,
  normalizeCategoryOperationalBehavior,
  type CategoryOperationalBehavior,
} from "@/lib/carta-categorias/category-operational-behavior";
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
import { sanitizeModifierGroupIdsForSave } from "@/lib/modifiers/effective-product-modifiers";
import {
  DEFAULT_DRINK_FORMAT_GROUP_ID,
  DEFAULT_DRINK_MIXER_GROUP_ID,
  type ModifierGroupDocument,
} from "@/lib/modifiers/modifier-types";
import { shouldSuggestDrinkFormatMixerCategory } from "@/lib/modifiers/suggest-drink-format-mixer-category";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import { countProductsByCategoryIdFromCentral, countProductsByCategoryIdFromPlatos } from "@/lib/carta/catalog-category-counts";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { LegacyCatalogPendingNotice } from "@/components/carta/legacy-catalog-pending-notice";
import { loadPlatos, PLATOS_CHANGED_EVENT } from "@/lib/platos-local";
import { CartaCatalogConceptCollapsible } from "@/components/carta/carta-catalog-concept-collapsible";
import { CategoriasCartaDataView } from "@/components/carta/categorias-carta-data-view";

const inputClass = "hostly-input hostly-carta-config-field-input";

function operationalBehaviorHelpKey(
  behavior: CategoryOperationalBehavior,
  categoryType: CartaCategoriaTipo,
): string {
  if (behavior === "composed_recipe" && categoryType === "food") {
    return "cartaCategories.operationalBehaviorHelpComposedRecipeFood";
  }
  const keys: Record<CategoryOperationalBehavior, string> = {
    simple: "cartaCategories.operationalBehaviorHelpSimple",
    combo_base: "cartaCategories.operationalBehaviorHelpComboBase",
    mixer: "cartaCategories.operationalBehaviorHelpMixer",
    composed_recipe: "cartaCategories.operationalBehaviorHelpComposedRecipe",
  };
  return keys[behavior];
}

export default function ConfigCartaCategoriasPage() {
  const { t, locale } = useI18n();
  const behaviorLocale = locale === "en" ? "en" : "es";
  const router = useRouter();
  const { restaurantId: profileRestaurantId, profileReady } = useAuth();
  const restauranteId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId),
    [profileReady, profileRestaurantId],
  );
  const operationalCatalog = useCentralProductsForCarta(restauranteId, {
    scope: "management",
    requireAuthenticatedTenant: true,
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
  const [draftModifierGroupIds, setDraftModifierGroupIds] = useState<string[]>([]);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [deleteChoiceCategory, setDeleteChoiceCategory] = useState<CartaCategoria | null>(null);
  const [deleteChoiceBusy, setDeleteChoiceBusy] = useState(false);
  const [draftOperationalBehavior, setDraftOperationalBehavior] =
    useState<CategoryOperationalBehavior>(DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR);
  const [saving, setSaving] = useState(false);

  const behaviorOptionsForDraftType = useMemo(() => {
    const base = [...categoryOperationalBehaviorsForType(draftType)];
    if (!base.includes(draftOperationalBehavior)) {
      base.push(draftOperationalBehavior);
    }
    return base;
  }, [draftType, draftOperationalBehavior]);

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
    if (!profileReady || !restauranteId) {
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
  }, [profileReady, restauranteId]);

  useEffect(() => {
    if (!profileReady || !restauranteId) {
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
  }, [profileReady, restauranteId]);

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

  const showDrinkFormatMixerSuggestion = useMemo(
    () =>
      shouldSuggestDrinkFormatMixerCategory({
        name: draftName,
        type: draftType,
        modifierGroupIds: draftModifierGroupIds,
      }),
    [draftName, draftType, draftModifierGroupIds],
  );

  const drinkFormatMixerDefaultGroupsAvailable = useMemo(() => {
    const activeIds = new Set(activeModifierGroups.map((group) => group.id));
    return (
      activeIds.has(DEFAULT_DRINK_FORMAT_GROUP_ID) &&
      activeIds.has(DEFAULT_DRINK_MIXER_GROUP_ID)
    );
  }, [activeModifierGroups]);

  const applyDrinkFormatMixerSuggestion = useCallback(() => {
    setDraftModifierGroupIds((prev) => {
      const next = new Set(prev);
      next.add(DEFAULT_DRINK_FORMAT_GROUP_ID);
      next.add(DEFAULT_DRINK_MIXER_GROUP_ID);
      return [...next];
    });
  }, []);

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
        name: "Familia de menú asignada (no disponible)",
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
    setDraftModifierGroupIds([]);
    setDraftOperationalBehavior(DEFAULT_CATEGORY_OPERATIONAL_BEHAVIOR);
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
    setDraftModifierGroupIds(c.modifierGroupIds ?? []);
    setDraftOperationalBehavior(normalizeCategoryOperationalBehavior(c.categoryOperationalBehavior));
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

  function resolveSortOrderForSave(): number {
    if (editing) return editing.sortOrder;
    const max = sorted.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    return max + 1;
  }

  async function savePanel() {
    const name = draftName.trim();
    if (!name) {
      setError("Indica un nombre para la categoría de carta.");
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
          sortOrder: resolveSortOrderForSave(),
          modifierGroupIds,
          categoryOperationalBehavior: draftOperationalBehavior,
          ...familyPayload,
          ...menuFamilyPayload,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createCartaCategoriaApi(restauranteId, {
          name,
          type: draftType,
          isActive: draftActive,
          sortOrder: resolveSortOrderForSave(),
          modifierGroupIds,
          categoryOperationalBehavior: draftOperationalBehavior,
          ...familyPayload,
          ...menuFamilyPayload,
        });
        if (!res.ok) throw new Error(res.error);
      }
      await refresh();
      setPanelOpen(false);
      setNotice("Categoría de carta guardada.");
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

  const reorderCategories = useCallback(
    async (orderedIds: string[]) => {
      if (!restauranteId) return;
      const currentIds = sorted.map((c) => c.id);
      if (orderedIds.join("|") === currentIds.join("|")) return;

      const byId = new Map(sorted.map((c) => [c.id, c] as const));
      const optimisticItems: CartaCategoria[] = orderedIds
        .map((id, idx) => {
          const c = byId.get(id);
          return c ? { ...c, sortOrder: idx } : null;
        })
        .filter((c): c is CartaCategoria => c != null);
      for (const c of sorted) {
        if (!orderedIds.includes(c.id)) optimisticItems.push(c);
      }
      const previousItems = items;
      setItems(optimisticItems);
      setReorderBusyId(orderedIds[0] ?? null);
      setError(null);
      try {
        const res = await reorderCartaCategoriasApi(restauranteId, orderedIds);
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

  const moveCategory = useCallback(
    async (categoryId: string, direction: "up" | "down") => {
      const idx = sorted.findIndex((c) => c.id === categoryId);
      if (idx < 0) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      const orderedIds = sorted.map((c) => c.id);
      [orderedIds[idx], orderedIds[targetIdx]] = [orderedIds[targetIdx]!, orderedIds[idx]!];
      await reorderCategories(orderedIds);
    },
    [sorted, reorderCategories],
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

  const closeCategoryDeleteChoice = useCallback(() => {
    if (!deleteChoiceBusy) setDeleteChoiceCategory(null);
  }, [deleteChoiceBusy]);

  const deactivateCategoryChoice = useCallback(async () => {
    if (!restauranteId || !deleteChoiceCategory || deleteChoiceCategory.isActive === false) {
      setDeleteChoiceCategory(null);
      return;
    }
    setDeleteChoiceBusy(true);
    setError(null);
    try {
      const res = await patchCartaCategoriaApi(restauranteId, deleteChoiceCategory.id, {
        isActive: false,
      });
      if (!res.ok) throw new Error(res.error);
      await refresh();
      setDeleteChoiceCategory(null);
      setNotice("Categoría de carta desactivada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo desactivar la categoría de carta.");
    } finally {
      setDeleteChoiceBusy(false);
    }
  }, [restauranteId, deleteChoiceCategory, refresh]);

  const deleteCategoryPermanently = useCallback(async () => {
    if (!restauranteId || !deleteChoiceCategory) return;
    const category = deleteChoiceCategory;
    setDeleteChoiceBusy(true);
    setError(null);
    try {
      detachPlatosFromCategory(restauranteId, category.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
      }
      const res = await deleteCartaCategoriaApi(restauranteId, category.id);
      if (!res.ok) throw new Error(res.error);
      if (panelOpen && editing?.id === category.id) {
        setPanelOpen(false);
        setEditing(null);
      }
      await refresh();
      setDeleteChoiceCategory(null);
      setNotice("Categoría de carta eliminada. Los productos asociados quedaron sin categoría de carta.");
      window.setTimeout(() => setNotice(null), 3200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la categoría de carta.");
    } finally {
      setDeleteChoiceBusy(false);
    }
  }, [restauranteId, deleteChoiceCategory, panelOpen, editing, refresh]);

  return (
    <ConfigCartaWorkbench title="Categorías de carta">
      <CartaCatalogConceptCollapsible
        focus="category"
        description="Son las secciones visibles que verá el personal en el TPV."
      >
        <p className="hostly-carta-config-section-body">
          Ejemplos: <strong>Pizze Classico</strong>, <strong>Pizze Speciali</strong>,{" "}
          <strong>Cervezas nacionales</strong>, <strong>Cervezas importación</strong>. Los productos
          se organizan dentro de categorías de carta.
        </p>
        <p className="hostly-carta-config-form-hint hostly-carta-familia-concept__hint">
          Cada categoría puede pertenecer a una <strong>familia de menú</strong> (p. ej. Pizzas) para
          compartir estación y pase. La familia de producto es otro concepto (filtros e informes).
        </p>
      </CartaCatalogConceptCollapsible>

      <div className="hostly-carta-config-actions-row">
        <ConfigBtnPrimary type="button" disabled={!restauranteId} onClick={openNew}>
          Nueva categoría de carta
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
          onDelete={(c) => setDeleteChoiceCategory(c)}
          onOrderProducts={openOrderProducts}
          canOrderProducts={canOrderProductsInCategory}
          orderProductsTitle={t("cartaCategories.orderProductsAction")}
          orderProductsDisabledTitle={t("cartaCategories.orderProductsDisabledHint")}
          onCreateNew={openNew}
          onMoveCategoryUp={(c) => void moveCategory(c.id, "up")}
          onMoveCategoryDown={(c) => void moveCategory(c.id, "down")}
          onReorderCategories={(orderedIds) => void reorderCategories(orderedIds)}
          reorderBusyId={reorderBusyId}
        />
      </ConfigCard>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop" role="dialog" aria-modal="true">
          <ConfigCard className="hostly-carta-config-drawer hostly-carta-category-form-drawer">
            <h2 className="hostly-carta-category-form-drawer__title">
              {editing ? "Editar categoría de carta" : "Nueva categoría de carta"}
            </h2>
            <div className="hostly-carta-category-form-drawer__body">
              <div className="hostly-carta-category-form-grid">
                <label className="hostly-carta-config-form-field hostly-carta-category-form-grid__full">
                  <span className="hostly-carta-config-form-label">Nombre</span>
                  <input
                    className={inputClass}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Ginebras"
                  />
                </label>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">
                    {t("cartaCategories.categoryBelongsToFamily")}
                  </span>
                  <select
                    className={inputClass}
                    value={draftCartaMenuFamiliaId}
                    onChange={(e) => setDraftCartaMenuFamiliaId(e.target.value)}
                    disabled={saving}
                    title={t("cartaCategories.menuFamiliesHint")}
                  >
                    <option value="">{t("cartaCategories.noMenuFamily")}</option>
                    {menuFamiliaSelectOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.isActive === false ? " (inactiva)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Tipo</span>
                  <select
                    className={inputClass}
                    value={draftType}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isCartaCategoriaTipo(v)) return;
                      setDraftType(v);
                      setDraftOperationalBehavior((prev) =>
                        coerceCategoryOperationalBehaviorForType(prev, v),
                      );
                    }}
                  >
                    <option value="food">Comida</option>
                    <option value="drink">Bebida</option>
                    <option value="general">Mixto</option>
                  </select>
                </label>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">
                    {t("cartaCategories.operationalBehaviorField")}
                  </span>
                  <select
                    className={inputClass}
                    value={draftOperationalBehavior}
                    disabled={saving}
                    title={t(operationalBehaviorHelpKey(draftOperationalBehavior, draftType))}
                    onChange={(e) =>
                      setDraftOperationalBehavior(
                        normalizeCategoryOperationalBehavior(e.target.value),
                      )
                    }
                  >
                    {behaviorOptionsForDraftType.map((behavior) => (
                      <option key={behavior} value={behavior}>
                        {getCategoryOperationalBehaviorLabel(behavior, behaviorLocale)}
                      </option>
                    ))}
                  </select>
                  <p className="hostly-carta-category-form-drawer__hint">
                    {t(operationalBehaviorHelpKey(draftOperationalBehavior, draftType))}
                  </p>
                </label>
                <label className="hostly-carta-config-form-field">
                  <span className="hostly-carta-config-form-label">Familia de producto</span>
                  <CategoryProductFamilySelect
                    restaurantId={restauranteId}
                    value={draftFamilyId}
                    onChange={setDraftFamilyId}
                    disabled={saving}
                    className={inputClass}
                  />
                </label>
                <div className="hostly-carta-config-form-field hostly-carta-category-form-grid__modifiers">
                  <span className="hostly-carta-config-form-label">Modificadores</span>
                  {showDrinkFormatMixerSuggestion ? (
                    <div
                      className="hostly-carta-category-form-drawer__hint"
                      style={{
                        marginBottom: "0.75rem",
                        padding: "0.75rem 0.875rem",
                        border: "1px solid var(--hostly-border-subtle, rgba(0, 0, 0, 0.12))",
                        borderRadius: "0.5rem",
                        background: "var(--hostly-surface-muted, rgba(0, 0, 0, 0.03))",
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 600 }}>💡 Sugerencia Hostly</p>
                      <p style={{ margin: "0.35rem 0 0" }}>Esta categoría parece un destilado.</p>
                      <p style={{ margin: "0.35rem 0 0" }}>Puedes añadir:</p>
                      <ul style={{ margin: "0.35rem 0 0.75rem", paddingLeft: "1.25rem" }}>
                        <li>✓ Formato bebida</li>
                        <li>✓ Mixer</li>
                      </ul>
                      <ConfigBtnSecondary
                        type="button"
                        disabled={saving || !drinkFormatMixerDefaultGroupsAvailable}
                        onClick={applyDrinkFormatMixerSuggestion}
                      >
                        Aplicar sugerencia
                      </ConfigBtnSecondary>
                    </div>
                  ) : null}
                  {activeModifierGroups.length === 0 ? (
                    <p className="hostly-carta-category-form-drawer__hint">
                      Sin grupos activos.{" "}
                      <Link href="/dashboard/configuracion/modificadores" className="hostly-carta-config-text-link">
                        Crear modificadores
                      </Link>
                    </p>
                  ) : (
                    <div className="hostly-carta-category-form-drawer__chips">
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
                              disabled={saving}
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
                </div>
                <label className="hostly-carta-config-form-checkbox hostly-carta-category-form-grid__status">
                  <input
                    type="checkbox"
                    checked={draftActive}
                    disabled={saving}
                    onChange={(e) => setDraftActive(e.target.checked)}
                  />
                  <span className="hostly-carta-config-form-label">{t("cartaCategories.formActiveLabel")}</span>
                </label>
              </div>
            </div>
            <div className="hostly-carta-category-form-drawer__footer">
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

      <CartaDeleteChoiceModal
        open={deleteChoiceCategory != null}
        title={t("cartaCategories.deleteChoiceTitle")}
        message={t("cartaCategories.deleteChoiceMessage")}
        deactivateLabel={t("cartaCategories.deactivateChoice")}
        deletePermanentLabel={t("cartaCategories.deletePermanentChoice")}
        deletePermanentHint={t("cartaCategories.deletePermanentHint")}
        cancelLabel={t("common.cancel")}
        busy={deleteChoiceBusy}
        onCancel={closeCategoryDeleteChoice}
        onDeactivate={() => void deactivateCategoryChoice()}
        onDeletePermanent={() => void deleteCategoryPermanently()}
      />

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
