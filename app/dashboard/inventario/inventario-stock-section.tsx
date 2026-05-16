"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  disableProductInventory,
  listenProductsForInventory,
  upsertProductInventory,
  type ProductDocument,
} from "@/lib/firestore/products";
import { mockInventarioProductos } from "@/lib/inventario-productos";

type Unidad = "kg" | "g" | "l" | "ml" | "ud";

type ProductoRow = {
  id: string | number;
  nombre: string | null;
  categoryId: string | null;
  station: string | null;
  active: boolean;
  unidad: Unidad | string | null;
  stock_actual: number | null;
  coste_unitario: number | null;
  stock_minimo: number | null;
  supplierName: string | null;
  image: string | null;
};

type DraftById = Record<
  string,
  {
    nombre: string;
    categoryId: string;
    station: string;
    active: boolean;
    unidad: string;
    stock_actual: string;
    coste_unitario: string;
    stock_minimo: string;
    supplierName: string;
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

function draftFromRows(rows: ProductoRow[]): DraftById {
  const next: DraftById = {};
  for (const r of rows) {
    next[String(r.id)] = {
      nombre: r.nombre ?? "",
      categoryId: r.categoryId ?? "",
      station: r.station ?? "",
      active: r.active,
      unidad: r.unidad ?? "kg",
      stock_actual: r.stock_actual == null ? "" : String(roundTo(r.stock_actual, 3)),
      coste_unitario: r.coste_unitario == null ? "" : String(roundTo(r.coste_unitario, 2)),
      stock_minimo: r.stock_minimo == null ? "" : String(roundTo(r.stock_minimo, 3)),
      supplierName: r.supplierName ?? "",
    };
  }
  return next;
}

function mapProductDocumentToRow(item: ProductDocument): ProductoRow {
  return {
    id: item.id,
    nombre: item.name,
    categoryId: item.categoryId,
    station: item.station,
    active: item.active,
    unidad: item.inventory.unit,
    stock_actual: item.inventory.currentStock,
    coste_unitario: item.inventory.costPerUnit,
    stock_minimo: item.inventory.minStock,
    supplierName: item.inventory.supplierName ?? null,
    image: item.inventory.image ?? null,
  };
}

export default function InventarioStockSection() {
  const { t } = useI18n();
  const { restaurantId, ready, profileReady } = useAuth();
  const [items, setItems] = useState<ProductoRow[]>([]);
  const [drafts, setDrafts] = useState<DraftById>({});
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  useEffect(() => {
    if (!ready || !profileReady) {
      setLoading(true);
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setItems([]);
      setDrafts({});
      setUsingMock(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUsingMock(false);

    return listenProductsForInventory(
      rid,
      (rows) => {
        const mapped = rows.map(mapProductDocumentToRow);
        setItems(mapped);
        setDrafts(draftFromRows(mapped));
        setLoading(false);
      },
      (e) => {
        const rows = mockInventarioProductos() as ProductoRow[];
        setItems(rows);
        setDrafts(draftFromRows(rows));
        setUsingMock(true);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, [profileReady, ready, reloadNonce, restaurantId]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && items.some((item) => String(item.id) === prev)) return prev;
      return items[0] ? String(items[0].id) : null;
    });
  }, [items]);

  function cargar() {
    setReloadNonce((n) => n + 1);
  }

  function updateDraft(id: string | number, patch: Partial<DraftById[string]>) {
    const key = String(id);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        nombre: prev[key]?.nombre ?? "",
        categoryId: prev[key]?.categoryId ?? "",
        station: prev[key]?.station ?? "",
        active: prev[key]?.active ?? true,
        unidad: prev[key]?.unidad ?? "kg",
        stock_actual: prev[key]?.stock_actual ?? "",
        coste_unitario: prev[key]?.coste_unitario ?? "",
        stock_minimo: prev[key]?.stock_minimo ?? "",
        supplierName: prev[key]?.supplierName ?? "",
        ...patch,
      },
    }));
  }

  async function addProducto() {
    const rid = restaurantId?.trim() ?? "";
    setError(null);

    try {
      if (usingMock) {
        throw new Error("Firestore no disponible: creación desactivada en modo demo");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para crear inventario");
      }
      await upsertProductInventory(rid, null, {
        name: null,
        categoryId: null,
        station: null,
        active: true,
        unit: "ud",
        currentStock: 0,
        minStock: 0,
        costPerUnit: 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorSave"));
    }
  }

  async function guardarFila(id: string | number) {
    const key = String(id);
    const rid = restaurantId?.trim() ?? "";
    setError(null);
    setSavingById((prev) => ({ ...prev, [key]: true }));

    try {
      if (usingMock) {
        throw new Error("Firestore no disponible: edición desactivada en modo demo");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para guardar inventario");
      }
      const draft = drafts[key] ?? {
        nombre: "",
        categoryId: "",
        station: "",
        active: true,
        unidad: "kg",
        stock_actual: "",
        coste_unitario: "",
        stock_minimo: "",
        supplierName: "",
      };
      const payload = {
        nombre: draft.nombre.trim() || null,
        categoryId: draft.categoryId.trim() || null,
        station: draft.station.trim() || null,
        active: draft.active,
        unidad: (draft.unidad || "kg").trim(),
        stock_actual: parseNumber(draft.stock_actual, 0),
        coste_unitario: parseNumber(draft.coste_unitario, 0),
        stock_minimo: parseNumber(draft.stock_minimo, 0),
        supplierName: draft.supplierName.trim() || undefined,
      };

      await upsertProductInventory(rid, key, {
        name: payload.nombre,
        categoryId: payload.categoryId,
        station: payload.station,
        active: payload.active,
        unit: payload.unidad,
        currentStock: payload.stock_actual,
        minStock: payload.stock_minimo,
        costPerUnit: payload.coste_unitario,
        supplierName: payload.supplierName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorSave"));
    } finally {
      setSavingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function eliminarFila(id: string | number) {
    const key = String(id);
    const rid = restaurantId?.trim() ?? "";
    setError(null);
    setDeletingById((prev) => ({ ...prev, [key]: true }));

    try {
      if (usingMock) {
        throw new Error("Firestore no disponible: borrado desactivado en modo demo");
      }
      if (!rid) {
        throw new Error("No hay restaurante activo para borrar inventario");
      }
      await disableProductInventory(rid, key);
      setItems((prev) => prev.filter((r) => String(r.id) !== key));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inventory.errorDelete"));
    } finally {
      setDeletingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  const rowsForRender = useMemo(() => items, [items]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowsForRender;
    return rowsForRender.filter((item) =>
      [item.nombre, item.unidad, item.station, item.supplierName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rowsForRender, search]);
  const selectedRow = useMemo(
    () => rowsForRender.find((item) => String(item.id) === selectedId) ?? null,
    [rowsForRender, selectedId],
  );

  const selectedKey = selectedRow ? String(selectedRow.id) : "";
  const selectedDraft = selectedRow
    ? drafts[selectedKey] ?? {
        nombre: selectedRow.nombre ?? "",
        categoryId: selectedRow.categoryId ?? "",
        station: selectedRow.station ?? "",
        active: selectedRow.active,
        unidad: selectedRow.unidad ?? "kg",
        stock_actual:
          selectedRow.stock_actual == null
            ? ""
            : String(roundTo(selectedRow.stock_actual, 3)),
        coste_unitario:
          selectedRow.coste_unitario == null
            ? ""
            : String(roundTo(selectedRow.coste_unitario, 2)),
        stock_minimo:
          selectedRow.stock_minimo == null
            ? ""
            : String(roundTo(selectedRow.stock_minimo, 3)),
        supplierName: selectedRow.supplierName ?? "",
      }
    : null;

  const inputStyle = {
    width: "100%",
    padding: "10px 11px",
    borderRadius: 12,
    border: "1px solid rgba(77, 107, 128, 0.18)",
    outline: "none",
    background: "rgba(255,255,255,0.9)",
    color: "#102033",
    boxSizing: "border-box" as const,
  };
  const sectionStyle = {
    border: "1px solid rgba(77, 107, 128, 0.14)",
    borderRadius: 18,
    background: "rgba(255,255,255,0.76)",
    padding: 14,
    boxShadow: "0 10px 24px rgba(49, 95, 125, 0.06)",
  };
  const sectionTitleStyle = {
    margin: "0 0 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#49667a",
  };
  const labelStyle = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    color: "#4a6475",
  };

  const renderConfigPanel = () => {
    if (!selectedRow || !selectedDraft) {
      return (
        <div className="hostly-inventory-panel-empty">
          {loading ? t("inventory.loadingProducts") : "Selecciona un producto para configurarlo."}
        </div>
      );
    }

    const isSaving = Boolean(savingById[selectedKey]);
    const isDeleting = Boolean(deletingById[selectedKey]);

    return (
      <div className="hostly-inventory-config-panel">
        <div className="hostly-inventory-panel-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div className="hostly-inventory-image-thumb">
              {selectedRow.image ? "IMG" : "IA"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#102033" }}>
                {selectedDraft.nombre.trim() || "Producto sin nombre"}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12, fontWeight: 700, color: "#6a7f8f" }}>
                Configuración operacional de producto
              </p>
            </div>
          </div>
          <button
            type="button"
            className="hostly-inventory-mobile-close"
            onClick={() => setMobilePanelOpen(false)}
          >
            Cerrar
          </button>
        </div>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>General</h3>
          <div className="hostly-inventory-form-grid">
            <label style={labelStyle}>
              {t("common.name")}
              <input
                value={selectedDraft.nombre}
                onChange={(e) => updateDraft(selectedRow.id, { nombre: e.target.value })}
                placeholder={selectedRow.nombre ?? t("inventory.placeholderProduct")}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Categoría
              <input
                value={selectedDraft.categoryId}
                onChange={(e) => updateDraft(selectedRow.id, { categoryId: e.target.value })}
                placeholder="Sin categoría"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Estación
              <input
                value={selectedDraft.station}
                onChange={(e) => updateDraft(selectedRow.id, { station: e.target.value })}
                placeholder="cocina, barra, sala..."
                style={inputStyle}
              />
            </label>
            <label className="hostly-inventory-switch-row">
              <span>
                <strong>Activo</strong>
                <small>Visible para operación cuando se conecte al catálogo central.</small>
              </span>
              <input
                type="checkbox"
                checked={selectedDraft.active}
                onChange={(e) => updateDraft(selectedRow.id, { active: e.target.checked })}
              />
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Inventario</h3>
          <div className="hostly-inventory-form-grid">
            <label className="hostly-inventory-switch-row">
              <span>
                <strong>Inventario activo</strong>
                <small>Este producto participa en control de stock.</small>
              </span>
              <input type="checkbox" checked readOnly />
            </label>
            <label style={labelStyle}>
              {t("common.unit")}
              <select
                value={selectedDraft.unidad}
                onChange={(e) => updateDraft(selectedRow.id, { unidad: e.target.value })}
                style={inputStyle}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              {t("common.currentStock")}
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={selectedDraft.stock_actual}
                onChange={(e) => updateDraft(selectedRow.id, { stock_actual: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("common.minStock")}
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={selectedDraft.stock_minimo}
                onChange={(e) => updateDraft(selectedRow.id, { stock_minimo: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Coste por unidad
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={selectedDraft.coste_unitario}
                onChange={(e) => updateDraft(selectedRow.id, { coste_unitario: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Proveedor
              <input
                value={selectedDraft.supplierName}
                onChange={(e) => updateDraft(selectedRow.id, { supplierName: e.target.value })}
                placeholder="Proveedor habitual"
                style={inputStyle}
              />
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Media</h3>
          <div className="hostly-inventory-media-box">
            <div className="hostly-inventory-media-placeholder">Foto / IA</div>
            <div>
              <p style={{ margin: 0, fontWeight: 900, color: "#102033" }}>Imagen del producto</p>
              <p style={{ margin: "4px 0 0", color: "#6a7f8f", fontSize: 13 }}>
                Preparado para futura subida de foto, OCR o identificación por IA.
              </p>
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Próximamente</h3>
          <div className="hostly-inventory-future-grid">
            {["Recetas", "IA", "Escandallos", "Compras automáticas"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <div className="hostly-inventory-panel-actions">
          <button
            type="button"
            onClick={() => guardarFila(selectedRow.id)}
            disabled={isSaving}
            className="hostly-inventory-primary-btn"
          >
            {isSaving ? t("common.saving") : t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => eliminarFila(selectedRow.id)}
            disabled={isDeleting}
            className="hostly-inventory-secondary-btn"
          >
            {isDeleting ? t("common.deleting") : "Desactivar inventario"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <ModulePageShell title={t("inventory.title")} subtitle={t("inventory.subtitle")} maxWidth={1180} compactLayout>
      <div className="hostly-inventory-workbench">
        <div className="hostly-inventory-toolbar">
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#526b7d" }}>
              {rowsForRender.length} productos configurables
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={cargar} type="button" className="hostly-inventory-secondary-btn">
              {t("common.reload")}
            </button>
            <button onClick={addProducto} type="button" className="hostly-inventory-primary-btn">
              {t("inventory.addProduct")}
            </button>
          </div>
        </div>

        {error ? <div className="hostly-inventory-error">{error}</div> : null}
        {usingMock ? (
          <div className="hostly-inventory-warning">
            No se pudo leer Firestore. Mostrando datos de ejemplo temporalmente.
          </div>
        ) : null}

        <div className="hostly-inventory-split">
          <aside className="hostly-inventory-list-panel">
            <div className="hostly-inventory-search-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto, proveedor o unidad..."
                className="hostly-inventory-search"
              />
            </div>
            <div className="hostly-inventory-list">
              {filteredRows.length === 0 ? (
                <div className="hostly-inventory-empty">
                  {loading ? t("inventory.loadingProducts") : t("inventory.emptyProducts")}
                </div>
              ) : (
                filteredRows.map((item) => {
                  const key = String(item.id);
                  const stock = item.stock_actual ?? 0;
                  const min = item.stock_minimo ?? 0;
                  const lowStock = min > 0 && stock <= min;
                  const selected = key === selectedId;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`hostly-inventory-product-row${selected ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedId(key);
                        setMobilePanelOpen(true);
                      }}
                    >
                      <span className="hostly-inventory-row-image">P</span>
                      <span className="hostly-inventory-row-main">
                        <span className="hostly-inventory-row-name">
                          {item.nombre?.trim() || "Producto sin nombre"}
                        </span>
                        <span className="hostly-inventory-row-meta">
                          {formatMoney2(item.coste_unitario)} €/ud · {item.unidad ?? "ud"}
                        </span>
                      </span>
                      <span className="hostly-inventory-row-side">
                        <span className="hostly-inventory-row-stock">
                          {roundTo(stock, 3)} {item.unidad ?? "ud"}
                        </span>
                        <span className={`hostly-inventory-badge${lowStock ? " is-low" : ""}`}>
                          {lowStock ? "Stock bajo" : item.active ? "Activo" : "Inactivo"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section
            className="hostly-inventory-panel-shell"
            data-mobile-open={mobilePanelOpen ? "true" : "false"}
          >
            {renderConfigPanel()}
          </section>
        </div>
      </div>

      <style jsx global>{`
        .hostly-inventory-workbench {
          display: grid;
          gap: 14px;
        }
        .hostly-inventory-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border: 1px solid rgba(77, 107, 128, 0.14);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: 0 12px 30px rgba(49, 95, 125, 0.06);
        }
        .hostly-inventory-split {
          display: grid;
          grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.45fr);
          gap: 14px;
          align-items: start;
        }
        .hostly-inventory-list-panel,
        .hostly-inventory-panel-shell {
          border: 1px solid rgba(77, 107, 128, 0.14);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 0 14px 34px rgba(49, 95, 125, 0.07);
          overflow: hidden;
        }
        .hostly-inventory-search-wrap {
          padding: 12px;
          border-bottom: 1px solid rgba(77, 107, 128, 0.1);
          background: rgba(244, 248, 252, 0.7);
        }
        .hostly-inventory-search {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(77, 107, 128, 0.16);
          border-radius: 14px;
          padding: 10px 12px;
          outline: none;
          background: white;
          color: #102033;
          font-weight: 700;
        }
        .hostly-inventory-list {
          display: grid;
          max-height: 650px;
          overflow: auto;
        }
        .hostly-inventory-product-row {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          width: 100%;
          border: 0;
          border-bottom: 1px solid rgba(77, 107, 128, 0.09);
          background: transparent;
          padding: 11px 12px;
          text-align: left;
          cursor: pointer;
        }
        .hostly-inventory-product-row.is-selected {
          background: linear-gradient(90deg, rgba(219, 238, 250, 0.82), rgba(255,255,255,0.72));
          box-shadow: inset 3px 0 0 #4f9fc8;
        }
        .hostly-inventory-row-image,
        .hostly-inventory-image-thumb,
        .hostly-inventory-media-placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg, #e9f5fb, #d9ecf7);
          color: #2f6f91;
          border: 1px solid rgba(77, 107, 128, 0.12);
          font-weight: 950;
        }
        .hostly-inventory-row-image {
          width: 42px;
          height: 42px;
          border-radius: 12px;
        }
        .hostly-inventory-row-main {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .hostly-inventory-row-name {
          color: #102033;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hostly-inventory-row-meta {
          color: #6a7f8f;
          font-size: 12px;
          font-weight: 700;
        }
        .hostly-inventory-row-side {
          display: grid;
          justify-items: end;
          gap: 5px;
        }
        .hostly-inventory-row-stock {
          color: #102033;
          font-size: 12px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-badge {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(216, 239, 226, 0.78);
          color: #2f6a45;
          font-size: 10px;
          font-weight: 900;
        }
        .hostly-inventory-badge.is-low {
          background: rgba(251, 230, 198, 0.9);
          color: #9a5d11;
        }
        .hostly-inventory-config-panel {
          display: grid;
          gap: 12px;
          padding: 14px;
        }
        .hostly-inventory-panel-head,
        .hostly-inventory-panel-actions,
        .hostly-inventory-media-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .hostly-inventory-image-thumb {
          width: 50px;
          height: 50px;
          border-radius: 16px;
          flex-shrink: 0;
        }
        .hostly-inventory-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .hostly-inventory-switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 44px;
          padding: 10px 11px;
          border-radius: 14px;
          background: rgba(244, 248, 252, 0.82);
          border: 1px solid rgba(77, 107, 128, 0.12);
          color: #102033;
        }
        .hostly-inventory-switch-row small {
          display: block;
          margin-top: 2px;
          color: #6a7f8f;
          font-size: 11px;
          font-weight: 700;
        }
        .hostly-inventory-media-placeholder {
          width: 92px;
          height: 72px;
          border-radius: 18px;
          flex-shrink: 0;
        }
        .hostly-inventory-future-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .hostly-inventory-future-grid span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          border-radius: 999px;
          background: rgba(244, 248, 252, 0.82);
          border: 1px dashed rgba(77, 107, 128, 0.2);
          color: #6a7f8f;
          font-size: 12px;
          font-weight: 850;
        }
        .hostly-inventory-primary-btn,
        .hostly-inventory-secondary-btn,
        .hostly-inventory-mobile-close {
          border-radius: 12px;
          border: 1px solid rgba(77, 107, 128, 0.16);
          padding: 9px 12px;
          font-weight: 900;
          cursor: pointer;
        }
        .hostly-inventory-primary-btn {
          background: #102033;
          color: white;
        }
        .hostly-inventory-secondary-btn,
        .hostly-inventory-mobile-close {
          background: rgba(255,255,255,0.82);
          color: #102033;
        }
        .hostly-inventory-error,
        .hostly-inventory-warning,
        .hostly-inventory-empty,
        .hostly-inventory-panel-empty {
          padding: 12px;
          border-radius: 14px;
          font-weight: 750;
        }
        .hostly-inventory-error {
          border: 1px solid rgba(220, 38, 38, 0.28);
          background: rgba(220, 38, 38, 0.06);
          color: rgb(153, 27, 27);
        }
        .hostly-inventory-warning {
          border: 1px solid rgba(234, 179, 8, 0.28);
          background: rgba(234, 179, 8, 0.09);
          color: rgba(15, 23, 42, 0.74);
        }
        .hostly-inventory-empty,
        .hostly-inventory-panel-empty {
          color: #6a7f8f;
        }
        .hostly-inventory-mobile-close {
          display: none;
        }
        @media (max-width: 767.98px) {
          .hostly-inventory-toolbar {
            align-items: stretch;
            flex-direction: column;
          }
          .hostly-inventory-split {
            display: block;
          }
          .hostly-inventory-list {
            max-height: none;
          }
          .hostly-inventory-product-row {
            grid-template-columns: 38px minmax(0, 1fr);
          }
          .hostly-inventory-row-side {
            grid-column: 2;
            justify-items: start;
            grid-auto-flow: column;
            align-items: center;
          }
          .hostly-inventory-panel-shell {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 80;
            max-height: 88dvh;
            border-radius: 22px 22px 0 0;
            transform: translateY(105%);
            transition: transform 180ms ease;
            overflow: auto;
          }
          .hostly-inventory-panel-shell[data-mobile-open="true"] {
            transform: translateY(0);
          }
          .hostly-inventory-mobile-close {
            display: inline-flex;
          }
          .hostly-inventory-form-grid,
          .hostly-inventory-future-grid {
            grid-template-columns: 1fr;
          }
          .hostly-inventory-panel-actions,
          .hostly-inventory-media-box {
            align-items: stretch;
            flex-direction: column;
          }
          .hostly-inventory-primary-btn,
          .hostly-inventory-secondary-btn {
            width: 100%;
          }
        }
      `}</style>
    </ModulePageShell>
  );
}

