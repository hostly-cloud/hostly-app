"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import {
  type StockProducto,
  type UnidadStock,
  UNIDADES_STOCK,
  STOCK_CHANGED_EVENT,
  isStockBajo,
  loadStock,
  newStockProductoId,
  saveStock,
} from "@/lib/stock-local";

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 6,
};

export default function StockPage() {
  const [items, setItems] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftUnidad, setDraftUnidad] = useState<UnidadStock>("kg");
  const [draftActual, setDraftActual] = useState("");
  const [draftMinimo, setDraftMinimo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const persist = useCallback((next: StockProducto[]) => {
    setItems(next);
    saveStock(next);
  }, []);

  useEffect(() => {
    function pull() {
      setItems(loadStock());
    }
    pull();
    setHydrated(true);
    window.addEventListener(STOCK_CHANGED_EVENT, pull);
    return () => window.removeEventListener(STOCK_CHANGED_EVENT, pull);
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const aLow = isStockBajo(a) ? 0 : 1;
      const bLow = isStockBajo(b) ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [items]);

  const bajosCount = useMemo(() => items.filter(isStockBajo).length, [items]);

  function openCreate() {
    setEditingId(null);
    setDraftNombre("");
    setDraftUnidad("kg");
    setDraftActual("");
    setDraftMinimo("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: StockProducto) {
    setEditingId(p.id);
    setDraftNombre(p.nombre);
    setDraftUnidad(p.unidad);
    setDraftActual(String(p.stock_actual));
    setDraftMinimo(String(p.stock_minimo));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function parseQty(s: string): number | null {
    const t = s.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function submitForm() {
    setFormError(null);
    const nombre = draftNombre.trim();
    if (!nombre) {
      setFormError("Indica el nombre del producto.");
      return;
    }
    const stock_actual = parseQty(draftActual);
    const stock_minimo = parseQty(draftMinimo);
    if (stock_actual === null || stock_minimo === null) {
      setFormError("Stock actual y mínimo deben ser números mayores o iguales a 0.");
      return;
    }

    if (editingId) {
      const next = items.map((p) =>
        p.id === editingId ? { ...p, nombre, unidad: draftUnidad, stock_actual, stock_minimo } : p,
      );
      persist(next);
      setNotice("Producto actualizado.");
    } else {
      const nuevo: StockProducto = {
        id: newStockProductoId(),
        nombre,
        unidad: draftUnidad,
        stock_actual,
        stock_minimo,
      };
      persist([...items, nuevo]);
      setNotice("Producto añadido.");
    }
    closeForm();
    window.setTimeout(() => setNotice(null), 3200);
  }

  function removeProduct(id: string) {
    if (!window.confirm("¿Eliminar este producto del stock local?")) return;
    persist(items.filter((p) => p.id !== id));
    setNotice("Producto eliminado.");
    window.setTimeout(() => setNotice(null), 3200);
    if (editingId === id) closeForm();
  }

  if (!hydrated) {
    return (
      <ModulePageShell title="Stock" subtitle="Cargando inventario…" maxWidth={1180}>
        <p style={{ color: "#94a3b8" }}>Preparando datos…</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title="Stock"
      subtitle="Inventario con unidades, niveles mínimos y alertas de reposición. Los datos se guardan en este navegador hasta conectar con el backend."
      maxWidth={1180}
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          style={{
            border: "none",
            background: "#22c55e",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          + Añadir producto
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {notice ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              color: "#bbf7d0",
              fontSize: 14,
            }}
          >
            {notice}
          </div>
        ) : null}

        {bajosCount > 0 ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "#fcd34d",
              fontSize: 14,
            }}
          >
            <strong>{bajosCount}</strong> producto{bajosCount === 1 ? "" : "s"} con stock en o por debajo del mínimo.
            Revisa la tabla.
          </div>
        ) : null}

        {formOpen ? (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 16,
              padding: 22,
              border: "1px solid #334155",
            }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
              {editingId ? "Editar producto" : "Nuevo producto"}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Nombre</label>
                <input
                  value={draftNombre}
                  onChange={(e) => setDraftNombre(e.target.value)}
                  placeholder="Ej. Pechuga de pollo"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Unidad</label>
                <select
                  value={draftUnidad}
                  onChange={(e) => setDraftUnidad(e.target.value as UnidadStock)}
                  style={inputStyle}
                >
                  {UNIDADES_STOCK.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Stock actual</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draftActual}
                  onChange={(e) => setDraftActual(e.target.value)}
                  placeholder="0"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Stock mínimo</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draftMinimo}
                  onChange={(e) => setDraftMinimo(e.target.value)}
                  placeholder="0"
                  style={inputStyle}
                />
              </div>
            </div>
            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 12, marginBottom: 0, fontSize: 14 }}>{formError}</p>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submitForm}
                style={{
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "#e2e8f0",
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <div
          style={{
            background: "#1e293b",
            borderRadius: 16,
            border: "1px solid #334155",
            overflow: "hidden",
          }}
        >
          {sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <p style={{ margin: "0 0 16px", fontSize: 16 }}>No hay productos en stock.</p>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Añadir el primero
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: "#0f172a", textAlign: "left" }}>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>Producto</th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>Unidad</th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                      Stock actual
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                      Stock mínimo
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>Estado</th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const bajo = isStockBajo(p);
                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderTop: "1px solid #334155",
                          background: bajo ? "rgba(245, 158, 11, 0.08)" : "transparent",
                          boxShadow: bajo ? "inset 3px 0 0 #f59e0b" : undefined,
                        }}
                      >
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#f8fafc" }}>{p.nombre}</td>
                        <td style={{ padding: "14px 16px", color: "#cbd5e1" }}>{p.unidad}</td>
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: bajo ? "#fcd34d" : "#e2e8f0",
                          }}
                        >
                          {p.stock_actual}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: "#94a3b8",
                          }}
                        >
                          {p.stock_minimo}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {bajo ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                background: "rgba(239, 68, 68, 0.2)",
                                color: "#fca5a5",
                                border: "1px solid rgba(239, 68, 68, 0.35)",
                              }}
                            >
                              Stock bajo
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                background: "rgba(34, 197, 94, 0.15)",
                                color: "#86efac",
                                border: "1px solid rgba(34, 197, 94, 0.3)",
                              }}
                            >
                              OK
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            style={{
                              marginRight: 8,
                              border: "1px solid #475569",
                              background: "#0f172a",
                              color: "#e2e8f0",
                              padding: "8px 12px",
                              borderRadius: 8,
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeProduct(p.id)}
                            style={{
                              border: "1px solid rgba(239, 68, 68, 0.4)",
                              background: "rgba(239, 68, 68, 0.12)",
                              color: "#fca5a5",
                              padding: "8px 12px",
                              borderRadius: 8,
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Datos almacenados en <code style={{ color: "#94a3b8" }}>localStorage</code> (clave{" "}
          <code style={{ color: "#94a3b8" }}>hostly.stock.productos.v1</code>). Sustituye{" "}
          <code style={{ color: "#94a3b8" }}>loadStock</code> / <code style={{ color: "#94a3b8" }}>saveStock</code> en{" "}
          <code style={{ color: "#94a3b8" }}>lib/stock-local.ts</code> por llamadas Supabase cuando toque.
        </p>
      </div>
    </ModulePageShell>
  );
}
