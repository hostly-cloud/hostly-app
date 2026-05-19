"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  disableProductInventory,
  listenLatestStockMovements,
  listenProductsForInventory,
  upsertProductInventory,
  type ProductDocument,
  type StockMovementListItem,
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

function formatMovementDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "0";
  const r = roundTo(delta, 3);
  if (r === 0) return "0";
  return r > 0 ? `+${r}` : String(r);
}

function stockMovementKindLabel(m: StockMovementListItem): string {
  if (m.type === "receipt" || m.source === "inventory_receipt") return "Recepción";
  return "Ajuste manual";
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
  /** Tras crear producto, priorizar su selección cuando llegue el snapshot. */
  const preferSelectIdRef = useRef<string | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovementListItem[]>([]);

  const movementDateFmt = useMemo(
    () => new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }),
    [],
  );

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
    if (!ready || !profileReady || usingMock) {
      setStockMovements([]);
      return;
    }
    const rid = restaurantId?.trim() ?? "";
    const pid = selectedId?.trim() ?? "";
    if (!rid || !pid) {
      setStockMovements([]);
      return;
    }
    return listenLatestStockMovements(rid, pid, setStockMovements, { limit: 5 });
  }, [profileReady, ready, usingMock, restaurantId, selectedId]);

  useEffect(() => {
    const prefer = preferSelectIdRef.current;
    if (prefer) {
      if (items.some((item) => String(item.id) === prefer)) {
        setSelectedId(prefer);
        preferSelectIdRef.current = null;
      }
      return;
    }
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
      const newId = await upsertProductInventory(rid, null, {
        name: "Nuevo producto",
        categoryId: null,
        station: null,
        active: true,
        price: 0,
        type: "inventory",
        unit: "ud",
        currentStock: 0,
        minStock: 0,
        costPerUnit: 0,
      });
      preferSelectIdRef.current = newId;
      setSelectedId(newId);
      setMobilePanelOpen(true);
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
    const stationTrim = selectedDraft.station.trim();
    const displayName = selectedDraft.nombre.trim() || "Producto sin nombre";
    const headInitial = displayName.charAt(0).toUpperCase() || "P";

    return (
      <div className="hostly-inventory-config-panel">
        <div className="hostly-inventory-panel-head">
          <div className="hostly-inventory-head-main">
            <div className="hostly-inventory-avatar" aria-hidden>
              {selectedRow.image ? (
                <span className="hostly-inventory-avatar-dot" />
              ) : (
                headInitial
              )}
            </div>
            <div className="hostly-inventory-head-text">
              <h2 className="hostly-inventory-head-title">{displayName}</h2>
              <p className="hostly-inventory-head-sub">Ficha inventario · catálogo central</p>
              <div className="hostly-inventory-head-badges">
                <span
                  className={`hostly-inventory-head-badge${selectedDraft.active ? " is-active" : " is-inactive"}`}
                >
                  {selectedDraft.active ? "Activo" : "Inactivo"}
                </span>
                <span className="hostly-inventory-head-badge is-neutral">
                  {selectedDraft.unidad || "ud"}
                </span>
                {stationTrim ? (
                  <span className="hostly-inventory-head-badge is-neutral">{stationTrim}</span>
                ) : null}
              </div>
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

        <div className="hostly-inventory-config-body">
          <section className="hostly-inventory-fiche-section">
            <h3 className="hostly-inventory-fiche-section-title">General</h3>
            <div className="hostly-inventory-fiche-grid">
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">{t("common.name")}</span>
                <input
                  value={selectedDraft.nombre}
                  onChange={(e) => updateDraft(selectedRow.id, { nombre: e.target.value })}
                  placeholder={selectedRow.nombre ?? t("inventory.placeholderProduct")}
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">Categoría</span>
                <input
                  value={selectedDraft.categoryId}
                  onChange={(e) => updateDraft(selectedRow.id, { categoryId: e.target.value })}
                  placeholder="Sin categoría"
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">Estación</span>
                <input
                  value={selectedDraft.station}
                  onChange={(e) => updateDraft(selectedRow.id, { station: e.target.value })}
                  placeholder="Barra, cocina, sala…"
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-switch-row hostly-inventory-switch-row--compact">
                <span className="hostly-inventory-switch-label">
                  <strong>Activo</strong>
                  <small>Visible cuando el producto esté enlazado al catálogo.</small>
                </span>
                <input
                  type="checkbox"
                  checked={selectedDraft.active}
                  onChange={(e) => updateDraft(selectedRow.id, { active: e.target.checked })}
                />
              </label>
            </div>

            <h3 className="hostly-inventory-fiche-section-title hostly-inventory-fiche-section-title--spaced">
              Inventario
            </h3>
            <div className="hostly-inventory-fiche-grid">
              <label className="hostly-inventory-switch-row hostly-inventory-switch-row--compact">
                <span className="hostly-inventory-switch-label">
                  <strong>Inventario activo</strong>
                  <small>Control de stock habilitado para este artículo.</small>
                </span>
                <input type="checkbox" checked readOnly />
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">{t("common.unit")}</span>
                <select
                  value={selectedDraft.unidad}
                  onChange={(e) => updateDraft(selectedRow.id, { unidad: e.target.value })}
                  className="hostly-inventory-field-input"
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">{t("common.currentStock")}</span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={selectedDraft.stock_actual}
                  onChange={(e) => updateDraft(selectedRow.id, { stock_actual: e.target.value })}
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">{t("common.minStock")}</span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={selectedDraft.stock_minimo}
                  onChange={(e) => updateDraft(selectedRow.id, { stock_minimo: e.target.value })}
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-field">
                <span className="hostly-inventory-field-label">Coste por unidad</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={selectedDraft.coste_unitario}
                  onChange={(e) =>
                    updateDraft(selectedRow.id, { coste_unitario: e.target.value })
                  }
                  className="hostly-inventory-field-input"
                />
              </label>
              <label className="hostly-inventory-field hostly-inventory-field--full">
                <span className="hostly-inventory-field-label">Proveedor</span>
                <input
                  value={selectedDraft.supplierName}
                  onChange={(e) => updateDraft(selectedRow.id, { supplierName: e.target.value })}
                  placeholder="Proveedor habitual"
                  className="hostly-inventory-field-input"
                />
              </label>
            </div>
          </section>

          <section className="hostly-inventory-fiche-section hostly-inventory-fiche-section--movements">
            <h3 className="hostly-inventory-fiche-section-title">Últimos movimientos</h3>
            {stockMovements.length === 0 ? (
              <p className="hostly-inventory-movements-empty">
                Sin movimientos. Al cambiar el stock y guardar, aparecerán aquí.
              </p>
            ) : (
              <ul className="hostly-inventory-movements-list">
                {stockMovements.map((m) => {
                  const when =
                    m.createdAtMs != null
                      ? movementDateFmt.format(m.createdAtMs)
                      : "—";
                  const deltaStr = formatMovementDelta(m.delta);
                  const finalStr = `${roundTo(m.newStock, 3)} ${m.unit}`;
                  const deltaTone =
                    m.delta > 0 ? "plus" : m.delta < 0 ? "minus" : "zero";
                  return (
                    <li key={m.id} className="hostly-inventory-movements-row">
                      <span className="hostly-inventory-movements-date">{when}</span>
                      <span
                        className="hostly-inventory-movements-delta"
                        data-sign={deltaTone}
                      >
                        {deltaStr}
                      </span>
                      <span className="hostly-inventory-movements-final" title="Stock tras el movimiento">
                        → {finalStr}
                      </span>
                      <span className="hostly-inventory-movements-kind">{stockMovementKindLabel(m)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="hostly-inventory-fiche-section hostly-inventory-fiche-section--media">
            <h3 className="hostly-inventory-fiche-section-title">Media</h3>
            <div className="hostly-inventory-media-card">
              <div className="hostly-inventory-media-icon-wrap" aria-hidden>
                <span className="hostly-inventory-media-icon">✦</span>
              </div>
              <div className="hostly-inventory-media-copy">
                <p className="hostly-inventory-media-cta">Imagen e identificación por IA</p>
                <p className="hostly-inventory-media-hint">
                  Próximamente: foto, OCR y enriquecimiento automático de ficha.
                </p>
                <span className="hostly-inventory-media-chip">Placeholder · sin subida</span>
              </div>
            </div>
          </section>

          <section className="hostly-inventory-fiche-section hostly-inventory-fiche-section--future">
            <h3 className="hostly-inventory-fiche-future-title">Próximamente</h3>
            <div className="hostly-inventory-future-chips">
              {["Recetas", "IA", "Escandallos", "Compras"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        </div>

        <div className="hostly-inventory-panel-footer">
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
        @media (min-width: 768px) {
          .hostly-inventory-panel-shell {
            display: flex;
            flex-direction: column;
            max-height: min(82vh, 720px);
            min-height: 280px;
          }
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
        .hostly-inventory-row-image {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(180deg, #e9f5fb, #d9ecf7);
          color: #2f6f91;
          border: 1px solid rgba(77, 107, 128, 0.12);
          font-weight: 950;
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
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .hostly-inventory-config-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 10px 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .hostly-inventory-panel-head {
          flex-shrink: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(100, 116, 139, 0.12);
          background: linear-gradient(
            180deg,
            rgba(247, 252, 255, 0.97) 0%,
            rgba(241, 248, 252, 0.88) 100%
          );
        }
        .hostly-inventory-head-main {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
        }
        .hostly-inventory-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-weight: 850;
          letter-spacing: -0.02em;
          color: #1e4d67;
          background: radial-gradient(
            circle at 30% 28%,
            rgba(255, 255, 255, 0.95) 0%,
            rgba(227, 242, 252, 0.92) 45%,
            rgba(207, 231, 245, 0.85) 100%
          );
          border: 1px solid rgba(100, 116, 139, 0.14);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .hostly-inventory-avatar-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: rgba(56, 142, 184, 0.55);
          box-shadow: 0 0 0 3px rgba(186, 224, 240, 0.45);
        }
        .hostly-inventory-head-text {
          min-width: 0;
        }
        .hostly-inventory-head-title {
          margin: 0;
          font-size: 16px;
          font-weight: 850;
          line-height: 1.2;
          color: var(--hostly-ink-strong);
          letter-spacing: -0.02em;
        }
        .hostly-inventory-head-sub {
          margin: 3px 0 0;
          font-size: 11px;
          font-weight: 650;
          color: rgba(71, 85, 105, 0.92);
          letter-spacing: 0.01em;
        }
        .hostly-inventory-head-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 8px;
        }
        .hostly-inventory-head-badge {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          border: 1px solid rgba(100, 116, 139, 0.14);
          background: rgba(255, 255, 255, 0.72);
          color: #475569;
        }
        .hostly-inventory-head-badge.is-active {
          background: rgba(224, 242, 254, 0.65);
          border-color: rgba(125, 211, 252, 0.35);
          color: #0c4a6e;
        }
        .hostly-inventory-head-badge.is-inactive {
          background: rgba(241, 245, 249, 0.85);
          color: #64748b;
        }
        .hostly-inventory-head-badge.is-neutral {
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-fiche-section {
          border: 1px solid rgba(100, 116, 139, 0.12);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.82);
          padding: 10px 11px 11px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
        }
        .hostly-inventory-fiche-section--media {
          padding: 10px 11px;
        }
        .hostly-inventory-fiche-section--future {
          padding: 8px 10px 9px;
          background: rgba(248, 250, 252, 0.65);
          border-style: dashed;
          border-color: rgba(100, 116, 139, 0.12);
          box-shadow: none;
        }
        .hostly-inventory-fiche-section-title {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #64748b;
        }
        .hostly-inventory-fiche-section-title--spaced {
          margin-top: 12px;
        }
        .hostly-inventory-fiche-future-title {
          margin: 0 0 6px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(100, 116, 139, 0.72);
        }
        .hostly-inventory-fiche-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 10px;
          align-items: start;
        }
        .hostly-inventory-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .hostly-inventory-field--full {
          grid-column: 1 / -1;
        }
        .hostly-inventory-field-label {
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64748b;
        }
        .hostly-inventory-field-input {
          width: 100%;
          box-sizing: border-box;
          padding: 6px 9px;
          border-radius: 9px;
          border: 1px solid rgba(100, 116, 139, 0.16);
          outline: none;
          background: rgba(255, 255, 255, 0.96);
          color: var(--hostly-ink-strong);
          font-size: 13px;
          font-weight: 650;
        }
        .hostly-inventory-field-input:focus {
          border-color: rgba(56, 142, 184, 0.45);
          box-shadow: 0 0 0 3px rgba(186, 224, 240, 0.35);
        }
        .hostly-inventory-switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 7px 9px;
          border-radius: 10px;
          background: rgba(241, 248, 252, 0.65);
          border: 1px solid var(--hostly-table-divider-soft);
          color: var(--hostly-ink-strong);
        }
        .hostly-inventory-switch-row--compact {
          min-height: 0;
        }
        .hostly-inventory-switch-label {
          min-width: 0;
        }
        .hostly-inventory-switch-label strong {
          font-size: 12px;
          font-weight: 800;
        }
        .hostly-inventory-switch-label small {
          display: block;
          margin-top: 2px;
          color: rgba(71, 85, 105, 0.88);
          font-size: 10px;
          font-weight: 650;
          line-height: 1.25;
        }
        .hostly-inventory-media-card {
          display: flex;
          align-items: stretch;
          gap: 12px;
          padding: 10px 11px;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.92) 0%,
            rgba(238, 248, 253, 0.55) 100%
          );
          border: 1px solid rgba(100, 116, 139, 0.12);
        }
        .hostly-inventory-media-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(224, 242, 254, 0.45);
          border: 1px solid rgba(125, 211, 252, 0.25);
        }
        .hostly-inventory-media-icon {
          font-size: 22px;
          line-height: 1;
          color: rgba(14, 116, 144, 0.55);
          font-weight: 300;
        }
        .hostly-inventory-media-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
        }
        .hostly-inventory-media-cta {
          margin: 0;
          font-size: 13px;
          font-weight: 800;
          color: var(--hostly-ink-strong);
          letter-spacing: -0.01em;
        }
        .hostly-inventory-media-hint {
          margin: 0;
          font-size: 11px;
          font-weight: 650;
          color: #64748b;
          line-height: 1.35;
        }
        .hostly-inventory-media-chip {
          display: inline-flex;
          align-self: flex-start;
          margin-top: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(14, 116, 144, 0.85);
          background: rgba(224, 242, 254, 0.5);
          border: 1px solid rgba(125, 211, 252, 0.28);
        }
        .hostly-inventory-future-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .hostly-inventory-future-chips span {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 750;
          color: rgba(71, 85, 105, 0.78);
          background: rgba(255, 255, 255, 0.55);
          border: 1px solid var(--hostly-table-divider-soft);
        }
        .hostly-inventory-fiche-section--movements {
          padding: 9px 10px 10px;
          background: rgba(248, 250, 252, 0.55);
        }
        .hostly-inventory-movements-empty {
          margin: 0;
          font-size: 11px;
          font-weight: 650;
          color: rgba(100, 116, 139, 0.88);
          line-height: 1.35;
        }
        .hostly-inventory-movements-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 6px;
        }
        .hostly-inventory-movements-row {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) auto auto auto;
          gap: 8px 10px;
          align-items: center;
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid var(--hostly-table-divider-soft);
          font-size: 11px;
        }
        .hostly-inventory-movements-date {
          color: #64748b;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-movements-delta {
          font-weight: 850;
          font-variant-numeric: tabular-nums;
          color: var(--hostly-ink-strong);
        }
        .hostly-inventory-movements-delta[data-sign="plus"] {
          color: #0f766e;
        }
        .hostly-inventory-movements-delta[data-sign="minus"] {
          color: #b45309;
        }
        .hostly-inventory-movements-final {
          font-weight: 750;
          color: #334155;
          font-variant-numeric: tabular-nums;
        }
        .hostly-inventory-movements-kind {
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(100, 116, 139, 0.85);
          justify-self: end;
          white-space: nowrap;
        }
        .hostly-inventory-panel-footer {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid rgba(100, 116, 139, 0.12);
          background: rgba(247, 252, 255, 0.92);
          backdrop-filter: blur(8px);
        }
        .hostly-inventory-panel-footer .hostly-inventory-primary-btn {
          min-width: 112px;
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
          .hostly-inventory-config-panel {
            flex: none;
          }
          .hostly-inventory-config-body {
            flex: none;
            overflow: visible;
            min-height: 0;
          }
          .hostly-inventory-fiche-grid {
            grid-template-columns: 1fr;
          }
          .hostly-inventory-panel-footer {
            align-items: stretch;
            flex-direction: column;
          }
          .hostly-inventory-movements-row {
            grid-template-columns: 1fr;
            justify-items: start;
          }
          .hostly-inventory-movements-kind {
            justify-self: start;
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

