"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type CompraEstado,
  type CompraLocal,
  COMPRA_ESTADOS,
  formatFechaCompra,
  loadCompras,
  newCompraId,
  parseCantidadRecibida as coercedCantidadRecibida,
  saveCompras,
} from "@/lib/compras-local";
import { reconcileCompraStock, undoCompraStockEffect } from "@/lib/compras-stock-sync";
import type { StockProducto } from "@/lib/stock-local";
import { loadStock, saveStock } from "@/lib/stock-local";

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

function rowTone(estado: CompraEstado): { bg: string; border: string } {
  switch (estado) {
    case "recibido":
      return { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.25)" };
    case "cancelado":
      return { bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.25)" };
    default:
      return { bg: "transparent", border: "transparent" };
  }
}

function parseTotal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseCantidadRecibida(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function inventarioDesdeCompra(
  c: CompraLocal,
  ps: StockProducto[],
  notLinkedLabel: string,
  defaultProductName: string,
): string {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if (!c.producto_stock_id || qty == null || qty <= 0) {
    return notLinkedLabel;
  }
  const live = ps.find((p) => p.id === c.producto_stock_id);
  const name = (c.producto_stock_nombre?.trim() || live?.nombre || "").trim() || defaultProductName;
  const u = c.unidad || live?.unidad || "";
  return `${name} · ${qty} ${u}`.trim();
}

export default function ComprasPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [productosStock, setProductosStock] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftProveedor, setDraftProveedor] = useState("");
  const [draftFecha, setDraftFecha] = useState("");
  const [draftEstado, setDraftEstado] = useState<CompraEstado>("pendiente");
  const [draftTotal, setDraftTotal] = useState("");
  const [draftNotas, setDraftNotas] = useState("");
  const [draftStockProductoId, setDraftStockProductoId] = useState("");
  const [draftCantidad, setDraftCantidad] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Id de compra en edición: ref evita que el submit pierda el id por cierre/desincronía de estado. */
  const editingIdRef = useRef<string | null>(null);

  const refreshStock = useCallback(() => {
    setProductosStock(loadStock());
  }, []);

  const persistCompras = useCallback((next: CompraLocal[]) => {
    setItems(next);
    saveCompras(next);
  }, []);

  useEffect(() => {
    setItems(loadCompras());
    refreshStock();
    setHydrated(true);
  }, [refreshStock]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return b.id.localeCompare(a.id);
    });
  }, [items]);

  function openCreate() {
    editingIdRef.current = null;
    setEditingId(null);
    setDraftProveedor("");
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setDraftFecha(iso);
    setDraftEstado("pendiente");
    setDraftTotal("");
    setDraftNotas("");
    setDraftStockProductoId("");
    setDraftCantidad("");
    setFormError(null);
    setFormOpen(true);
    refreshStock();
  }

  function openEdit(c: CompraLocal) {
    editingIdRef.current = c.id;
    setEditingId(c.id);
    setDraftProveedor(c.proveedor);
    setDraftFecha(c.fecha);
    setDraftEstado(c.estado);
    setDraftTotal(String(c.total));
    setDraftNotas(c.notas ?? "");
    setDraftStockProductoId(c.producto_stock_id ?? "");
    setDraftCantidad(c.cantidad_recibida != null ? String(c.cantidad_recibida) : "");
    setFormError(null);
    setFormOpen(true);
    refreshStock();
  }

  function closeForm() {
    setFormOpen(false);
    editingIdRef.current = null;
    setEditingId(null);
    setFormError(null);
  }

  function buildCompraFromDraft(id: string): CompraLocal {
    const stockList = loadStock();
    const proveedor = draftProveedor.trim();
    const total = parseTotal(draftTotal) ?? 0;
    const notasTrim = draftNotas.trim();
    const notas = notasTrim ? notasTrim : undefined;
    const sid = draftStockProductoId.trim();
    const p = sid ? stockList.find((x) => x.id === sid) : undefined;
    const cantidad = parseCantidadRecibida(draftCantidad);
    return {
      id,
      proveedor,
      fecha: draftFecha.trim(),
      estado: draftEstado,
      total,
      notas,
      producto_stock_id: sid || undefined,
      producto_stock_nombre: p?.nombre,
      unidad: p?.unidad,
      cantidad_recibida: cantidad,
      stock_aplicado: false,
    };
  }

  function submitForm() {
    setFormError(null);
    const proveedor = draftProveedor.trim();
    if (!proveedor) {
      setFormError(t("compras.errorRequireSupplier"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFecha.trim())) {
      setFormError(t("compras.errorInvalidDate"));
      return;
    }
    const total = parseTotal(draftTotal);
    if (total === null) {
      setFormError(t("compras.errorTotalInvalid"));
      return;
    }

    const idEdit = editingIdRef.current;
    const stock = loadStock();
    const persisted = loadCompras();
    const prev =
      idEdit != null
        ? persisted.find((c) => c.id === idEdit) ?? items.find((c) => c.id === idEdit) ?? null
        : null;
    const nextRaw = buildCompraFromDraft(idEdit ?? newCompraId());
    const { stock: newStock, compra } = reconcileCompraStock(prev, nextRaw, stock);
    saveStock(newStock);

    const nextList = idEdit
      ? persisted.map((c) => (c.id === idEdit ? compra : c))
      : [...persisted, compra];
    persistCompras(nextList);
    refreshStock();
    if (idEdit) {
      setNotice(t("compras.noticeUpdated"));
    } else {
      setNotice(t("compras.noticeCreated"));
    }
    closeForm();
    window.setTimeout(() => setNotice(null), 3200);
  }

  function removeCompra(id: string) {
    if (!window.confirm(t("compras.confirmDelete"))) return;
    const c = loadCompras().find((x) => x.id === id);
    if (!c) return;
    let st = loadStock();
    st = undoCompraStockEffect(c, st);
    saveStock(st);
    const nextList = loadCompras().filter((x) => x.id !== id);
    persistCompras(nextList);
    refreshStock();
    setNotice(t("compras.noticeDeleted"));
    window.setTimeout(() => setNotice(null), 3200);
    if (editingId === id) closeForm();
  }

  function updateEstado(id: string, estado: CompraEstado) {
    const prev = loadCompras().find((c) => c.id === id);
    if (!prev || prev.estado === estado) return;
    const nextRaw: CompraLocal = { ...prev, estado };
    const stock = loadStock();
    const { stock: newStock, compra } = reconcileCompraStock(prev, nextRaw, stock);
    saveStock(newStock);
    const nextList = loadCompras().map((c) => (c.id === id ? compra : c));
    persistCompras(nextList);
    refreshStock();
    setNotice(t("compras.noticeEstadoUpdated"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  if (!hydrated) {
    return (
      <ModulePageShell title={t("compras.title")} subtitle={t("compras.loadingSubtitle")} maxWidth={1180}>
        <p style={{ color: "#94a3b8" }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("compras.title")}
      subtitle={t("compras.subtitle")}
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
          {t("compras.newPurchase")}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {notice ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              color: "#93c5fd",
              fontSize: 14,
            }}
          >
            {notice}
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
              {editingId ? t("compras.editPurchase") : t("compras.newPurchaseForm")}
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", lineHeight: 1.45 }}>
              {t("compras.formHintBeforeStrong")}{" "}
              <strong>{t("compras.received")}</strong>
              {t("compras.formHintAfterStrong")}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>{t("common.supplier")}</label>
                <input
                  value={draftProveedor}
                  onChange={(e) => setDraftProveedor(e.target.value)}
                  placeholder={t("compras.placeholderSupplier")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("common.date")}</label>
                <input type="date" value={draftFecha} onChange={(e) => setDraftFecha(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t("common.status")}</label>
                <select
                  value={draftEstado}
                  onChange={(e) => setDraftEstado(e.target.value as CompraEstado)}
                  style={inputStyle}
                >
                  {COMPRA_ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("compras.totalEuro")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={draftTotal}
                  onChange={(e) => setDraftTotal(e.target.value)}
                  placeholder={t("compras.placeholderTotalZero")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("compras.optionalInventoryProduct")}</label>
                <select
                  value={draftStockProductoId}
                  onChange={(e) => setDraftStockProductoId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{t("compras.notLinked")}</option>
                  {productosStock.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.unidad})
                    </option>
                  ))}
                </select>
                {draftStockProductoId ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                    {t("compras.inventoryUnitHint")}{" "}
                    <strong style={{ color: "#94a3b8" }}>
                      {productosStock.find((p) => p.id === draftStockProductoId)?.unidad ?? t("common.emDash")}
                    </strong>
                  </p>
                ) : null}
              </div>
              <div>
                <label style={labelStyle}>{t("compras.qtyReceivedOptional")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={draftCantidad}
                  onChange={(e) => setDraftCantidad(e.target.value)}
                  placeholder={t("compras.qtyPlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>{t("common.notesOptional")}</label>
                <textarea
                  value={draftNotas}
                  onChange={(e) => setDraftNotas(e.target.value)}
                  placeholder={t("compras.placeholderNotes")}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
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
                {t("common.saveChanges")}
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
                {t("common.cancel")}
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
              <p style={{ margin: "0 0 16px", fontSize: 16 }}>{t("compras.noPurchases")}</p>
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
                {t("compras.createFirst")}
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr style={{ background: "#0f172a", textAlign: "left" }}>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                      {t("common.supplier")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                      {t("common.date")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                      {t("common.status")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                      {t("common.total")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                      {t("common.inventory")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                      {t("common.notes")}
                    </th>
                    <th style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const tone = rowTone(c.estado);
                    const invLabel = inventarioDesdeCompra(
                      c,
                      productosStock,
                      t("compras.notLinked"),
                      t("common.product"),
                    );
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderTop: "1px solid #334155",
                          background: tone.bg,
                          boxShadow:
                            c.estado !== "pendiente" ? `inset 0 0 0 1px ${tone.border}` : undefined,
                        }}
                      >
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#f8fafc" }}>{c.proveedor}</td>
                        <td style={{ padding: "14px 16px", color: "#cbd5e1" }}>{formatFechaCompra(c.fecha)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <select
                            value={c.estado}
                            onChange={(e) => updateEstado(c.id, e.target.value as CompraEstado)}
                            aria-label={t("compras.ariaPurchaseStatus", { supplier: c.proveedor })}
                            style={{
                              ...inputStyle,
                              maxWidth: 160,
                              cursor: "pointer",
                            }}
                          >
                            {COMPRA_ESTADOS.map((e) => (
                              <option key={e} value={e}>
                                {e.charAt(0).toUpperCase() + e.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                            color: "#e2e8f0",
                          }}
                        >
                          {formatEuro(c.total)}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 13, color: "#cbd5e1" }}>
                          <div>{invLabel}</div>
                          {c.stock_aplicado ? (
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: 6,
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                background: "rgba(34, 197, 94, 0.15)",
                                color: "#86efac",
                                border: "1px solid rgba(34, 197, 94, 0.28)",
                              }}
                            >
                              {t("compras.appliedToStock")}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            color: c.notas ? "#94a3b8" : "#64748b",
                            fontSize: 14,
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={c.notas ?? undefined}
                        >
                          {c.notas ?? t("common.emDash")}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
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
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCompra(c.id)}
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
                            {t("common.delete")}
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
      </div>
    </ModulePageShell>
  );
}
