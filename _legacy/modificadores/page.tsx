"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { useI18n } from "@/components/i18n-provider";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import { fetchCartaCategorias } from "@/lib/carta-categorias/api-client";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { ensureBaseModifierFamilies } from "@/lib/modificadores/default-modifier-family";
import {
  PLATOS_CHANGED_EVENT,
  loadPlatos,
  savePlatos,
  type PlatoCarta,
} from "@/lib/platos-local";

function activeCatalogProductsSorted(restauranteId: string): PlatoCarta[] {
  return loadPlatos(restauranteId)
    .filter((p) => p.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }));
}

function normCatKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Incluye productos con `categoriaCartaId` o solo texto de categoría alineado al nombre de la categoría de carta. */
function productMatchesCartaCategoria(p: PlatoCarta, cat: CartaCategoria): boolean {
  const pid = p.categoriaCartaId?.trim();
  if (pid) return pid === cat.id;
  const a = normCatKey(p.categoria ?? "");
  const b = normCatKey(cat.name);
  return a !== "" && a === b;
}

type Family = {
  id: string;
  restauranteId: string;
  nombre: string;
  activo: boolean;
  modifiersEnabledByDefault: boolean;
  defaultModifierGroupIds: string[];
};

type ModifierOption = {
  id: string;
  restauranteId: string;
  groupId: string;
  nombre: string;
  priceExtra: number;
  activo: boolean;
};

type ModifierGroup = {
  id: string;
  restauranteId: string;
  nombre: string;
  activo: boolean;
  /** Una opción (single) vs varias (multiple); por defecto single si el doc es legacy. */
  selectionType?: "single" | "multiple";
  obligatorio?: boolean;
  options: ModifierOption[];
};

type Tab = "productos" | "familias" | "modificadores";

type BulkBanner = { text: string; variant: "success" | "info" };

async function safeReadJson(res: Response): Promise<{ ok: boolean; json: any | null; text: string; status: number }> {
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }
  if (!text) return { ok: res.ok, json: null, text: "", status };
  try {
    return { ok: res.ok, json: JSON.parse(text), text, status };
  } catch {
    return { ok: res.ok, json: null, text, status };
  }
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(71,85,105,0.55)",
    background: active ? "rgba(8,47,73,0.35)" : "transparent",
    color: active ? "#bae6fd" : "#94a3b8",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    lineHeight: 1.1,
  };
}

export default function CartaModificadoresMvpPage() {
  const { t } = useI18n();
  const restauranteId = getBrowserRestauranteId();

  const [tab, setTab] = useState<Tab>("productos");
  const [families, setFamilies] = useState<Family[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [products, setProducts] = useState<PlatoCarta[]>([]);
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [bulkCartaCatId, setBulkCartaCatId] = useState("");
  const [bulkModifierFamilyId, setBulkModifierFamilyId] = useState("");
  const [bulkBanner, setBulkBanner] = useState<BulkBanner | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const productListScrollRef = useRef<HTMLDivElement | null>(null);
  const bulkPanelScrollRef = useRef<HTMLDivElement | null>(null);

  const [newFamilyName, setNewFamilyName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSelectionType, setNewGroupSelectionType] = useState<"single" | "multiple">("single");
  const [newGroupObligatorio, setNewGroupObligatorio] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionExtra, setNewOptionExtra] = useState("");

  const refreshProductsFromLocal = useCallback(() => {
    setProducts(activeCatalogProductsSorted(restauranteId));
  }, [restauranteId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [famRes, grpRes] = await Promise.all([
        authenticatedApiFetch(`/api/modifiers/families?restauranteId=${encodeURIComponent(restauranteId)}`),
        authenticatedApiFetch(`/api/modifiers/groups?restauranteId=${encodeURIComponent(restauranteId)}`),
      ]);
      const famJson = (await famRes.json()) as any;
      const grpJson = (await grpRes.json()) as any;
      if (!famRes.ok) throw new Error(famJson?.error ?? "FAMILIES_ERROR");
      if (!grpRes.ok) throw new Error(grpJson?.error ?? "GROUPS_ERROR");
      const famItems = Array.isArray(famJson.items) ? famJson.items : [];
      setFamilies(await ensureBaseModifierFamilies(restauranteId, famItems));
      setGroups(Array.isArray(grpJson.items) ? grpJson.items : []);
      if (!activeGroupId && Array.isArray(grpJson.items) && grpJson.items[0]?.id) setActiveGroupId(grpJson.items[0].id);
      refreshProductsFromLocal();
      void fetchCartaCategorias(restauranteId).then(setCartaCategorias).catch(() => {});
    } catch (e) {
      setApiError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [restauranteId, activeGroupId, refreshProductsFromLocal]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    refreshProductsFromLocal();
  }, [refreshProductsFromLocal]);

  useEffect(() => {
    let cancelled = false;
    void fetchCartaCategorias(restauranteId).then((list) => {
      if (!cancelled) setCartaCategorias(list);
    });
    return () => {
      cancelled = true;
    };
  }, [restauranteId]);

  useEffect(() => {
    const onCat = () => {
      void fetchCartaCategorias(restauranteId).then(setCartaCategorias);
    };
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    return () => window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
  }, [restauranteId]);

  useEffect(() => {
    if (!bulkBanner) return;
    window.requestAnimationFrame(() => {
      bulkPanelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    const ms = bulkBanner.variant === "success" ? 6200 : 4500;
    const timer = window.setTimeout(() => setBulkBanner(null), ms);
    return () => window.clearTimeout(timer);
  }, [bulkBanner]);

  useEffect(() => {
    const onPlatos = () => refreshProductsFromLocal();
    window.addEventListener(PLATOS_CHANGED_EVENT, onPlatos);
    return () => window.removeEventListener(PLATOS_CHANGED_EVENT, onPlatos);
  }, [refreshProductsFromLocal]);

  useEffect(() => {
    if (activeProductId && !products.some((p) => p.id === activeProductId)) {
      setActiveProductId(null);
    }
  }, [products, activeProductId]);

  const familiesById = useMemo(() => new Map(families.map((f) => [f.id, f] as const)), [families]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups]);

  const filteredProducts = useMemo(() => {
    const cat = bulkCartaCatId.trim() ? cartaCategorias.find((c) => c.id === bulkCartaCatId.trim()) : undefined;
    const q = productQuery.trim().toLowerCase();
    let list = products;
    if (cat) {
      list = list.filter((p) => productMatchesCartaCategoria(p, cat));
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || (p.categoria ?? "").toLowerCase().includes(q),
    );
  }, [products, productQuery, bulkCartaCatId, cartaCategorias]);

  const activeProduct = useMemo(() => {
    return activeProductId ? products.find((p) => p.id === activeProductId) ?? null : null;
  }, [products, activeProductId]);

  const activeGroup = useMemo(() => (activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null), [groups, activeGroupId]);

  const cartaCategoriasSorted = useMemo(() => {
    return [...cartaCategorias].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [cartaCategorias]);

  const applyBulkFamilyByCategory = useCallback(() => {
    setApiError(null);
    const catId = bulkCartaCatId.trim();
    if (!catId) {
      setBulkBanner({ text: t("modifiersMvp.bulkPickCategory"), variant: "info" });
      return;
    }
    const cat = cartaCategorias.find((c) => c.id === catId);
    if (!cat) {
      setBulkBanner({ text: t("modifiersMvp.bulkPickCategory"), variant: "info" });
      return;
    }
    const familyId = bulkModifierFamilyId.trim() || undefined;
    const familyLabel =
      familyId != null ? (families.find((f) => f.id === familyId)?.nombre?.trim() || familyId) : "";

    let all: PlatoCarta[];
    try {
      all = loadPlatos(restauranteId);
    } catch (e) {
      setApiError(t("modifiersMvp.bulkErrorLoad", { error: String((e as Error)?.message ?? e) }));
      setBulkBanner(null);
      return;
    }

    const now = new Date().toISOString();
    let inCategory = 0;
    let changed = 0;
    const next = all.map((p) => {
      if (!productMatchesCartaCategoria(p, cat)) return p;
      inCategory += 1;
      if (p.familyId === familyId) return p;
      changed += 1;
      return { ...p, familyId, updatedAt: now };
    });
    if (inCategory === 0) {
      setBulkBanner({ text: t("modifiersMvp.bulkNoMatch", { category: cat.name }), variant: "info" });
      return;
    }
    if (changed === 0) {
      setBulkBanner({
        text: familyId
          ? t("modifiersMvp.bulkAlreadyWithFamily", {
              count: String(inCategory),
              category: cat.name,
              family: familyLabel,
            })
          : t("modifiersMvp.bulkAlreadyCleared", { count: String(inCategory), category: cat.name }),
        variant: "info",
      });
      return;
    }

    setBulkApplying(true);
    try {
      savePlatos(restauranteId, next);
    } catch (e) {
      setApiError(t("modifiersMvp.bulkErrorSave", { error: String((e as Error)?.message ?? e) }));
      setBulkBanner(null);
      setBulkApplying(false);
      return;
    }
    setBulkApplying(false);

    refreshProductsFromLocal();
    window.requestAnimationFrame(() => {
      productListScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });

    setBulkBanner({
      text: familyId
        ? t("modifiersMvp.bulkAppliedFamily", {
            count: String(changed),
            category: cat.name,
            family: familyLabel,
          })
        : t("modifiersMvp.bulkAppliedCleared", { count: String(changed), category: cat.name }),
      variant: "success",
    });
  }, [
    bulkCartaCatId,
    bulkModifierFamilyId,
    cartaCategorias,
    families,
    restauranteId,
    refreshProductsFromLocal,
    t,
  ]);

  const updateActiveProduct = useCallback(
    (patch: Partial<Pick<PlatoCarta, "familyId" | "admiteModificadores" | "gruposModificadoresIds">>) => {
      if (!activeProduct) return;
      const all = loadPlatos(restauranteId);
      const idx = all.findIndex((p) => p.id === activeProduct.id);
      if (idx < 0) {
        setApiError(t("modifiersMvp.errorProductStale"));
        refreshProductsFromLocal();
        setActiveProductId(null);
        return;
      }
      const now = new Date().toISOString();
      const next = [...all];
      next[idx] = { ...next[idx], ...patch, updatedAt: now };
      savePlatos(restauranteId, next);
      refreshProductsFromLocal();
    },
    [activeProduct, restauranteId, refreshProductsFromLocal, t],
  );

  const createFamily = useCallback(async () => {
    const nombre = newFamilyName.trim();
    if (!nombre) return;
    if (families.some((f) => (f.nombre ?? "").trim() === nombre)) {
      setApiError(t("modifiersMvp.duplicateFamily"));
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const res = await authenticatedApiFetch("/api/modifiers/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restauranteId, nombre, activo: true, modifiersEnabledByDefault: true, defaultModifierGroupIds: [] }),
      });
      const { ok, json, text, status } = await safeReadJson(res);
      if (!ok) {
        const code = json?.error ?? `HTTP_${status}`;
        console.error("[families][create] status", status, "body", text);
        throw new Error(code);
      }
      setNewFamilyName("");
      await fetchAll();
    } catch (e) {
      setApiError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [newFamilyName, restauranteId, fetchAll, families, t]);

  const createGroup = useCallback(async () => {
    const nombre = newGroupName.trim();
    if (!nombre) return;
    setLoading(true);
    setApiError(null);
    try {
      const res = await authenticatedApiFetch("/api/modifiers/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restauranteId,
          nombre,
          activo: true,
          selectionType: newGroupSelectionType,
          obligatorio: newGroupObligatorio,
        }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? "CREATE_GROUP_FAILED");
      setNewGroupName("");
      setNewGroupSelectionType("single");
      setNewGroupObligatorio(false);
      await fetchAll();
    } catch (e) {
      setApiError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [newGroupName, newGroupSelectionType, newGroupObligatorio, restauranteId, fetchAll]);

  const createOption = useCallback(async () => {
    if (!activeGroup) return;
    const nombre = newOptionName.trim();
    if (!nombre) return;
    const extra = Number(newOptionExtra.replace(",", "."));
    setLoading(true);
    setApiError(null);
    try {
      const res = await authenticatedApiFetch("/api/modifiers/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restauranteId,
          groupId: activeGroup.id,
          nombre,
          priceExtra: Number.isFinite(extra) ? extra : 0,
          activo: true,
        }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? "CREATE_OPTION_FAILED");
      setNewOptionName("");
      setNewOptionExtra("");
      await fetchAll();
    } catch (e) {
      setApiError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [activeGroup, newOptionName, newOptionExtra, restauranteId, fetchAll]);

  const toggleFamilyGroup = useCallback(
    async (family: Family, groupId: string) => {
      const set = new Set(family.defaultModifierGroupIds ?? []);
      if (set.has(groupId)) set.delete(groupId);
      else set.add(groupId);
      const nextIds = [...set];
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch("/api/modifiers/families", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restauranteId,
            id: family.id,
            nombre: family.nombre,
            activo: family.activo,
            modifiersEnabledByDefault: family.modifiersEnabledByDefault,
            defaultModifierGroupIds: nextIds,
          }),
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "UPDATE_FAMILY_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const updateFamily = useCallback(
    async (family: Family, patch: Partial<Pick<Family, "nombre" | "activo" | "defaultModifierGroupIds" | "modifiersEnabledByDefault">>) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch("/api/modifiers/families", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restauranteId,
            id: family.id,
            nombre: (patch.nombre ?? family.nombre).trim(),
            activo: patch.activo ?? family.activo,
            modifiersEnabledByDefault: patch.modifiersEnabledByDefault ?? family.modifiersEnabledByDefault,
            defaultModifierGroupIds: patch.defaultModifierGroupIds ?? family.defaultModifierGroupIds ?? [],
          }),
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "UPDATE_FAMILY_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const deleteFamily = useCallback(
    async (familyId: string) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch(`/api/modifiers/families?restauranteId=${encodeURIComponent(restauranteId)}&id=${encodeURIComponent(familyId)}`, { method: "DELETE" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "DELETE_FAMILY_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const updateGroup = useCallback(
    async (group: ModifierGroup, patch: Partial<Pick<ModifierGroup, "nombre" | "activo" | "selectionType" | "obligatorio">>) => {
      setLoading(true);
      setApiError(null);
      try {
        const selectionType = patch.selectionType ?? group.selectionType ?? "single";
        const obligatorio = patch.obligatorio ?? group.obligatorio ?? false;
        const res = await authenticatedApiFetch("/api/modifiers/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restauranteId,
            id: group.id,
            nombre: (patch.nombre ?? group.nombre).trim(),
            activo: patch.activo ?? group.activo,
            selectionType,
            obligatorio,
            sortOrder: 999,
          }),
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "UPDATE_GROUP_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch(`/api/modifiers/groups?restauranteId=${encodeURIComponent(restauranteId)}&id=${encodeURIComponent(groupId)}`, { method: "DELETE" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "DELETE_GROUP_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const updateOption = useCallback(
    async (groupId: string, option: ModifierOption, patch: Partial<Pick<ModifierOption, "nombre" | "priceExtra" | "activo">>) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch("/api/modifiers/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restauranteId,
            groupId,
            id: option.id,
            nombre: (patch.nombre ?? option.nombre).trim(),
            priceExtra: typeof patch.priceExtra === "number" && Number.isFinite(patch.priceExtra) ? patch.priceExtra : option.priceExtra ?? 0,
            activo: patch.activo ?? option.activo,
            sortOrder: 999,
          }),
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "UPDATE_OPTION_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  const deleteOption = useCallback(
    async (groupId: string, optionId: string) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await authenticatedApiFetch(`/api/modifiers/options?restauranteId=${encodeURIComponent(restauranteId)}&groupId=${encodeURIComponent(groupId)}&id=${encodeURIComponent(optionId)}`, { method: "DELETE" });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "DELETE_OPTION_FAILED");
        await fetchAll();
      } catch (e) {
        setApiError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [restauranteId, fetchAll],
  );

  /** Incluye inactivos: no permitir borrar familia/grupo si un producto local (aunque esté apagado) sigue referenciándolo. */
  const usedFamilyIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of loadPlatos(restauranteId)) {
      if (p.familyId) set.add(p.familyId);
    }
    return set;
  }, [restauranteId, products]);

  const usedGroupIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of families) {
      for (const gid of f.defaultModifierGroupIds ?? []) set.add(gid);
    }
    for (const p of loadPlatos(restauranteId)) {
      for (const gid of p.gruposModificadoresIds ?? []) set.add(gid);
    }
    return set;
  }, [restauranteId, families, products]);

  return (
    <ModulePageShell
      title={t("modifiersMvp.title")}
      subtitle={t("modifiersMvp.subtitle")}
      maxWidth={1180}
      compactLayout
      operationalFocus
      lockViewport
      fitLaptopViewport
      backHref="/dashboard/productos"
      backLabel={t("modifiersMvp.back")}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: "1 1 0", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setTab("productos")} style={pillStyle(tab === "productos")}>
              {t("modifiersMvp.tabProducts")}
            </button>
            <button type="button" onClick={() => setTab("familias")} style={pillStyle(tab === "familias")}>
              {t("modifiersMvp.tabFamilies")}
            </button>
            <button type="button" onClick={() => setTab("modificadores")} style={pillStyle(tab === "modificadores")}>
              {t("modifiersMvp.tabGroups")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void fetchAll()}
            style={{
              border: "1px solid rgba(71,85,105,0.55)",
              background: "rgba(15,23,42,0.35)",
              color: "#cbd5e1",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {loading ? t("common.loading") : t("common.reload")}
          </button>
        </div>

        {apiError ? (
          <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)", color: "#fecaca", fontSize: 13 }}>
            {t("modifiersMvp.apiError", { error: apiError })}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 12,
            flex: "1 1 0",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            /* wrap rompe la altura útil: columnas en filas distintas o líneas sin stretch → listado sin scroll real */
            flexWrap: tab === "familias" ? "wrap" : "nowrap",
            alignItems: "stretch",
            alignContent: "stretch",
          }}
        >
          {tab === "productos" ? (
            <>
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
                  <select
                    aria-label={t("modifiersMvp.bulkFilterCategory")}
                    value={bulkCartaCatId}
                    onChange={(e) => {
                      setBulkCartaCatId(e.target.value);
                      setProductQuery("");
                    }}
                    style={{
                      minWidth: 200,
                      maxWidth: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(71,85,105,0.55)",
                      background: "rgba(15,23,42,0.7)",
                      color: "#e2e8f0",
                      fontSize: 13,
                      fontWeight: 650,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">{t("modifiersMvp.bulkFilterAllCategories")}</option>
                    {cartaCategoriasSorted.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="search"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder={t("modifiersMvp.searchProduct")}
                    style={{
                      width: 320,
                      maxWidth: "100%",
                      flex: "1 1 200px",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(71,85,105,0.55)",
                      background: "rgba(15,23,42,0.7)",
                      color: "#e2e8f0",
                      fontSize: 13,
                      fontWeight: 650,
                      outline: "none",
                    }}
                  />
                </div>
                <div
                  ref={productListScrollRef}
                  style={{
                    flex: "1 1 0",
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    WebkitOverflowScrolling: "touch",
                    borderRadius: 16,
                    border: "1px solid rgba(51,65,85,0.6)",
                    background: "rgba(15,23,42,0.35)",
                  }}
                >
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding: "16px 14px", fontSize: 13, color: "#94a3b8", lineHeight: 1.45, fontWeight: 650 }}>
                      {t("modifiersMvp.productListEmpty")}
                    </div>
                  ) : null}
                  {filteredProducts.map((p) => {
                    const active = p.id === activeProductId;
                    const fam = p.familyId ? familiesById.get(p.familyId)?.nombre : null;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActiveProductId(p.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: active ? "rgba(30,41,59,0.45)" : "transparent",
                          borderBottom: "1px solid rgba(51,65,85,0.28)",
                          padding: "10px 12px",
                          cursor: "pointer",
                          color: "#e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#fde68a", fontVariantNumeric: "tabular-nums" }}>{p.precioVenta.toFixed(2).replace(".", ",")} €</div>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8", fontWeight: 650 }}>
                          {p.categoria}
                          {fam ? ` · ${t("modifiersMvp.family")}: ${fam}` : ` · ${t("modifiersMvp.noFamilyShort")}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                ref={bulkPanelScrollRef}
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  WebkitOverflowScrolling: "touch",
                  borderRadius: 16,
                  border: "1px solid rgba(51,65,85,0.6)",
                  background: "linear-gradient(165deg, rgba(30,41,59,0.45) 0%, rgba(15,23,42,0.9) 100%)",
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>{t("modifiersMvp.bulkTitle")}</div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{t("modifiersMvp.bulkHint")}</p>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("modifiersMvp.bulkCategory")}</label>
                    <select
                      value={bulkCartaCatId}
                      onChange={(e) => setBulkCartaCatId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(71,85,105,0.55)",
                        background: "rgba(15,23,42,0.7)",
                        color: "#e2e8f0",
                        fontSize: 13,
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      <option value="">{t("modifiersMvp.bulkPickCategoryPlaceholder")}</option>
                      {cartaCategoriasSorted.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("modifiersMvp.bulkModifierFamily")}</label>
                    <select
                      value={bulkModifierFamilyId}
                      onChange={(e) => setBulkModifierFamilyId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(71,85,105,0.55)",
                        background: "rgba(15,23,42,0.7)",
                        color: "#e2e8f0",
                        fontSize: 13,
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      <option value="">{t("modifiersMvp.bulkClearFamily")}</option>
                      {families.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={bulkApplying}
                    onClick={() => applyBulkFamilyByCategory()}
                    style={{
                      border: "1px solid rgba(34,197,94,0.55)",
                      background: bulkApplying ? "rgba(6,78,59,0.12)" : "rgba(6,78,59,0.22)",
                      color: bulkApplying ? "#86a397" : "#dcfce7",
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontWeight: 950,
                      cursor: bulkApplying ? "not-allowed" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    {bulkApplying ? t("common.loading") : t("modifiersMvp.bulkApply")}
                  </button>
                </div>
                {bulkBanner ? (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      position: "sticky",
                      top: 8,
                      zIndex: 1,
                      background:
                        bulkBanner.variant === "success"
                          ? "rgba(34,197,94,0.14)"
                          : "rgba(56,189,248,0.12)",
                      border:
                        bulkBanner.variant === "success"
                          ? "1px solid rgba(34,197,94,0.35)"
                          : "1px solid rgba(56,189,248,0.28)",
                      color: bulkBanner.variant === "success" ? "#bbf7d0" : "#bae6fd",
                      fontSize: 13,
                      lineHeight: 1.4,
                      fontWeight: 800,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                    }}
                  >
                    {bulkBanner.text}
                  </div>
                ) : null}
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(51,65,85,0.45)",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>{t("modifiersMvp.productConfig")}</div>
                </div>
                {activeProduct ? (
                  <>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 950, color: "#f8fafc" }}>{activeProduct.nombre}</div>
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("modifiersMvp.family")}</label>
                        <select
                          value={activeProduct.familyId ?? ""}
                          onChange={(e) => updateActiveProduct({ familyId: e.target.value || undefined })}
                          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", fontSize: 13, fontWeight: 650 }}
                        >
                          <option value="">{t("modifiersMvp.none")}</option>
                          {families.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nombre}
                            </option>
                          ))}
                        </select>
                      </div>

                      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, fontWeight: 850, color: "#cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={activeProduct.admiteModificadores ?? false}
                          onChange={(e) => updateActiveProduct({ admiteModificadores: e.target.checked })}
                        />
                        {t("modifiersMvp.enableModifiers")}
                      </label>

                      <div style={{ borderTop: "1px solid rgba(51,65,85,0.45)", paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                          {t("modifiersMvp.assignGroups")}
                        </div>
                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                          {groups.map((g) => {
                            const set = new Set(activeProduct.gruposModificadoresIds ?? []);
                            const checked = set.has(g.id);
                            const reqLabel = g.obligatorio
                              ? t("modifiersMvp.modifierProductLineRequired")
                              : t("modifiersMvp.modifierProductLineOptional");
                            const typeLabel =
                              g.selectionType === "multiple"
                                ? t("modifiersMvp.modifierProductLineMultiple")
                                : t("modifiersMvp.modifierProductLineSingle");
                            const optN = g.options?.length ?? 0;
                            const metaLine = `${reqLabel} · ${typeLabel} · ${t("modifiersMvp.optionsCount", { count: String(optN) })}`;
                            return (
                              <label
                                key={g.id}
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "flex-start",
                                  color: "#e2e8f0",
                                  fontSize: 13,
                                  fontWeight: 750,
                                  lineHeight: 1.25,
                                  padding: "4px 0",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  style={{ marginTop: 4, flexShrink: 0 }}
                                  onChange={(e) => {
                                    const s = new Set(activeProduct.gruposModificadoresIds ?? []);
                                    if (e.target.checked) s.add(g.id);
                                    else s.delete(g.id);
                                    updateActiveProduct({ gruposModificadoresIds: [...s] });
                                  }}
                                />
                                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                                  <span style={{ display: "block", color: "#f8fafc", fontWeight: 850 }}>{g.nombre}</span>
                                  <span
                                    style={{
                                      display: "block",
                                      marginTop: 2,
                                      fontSize: 11,
                                      fontWeight: 650,
                                      color: "#94a3b8",
                                      letterSpacing: "0.01em",
                                    }}
                                  >
                                    {metaLine}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>{t("modifiersMvp.pickProduct")}</div>
                )}
              </div>
            </>
          ) : null}

          {tab === "familias" ? (
            <div
              style={{
                flex: "1 1 0",
                minWidth: 0,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                borderRadius: 16,
                border: "1px solid rgba(51,65,85,0.6)",
                background: "rgba(15,23,42,0.35)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  placeholder={t("modifiersMvp.newFamily")}
                  style={{ width: 320, maxWidth: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", fontSize: 13, fontWeight: 650 }}
                />
                <button
                  type="button"
                  onClick={() => void createFamily()}
                  style={{ border: "1px solid rgba(34,197,94,0.55)", background: "rgba(6,78,59,0.22)", color: "#dcfce7", padding: "10px 14px", borderRadius: 12, fontWeight: 950, cursor: "pointer", fontSize: 13 }}
                >
                  {t("common.add")}
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {families.map((f) => (
                  <div key={f.id} style={{ borderRadius: 14, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(2,6,23,0.16)", padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        defaultValue={f.nombre}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== f.nombre) void updateFamily(f, { nombre: next });
                        }}
                        style={{
                          flex: "1 1 240px",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(71,85,105,0.55)",
                          background: "rgba(15,23,42,0.55)",
                          color: "#f8fafc",
                          fontSize: 13,
                          fontWeight: 900,
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cbd5e1", fontSize: 12, fontWeight: 850 }}>
                          <input type="checkbox" checked={f.activo !== false} onChange={(e) => void updateFamily(f, { activo: e.target.checked })} />
                          {t("common.active")}
                        </label>
                        <button
                          type="button"
                          disabled={usedFamilyIds.has(f.id)}
                          onClick={() => void deleteFamily(f.id)}
                          style={{
                            border: "1px solid rgba(248,113,113,0.35)",
                            background: usedFamilyIds.has(f.id) ? "rgba(15,23,42,0.35)" : "rgba(127,29,29,0.2)",
                            color: usedFamilyIds.has(f.id) ? "#64748b" : "#fecaca",
                            padding: "10px 12px",
                            borderRadius: 12,
                            fontWeight: 950,
                            cursor: usedFamilyIds.has(f.id) ? "not-allowed" : "pointer",
                            fontSize: 12,
                          }}
                          title={usedFamilyIds.has(f.id) ? t("modifiersMvp.inUse") : t("common.delete")}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8", fontWeight: 650 }}>{t("modifiersMvp.familyDefaults")}</div>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {groups.map((g) => {
                        const checked = (f.defaultModifierGroupIds ?? []).includes(g.id);
                        return (
                          <label key={g.id} style={{ display: "flex", gap: 10, alignItems: "center", color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>
                            <input type="checkbox" checked={checked} onChange={() => void toggleFamilyGroup(f, g.id)} />
                            <span>{g.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {families.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 12 }}>{t("modifiersMvp.emptyFamilies")}</div> : null}
              </div>
            </div>
          ) : null}

          {tab === "modificadores" ? (
            <>
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  WebkitOverflowScrolling: "touch",
                  borderRadius: 16,
                  border: "1px solid rgba(51,65,85,0.6)",
                  background: "rgba(15,23,42,0.35)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder={t("modifiersMvp.newGroup")}
                      style={{ width: 240, maxWidth: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", fontSize: 13, fontWeight: 650 }}
                    />
                    <button type="button" onClick={() => void createGroup()} style={{ border: "1px solid rgba(34,197,94,0.55)", background: "rgba(6,78,59,0.22)", color: "#dcfce7", padding: "10px 14px", borderRadius: 12, fontWeight: 950, cursor: "pointer", fontSize: 13 }}>
                      {t("common.add")}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#94a3b8", fontWeight: 650 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "#64748b", fontWeight: 800 }}>{t("modifiersMvp.groupSelectionType")}</span>
                      <select
                        value={newGroupSelectionType}
                        onChange={(e) => setNewGroupSelectionType(e.target.value === "multiple" ? "multiple" : "single")}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(71,85,105,0.55)",
                          background: "rgba(15,23,42,0.7)",
                          color: "#e2e8f0",
                          fontSize: 12,
                          fontWeight: 650,
                          cursor: "pointer",
                        }}
                      >
                        <option value="single">{t("modifiersMvp.groupSelectionSingle")}</option>
                        <option value="multiple">{t("modifiersMvp.groupSelectionMultiple")}</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, color: "#cbd5e1" }}>
                      <input type="checkbox" checked={newGroupObligatorio} onChange={(e) => setNewGroupObligatorio(e.target.checked)} />
                      {t("modifiersMvp.groupRequired")}
                    </label>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setActiveGroupId(g.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: g.id === activeGroupId ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(71,85,105,0.55)",
                        background: g.id === activeGroupId ? "rgba(8,47,73,0.22)" : "rgba(2,6,23,0.16)",
                        color: "#e2e8f0",
                        padding: "10px 12px",
                        borderRadius: 14,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, fontWeight: 950 }}>{g.nombre}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 650 }}>{t("modifiersMvp.optionsCount", { count: String(g.options?.length ?? 0) })}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.02em" }}>
                        {g.selectionType === "multiple" ? t("modifiersMvp.badgeMultiple") : t("modifiersMvp.badgeSingle")}
                        {g.obligatorio ? ` · ${t("modifiersMvp.badgeRequired")}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  WebkitOverflowScrolling: "touch",
                  borderRadius: 16,
                  border: "1px solid rgba(51,65,85,0.6)",
                  background: "linear-gradient(165deg, rgba(30,41,59,0.45) 0%, rgba(15,23,42,0.9) 100%)",
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>{t("modifiersMvp.groupOptions")}</div>
                {activeGroup ? (
                  <>
                    <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        defaultValue={activeGroup.nombre}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== activeGroup.nombre) void updateGroup(activeGroup, { nombre: next });
                        }}
                        style={{
                          flex: "1 1 240px",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(71,85,105,0.55)",
                          background: "rgba(15,23,42,0.55)",
                          color: "#f8fafc",
                          fontSize: 13,
                          fontWeight: 900,
                          outline: "none",
                        }}
                      />
                      <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cbd5e1", fontSize: 12, fontWeight: 850 }}>
                        <input type="checkbox" checked={activeGroup.activo !== false} onChange={(e) => void updateGroup(activeGroup, { activo: e.target.checked })} />
                        {t("common.active")}
                      </label>
                      <button
                        type="button"
                        disabled={usedGroupIds.has(activeGroup.id)}
                        onClick={() => void deleteGroup(activeGroup.id)}
                        style={{
                          border: "1px solid rgba(248,113,113,0.35)",
                          background: usedGroupIds.has(activeGroup.id) ? "rgba(15,23,42,0.35)" : "rgba(127,29,29,0.2)",
                          color: usedGroupIds.has(activeGroup.id) ? "#64748b" : "#fecaca",
                          padding: "10px 12px",
                          borderRadius: 12,
                          fontWeight: 950,
                          cursor: usedGroupIds.has(activeGroup.id) ? "not-allowed" : "pointer",
                          fontSize: 12,
                        }}
                        title={usedGroupIds.has(activeGroup.id) ? t("modifiersMvp.inUse") : t("common.delete")}
                      >
                        {t("common.delete")}
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#94a3b8", fontWeight: 650 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "#64748b", fontWeight: 800 }}>{t("modifiersMvp.groupSelectionType")}</span>
                        <select
                          value={activeGroup.selectionType === "multiple" ? "multiple" : "single"}
                          onChange={(e) =>
                            void updateGroup(activeGroup, { selectionType: e.target.value === "multiple" ? "multiple" : "single" })
                          }
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(71,85,105,0.55)",
                            background: "rgba(15,23,42,0.55)",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontWeight: 650,
                            cursor: "pointer",
                          }}
                        >
                          <option value="single">{t("modifiersMvp.groupSelectionSingle")}</option>
                          <option value="multiple">{t("modifiersMvp.groupSelectionMultiple")}</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, color: "#cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={activeGroup.obligatorio === true}
                          onChange={(e) => void updateGroup(activeGroup, { obligatorio: e.target.checked })}
                        />
                        {t("modifiersMvp.groupRequired")}
                      </label>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        value={newOptionName}
                        onChange={(e) => setNewOptionName(e.target.value)}
                        placeholder={t("modifiersMvp.newOption")}
                        style={{ width: 260, maxWidth: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", fontSize: 13, fontWeight: 650 }}
                      />
                      <input
                        value={newOptionExtra}
                        onChange={(e) => setNewOptionExtra(e.target.value)}
                        placeholder={t("modifiersMvp.extraPrice")}
                        style={{ width: 120, maxWidth: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", fontSize: 13, fontWeight: 650, textAlign: "right" }}
                      />
                      <button type="button" onClick={() => void createOption()} style={{ border: "1px solid rgba(34,197,94,0.55)", background: "rgba(6,78,59,0.22)", color: "#dcfce7", padding: "10px 14px", borderRadius: 12, fontWeight: 950, cursor: "pointer", fontSize: 13 }}>
                        {t("common.add")}
                      </button>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      {(activeGroup.options ?? []).map((o) => (
                        <div key={o.id} style={{ borderRadius: 14, border: "1px solid rgba(71,85,105,0.55)", background: "rgba(2,6,23,0.16)", padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              defaultValue={o.nombre}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next && next !== o.nombre) void updateOption(activeGroup.id, o, { nombre: next });
                              }}
                              style={{
                                flex: "1 1 220px",
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: "1px solid rgba(71,85,105,0.55)",
                                background: "rgba(15,23,42,0.55)",
                                color: "#f8fafc",
                                fontSize: 13,
                                fontWeight: 850,
                                outline: "none",
                              }}
                            />
                            <input
                              defaultValue={String(o.priceExtra ?? 0).replace(".", ",")}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const n = Number(raw.replace(",", "."));
                                if (!Number.isFinite(n)) return;
                                if (Number(o.priceExtra ?? 0) !== n) void updateOption(activeGroup.id, o, { priceExtra: n });
                              }}
                              style={{
                                width: 110,
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: "1px solid rgba(71,85,105,0.55)",
                                background: "rgba(15,23,42,0.55)",
                                color: "#fde68a",
                                fontSize: 13,
                                fontWeight: 900,
                                outline: "none",
                                textAlign: "right",
                              }}
                            />
                            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cbd5e1", fontSize: 12, fontWeight: 850 }}>
                              <input type="checkbox" checked={o.activo !== false} onChange={(e) => void updateOption(activeGroup.id, o, { activo: e.target.checked })} />
                              {t("common.active")}
                            </label>
                            <button
                              type="button"
                              onClick={() => void deleteOption(activeGroup.id, o.id)}
                              style={{
                                border: "1px solid rgba(248,113,113,0.35)",
                                background: "rgba(127,29,29,0.2)",
                                color: "#fecaca",
                                padding: "10px 12px",
                                borderRadius: 12,
                                fontWeight: 950,
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </div>
                      ))}
                      {(activeGroup.options ?? []).length === 0 ? <div style={{ color: "#94a3b8", fontSize: 12 }}>{t("modifiersMvp.emptyOptions")}</div> : null}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 12 }}>{t("modifiersMvp.pickGroup")}</div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}

