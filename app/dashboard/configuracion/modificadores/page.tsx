"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigCard,
  ConfigCartaWorkbench,
} from "../_components/config-carta-workbench";
import {
  ModifierGroupEditorCard,
  type GroupDraft,
  type OptionDraft,
} from "@/components/carta/modifier-group-editor-card";
import { ModificadoresCartaDataView } from "@/components/carta/modificadores-carta-data-view";
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
  type ModifierGroupDocument,
  type ModifierGroupInput,
  type ModifierGroupType,
  type ModifierInventoryUnit,
  type ModifierOptionDocument,
} from "@/lib/modifiers/modifier-types";

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

const inputClass = "hostly-input hostly-carta-config-field-input";

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
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
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

  useEffect(() => {
    if (expandedGroupId && !groups.some((g) => g.id === expandedGroupId)) {
      setExpandedGroupId(null);
    }
  }, [expandedGroupId, groups]);

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
    <ConfigCartaWorkbench
      title="Modificadores"
      description="Configura formatos y acompañamientos como chupito, copa o mixer. Opcionalmente vincula cada opción a un artículo de inventario para el descuento futuro de stock (sin impacto en TPV ni cobros todavía)."
    >
        {error ? (
          <p className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="hostly-carta-config-alert hostly-carta-config-alert--success" role="status">
            {notice}
          </p>
        ) : null}

        <ConfigCard className="hostly-modifier-form-section hostly-modifier-form-section--create">
          <h2 className="hostly-carta-config-section-title">Nuevo grupo</h2>
          <p className="hostly-carta-config-form-hint">Ej.: Punto de carne, Guarnición, Salsa extra.</p>
          <div className="hostly-carta-config-form hostly-carta-config-drawer__body sm:grid sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <label className="hostly-carta-config-form-field">
              <span className="hostly-carta-config-form-label">Nombre</span>
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Punto de carne"
              />
            </label>
            <label className="hostly-carta-config-form-field">
              <span className="hostly-carta-config-form-label">Tipo</span>
              <select
                className={inputClass}
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

        <ConfigCard flush>
          <ModificadoresCartaDataView
            groups={groups}
            loading={loading}
            ensuringDefaults={ensuringDefaults}
            expandedGroupId={expandedGroupId}
            savingId={savingId}
            onExpand={setExpandedGroupId}
            onToggleActive={(group) => void handleToggleActive(group)}
          />
        </ConfigCard>

        {expandedGroupId
          ? (() => {
              const group = groups.find((g) => g.id === expandedGroupId);
              if (!group) return null;
              const index = groups.findIndex((g) => g.id === expandedGroupId);
              const draft = drafts[group.id] ?? groupToDraft(group);
              const busy = savingId === group.id;
              const dirty = !draftsEqual(draft, groupToDraft(group));

              return (
                <ModifierGroupEditorCard
                  group={group}
                  draft={draft}
                  index={index}
                  groupsLength={groups.length}
                  busy={busy}
                  dirty={dirty}
                  inventoryProducts={inventoryProducts}
                  onPatchDraft={(patch) => patchDraft(group.id, patch)}
                  onPatchOption={(optionId, patch) =>
                    patchOptionDraft(group.id, optionId, patch)
                  }
                  onAddOption={() => addOptionDraft(group.id)}
                  onInventoryProductChange={(optionId, productId) =>
                    handleInventoryProductChange(group.id, optionId, productId)
                  }
                  onSave={() => void handleSave(group)}
                  onToggleActive={() => void handleToggleActive(group)}
                  onMove={(direction) => void handleMove(group.id, direction)}
                  onClose={() => setExpandedGroupId(null)}
                />
              );
            })()
          : null}
    </ConfigCartaWorkbench>
  );
}
