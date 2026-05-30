"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";
import { useI18n } from "@/components/i18n-provider";
import { EscandalloRecipeEditor } from "@/components/carta/escandallos/escandallo-recipe-editor";

type Escandallo = {
  id: string | number;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
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
  return { productos: [], errorMessage: null };
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
        setError(null);
        setPlato(null);
        setIngredientes([]);
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

    const { incomplete } = classifyRows(ingredientes);
    if (incomplete) {
      setError(t("escandalloDetail.errorRowIncomplete"));
      return;
    }

    setSaving(true);
    try {
      setError(t("escandalloDetail.errorSave"));
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

  const editorLabels = {
    costeRegistrado: t("escandalloDetail.costeRegistrado"),
    precioVenta: t("escandalloDetail.precioVenta"),
    margenEstimado: t("escandalloDetail.margenEstimado"),
    costeIngredientes: t("escandalloDetail.costePorIngredientes"),
    ingredients: t("escandalloDetail.ingredients"),
    addIngredient: t("escandalloDetail.addIngredient"),
    saveChanges: t("common.saveChanges"),
    saving: t("common.saving"),
    colProduct: t("escandalloDetail.colProduct"),
    colIngredient: t("escandalloDetail.colIngredient"),
    colQty: t("escandalloDetail.colQtyUsed"),
    colUnit: t("escandalloDetail.colUnit"),
    colUnitCost: t("escandalloDetail.colUnitCostEuro"),
    colLineCost: t("escandalloDetail.colLineCostEuro"),
    colActions: t("escandalloDetail.colActions"),
    selectProduct: t("escandalloDetail.selectProductPlaceholder"),
    placeholderQty: t("escandalloDetail.placeholderQty"),
    placeholderUnit: t("escandalloDetail.placeholderUnit"),
    loadingIngredients: t("escandalloDetail.loadingIngredients"),
    noIngredients: t("escandalloDetail.noIngredients"),
    footerTotal: t("escandalloDetail.footerLineTotal"),
    delete: t("common.delete"),
  };

  return (
    <ModulePageShell
      backHref="/dashboard/configuracion/carta/escandallos"
      backLabel={t("escandalloDetail.backToList")}
      title={
        loading
          ? t("common.loading")
          : idOk
            ? plato?.nombre_plato ?? t("escandalloDetail.notFoundTitle")
            : t("escandalloDetail.notFoundTitle")
      }
      subtitle={t("escandalloDetail.subtitle")}
      maxWidth={1100}
      compactLayout
      operationalFocus
      denseWorkbench
      headerRight={
        <button
          onClick={() => window.location.reload()}
          type="button"
          className="hostly-button-secondary hostly-button-compact"
        >
          {t("common.reload")}
        </button>
      }
    >
      {!loading && !error && (!idOk || !plato) ? (
        <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">{t("escandalloDetail.notFoundBody")}</div>
      ) : (
        <EscandalloRecipeEditor
          costeRegistrado={costeTotalActual}
          precioVenta={precioVentaActual}
          costeCalculado={costeTotalCalculado}
          margenDisplay={margenEstimado}
          ingredientes={ingredientes}
          productosCatalog={productosCatalog}
          loading={loading}
          saving={saving}
          disabled={loading || !idOk || !plato || Boolean(productosCatalogError)}
          onAddIngredient={addIngredientRow}
          onSave={guardarCambios}
          onRemoveIngredient={removeIngredientRow}
          onSelectProducto={onSelectProducto}
          onUpdateIngredient={updateIngredientRow}
          nombreProductoDisplay={nombreProductoDisplay}
          unitCostForProduct={(productoId) => {
            const pid = parseProductoId(productoId);
            return pid != null ? unitCostFromProductoRow(productosById.get(pid)) : null;
          }}
          lineCostForRow={(row) => {
            const pid = parseProductoId(row.producto_id);
            const p = pid != null ? productosById.get(pid) : undefined;
            const unitCost = unitCostFromProductoRow(p);
            const cantidadN = parseNullableNumber(row.cantidad) ?? 0;
            return unitCost != null && cantidadN > 0 && pid != null ? cantidadN * unitCost : null;
          }}
          labels={editorLabels}
          alerts={
            <>
              {productosCatalogError ? (
                <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
                  {t("escandalloDetail.errorLoadProductos")}: {productosCatalogError}
                </div>
              ) : null}
              {error ? (
                <div className="hostly-carta-config-alert hostly-carta-config-alert--error">{error}</div>
              ) : null}
              {saveMsg ? (
                <div className="hostly-carta-config-alert hostly-carta-config-alert--info">{saveMsg}</div>
              ) : null}
            </>
          }
        />
      )}
    </ModulePageShell>
  );
}
