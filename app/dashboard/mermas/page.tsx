"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import ModulePageShell from "@/components/module-page-shell";
import {
  type MermaLocal,
  type MermaMotivo,
  MERMA_MOTIVOS,
  formatFechaMerma,
  loadMermas,
  newMermaId,
  saveMermas,
} from "@/lib/mermas-local";
import { reconcileMermaStock, undoMermaStockEffect } from "@/lib/mermas-stock-sync";
import type { StockProducto } from "@/lib/stock-local";
import { loadStock, saveStock } from "@/lib/stock-local";

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
  gap: "12px",
  padding: "14px 0",
  borderBottom: "1px solid #243244",
  color: "white",
  fontSize: "16px",
  alignItems: "center",
};

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

function parseCantidadInput(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export default function MermasPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<MermaLocal[]>([]);
  const [stockRows, setStockRows] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFecha, setDraftFecha] = useState("");
  const [draftProductoId, setDraftProductoId] = useState("");
  const [draftCantidad, setDraftCantidad] = useState("");
  const [draftMotivo, setDraftMotivo] = useState<MermaMotivo>("otro");
  const [draftNotas, setDraftNotas] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(loadMermas());
    setStockRows(loadStock());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return b.id.localeCompare(a.id);
    });
  }, [items]);

  const isoToday = todayIso();
  const mermasHoy = useMemo(() => items.filter((m) => m.fecha === isoToday).length, [items, isoToday]);

  function openCreate() {
    setEditingId(null);
    setDraftFecha(isoToday);
    setDraftProductoId("");
    setDraftCantidad("");
    setDraftMotivo("otro");
    setDraftNotas("");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function openEdit(m: MermaLocal) {
    setEditingId(m.id);
    setDraftFecha(m.fecha);
    setDraftProductoId(m.producto_stock_id);
    setDraftCantidad(String(m.cantidad));
    setDraftMotivo(m.motivo);
    setDraftNotas(m.notas ?? "");
    setFormError(null);
    setFormOpen(true);
    setStockRows(loadStock());
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function submit() {
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFecha.trim())) {
      setFormError("Fecha no válida.");
      return;
    }
    const pid = draftProductoId.trim();
    if (!pid) {
      setFormError("Elige un producto del inventario.");
      return;
    }
    const qty = parseCantidadInput(draftCantidad);
    if (qty == null) {
      setFormError("Indica una cantidad mayor que cero.");
      return;
    }
    const stock = loadStock();
    const p = stock.find((x) => x.id === pid);
    const prev =
      editingId != null ? (loadMermas().find((x) => x.id === editingId) ?? null) : null;
    const nextRaw: MermaLocal = {
      id: editingId ?? newMermaId(),
      fecha: draftFecha.trim(),
      producto_stock_id: pid,
      producto_stock_nombre: p?.nombre ?? "",
      unidad: p?.unidad ?? "uds",
      cantidad: qty,
      motivo: draftMotivo,
      notas: draftNotas.trim() || undefined,
      stock_aplicado: false,
    };
    const { stock: newStock, merma, error } = reconcileMermaStock(prev, nextRaw, stock);
    if (error) {
      setFormError(error);
      return;
    }
    const nextMermas =
      editingId != null
        ? loadMermas().map((x) => (x.id === editingId ? merma : x))
        : [...loadMermas(), merma];
    saveMermas(nextMermas);
    saveStock(newStock);
    setItems(nextMermas);
    setStockRows(newStock);
    closeForm();
  }

  function remove(id: string) {
    if (!window.confirm(t("mermas.confirmDelete"))) return;
    const m = loadMermas().find((x) => x.id === id);
    if (!m) return;
    let st = loadStock();
    st = undoMermaStockEffect(m, st);
    const nextMermas = loadMermas().filter((x) => x.id !== id);
    saveMermas(nextMermas);
    saveStock(st);
    setItems(nextMermas);
    setStockRows(st);
    if (editingId === id) closeForm();
  }

  if (!hydrated) {
    return (
      <ModulePageShell title={t("mermas.title")} subtitle={t("mermas.loadingSubtitle")}>
        <p style={{ color: "#94a3b8" }}>{t("common.preparing")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title={t("mermas.title")}
      subtitle={t("mermas.subtitle")}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "24px",
          marginBottom: "30px",
        }}
      >
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "20px" }}>
          <h2 style={{ color: "white", margin: 0 }}>{t("mermas.today")}</h2>
          <p style={{ color: "#94a3b8", marginTop: "10px" }}>
            {mermasHoy} {mermasHoy === 1 ? t("mermas.recordSingular") : t("mermas.recordPlural")}
          </p>
        </div>
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "20px" }}>
          <h2 style={{ color: "white", margin: 0 }}>{t("mermas.totalRegistered")}</h2>
          <p style={{ color: "#94a3b8", marginTop: "10px" }}>{items.length}</p>
        </div>
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "20px" }}>
          <h2 style={{ color: "white", margin: 0 }}>{t("mermas.inventoryCard")}</h2>
          <p style={{ color: "#94a3b8", marginTop: "10px" }}>{t("mermas.productsInInventory", { count: stockRows.length })}</p>
        </div>
      </div>

      <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h3 style={{ color: "white", margin: 0, fontSize: "24px" }}>{t("mermas.registerTitle")}</h3>
          <button
            type="button"
            onClick={openCreate}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              padding: "10px 16px",
              borderRadius: "12px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "15px",
            }}
          >
            {t("mermas.addMerma")}
          </button>
        </div>

        {formOpen ? (
          <div
            style={{
              marginBottom: 24,
              padding: 20,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f172a",
            }}
          >
            <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: 14 }}>{t("mermas.formHint")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" value={draftFecha} onChange={(e) => setDraftFecha(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Producto</label>
                <select
                  value={draftProductoId}
                  onChange={(e) => setDraftProductoId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Seleccionar…</option>
                  {stockRows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.stock_actual} {p.unidad}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cantidad</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={draftCantidad}
                  onChange={(e) => setDraftCantidad(e.target.value)}
                  placeholder="Ej. 1,5"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Motivo</label>
                <select
                  value={draftMotivo}
                  onChange={(e) => setDraftMotivo(e.target.value as MermaMotivo)}
                  style={inputStyle}
                >
                  {MERMA_MOTIVOS.map((mo) => (
                    <option key={mo} value={mo}>
                      {mo}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notas (opcional)</label>
                <input
                  value={draftNotas}
                  onChange={(e) => setDraftNotas(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 12, marginBottom: 0 }}>{formError}</p>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submit}
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Guardar merma
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "#e2e8f0",
                  padding: "10px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: "24px 0", textAlign: "center" }}>
            No hay mermas. Pulsa «+ Añadir merma» para registrar la primera.
          </p>
        ) : (
          <>
            <div
              style={{
                ...rowStyle,
                fontWeight: 700,
                fontSize: 12,
                color: "#94a3b8",
                textTransform: "uppercase",
                borderBottom: "1px solid #334155",
              }}
            >
              <span>Producto</span>
              <span>Cantidad</span>
              <span>Motivo</span>
              <span>Fecha</span>
              <span style={{ textAlign: "right" }}>Acciones</span>
            </div>
            {sorted.map((m) => (
              <div key={m.id} style={rowStyle}>
                <span>{m.producto_stock_nombre}</span>
                <span>
                  {m.cantidad} {m.unidad}
                </span>
                <span style={{ textTransform: "capitalize" }}>{m.motivo}</span>
                <span style={{ color: m.fecha === isoToday ? "#f97316" : "#eab308" }}>
                  {formatFechaMerma(m.fecha)}
                </span>
                <span style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    style={{
                      border: "1px solid #475569",
                      background: "#0f172a",
                      color: "#e2e8f0",
                      padding: "6px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    style={{
                      border: "1px solid rgba(239,68,68,0.4)",
                      background: "rgba(239,68,68,0.12)",
                      color: "#fca5a5",
                      padding: "6px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Eliminar
                  </button>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </ModulePageShell>
  );
}
