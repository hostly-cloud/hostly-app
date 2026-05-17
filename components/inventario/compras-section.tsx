"use client";

import type { CSSProperties } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { HostlyComprasCrossNavClient } from "@/components/hostly-cross-module-nav";
import ModulePageShell from "@/components/module-page-shell";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
import {
  type CompraEstado,
  type CompraLocal,
  COMPRA_ESTADOS,
  loadCompras,
  newCompraId,
  parseCantidadRecibida as coercedCantidadRecibida,
  saveCompras,
} from "@/lib/compras-local";
import type { CanonicalSupplier } from "@/lib/suppliers";
import { resolveSupplierForSave, suggestSuppliers, supplierLegalSubtitle, supplierPrimaryLabel } from "@/lib/suppliers";
import { reconcileCompraStock, undoCompraStockEffect } from "@/lib/compras-stock-sync";
import { syncReceivedCompraToFirestoreIfConfigured } from "@/lib/hostly/sync-received-compra-firestore";
import type { StockProducto } from "@/lib/stock-local";
import { loadStock, saveStock } from "@/lib/stock-local";

type CompraListFilter = "todas" | "pendiente" | "recibido" | "cancelado";

type CompraListSort = "fecha_desc" | "fecha_asc" | "importe_desc" | "importe_asc";

type OperationalFocus = "pendientes" | "entregas" | "sin_factura" | "sin_vincular";

const QUICK_CREATE_ESTADOS = ["pendiente", "recibido"] as const satisfies readonly CompraEstado[];

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box" as const,
  boxShadow: "var(--hostly-shadow-hairline)",
} satisfies CSSProperties;

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.055em",
  textTransform: "uppercase" as const,
  color: "var(--hostly-ink-muted)",
  marginBottom: 6,
} satisfies CSSProperties;

/** Select en filas: control principal, táctil y claro. */
const selectRow: CSSProperties = {
  padding: "12px 10px",
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.2,
  minWidth: 120,
  minHeight: 48,
  maxWidth: "100%",
  borderRadius: 10,
  border: "1px solid var(--hostly-line-strong)",
  backgroundColor: "#ffffff",
  color: "var(--hostly-ink)",
  cursor: "pointer",
  boxSizing: "border-box",
};

function rowTone(estado: CompraEstado): { bg: string; border: string; stripe: string } {
  switch (estado) {
    case "recibido":
      return {
        bg: "linear-gradient(90deg, rgba(232, 244, 239, 0.95) 0%, rgba(255, 255, 255, 0.98) 52%)",
        border: "rgba(54, 86, 116, 0.16)",
        stripe: "rgba(49, 95, 125, 0.5)",
      };
    case "cancelado":
      return {
        bg: "linear-gradient(90deg, rgba(245, 232, 232, 0.92) 0%, rgba(255, 255, 255, 0.97) 48%)",
        border: "rgba(248, 113, 113, 0.22)",
        stripe: "rgba(220, 38, 38, 0.55)",
      };
    case "pendiente":
      return {
        bg: "linear-gradient(90deg, rgba(245, 237, 220, 0.95) 0%, rgba(255, 255, 255, 0.98) 45%)",
        border: "rgba(251, 191, 36, 0.28)",
        stripe: "rgba(217, 119, 6, 0.72)",
      };
    default:
      return {
        bg: "rgba(255, 255, 255, 0.94)",
        border: "rgba(54, 86, 116, 0.14)",
        stripe: "rgba(54, 86, 116, 0.22)",
      };
  }
}

/** Incidencia de stock no aplicado: refuerzo suave del ribete sin subir altura de fila. */
function rowToneWithSync(
  estado: CompraEstado,
  syncKind: "applied" | "not_applied" | "neutral",
): { bg: string; border: string; stripe: string } {
  const base = rowTone(estado);
  if (syncKind !== "not_applied") return base;
  return {
    ...base,
    stripe: "rgba(251, 146, 60, 0.45)",
    border: "rgba(251, 146, 60, 0.14)",
  };
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

function formatEuro(n: number, loc: "es" | "en"): string {
  return new Intl.NumberFormat(loc === "en" ? "en-GB" : "es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function formatFechaCorta(iso: string, loc: "es" | "en"): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso;
  try {
    const [y, m, d] = t.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(loc === "en" ? "en-GB" : "es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatQuickEstimatedUnitAmount(n: number, locale: "es" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

/** Precio unitario guardado en una compra (total ÷ cantidad); excluye datos incompletos. */
function unitPriceFromStoredCompra(c: CompraLocal): number | null {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  const id = c.producto_stock_id?.trim();
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : NaN;
  if (!id || qty == null || qty <= 0 || !(total > 0)) return null;
  return total / qty;
}

/** Último precio unitario conocido para el producto (por fecha e id, más reciente primero). */
function lastHistoricalUnitPriceForProduct(items: CompraLocal[], productId: string): number | null {
  const ordered = [...items].sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    return b.id.localeCompare(a.id);
  });
  for (const c of ordered) {
    if (c.estado === "cancelado") continue;
    if ((c.producto_stock_id ?? "").trim() !== productId) continue;
    const u = unitPriceFromStoredCompra(c);
    if (u != null) return u;
  }
  return null;
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatPercentForWarning(n: number, locale: "es" | "en"): string {
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions =
    abs > 0 && abs < 10 ? { maximumFractionDigits: 1, minimumFractionDigits: 0 } : { maximumFractionDigits: 0, minimumFractionDigits: 0 };
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", opts).format(n);
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

function estadoLabelCompra(estado: CompraEstado, t: (key: string) => string): string {
  switch (estado) {
    case "pendiente":
      return t("dashboard.compraEstadoPendiente");
    case "recibido":
      return t("dashboard.compraEstadoRecibido");
    case "cancelado":
      return t("dashboard.compraEstadoCancelado");
    default:
      return estado;
  }
}

const estadoSelectLook: Record<CompraEstado, { border: string; bg: string; color: string }> = {
  recibido: {
    border: "rgba(49, 95, 125, 0.35)",
    bg: "rgba(232, 244, 239, 0.92)",
    color: "var(--hostly-ink-strong)",
  },
  pendiente: {
    border: "rgba(217, 119, 6, 0.42)",
    bg: "rgba(254, 243, 199, 0.88)",
    color: "#78350f",
  },
  cancelado: {
    border: "rgba(220, 38, 38, 0.34)",
    bg: "rgba(254, 226, 226, 0.82)",
    color: "#7f1d1d",
  },
};

/** Separador vertical fino entre segmentos de meta (proveedor). */
const metaHairlineSep: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 9,
  margin: "0 8px",
  background: "var(--hostly-line)",
  borderRadius: 1,
  verticalAlign: "middle",
  flexShrink: 0,
};

function stockSyncUiKind(c: CompraLocal): "applied" | "not_applied" | "neutral" {
  if ((c.inventory_receipt_id ?? "").trim()) return "applied";
  if (c.stock_aplicado) return "applied";
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if (c.estado === "recibido" && (c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return "not_applied";
  return "neutral";
}

function todayIsoLocal(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Recibido sin referencia documental reconocible en notas (heurística local). */
function compraSinFacturaDoc(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  const n = (c.notas ?? "").trim();
  if (n === "") return true;
  return !/\b(factura|fact\.|albar[aá]n|invoice|ticket|n[ºo]\s*[\w\d-]|#\s*\d)/i.test(n);
}

function entregaProximaPredicate(c: CompraLocal, today: string, weekEnd: string): boolean {
  if (c.estado !== "pendiente") return false;
  return c.fecha === today || (c.fecha > today && c.fecha <= weekEnd);
}

function rowPurchaseTypeLabel(c: CompraLocal, tf: (key: string) => string): string {
  const n = normalizeForSearch(c.notas ?? "");
  if (n.includes("semanal") || n.includes("weekly")) return tf("compras.rowTypeWeekly");
  if (n.includes("mensual") || n.includes("monthly")) return tf("compras.rowTypeMonthly");
  if (n.includes("urgente") || n.includes("urgent")) return tf("compras.rowTypeUrgent");
  if (n.includes("fresco") || n.includes("fresh")) return tf("compras.rowTypeFresh");
  return tf("compras.rowTypeDefault");
}

function rowLineItemCount(c: CompraLocal): number {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if ((c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return 1;
  return 0;
}

function rowOperationalHints(c: CompraLocal, tf: (key: string) => string): string[] {
  const hints: string[] = [];
  if (compraSinFacturaDoc(c)) hints.push(tf("compras.hintSinFactura"));
  if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) hints.push(tf("compras.hintSinVincular"));
  if (stockSyncUiKind(c) === "not_applied") hints.push(tf("compras.hintStockPendiente"));
  return hints;
}

export type HostlyComprasSectionProps = {
  /**
   * When true, renders only the compras module body (no `ModulePageShell`).
   * Used inside Inventario and other parents that already provide layout chrome.
   */
  embedded?: boolean;
};

export default function HostlyComprasSection({ embedded = false }: HostlyComprasSectionProps) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [productosStock, setProductosStock] = useState<StockProducto[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftProveedor, setDraftProveedor] = useState("");
  const [supplierSuggestOpen, setSupplierSuggestOpen] = useState(false);
  const [draftFecha, setDraftFecha] = useState("");
  const [draftEstado, setDraftEstado] = useState<CompraEstado>("pendiente");
  const [draftTotal, setDraftTotal] = useState("");
  const [draftNotas, setDraftNotas] = useState("");
  const [draftStockProductoId, setDraftStockProductoId] = useState("");
  const [draftCantidad, setDraftCantidad] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<CompraListFilter>("todas");
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<CompraListSort>("fecha_desc");
  const [operFocus, setOperFocus] = useState<OperationalFocus | null>(null);
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);
  /** Id de compra en edición: ref evita que el submit pierda el id por cierre/desincronía de estado. */
  const editingIdRef = useRef<string | null>(null);

  const draftSupplierSuggestions = useMemo(() => suggestSuppliers(draftProveedor), [draftProveedor]);

  const draftPrecioUnitario = useMemo(() => {
    const total = parseTotal(draftTotal);
    const qty = parseCantidadRecibida(draftCantidad);
    if (total === null || total <= 0 || qty === undefined || qty <= 0) return null;
    return total / qty;
  }, [draftTotal, draftCantidad]);

  const quickPriceIncreaseWarning = useMemo(() => {
    if (editingId != null) return null;
    const pid = draftStockProductoId.trim();
    if (!pid || draftPrecioUnitario == null) return null;
    const previous = lastHistoricalUnitPriceForProduct(items, pid);
    if (previous == null) return null;
    const prevScaled = Math.round(previous * 10000);
    const newScaled = Math.round(draftPrecioUnitario * 10000);
    if (newScaled <= prevScaled) return null;
    const pctRaw = ((draftPrecioUnitario - previous) / previous) * 100;
    return { pctLabel: formatPercentForWarning(pctRaw, locale) };
  }, [editingId, draftStockProductoId, draftPrecioUnitario, items, locale]);

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

  useEffect(() => {
    if (!rowMenuOpenId) return;
    const close = () => setRowMenuOpenId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [rowMenuOpenId]);

  const operationalCounts = useMemo(() => {
    const today = todayIsoLocal();
    const weekEnd = addDaysIso(today, 7);
    let pendientes = 0;
    let entregas = 0;
    let sinFactura = 0;
    let sinVincular = 0;
    for (const c of items) {
      if (c.estado === "pendiente") pendientes += 1;
      if (entregaProximaPredicate(c, today, weekEnd)) entregas += 1;
      if (compraSinFacturaDoc(c)) sinFactura += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVincular += 1;
    }
    return { pendientes, entregas, sinFactura, sinVincular };
  }, [items]);

  const resumenCompras = useMemo(() => {
    const totalCount = items.length;
    const gastoTotal = items.reduce((acc, c) => {
      const n = c.total;
      return acc + (typeof n === "number" && Number.isFinite(n) ? n : 0);
    }, 0);
    const pendientes = items.filter((c) => c.estado === "pendiente").length;
    const recibidas = items.filter((c) => c.estado === "recibido").length;
    return { totalCount, gastoTotal, pendientes, recibidas };
  }, [items]);

  const displayedRows = useMemo(() => {
    const today = todayIsoLocal();
    const weekEnd = addDaysIso(today, 7);
    let list: CompraLocal[];
    if (operFocus === "pendientes") {
      list = items.filter((c) => c.estado === "pendiente");
    } else if (operFocus === "entregas") {
      list = items.filter((c) => entregaProximaPredicate(c, today, weekEnd));
    } else if (operFocus === "sin_factura") {
      list = items.filter((c) => compraSinFacturaDoc(c));
    } else if (operFocus === "sin_vincular") {
      list = items.filter((c) => c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim());
    } else {
      list = listFilter === "todas" ? [...items] : items.filter((c) => c.estado === listFilter);
    }
    const q = normalizeForSearch(listSearch);
    if (q) {
      list = list.filter((c) => {
        const supplier = normalizeForSearch(
          [c.proveedor, c.supplierDisplayName, c.supplierLegalName, c.supplierInput].filter(Boolean).join(" "),
        );
        const notas = normalizeForSearch(c.notas ?? "");
        const prodStored = normalizeForSearch(c.producto_stock_nombre ?? "");
        const live = productosStock.find((p) => p.id === c.producto_stock_id);
        const prodLive = normalizeForSearch(live?.nombre ?? "");
        const fecha = normalizeForSearch(c.fecha);
        return (
          supplier.includes(q) ||
          notas.includes(q) ||
          prodStored.includes(q) ||
          prodLive.includes(q) ||
          fecha.includes(q)
        );
      });
    }
    list.sort((a, b) => {
      const ta = typeof a.total === "number" && Number.isFinite(a.total) ? a.total : 0;
      const tb = typeof b.total === "number" && Number.isFinite(b.total) ? b.total : 0;
      switch (listSort) {
        case "fecha_asc":
          return a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);
        case "importe_desc":
          return tb - ta || b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id);
        case "importe_asc":
          return ta - tb || a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);
        case "fecha_desc":
        default:
          return b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id);
      }
    });
    return list;
  }, [items, listFilter, listSearch, listSort, productosStock, operFocus]);

  function resetQuickCreateDrafts() {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setDraftProveedor("");
    setSupplierSuggestOpen(false);
    setDraftFecha(iso);
    setDraftEstado("pendiente");
    setDraftTotal("");
    setDraftNotas("");
    setDraftStockProductoId("");
    setDraftCantidad("");
    setFormError(null);
  }

  function openCreate() {
    editingIdRef.current = null;
    setEditingId(null);
    setSupplierSuggestOpen(false);
    resetQuickCreateDrafts();
    setFormOpen(true);
    refreshStock();
  }

  function openEdit(c: CompraLocal) {
    editingIdRef.current = c.id;
    setEditingId(c.id);
    setDraftProveedor((c.supplierInput ?? c.supplierDisplayName ?? c.proveedor).trim());
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
    setSupplierSuggestOpen(false);
    editingIdRef.current = null;
    setEditingId(null);
    setFormError(null);
  }

  function pickCompraSupplierSuggestion(s: CanonicalSupplier) {
    setDraftProveedor(s.displayName);
    setSupplierSuggestOpen(false);
  }

  function buildCompraFromDraft(id: string, prevPreserve: CompraLocal | null): CompraLocal {
    const stockList = loadStock();
    const resolved = resolveSupplierForSave(draftProveedor);
    const total = parseTotal(draftTotal) ?? 0;
    const notasTrim = draftNotas.trim();
    const notas = notasTrim ? notasTrim : undefined;
    const sid = draftStockProductoId.trim();
    const p = sid ? stockList.find((x) => x.id === sid) : undefined;
    const cantidad = parseCantidadRecibida(draftCantidad);
    const isEdit = prevPreserve != null && prevPreserve.id === id;
    const next: CompraLocal = isEdit
      ? {
          ...prevPreserve,
          id,
          proveedor: resolved.proveedor,
          fecha: draftFecha.trim(),
          estado: draftEstado,
          total,
          notas,
          producto_stock_id: sid || undefined,
          producto_stock_nombre: p?.nombre,
          unidad: p?.unidad,
          cantidad_recibida: cantidad,
          stock_aplicado: false,
        }
      : {
          id,
          proveedor: resolved.proveedor,
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

    if (resolved.supplierId) {
      next.supplierId = resolved.supplierId;
      next.supplierDisplayName = resolved.supplierDisplayName;
      next.supplierLegalName = resolved.supplierLegalName;
      next.supplierInput = resolved.supplierInput;
    } else {
      delete next.supplierId;
      delete next.supplierDisplayName;
      delete next.supplierLegalName;
      if (resolved.supplierInput) next.supplierInput = resolved.supplierInput;
      else delete next.supplierInput;
    }
    if (
      prevPreserve &&
      prevPreserve.id === id &&
      (prevPreserve.inventory_receipt_id ?? "").trim()
    ) {
      const prevPid = prevPreserve.producto_stock_id?.trim() ?? "";
      const prevQty = coercedCantidadRecibida(prevPreserve.cantidad_recibida as unknown);
      const sameLink =
        prevPid !== "" &&
        prevPid === sid &&
        prevQty != null &&
        cantidad != null &&
        prevQty === cantidad;
      if (sameLink) {
        next.inventory_receipt_id = prevPreserve.inventory_receipt_id;
      }
    }
    return next;
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
    const nextRaw = buildCompraFromDraft(idEdit ?? newCompraId(), prev);
    const { stock: newStock, compra } = reconcileCompraStock(prev, nextRaw, stock);
    saveStock(newStock);

    const nextList = idEdit
      ? persisted.map((c) => (c.id === idEdit ? compra : c))
      : [...persisted, compra];
    persistCompras(nextList);
    refreshStock();
    if (idEdit) {
      setNotice(t("compras.noticeUpdated"));
      closeForm();
    } else {
      setNotice(t("compras.noticeCreated"));
      resetQuickCreateDrafts();
    }
    window.setTimeout(() => setNotice(null), 3200);

    void syncReceivedCompraToFirestoreIfConfigured(compra).then((r) => {
      if (r.status === "synced") refreshStock();
      if (r.status !== "error") return;
      refreshStock();
      setNotice(
        r.code === "ALL_PRODUCTS_MISSING" ? t("compras.noticeFirestoreProductsMissing") : t("compras.noticeFirestoreSyncError"),
      );
      window.setTimeout(() => setNotice(null), 4200);
    });
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

    void syncReceivedCompraToFirestoreIfConfigured(compra).then((r) => {
      if (r.status === "synced") refreshStock();
      if (r.status !== "error") return;
      refreshStock();
      setNotice(
        r.code === "ALL_PRODUCTS_MISSING" ? t("compras.noticeFirestoreProductsMissing") : t("compras.noticeFirestoreSyncError"),
      );
      window.setTimeout(() => setNotice(null), 4200);
    });
  }

  if (!hydrated) {
    if (embedded) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <p style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>{t("common.preparingData")}</p>
        </div>
      );
    }
    return (
      <ModulePageShell
        title={t("compras.title")}
        subtitle={t("compras.loadingSubtitle")}
        maxWidth={1000}
        compactLayout
        operationalFocus
        lockViewport
      >
        <p style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  const selectedStockProduct = draftStockProductoId
    ? productosStock.find((p) => p.id === draftStockProductoId)
    : undefined;

  const quickUnitSuffix =
    selectedStockProduct?.unidad?.trim() !== "" && selectedStockProduct?.unidad != null
      ? `€/${selectedStockProduct.unidad.trim()}`
      : t("compras.quickEstimatedUnitBareEuro");

  const quickUnitPriceHighlightLine =
    draftPrecioUnitario != null
      ? `${t("compras.quickUnitPriceHighlightLabel")} ${formatQuickEstimatedUnitAmount(draftPrecioUnitario, locale)} ${quickUnitSuffix}`
      : null;

  function renderNewPurchaseButton() {
    return (
      <button
        type="button"
        onClick={openCreate}
        style={{
          border: "1px solid rgba(34, 197, 94, 0.32)",
          background: "var(--hostly-success-soft)",
          color: "var(--hostly-navy-deep)",
          padding: "9px 14px",
          borderRadius: 10,
          fontWeight: 600,
          cursor: "pointer",
          fontSize: 13,
          lineHeight: 1.2,
          minHeight: 44,
          whiteSpace: "nowrap",
        }}
      >
        {t("compras.newPurchase")}
      </button>
    );
  }

  const moduleBody = (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .hostly-compras-chip {
              transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
              touch-action: manipulation;
            }
            .hostly-compras-chip.hostly-compras-chip-idle:hover {
              border-color: rgba(54, 86, 116, 0.22) !important;
              background: var(--hostly-surface-page-soft) !important;
              color: var(--hostly-ink-strong) !important;
              box-shadow: var(--hostly-shadow-hairline);
            }
            .hostly-compras-chip.hostly-compras-chip-idle:active {
              transform: scale(0.98);
            }
            .hostly-compras-chip.hostly-compras-chip-on:hover {
              filter: brightness(1.07);
            }
            .hostly-compras-chip.hostly-compras-chip-on:active {
              transform: scale(0.98);
            }
          `,
        }}
      />
      <div
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          paddingTop: 0,
          overflow: "hidden",
        }}
      >
        <Suspense fallback={null}>
          <HostlyComprasCrossNavClient />
        </Suspense>
        {notice ? (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--hostly-info-soft)",
              border: "1px solid rgba(59, 130, 246, 0.22)",
              color: "var(--hostly-navy-mid)",
              fontSize: 14,
              lineHeight: 1.35,
            }}
          >
            {notice}
          </div>
        ) : null}

        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          {[
            {
              label: t("compras.metricTotalPurchases"),
              value: String(resumenCompras.totalCount),
              valueColor: "var(--hostly-navy-deep)",
            },
            {
              label: t("compras.metricTotalSpend"),
              value: formatEuro(resumenCompras.gastoTotal, locale),
              valueColor: "#9a3412",
            },
            {
              label: t("compras.metricPending"),
              value: String(resumenCompras.pendientes),
              valueColor: "#b45309",
            },
            {
              label: t("compras.metricReceived"),
              value: String(resumenCompras.recibidas),
              valueColor: "#166534",
            },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                border: "1px solid var(--hostly-line)",
                borderRadius: 10,
                background: "var(--hostly-surface-card-solid)",
                padding: "8px 10px",
                minHeight: 68,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                boxSizing: "border-box",
                boxShadow: "var(--hostly-shadow-card)",
              }}
            >
              <div
                style={{
                  color: "var(--hostly-ink-muted)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  lineHeight: 1.25,
                }}
              >
                {m.label}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 20,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: m.valueColor,
                  lineHeight: 1.08,
                  letterSpacing: "-0.025em",
                }}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            overflowX: "auto",
            overflowY: "hidden",
            padding: "5px 0 6px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--hostly-ink-muted)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {t("compras.operFocusTitle")}
          </span>
          {(
            [
              {
                id: "pendientes" as const,
                label: t("compras.operChipPendientes"),
                n: operationalCounts.pendientes,
                idle: {
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-card-solid)",
                  color: "var(--hostly-ink-soft)",
                },
                act: {
                  border: "1px solid rgba(217, 119, 6, 0.35)",
                  background: "var(--hostly-warning-soft)",
                  color: "#92400e",
                  boxShadow: "inset 0 -2px 0 rgba(217, 119, 6, 0.35)",
                },
              },
              {
                id: "entregas" as const,
                label: t("compras.operChipEntregas"),
                n: operationalCounts.entregas,
                idle: {
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-card-solid)",
                  color: "var(--hostly-ink-soft)",
                },
                act: {
                  border: "1px solid rgba(49, 95, 125, 0.32)",
                  background: "var(--hostly-info-soft)",
                  color: "var(--hostly-navy-deep)",
                  boxShadow: "inset 0 -2px 0 rgba(49, 95, 125, 0.28)",
                },
              },
              {
                id: "sin_factura" as const,
                label: t("compras.operChipSinFactura"),
                n: operationalCounts.sinFactura,
                idle: {
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-card-solid)",
                  color: "var(--hostly-ink-soft)",
                },
                act: {
                  border: "1px solid rgba(220, 38, 38, 0.28)",
                  background: "var(--hostly-danger-soft)",
                  color: "#991b1b",
                  boxShadow: "inset 0 -2px 0 rgba(220, 38, 38, 0.28)",
                },
              },
              {
                id: "sin_vincular" as const,
                label: t("compras.operChipSinVincular"),
                n: operationalCounts.sinVincular,
                idle: {
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-card-solid)",
                  color: "var(--hostly-ink-soft)",
                },
                act: {
                  border: "1px solid rgba(79, 70, 229, 0.28)",
                  background: "rgba(238, 242, 255, 0.92)",
                  color: "#3730a3",
                  boxShadow: "inset 0 -2px 0 rgba(79, 70, 229, 0.25)",
                },
              },
            ] as const
          ).map((chip) => {
            const active = operFocus === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                className={`hostly-compras-chip ${active ? "hostly-compras-chip-on" : "hostly-compras-chip-idle"}`}
                onClick={() => setOperFocus((p) => (p === chip.id ? null : chip.id))}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  minHeight: 36,
                  boxSizing: "border-box",
                  boxShadow: active ? undefined : "var(--hostly-shadow-hairline)",
                  ...(active ? chip.act : chip.idle),
                }}
              >
                <span>{chip.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.78, fontWeight: 700, fontSize: 13 }}>{chip.n}</span>
              </button>
            );
          })}
        </div>

        <div
          role="search"
          style={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 10,
            border: "1px solid var(--hostly-line)",
            background: "var(--hostly-surface-card-solid)",
            overflowX: "auto",
            overflowY: "hidden",
            WebkitOverflowScrolling: "touch",
            boxShadow: "var(--hostly-shadow-hairline)",
          }}
        >
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder={t("compras.searchPlaceholder")}
            aria-label={t("compras.searchPlaceholder")}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: "140px",
              minWidth: 140,
              minHeight: 36,
              padding: "7px 10px",
              borderRadius: 10,
              border: "1px solid var(--hostly-line-strong)",
              background: "#ffffff",
              color: "var(--hostly-ink)",
              fontSize: 15,
              boxSizing: "border-box",
              touchAction: "manipulation",
              boxShadow: "var(--hostly-shadow-hairline)",
            }}
          />
          <div
            role="group"
            aria-label={t("compras.listSectionTitle")}
            style={{ display: "flex", flexWrap: "nowrap", gap: 8, alignItems: "center", flexShrink: 0 }}
          >
            {(
              [
                { key: "todas" as const, label: t("compras.filterAll") },
                { key: "pendiente" as const, label: t("compras.filterPendingOnly") },
                { key: "recibido" as const, label: t("compras.filterReceivedOnly") },
                { key: "cancelado" as const, label: t("compras.filterCancelledOnly") },
              ] as const
            ).map(({ key, label }) => {
              const active = listFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setOperFocus(null);
                    setListFilter(key);
                  }}
                  style={{
                    border: active ? "1px solid var(--hostly-line-strong)" : "1px solid var(--hostly-line)",
                    background: active ? "var(--hostly-accent-soft)" : "transparent",
                    color: active ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                    padding: "6px 10px",
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 13,
                    lineHeight: 1.2,
                    minHeight: 36,
                    boxSizing: "border-box",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    touchAction: "manipulation",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--hostly-ink-muted)",
              flexShrink: 0,
              minHeight: 36,
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              {t("compras.sortBy")}
            </span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as CompraListSort)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid var(--hostly-line-strong)",
                background: "#ffffff",
                color: "var(--hostly-ink)",
                fontSize: 14,
                fontWeight: 600,
                minHeight: 36,
                minWidth: 0,
                boxSizing: "border-box",
                cursor: "pointer",
                touchAction: "manipulation",
                boxShadow: "var(--hostly-shadow-hairline)",
              }}
            >
              <option value="fecha_desc">{t("compras.sortFechaDesc")}</option>
              <option value="fecha_asc">{t("compras.sortFechaAsc")}</option>
              <option value="importe_desc">{t("compras.sortImporteDesc")}</option>
              <option value="importe_asc">{t("compras.sortImporteAsc")}</option>
            </select>
          </label>
        </div>

        {formOpen && !editingId ? (
          <div
            style={{
              flexShrink: 0,
              maxHeight: "min(300px, 36vh)",
              overflowY: "auto",
              background: "var(--hostly-surface-card-solid)",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid var(--hostly-line)",
              boxShadow: "var(--hostly-shadow-card)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--hostly-ink-strong)", lineHeight: 1.2 }}>
              {t("compras.newPurchaseForm")}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--hostly-ink-muted)", lineHeight: 1.4 }}>
              {t("compras.quickFormHint")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>{t("common.supplier")}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={draftProveedor}
                    onChange={(e) => {
                      setDraftProveedor(e.target.value);
                      setSupplierSuggestOpen(true);
                    }}
                    onFocus={() => setSupplierSuggestOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setSupplierSuggestOpen(false), 170);
                    }}
                    placeholder={t("compras.placeholderSupplier")}
                    autoComplete="off"
                    aria-label={t("common.supplier")}
                    style={inputStyle}
                  />
                  {supplierSuggestOpen && draftSupplierSuggestions.length > 0 ? (
                    <div
                      role="listbox"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "calc(100% + 4px)",
                        zIndex: 50,
                        borderRadius: 10,
                        border: "1px solid var(--hostly-line)",
                        background: "var(--hostly-surface-card-solid)",
                        boxShadow: "var(--hostly-shadow-float)",
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {draftSupplierSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickCompraSupplierSuggestion(s)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            border: "none",
                            borderBottom: "1px solid var(--hostly-line)",
                            background: "transparent",
                            cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-strong)" }}>{s.displayName}</div>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 500, color: "var(--hostly-ink-muted)" }}>{s.legalName}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t("compras.productLabel")}</label>
                <select
                  value={draftStockProductoId}
                  onChange={(e) => setDraftStockProductoId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">{t("compras.notLinked")}</option>
                  {productosStock.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <div>
                  <label style={labelStyle}>{t("compras.quantityLabel")}</label>
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
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--hostly-line)",
                    background: "var(--hostly-surface-operational)",
                    color: selectedStockProduct ? "var(--hostly-ink-strong)" : "var(--hostly-ink-muted)",
                    fontWeight: 600,
                    fontSize: 14,
                    minWidth: 56,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                  title={t("compras.unitAuto")}
                >
                  {selectedStockProduct?.unidad ?? "—"}
                </div>
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
                  style={{ ...inputStyle, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
                />
                {quickUnitPriceHighlightLine ? (
                  <div
                    aria-live="polite"
                    style={{
                      marginTop: 12,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(22, 163, 74, 0.35)",
                      background: "var(--hostly-success-soft)",
                      boxShadow: "var(--hostly-shadow-card)",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#14532d",
                      letterSpacing: "0.02em",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.35,
                    }}
                  >
                    {quickUnitPriceHighlightLine}
                  </div>
                ) : null}
                {quickPriceIncreaseWarning ? (
                  <div
                    aria-live="polite"
                    role="status"
                    style={{
                      marginTop: quickUnitPriceHighlightLine ? 10 : 12,
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(217, 119, 6, 0.32)",
                      background: "var(--hostly-warning-soft)",
                      boxShadow: "var(--hostly-shadow-card)",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#78350f", lineHeight: 1.4 }}>
                      {t("compras.priceIncreaseWarningTitle")}
                    </p>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#92400e",
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.45,
                        opacity: 0.95,
                      }}
                    >
                      {t("compras.priceIncreaseWarningDetail", { pct: quickPriceIncreaseWarning.pctLabel })}
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <label style={labelStyle}>{t("common.status")}</label>
                <select
                  value={draftEstado}
                  onChange={(e) => setDraftEstado(e.target.value as CompraEstado)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {QUICK_CREATE_ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 12, marginBottom: 0, fontSize: 13 }}>{formError}</p>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={submitForm}
                style={{
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "14px 18px",
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 15,
                  width: "100%",
                  minHeight: 48,
                  boxSizing: "border-box",
                  boxShadow: "0 4px 14px rgba(34, 197, 94, 0.3)",
                }}
              >
                {t("compras.savePurchase")}
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid var(--hostly-line)",
                  background: "transparent",
                  color: "var(--hostly-ink-muted)",
                  padding: "12px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                  width: "100%",
                  minHeight: 48,
                  boxSizing: "border-box",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : null}

        {formOpen && editingId ? (
          <div
            style={{
              flexShrink: 0,
              maxHeight: "min(340px, 42vh)",
              overflowY: "auto",
              background: "var(--hostly-surface-card-solid)",
              borderRadius: 12,
              padding: "10px 12px",
              border: "1px solid var(--hostly-line)",
              boxShadow: "var(--hostly-shadow-card)",
            }}
          >
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--hostly-ink-strong)", lineHeight: 1.2 }}>{t("compras.editPurchase")}</h2>
            <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--hostly-ink-muted)", lineHeight: 1.4 }}>
              {t("compras.formHintBeforeStrong")} <strong>{t("compras.received")}</strong>
              {t("compras.formHintAfterStrong")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>{t("common.supplier")}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={draftProveedor}
                    onChange={(e) => {
                      setDraftProveedor(e.target.value);
                      setSupplierSuggestOpen(true);
                    }}
                    onFocus={() => setSupplierSuggestOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setSupplierSuggestOpen(false), 170);
                    }}
                    placeholder={t("compras.placeholderSupplier")}
                    autoComplete="off"
                    aria-label={t("common.supplier")}
                    style={inputStyle}
                  />
                  {supplierSuggestOpen && draftSupplierSuggestions.length > 0 ? (
                    <div
                      role="listbox"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "calc(100% + 4px)",
                        zIndex: 50,
                        borderRadius: 10,
                        border: "1px solid var(--hostly-line)",
                        background: "var(--hostly-surface-card-solid)",
                        boxShadow: "var(--hostly-shadow-float)",
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {draftSupplierSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickCompraSupplierSuggestion(s)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            border: "none",
                            borderBottom: "1px solid var(--hostly-line)",
                            background: "transparent",
                            cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--hostly-ink-strong)" }}>{s.displayName}</div>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 500, color: "var(--hostly-ink-muted)" }}>{s.legalName}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <label style={labelStyle}>{t("compras.productLabel")}</label>
                <select
                  value={draftStockProductoId}
                  onChange={(e) => setDraftStockProductoId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">{t("compras.notLinked")}</option>
                  {productosStock.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{t("compras.quantityLabel")}</label>
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
                <div>
                  <label style={labelStyle}>{t("compras.unitAuto")}</label>
                  <div
                    style={{
                      ...inputStyle,
                      display: "flex",
                      alignItems: "center",
                      minHeight: 38,
                      color: selectedStockProduct ? "var(--hostly-ink-strong)" : "var(--hostly-ink-muted)",
                      fontWeight: 600,
                    }}
                  >
                    {selectedStockProduct?.unidad ?? t("common.emDash")}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "var(--hostly-surface-operational)",
                  border: "1px solid var(--hostly-line)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--hostly-ink-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {t("compras.unitPriceLabel")}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 17,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "#b45309",
                  }}
                >
                  {draftPrecioUnitario != null ? formatEuro(draftPrecioUnitario, locale) : t("common.emDash")}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                  {draftPrecioUnitario != null ? t("compras.unitPriceDerivedHint") : t("compras.unitPriceEmpty")}
                </div>
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
                  style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{t("common.date")}</label>
                  <input type="date" value={draftFecha} onChange={(e) => setDraftFecha(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{t("common.status")}</label>
                  <select
                    value={draftEstado}
                    onChange={(e) => setDraftEstado(e.target.value as CompraEstado)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    {COMPRA_ESTADOS.map((e) => (
                      <option key={e} value={e}>
                        {e.charAt(0).toUpperCase() + e.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>{t("common.notesOptional")}</label>
                <textarea
                  value={draftNotas}
                  onChange={(e) => setDraftNotas(e.target.value)}
                  placeholder={t("compras.placeholderNotes")}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 52 }}
                />
              </div>
            </div>

            {formError ? (
              <p style={{ color: "#fca5a5", marginTop: 8, marginBottom: 0, fontSize: 12 }}>{formError}</p>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={submitForm}
                style={{
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                  minHeight: 48,
                  boxSizing: "border-box",
                }}
              >
                {t("compras.savePurchase")}
              </button>
              <button
                type="button"
                onClick={closeForm}
                style={{
                  border: "1px solid var(--hostly-line)",
                  background: "transparent",
                  color: "var(--hostly-ink-muted)",
                  padding: "12px 18px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                  minHeight: 48,
                  boxSizing: "border-box",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : null}

        <div
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--hostly-surface-card-soft)",
            borderRadius: 14,
            border: "1px solid var(--hostly-line)",
            boxShadow: "var(--hostly-shadow-card)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 10px",
              borderBottom: "1px solid var(--hostly-line)",
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <h2 style={OPER_PRIMARY_SECTION_TITLE}>{t("compras.listSectionTitle")}</h2>
            </div>
            <span
              style={{
                ...OPER_PRIMARY_COUNT_META,
                margin: 0,
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
                alignSelf: "center",
              }}
            >
              {displayedRows.length}/{items.length}
            </span>
          </div>

          {items.length === 0 ? (
            <div
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                padding: 24,
                textAlign: "center",
                color: "var(--hostly-ink-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <p style={{ margin: "0 0 12px", fontSize: 14 }}>{t("compras.noPurchases")}</p>
              <button
                type="button"
                onClick={openCreate}
                style={{
                  border: "none",
                  background: "#22c55e",
                  color: "#fff",
                  padding: "14px 24px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 15,
                  minHeight: 48,
                  boxSizing: "border-box",
                }}
              >
                {t("compras.createFirst")}
              </button>
            </div>
          ) : displayedRows.length === 0 ? (
            <div
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                padding: 20,
                textAlign: "center",
                color: "var(--hostly-ink-muted)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {listSearch.trim() ? t("compras.searchNoResults") : t("compras.filterEmpty")}
            </div>
          ) : (
            <div
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  display: "grid",
                  gridTemplateColumns: "44px minmax(120px, 1.45fr) 90px 112px minmax(88px, 1.05fr) 96px 196px",
                  gap: "8px 10px",
                  alignItems: "center",
                  minHeight: 36,
                  padding: "8px 11px",
                  background: "var(--hostly-surface-page-soft)",
                  borderBottom: "1px solid var(--hostly-line)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hostly-ink-muted)",
                  boxSizing: "border-box",
                }}
              >
                <span>{t("compras.colDate")}</span>
                <span>{t("compras.colSupplier")}</span>
                <span style={{ textAlign: "right" }}>{t("compras.colTotal")}</span>
                <span>{t("compras.colStatus")}</span>
                <span>{t("compras.colProduct")}</span>
                <span>{t("compras.colStock")}</span>
                <span style={{ textAlign: "right" }}>{t("compras.colActions")}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 8px 10px" }}>
                {displayedRows.map((c) => {
                  const syncKind = stockSyncUiKind(c);
                  const tone = rowToneWithSync(c.estado, syncKind);
                  const invLabel = inventarioDesdeCompra(
                    c,
                    productosStock,
                    t("compras.notLinked"),
                    t("common.product"),
                  );
                  const notasHint = c.notas?.trim() ? c.notas.trim() : "";
                  const look = estadoSelectLook[c.estado];
                  const itemLabel = rowLineItemCount(c) === 0 ? t("compras.rowItemsNone") : t("compras.rowItemsOne");
                  const typeL = rowPurchaseTypeLabel(c, t);
                  const rowHints = rowOperationalHints(c, t);
                  const showRecibido = c.estado === "pendiente";
                  const showFactura = c.estado !== "cancelado";
                  const showStock =
                    c.estado !== "cancelado" && (!(c.producto_stock_id ?? "").trim() || syncKind === "not_applied");
                  const facturaEsPrincipal = !showRecibido && showFactura;
                  const supplierPrimary = supplierPrimaryLabel({
                    proveedor: c.proveedor,
                    supplierDisplayName: c.supplierDisplayName,
                  });
                  const supplierLegal = supplierLegalSubtitle({
                    proveedor: c.proveedor,
                    supplierDisplayName: c.supplierDisplayName,
                    supplierLegalName: c.supplierLegalName,
                  });

                  return (
                    <div
                      key={c.id}
                      id={`hostly-compra-row-${c.id}`}
                      role="presentation"
                      onClick={() => {
                        setRowMenuOpenId(null);
                        openEdit(c);
                      }}
                      style={{
                        background: tone.bg,
                        borderRadius: 14,
                        border: `1px solid ${tone.border}`,
                        padding: "14px 14px",
                        minHeight: 48,
                        boxSizing: "border-box",
                        cursor: "pointer",
                        touchAction: "manipulation",
                        boxShadow: `inset 3px 0 0 ${tone.stripe}, var(--hostly-shadow-card)`,
                      }}
                      title={notasHint ? `${supplierPrimary} — ${notasHint}` : supplierPrimary}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "44px minmax(120px, 1.45fr) 90px 112px minmax(88px, 1.05fr) 96px 196px",
                          gap: "12px 14px",
                          alignItems: "start",
                          minHeight: 52,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#8896ab",
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1.25,
                            paddingTop: 11,
                          }}
                        >
                          {formatFechaCorta(c.fecha, locale)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 17,
                              fontWeight: 700,
                              color: "var(--hostly-ink-strong)",
                              letterSpacing: "-0.025em",
                              lineHeight: 1.22,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {supplierPrimary}
                          </div>
                          {supplierLegal ? (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 11,
                                fontWeight: 600,
                                color: "var(--hostly-ink-muted)",
                                letterSpacing: "0.01em",
                                lineHeight: 1.25,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {supplierLegal}
                            </div>
                          ) : null}
                          <div
                            style={{
                              marginTop: 10,
                              paddingTop: 9,
                              borderTop: "1px solid var(--hostly-line)",
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              rowGap: 5,
                              columnGap: 2,
                              lineHeight: 1.35,
                            }}
                          >
                            <span style={{ fontSize: 9.5, color: "#7c8799", fontWeight: 600, letterSpacing: "0.03em" }}>{typeL}</span>
                            <span style={metaHairlineSep} aria-hidden />
                            <span style={{ fontSize: 9.5, color: "#5f6b7c", fontWeight: 500 }}>{itemLabel}</span>
                            {rowHints.map((h, i) => (
                              <span key={`${c.id}-hint-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
                                <span style={metaHairlineSep} aria-hidden />
                                <span style={{ fontSize: 9, color: "#556070", fontWeight: 500, letterSpacing: "0.02em" }}>{h}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--hostly-navy-deep)",
                            textAlign: "right",
                            letterSpacing: "-0.025em",
                            lineHeight: 1.12,
                            paddingTop: 8,
                          }}
                        >
                          {formatEuro(typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0, locale)}
                        </div>
                        <select
                          value={c.estado}
                          onChange={(e) => updateEstado(c.id, e.target.value as CompraEstado)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("compras.ariaPurchaseStatus", { supplier: supplierPrimary })}
                          style={{
                            ...selectRow,
                            padding: "12px 10px",
                            fontSize: 15,
                            fontWeight: 700,
                            textTransform: "none",
                            letterSpacing: "0.02em",
                            border: `1px solid ${look.border}`,
                            backgroundColor: look.bg,
                            color: look.color,
                            borderRadius: 10,
                            minWidth: 0,
                            width: "100%",
                            maxWidth: "100%",
                            boxShadow: "var(--hostly-shadow-hairline)",
                          }}
                        >
                          {COMPRA_ESTADOS.map((e) => (
                            <option key={e} value={e}>
                              {estadoLabelCompra(e, t)}
                            </option>
                          ))}
                        </select>
                        <div style={{ minWidth: 0, paddingTop: 6 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: invLabel === t("compras.notLinked") ? "var(--hostly-ink-muted)" : "var(--hostly-ink)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                              lineHeight: 1.4,
                            }}
                            title={invLabel}
                          >
                            {invLabel}
                          </span>
                          {notasHint && invLabel !== notasHint ? (
                            <span
                              style={{
                                marginTop: 8,
                                fontSize: 9.5,
                                fontWeight: 500,
                                color: "#5c6575",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                                lineHeight: 1.35,
                              }}
                              title={notasHint}
                            >
                              {notasHint.length > 42 ? `${notasHint.slice(0, 40)}…` : notasHint}
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                            alignItems: "center",
                            minHeight: 44,
                            paddingTop: 6,
                          }}
                        >
                          {syncKind === "applied" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "5px 9px",
                                borderRadius: 999,
                                fontWeight: 600,
                                fontSize: 9,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                color: "#7dd3ce",
                                whiteSpace: "nowrap",
                                lineHeight: 1.2,
                                background: "rgba(45, 212, 191, 0.08)",
                                border: "1px solid rgba(45, 212, 191, 0.2)",
                              }}
                            >
                              {t("compras.appliedToStock")}
                            </span>
                          ) : syncKind === "not_applied" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "5px 9px",
                                borderRadius: 999,
                                fontWeight: 600,
                                fontSize: 9,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                color: "#fcd34d",
                                whiteSpace: "nowrap",
                                lineHeight: 1.2,
                                background: "rgba(251, 191, 36, 0.08)",
                                border: "1px solid rgba(251, 191, 36, 0.22)",
                              }}
                            >
                              {t("compras.notAppliedStock")}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--hostly-ink-muted)" }}>{t("common.emDash")}</span>
                          )}
                        </div>
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 10,
                            justifyContent: "flex-end",
                            alignItems: "center",
                            alignSelf: "stretch",
                            flexShrink: 0,
                            paddingTop: 4,
                            boxSizing: "border-box",
                          }}
                        >
                          {showRecibido ? (
                            <button
                              type="button"
                              onClick={() => updateEstado(c.id, "recibido")}
                              style={{
                                border: "1px solid rgba(34, 197, 94, 0.35)",
                                background: "var(--hostly-success-soft)",
                                color: "var(--hostly-navy-deep)",
                                padding: "9px 12px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 13,
                                lineHeight: 1.2,
                                minHeight: 44,
                                boxSizing: "border-box",
                                whiteSpace: "nowrap",
                                touchAction: "manipulation",
                                boxShadow: "var(--hostly-shadow-hairline)",
                              }}
                            >
                              {t("compras.actionMarkReceived")}
                            </button>
                          ) : null}
                          {showFactura ? (
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              style={{
                                border: facturaEsPrincipal
                                  ? "1px solid rgba(49, 95, 125, 0.45)"
                                  : "1px solid var(--hostly-line)",
                                background: facturaEsPrincipal ? "var(--hostly-accent-soft)" : "transparent",
                                color: facturaEsPrincipal ? "var(--hostly-navy-deep)" : "var(--hostly-ink-muted)",
                                padding: "9px 12px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: facturaEsPrincipal ? 600 : 600,
                                fontSize: 13,
                                lineHeight: 1.2,
                                minHeight: 44,
                                boxSizing: "border-box",
                                whiteSpace: "nowrap",
                                touchAction: "manipulation",
                                boxShadow: facturaEsPrincipal ? "var(--hostly-shadow-hairline)" : undefined,
                              }}
                            >
                              {t("compras.actionInvoice")}
                            </button>
                          ) : null}
                          {showStock ? (
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              style={{
                                border: "1px solid var(--hostly-line)",
                                background: "transparent",
                                color: "var(--hostly-ink-muted)",
                                padding: "10px 14px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 13,
                                lineHeight: 1.2,
                                minHeight: 44,
                                boxSizing: "border-box",
                                whiteSpace: "nowrap",
                                touchAction: "manipulation",
                              }}
                            >
                              {t("compras.actionLinkStock")}
                            </button>
                          ) : null}
                          <div style={{ position: "relative", display: "inline-flex" }}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRowMenuOpenId((p) => (p === c.id ? null : c.id));
                              }}
                              aria-label={t("compras.menuEditDelete")}
                              aria-expanded={rowMenuOpenId === c.id}
                              style={{
                                border: "1px solid var(--hostly-line)",
                                background: "transparent",
                                color: "var(--hostly-ink-muted)",
                                padding: "0 12px",
                                borderRadius: 10,
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: 18,
                                lineHeight: 1,
                                minWidth: 44,
                                minHeight: 44,
                                boxSizing: "border-box",
                                touchAction: "manipulation",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {t("compras.actionMore")}
                            </button>
                            {rowMenuOpenId === c.id ? (
                              <div
                                role="menu"
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: "calc(100% + 8px)",
                                  zIndex: 30,
                                  minWidth: 212,
                                  borderRadius: 12,
                                  border: "1px solid var(--hostly-line)",
                                  background: "var(--hostly-surface-card-solid)",
                                  boxShadow: "var(--hostly-shadow-float)",
                                  padding: 8,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRowMenuOpenId(null);
                                    openEdit(c);
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "var(--hostly-ink)",
                                    textAlign: "left",
                                    padding: "14px 16px",
                                    borderRadius: 10,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontSize: 15,
                                    minHeight: 48,
                                    boxSizing: "border-box",
                                  }}
                                >
                                  {t("common.edit")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRowMenuOpenId(null);
                                    removeCompra(c.id);
                                  }}
                                  style={{
                                    border: "none",
                                    background: "rgba(127, 29, 29, 0.25)",
                                    color: "#fecaca",
                                    textAlign: "left",
                                    padding: "14px 16px",
                                    borderRadius: 10,
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    fontSize: 15,
                                    minHeight: 48,
                                    boxSizing: "border-box",
                                    marginTop: 4,
                                    borderTop: "1px solid rgba(248, 113, 113, 0.25)",
                                  }}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          {renderNewPurchaseButton()}
        </div>
        {moduleBody}
      </div>
    );
  }

  return (
    <ModulePageShell
      title={t("compras.title")}
      subtitle={t("compras.subtitleTpv")}
      maxWidth={1000}
      compactLayout
      operationalFocus
      lockViewport
      headerRight={renderNewPurchaseButton()}
    >
      {moduleBody}
    </ModulePageShell>
  );
}
