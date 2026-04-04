"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mockInventarioProductos } from "@/lib/inventario-productos";

type Unidad = "kg" | "g" | "l" | "ml" | "ud";

type ProductoRow = {
  id: string | number;
  nombre: string | null;
  unidad: Unidad | string | null;
  stock_actual: number | null;
  coste_unitario: number | null;
  stock_minimo: number | null;
};

type DraftById = Record<
  string,
  {
    nombre: string;
    unidad: string;
    stock_actual: string;
    coste_unitario: string;
    stock_minimo: string;
  }
>;

const UNIDADES: Unidad[] = ["kg", "g", "l", "ml", "ud"];

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function formatMoney2(value: number | null | undefined): string {
  if (value == null) return "-";
  if (!Number.isFinite(value)) return "-";
  return roundTo(value, 2).toFixed(2);
}

function parseNumber(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

export default function InventarioPage() {
  const [items, setItems] = useState<ProductoRow[]>([]);
  const [drafts, setDrafts] = useState<DraftById>({});
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setLoading(true);
    setError(null);
    setUsingMock(false);

    try {
      const { data, error } = await supabase
        .from("inventario_productos")
        .select("id, nombre, unidad, stock_actual, coste_unitario, stock_minimo")
        .order("nombre", { ascending: true, nullsFirst: false });

      if (error) throw error;

      const rows = (data ?? []) as ProductoRow[];
      setItems(rows);
      setDrafts((prev) => {
        const next: DraftById = { ...prev };
        for (const r of rows) {
          const key = String(r.id);
          if (!next[key]) {
            next[key] = {
              nombre: r.nombre ?? "",
              unidad: r.unidad ?? "kg",
              stock_actual: r.stock_actual == null ? "" : String(roundTo(r.stock_actual, 3)),
              coste_unitario: r.coste_unitario == null ? "" : String(roundTo(r.coste_unitario, 2)),
              stock_minimo: r.stock_minimo == null ? "" : String(roundTo(r.stock_minimo, 3)),
            };
          }
        }
        return next;
      });
    } catch (e) {
      setUsingMock(true);
      const rows = mockInventarioProductos() as ProductoRow[];
      setItems(rows);
      setDrafts(() => {
        const next: DraftById = {};
        for (const r of rows) {
          next[String(r.id)] = {
            nombre: r.nombre ?? "",
            unidad: r.unidad ?? "kg",
            stock_actual: r.stock_actual == null ? "" : String(roundTo(r.stock_actual, 3)),
            coste_unitario: r.coste_unitario == null ? "" : String(roundTo(r.coste_unitario, 2)),
            stock_minimo: r.stock_minimo == null ? "" : String(roundTo(r.stock_minimo, 3)),
          };
        }
        return next;
      });
      setError(e instanceof Error ? e.message : "No se pudo cargar inventario (modo ejemplo).");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(id: string | number, patch: Partial<DraftById[string]>) {
    const key = String(id);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        nombre: prev[key]?.nombre ?? "",
        unidad: prev[key]?.unidad ?? "kg",
        stock_actual: prev[key]?.stock_actual ?? "",
        coste_unitario: prev[key]?.coste_unitario ?? "",
        stock_minimo: prev[key]?.stock_minimo ?? "",
        ...patch,
      },
    }));
  }

  function addProducto() {
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const newRow: ProductoRow = {
      id: tmpId,
      nombre: "",
      unidad: "kg",
      stock_actual: null,
      coste_unitario: null,
      stock_minimo: null,
    };
    setItems((prev) => [newRow, ...prev]);
    setDrafts((prev) => ({
      ...prev,
      [String(tmpId)]: { nombre: "", unidad: "kg", stock_actual: "", coste_unitario: "", stock_minimo: "" },
    }));
  }

  async function guardarFila(id: string | number) {
    const key = String(id);
    setError(null);
    setSavingById((prev) => ({ ...prev, [key]: true }));

    try {
      const draft = drafts[key] ?? { nombre: "", unidad: "kg", stock_actual: "", coste_unitario: "", stock_minimo: "" };
      const payload = {
        nombre: draft.nombre.trim() || null,
        unidad: (draft.unidad || "kg").trim(),
        stock_actual: parseNumber(draft.stock_actual, 0),
        coste_unitario: parseNumber(draft.coste_unitario, 0),
        stock_minimo: parseNumber(draft.stock_minimo, 0),
      };

      // Modo mock: solo memoria
      if (usingMock) {
        setItems((prev) =>
          prev.map((r) =>
            String(r.id) === key
              ? {
                  ...r,
                  ...payload,
                  stock_actual: roundTo(payload.stock_actual, 3),
                  coste_unitario: roundTo(payload.coste_unitario, 2),
                  stock_minimo: roundTo(payload.stock_minimo, 3),
                }
              : r,
          ),
        );
        return;
      }

      // Supabase: insert si tmp_ / update si existente
      if (key.startsWith("tmp_")) {
        const { data, error } = await supabase
          .from("inventario_productos")
          .insert(payload)
          .select("id, nombre, unidad, stock_actual, coste_unitario, stock_minimo")
          .maybeSingle();
        if (error) throw error;

        const inserted = (data ?? null) as ProductoRow | null;
        if (!inserted) throw new Error("No se pudo crear el producto.");

        setItems((prev) => prev.map((r) => (String(r.id) === key ? inserted : r)));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          next[String(inserted.id)] = {
            nombre: inserted.nombre ?? "",
            unidad: inserted.unidad ?? "kg",
            stock_actual: inserted.stock_actual == null ? "" : String(roundTo(inserted.stock_actual, 3)),
            coste_unitario: inserted.coste_unitario == null ? "" : String(roundTo(inserted.coste_unitario, 2)),
            stock_minimo: inserted.stock_minimo == null ? "" : String(roundTo(inserted.stock_minimo, 3)),
          };
          return next;
        });
        return;
      }

      const { error } = await supabase.from("inventario_productos").update(payload).eq("id", id);
      if (error) throw error;

      setItems((prev) =>
        prev.map((r) =>
          String(r.id) === key
            ? {
                ...r,
                ...payload,
                stock_actual: roundTo(payload.stock_actual, 3),
                coste_unitario: roundTo(payload.coste_unitario, 2),
                stock_minimo: roundTo(payload.stock_minimo, 3),
              }
            : r,
        ),
      );
    } catch (e) {
      // fallback seguro: no rompemos la pantalla
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function eliminarFila(id: string | number) {
    const key = String(id);
    setError(null);
    setDeletingById((prev) => ({ ...prev, [key]: true }));

    try {
      if (usingMock || key.startsWith("tmp_")) {
        setItems((prev) => prev.filter((r) => String(r.id) !== key));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }

      const { error } = await supabase.from("inventario_productos").delete().eq("id", id);
      if (error) throw error;

      setItems((prev) => prev.filter((r) => String(r.id) !== key));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  const rowsForRender = useMemo(() => items, [items]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 650, margin: 0 }}>Inventario</h1>
          <p style={{ margin: "6px 0 0", color: "rgba(0,0,0,0.65)" }}>
            Gestiona stock, coste unitario y stock mínimo de tus productos.
          </p>
        </div>
        <button
          onClick={cargar}
          type="button"
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            background: "white",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(220, 38, 38, 0.35)",
            background: "rgba(220, 38, 38, 0.06)",
            color: "rgb(153, 27, 27)",
            padding: "10px 12px",
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {usingMock ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(234, 179, 8, 0.35)",
            background: "rgba(234, 179, 8, 0.10)",
            color: "rgba(0,0,0,0.78)",
            padding: "10px 12px",
            borderRadius: 12,
          }}
        >
          Mostrando datos de ejemplo: no se pudo cargar la tabla <code>inventario_productos</code> en Supabase.
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button
          onClick={addProducto}
          type="button"
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            background: "white",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Añadir producto
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 14,
          overflow: "hidden",
          background: "white",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {[
                { label: "Nombre", align: "left", width: undefined },
                { label: "Unidad", align: "left", width: 120 },
                { label: "Stock actual", align: "right", width: 150 },
                { label: "Coste unitario (€)", align: "right", width: 170 },
                { label: "Stock mínimo", align: "right", width: 150 },
                { label: "Guardar", align: "right", width: 140 },
                { label: "Eliminar", align: "right", width: 140 },
              ].map((h) => (
                <th
                  key={h.label}
                  style={{
                    textAlign: h.align as "left" | "right",
                    fontWeight: 600,
                    padding: "12px 14px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    background: "rgba(0,0,0,0.02)",
                    width: h.width,
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rowsForRender.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: "rgba(0,0,0,0.65)" }}>
                  {loading ? "Cargando productos..." : "No hay productos en inventario."}
                </td>
              </tr>
            ) : (
              rowsForRender.map((item) => {
                const key = String(item.id);
                const draft = drafts[key] ?? {
                  nombre: item.nombre ?? "",
                  unidad: item.unidad ?? "kg",
                  stock_actual: item.stock_actual == null ? "" : String(roundTo(item.stock_actual, 3)),
                  coste_unitario: item.coste_unitario == null ? "" : String(roundTo(item.coste_unitario, 2)),
                  stock_minimo: item.stock_minimo == null ? "" : String(roundTo(item.stock_minimo, 3)),
                };

                return (
                  <tr key={key}>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <input
                        value={draft.nombre}
                        onChange={(e) => updateDraft(item.id, { nombre: e.target.value })}
                        placeholder={item.nombre ?? "Producto"}
                        aria-label="Nombre"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                          fontWeight: 550,
                        }}
                      />
                    </td>

                    <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <select
                        value={draft.unidad}
                        onChange={(e) => updateDraft(item.id, { unidad: e.target.value })}
                        aria-label="Unidad"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                          background: "white",
                        }}
                      >
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={draft.stock_actual}
                        onChange={(e) => updateDraft(item.id, { stock_actual: e.target.value })}
                        placeholder={item.stock_actual == null ? "" : String(roundTo(item.stock_actual, 3))}
                        aria-label="Stock actual"
                        style={{
                          width: "100%",
                          maxWidth: 120,
                          textAlign: "right",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.coste_unitario}
                        onChange={(e) => updateDraft(item.id, { coste_unitario: e.target.value })}
                        placeholder={item.coste_unitario == null ? "" : formatMoney2(item.coste_unitario)}
                        aria-label="Coste unitario"
                        style={{
                          width: "100%",
                          maxWidth: 140,
                          textAlign: "right",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={draft.stock_minimo}
                        onChange={(e) => updateDraft(item.id, { stock_minimo: e.target.value })}
                        placeholder={item.stock_minimo == null ? "" : String(roundTo(item.stock_minimo, 3))}
                        aria-label="Stock mínimo"
                        style={{
                          width: "100%",
                          maxWidth: 120,
                          textAlign: "right",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                        }}
                      />
                    </td>

                    <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", textAlign: "right" }}>
                      <button
                        onClick={() => guardarFila(item.id)}
                        type="button"
                        disabled={Boolean(savingById[key])}
                        style={{
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: savingById[key] ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.02)",
                          padding: "8px 12px",
                          borderRadius: 10,
                          cursor: savingById[key] ? "not-allowed" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {savingById[key] ? "Guardando..." : "Guardar"}
                      </button>
                    </td>

                    <td style={{ padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", textAlign: "right" }}>
                      <button
                        onClick={() => eliminarFila(item.id)}
                        type="button"
                        disabled={Boolean(deletingById[key])}
                        style={{
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: deletingById[key] ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.02)",
                          padding: "8px 12px",
                          borderRadius: 10,
                          cursor: deletingById[key] ? "not-allowed" : "pointer",
                          fontWeight: 650,
                        }}
                      >
                        {deletingById[key] ? "Eliminando..." : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

