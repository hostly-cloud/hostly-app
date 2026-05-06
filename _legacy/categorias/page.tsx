"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  CARTA_CATEGORIAS_CHANGED_EVENT,
  loadCartaCategoriasLocal,
} from "@/lib/carta-categorias/local-store";
import {
  createCartaCategoriaApi,
  deleteCartaCategoriaApi,
  fetchCartaCategorias,
  patchCartaCategoriaApi,
  reorderCartaCategoriasApi,
} from "@/lib/carta-categorias/api-client";
import { migrateTextCategoriesToManaged } from "@/lib/carta-categorias/migrate-from-text";
import { denormalizeAllPlatosCategorias, detachPlatosFromCategory } from "@/lib/carta-categorias/platos-category-sync";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { PLATOS_CHANGED_EVENT } from "@/lib/platos-local";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 8,
};

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};

export default function CartaCategoriasPage() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [categories, setCategories] = useState<CartaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<CartaCategoria | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<CartaCategoriaTipo>("general");
  const [draftActive, setDraftActive] = useState(true);
  const [draftOrder, setDraftOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const restauranteId = useMemo(() => getBrowserRestauranteId(), []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCartaCategorias(restauranteId);
      setCategories(list);
    } catch {
      setCategories(loadCartaCategoriasLocal(restauranteId));
      setError(t("cartaCategories.loadError"));
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [restauranteId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onCat = () => void reload();
    const onPlatos = () => void reload();
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    window.addEventListener(PLATOS_CHANGED_EVENT, onPlatos);
    return () => {
      window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
      window.removeEventListener(PLATOS_CHANGED_EVENT, onPlatos);
    };
  }, [reload]);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [categories],
  );

  function openNew() {
    setEditing(null);
    setDraftName("");
    setDraftType("general");
    setDraftActive(true);
    setDraftOrder(sorted.length);
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(c: CartaCategoria) {
    setEditing(c);
    setDraftName(c.name);
    setDraftType(c.type);
    setDraftActive(c.isActive);
    setDraftOrder(c.sortOrder);
    setPanelOpen(true);
    setError(null);
  }

  async function savePanel() {
    const name = draftName.trim();
    if (!name) {
      setError(t("cartaCategories.errorName"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await patchCartaCategoriaApi(restauranteId, editing.id, {
          name,
          type: draftType,
          isActive: draftActive,
          sortOrder: draftOrder,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createCartaCategoriaApi(restauranteId, {
          name,
          type: draftType,
          isActive: draftActive,
          sortOrder: draftOrder,
        });
        if (!res.ok) throw new Error(res.error);
      }
      await reload();
      const fresh = await fetchCartaCategorias(restauranteId);
      denormalizeAllPlatosCategorias(restauranteId, fresh);
      window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
      setPanelOpen(false);
      setNotice(t("cartaCategories.saved"));
      window.setTimeout(() => setNotice(null), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("cartaCategories.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: CartaCategoria) {
    const res = await patchCartaCategoriaApi(restauranteId, c.id, { isActive: !c.isActive });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
  }

  async function remove(c: CartaCategoria) {
    const ok = window.confirm(t("cartaCategories.confirmDelete", { name: c.name }));
    if (!ok) return;
    detachPlatosFromCategory(restauranteId, c.id);
    window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
    const res = await deleteCartaCategoriaApi(restauranteId, c.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
    setNotice(t("cartaCategories.deleted"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const ids = sorted.map((c) => c.id);
    const tmp = ids[idx];
    ids[idx] = ids[j];
    ids[j] = tmp;
    const res = await reorderCartaCategoriasApi(restauranteId, ids);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
  }

  async function runMigrate() {
    setSaving(true);
    setError(null);
    try {
      const r = await migrateTextCategoriesToManaged(restauranteId);
      await reload();
      window.dispatchEvent(new Event(PLATOS_CHANGED_EVENT));
      setNotice(t("cartaCategories.migrateDone", { created: r.created, products: r.updatedProducts }));
      window.setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("cartaCategories.migrateError"));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return (
      <ModulePageShell title={t("cartaCategories.title")} subtitle={t("common.preparingData")} maxWidth={900} compactLayout operationalFocus>
        <p style={{ color: "#94a3b8" }}>…</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("cartaCategories.title")}
      subtitle={t("cartaCategories.subtitle")}
      maxWidth={900}
      compactLayout
      operationalFocus
      headerRight={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link
            href="/dashboard/carta"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid #475569",
              color: "#e2e8f0",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {t("cartaCategories.backCarta")}
          </Link>
          <button
            type="button"
            onClick={runMigrate}
            disabled={saving}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(251, 191, 36, 0.45)",
              background: "rgba(120, 53, 15, 0.2)",
              color: "#fde68a",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {t("cartaCategories.migrateButton")}
          </button>
          <button
            type="button"
            onClick={openNew}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(34, 197, 94, 0.45)",
              background: "rgba(6, 78, 59, 0.2)",
              color: "#86efac",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("cartaCategories.newCategory")}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {notice ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#bbf7d0",
              fontSize: 14,
            }}
          >
            {notice}
          </div>
        ) : null}
        {error ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(248, 113, 113, 0.12)",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              color: "#fecaca",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? <p style={{ color: "#94a3b8" }}>{t("cartaCategories.loading")}</p> : null}

        {!loading && sorted.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 15 }}>{t("cartaCategories.empty")}</p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((c, idx) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1px solid #334155",
                background: "#1e293b",
                boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                <div style={{ fontWeight: 800, color: "#f8fafc", fontSize: 16 }}>{c.name}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  {t(`cartaCategories.type.${c.type}`)} · {t("cartaCategories.orderLabel")} {c.sortOrder}
                </div>
              </div>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  ...(c.isActive
                    ? { background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(74, 222, 128, 0.35)", color: "#86efac" }
                    : { background: "rgba(71, 85, 105, 0.2)", border: "1px solid #475569", color: "#94a3b8" }),
                }}
              >
                {c.isActive ? t("cartaCategories.active") : t("cartaCategories.inactive")}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                style={iconBtnStyle(idx === 0)}
                aria-label={t("cartaCategories.moveUp")}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === sorted.length - 1}
                style={iconBtnStyle(idx === sorted.length - 1)}
                aria-label={t("cartaCategories.moveDown")}
              >
                ↓
              </button>
              <button type="button" onClick={() => toggleActive(c)} style={secondaryBtnStyle}>
                {c.isActive ? t("cartaCategories.deactivate") : t("cartaCategories.activate")}
              </button>
                <button type="button" onClick={() => openEdit(c)} style={secondaryBtnStyle}>
                  {t("common.edit")}
                </button>
                <button type="button" onClick={() => void remove(c)} style={dangerBtnStyle}>
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {panelOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("cartaCategories.panelTitle")}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2, 6, 23, 0.72)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "24px 16px",
            overflow: "auto",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPanelOpen(false);
          }}
        >
          <div
            style={{
              width: "min(440px, 100%)",
              marginTop: 40,
              borderRadius: 14,
              border: "1px solid #334155",
              background: "#0f172a",
              padding: "20px 20px 18px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>{editing ? t("cartaCategories.editTitle") : t("cartaCategories.panelTitle")}</h2>
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div>
                <label style={labelStyle}>{t("cartaCategories.name")}</label>
                <input value={draftName} onChange={(e) => setDraftName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t("cartaCategories.typeField")}</label>
                <select
                  value={draftType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftType(isCartaCategoriaTipo(v) ? v : "general");
                  }}
                  style={{ ...inputStyle, minHeight: 48, cursor: "pointer" }}
                >
                  <option value="food">{t("cartaCategories.type.food")}</option>
                  <option value="drink">{t("cartaCategories.type.drink")}</option>
                  <option value="general">{t("cartaCategories.type.general")}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("cartaCategories.sortOrder")}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={draftOrder}
                  onChange={(e) => setDraftOrder(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: "#e2e8f0", fontWeight: 700 }}>
                <input type="checkbox" checked={draftActive} onChange={(e) => setDraftActive(e.target.checked)} style={{ width: 22, height: 22, accentColor: "#22c55e" }} />
                {t("cartaCategories.activeField")}
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePanel()}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: "none",
                  background: saving ? "#475569" : "#22c55e",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 10,
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}

function iconBtnStyle(disabled: boolean): CSSProperties {
  return {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid #475569",
    background: disabled ? "#1e293b" : "#334155",
    color: disabled ? "#64748b" : "#e2e8f0",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 16,
  };
}

const secondaryBtnStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #475569",
  background: "#1e293b",
  color: "#e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  minHeight: 44,
};

const dangerBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  border: "1px solid rgba(248, 113, 113, 0.45)",
  background: "rgba(127, 29, 29, 0.2)",
  color: "#fecaca",
};
