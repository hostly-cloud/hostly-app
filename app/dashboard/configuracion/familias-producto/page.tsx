"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "../_components/config-carta-workbench";
import {
  HostlyAlert,
  HostlyFormToggle,
  HostlyInput,
  HostlySelect,
} from "@/components/ui/hostly";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  createProductFamily,
  disableProductFamily,
  enableProductFamily,
  ensureDefaultProductFamilies,
  listenProductFamilies,
  moveProductFamilyOrder,
  updateProductFamily,
} from "@/lib/firestore/product-families";
import {
  PRODUCT_FAMILY_TYPE_LABELS,
  PRODUCT_FAMILY_TYPES,
  type ProductFamilyDocument,
  type ProductFamilyInput,
  type ProductFamilyType,
} from "@/lib/carta/product-family-types";

type FamilyDraft = {
  name: string;
  type: ProductFamilyType;
  active: boolean;
};

function familyToDraft(family: ProductFamilyDocument): FamilyDraft {
  return {
    name: family.name,
    type: family.type,
    active: family.active,
  };
}

function formatProductFamilyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "DUPLICATE_FAMILY_NAME") {
      return "Ya existe una familia con ese nombre.";
    }
    return error.message;
  }
  return "No se pudo guardar la familia.";
}

export default function ConfigFamiliasProductoPage() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [families, setFamilies] = useState<ProductFamilyDocument[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FamilyDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ProductFamilyType>("food");

  const syncDrafts = useCallback((list: ProductFamilyDocument[]) => {
    const next: Record<string, FamilyDraft> = {};
    for (const f of list) {
      next[f.id] = familyToDraft(f);
    }
    setDrafts(next);
  }, []);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      setFamilies([]);
      setDrafts({});
      return;
    }

    setLoading(true);
    setError(null);
    let defaultsEnsured = false;

    const unsub = listenProductFamilies(
      restaurantId,
      (list) => {
        setFamilies(list);
        syncDrafts(list);
        setLoading(false);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          setEnsuringDefaults(true);
          void ensureDefaultProductFamilies(restaurantId)
            .catch((e) => {
              console.error("ensureDefaultProductFamilies", e);
              setError(formatProductFamilyError(e));
            })
            .finally(() => setEnsuringDefaults(false));
        }
      },
      (e) => {
        console.error("listenProductFamilies", e);
        setError("No se pudo cargar las familias de producto.");
        setFamilies([]);
        setDrafts({});
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authReady, restaurantId, syncDrafts]);

  const patchDraft = useCallback(
    (id: string, patch: Partial<FamilyDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, ...patch },
      }));
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!restaurantId) return;
    const name = newName.trim();
    if (!name) {
      setError("Indica un nombre para la familia.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await createProductFamily(restaurantId, {
        name,
        type: newType,
        active: true,
      });
      setNewName("");
      setNewType("food");
      setNotice(`Familia «${name}» creada.`);
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(formatProductFamilyError(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newType, restaurantId]);

  const handleSave = useCallback(
    async (family: ProductFamilyDocument) => {
      if (!restaurantId) return;
      const draft = drafts[family.id];
      if (!draft) return;
      setSavingId(family.id);
      setError(null);
      setNotice(null);
      try {
        const input: Partial<ProductFamilyInput> = {
          name: draft.name.trim(),
          type: draft.type,
          active: draft.active,
        };
        await updateProductFamily(restaurantId, family.id, input);
        setNotice("Cambios guardados.");
        window.setTimeout(() => setNotice(null), 2800);
      } catch (e) {
        setError(formatProductFamilyError(e));
      } finally {
        setSavingId(null);
      }
    },
    [drafts, restaurantId],
  );

  const handleToggleActive = useCallback(
    async (family: ProductFamilyDocument) => {
      if (!restaurantId) return;
      setSavingId(family.id);
      setError(null);
      try {
        if (family.active) {
          await disableProductFamily(restaurantId, family.id);
        } else {
          await enableProductFamily(restaurantId, family.id);
        }
      } catch (e) {
        setError(formatProductFamilyError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  const handleMove = useCallback(
    async (familyId: string, direction: "up" | "down") => {
      if (!restaurantId) return;
      setSavingId(familyId);
      setError(null);
      try {
        await moveProductFamilyOrder(restaurantId, familyId, direction);
      } catch (e) {
        setError(formatProductFamilyError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        {error ? (
          <HostlyAlert tone="danger">
            {error}
          </HostlyAlert>
        ) : null}
        {notice ? (
          <HostlyAlert tone="success">
            {notice}
          </HostlyAlert>
        ) : null}

        <ConfigCard>
          <h2 className="hostly-type-card-title">Nueva familia de producto</h2>
          <p className="hostly-type-caption mt-1 text-[color:var(--hostly-ink-muted)]">
            Ej.: Cócteles, Cafés, Tapas, Menú del día.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <label className="block">
              <span className="hostly-form-label">Nombre</span>
              <HostlyInput
                className="mt-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Cócteles"
              />
            </label>
            <label className="block">
              <span className="hostly-form-label">Clasificación</span>
              <HostlySelect
                className="mt-1"
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as ProductFamilyType)
                }
              >
                {PRODUCT_FAMILY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PRODUCT_FAMILY_TYPE_LABELS[t]}
                  </option>
                ))}
              </HostlySelect>
              <p className="hostly-type-caption mt-1 text-[color:var(--hostly-ink-muted)]">
                Comida, bebida u otros. Alimenta filtros como Comida / Bebida en Productos.
              </p>
            </label>
            <ConfigBtnPrimary
              type="button"
              disabled={creating || !authReady}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creando…" : "Crear familia"}
            </ConfigBtnPrimary>
          </div>
        </ConfigCard>

        {loading || ensuringDefaults ? (
          <ConfigCard>
            <p className="hostly-muted">Cargando familias…</p>
          </ConfigCard>
        ) : families.length === 0 ? (
          <ConfigCard>
            <p className="hostly-muted">
              No hay familias. Se crearán las predeterminadas al conectar.
            </p>
          </ConfigCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {families.map((family, index) => {
              const draft = drafts[family.id] ?? familyToDraft(family);
              const busy = savingId === family.id;
              const dirty =
                draft.name !== family.name ||
                draft.type !== family.type ||
                draft.active !== family.active;
              return (
                <li key={family.id}>
                  <ConfigCard>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="hostly-form-label">
                            Nombre
                          </span>
                          <HostlyInput
                            className="mt-1"
                            value={draft.name}
                            onChange={(e) =>
                              patchDraft(family.id, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="hostly-form-label">
                            Clasificación
                          </span>
                          <HostlySelect
                            className="mt-1"
                            value={draft.type}
                            onChange={(e) =>
                              patchDraft(family.id, {
                                type: e.target.value as ProductFamilyType,
                              })
                            }
                          >
                            {PRODUCT_FAMILY_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {PRODUCT_FAMILY_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </HostlySelect>
                        </label>
                        <HostlyFormToggle
                          className="pt-6"
                          label="Activa"
                          checked={draft.active}
                          onChange={(e) =>
                            patchDraft(family.id, {
                              active: e.target.checked,
                            })
                          }
                        />
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                        <div className="flex gap-1">
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy || index === 0}
                            onClick={() => void handleMove(family.id, "up")}
                          >
                            ↑
                          </ConfigBtnSecondary>
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy || index === families.length - 1}
                            onClick={() => void handleMove(family.id, "down")}
                          >
                            ↓
                          </ConfigBtnSecondary>
                        </div>
                        <ConfigBtnPrimary
                          type="button"
                          disabled={busy || !dirty}
                          onClick={() => void handleSave(family)}
                        >
                          {busy ? "Guardando…" : "Guardar"}
                        </ConfigBtnPrimary>
                        <ConfigBtnSecondary
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleActive(family)}
                        >
                          {family.active ? "Desactivar" : "Activar"}
                        </ConfigBtnSecondary>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-slate-400">
                      {family.id} · orden {family.sortOrder}
                      {!family.active ? " · inactiva" : ""}
                    </p>
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
