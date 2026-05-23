"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "../_components/config-carta-workbench";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  createModifierGroup,
  disableModifierGroup,
  enableModifierGroup,
  ensureDefaultDrinkModifierGroups,
  listenModifierGroups,
  moveModifierGroupOrder,
  updateModifierGroup,
} from "@/lib/firestore/modifier-groups";
import { listenProductsForInventory, type ProductDocument } from "@/lib/firestore/products";
import { inventoryStockUnitToModifierUnit } from "@/lib/modifiers/modifier-inventory-consumption";
import {
  MODIFIER_GROUP_TYPES,
  MODIFIER_GROUP_TYPE_LABELS,
  MODIFIER_INVENTORY_UNITS,
  MODIFIER_INVENTORY_UNIT_LABELS,
  type ModifierGroupDocument,
  type ModifierGroupInput,
  type ModifierGroupType,
  type ModifierInventoryUnit,
  type ModifierOptionDocument,
} from "@/lib/modifiers/modifier-types";

type OptionDraft = {
  id: string;
  name: string;
  priceDelta: string;
  active: boolean;
  sortOrder: number;
  inventoryProductId: string;
  inventoryProductName: string;
  inventoryQuantity: string;
  inventoryUnit: ModifierInventoryUnit | "";
};

type GroupDraft = {
  name: string;
  type: ModifierGroupType;
  active: boolean;
  required: boolean;
  minSelected: string;
  maxSelected: string;
  options: OptionDraft[];
};

function optionToDraft(option: ModifierOptionDocument): OptionDraft {
  return {
    id: option.id,
    name: option.name,
    priceDelta: String(option.priceDelta),
    active: option.active,
    sortOrder: option.sortOrder,
    inventoryProductId: option.inventoryProductId ?? "",
    inventoryProductName: option.inventoryProductName ?? "",
    inventoryQuantity:
      option.inventoryQuantity != null ? String(option.inventoryQuantity) : "",
    inventoryUnit: option.inventoryUnit ?? "",
  };
}

function groupToDraft(group: ModifierGroupDocument): GroupDraft {
  return {
    name: group.name,
    type: group.type,
    active: group.active,
    required: group.required,
    minSelected: String(group.minSelected),
    maxSelected: String(group.maxSelected),
    options: group.options.map(optionToDraft),
  };
}

function parseCount(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parsePriceDelta(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function draftsEqual(a: GroupDraft, b: GroupDraft): boolean {
  if (
    a.name !== b.name ||
    a.type !== b.type ||
    a.active !== b.active ||
    a.required !== b.required ||
    a.minSelected !== b.minSelected ||
    a.maxSelected !== b.maxSelected ||
    a.options.length !== b.options.length
  ) {
    return false;
  }
  return a.options.every((opt, index) => {
    const other = b.options[index];
    if (!other) return false;
    return (
      opt.id === other.id &&
      opt.name === other.name &&
      opt.priceDelta === other.priceDelta &&
      opt.active === other.active &&
      opt.sortOrder === other.sortOrder &&
      opt.inventoryProductId === other.inventoryProductId &&
      opt.inventoryProductName === other.inventoryProductName &&
      opt.inventoryQuantity === other.inventoryQuantity &&
      opt.inventoryUnit === other.inventoryUnit
    );
  });
}

function formatModifierGroupError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "DUPLICATE_GROUP_NAME") {
      return "Ya existe un grupo con ese nombre.";
    }
    return error.message;
  }
  return "No se pudo guardar el grupo.";
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20";

export default function ConfigModificadoresPage() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [groups, setGroups] = useState<ModifierGroupDocument[]>([]);
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ModifierGroupType>("custom");
  const [inventoryProducts, setInventoryProducts] = useState<ProductDocument[]>(
    [],
  );

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setInventoryProducts([]);
      return;
    }
    const unsub = listenProductsForInventory(restaurantId, setInventoryProducts, (e) => {
      console.warn("listenProductsForInventory (modificadores)", e);
      setInventoryProducts([]);
    });
    return () => unsub();
  }, [authReady, restaurantId]);

  const inventoryProductById = useMemo(() => {
    return new Map(inventoryProducts.map((p) => [p.id, p] as const));
  }, [inventoryProducts]);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      setGroups([]);
      setDrafts({});
      return;
    }

    setLoading(true);
    setError(null);
    let defaultsEnsured = false;

    const unsub = listenModifierGroups(
      restaurantId,
      (list) => {
        setGroups(list);
        setDrafts((prev) => {
          const next = groupToDraftsFromList(list);
          for (const g of list) {
            const prior = prev[g.id];
            if (prior && !draftsEqual(prior, next[g.id]!)) {
              next[g.id] = prior;
            }
          }
          return next;
        });
        setLoading(false);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          setEnsuringDefaults(true);
          void ensureDefaultDrinkModifierGroups(restaurantId)
            .catch((e) => {
              console.error("ensureDefaultDrinkModifierGroups", e);
              setError(formatModifierGroupError(e));
            })
            .finally(() => setEnsuringDefaults(false));
        }
      },
      (e) => {
        console.error("listenModifierGroups", e);
        setError("No se pudo cargar los grupos de modificadores.");
        setGroups([]);
        setDrafts({});
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authReady, restaurantId]);

  function groupToDraftsFromList(list: ModifierGroupDocument[]) {
    const next: Record<string, GroupDraft> = {};
    for (const g of list) {
      next[g.id] = groupToDraft(g);
    }
    return next;
  }

  const patchDraft = useCallback(
    (id: string, patch: Partial<GroupDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, ...patch },
      }));
    },
    [],
  );

  const patchOptionDraft = useCallback(
    (groupId: string, optionId: string, patch: Partial<OptionDraft>) => {
      setDrafts((prev) => {
        const draft = prev[groupId];
        if (!draft) return prev;
        return {
          ...prev,
          [groupId]: {
            ...draft,
            options: draft.options.map((opt) =>
              opt.id === optionId ? { ...opt, ...patch } : opt,
            ),
          },
        };
      });
    },
    [],
  );

  const addOptionDraft = useCallback((groupId: string) => {
    setDrafts((prev) => {
      const draft = prev[groupId];
      if (!draft) return prev;
      const nextSort =
        draft.options.reduce((m, opt) => Math.max(m, opt.sortOrder), -1) + 1;
      return {
        ...prev,
        [groupId]: {
          ...draft,
          options: [
            ...draft.options,
            {
              id: `new-${Date.now()}`,
              name: "",
              priceDelta: "0",
              active: true,
              sortOrder: nextSort,
              inventoryProductId: "",
              inventoryProductName: "",
              inventoryQuantity: "",
              inventoryUnit: "",
            },
          ],
        },
      };
    });
  }, []);

  const handleInventoryProductChange = useCallback(
    (groupId: string, optionId: string, productId: string) => {
      if (!productId) {
        patchOptionDraft(groupId, optionId, {
          inventoryProductId: "",
          inventoryProductName: "",
          inventoryQuantity: "",
          inventoryUnit: "",
        });
        return;
      }
      const product = inventoryProductById.get(productId);
      const suggestedUnit = inventoryStockUnitToModifierUnit(product?.inventory.unit);
      setDrafts((prev) => {
        const draft = prev[groupId];
        if (!draft) return prev;
        return {
          ...prev,
          [groupId]: {
            ...draft,
            options: draft.options.map((opt) =>
              opt.id === optionId
                ? {
                    ...opt,
                    inventoryProductId: productId,
                    inventoryProductName: product?.name?.trim() ?? "",
                    inventoryQuantity:
                      opt.inventoryQuantity.trim() || "1",
                    inventoryUnit:
                      (opt.inventoryUnit ||
                        suggestedUnit ||
                        "") as ModifierInventoryUnit | "",
                  }
                : opt,
            ),
          },
        };
      });
    },
    [inventoryProductById, patchOptionDraft],
  );

  const buildInputFromDraft = (draft: GroupDraft): ModifierGroupInput => ({
    name: draft.name.trim(),
    type: draft.type,
    active: draft.active,
    required: draft.required,
    minSelected: parseCount(draft.minSelected, 0),
    maxSelected: parseCount(draft.maxSelected, 1),
    options: draft.options
      .filter((opt) => opt.name.trim())
      .map((opt, index) => {
        const inventoryProductId = opt.inventoryProductId.trim();
        const qtyRaw = opt.inventoryQuantity.trim().replace(",", ".");
        const inventoryQuantity =
          qtyRaw !== "" && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : null;
        return {
          id: opt.id.startsWith("new-") ? undefined : opt.id,
          name: opt.name.trim(),
          priceDelta: parsePriceDelta(opt.priceDelta),
          active: opt.active,
          sortOrder: opt.sortOrder ?? index,
          inventoryProductId: inventoryProductId || null,
          inventoryProductName: opt.inventoryProductName.trim() || null,
          inventoryQuantity:
            inventoryQuantity != null && inventoryQuantity > 0
              ? inventoryQuantity
              : null,
          inventoryUnit: opt.inventoryUnit || null,
        };
      }),
  });

  const handleCreate = useCallback(async () => {
    if (!restaurantId) return;
    const name = newName.trim();
    if (!name) {
      setError("Indica un nombre para el grupo.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await createModifierGroup(restaurantId, {
        name,
        type: newType,
        active: true,
        required: false,
        minSelected: 0,
        maxSelected: 1,
        options: [],
      });
      setNewName("");
      setNewType("custom");
      setNotice(`Grupo «${name}» creado.`);
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(formatModifierGroupError(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newType, restaurantId]);

  const handleSave = useCallback(
    async (group: ModifierGroupDocument) => {
      if (!restaurantId) return;
      const draft = drafts[group.id];
      if (!draft) return;
      setSavingId(group.id);
      setError(null);
      setNotice(null);
      try {
        await updateModifierGroup(
          restaurantId,
          group.id,
          buildInputFromDraft(draft),
        );
        setNotice("Cambios guardados.");
        window.setTimeout(() => setNotice(null), 2800);
      } catch (e) {
        setError(formatModifierGroupError(e));
      } finally {
        setSavingId(null);
      }
    },
    [drafts, restaurantId],
  );

  const handleToggleActive = useCallback(
    async (group: ModifierGroupDocument) => {
      if (!restaurantId) return;
      setSavingId(group.id);
      setError(null);
      try {
        if (group.active) {
          await disableModifierGroup(restaurantId, group.id);
        } else {
          await enableModifierGroup(restaurantId, group.id);
        }
      } catch (e) {
        setError(formatModifierGroupError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  const handleMove = useCallback(
    async (groupId: string, direction: "up" | "down") => {
      if (!restaurantId) return;
      setSavingId(groupId);
      setError(null);
      try {
        await moveModifierGroupOrder(restaurantId, groupId, direction);
      } catch (e) {
        setError(formatModifierGroupError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <header className="mx-auto mb-6 w-full max-w-[var(--hostly-config-content-max)] sm:mb-7">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
          Operación · Configuración
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Modificadores
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Configura formatos y acompañamientos como chupito, copa o mixer. Opcionalmente
          vincula cada opción a un artículo de inventario para el descuento futuro de
          stock (sin impacto en TPV ni cobros todavía).
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        {error ? (
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-emerald-800" role="status">
            {notice}
          </p>
        ) : null}

        <ConfigCard>
          <h2 className="text-sm font-semibold text-slate-900">Nuevo grupo</h2>
          <p className="mt-1 text-xs text-slate-500">
            Ej.: Punto de carne, Guarnición, Salsa extra.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Nombre</span>
              <input
                className={`${inputClass} mt-1`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Punto de carne"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Tipo</span>
              <select
                className={`${inputClass} mt-1`}
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as ModifierGroupType)
                }
              >
                {MODIFIER_GROUP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MODIFIER_GROUP_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <ConfigBtnPrimary
              type="button"
              disabled={creating || !authReady}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creando…" : "Crear grupo"}
            </ConfigBtnPrimary>
          </div>
        </ConfigCard>

        {loading || ensuringDefaults ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">Cargando grupos…</p>
          </ConfigCard>
        ) : groups.length === 0 ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">
              No hay grupos. Se crearán los predeterminados de bebida al conectar.
            </p>
          </ConfigCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((group, index) => {
              const draft = drafts[group.id] ?? groupToDraft(group);
              const busy = savingId === group.id;
              const dirty = !draftsEqual(draft, groupToDraft(group));
              return (
                <li key={group.id}>
                  <ConfigCard>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-slate-600">
                              Nombre del grupo
                            </span>
                            <input
                              className={`${inputClass} mt-1`}
                              value={draft.name}
                              onChange={(e) =>
                                patchDraft(group.id, { name: e.target.value })
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                              Tipo
                            </span>
                            <select
                              className={`${inputClass} mt-1`}
                              value={draft.type}
                              onChange={(e) =>
                                patchDraft(group.id, {
                                  type: e.target.value as ModifierGroupType,
                                })
                              }
                            >
                              {MODIFIER_GROUP_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {MODIFIER_GROUP_TYPE_LABELS[t]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) =>
                                patchDraft(group.id, {
                                  active: e.target.checked,
                                })
                              }
                            />
                            <span className="text-sm text-slate-700">Activo</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draft.required}
                              onChange={(e) =>
                                patchDraft(group.id, {
                                  required: e.target.checked,
                                })
                              }
                            />
                            <span className="text-sm text-slate-700">
                              Obligatorio en TPV (futuro)
                            </span>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                              Mín. selección
                            </span>
                            <input
                              type="number"
                              min={0}
                              className={`${inputClass} mt-1`}
                              value={draft.minSelected}
                              onChange={(e) =>
                                patchDraft(group.id, {
                                  minSelected: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                              Máx. selección
                            </span>
                            <input
                              type="number"
                              min={0}
                              className={`${inputClass} mt-1`}
                              value={draft.maxSelected}
                              onChange={(e) =>
                                patchDraft(group.id, {
                                  maxSelected: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                          <div className="flex gap-1">
                            <ConfigBtnSecondary
                              type="button"
                              disabled={busy || index === 0}
                              onClick={() => void handleMove(group.id, "up")}
                            >
                              ↑
                            </ConfigBtnSecondary>
                            <ConfigBtnSecondary
                              type="button"
                              disabled={busy || index === groups.length - 1}
                              onClick={() => void handleMove(group.id, "down")}
                            >
                              ↓
                            </ConfigBtnSecondary>
                          </div>
                          <ConfigBtnPrimary
                            type="button"
                            disabled={busy || !dirty}
                            onClick={() => void handleSave(group)}
                          >
                            {busy ? "Guardando…" : "Guardar"}
                          </ConfigBtnPrimary>
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleActive(group)}
                          >
                            {group.active ? "Desactivar" : "Activar"}
                          </ConfigBtnSecondary>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Opciones
                          </h3>
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy}
                            onClick={() => addOptionDraft(group.id)}
                          >
                            Añadir opción
                          </ConfigBtnSecondary>
                        </div>
                        {draft.options.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Sin opciones. Añade chupito, copa, mixer, etc.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {draft.options.map((opt) => (
                              <li
                                key={opt.id}
                                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                              >
                                <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                                  <label className="block">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                      Nombre
                                    </span>
                                    <input
                                      className={`${inputClass} mt-1`}
                                      value={opt.name}
                                      onChange={(e) =>
                                        patchOptionDraft(group.id, opt.id, {
                                          name: e.target.value,
                                        })
                                      }
                                      placeholder="Tónica"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                      Suplemento €
                                    </span>
                                    <input
                                      className={`${inputClass} mt-1`}
                                      value={opt.priceDelta}
                                      onChange={(e) =>
                                        patchOptionDraft(group.id, opt.id, {
                                          priceDelta: e.target.value,
                                        })
                                      }
                                      placeholder="0"
                                    />
                                  </label>
                                  <label className="flex items-end gap-2 pb-1">
                                    <input
                                      type="checkbox"
                                      checked={opt.active}
                                      onChange={(e) =>
                                        patchOptionDraft(group.id, opt.id, {
                                          active: e.target.checked,
                                        })
                                      }
                                    />
                                    <span className="text-xs text-slate-700">
                                      Activa
                                    </span>
                                  </label>
                                </div>

                                <div className="rounded-lg border border-dashed border-slate-200 bg-white/80 p-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Consumo inventario
                                  </p>
                                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                    Artículo a descontar al vender esta opción (sin
                                    descuento automático todavía).
                                  </p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_100px_120px]">
                                    <label className="block sm:col-span-2 lg:col-span-1">
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                        Producto inventario
                                      </span>
                                      <select
                                        className={`${inputClass} mt-1`}
                                        value={opt.inventoryProductId}
                                        onChange={(e) =>
                                          handleInventoryProductChange(
                                            group.id,
                                            opt.id,
                                            e.target.value,
                                          )
                                        }
                                      >
                                        <option value="">Sin consumo</option>
                                        {inventoryProducts.map((product) => (
                                          <option key={product.id} value={product.id}>
                                            {product.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                        Cantidad
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="any"
                                        className={`${inputClass} mt-1`}
                                        value={opt.inventoryQuantity}
                                        disabled={!opt.inventoryProductId}
                                        onChange={(e) =>
                                          patchOptionDraft(group.id, opt.id, {
                                            inventoryQuantity: e.target.value,
                                          })
                                        }
                                        placeholder="1"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                        Unidad
                                      </span>
                                      <select
                                        className={`${inputClass} mt-1`}
                                        value={opt.inventoryUnit}
                                        disabled={!opt.inventoryProductId}
                                        onChange={(e) =>
                                          patchOptionDraft(group.id, opt.id, {
                                            inventoryUnit: e.target
                                              .value as ModifierInventoryUnit,
                                          })
                                        }
                                      >
                                        <option value="">—</option>
                                        {MODIFIER_INVENTORY_UNITS.map((unit) => (
                                          <option key={unit} value={unit}>
                                            {MODIFIER_INVENTORY_UNIT_LABELS[unit]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  {opt.inventoryProductId ? (
                                    <p className="mt-2 text-[11px] text-slate-500">
                                      Venta TPV: «{opt.name.trim() || "—"}» · Inventario:{" "}
                                      {opt.inventoryProductName.trim() || opt.inventoryProductId}
                                      {opt.inventoryQuantity && opt.inventoryUnit
                                        ? ` · ${opt.inventoryQuantity} ${MODIFIER_INVENTORY_UNIT_LABELS[opt.inventoryUnit]}`
                                        : ""}
                                    </p>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <p className="font-mono text-[10px] text-slate-400">
                        {group.id} · orden {group.sortOrder}
                        {!group.active ? " · inactivo" : ""}
                        {group.required ? " · obligatorio" : ""}
                      </p>
                    </div>
                  </ConfigCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
