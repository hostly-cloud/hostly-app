"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";
import { supabase } from "@/lib/supabase";
import { fetchInventarioProductos, type InventarioProducto } from "@/lib/inventario-productos";

type Escandallo = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

type IngredientRow = {
  id: string;
  ingrediente: string;
  cantidad_usada: number;
  unidad: string;
  coste_unitario: number;
  inventario_producto_id?: string | number | null;
};

type IngredientDraftRow = {
  id: string;
  ingrediente: string;
  cantidad_usada: string;
  unidad: string;
  coste_unitario: string;
  inventario_producto_id: string;
  isNew?: boolean;
};

const ING_SELECT_WITH_INV = "id, ingrediente, cantidad_usada, unidad, coste_unitario, inventario_producto_id";
const ING_SELECT_BASIC = "id, ingrediente, cantidad_usada, unidad, coste_unitario";

function isMissingInventarioFkError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("inventario_producto_id") || m.includes("schema cache");
}

function parseInventarioProductoId(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function draftFromIngredientRow(r: IngredientRow): IngredientDraftRow {
  const inv =
    r.inventario_producto_id == null || r.inventario_producto_id === ""
      ? ""
      : String(r.inventario_producto_id);
  return {
    id: String(r.id),
    ingrediente: r.ingrediente,
    cantidad_usada: String(r.cantidad_usada),
    unidad: r.unidad,
    coste_unitario: String(r.coste_unitario),
    inventario_producto_id: inv,
  };
}

function costeUnitarioStringFromProducto(p: InventarioProducto): string {
  const cu = p.coste_unitario;
  if (cu == null || !Number.isFinite(cu)) return "";
  const rounded = Math.round((cu + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2);
}

const ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY = "hostly.escandallos.coste_total_override.v1";

function formatMoneyOrDash(value: number | null | undefined): string {
  if (value == null) return "-";
  if (!Number.isFinite(value)) return "-";
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2);
}

function formatMarginOrDash(costeTotal: number | null, precioVenta: number | null): string {
  if (precioVenta == null || precioVenta === 0) return "-";
  if (costeTotal == null) return "-";
  const m = ((precioVenta - costeTotal) / precioVenta) * 100;
  if (!Number.isFinite(m)) return "-";
  return `${m.toFixed(1)}%`;
}

function safeNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function setLocalCosteTotalOverride(id: string | number, coste_total: number) {
  try {
    const raw = localStorage.getItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[String(id)] = coste_total;
    localStorage.setItem(ESCANDALLOS_COSTE_OVERRIDE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // noop (best-effort fallback)
  }
}

function mockIngredientsForEscandallo(id: string): IngredientRow[] {
  // Mock minimal y estable para no bloquear el módulo si faltan relaciones en Supabase.
  // Se puede reemplazar por tabla real más adelante.
  if (id === "1") {
    return [
      { id: "m1", ingrediente: "Arroz bomba", cantidad_usada: 0.12, unidad: "kg", coste_unitario: 3.8 },
      { id: "m2", ingrediente: "Caldo", cantidad_usada: 0.35, unidad: "l", coste_unitario: 1.1 },
      { id: "m3", ingrediente: "Pollo", cantidad_usada: 0.18, unidad: "kg", coste_unitario: 6.4 },
    ];
  }

  return [
    { id: "m1", ingrediente: "Ingrediente A", cantidad_usada: 1, unidad: "uds", coste_unitario: 0.35 },
    { id: "m2", ingrediente: "Ingrediente B", cantidad_usada: 0.25, unidad: "kg", coste_unitario: 4.2 },
    { id: "m3", ingrediente: "Ingrediente C", cantidad_usada: 0.1, unidad: "l", coste_unitario: 2.6 },
  ];
}

export default function EscandalloDetallePage() {
  const params = useParams();
  const id =
    typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] ?? "" : "";
  const idNum = id !== "" ? Number(id) : NaN;
  const idOk = Number.isFinite(idNum) && idNum > 0;

  const [plato, setPlato] = useState<Escandallo | null>(null);
  const [ingredientes, setIngredientes] = useState<IngredientDraftRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [inventarioProductos, setInventarioProductos] = useState<InventarioProducto[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { productos } = await fetchInventarioProductos();
      if (alive) setInventarioProductos(productos);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function cargar() {
      if (!idOk) {
        setError(null);
        setPlato(null);
        setIngredientes([]);
        setDeletedIds([]);
        setUsingMock(false);
        setSaveMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setUsingMock(false);
      setSaveMsg(null);

      try {
        const { data: platoData, error: platoError } = await supabase
          .from("escandallos")
          .select("id, nombre_plato, coste_total, precio_venta")
          .eq("id", idNum)
          .maybeSingle();

        if (!alive) return;

        if (platoError) {
          setError(platoError.message);
          setPlato(null);
          setIngredientes([]);
          setDeletedIds([]);
          return;
        }

        const platoRow = (platoData ?? null) as Escandallo | null;
        setPlato(platoRow);

        // Intento de carga de ingredientes. Si la tabla/relación no existe aún, se usa mock.
        const ingFirst = await supabase
          .from("escandallo_ingredientes")
          .select(ING_SELECT_WITH_INV)
          .eq("escandallo_id", idNum)
          .order("ingrediente", { ascending: true, nullsFirst: false });

        let ingData: IngredientRow[] | null = ingFirst.data as IngredientRow[] | null;
        let ingError = ingFirst.error;
        if (ingFirst.error && isMissingInventarioFkError(ingFirst.error)) {
          const ingSecond = await supabase
            .from("escandallo_ingredientes")
            .select(ING_SELECT_BASIC)
            .eq("escandallo_id", idNum)
            .order("ingrediente", { ascending: true, nullsFirst: false });
          ingData = ingSecond.data as IngredientRow[] | null;
          ingError = ingSecond.error;
        }

        if (!alive) return;

        if (ingError) {
          setUsingMock(true);
          const rows = mockIngredientsForEscandallo(String(idNum));
          setIngredientes(rows.map((r) => draftFromIngredientRow(r)));
          setDeletedIds([]);
          return;
        }

        const rows = ((ingData ?? []) as IngredientRow[]).map((r) => draftFromIngredientRow(r));

        if (rows.length) {
          setIngredientes(rows);
          setUsingMock(false);
          setDeletedIds([]);
        } else {
          setIngredientes(mockIngredientsForEscandallo(String(idNum)).map((r) => draftFromIngredientRow(r)));
          setUsingMock(true);
          setDeletedIds([]);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error inesperado");
        setPlato(null);
        setIngredientes([]);
        setDeletedIds([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    cargar();
    return () => {
      alive = false;
    };
  }, [idOk, idNum]);

  function updateIngredientRow(rowId: string, patch: Partial<IngredientDraftRow>) {
    setIngredientes((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  function onSelectProductoInventario(rowId: string, productId: string) {
    if (!productId) {
      updateIngredientRow(rowId, { inventario_producto_id: "" });
      return;
    }
    const p = inventarioProductos.find((x) => String(x.id) === productId);
    if (!p) return;
    updateIngredientRow(rowId, {
      inventario_producto_id: String(p.id),
      ingrediente: p.nombre ?? "",
      unidad: (p.unidad ?? "kg").trim() || "kg",
      coste_unitario: costeUnitarioStringFromProducto(p),
    });
  }

  function addIngredientRow() {
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setIngredientes((prev) => [
      ...prev,
      {
        id: tmpId,
        ingrediente: "",
        cantidad_usada: "",
        unidad: "kg",
        coste_unitario: "",
        inventario_producto_id: "",
        isNew: true,
      },
    ]);
  }

  function removeIngredientRow(rowId: string) {
    setIngredientes((prev) => prev.filter((r) => r.id !== rowId));
    if (!rowId.startsWith("tmp_")) {
      setDeletedIds((prev) => (prev.includes(rowId) ? prev : [...prev, rowId]));
    }
  }

  async function guardarCambios() {
    setSaveMsg(null);
    setError(null);

    if (!idOk) {
      setSaveMsg("Escandallo no encontrado");
      return;
    }

    const costeTotalParaGuardar = ingredientes.reduce((acc, r) => {
      const cantidad = parseNullableNumber(r.cantidad_usada) ?? 0;
      const unit = parseNullableNumber(r.coste_unitario) ?? 0;
      return acc + cantidad * unit;
    }, 0);

    if (usingMock) {
      setPlato((prev) => (prev ? { ...prev, coste_total: costeTotalParaGuardar } : prev));
      setLocalCosteTotalOverride(idNum, costeTotalParaGuardar);
      setSaveMsg("Cambios guardados (modo ejemplo).");
      return;
    }

    setSaving(true);
    try {
      const toDelete = deletedIds;
      const existing = ingredientes.filter((r) => !r.id.startsWith("tmp_"));
      const created = ingredientes.filter((r) => r.id.startsWith("tmp_"));

      // Deletes
      if (toDelete.length) {
        const { error: delErr } = await supabase.from("escandallo_ingredientes").delete().in("id", toDelete);
        if (delErr) throw delErr;
      }

      // Updates (solo si la fila tiene datos numéricos válidos; si no, se guarda null y Supabase decide)
      for (const r of existing) {
        const cantidad = parseNullableNumber(r.cantidad_usada);
        const coste = parseNullableNumber(r.coste_unitario);
        const fk = parseInventarioProductoId(r.inventario_producto_id);
        const base = {
          ingrediente: r.ingrediente.trim() || null,
          cantidad_usada: cantidad,
          unidad: r.unidad,
          coste_unitario: coste,
        };

        let updRes = await supabase
          .from("escandallo_ingredientes")
          .update({ ...base, inventario_producto_id: fk })
          .eq("id", r.id);

        if (updRes.error && isMissingInventarioFkError(updRes.error)) {
          updRes = await supabase.from("escandallo_ingredientes").update(base).eq("id", r.id);
        }

        if (updRes.error) throw updRes.error;
      }

      // Inserts
      if (created.length) {
        const buildPayload = (includeFk: boolean) =>
          created.map((r) => {
            const row: Record<string, unknown> = {
              escandallo_id: idNum,
              ingrediente: r.ingrediente.trim() || null,
              cantidad_usada: parseNullableNumber(r.cantidad_usada),
              unidad: r.unidad,
              coste_unitario: parseNullableNumber(r.coste_unitario),
            };
            if (includeFk) row.inventario_producto_id = parseInventarioProductoId(r.inventario_producto_id);
            return row;
          });

        let insRes = await supabase.from("escandallo_ingredientes").insert(buildPayload(true));
        if (insRes.error && isMissingInventarioFkError(insRes.error)) {
          insRes = await supabase.from("escandallo_ingredientes").insert(buildPayload(false));
        }
        if (insRes.error) throw insRes.error;
      }

      // Reload para recuperar IDs reales y estado consistente
      const reloadFirst = await supabase
        .from("escandallo_ingredientes")
        .select(ING_SELECT_WITH_INV)
        .eq("escandallo_id", idNum)
        .order("ingrediente", { ascending: true, nullsFirst: false });

      let ingData: IngredientRow[] | null = reloadFirst.data as IngredientRow[] | null;
      let ingError = reloadFirst.error;
      if (reloadFirst.error && isMissingInventarioFkError(reloadFirst.error)) {
        const reloadSecond = await supabase
          .from("escandallo_ingredientes")
          .select(ING_SELECT_BASIC)
          .eq("escandallo_id", idNum)
          .order("ingrediente", { ascending: true, nullsFirst: false });
        ingData = reloadSecond.data as IngredientRow[] | null;
        ingError = reloadSecond.error;
      }

      if (ingError) throw ingError;

      const rows = ((ingData ?? []) as IngredientRow[]).map((r) => draftFromIngredientRow(r));

      setIngredientes(rows);
      setDeletedIds([]);
      setPlato((prev) => (prev ? { ...prev, coste_total: costeTotalParaGuardar } : prev));

      const { error: upCostErr } = await supabase
        .from("escandallos")
        .update({ coste_total: costeTotalParaGuardar })
        .eq("id", idNum);

      if (upCostErr) {
        setLocalCosteTotalOverride(idNum, costeTotalParaGuardar);
        setSaveMsg("Ingredientes guardados. No se pudo actualizar el coste total en Supabase.");
        return;
      }

      setSaveMsg("Cambios guardados.");
    } catch (e) {
      // Si el guardado falla (tabla inexistente / permisos / etc), volvemos a modo mock sin romper UX.
      setUsingMock(true);
      setPlato((prev) => (prev ? { ...prev, coste_total: costeTotalParaGuardar } : prev));
      setLocalCosteTotalOverride(idNum, costeTotalParaGuardar);
      setSaveMsg("No se pudo guardar en Supabase. Sigues en modo ejemplo.");
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const draftRowsForCalc = ingredientes;
  const costeTotalCalculado = useMemo(() => {
    return draftRowsForCalc.reduce((acc, r) => {
      const cantidad = parseNullableNumber(r.cantidad_usada) ?? 0;
      const unit = parseNullableNumber(r.coste_unitario) ?? 0;
      return acc + cantidad * unit;
    }, 0);
  }, [draftRowsForCalc]);

  const costeTotalActual = plato?.coste_total ?? null;
  const precioVentaActual = plato?.precio_venta ?? null;
  const margen = formatMarginOrDash(costeTotalActual, precioVentaActual);

  return (
    <ModulePageShell
      backHref="/dashboard/escandallos"
      backLabel="← Volver a escandallos"
      title={
        loading ? "Cargando..." : idOk ? plato?.nombre_plato ?? "Escandallo no encontrado" : "Escandallo no encontrado"
      }
      subtitle="Coste calculado por ingredientes y comparación con el coste/venta actuales."
      maxWidth={1100}
      headerRight={
        <button
          onClick={() => window.location.reload()}
          type="button"
          style={{
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f8fafc",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Recargar
        </button>
      }
    >
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

      {!loading && !error && (!idOk || !plato) ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(0,0,0,0.02)",
            color: "rgba(0,0,0,0.72)",
            padding: "10px 12px",
            borderRadius: 12,
          }}
        >
          Escandallo no encontrado
        </div>
      ) : null}

      {saveMsg ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(0,0,0,0.02)",
            color: "rgba(0,0,0,0.72)",
            padding: "10px 12px",
            borderRadius: 12,
          }}
        >
          {saveMsg}
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
          Mostrando datos de ejemplo: aún no hay ingredientes conectados en Supabase para este plato.
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            background: "white",
            padding: 14,
          }}
        >
          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: 12, fontWeight: 650 }}>Coste total actual</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyOrDash(costeTotalActual)} €
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            background: "white",
            padding: 14,
          }}
        >
          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: 12, fontWeight: 650 }}>Precio de venta actual</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyOrDash(precioVentaActual)} €
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            background: "white",
            padding: 14,
          }}
        >
          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: 12, fontWeight: 650 }}>Margen</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {margen}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            background: "white",
            padding: 14,
          }}
        >
          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: 12, fontWeight: 650 }}>Coste total calculado</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatMoneyOrDash(costeTotalCalculado)} €
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 14,
          overflow: "hidden",
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ fontWeight: 650 }}>Ingredientes</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={addIngredientRow}
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
              + Añadir ingrediente
            </button>
            <button
              onClick={guardarCambios}
              type="button"
              disabled={saving || loading || !idOk || !plato}
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                background: saving ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.02)",
                padding: "8px 12px",
                borderRadius: 10,
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {[
                { label: "Producto inventario", align: "left", width: 200 },
                { label: "Ingrediente", align: "left", width: undefined },
                { label: "Cantidad usada", align: "right", width: 160 },
                { label: "Unidad", align: "left", width: 120 },
                { label: "Coste unitario (€)", align: "right", width: 170 },
                { label: "Coste usado (€)", align: "right", width: 170 },
                { label: "Eliminar", align: "right", width: 120 },
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
            {ingredientes.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: "rgba(0,0,0,0.65)" }}>
                  {loading ? "Cargando ingredientes..." : "No hay ingredientes para este plato."}
                </td>
              </tr>
            ) : (
              ingredientes.map((r) => {
                const cantidadN = parseNullableNumber(r.cantidad_usada) ?? 0;
                const unitN = parseNullableNumber(r.coste_unitario) ?? 0;
                const usado = cantidadN * unitN;

                return (
                  <tr key={r.id}>
                    <td style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <select
                        value={r.inventario_producto_id}
                        onChange={(e) => onSelectProductoInventario(r.id, e.target.value)}
                        aria-label="Producto inventario"
                        style={{
                          width: "100%",
                          maxWidth: 220,
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                          background: "white",
                        }}
                      >
                        <option value="">— Manual / sin vincular</option>
                        {inventarioProductos.map((p) => (
                          <option key={String(p.id)} value={String(p.id)}>
                            {p.nombre ?? `Producto ${p.id}`}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <input
                        value={r.ingrediente}
                        onChange={(e) => updateIngredientRow(r.id, { ingrediente: e.target.value })}
                        placeholder="Ingrediente"
                        aria-label="Ingrediente"
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
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={r.cantidad_usada}
                        onChange={(e) => updateIngredientRow(r.id, { cantidad_usada: e.target.value })}
                        placeholder="0"
                        aria-label="Cantidad usada"
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
                    <td style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <input
                        value={r.unidad}
                        onChange={(e) => updateIngredientRow(r.id, { unidad: e.target.value })}
                        placeholder="kg"
                        aria-label="Unidad"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          outline: "none",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={r.coste_unitario}
                        onChange={(e) => updateIngredientRow(r.id, { coste_unitario: e.target.value })}
                        placeholder="0.00"
                        aria-label="Coste unitario"
                        style={{
                          width: "100%",
                          maxWidth: 150,
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
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 650,
                      }}
                    >
                      {formatMoneyOrDash(usado)}
                    </td>
                    <td style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", textAlign: "right" }}>
                      <button
                        onClick={() => removeIngredientRow(r.id)}
                        type="button"
                        style={{
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: "rgba(0,0,0,0.02)",
                          padding: "8px 12px",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontWeight: 650,
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: "12px 14px",
                  textAlign: "right",
                  fontWeight: 700,
                  background: "rgba(0,0,0,0.02)",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                Coste total calculado
              </td>
              <td
                style={{
                  padding: "12px 14px",
                  textAlign: "right",
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  background: "rgba(0,0,0,0.02)",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                {formatMoneyOrDash(costeTotalCalculado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ModulePageShell>
  );
}

