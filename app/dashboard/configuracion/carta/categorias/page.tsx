"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  resolveCategoryProductFamilyLabel,
  resolveProductFamilyFromSelectValue,
} from "@/lib/carta/category-product-family";
import {
  createCartaCategoriaApi,
  fetchCartaCategorias,
  patchCartaCategoriaApi,
} from "@/lib/carta-categorias/api-client";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
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
import { loadPlatos } from "@/lib/platos-local";

function tipoLabel(t: CartaCategoriaTipo): string {
  if (t === "food") return "Comida";
  if (t === "drink") return "Bebida";
  return "General";
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20";

export default function ConfigCartaCategoriasPage() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restauranteId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [items, setItems] = useState<CartaCategoria[]>([]);
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
  const [draftActive, setDraftActive] = useState(true);
  const [draftOrder, setDraftOrder] = useState(0);
  const [draftModifierGroupIds, setDraftModifierGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!restauranteId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCartaCategorias(restauranteId);
      setItems(list);
    } catch {
      setError("No se pudieron cargar las categorías. Revisa la conexión.");
      setItems([]);
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

  const countsByCatId = useMemo(() => {
    if (!restauranteId) return new Map<string, number>();
    const platos = loadPlatos(restauranteId);
    const m = new Map<string, number>();
    for (const p of platos) {
      const id = p.categoriaCartaId?.trim();
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [restauranteId, items]);

  function openNew() {
    setEditing(null);
    setDraftName("");
    setDraftType("general");
    setDraftFamilyId("");
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
      description="Organiza el menú por categorías y asígnalas a una familia de producto (bebidas, comida u otros). Los productos se enlazarán en la siguiente fase."
    >
      <div className="flex flex-wrap items-center gap-3">
        <ConfigBtnPrimary type="button" disabled={!restauranteId} onClick={openNew}>
          Nueva categoría
        </ConfigBtnPrimary>
        <ConfigBtnSecondary disabled={loading || !restauranteId} onClick={() => void refresh()}>
          Recargar
        </ConfigBtnSecondary>
        <Link
          href="/dashboard/configuracion/familias-producto"
          className="text-xs font-medium text-sky-700 hover:text-sky-600"
        >
          Gestionar familias de producto →
        </Link>
        <Link
          href="/dashboard/configuracion/carta/productos"
          className="text-xs font-medium text-slate-600 hover:text-slate-800"
        >
          Ir a Productos →
        </Link>
      </div>

      {!restauranteId ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          Selecciona un restaurante en la barra superior para ver categorías.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-800" role="status">
          {notice}
        </p>
      ) : null}

      <ConfigCard flush>
        <div className="hostly-config-table-head grid grid-cols-[minmax(0,1fr)_minmax(0,0.45fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.4fr)_minmax(0,0.4fr)_minmax(0,0.45fr)] gap-2 px-4 py-2.5">
          <span>Nombre</span>
          <span>Tipo</span>
          <span>Familia producto</span>
          <span>Modificadores</span>
          <span>Orden</span>
          <span>Estado</span>
          <span className="text-right">Productos</span>
        </div>
        <div className="max-h-[min(52vh,520px)] overflow-auto">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Cargando categorías…</div>
          ) : sorted.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-slate-900">Aún no hay categorías registradas</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600">
                Crea la primera con el botón superior o importa una carta con IA.
              </p>
            </div>
          ) : (
            sorted.map((c) => {
              const n = countsByCatId.get(c.id) ?? 0;
              const familyLabel = resolveCategoryProductFamilyLabel(
                c,
                productFamilies,
              );
              const modifierLabels = resolveEffectiveModifierGroupLabels(
                null,
                c,
                modifierGroups,
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openEdit(c)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.45fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.4fr)_minmax(0,0.4fr)_minmax(0,0.45fr)] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-xs text-slate-700 transition hover:bg-slate-50/80 last:border-0"
                >
                  <span className="truncate font-medium text-slate-900">{c.name}</span>
                  <span className="text-slate-500">{tipoLabel(c.type)}</span>
                  <span className="truncate text-slate-500">{familyLabel}</span>
                  <span className="truncate text-slate-500">
                    {modifierLabels.length > 0
                      ? modifierLabels.join(", ")
                      : "—"}
                  </span>
                  <span className="tabular-nums text-slate-500">{c.sortOrder}</span>
                  <span>
                    {c.isActive ? (
                      <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Inactiva
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums text-slate-500">{n}</span>
                </button>
              );
            })
          )}
        </div>
      </ConfigCard>

      {panelOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <ConfigCard className="w-full max-w-lg sm:max-h-[90vh] sm:overflow-y-auto">
            <h2 className="text-sm font-semibold text-slate-900">
              {editing ? "Editar categoría" : "Nueva categoría"}
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Nombre</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Ginebras"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Tipo de carta</span>
                <select
                  className={`${inputClass} mt-1`}
                  value={draftType}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isCartaCategoriaTipo(v)) setDraftType(v);
                  }}
                >
                  <option value="food">Comida</option>
                  <option value="drink">Bebida</option>
                  <option value="general">General</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Familia de producto
                </span>
                <div className="mt-1">
                  <CategoryProductFamilySelect
                    restaurantId={restauranteId}
                    value={draftFamilyId}
                    onChange={setDraftFamilyId}
                    disabled={saving}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Opcional. Agrupa para inventario y análisis (distinto de familias de menú).
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Modificadores
                </span>
                {activeModifierGroups.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No hay grupos activos. Créalos en{" "}
                    <Link
                      href="/dashboard/configuracion/modificadores"
                      className="font-medium text-sky-700 hover:text-sky-600"
                    >
                      Configuración → Modificadores
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeModifierGroups.map((group) => {
                      const selected = draftModifierGroupIds.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            selected
                              ? "border-sky-300 bg-sky-50 text-sky-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300"
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resolveEffectiveModifierGroupLabels(
                      null,
                      { modifierGroupIds: draftModifierGroupIds },
                      modifierGroups,
                    ).map((label) => (
                      <span
                        key={label}
                        className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-slate-500">
                  Formatos y mixers para productos de esta categoría (p. ej. chupito,
                  copa + tónica). El TPV los usará en una fase posterior.
                </p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Orden</span>
                <input
                  type="number"
                  className={`${inputClass} mt-1`}
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
                <span className="text-sm text-slate-700">Categoría activa</span>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
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

      <p className="text-[11px] leading-relaxed text-slate-600">
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
