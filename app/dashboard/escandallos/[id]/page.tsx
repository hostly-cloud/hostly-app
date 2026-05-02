"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";
import { useI18n } from "@/components/i18n-provider";
import { supabase } from "@/lib/supabase";

type Escandallo = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

/** Fila en public.escandallo_ingredientes */
type EscandalloIngredienteRow = {
  id: string | number;
  escandallo_id: number;
  producto_id: number;
  cantidad: number;
  unidad: string;
  created_at?: string;
};

/** public.productos — columnas de coste opcionales según esquema real */
type ProductoRow = {
  id: number | string;
  nombre?: string | null;
  unidad?: string | null;
  coste_unitario?: unknown;
  coste?: unknown;
  precio_compra?: unknown;
  precio_coste?: unknown;
};

type IngredientDraftRow = {
  clientRowId: string;
  producto_id: string;
  cantidad: string;
  unidad: string;
};

const ING_SELECT = "id, escandallo_id, producto_id, cantidad, unidad, created_at";

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

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseProductoId(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function unitCostFromProductoRow(p: ProductoRow | undefined): number | null {
  if (!p) return null;
  const raw = p.coste_unitario ?? p.coste ?? p.precio_compra ?? p.precio_coste;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dbRowsToDraft(rows: EscandalloIngredienteRow[]): IngredientDraftRow[] {
  return rows.map((row) => ({
    clientRowId: `db-${String(row.id)}`,
    producto_id: String(row.producto_id),
    cantidad: String(row.cantidad),
    unidad: row.unidad ?? "",
  }));
}

function classifyRows(rows: IngredientDraftRow[]): {
  incomplete: boolean;
  valid: { producto_id: number; cantidad: number; unidad: string }[];
} {
  const valid: { producto_id: number; cantidad: number; unidad: string }[] = [];
  for (const r of rows) {
    const pid = parseProductoId(r.producto_id);
    const qty = parseNullableNumber(r.cantidad);
    const u = r.unidad.trim();
    const empty = !pid && !r.cantidad.trim() && !u;
    if (empty) continue;
    if (!pid || qty == null || qty <= 0 || !u) {
      return { incomplete: true, valid: [] };
    }
    valid.push({ producto_id: pid, cantidad: qty, unidad: u });
  }
  return { incomplete: false, valid };
}

function lineCostEuro(r: IngredientDraftRow, byId: Map<number, ProductoRow>): number {
  const qty = parseNullableNumber(r.cantidad) ?? 0;
  const pid = parseProductoId(r.producto_id);
  if (!pid || qty <= 0) return 0;
  const uc = unitCostFromProductoRow(byId.get(pid));
  if (uc == null) return 0;
  return qty * uc;
}

async function fetchProductosCatalog(): Promise<{ productos: ProductoRow[]; errorMessage: string | null }> {
  if (!supabase) return { productos: [], errorMessage: null };

  const selectors = ["id, nombre, unidad, coste_unitario", "id, nombre, unidad, coste", "id, nombre, unidad"];
  let lastMsg: string | null = null;
  for (const sel of selectors) {
    const { data, error } = await supabase
      .from("productos")
      .select(sel)
      .order("nombre", { ascending: true, nullsFirst: false });
    if (!error) return { productos: (data ?? []) as unknown as ProductoRow[], errorMessage: null };
    lastMsg = error.message;
  }
  return { productos: [], errorMessage: lastMsg };
}

export default function EscandalloDetallePage() {
  const { t } = useI18n();
  const params = useParams();
  const id =
    typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] ?? "" : "";
  const idNum = id !== "" ? Number(id) : NaN;
  const idOk = Number.isFinite(idNum) && idNum > 0;

  const [plato, setPlato] = useState<Escandallo | null>(null);
  const [ingredientes, setIngredientes] = useState<IngredientDraftRow[]>([]);
  const [productosCatalog, setProductosCatalog] = useState<ProductoRow[]>([]);
  const [productosCatalogError, setProductosCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const productosById = useMemo(() => {
    const m = new Map<number, ProductoRow>();
    for (const p of productosCatalog) {
      const n = Number(p.id);
      if (Number.isFinite(n)) m.set(n, p);
    }
    return m;
  }, [productosCatalog]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { productos, errorMessage } = await fetchProductosCatalog();
      if (!alive) return;
      setProductosCatalog(productos);
      setProductosCatalogError(errorMessage);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadIngredientes = useCallback(async (): Promise<{ ok: boolean; rows: IngredientDraftRow[] }> => {
    if (!supabase) return { ok: true, rows: [] };

    const { data, error: ingError } = await supabase
      .from("escandallo_ingredientes")
      .select(ING_SELECT)
      .eq("escandallo_id", idNum)
      .order("created_at", { ascending: true });
    if (ingError) {
      return { ok: false, rows: [] };
    }
    return { ok: true, rows: dbRowsToDraft((data ?? []) as EscandalloIngredienteRow[]) };
  }, [idNum]);

  useEffect(() => {
    let alive = true;

    async function cargar() {
      if (!idOk) {
        setError(null);
        setPlato(null);
        setIngredientes([]);
        setSaveMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSaveMsg(null);

      try {
        if (!supabase) {
          setError("Supabase no configurado");
          setPlato(null);
          setIngredientes([]);
          return;
        }

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
          return;
        }

        const platoRow = (platoData ?? null) as Escandallo | null;
        setPlato(platoRow);

        const { data: ingData, error: ingError } = await supabase
          .from("escandallo_ingredientes")
          .select(ING_SELECT)
          .eq("escandallo_id", idNum)
          .order("created_at", { ascending: true });

        if (!alive) return;

        if (ingError) {
          setError(ingError.message);
          setIngredientes([]);
          return;
        }

        setIngredientes(dbRowsToDraft((ingData ?? []) as EscandalloIngredienteRow[]));
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : t("escandalloDetail.unexpectedError"));
        setPlato(null);
        setIngredientes([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    cargar();
    return () => {
      alive = false;
    };
  }, [idOk, idNum, t]);

  function updateIngredientRow(rowId: string, patch: Partial<IngredientDraftRow>) {
    setIngredientes((prev) => prev.map((r) => (r.clientRowId === rowId ? { ...r, ...patch } : r)));
  }

  function onSelectProducto(rowId: string, productId: string) {
    if (!productId) {
      updateIngredientRow(rowId, { producto_id: "" });
      return;
    }
    const n = Number(productId);
    const p = Number.isFinite(n) ? productosById.get(n) : undefined;
    setIngredientes((prev) =>
      prev.map((r) => {
        if (r.clientRowId !== rowId) return r;
        const nextUnidad =
          r.unidad.trim() || (p?.unidad && String(p.unidad).trim()) || "kg";
        return { ...r, producto_id: productId, unidad: nextUnidad };
      }),
    );
  }

  function addIngredientRow() {
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setIngredientes((prev) => [
      ...prev,
      {
        clientRowId: tmpId,
        producto_id: "",
        cantidad: "",
        unidad: "",
      },
    ]);
  }

  function removeIngredientRow(rowId: string) {
    setIngredientes((prev) => prev.filter((r) => r.clientRowId !== rowId));
  }

  function nombreProductoDisplay(productoId: string): string {
    const pid = parseProductoId(productoId);
    if (pid == null) return "—";
    const p = productosById.get(pid);
    return p?.nombre?.trim() || t("escandalloDetail.unknownProductName", { id: pid });
  }

  async function guardarCambios() {
    setSaveMsg(null);
    setError(null);

    if (!idOk) {
      setSaveMsg(t("escandalloDetail.msgSaveNotFound"));
      return;
    }

    const { incomplete, valid } = classifyRows(ingredientes);
    if (incomplete) {
      setError(t("escandalloDetail.errorRowIncomplete"));
      return;
    }

    const costeTotalParaGuardar = ingredientes.reduce((acc, r) => acc + lineCostEuro(r, productosById), 0);

    setSaving(true);
    try {
      if (!supabase) {
        setError("Supabase no configurado");
        return;
      }

      const { error: delErr } = await supabase.from("escandallo_ingredientes").delete().eq("escandallo_id", idNum);
      if (delErr) throw delErr;

      if (valid.length > 0) {
        const payload = valid.map((v) => ({
          escandallo_id: idNum,
          producto_id: v.producto_id,
          cantidad: v.cantidad,
          unidad: v.unidad,
        }));
        const { error: insErr } = await supabase.from("escandallo_ingredientes").insert(payload);
        if (insErr) throw insErr;
      }

      const reloaded = await loadIngredientes();
      if (!reloaded.ok) {
        throw new Error(t("escandalloDetail.errorReloadIngredients"));
      }
      setIngredientes(reloaded.rows);

      const { error: upCostErr } = await supabase
        .from("escandallos")
        .update({ coste_total: costeTotalParaGuardar })
        .eq("id", idNum);

      if (upCostErr) {
        setError(`${t("escandalloDetail.errorUpdateCosteTotal")} ${upCostErr.message}`);
        setSaveMsg(t("escandalloDetail.msgIngredientsSavedCostUpdateFail"));
        return;
      }

      setPlato((prev) => (prev ? { ...prev, coste_total: costeTotalParaGuardar } : prev));
      setSaveMsg(t("escandalloDetail.msgSaved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("escandalloDetail.errorSave");
      setError(msg);
      setSaveMsg(null);
    } finally {
      setSaving(false);
    }
  }

  const costeTotalCalculado = useMemo(
    () => ingredientes.reduce((acc, r) => acc + lineCostEuro(r, productosById), 0),
    [ingredientes, productosById],
  );

  const costeTotalActual = plato?.coste_total ?? null;
  const precioVentaActual = plato?.precio_venta ?? null;
  const margenEstimado = formatMarginOrDash(costeTotalCalculado, precioVentaActual);

  const inputDark = {
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const selectDark = {
    ...inputDark,
    cursor: "pointer" as const,
  };

  return (
    <ModulePageShell
      backHref="/dashboard/escandallos"
      backLabel={
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#93c5fd",
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
        >
          {t("escandalloDetail.backToList")}
        </span>
      }
      title={
        loading
          ? t("common.loading")
          : idOk
            ? plato?.nombre_plato ?? t("escandalloDetail.notFoundTitle")
            : t("escandalloDetail.notFoundTitle")
      }
      subtitle={t("escandalloDetail.subtitle")}
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
          {t("common.reload")}
        </button>
      }
    >
      {productosCatalogError ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(234, 179, 8, 0.45)",
            background: "rgba(234, 179, 8, 0.12)",
            color: "#fef08a",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          {t("escandalloDetail.errorLoadProductos")}: {productosCatalogError}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(248, 113, 113, 0.45)",
            background: "rgba(127, 29, 29, 0.35)",
            color: "#fecaca",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && (!idOk || !plato) ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#cbd5e1",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 15,
          }}
        >
          {t("escandalloDetail.notFoundBody")}
        </div>
      ) : null}

      {saveMsg ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#e2e8f0",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 14,
          }}
        >
          {saveMsg}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: 14,
        }}
      >
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 16,
            background: "#1e293b",
            padding: "16px 18px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 650, letterSpacing: "0.02em" }}>
            {t("escandalloDetail.costeRegistrado")}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "#f8fafc",
            }}
          >
            {formatMoneyOrDash(costeTotalActual)} €
          </div>
        </div>

        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 16,
            background: "#1e293b",
            padding: "16px 18px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 650, letterSpacing: "0.02em" }}>
            {t("escandalloDetail.precioVenta")}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "#f8fafc",
            }}
          >
            {formatMoneyOrDash(precioVentaActual)} €
          </div>
        </div>

        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 16,
            background: "#1e293b",
            padding: "16px 18px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 650, letterSpacing: "0.02em" }}>
            {t("escandalloDetail.margenEstimado")}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "#86efac",
            }}
          >
            {margenEstimado}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 16,
            background: "#1e293b",
            padding: "16px 18px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 650, letterSpacing: "0.02em" }}>
            {t("escandalloDetail.costePorIngredientes")}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "#fde68a",
            }}
          >
            {formatMoneyOrDash(costeTotalCalculado)} €
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          border: "1px solid #334155",
          borderRadius: 16,
          overflow: "hidden",
          background: "#1e293b",
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid #334155",
            background: "#0f172a",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 17, color: "#f8fafc" }}>{t("escandalloDetail.ingredients")}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={addIngredientRow}
              type="button"
              style={{
                border: "1px solid #334155",
                background: "#1e293b",
                color: "#e2e8f0",
                padding: "9px 14px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {t("escandalloDetail.addIngredient")}
            </button>
            <button
              onClick={guardarCambios}
              type="button"
              disabled={saving || loading || !idOk || !plato || Boolean(productosCatalogError)}
              style={{
                border: "none",
                background: saving ? "#166534" : "#22c55e",
                color: "#ffffff",
                padding: "9px 16px",
                borderRadius: 10,
                cursor: saving || loading || !idOk || !plato || productosCatalogError ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 14,
                opacity: saving || loading || !idOk || !plato || productosCatalogError ? 0.65 : 1,
              }}
            >
              {saving ? t("common.saving") : t("common.saveChanges")}
            </button>
          </div>
        </div>

        <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch", background: "#1e293b" }}>
          <table style={{ width: "100%", minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {[
                  { label: t("escandalloDetail.colProduct"), align: "left", width: 200 },
                  { label: t("escandalloDetail.colIngredient"), align: "left", width: undefined },
                  { label: t("escandalloDetail.colQtyUsed"), align: "right", width: 140 },
                  { label: t("escandalloDetail.colUnit"), align: "left", width: 110 },
                  { label: t("escandalloDetail.colUnitCostEuro"), align: "right", width: 130 },
                  { label: t("escandalloDetail.colLineCostEuro"), align: "right", width: 130 },
                  { label: t("escandalloDetail.colActions"), align: "right", width: 100 },
                ].map((h) => (
                  <th
                    key={h.label}
                    style={{
                      textAlign: h.align as "left" | "right",
                      fontWeight: 600,
                      padding: "12px 14px",
                      borderBottom: "1px solid #334155",
                      background: "#0f172a",
                      width: h.width,
                      color: "#94a3b8",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
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
                  <td
                    colSpan={7}
                    style={{
                      padding: 22,
                      color: "#94a3b8",
                      background: "#1e293b",
                      fontSize: 15,
                      textAlign: "center",
                    }}
                  >
                    {loading ? t("escandalloDetail.loadingIngredients") : t("escandalloDetail.noIngredients")}
                  </td>
                </tr>
              ) : (
                ingredientes.map((r, idx) => {
                  const pid = parseProductoId(r.producto_id);
                  const p = pid != null ? productosById.get(pid) : undefined;
                  const unitCost = unitCostFromProductoRow(p);
                  const cantidadN = parseNullableNumber(r.cantidad) ?? 0;
                  const lineTotal =
                    unitCost != null && cantidadN > 0 && pid != null ? cantidadN * unitCost : null;
                  const rowBg = idx % 2 === 0 ? "#1e293b" : "rgba(15, 23, 42, 0.55)";

                  return (
                    <tr key={r.clientRowId} style={{ background: rowBg }}>
                      <td style={{ padding: "12px 14px", borderBottom: "1px solid #334155", verticalAlign: "middle" }}>
                        <select
                          value={r.producto_id}
                          onChange={(e) => onSelectProducto(r.clientRowId, e.target.value)}
                          aria-label={t("escandalloDetail.ariaProduct")}
                          style={{ ...selectDark, width: "100%", maxWidth: 240 }}
                        >
                          <option value="">{t("escandalloDetail.selectProductPlaceholder")}</option>
                          {productosCatalog.map((prod) => (
                            <option key={String(prod.id)} value={String(prod.id)}>
                              {prod.nombre?.trim() || t("escandalloDetail.productFallback", { id: prod.id })}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid #334155",
                          verticalAlign: "middle",
                          color: "#e2e8f0",
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        {nombreProductoDisplay(r.producto_id)}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid #334155",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          verticalAlign: "middle",
                        }}
                      >
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={r.cantidad}
                          onChange={(e) => updateIngredientRow(r.clientRowId, { cantidad: e.target.value })}
                          placeholder={t("escandalloDetail.placeholderQty")}
                          aria-label={t("escandalloDetail.ariaQtyUsed")}
                          style={{
                            ...inputDark,
                            width: "100%",
                            maxWidth: 120,
                            marginLeft: "auto",
                            display: "block",
                          }}
                        />
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: "1px solid #334155", verticalAlign: "middle" }}>
                        <input
                          value={r.unidad}
                          onChange={(e) => updateIngredientRow(r.clientRowId, { unidad: e.target.value })}
                          placeholder={t("escandalloDetail.placeholderUnit")}
                          aria-label={t("escandalloDetail.ariaUnit")}
                          style={{ ...inputDark, width: "100%" }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid #334155",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          verticalAlign: "middle",
                          color: unitCost != null ? "#cbd5e1" : "#64748b",
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        {unitCost != null ? `${formatMoneyOrDash(unitCost)} €` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid #334155",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                          color: lineTotal != null ? "#fde68a" : "#64748b",
                          fontSize: 15,
                          verticalAlign: "middle",
                        }}
                      >
                        {lineTotal != null ? `${formatMoneyOrDash(lineTotal)} €` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid #334155",
                          textAlign: "right",
                          verticalAlign: "middle",
                        }}
                      >
                        <button
                          onClick={() => removeIngredientRow(r.clientRowId)}
                          type="button"
                          style={{
                            border: "1px solid #64748b",
                            background: "rgba(15, 23, 42, 0.6)",
                            color: "#fecaca",
                            padding: "8px 12px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 650,
                            fontSize: 13,
                          }}
                        >
                          {t("common.delete")}
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
                    padding: "14px 16px",
                    textAlign: "right",
                    fontWeight: 700,
                    background: "#0f172a",
                    borderTop: "1px solid #334155",
                    color: "#cbd5e1",
                    fontSize: 14,
                  }}
                >
                  {t("escandalloDetail.footerLineTotal")}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    textAlign: "right",
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    background: "#0f172a",
                    borderTop: "1px solid #334155",
                    color: "#fde68a",
                    fontSize: 17,
                  }}
                >
                  {formatMoneyOrDash(costeTotalCalculado)} €
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ModulePageShell>
  );
}
