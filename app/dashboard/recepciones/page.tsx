"use client";

import type { ChangeEvent, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import {
  RecepcionesListDataView,
  type RecepcionListDisplayRow,
} from "@/components/inventario/procurement/recepciones-list-data-view";
import { recepcionOperBadgeTone } from "@/components/inventario/procurement/procurement-display-utils";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlySection,
  HostlySectionHeader,
  HostlySegmentedControl,
  HostlySurface,
  hostlySegmentTabClassName,
} from "@/components/ui/hostly";
import {
  type CompraEstado,
  type CompraLineItemLocal,
  type CompraLocal,
  COMPRA_ESTADOS,
  loadCompras,
  parseCantidadRecibida as coercedCantidadRecibida,
  parseProductoStockId,
  saveCompras,
} from "@/lib/compras-local";
import { reconcileCompraStock } from "@/lib/compras-stock-sync";
import { STOCK_CHANGED_EVENT, loadStock, saveStock, type UnidadStock } from "@/lib/stock-local";
import {
  type CanonicalSupplier,
  resolveSupplierForSave,
  suggestSuppliers,
  supplierLegalSubtitle,
  supplierPrimaryLabel,
} from "@/lib/suppliers";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  applyInventoryReceipt,
  listenProductsForInventory,
  type InventoryReceiptItemInput,
  type ProductDocument,
} from "@/lib/firestore/products";
import type { Locale } from "@/lib/i18n";

function compraSupplierNameForReceipt(c: CompraLocal): string | null {
  const n = (c.supplierDisplayName ?? c.proveedor ?? "").trim();
  return n ? n : null;
}

type ListFilter = "todas" | CompraEstado;
type DatePreset = "todas" | "hoy" | "semana" | "mes";
type ListSort = "fecha_desc" | "fecha_asc" | "importe_desc" | "importe_asc";
type OperFocus = "pendientes" | "diferencia" | "sin_factura" | "sin_vincular" | "stock_no" | "lineas_faltantes";

type ValidationPhase = "cancelada" | "pendiente" | "incidencia" | "validada";

const metaHairlineSep: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 8,
  margin: "0 4px",
  background: "var(--hostly-table-divider-soft)",
  borderRadius: 1,
  verticalAlign: "middle",
  flexShrink: 0,
};

const recepToolbarControlStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--hostly-table-divider-soft)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink)",
  fontSize: 11,
  fontWeight: 600,
  minHeight: 30,
  boxSizing: "border-box",
  cursor: "pointer",
  touchAction: "manipulation",
};

function todayIsoLocal(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function subtractDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatEuro(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatFechaCorta(iso: string, loc: Locale): string {
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

function formatRelativeAgo(ms: number, loc: Locale): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return loc === "en" ? "just now" : "ahora mismo";
  if (min < 60) return loc === "en" ? `${min}m ago` : `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return loc === "en" ? `${h}h ago` : `hace ${h} h`;
  const d = Math.floor(h / 24);
  return loc === "en" ? `${d}d ago` : `hace ${d} d`;
}

function formatAppliedAtMs(ms: number, loc: Locale): string {
  try {
    return new Date(ms).toLocaleString(loc === "en" ? "en-GB" : "es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatSignedDiffQty(dq: number, unit: string): string {
  if (Math.abs(dq) < 1e-9) return `0 ${unit}`;
  const sign = dq > 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(dq)} ${unit}`;
}

function formatSignedMoneyDiff(dc: number, loc: Locale): string {
  if (Math.abs(dc) < 1e-9) return formatEuro(0, loc);
  const sign = dc > 0 ? "+" : "\u2212";
  return `${sign}${formatEuro(Math.abs(dc), loc)}`;
}

/** Estado documento factura para UI (local / futuro OCR). */
function invoiceWorkflowStatus(c: CompraLocal): "missing" | "attached" | "reviewing" | "matched" {
  const inv = c.invoice_document;
  if (!inv || !inv.attached) return "missing";
  const s = inv.status;
  if (s === "reviewing" || s === "matched" || s === "attached") return s;
  return "attached";
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Alinea unidad del documento central (`ud`) con compras locales (`uds`). */
function inventoryUnitToCompraUnidad(u: string): UnidadStock {
  const x = u.trim().toLowerCase();
  if (x === "ud" || x === "uds") return "uds";
  if (x === "kg" || x === "g" || x === "l" || x === "ml") return x;
  return "uds";
}

function compraSinFacturaDoc(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  const n = (c.notas ?? "").trim();
  if (n === "") return true;
  return !/\b(factura|fact\.|albar[aá]n|invoice|ticket|n[ºo]\s*[\w\d-]|#\s*\d)/i.test(n);
}

function stockSyncUiKind(c: CompraLocal): "applied" | "not_applied" | "neutral" {
  if ((c.inventory_receipt_id ?? "").trim()) return "applied";
  if (c.stock_aplicado) return "applied";
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if (c.estado === "recibido" && (c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return "not_applied";
  return "neutral";
}

function hasDiferenciaNotas(c: CompraLocal): boolean {
  const n = normalizeForSearch(c.notas ?? "");
  if (!n) return false;
  return (
    n.includes("diferencia") ||
    n.includes("falta") ||
    n.includes("sobra") ||
    n.includes("discrepancia") ||
    n.includes("incidencia")
  );
}

function missingLinesHint(c: CompraLocal): boolean {
  if (c.estado === "cancelado") return false;
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  return lineItemCount(c) === 0 && total > 0;
}

function blockersAfterReceipt(c: CompraLocal): boolean {
  if (c.estado !== "recibido") return false;
  return (
    stockSyncUiKind(c) === "not_applied" ||
    compraSinFacturaDoc(c) ||
    hasDiferenciaNotas(c) ||
    !(c.producto_stock_id ?? "").trim() ||
    missingLinesHint(c)
  );
}

function validationPhase(c: CompraLocal): ValidationPhase {
  if (c.estado === "cancelado") return "cancelada";
  if (c.estado === "pendiente") return "pendiente";
  if (blockersAfterReceipt(c)) return "incidencia";
  return "validada";
}

function hasIncidencia(c: CompraLocal): boolean {
  if (c.estado === "cancelado") return false;
  if (missingLinesHint(c)) return true;
  if (stockSyncUiKind(c) === "not_applied") return true;
  if (hasDiferenciaNotas(c)) return true;
  if (compraSinFacturaDoc(c)) return true;
  if (!(c.producto_stock_id ?? "").trim()) return true;
  return false;
}

function lineItemCount(c: CompraLocal): number {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  if ((c.producto_stock_id ?? "").trim() && qty != null && qty > 0) return 1;
  return 0;
}

function estadoLabel(estado: CompraEstado, t: (k: string) => string): string {
  switch (estado) {
    case "pendiente":
      return t("dashboard.compraEstadoPendiente");
    case "recibido":
      return t("dashboard.compraEstadoRecibido");
    default:
      return t("dashboard.compraEstadoCancelado");
  }
}

const estadoLook: Record<CompraEstado, { border: string; bg: string; color: string }> = {
  recibido: {
    border: "var(--hostly-table-divider-soft)",
    bg: "var(--hostly-success-soft)",
    color: "var(--hostly-ink)",
  },
  pendiente: {
    border: "var(--hostly-table-divider-soft)",
    bg: "var(--hostly-warning-soft)",
    color: "var(--hostly-ink)",
  },
  cancelado: {
    border: "var(--hostly-table-divider-soft)",
    bg: "var(--hostly-danger-soft)",
    color: "var(--hostly-ink)",
  },
};

function phaseLabels(phase: ValidationPhase, t: (k: string) => string): { title: string; sub: string } {
  switch (phase) {
    case "cancelada":
      return { title: t("recepciones.valPhaseCancelled"), sub: t("recepciones.valSubCancelled") };
    case "pendiente":
      return { title: t("recepciones.valPhasePending"), sub: t("recepciones.valSubPending") };
    case "incidencia":
      return { title: t("recepciones.valPhaseIncident"), sub: t("recepciones.valSubIncident") };
    default:
      return { title: t("recepciones.valPhaseValidated"), sub: t("recepciones.valSubValidated") };
  }
}

type RowIncident = { text: string; tone: "high" | "mid"; pri: number };

function collectRowIncidents(c: CompraLocal, sinF: boolean, sync: ReturnType<typeof stockSyncUiKind>, t: (k: string) => string): RowIncident[] {
  const out: RowIncident[] = [];
  if (sync === "not_applied") out.push({ text: t("recepciones.operStockPending"), tone: "high", pri: 1 });
  if (sinF && c.estado === "recibido") out.push({ text: t("recepciones.rowNoInvoice"), tone: "high", pri: 2 });
  if (hasDiferenciaNotas(c)) out.push({ text: t("recepciones.rowDiff"), tone: "high", pri: 3 });
  if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) out.push({ text: t("recepciones.rowUnlinked"), tone: "mid", pri: 4 });
  if (missingLinesHint(c)) out.push({ text: t("recepciones.rowLinesMissing"), tone: "mid", pri: 5 });
  out.sort((a, b) => a.pri - b.pri);
  return out;
}

function parseDrawerDecimal(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

type LineUiStatus = "pendiente" | "parcial" | "recibido" | "incidencia";

function deriveLineUiStatus(
  draft: { incident: boolean; qtyOrdered: number | null },
  qtyReceived: number | null,
): LineUiStatus {
  if (draft.incident) return "incidencia";
  if (qtyReceived == null || qtyReceived <= 0) return "pendiente";
  if (draft.qtyOrdered != null && qtyReceived < draft.qtyOrdered) return "parcial";
  return "recibido";
}

function lineStatusLabel(s: LineUiStatus): string {
  switch (s) {
    case "pendiente":
      return "Pendiente";
    case "parcial":
      return "Parcial";
    case "recibido":
      return "Recibido";
    case "incidencia":
      return "Incidencia";
    default:
      return s;
  }
}

function lineStatusLook(s: LineUiStatus): { bd: string; bg: string; fg: string } {
  switch (s) {
    case "pendiente":
      return {
        bd: "rgba(120, 125, 140, 0.22)",
        bg: "rgba(248, 249, 252, 0.95)",
        fg: "var(--hostly-ink-muted)",
      };
    case "parcial":
      return {
        bd: "rgba(184, 149, 58, 0.32)",
        bg: "rgba(184, 149, 58, 0.12)",
        fg: "color-mix(in srgb, var(--hostly-ink) 58%, var(--hostly-ink-muted))",
      };
    case "recibido":
      return {
        bd: "rgba(34, 120, 80, 0.22)",
        bg: "var(--hostly-success-soft)",
        fg: "color-mix(in srgb, var(--hostly-ink) 62%, var(--hostly-ink-muted))",
      };
    case "incidencia":
      return {
        bd: "rgba(180, 83, 74, 0.28)",
        bg: "var(--hostly-danger-soft)",
        fg: "color-mix(in srgb, var(--hostly-ink) 65%, var(--hostly-ink-muted))",
      };
    default:
      return { bd: "var(--hostly-table-divider-soft)", bg: "transparent", fg: "var(--hostly-ink-muted)" };
  }
}

type DrawerReceptionLine = {
  id: string;
  name: string;
  /** Id Firestore vinculado (`producto_stock_id` en compra / línea). */
  productStockId: string;
  qty: number | null;
  /** Cantidad pedida / esperada para derivar parcial (UI); si no hay dato, se infiere en builder. */
  qtyOrdered: number | null;
  unitLabel: string;
  unitCost: number | null;
  subtotal: number;
  linked: boolean;
  received: boolean;
  lineIncident: boolean;
};

type DrawerLineDraft = {
  id: string;
  name: string;
  productStockId: string;
  unitLabel: string;
  linked: boolean;
  qtyOrdered: number | null;
  qtyReceivedStr: string;
  unitCostStr: string;
  incident: boolean;
  /** Cantidad según factura (conciliación; editable). */
  invoiceQtyStr: string;
  /** Coste unitario según factura (conciliación; editable). */
  invoiceCostStr: string;
};

type DrawerTimelineStep = {
  id: string;
  label: string;
  done: boolean;
  stamp: string;
};

function buildDrawerReceptionLinesFallback(c: CompraLocal): DrawerReceptionLine[] {
  const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  const nombre = (c.producto_stock_nombre ?? "").trim();
  const pidHead =
    parseProductoStockId(c as unknown as Record<string, unknown>) ?? (c.producto_stock_id ?? "").trim();
  const linked = Boolean(pidHead);
  const received = qty != null && qty > 0;
  const qtyOrdered = qty != null && qty > 0 ? qty : 1;
  const pu =
    typeof c.precio_unitario === "number" && Number.isFinite(c.precio_unitario) && c.precio_unitario >= 0
      ? c.precio_unitario
      : null;
  const unitCost =
    pu != null ? pu : received && qty != null && qty > 0 && total > 0 ? total / qty : null;
  return [
    {
      id: `${c.id}-main`,
      name: nombre || "—",
      productStockId: pidHead,
      qty: qty ?? null,
      qtyOrdered,
      unitLabel: c.unidad ?? "—",
      unitCost,
      subtotal: total,
      linked,
      received,
      lineIncident: c.recepcion_incidencia === true,
    },
  ];
}

/** N líneas desde `items` si existen en datos; si no, una línea derivada del modelo actual (1 producto / recepción). */
function buildDrawerReceptionLines(c: CompraLocal): DrawerReceptionLine[] {
  const raw = c.items;
  if (!Array.isArray(raw) || raw.length === 0) return buildDrawerReceptionLinesFallback(c);

  const lines: DrawerReceptionLine[] = [];
  let idx = 0;
  const totalAll = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  const perLine = raw.length > 0 ? totalAll / raw.length : totalAll;

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.trim() ? r.id : `ln-${idx}`;
    const name =
      (typeof r.producto_stock_nombre === "string" && r.producto_stock_nombre.trim()) ||
      (typeof r.nombre === "string" && r.nombre.trim()) ||
      (typeof r.producto === "string" && r.producto.trim()) ||
      `Línea ${idx + 1}`;
    const qtyRaw = r.cantidad ?? r.qty;
    let qty: number | null = null;
    if (typeof qtyRaw === "number" && Number.isFinite(qtyRaw)) qty = qtyRaw;
    else if (typeof qtyRaw === "string") {
      const n = Number(String(qtyRaw).replace(",", "."));
      if (Number.isFinite(n)) qty = n;
    }
    const un =
      (typeof r.unidad === "string" && r.unidad.trim()) || (typeof r.unit === "string" && r.unit.trim()) || "—";
    const pid = parseProductoStockId(r) ?? "";
    const linked = Boolean(pid);
    let qtyOrdered: number | null = null;
    const pedRaw = r.cantidad_pedida ?? r.cantidadPedida ?? r.qty_ordered ?? r.qtyOrdered ?? r.pedido ?? r.expected;
    if (typeof pedRaw === "number" && Number.isFinite(pedRaw) && pedRaw > 0) qtyOrdered = pedRaw;
    else if (typeof pedRaw === "string") {
      const pn = Number(String(pedRaw).replace(",", "."));
      if (Number.isFinite(pn) && pn > 0) qtyOrdered = pn;
    }
    if (qtyOrdered == null || qtyOrdered <= 0) qtyOrdered = qty != null && qty > 0 ? qty : 1;

    const received = qty != null && qty > 0;
    let subtotal = 0;
    if (typeof r.subtotal === "number" && Number.isFinite(r.subtotal)) subtotal = r.subtotal;
    else if (typeof r.importe === "number" && Number.isFinite(r.importe)) subtotal = r.importe;
    else subtotal = perLine;

    let unitCost: number | null = null;
    if (typeof r.precio_unitario === "number" && Number.isFinite(r.precio_unitario)) unitCost = r.precio_unitario;
    else if (typeof r.precioUnitario === "number" && Number.isFinite(r.precioUnitario)) unitCost = r.precioUnitario;
    else if (qty != null && qty > 0 && subtotal > 0) unitCost = subtotal / qty;

    const lineIncident = r.incidencia === true || r.incidencia === "true";

    lines.push({
      id,
      name,
      productStockId: pid,
      qty,
      qtyOrdered,
      unitLabel: un,
      unitCost,
      subtotal,
      linked,
      received,
      lineIncident,
    });
    idx++;
  }

  return lines.length ? lines : buildDrawerReceptionLinesFallback(c);
}

function lineKeyFromItem(item: CompraLineItemLocal, i: number): string {
  return typeof item.id === "string" && item.id.trim() ? item.id.trim() : `ln-${i}`;
}

function persistedInvoiceForLine(c: CompraLocal, lineId: string): { iq?: number; ic?: number } {
  if (Array.isArray(c.items) && c.items.length > 0) {
    const ix = c.items.findIndex((it, i) => lineKeyFromItem(it, i) === lineId);
    if (ix >= 0) {
      const it = c.items[ix];
      return { iq: it.invoice_qty, ic: it.invoice_cost };
    }
  }
  if (lineId === `${c.id}-main`) return { iq: c.invoice_qty, ic: c.invoice_cost };
  return {};
}

function compraToDrawerDrafts(c: CompraLocal): DrawerLineDraft[] {
  const base = buildDrawerReceptionLines(c);
  return base.map((ln) => {
    const { iq, ic } = persistedInvoiceForLine(c, ln.id);
    const qty = ln.qty;
    const cost = ln.unitCost;
    const invQ = iq ?? qty;
    const invC = ic ?? cost;
    return {
      id: ln.id,
      name: ln.name,
      productStockId: ln.productStockId,
      unitLabel: ln.unitLabel,
      linked: ln.linked,
      qtyOrdered: ln.qtyOrdered,
      qtyReceivedStr: qty != null ? String(qty) : "",
      unitCostStr: cost != null ? String(cost) : "",
      incident: ln.lineIncident,
      invoiceQtyStr: invQ != null ? String(invQ) : "",
      invoiceCostStr: invC != null ? String(invC) : "",
    };
  });
}

function mergeInvoiceDraftsIntoCompra(prev: CompraLocal, drafts: DrawerLineDraft[]): CompraLocal {
  const byId = new Map(drafts.map((d) => [d.id, d] as const));
  if (Array.isArray(prev.items) && prev.items.length > 0) {
    const items = prev.items.map((item, i) => {
      const key = lineKeyFromItem(item, i);
      const d = byId.get(key);
      if (!d) return item;
      const iq = parseDrawerDecimal(d.invoiceQtyStr);
      const ic = parseDrawerDecimal(d.invoiceCostStr);
      const next: CompraLineItemLocal = { ...item };
      if (iq != null && iq >= 0) next.invoice_qty = iq;
      else delete (next as Record<string, unknown>).invoice_qty;
      if (ic != null && ic >= 0) next.invoice_cost = ic;
      else delete (next as Record<string, unknown>).invoice_cost;
      return next;
    });
    return { ...prev, items };
  }
  const d = drafts[0];
  if (!d) return prev;
  const iq = parseDrawerDecimal(d.invoiceQtyStr);
  const ic = parseDrawerDecimal(d.invoiceCostStr);
  const next: CompraLocal = { ...prev };
  if (iq != null && iq >= 0) next.invoice_qty = iq;
  else delete (next as Record<string, unknown>).invoice_qty;
  if (ic != null && ic >= 0) next.invoice_cost = ic;
  else delete (next as Record<string, unknown>).invoice_cost;
  return next;
}

function invoiceFieldsSignature(c: CompraLocal): string {
  if (Array.isArray(c.items) && c.items.length > 0) {
    return c.items
      .map((it, i) => {
        const k = lineKeyFromItem(it, i);
        return `${k}:${it.invoice_qty ?? ""}:${it.invoice_cost ?? ""}`;
      })
      .join("|");
  }
  return `root:${c.invoice_qty ?? ""}:${c.invoice_cost ?? ""}`;
}

type DrawerLineReconUi = "conciliado" | "leve" | "grave" | "pendiente";

function drawerLineReconciliationState(
  d: DrawerLineDraft,
  qtyReceived: number | null,
  costReceived: number | null,
): DrawerLineReconUi {
  const invQ = parseDrawerDecimal(d.invoiceQtyStr);
  const invC = parseDrawerDecimal(d.invoiceCostStr);
  if (qtyReceived == null || qtyReceived < 0 || costReceived == null || costReceived < 0) return "pendiente";
  if (
    d.invoiceQtyStr.trim() === "" ||
    d.invoiceCostStr.trim() === "" ||
    invQ === null ||
    invC === null ||
    invQ < 0 ||
    invC < 0
  ) {
    return "pendiente";
  }

  const dq = invQ - qtyReceived;
  const dc = invC - costReceived;
  if (Math.abs(dq) < 1e-7 && Math.abs(dc) < 1e-6) return "conciliado";

  const relQ = Math.abs(dq) / Math.max(qtyReceived, 1e-9);
  const relC = Math.abs(dc) / Math.max(costReceived, 1e-9);
  const severe =
    relQ > 0.15 || relC > 0.12 || Math.abs(dq) >= 2 || Math.abs(dc) >= 1;
  return severe ? "grave" : "leve";
}

function drawerReconLook(st: DrawerLineReconUi): { bg: string; bd: string; fg: string } {
  switch (st) {
    case "conciliado":
      return {
        bd: "rgba(42, 118, 92, 0.22)",
        bg: "var(--hostly-success-soft)",
        fg: "color-mix(in srgb, var(--hostly-ink) 62%, var(--hostly-ink-muted))",
      };
    case "leve":
      return {
        bd: "rgba(184, 149, 58, 0.32)",
        bg: "var(--hostly-warning-soft)",
        fg: "color-mix(in srgb, var(--hostly-ink) 58%, var(--hostly-ink-muted))",
      };
    case "grave":
      return {
        bd: "rgba(180, 83, 74, 0.32)",
        bg: "var(--hostly-danger-soft)",
        fg: "color-mix(in srgb, var(--hostly-ink) 65%, var(--hostly-ink-muted))",
      };
    case "pendiente":
    default:
      return {
        bd: "var(--hostly-table-divider-soft)",
        bg: "rgba(248, 251, 254, 0.92)",
        fg: "var(--hostly-ink-muted)",
      };
  }
}

function reconciliationRollupFromDrafts(drafts: DrawerLineDraft[]): {
  conciliadas: number;
  diferencias: number;
  pendientes: number;
  allConciliadas: boolean;
} {
  let conciliadas = 0;
  let diferencias = 0;
  let pendientes = 0;
  for (const d of drafts) {
    const rq = parseDrawerDecimal(d.qtyReceivedStr);
    const rc = parseDrawerDecimal(d.unitCostStr);
    const st = drawerLineReconciliationState(d, rq, rc);
    if (st === "conciliado") conciliadas += 1;
    else if (st === "pendiente") pendientes += 1;
    else diferencias += 1;
  }
  const n = drafts.length;
  return {
    conciliadas,
    diferencias,
    pendientes,
    allConciliadas: n > 0 && conciliadas === n && pendientes === 0,
  };
}

function buildDrawerTimeline(
  c: CompraLocal,
  sinF: boolean,
  sync: ReturnType<typeof stockSyncUiKind>,
  locale: Locale,
  reconDrafts: DrawerLineDraft[],
): DrawerTimelineStep[] {
  const fd = formatFechaCorta(c.fecha, locale);
  const invoiceDone = c.estado === "recibido" && !sinF;
  const stockDone = sync === "applied";
  const stockStamp =
    stockDone && typeof c.stock_applied_at === "number" && Number.isFinite(c.stock_applied_at)
      ? formatAppliedAtMs(c.stock_applied_at, locale)
      : stockDone
        ? fd
        : "—";
  const recon = reconciliationRollupFromDrafts(reconDrafts);
  const invoiceLabel = recon.allConciliadas
    ? "Factura conciliada"
    : !c.invoice_document?.attached
      ? "Factura pendiente"
      : "Factura pendiente revisión";
  return [
    { id: "created", label: "Pedido creado", done: true, stamp: fd },
    {
      id: "received",
      label: "Recepción marcada",
      done: c.estado === "recibido",
      stamp: c.estado === "recibido" ? fd : "—",
    },
    {
      id: "stock",
      label: "Stock aplicado",
      done: stockDone,
      stamp: stockStamp,
    },
    {
      id: "invoice",
      label: invoiceLabel,
      done: invoiceDone,
      stamp: invoiceDone ? fd : c.estado === "recibido" && sinF ? "Doc. pendiente" : "—",
    },
  ];
}

type RecepBadgeVariant = "neutral" | "ok" | "warn" | "bad" | "muted";

function RecepOperBadge({ label, value, variant }: { label: string; value: string; variant: RecepBadgeVariant }) {
  const softBd = "var(--hostly-table-divider-soft)";
  const pal: Record<RecepBadgeVariant, { bd: string; bg: string; lab: string; val: string }> = {
    neutral: {
      bd: softBd,
      bg: "rgba(248, 251, 254, 0.65)",
      lab: "var(--hostly-ink-soft)",
      val: "var(--hostly-ink-muted)",
    },
    ok: {
      bd: softBd,
      bg: "var(--hostly-success-soft)",
      lab: "var(--hostly-ink-soft)",
      val: "var(--hostly-ink)",
    },
    warn: {
      bd: softBd,
      bg: "var(--hostly-warning-soft)",
      lab: "var(--hostly-ink-soft)",
      val: "var(--hostly-ink)",
    },
    bad: {
      bd: softBd,
      bg: "var(--hostly-danger-soft)",
      lab: "var(--hostly-ink-soft)",
      val: "var(--hostly-ink)",
    },
    muted: {
      bd: softBd,
      bg: "rgba(248, 251, 254, 0.55)",
      lab: "var(--hostly-ink-soft)",
      val: "var(--hostly-ink-muted)",
    },
  };
  const c = pal[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 7px",
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.045em",
          color: "color-mix(in srgb, var(--hostly-ink-muted) 40%, var(--hostly-ink))",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "color-mix(in srgb, var(--hostly-ink) 88%, var(--hostly-ink-muted))",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </span>
  );
}

export default function RecepcionesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { restaurantId, user, ready, profileReady } = useAuth();
  const [items, setItems] = useState<CompraLocal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("todas");
  const [datePreset, setDatePreset] = useState<DatePreset>("todas");
  const [listSort, setListSort] = useState<ListSort>("fecha_desc");
  const [operFocus, setOperFocus] = useState<OperFocus | null>(null);
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [selectedReceptionId, setSelectedReceptionId] = useState<string | null>(null);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [drawerLineDrafts, setDrawerLineDrafts] = useState<DrawerLineDraft[]>([]);
  const [drawerDraftsCompraId, setDrawerDraftsCompraId] = useState<string | null>(null);
  const [drawerValidating, setDrawerValidating] = useState(false);
  const [drawerStockApplying, setDrawerStockApplying] = useState(false);
  const [drawerValidateErrors, setDrawerValidateErrors] = useState<Record<string, string>>({});
  const [drawerSaveNotice, setDrawerSaveNotice] = useState<string | null>(null);
  const [drawerSupplierInput, setDrawerSupplierInput] = useState("");
  const [supplierSuggestOpen, setSupplierSuggestOpen] = useState(false);
  const drawerValidateLock = useRef(false);
  const drawerStockLock = useRef(false);
  const lineLinkWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const invoiceFileInputRef = useRef<HTMLInputElement | null>(null);
  const drawerLineDraftsRef = useRef<DrawerLineDraft[]>([]);

  useEffect(() => {
    drawerLineDraftsRef.current = drawerLineDrafts;
  }, [drawerLineDrafts]);

  const [inventoryPickerProducts, setInventoryPickerProducts] = useState<ProductDocument[]>([]);
  const [linkPickerLineId, setLinkPickerLineId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  const refresh = useCallback(() => {
    setItems(loadCompras());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => refresh();
    window.addEventListener(STOCK_CHANGED_EVENT, fn);
    return () => window.removeEventListener(STOCK_CHANGED_EVENT, fn);
  }, [refresh]);

  useEffect(() => {
    if (!menuRowId) return;
    const close = () => setMenuRowId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuRowId]);

  useEffect(() => {
    if (!selectedReceptionId || !isFirebaseConfigured || !profileReady || !ready) {
      setInventoryPickerProducts([]);
      return;
    }
    const rid = restaurantId?.trim();
    if (!rid || !user) {
      setInventoryPickerProducts([]);
      return;
    }
    const unsub = listenProductsForInventory(rid, (items) => setInventoryPickerProducts(items));
    return () => unsub();
  }, [selectedReceptionId, restaurantId, user, profileReady, ready]);

  useEffect(() => {
    if (linkPickerLineId == null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const wrap = lineLinkWrapRefs.current[linkPickerLineId];
      if (wrap?.contains(t)) return;
      setLinkPickerLineId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [linkPickerLineId]);

  const persistCompras = useCallback((next: CompraLocal[]) => {
    setItems(next);
    saveCompras(next);
  }, []);

  const persistSupplierFromDrawer = useCallback(
    (raw: string) => {
      const id = selectedReceptionId;
      if (!id) return;
      const t = raw.trim();
      if (!t) return;
      const fresh = loadCompras();
      const ix = fresh.findIndex((c) => c.id === id);
      if (ix < 0) return;
      const prev = fresh[ix];
      const resolved = resolveSupplierForSave(t);
      const same =
        prev.proveedor === resolved.proveedor &&
        (prev.supplierInput ?? "") === resolved.supplierInput &&
        prev.supplierId === resolved.supplierId;
      if (same) return;
      const next: CompraLocal = { ...prev, ...resolved };
      if (!resolved.supplierId) {
        delete (next as Record<string, unknown>).supplierId;
        delete (next as Record<string, unknown>).supplierDisplayName;
        delete (next as Record<string, unknown>).supplierLegalName;
      }
      persistCompras([...fresh.slice(0, ix), next, ...fresh.slice(ix + 1)]);
      setDrawerSupplierInput((resolved.supplierDisplayName ?? resolved.proveedor).trim());
      setDrawerSaveNotice(locale === "en" ? "Supplier saved" : "Proveedor guardado");
      window.setTimeout(() => setDrawerSaveNotice(null), 2200);
    },
    [locale, persistCompras, selectedReceptionId],
  );

  const drawerSupplierSuggestions = useMemo(
    () => suggestSuppliers(drawerSupplierInput, 5),
    [drawerSupplierInput],
  );

  const pickDrawerSupplierSuggestion = useCallback(
    (s: CanonicalSupplier) => {
      setSupplierSuggestOpen(false);
      persistSupplierFromDrawer(s.displayName);
    },
    [persistSupplierFromDrawer],
  );

  const flushInvoiceDraftsToStorage = useCallback(() => {
    const id = selectedReceptionId;
    if (!id) return;
    const drafts = drawerLineDraftsRef.current;
    const fresh = loadCompras();
    const ix = fresh.findIndex((c) => c.id === id);
    if (ix < 0) return;
    const prev = fresh[ix];
    const merged = mergeInvoiceDraftsIntoCompra(prev, drafts);
    if (invoiceFieldsSignature(prev) === invoiceFieldsSignature(merged)) return;
    persistCompras([...fresh.slice(0, ix), merged, ...fresh.slice(ix + 1)]);
  }, [selectedReceptionId, persistCompras]);

  const validarRecepcionDrawer = useCallback(() => {
    const id = selectedReceptionId;
    if (!id || drawerValidateLock.current) return;

    const nextErrors: Record<string, string> = {};
    for (const d of drawerLineDrafts) {
      const parts: string[] = [];
      const qty = parseDrawerDecimal(d.qtyReceivedStr);
      const cost = parseDrawerDecimal(d.unitCostStr);
      if (d.qtyReceivedStr.trim() === "") parts.push("Cantidad requerida (≥ 0).");
      else if (qty === null) parts.push("Cantidad no válida.");
      else if (qty < 0) parts.push("Cantidad debe ser ≥ 0.");
      if (d.unitCostStr.trim() === "") parts.push("Coste requerido (≥ 0).");
      else if (cost === null) parts.push("Coste no válido.");
      else if (cost < 0) parts.push("Coste debe ser ≥ 0.");
      if (parts.length) nextErrors[d.id] = parts.join(" ");
    }

    if (Object.keys(nextErrors).length) {
      setDrawerValidateErrors(nextErrors);
      return;
    }
    setDrawerValidateErrors({});

    drawerValidateLock.current = true;
    setDrawerValidating(true);
    window.setTimeout(() => {
      try {
        const fresh = loadCompras();
        const ix = fresh.findIndex((c) => c.id === id);
        if (ix < 0) return;

        const prev = fresh[ix];
        const hasItems = Array.isArray(prev.items) && prev.items.length > 0;

        let nextCompra: CompraLocal;

        if (hasItems) {
          const byDraft = new Map(drawerLineDrafts.map((d) => [d.id, d] as const));
          const rawItems = prev.items!;
          const mapped: CompraLineItemLocal[] = rawItems.map((item, i) => {
            const key = typeof item.id === "string" && item.id.trim() ? item.id : `ln-${i}`;
            const d = byDraft.get(key);
            if (!d) return item;
            const qty = parseDrawerDecimal(d.qtyReceivedStr)!;
            const cost = parseDrawerDecimal(d.unitCostStr)!;
            const subtotal = Math.round(qty * cost * 1e6) / 1e6;
            const iq = parseDrawerDecimal(d.invoiceQtyStr);
            const ic = parseDrawerDecimal(d.invoiceCostStr);
            const lineOut: CompraLineItemLocal = {
              ...item,
              id: item.id ?? key,
              cantidad: qty,
              precio_unitario: cost,
              subtotal,
              incidencia: d.incident,
            };
            if (iq != null && iq >= 0) lineOut.invoice_qty = iq;
            else delete (lineOut as Record<string, unknown>).invoice_qty;
            if (ic != null && ic >= 0) lineOut.invoice_cost = ic;
            else delete (lineOut as Record<string, unknown>).invoice_cost;
            return lineOut;
          });
          const sumTotal = mapped.reduce((s, it) => s + (typeof it.subtotal === "number" ? it.subtotal : 0), 0);
          nextCompra = { ...prev, items: mapped, total: sumTotal };
        } else {
          const d = drawerLineDrafts[0];
          if (!d) return;
          const qty = parseDrawerDecimal(d.qtyReceivedStr)!;
          const cost = parseDrawerDecimal(d.unitCostStr)!;
          const total = Math.round(qty * cost * 1e6) / 1e6;
          const iq = parseDrawerDecimal(d.invoiceQtyStr);
          const ic = parseDrawerDecimal(d.invoiceCostStr);
          nextCompra = {
            ...prev,
            cantidad_recibida: qty,
            precio_unitario: cost,
            total,
            recepcion_incidencia: d.incident,
          };
          if (iq != null && iq >= 0) nextCompra.invoice_qty = iq;
          else delete (nextCompra as Record<string, unknown>).invoice_qty;
          if (ic != null && ic >= 0) nextCompra.invoice_cost = ic;
          else delete (nextCompra as Record<string, unknown>).invoice_cost;
        }

        const nextList = [...fresh.slice(0, ix), nextCompra, ...fresh.slice(ix + 1)];
        persistCompras(nextList);
        setDrawerLineDrafts(compraToDrawerDrafts(nextCompra));
        setDrawerDraftsCompraId(nextCompra.id);
        setDrawerSaveNotice("Recepción validada");
        window.setTimeout(() => setDrawerSaveNotice(null), 2800);
      } finally {
        drawerValidateLock.current = false;
        setDrawerValidating(false);
      }
    }, 100);
  }, [drawerLineDrafts, persistCompras, selectedReceptionId]);

  const applyCentralInventoryReceipt = useCallback(
    async (c: CompraLocal) => {
      if (!isFirebaseConfigured) {
        router.push("/dashboard/compras");
        return;
      }
      const rid = restaurantId?.trim();
      if (!rid || !profileReady || !ready || !user) {
        window.alert(
          "Inicia sesión y espera a que cargue el restaurante para aplicar stock al inventario central.",
        );
        return;
      }
      if (c.estado !== "recibido") {
        router.push("/dashboard/compras");
        return;
      }
      const pid = c.producto_stock_id?.trim();
      const qty = coercedCantidadRecibida(c.cantidad_recibida as unknown);
      if (!pid || qty == null || qty <= 0) {
        router.push("/dashboard/compras");
        return;
      }
      if (stockSyncUiKind(c) === "applied") {
        window.alert("Esta recepción ya aplicó stock al inventario central.");
        return;
      }

      setReceiptBusyId(c.id);
      try {
        const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
        const costPerUnit =
          total > 0 && qty > 0 ? Math.round((total / qty) * 1_000_000) / 1_000_000 : null;
        const notesParts = [`compraLocal:${c.id}`];
        if (c.notas?.trim()) notesParts.push(c.notas.trim());
        const { receiptId } = await applyInventoryReceipt({
          restaurantId: rid,
          createdBy: user.uid ?? null,
          supplierName: compraSupplierNameForReceipt(c),
          notes: notesParts.join(" · "),
          items: [
            {
              productId: pid,
              productName:
                (c.producto_stock_nombre ?? "").trim() ||
                (c.proveedor ?? "").trim() ||
                "Producto",
              quantity: qty,
              unit: c.unidad ?? "ud",
              costPerUnit,
            },
          ],
        });
        const ts = Date.now();
        const nextList = loadCompras().map((row) =>
          row.id === c.id
            ? { ...row, inventory_receipt_id: receiptId, stock_aplicado: true, stock_applied_at: ts }
            : row,
        );
        persistCompras(nextList);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(STOCK_CHANGED_EVENT));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        window.alert(msg);
      } finally {
        setReceiptBusyId(null);
      }
    },
    [persistCompras, profileReady, ready, restaurantId, router, user],
  );

  const applyStockFromDrawer = useCallback(async () => {
    if (!isFirebaseConfigured) {
      window.alert("Configura Firebase para aplicar stock al inventario central.");
      return;
    }
    const id = selectedReceptionId;
    if (!id || drawerStockLock.current) return;
    const rid = restaurantId?.trim();
    if (!rid || !profileReady || !ready || !user) {
      window.alert(
        "Inicia sesión y espera a que cargue el restaurante para aplicar stock al inventario central.",
      );
      return;
    }

    const c = loadCompras().find((row) => row.id === id);
    if (!c) return;

    if (stockSyncUiKind(c) === "applied") {
      setDrawerSaveNotice(locale === "en" ? "Stock already applied" : "Stock ya aplicado");
      window.setTimeout(() => setDrawerSaveNotice(null), 2800);
      return;
    }
    if (c.estado !== "recibido") {
      window.alert("Marca la recepción como recibida antes de aplicar stock.");
      return;
    }

    const lineMeta = new Map(buildDrawerReceptionLines(c).map((ln) => [ln.id, ln] as const));
    const items: InventoryReceiptItemInput[] = [];
    for (const d of drawerLineDrafts) {
      const meta = lineMeta.get(d.id);
      const pid = (d.productStockId ?? "").trim() || (meta?.productStockId ?? "").trim();
      if (!pid) continue;
      const qty = parseDrawerDecimal(d.qtyReceivedStr);
      if (qty == null || qty <= 0) continue;
      if (d.unitCostStr.trim() === "") {
        window.alert(`Indica el coste unitario en la línea: ${d.name}`);
        return;
      }
      const cost = parseDrawerDecimal(d.unitCostStr);
      if (cost === null || cost < 0) {
        window.alert(`Coste no válido en la línea: ${d.name}`);
        return;
      }
      items.push({
        productId: d.productStockId.trim(),
        productName: d.name.trim() || "Producto",
        quantity: qty,
        unit: d.unitLabel || "ud",
        costPerUnit: cost,
      });
    }

    if (!items.length) {
      window.alert(
        "No hay líneas vinculadas a productos del inventario central con cantidad recibida > 0.",
      );
      return;
    }

    drawerStockLock.current = true;
    setDrawerStockApplying(true);
    try {
      const notesParts = [`compraLocal:${c.id}`];
      if (c.notas?.trim()) notesParts.push(c.notas.trim());
      const { receiptId } = await applyInventoryReceipt({
        restaurantId: rid,
        createdBy: user.uid ?? null,
        supplierName: compraSupplierNameForReceipt(c),
        notes: notesParts.join(" · "),
        items,
      });
      const ts = Date.now();
      const nextList = loadCompras().map((row) =>
        row.id === c.id
          ? { ...row, inventory_receipt_id: receiptId, stock_aplicado: true, stock_applied_at: ts }
          : row,
      );
      persistCompras(nextList);
      setDrawerSaveNotice(locale === "en" ? "Stock applied" : "Stock aplicado");
      window.setTimeout(() => setDrawerSaveNotice(null), 3200);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(STOCK_CHANGED_EVENT));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
    } finally {
      drawerStockLock.current = false;
      setDrawerStockApplying(false);
    }
  }, [drawerLineDrafts, locale, persistCompras, profileReady, ready, restaurantId, selectedReceptionId, user]);

  const linkReceptionLineToProduct = useCallback(
    (lineDraftId: string, product: ProductDocument) => {
      const compraId = selectedReceptionId;
      if (!compraId) return;
      const pid = product.id?.trim();
      if (!pid) return;

      const nombre = product.name?.trim() || "Producto";
      const unitLabel = inventoryUnitToCompraUnidad(String(product.inventory?.unit ?? "ud"));

      const fresh = loadCompras();
      const ix = fresh.findIndex((c) => c.id === compraId);
      if (ix < 0) return;
      const prev = fresh[ix];

      const hasItems = Array.isArray(prev.items) && prev.items.length > 0;
      let nextCompra: CompraLocal;

      if (hasItems) {
        let found = false;
        const mapped = (prev.items ?? []).map((item, i) => {
          const key = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `ln-${i}`;
          if (key !== lineDraftId) return item;
          found = true;
          return {
            ...item,
            id: item.id ?? key,
            producto_stock_id: pid,
            producto_stock_nombre: nombre,
            unidad: unitLabel,
          };
        });
        if (!found) return;
        nextCompra = { ...prev, items: mapped };
      } else {
        if (lineDraftId !== `${prev.id}-main`) return;
        nextCompra = {
          ...prev,
          producto_stock_id: pid,
          producto_stock_nombre: nombre,
          unidad: unitLabel,
        };
      }

      const nextList = [...fresh.slice(0, ix), nextCompra, ...fresh.slice(ix + 1)];
      persistCompras(nextList);
      setDrawerLineDrafts((prev) =>
        prev.map((row) =>
          row.id === lineDraftId
            ? { ...row, name: nombre, productStockId: pid, unitLabel, linked: true }
            : row,
        ),
      );
      setLinkPickerLineId(null);
      setLinkSearch("");
      setDrawerSaveNotice("Vínculo guardado");
      window.setTimeout(() => setDrawerSaveNotice(null), 2200);
    },
    [selectedReceptionId, persistCompras],
  );

  const onInvoiceFileSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const id = selectedReceptionId;
      if (!file || !id) return;
      const fresh = loadCompras();
      const ix = fresh.findIndex((c) => c.id === id);
      if (ix < 0) return;
      const prev = fresh[ix];
      const next: CompraLocal = {
        ...prev,
        invoice_document: {
          attached: true,
          filename: file.name.slice(0, 512),
          uploaded_at: Date.now(),
          status: "attached",
        },
      };
      persistCompras([...fresh.slice(0, ix), next, ...fresh.slice(ix + 1)]);
      setDrawerSaveNotice(locale === "en" ? "Invoice attached" : "Factura adjuntada");
      window.setTimeout(() => setDrawerSaveNotice(null), 2400);
    },
    [locale, persistCompras, selectedReceptionId],
  );

  const updateEstado = useCallback(
    (id: string, estado: CompraEstado) => {
      const prev = loadCompras().find((c) => c.id === id);
      if (!prev || prev.estado === estado) return;
      const nextRaw: CompraLocal = { ...prev, estado };
      const stock = loadStock();
      const { stock: newStock, compra } = reconcileCompraStock(prev, nextRaw, stock);
      saveStock(newStock);
      const nextList = loadCompras().map((c) => (c.id === id ? compra : c));
      persistCompras(nextList);
    },
    [persistCompras],
  );

  const today = useMemo(() => todayIsoLocal(), []);
  const weekStart = useMemo(() => subtractDaysIso(today, 7), [today]);
  const monthStart = useMemo(() => subtractDaysIso(today, 30), [today]);

  const kpis = useMemo(() => {
    const pend = items.filter((c) => c.estado === "pendiente").length;
    const hoy = items.filter((c) => c.estado === "recibido" && c.fecha === today).length;
    const inc = items.filter(hasIncidencia).length;
    const sinF = items.filter(compraSinFacturaDoc).length;
    return { pend, hoy, inc, sinF };
  }, [items, today]);

  const operCounts = useMemo(() => {
    let pendientes = 0;
    let diferencia = 0;
    let sinFactura = 0;
    let sinVincular = 0;
    let stockNo = 0;
    let lineasFaltantes = 0;
    for (const c of items) {
      if (c.estado === "pendiente") pendientes += 1;
      if (hasDiferenciaNotas(c)) diferencia += 1;
      if (compraSinFacturaDoc(c)) sinFactura += 1;
      if (c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim()) sinVincular += 1;
      if (stockSyncUiKind(c) === "not_applied") stockNo += 1;
      if (missingLinesHint(c)) lineasFaltantes += 1;
    }
    return { pendientes, diferencia, sinFactura, sinVincular, stockNo, lineasFaltantes };
  }, [items]);

  const displayedRows = useMemo(() => {
    let list = [...items];
    if (datePreset === "hoy") list = list.filter((c) => c.fecha === today);
    else if (datePreset === "semana") list = list.filter((c) => c.fecha >= weekStart && c.fecha <= today);
    else if (datePreset === "mes") list = list.filter((c) => c.fecha >= monthStart && c.fecha <= today);

    if (listFilter !== "todas") list = list.filter((c) => c.estado === listFilter);

    if (operFocus === "pendientes") list = list.filter((c) => c.estado === "pendiente");
    else if (operFocus === "diferencia") list = list.filter(hasDiferenciaNotas);
    else if (operFocus === "sin_factura") list = list.filter(compraSinFacturaDoc);
    else if (operFocus === "sin_vincular") list = list.filter((c) => c.estado !== "cancelado" && !(c.producto_stock_id ?? "").trim());
    else if (operFocus === "stock_no") list = list.filter((c) => stockSyncUiKind(c) === "not_applied");
    else if (operFocus === "lineas_faltantes") list = list.filter(missingLinesHint);

    if (soloIncidencias) list = list.filter(hasIncidencia);

    const q = normalizeForSearch(listSearch);
    if (q) {
      list = list.filter((c) => {
        const blob = [
          c.proveedor,
          c.supplierDisplayName ?? "",
          c.supplierLegalName ?? "",
          c.supplierInput ?? "",
          c.supplierId ?? "",
          c.id,
          c.notas ?? "",
          c.producto_stock_nombre ?? "",
          String(c.total ?? ""),
          c.fecha,
        ]
          .map((x) => normalizeForSearch(String(x)))
          .join(" ");
        return blob.includes(q);
      });
    }

    list.sort((a, b) => {
      const ta = typeof a.total === "number" && Number.isFinite(a.total) ? a.total : 0;
      const tb = typeof b.total === "number" && Number.isFinite(b.total) ? b.total : 0;
      switch (listSort) {
        case "fecha_asc":
          return a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);
        case "importe_desc":
          return tb - ta || b.fecha.localeCompare(a.fecha);
        case "importe_asc":
          return ta - tb || a.fecha.localeCompare(b.fecha);
        case "fecha_desc":
        default:
          return b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id);
      }
    });
    return list;
  }, [
    items,
    listFilter,
    datePreset,
    today,
    weekStart,
    monthStart,
    listSearch,
    listSort,
    operFocus,
    soloIncidencias,
  ]);

  const recepcionListDisplayRows = useMemo((): RecepcionListDisplayRow[] => {
    return displayedRows.map((c) => {
      const sinF = compraSinFacturaDoc(c);
      const sync = stockSyncUiKind(c);
      const phase = validationPhase(c);
      const { title: phaseTitle, sub: phaseSub } = phaseLabels(phase, t);
      const nItems = lineItemCount(c);
      const itemStr =
        nItems === 0
          ? t("recepciones.rowItemsNone")
          : nItems === 1
            ? t("recepciones.rowItemsOne")
            : t("recepciones.rowItemsMany", { count: nItems });
      const notas = (c.notas ?? "").trim();
      const refSnippet = notas ? (notas.length > 36 ? `${notas.slice(0, 34)}…` : notas) : "";
      const incidents = collectRowIncidents(c, sinF, sync, t);
      const primaryIncident = incidents[0];
      const invVariant: RecepBadgeVariant =
        c.estado !== "recibido" ? "muted" : sinF ? "bad" : "ok";
      const invVal =
        c.estado !== "recibido" ? "—" : sinF ? t("recepciones.invoiceMissing") : t("recepciones.invoiceOk");
      const stkVariant: RecepBadgeVariant =
        sync === "applied" ? "ok" : sync === "not_applied" ? "warn" : "muted";
      const stkVal =
        sync === "applied"
          ? t("recepciones.stockOk")
          : sync === "not_applied"
            ? t("recepciones.stockPending")
            : t("recepciones.stockNA");
      const pedVariant: RecepBadgeVariant =
        c.estado === "pendiente" ? "warn" : c.estado === "recibido" ? "ok" : "muted";

      return {
        id: c.id,
        supplierPrimary: supplierPrimaryLabel(c),
        supplierLegal: supplierLegalSubtitle(c) || undefined,
        dateLabel: formatFechaCorta(c.fecha, locale),
        orderLabel: `${t("recepciones.orderRef")} · ${c.id.slice(-6)}`,
        itemsLabel: itemStr,
        refSnippet: refSnippet ? `${t("recepciones.rowAlbaran")} ${refSnippet}` : undefined,
        phaseTitle,
        phaseSub,
        incidentText: primaryIncident?.text,
        extraIncidents: incidents.length > 1 ? incidents.length - 1 : undefined,
        amountLabel: formatEuro(
          typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0,
          locale,
        ),
        invoiceStatus: { label: invVal, tone: recepcionOperBadgeTone(invVariant) },
        stockStatus: { label: stkVal, tone: recepcionOperBadgeTone(stkVariant) },
        orderStatus: { label: estadoLabel(c.estado, t), tone: recepcionOperBadgeTone(pedVariant) },
        selected: selectedReceptionId === c.id,
        attention: hasIncidencia(c),
      };
    });
  }, [displayedRows, locale, selectedReceptionId, t]);

  const displayedRowsById = useMemo(() => {
    const map = new Map<string, CompraLocal>();
    for (const row of displayedRows) map.set(row.id, row);
    return map;
  }, [displayedRows]);

  const selectedReception = useMemo(
    () => (selectedReceptionId ? items.find((c) => c.id === selectedReceptionId) ?? null : null),
    [selectedReceptionId, items],
  );

  const drawerContext = useMemo(() => {
    if (!selectedReception) return null;
    const c = selectedReception;
    const sinF = compraSinFacturaDoc(c);
    const sync = stockSyncUiKind(c);
    const incidents = collectRowIncidents(c, sinF, sync, t);
    const invVariant: RecepBadgeVariant = c.estado !== "recibido" ? "muted" : sinF ? "bad" : "ok";
    const invVal =
      c.estado !== "recibido" ? "—" : sinF ? t("recepciones.invoiceMissing") : t("recepciones.invoiceOk");
    const stkVariant: RecepBadgeVariant =
      sync === "applied" ? "ok" : sync === "not_applied" ? "warn" : "muted";
    const stkVal =
      sync === "applied" ? t("recepciones.stockOk") : sync === "not_applied" ? t("recepciones.stockPending") : t("recepciones.stockNA");
    const pedVariant: RecepBadgeVariant =
      c.estado === "pendiente" ? "warn" : c.estado === "recibido" ? "ok" : "muted";
    const phase = validationPhase(c);
    const { title: phaseTitle, sub: phaseSub } = phaseLabels(phase, t);
    const incidentSummary = incidents.length ? incidents.map((i) => i.text).join(" · ") : "—";
    const notas = (c.notas ?? "").trim();
    const reconDrafts =
      selectedReceptionId &&
      drawerDraftsCompraId === selectedReceptionId &&
      drawerLineDrafts.length > 0
        ? drawerLineDrafts
        : compraToDrawerDrafts(c);
    const reconciliation = reconciliationRollupFromDrafts(reconDrafts);
    const timeline = buildDrawerTimeline(c, sinF, sync, locale, reconDrafts);
    return {
      c,
      sinF,
      sync,
      incidents,
      invVariant,
      invVal,
      stkVariant,
      stkVal,
      pedVariant,
      incidentSummary,
      notas,
      phaseTitle,
      phaseSub,
      timeline,
      reconciliation,
    };
  }, [selectedReception, t, locale, drawerLineDrafts, drawerDraftsCompraId, selectedReceptionId]);

  useEffect(() => {
    if (!selectedReceptionId) {
      setDrawerLineDrafts([]);
      setDrawerDraftsCompraId(null);
      setDrawerSupplierInput("");
      setSupplierSuggestOpen(false);
      return;
    }
    const c = loadCompras().find((x) => x.id === selectedReceptionId);
    if (!c) {
      setDrawerLineDrafts([]);
      setDrawerDraftsCompraId(null);
      setDrawerSupplierInput("");
      setSupplierSuggestOpen(false);
      return;
    }
    setDrawerLineDrafts(compraToDrawerDrafts(c));
    setDrawerDraftsCompraId(selectedReceptionId);
    setDrawerSupplierInput((c.supplierInput ?? c.supplierDisplayName ?? c.proveedor ?? "").trim());
  }, [selectedReceptionId]);

  useEffect(() => {
    setDrawerValidateErrors({});
    setDrawerSaveNotice(null);
    setLinkPickerLineId(null);
    setLinkSearch("");
  }, [selectedReceptionId]);

  const drawerLineKpis = useMemo(() => {
    let pend = 0;
    let inc = 0;
    for (const d of drawerLineDrafts) {
      const q = parseDrawerDecimal(d.qtyReceivedStr);
      const st = deriveLineUiStatus(d, q);
      if (st === "pendiente") pend += 1;
      if (st === "incidencia") inc += 1;
    }
    return { total: drawerLineDrafts.length, pend, inc };
  }, [drawerLineDrafts]);

  const drawerFooterState = useMemo(() => {
    if (!drawerContext) {
      return { stockApplied: false, aplicarPrimary: false, footBusy: false, canApplyStock: false };
    }
    const stockApplied = stockSyncUiKind(drawerContext.c) === "applied";
    const aplicarPrimary = !stockApplied && drawerContext.c.estado === "recibido";
    const footBusy = drawerValidating || drawerStockApplying;
    const canApplyStock = drawerContext.c.estado === "recibido" && !stockApplied && isFirebaseConfigured;
    return { stockApplied, aplicarPrimary, footBusy, canApplyStock };
  }, [drawerContext, drawerValidating, drawerStockApplying]);

  const linkPickerFiltered = useMemo(() => {
    const q = normalizeForSearch(linkSearch);
    let list = inventoryPickerProducts;
    if (q) {
      list = list.filter((p) => normalizeForSearch(p.name).includes(q));
    }
    return list.slice(0, 100);
  }, [inventoryPickerProducts, linkSearch]);

  const linkPickerReady =
    isFirebaseConfigured && profileReady && ready && Boolean(restaurantId?.trim()) && Boolean(user);

  if (!hydrated) {
    return (
      <ModulePageShell
        {...inventoryHubShellLayout}
        title={t("recepciones.title")}
        subtitle={t("recepciones.loadingSubtitle")}
        headerBelow={<InventarioRouteTabs />}
      >
        <p className="hostly-muted mb-0 !text-[13px]">{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      {...inventoryHubShellLayout}
      title={t("recepciones.title")}
      subtitle={t("recepciones.subtitle")}
      headerBelow={<InventarioRouteTabs />}
      headerRight={
        <button
          type="button"
          onClick={() => router.push("/dashboard/compras")}
          className="hostly-button-secondary hostly-button-compact shrink-0 whitespace-nowrap !border-emerald-400/35 !bg-emerald-50 !font-semibold !text-[color:var(--hostly-navy-deep)] hover:!border-emerald-400/50 hover:!bg-emerald-100/90"
        >
          {t("recepciones.ctaRegister")}
        </button>
      }
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .hostly-recepciones-skin.hostly-recepciones-skin button {
              min-height: 30px !important;
            }
            .hostly-recepciones-skin.hostly-recepciones-skin .hostly-recep-drawer-foot-btn {
              min-height: 40px !important;
            }
            .hostly-recepciones-skin.hostly-recepciones-skin .hostly-recep-row-actions button {
              min-height: 30px !important;
            }
            .hostly-recepciones-skin .hostly-recep-validate:hover {
              filter: brightness(0.985);
            }
            .hostly-recepciones-skin .hostly-recep-validate.hostly-recep-validate--on:hover {
              filter: none;
              border-color: color-mix(in srgb, var(--hostly-accent) 36%, transparent) !important;
              background: color-mix(in srgb, var(--hostly-accent) 12%, var(--hostly-surface-card-solid)) !important;
            }
            .hostly-recepciones-skin .hostly-recep-row-actions select {
              min-height: 30px !important;
            }
            .hostly-recepciones-skin .hostly-recep-drawer-foot-btn {
              cursor: pointer !important;
              opacity: 1;
              flex: 1 1 0;
              min-width: 0;
              transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
            }
            .hostly-recepciones-skin             .hostly-recep-drawer-foot-btn:hover {
              background: color-mix(in srgb, var(--hostly-surface-card-solid) 88%, var(--hostly-ink) 5%) !important;
              border-color: rgba(0, 0, 0, 0.1) !important;
            }
            .hostly-recep-drawer-foot-primary {
              border: 1px solid color-mix(in srgb, var(--hostly-accent) 44%, transparent) !important;
              background: color-mix(in srgb, var(--hostly-accent) 15%, var(--hostly-surface-card-solid)) !important;
              font-weight: 700 !important;
            }
            .hostly-recep-drawer-foot-primary:hover {
              background: color-mix(in srgb, var(--hostly-accent) 22%, var(--hostly-surface-card-solid)) !important;
              border-color: color-mix(in srgb, var(--hostly-accent) 52%, transparent) !important;
            }
            .hostly-recep-line-tool-btn {
              flex-shrink: 0;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 28px;
              min-height: 28px;
              padding: 0 6px;
              border-radius: 6px;
              border: 1px solid var(--hostly-table-divider-soft);
              background: color-mix(in srgb, var(--hostly-surface-card-solid) 96%, transparent);
              font-size: 12px;
              font-weight: 560;
              line-height: 1;
              cursor: pointer;
              color: color-mix(in srgb, var(--hostly-ink-muted) 90%, transparent);
              transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
              box-sizing: border-box;
              touch-action: manipulation;
              box-shadow: none;
            }
            .hostly-recep-line-tool-btn:hover {
              background: var(--hostly-table-row-hover);
              border-color: color-mix(in srgb, var(--hostly-ink-soft) 25%, var(--hostly-table-divider-soft));
              color: color-mix(in srgb, var(--hostly-ink) 70%, var(--hostly-ink-muted));
            }
            @media (max-width: 960px) {
              .hostly-recep-row {
                grid-template-columns: 1fr !important;
                gap: 6px !important;
              }
              .hostly-recep-row-actions {
                justify-content: flex-start !important;
                flex-wrap: wrap !important;
              }
            }
            @media (max-width: 720px) {
              .hostly-recep-kpis {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              }
            }
          `,
        }}
      />
      <HostlySection
        stack="sm"
        className="hostly-recepciones-skin min-h-0 flex-1 overflow-hidden"
      >
        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense hostly-carta-config-kpi-strip--mobile-op shrink-0">
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--warning">
            <span className="hostly-carta-config-kpi-pill__label">{t("recepciones.kpiPending")}</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.pend}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">{t("recepciones.kpiReceivedToday")}</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.hoy}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--danger">
            <span className="hostly-carta-config-kpi-pill__label">{t("recepciones.kpiIncidents")}</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.inc}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">{t("recepciones.kpiNoInvoice")}</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.sinF}</span>
          </div>
        </div>

        <HostlySurface
          variant="soft"
          className="hostly-mobile-op-segment-bar box-border flex min-w-0 shrink-0 items-stretch gap-1.5 overflow-x-auto overflow-y-hidden px-2 py-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingRight: 6,
              marginRight: 2,
              borderRight: "1px solid var(--hostly-table-divider-soft)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "color-mix(in srgb, var(--hostly-ink-muted) 82%, var(--hostly-ink))",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {t("recepciones.operTitle")}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "color-mix(in srgb, var(--hostly-ink-soft) 92%, var(--hostly-ink-muted))",
                fontWeight: 500,
                marginTop: 1,
                lineHeight: 1.25,
                maxWidth: 160,
              }}
            >
              {t("recepciones.operSubtitle")}
            </span>
          </div>
          <HostlySegmentedControl
            aria-label={t("recepciones.operTitle")}
            className="min-w-0 flex-1"
          >
            {(
              [
                { id: "pendientes" as const, label: t("recepciones.operPendientes"), n: operCounts.pendientes },
                { id: "diferencia" as const, label: t("recepciones.operDiff"), n: operCounts.diferencia },
                { id: "sin_factura" as const, label: t("recepciones.operNoInvoice"), n: operCounts.sinFactura },
                { id: "sin_vincular" as const, label: t("recepciones.operUnlinked"), n: operCounts.sinVincular },
                { id: "stock_no" as const, label: t("recepciones.operStockPending"), n: operCounts.stockNo },
                { id: "lineas_faltantes" as const, label: t("recepciones.operLinesMissing"), n: operCounts.lineasFaltantes },
              ] as const
            ).map((chip) => {
              const active = operFocus === chip.id;
              const open = chip.n > 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={hostlySegmentTabClassName("inline-flex items-center gap-1 !text-[11px]")}
                  onClick={() => setOperFocus((p) => (p === chip.id ? null : chip.id))}
                  style={{
                    cursor: "pointer",
                    opacity: open ? 1 : 0.58,
                  }}
                >
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 11 }}>{chip.n}</span>
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </HostlySegmentedControl>
        </HostlySurface>

        <HostlySurface
          variant="soft"
          role="search"
          className="hostly-mobile-op-toolbar box-border flex min-w-0 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto px-2 py-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <input
            type="search"
            className="hostly-mobile-op-toolbar__search hostly-input"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder={t("recepciones.toolbarSearchPlaceholder")}
            aria-label={t("recepciones.toolbarSearchPlaceholder")}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: "160px",
              minWidth: 140,
              minHeight: 30,
              padding: "5px 8px",
              borderRadius: 6,
              border: `1px solid var(--hostly-table-divider-soft)`,
              background: "var(--hostly-surface-card-solid)",
              color: "var(--hostly-ink)",
              fontSize: 12,
              boxSizing: "border-box",
              touchAction: "manipulation",
            }}
          />
          <div className="hostly-mobile-op-toolbar__filters">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              fontSize: 10,
              color: "color-mix(in srgb, var(--hostly-ink-muted) 85%, var(--hostly-ink))",
              minHeight: 30,
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
              {t("recepciones.filterStatus")}
            </span>
            <select
              value={listFilter}
              onChange={(e) => {
                setOperFocus(null);
                setListFilter(e.target.value as ListFilter);
              }}
              style={{ ...recepToolbarControlStyle, maxWidth: 160 }}
            >
              <option value="todas">{t("recepciones.filterAll")}</option>
              <option value="pendiente">{t("recepciones.filterPending")}</option>
              <option value="recibido">{t("recepciones.filterReceived")}</option>
              <option value="cancelado">{t("recepciones.filterCancelled")}</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              fontSize: 10,
              color: "color-mix(in srgb, var(--hostly-ink-muted) 85%, var(--hostly-ink))",
              minHeight: 30,
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
              {t("recepciones.filterDate")}
            </span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={recepToolbarControlStyle}
            >
              <option value="todas">{t("recepciones.dateAll")}</option>
              <option value="hoy">{t("recepciones.dateToday")}</option>
              <option value="semana">{t("recepciones.dateWeek")}</option>
              <option value="mes">{t("recepciones.dateMonth")}</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              fontSize: 10,
              color: "color-mix(in srgb, var(--hostly-ink-muted) 85%, var(--hostly-ink))",
              minHeight: 30,
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
              {t("recepciones.sortBy")}
            </span>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              style={{ ...recepToolbarControlStyle, maxWidth: 200 }}
            >
              <option value="fecha_desc">{t("recepciones.sortFechaDesc")}</option>
              <option value="fecha_asc">{t("recepciones.sortFechaAsc")}</option>
              <option value="importe_desc">{t("recepciones.sortImporteDesc")}</option>
              <option value="importe_asc">{t("recepciones.sortImporteAsc")}</option>
            </select>
          </label>
          </div>
          <button
            type="button"
            onClick={() => setSoloIncidencias((v) => !v)}
            className={soloIncidencias ? undefined : "hostly-btn-soft"}
            style={{
              flexShrink: 0,
              border: soloIncidencias ? "1px solid var(--hostly-table-divider-soft)" : undefined,
              background: soloIncidencias ? "rgba(184, 149, 58, 0.12)" : undefined,
              color: "var(--hostly-ink)",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              minHeight: 30,
              boxSizing: "border-box",
              touchAction: "manipulation",
            }}
          >
            {t("recepciones.toggleIncidents")}
          </button>
        </HostlySurface>

        <div
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "row",
            overflow: "hidden",
            gap: 6,
            alignItems: "stretch",
          }}
        >
          <HostlySurface
            variant="ice"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden box-border"
          >
            <div
              style={{
                flexShrink: 0,
                padding: "6px 10px 4px",
                borderBottom: "1px solid var(--hostly-table-divider-soft)",
                background: "var(--hostly-table-head-surface)",
              }}
            >
              <HostlySectionHeader
                title={t("recepciones.listTitle")}
                description={t("recepciones.listCount", { shown: displayedRows.length, total: items.length })}
                descriptionClassName="m-0 !text-[11px] !leading-snug text-[color:var(--hostly-ink-muted)] !font-semibold"
                className="w-full min-w-0 flex-wrap items-end"
              />
            </div>
            {items.length === 0 ? (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--hostly-ink-muted)",
                  fontSize: 12,
                }}
              >
                {t("recepciones.emptyNone")}
              </div>
            ) : displayedRows.length === 0 ? (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--hostly-ink-muted)",
                  fontSize: 12,
                }}
              >
                {t("recepciones.emptyFilter")}
              </div>
            ) : (
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflow: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <RecepcionesListDataView
                  rows={recepcionListDisplayRows}
                  onSelect={(id) => {
                    setMenuRowId(null);
                    setSelectedReceptionId(id);
                  }}
                  renderActions={(row) => {
                    const c = displayedRowsById.get(row.id);
                    if (!c) return null;
                    const look = estadoLook[c.estado];
                    const phase = validationPhase(c);
                    const validatePrimary = phase === "pendiente" || phase === "incidencia";
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedReceptionId(c.id)}
                          className={
                            "hostly-recep-validate hostly-button-compact" +
                            (validatePrimary ? " hostly-recep-validate--on" : "")
                          }
                        >
                          {t("recepciones.actionValidatePrimary")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedReceptionId(c.id)}
                          className="hostly-btn-soft hostly-button-compact"
                        >
                          {t("recepciones.actionInvoice")}
                        </button>
                        <button
                          type="button"
                          disabled={receiptBusyId === c.id}
                          onClick={() => void applyCentralInventoryReceipt(c)}
                          className="hostly-btn-soft hostly-button-compact"
                        >
                          {receiptBusyId === c.id ? "…" : t("recepciones.actionStock")}
                        </button>
                        <div style={{ position: "relative", display: "inline-flex" }}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuRowId((p) => (p === c.id ? null : c.id));
                            }}
                            aria-expanded={menuRowId === c.id}
                            className="hostly-btn-soft hostly-button-compact"
                          >
                            {t("recepciones.actionMore")}
                          </button>
                          {menuRowId === c.id ? (
                            <div
                              role="menu"
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "calc(100% + 6px)",
                                zIndex: 40,
                                minWidth: 180,
                                borderRadius: 10,
                                border: "1px solid var(--hostly-line)",
                                background: "var(--hostly-surface-card-solid)",
                                boxShadow: "var(--hostly-shadow-float)",
                                padding: 4,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuRowId(null);
                                  router.push("/dashboard/compras");
                                }}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--hostly-ink)",
                                  textAlign: "left",
                                  width: "100%",
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  boxSizing: "border-box",
                                }}
                              >
                                {t("recepciones.menuEditCompra")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <select
                          value={c.estado}
                          onChange={(e) => updateEstado(c.id, e.target.value as CompraEstado)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("recepciones.ariaEstado", { supplier: supplierPrimaryLabel(c) })}
                          className="hostly-input hostly-procurement-form__status-select"
                          style={{
                            flex: "1 1 56px",
                            minWidth: 72,
                            maxWidth: 118,
                            border: `1px solid ${look.border}`,
                            background: look.bg,
                            color: look.color,
                          }}
                        >
                          {COMPRA_ESTADOS.map((e) => (
                            <option key={e} value={e}>
                              {estadoLabel(e, t)}
                            </option>
                          ))}
                        </select>
                      </>
                    );
                  }}
                />
              </div>
            )}
          </HostlySurface>

          {selectedReception && drawerContext ? (
            <aside
              aria-label={t("recepciones.panelTitle")}
              className="box-border flex min-h-0 min-w-0 shrink-0 grow-0"
              style={{
                flexBasis: "clamp(400px, 34vw, 548px)",
                width: "clamp(400px, 34vw, 548px)",
                maxWidth: "100%",
              }}
            >
              <HostlySurface
                variant="ice"
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden box-border"
              >
              <div
                style={{
                  flexShrink: 0,
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--hostly-table-divider-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  background: "var(--hostly-table-head-surface)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--hostly-ink)",
                      letterSpacing: "-0.022em",
                      lineHeight: 1.2,
                    }}
                  >
                    {supplierPrimaryLabel(drawerContext.c)}
                  </div>
                  {(() => {
                    const leg = supplierLegalSubtitle(drawerContext.c);
                    return leg ? (
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 10,
                          fontWeight: 500,
                          color: "color-mix(in srgb, var(--hostly-ink-soft) 88%, var(--hostly-ink-muted))",
                          lineHeight: 1.25,
                        }}
                      >
                        {leg}
                      </div>
                    ) : null;
                  })()}
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 82%, var(--hostly-ink))",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatFechaCorta(drawerContext.c.fecha, locale)}
                  </div>
                  {drawerSaveNotice ? (
                    <div
                      role="status"
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        color: "color-mix(in srgb, var(--hostly-accent) 42%, var(--hostly-ink))",
                      }}
                    >
                      {drawerSaveNotice}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReceptionId(null)}
                  className="hostly-btn-soft"
                  style={{
                    flexShrink: 0,
                    padding: "6px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    minHeight: 32,
                    boxSizing: "border-box",
                    touchAction: "manipulation",
                    color: "var(--hostly-ink-muted)",
                  }}
                >
                  {t("recepciones.panelClose")}
                </button>
              </div>
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  padding: "8px 14px 12px",
                }}
              >
                <div style={{ padding: "6px 0 6px" }}>
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    GENERAL
                  </div>
                  <div style={{ position: "relative", marginBottom: 2 }}>
                    <input
                      type="text"
                      value={drawerSupplierInput}
                      placeholder={locale === "en" ? "Supplier…" : "Proveedor…"}
                      onChange={(e) => {
                        setDrawerSupplierInput(e.target.value);
                        setSupplierSuggestOpen(true);
                      }}
                      onFocus={() => setSupplierSuggestOpen(true)}
                      onBlur={(e) => {
                        window.setTimeout(() => setSupplierSuggestOpen(false), 170);
                        persistSupplierFromDrawer(e.currentTarget.value);
                      }}
                      disabled={drawerFooterState.footBusy}
                      autoComplete="off"
                      aria-label={locale === "en" ? "Supplier name" : "Nombre proveedor"}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "7px 9px",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--hostly-ink)",
                        letterSpacing: "-0.02em",
                        borderRadius: 8,
                        border: "1px solid var(--hostly-table-divider-soft)",
                        background: "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)",
                      }}
                    />
                    {supplierSuggestOpen && drawerSupplierSuggestions.length > 0 ? (
                      <div
                        role="listbox"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: "calc(100% + 4px)",
                          zIndex: 40,
                          borderRadius: 8,
                          border: "1px solid var(--hostly-table-divider-soft)",
                          background: "var(--hostly-surface-card-solid)",
                          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
                          maxHeight: 200,
                          overflowY: "auto",
                          WebkitOverflowScrolling: "touch",
                        }}
                      >
                        {drawerSupplierSuggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            role="option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickDrawerSupplierSuggestion(s)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 10px",
                              border: "none",
                              borderBottom: "1px solid var(--hostly-table-divider-faint)",
                              background: "transparent",
                              cursor: "pointer",
                              boxSizing: "border-box",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--hostly-ink)" }}>{s.displayName}</div>
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 10,
                                fontWeight: 500,
                                color: "var(--hostly-ink-muted)",
                              }}
                            >
                              {s.legalName}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 86%, var(--hostly-ink))",
                      fontWeight: 500,
                    }}
                  >
                    {formatFechaCorta(drawerContext.c.fecha, locale)} · {t("recepciones.orderRef")} ·{" "}
                    {drawerContext.c.id.slice(-6)}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "color-mix(in srgb, var(--hostly-ink-soft) 88%, var(--hostly-ink-muted))",
                    }}
                  >
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink-muted)" }}>
                      {drawerLineKpis.total} líneas
                    </span>
                    <span aria-hidden style={{ color: "var(--hostly-ink-soft)", opacity: 0.45 }}>
                      ·
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink-muted)" }}>
                      {drawerLineKpis.pend} pendientes
                    </span>
                    <span aria-hidden style={{ color: "var(--hostly-ink-soft)", opacity: 0.45 }}>
                      ·
                    </span>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color:
                          drawerLineKpis.inc > 0
                            ? "color-mix(in srgb, rgba(180, 83, 74, 0.92) 40%, var(--hostly-ink-muted))"
                            : "var(--hostly-ink-muted)",
                      }}
                    >
                      {drawerLineKpis.inc} incidencias
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 16,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: "color-mix(in srgb, var(--hostly-ink) 96%, var(--hostly-ink-muted))",
                      letterSpacing: "-0.022em",
                    }}
                  >
                    {formatEuro(
                      typeof drawerContext.c.total === "number" && Number.isFinite(drawerContext.c.total)
                        ? drawerContext.c.total
                        : 0,
                      locale,
                    )}
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    ESTADO
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--hostly-ink)" }}>
                    {estadoLabel(drawerContext.c.estado, t)}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 86%, var(--hostly-ink))",
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "var(--hostly-ink)" }}>{drawerContext.phaseTitle}</span>
                    <span> · {drawerContext.phaseSub}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    <RecepOperBadge label={t("recepciones.badgeLabelFactura")} value={drawerContext.invVal} variant={drawerContext.invVariant} />
                    <RecepOperBadge label={t("recepciones.badgeLabelStock")} value={drawerContext.stkVal} variant={drawerContext.stkVariant} />
                    <RecepOperBadge
                      label={t("recepciones.badgeLabelPedido")}
                      value={estadoLabel(drawerContext.c.estado, t)}
                      variant={drawerContext.pedVariant}
                    />
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    LÍNEAS
                  </div>
                  {drawerLineDrafts.map((d, lix) => {
                    const qtyNum = parseDrawerDecimal(d.qtyReceivedStr);
                    const costNum = parseDrawerDecimal(d.unitCostStr);
                    const lineSt = deriveLineUiStatus(d, qtyNum);
                    const lookSt = lineStatusLook(lineSt);
                    const qtyInvalid = d.qtyReceivedStr.trim() !== "" && qtyNum === null;
                    const costInvalid = d.unitCostStr.trim() !== "" && costNum === null;
                    const subLive =
                      qtyNum != null && costNum != null && qtyNum >= 0 && costNum >= 0 ? qtyNum * costNum : null;
                    const receivedFlow = qtyNum != null && qtyNum > 0 && lineSt !== "incidencia";
                    const lineSaveErr = drawerValidateErrors[d.id];
                    const invQtyNum = parseDrawerDecimal(d.invoiceQtyStr);
                    const invCostNum = parseDrawerDecimal(d.invoiceCostStr);
                    const reconSt = drawerLineReconciliationState(d, qtyNum, costNum);
                    const rlook = drawerReconLook(reconSt);
                    const dq =
                      qtyNum != null && invQtyNum != null && qtyNum >= 0 && invQtyNum >= 0
                        ? invQtyNum - qtyNum
                        : null;
                    const dc =
                      costNum != null && invCostNum != null && costNum >= 0 && invCostNum >= 0
                        ? invCostNum - costNum
                        : null;

                    return (
                      <div
                        key={d.id}
                        style={{
                          padding: lix === 0 ? "4px 0 6px" : "6px 0",
                          borderBottom:
                            lix === drawerLineDrafts.length - 1 ? "none" : "1px solid var(--hostly-table-divider-faint)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                            gap: 6,
                            justifyContent: "space-between",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: "1 1 120px" }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "var(--hostly-ink)",
                                lineHeight: 1.3,
                                letterSpacing: "-0.015em",
                              }}
                            >
                              {d.name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                marginTop: 5,
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  fontSize: 8,
                                  fontWeight: 600,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 5,
                                  border: d.linked
                                    ? "1px solid rgba(34, 120, 80, 0.22)"
                                    : "1px solid rgba(184, 149, 58, 0.35)",
                                  background: d.linked ? "var(--hostly-success-soft)" : "rgba(184, 149, 58, 0.14)",
                                  color: "color-mix(in srgb, var(--hostly-ink-muted) 88%, var(--hostly-ink))",
                                }}
                              >
                                {d.linked ? "Vinculado" : "Sin vincular"}
                              </span>
                              {receivedFlow ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                    padding: "2px 6px",
                                    borderRadius: 5,
                                    border: "1px solid var(--hostly-line-strong)",
                                    background: "rgba(226, 240, 251, 0.65)",
                                    color: "color-mix(in srgb, var(--hostly-ink-muted) 88%, var(--hostly-ink))",
                                  }}
                                >
                                  Recibido
                                </span>
                              ) : null}
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  fontSize: 8,
                                  fontWeight: 600,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  padding: "2px 6px",
                                  borderRadius: 5,
                                  border: `1px solid ${lookSt.bd}`,
                                  background: lookSt.bg,
                                  color: lookSt.fg,
                                }}
                              >
                                {lineStatusLabel(lineSt)}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: 5,
                              flex: "1 1 200px",
                              justifyContent: "flex-end",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                              {d.qtyOrdered != null ? (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: "color-mix(in srgb, var(--hostly-ink-soft) 90%, var(--hostly-ink-muted))",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  Ped. {d.qtyOrdered}
                                </span>
                              ) : null}
                              <input
                                aria-label={`Cantidad recibida · ${d.name}`}
                                value={d.qtyReceivedStr}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDrawerLineDrafts((prev) =>
                                    prev.map((x) => (x.id === d.id ? { ...x, qtyReceivedStr: v } : x)),
                                  );
                                  setDrawerValidateErrors((prev) => {
                                    if (!prev[d.id]) return prev;
                                    const n = { ...prev };
                                    delete n[d.id];
                                    return n;
                                  });
                                }}
                                inputMode="decimal"
                                style={{
                                  width: 52,
                                  maxWidth: 76,
                                  padding: "4px 7px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  borderRadius: 6,
                                  border:
                                    lineSaveErr || qtyInvalid
                                      ? "1px solid rgba(180, 83, 74, 0.45)"
                                      : lineSt === "parcial"
                                        ? "1px solid rgba(184, 149, 58, 0.42)"
                                        : "1px solid var(--hostly-table-divider)",
                                  background: "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)",
                                  color: "var(--hostly-ink)",
                                  boxSizing: "border-box",
                                  minHeight: 26,
                                  lineHeight: 1.2,
                                }}
                              />
                              <span
                                title="Unidad (solo lectura)"
                                style={{ fontSize: 10, fontWeight: 600, color: "var(--hostly-ink-muted)" }}
                              >
                                {d.unitLabel}
                              </span>
                              <span aria-hidden style={{ color: "var(--hostly-ink-soft)", opacity: 0.45, fontSize: 10 }}>
                                ·
                              </span>
                              <input
                                aria-label={`Coste unitario · ${d.name}`}
                                value={d.unitCostStr}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDrawerLineDrafts((prev) =>
                                    prev.map((x) => (x.id === d.id ? { ...x, unitCostStr: v } : x)),
                                  );
                                  setDrawerValidateErrors((prev) => {
                                    if (!prev[d.id]) return prev;
                                    const n = { ...prev };
                                    delete n[d.id];
                                    return n;
                                  });
                                }}
                                inputMode="decimal"
                                style={{
                                  width: 62,
                                  maxWidth: 92,
                                  padding: "4px 7px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  borderRadius: 6,
                                  border:
                                    lineSaveErr || costInvalid
                                      ? "1px solid rgba(180, 83, 74, 0.45)"
                                      : "1px solid var(--hostly-table-divider)",
                                  background: "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)",
                                  color: "var(--hostly-ink)",
                                  boxSizing: "border-box",
                                  minHeight: 26,
                                  lineHeight: 1.2,
                                }}
                              />
                              <span style={{ fontSize: 10, fontWeight: 500, color: "var(--hostly-ink-soft)" }}>/ u.</span>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                color: "color-mix(in srgb, var(--hostly-ink) 96%, var(--hostly-ink-muted))",
                                minWidth: 76,
                                textAlign: "right",
                              }}
                            >
                              {subLive != null ? formatEuro(subLive, locale) : "—"}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 2 }}>
                              <button
                                type="button"
                                title="Incidencia"
                                aria-pressed={d.incident}
                                className="hostly-recep-line-tool-btn"
                                onClick={() =>
                                  setDrawerLineDrafts((prev) =>
                                    prev.map((x) => (x.id === d.id ? { ...x, incident: !x.incident } : x)),
                                  )
                                }
                                style={
                                  d.incident
                                    ? {
                                        borderColor: "rgba(180, 83, 74, 0.32)",
                                        background: "var(--hostly-danger-soft)",
                                        color: "var(--hostly-ink)",
                                      }
                                    : undefined
                                }
                              >
                                !
                              </button>
                              <div
                                ref={(el) => {
                                  lineLinkWrapRefs.current[d.id] = el;
                                }}
                                style={{ position: "relative", display: "inline-flex" }}
                              >
                                <button
                                  type="button"
                                  title={
                                    !linkPickerReady
                                      ? "Inventario central no disponible"
                                      : d.linked
                                        ? "Cambiar vínculo"
                                        : "Vincular a producto"
                                  }
                                  aria-expanded={linkPickerLineId === d.id}
                                  disabled={!linkPickerReady || drawerFooterState.footBusy}
                                  className="hostly-recep-line-tool-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!linkPickerReady || drawerFooterState.footBusy) return;
                                    setLinkPickerLineId((p) => {
                                      const next = p === d.id ? null : d.id;
                                      if (next) setLinkSearch("");
                                      return next;
                                    });
                                  }}
                                  style={
                                    !linkPickerReady || drawerFooterState.footBusy
                                      ? { opacity: 0.5, cursor: "not-allowed" as const }
                                      : undefined
                                  }
                                >
                                  ⧉
                                </button>
                                {linkPickerLineId === d.id ? (
                                  <div
                                    role="dialog"
                                    aria-label="Buscar producto del inventario"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    style={{
                                      position: "absolute",
                                      right: 0,
                                      top: "calc(100% + 6px)",
                                      zIndex: 60,
                                      width: 288,
                                      maxWidth: "min(288px, 88vw)",
                                      padding: 8,
                                      borderRadius: 10,
                                      border: "1px solid var(--hostly-table-divider-soft)",
                                      background: "var(--hostly-surface-card-solid)",
                                      boxShadow: "0 6px 20px rgba(15, 23, 42, 0.09), 0 0 0 1px rgba(15, 23, 42, 0.02)",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    <input
                                      type="search"
                                      value={linkSearch}
                                      onChange={(e) => setLinkSearch(e.target.value)}
                                      placeholder="Buscar producto…"
                                      autoComplete="off"
                                      style={{
                                        width: "100%",
                                        marginBottom: 6,
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid var(--hostly-table-divider-soft)",
                                        background: "color-mix(in srgb, var(--hostly-surface-card-solid) 96%, var(--hostly-surface-muted))",
                                        fontSize: 11,
                                        fontWeight: 500,
                                        color: "var(--hostly-ink)",
                                        boxSizing: "border-box",
                                      }}
                                    />
                                    <div
                                      style={{
                                        maxHeight: 220,
                                        overflowY: "auto",
                                        WebkitOverflowScrolling: "touch",
                                        margin: "0 -2px",
                                        padding: "0 2px",
                                      }}
                                    >
                                      {!linkPickerReady ? (
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: "var(--hostly-ink-muted)",
                                            padding: "6px 4px",
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          Inventario no disponible. Revisa sesión, restaurante y Firebase.
                                        </div>
                                      ) : linkPickerFiltered.length === 0 ? (
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: "var(--hostly-ink-muted)",
                                            padding: "6px 4px",
                                            lineHeight: 1.35,
                                          }}
                                        >
                                          {inventoryPickerProducts.length === 0
                                            ? "Sin productos con inventario activo."
                                            : "Sin coincidencias."}
                                        </div>
                                      ) : (
                                        linkPickerFiltered.map((p) => (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              linkReceptionLineToProduct(d.id, p);
                                            }}
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              textAlign: "left",
                                              padding: "7px 8px",
                                              marginBottom: 2,
                                              borderRadius: 6,
                                              border: "1px solid transparent",
                                              background: "transparent",
                                              cursor: "pointer",
                                              fontSize: 11,
                                              fontWeight: 600,
                                              color: "var(--hostly-ink)",
                                              lineHeight: 1.25,
                                              boxSizing: "border-box",
                                            }}
                                            onMouseEnter={(ev) => {
                                              ev.currentTarget.style.background =
                                                "color-mix(in srgb, var(--hostly-surface-muted) 55%, var(--hostly-surface-card-solid))";
                                            }}
                                            onMouseLeave={(ev) => {
                                              ev.currentTarget.style.background = "transparent";
                                            }}
                                          >
                                            <span style={{ display: "block" }}>{p.name}</span>
                                            <span
                                              style={{
                                                display: "block",
                                                fontSize: 9,
                                                fontWeight: 500,
                                                color: "var(--hostly-ink-muted)",
                                                marginTop: 2,
                                              }}
                                            >
                                              {p.inventory?.unit ?? "ud"} · stock{" "}
                                              {typeof p.inventory?.currentStock === "number"
                                                ? p.inventory.currentStock
                                                : "—"}
                                            </span>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <button type="button" title="Más acciones" className="hostly-recep-line-tool-btn">
                                ⋯
                              </button>
                            </div>
                          </div>
                          {lineSaveErr ? (
                            <div
                              role="alert"
                              style={{
                                width: "100%",
                                flexBasis: "100%",
                                marginTop: 4,
                                fontSize: 9,
                                fontWeight: 600,
                                color: "rgba(180, 83, 74, 0.88)",
                                lineHeight: 1.35,
                              }}
                            >
                              {lineSaveErr}
                            </div>
                          ) : null}
                          <div
                            style={{
                              width: "100%",
                              flexBasis: "100%",
                              marginTop: 6,
                              padding: "6px 7px",
                              borderRadius: 8,
                              border: `1px solid ${rlook.bd}`,
                              background: rlook.bg,
                              boxSizing: "border-box",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "4px 6px",
                                fontSize: 10,
                                fontWeight: 600,
                                color: "var(--hostly-ink-muted)",
                              }}
                            >
                              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink)" }}>
                                {locale === "en" ? "Rec" : "Rec"}{" "}
                                <span style={{ fontWeight: 700 }}>{qtyNum != null ? qtyNum : "—"}</span>
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.72 }}>Fac</span>
                              <input
                                aria-label={`${locale === "en" ? "Invoice qty" : "Cantidad factura"} · ${d.name}`}
                                value={d.invoiceQtyStr}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDrawerLineDrafts((prev) =>
                                    prev.map((x) => (x.id === d.id ? { ...x, invoiceQtyStr: v } : x)),
                                  );
                                }}
                                onBlur={flushInvoiceDraftsToStorage}
                                disabled={drawerFooterState.footBusy}
                                inputMode="decimal"
                                style={{
                                  width: 48,
                                  maxWidth: 56,
                                  padding: "3px 6px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  borderRadius: 5,
                                  border: "1px solid var(--hostly-table-divider-soft)",
                                  background: "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)",
                                  color: "var(--hostly-ink)",
                                  boxSizing: "border-box",
                                  minHeight: 24,
                                }}
                              />
                              <span style={{ color: "var(--hostly-ink-soft)" }}>{d.unitLabel}</span>
                              <span aria-hidden style={{ color: "var(--hostly-ink-soft)", opacity: 0.4 }}>
                                ·
                              </span>
                              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--hostly-ink)" }}>
                                {locale === "en" ? "Cost" : "Coste"}{" "}
                                <span style={{ fontWeight: 700 }}>
                                  {costNum != null ? formatEuro(costNum, locale) : "—"}
                                </span>
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.72 }}>Fact</span>
                              <input
                                aria-label={`${locale === "en" ? "Invoice unit cost" : "Coste unitario factura"} · ${d.name}`}
                                value={d.invoiceCostStr}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDrawerLineDrafts((prev) =>
                                    prev.map((x) => (x.id === d.id ? { ...x, invoiceCostStr: v } : x)),
                                  );
                                }}
                                onBlur={flushInvoiceDraftsToStorage}
                                disabled={drawerFooterState.footBusy}
                                inputMode="decimal"
                                style={{
                                  width: 56,
                                  maxWidth: 68,
                                  padding: "3px 6px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  borderRadius: 5,
                                  border: "1px solid var(--hostly-table-divider-soft)",
                                  background: "color-mix(in srgb, var(--hostly-surface-card-solid) 94%, transparent)",
                                  color: "var(--hostly-ink)",
                                  boxSizing: "border-box",
                                  minHeight: 24,
                                }}
                              />
                            </div>
                            <div
                              style={{
                                marginTop: 5,
                                fontSize: 10,
                                fontWeight: 600,
                                lineHeight: 1.35,
                                color: rlook.fg,
                              }}
                            >
                              {reconSt === "conciliado" ? (
                                <span>
                                  {locale === "en" ? "\u2713 Reconciled" : "\u2713 Conciliado"}
                                </span>
                              ) : reconSt === "pendiente" ? (
                                <span>
                                  {locale === "en"
                                    ? "\u2298 Pending invoice fields vs reception"
                                    : "\u2298 Pendiente: completar factura vs recepción"}
                                </span>
                              ) : (
                                <>
                                  {dq != null && Math.abs(dq) >= 1e-7 ? (
                                    <div>
                                      {locale === "en" ? "\u26a0 Qty difference" : "\u26a0 Diferencia cantidad"}:{" "}
                                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatSignedDiffQty(dq, d.unitLabel)}</span>
                                    </div>
                                  ) : null}
                                  {dc != null && Math.abs(dc) >= 1e-6 ? (
                                    <div style={{ marginTop: dq != null && Math.abs(dq) >= 1e-7 ? 2 : 0 }}>
                                      {locale === "en" ? "\u26a0 Cost difference" : "\u26a0 Diferencia coste"}:{" "}
                                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatSignedMoneyDiff(dc, locale)}</span>
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    FACTURA
                  </div>
                  <input
                    ref={invoiceFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf,image/*,.xml,application/xml,text/xml"
                    style={{ display: "none" }}
                    aria-hidden
                    onChange={onInvoiceFileSelected}
                  />
                  <button
                    type="button"
                    className="hostly-btn-soft"
                    disabled={drawerFooterState.footBusy}
                    onClick={() => invoiceFileInputRef.current?.click()}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: drawerFooterState.footBusy ? "wait" : "pointer",
                      marginBottom: 8,
                      touchAction: "manipulation",
                    }}
                  >
                    {locale === "en" ? "Attach invoice" : "Adjuntar factura"}
                  </button>
                  {(() => {
                    const c = drawerContext.c;
                    const reco = drawerContext.reconciliation;
                    const wf = invoiceWorkflowStatus(c);
                    const inv = c.invoice_document;
                    const receptionTotal =
                      typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
                    const invoiceTotalKnown =
                      typeof inv?.invoice_total === "number" && Number.isFinite(inv.invoice_total);
                    const invoiceTotal = invoiceTotalKnown ? inv!.invoice_total! : receptionTotal;
                    const diff = invoiceTotal - receptionTotal;

                    const statusMeta =
                      wf === "missing"
                        ? {
                            dot: "var(--hostly-ink-soft)",
                            pillBg: "rgba(248, 251, 254, 0.9)",
                            pillBd: "var(--hostly-table-divider-soft)",
                            label: locale === "en" ? "No document" : "Sin documento",
                          }
                        : wf === "attached"
                          ? {
                              dot: "var(--hostly-accent)",
                              pillBg: "var(--hostly-info-soft)",
                              pillBd: "color-mix(in srgb, var(--hostly-accent) 22%, transparent)",
                              label: locale === "en" ? "Pending review" : "Pendiente revisión",
                            }
                          : wf === "reviewing"
                            ? {
                                dot: "rgba(184, 149, 58, 0.85)",
                                pillBg: "var(--hostly-warning-soft)",
                                pillBd: "rgba(184, 149, 58, 0.28)",
                                label: locale === "en" ? "Under review" : "En revisión",
                              }
                            : {
                                dot: "rgba(42, 118, 92, 0.75)",
                                pillBg: "var(--hostly-success-soft)",
                                pillBd: "rgba(42, 118, 92, 0.22)",
                                label: locale === "en" ? "Matched" : "Conciliado",
                              };

                    return (
                      <>
                        <div
                          style={{
                            padding: "7px 9px",
                            borderRadius: 8,
                            border: `1px solid ${statusMeta.pillBd}`,
                            background: statusMeta.pillBg,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "var(--hostly-ink)",
                              wordBreak: "break-word",
                            }}
                          >
                            {inv?.attached && inv.filename
                              ? inv.filename
                              : locale === "en"
                                ? "No file"
                                : "Sin documento"}
                          </div>
                          {inv?.attached && typeof inv.uploaded_at === "number" && Number.isFinite(inv.uploaded_at) ? (
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--hostly-ink-muted)",
                                marginTop: 3,
                                fontWeight: 500,
                              }}
                            >
                              {locale === "en" ? "Attached" : "Adjuntado"}{" "}
                              {formatRelativeAgo(inv.uploaded_at, locale)}
                            </div>
                          ) : null}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 6,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "color-mix(in srgb, var(--hostly-ink-muted) 82%, var(--hostly-ink))",
                            }}
                          >
                            <span aria-hidden style={{ color: statusMeta.dot, fontSize: 12, lineHeight: 1 }}>
                              ●
                            </span>
                            <span>
                              {locale === "en" ? "Status" : "Estado"}: {statusMeta.label}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: "4px 12px",
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--hostly-ink-muted)",
                          }}
                        >
                          <span>{locale === "en" ? "Reception total" : "Total recepción"}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--hostly-ink)" }}>
                            {formatEuro(receptionTotal, locale)}
                          </span>
                          <span>{locale === "en" ? "Invoice total" : "Total factura"}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--hostly-ink)" }}>
                            {formatEuro(invoiceTotal, locale)}
                          </span>
                          <span>{locale === "en" ? "Difference" : "Diferencia"}</span>
                          <span
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 700,
                              color:
                                Math.abs(diff) < 1e-9
                                  ? "var(--hostly-ink)"
                                  : "color-mix(in srgb, rgba(184, 149, 58, 0.95) 35%, var(--hostly-ink))",
                            }}
                          >
                            {formatEuro(diff, locale)}
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: "1px solid var(--hostly-table-divider-soft)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                              letterSpacing: "0.07em",
                              textTransform: "uppercase",
                              marginBottom: 5,
                            }}
                          >
                            {locale === "en" ? "Reconciliation" : "Conciliación"}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              lineHeight: 1.55,
                              color: "var(--hostly-ink-muted)",
                            }}
                          >
                            <div style={{ color: "color-mix(in srgb, var(--hostly-ink) 72%, var(--hostly-ink-muted))" }}>
                              {locale === "en" ? "\u2713 Reconciled lines" : "\u2713 Líneas conciliadas"} · {reco.conciliadas}
                            </div>
                            <div style={{ marginTop: 2 }}>
                              {locale === "en" ? "\u26a0 Differences detected" : "\u26a0 Diferencias detectadas"} ·{" "}
                              {reco.diferencias}
                            </div>
                            <div style={{ marginTop: 2 }}>
                              {locale === "en" ? "\u2298 Pending lines" : "\u2298 Líneas pendientes"} · {reco.pendientes}
                            </div>
                          </div>
                        </div>
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: 9,
                            color: "var(--hostly-ink-soft)",
                            lineHeight: 1.4,
                          }}
                        >
                          {locale === "en"
                            ? "OCR and storage will fill invoice totals and reconciliation."
                            : "OCR y almacenamiento rellenarán totales y conciliación."}
                        </p>
                      </>
                    );
                  })()}
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    TRAZABILIDAD
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--hostly-ink-muted)", lineHeight: 1.4 }}>
                    {t("recepciones.rowIncidentHeadline")}:{" "}
                    <span style={{ fontWeight: 600, color: "var(--hostly-ink)" }}>{drawerContext.incidentSummary}</span>
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    CRONOLOGÍA
                  </div>
                  <div style={{ position: "relative", paddingLeft: 18 }}>
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 6,
                        top: 6,
                        bottom: 6,
                        width: 2,
                        background: "color-mix(in srgb, var(--hostly-navy-mid) 30%, transparent)",
                        borderRadius: 1,
                      }}
                    />
                    {(() => {
                      const timelineSteps = drawerContext.timeline;
                      return timelineSteps.map((step, tix) => {
                        const isCompleted = step.done;
                        const isActive = !step.done && step.id === "received";
                        const isPending = !step.done && step.id !== "received";

                        const nodeBorder = isCompleted
                          ? "2px solid rgba(42, 118, 92, 0.46)"
                          : isActive
                            ? "2px solid color-mix(in srgb, var(--hostly-accent) 58%, var(--hostly-line-strong))"
                            : "1.5px solid var(--hostly-line-strong)";

                        const nodeBg = isCompleted
                          ? "linear-gradient(180deg, color-mix(in srgb, var(--hostly-success-soft) 92%, #fff) 0%, var(--hostly-success-soft) 100%)"
                          : isActive
                            ? "linear-gradient(180deg, color-mix(in srgb, var(--hostly-accent-soft) 88%, #fff) 0%, var(--hostly-info-soft) 100%)"
                            : "color-mix(in srgb, var(--hostly-surface-card-solid) 96%, var(--hostly-surface-muted))";

                        const nodeShadow = isPending ? "inset 0 1px 0 rgba(255,255,255,0.65)" : "none";

                        const labelColor = isCompleted
                          ? "color-mix(in srgb, var(--hostly-ink) 96%, rgba(42, 118, 92, 0.45))"
                          : isActive
                            ? "color-mix(in srgb, var(--hostly-ink) 88%, var(--hostly-accent))"
                            : "color-mix(in srgb, var(--hostly-ink-muted) 82%, var(--hostly-ink))";

                        const labelWeight = isCompleted || isActive ? 700 : 600;

                        const stampColor = isCompleted
                          ? "color-mix(in srgb, var(--hostly-ink-muted) 68%, var(--hostly-ink))"
                          : isActive
                            ? "color-mix(in srgb, var(--hostly-ink-muted) 72%, var(--hostly-ink))"
                            : "color-mix(in srgb, var(--hostly-ink-soft) 92%, var(--hostly-ink-muted))";

                        const stampWeight = isCompleted || isActive ? 600 : 500;

                        return (
                          <div
                            key={step.id}
                            style={{
                              position: "relative",
                              paddingBottom: tix === timelineSteps.length - 1 ? 0 : 10,
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                position: "absolute",
                                left: -12,
                                top: 3,
                                width: 9,
                                height: 9,
                                borderRadius: 999,
                                boxSizing: "border-box",
                                border: nodeBorder,
                                background: nodeBg,
                                boxShadow: nodeShadow,
                              }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: labelWeight,
                                  color: labelColor,
                                  letterSpacing: "-0.012em",
                                }}
                              >
                                {step.label}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: stampWeight,
                                  fontVariantNumeric: "tabular-nums",
                                  color: stampColor,
                                  flexShrink: 0,
                                }}
                              >
                                {step.stamp}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    NOTAS
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: drawerContext.notas ? "var(--hostly-ink)" : "var(--hostly-ink-soft)",
                      lineHeight: 1.45,
                      fontWeight: 500,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {drawerContext.notas || "—"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 0 6px",
                    borderTop: "1px solid var(--hostly-table-divider-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "color-mix(in srgb, var(--hostly-ink-muted) 76%, var(--hostly-ink))",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    ACCIONES
                  </div>
                  <p style={{ margin: 0, fontSize: 10, color: "var(--hostly-ink-soft)", lineHeight: 1.45, fontWeight: 500 }}>
                    Reservado para validar documento, recepción por línea y ajustes de catálogo cuando conectemos OCR y
                    factura.
                  </p>
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  padding: "10px 12px 12px",
                  borderTop: "1px solid var(--hostly-table-divider)",
                  background: "var(--hostly-table-head-surface)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className={
                    drawerFooterState.aplicarPrimary
                      ? "hostly-btn-soft hostly-recep-drawer-foot-btn"
                      : "hostly-recep-drawer-foot-primary hostly-recep-drawer-foot-btn"
                  }
                  disabled={drawerFooterState.footBusy}
                  aria-busy={drawerValidating}
                  onClick={() => void validarRecepcionDrawer()}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    padding: "10px 8px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    boxSizing: "border-box",
                    minHeight: 40,
                    opacity: drawerFooterState.footBusy ? 0.75 : 1,
                    cursor: drawerFooterState.footBusy ? "wait" : "pointer",
                  }}
                >
                  {drawerValidating ? "Guardando…" : "Validar recepción"}
                </button>
                <button
                  type="button"
                  className={
                    drawerFooterState.aplicarPrimary
                      ? "hostly-recep-drawer-foot-primary hostly-recep-drawer-foot-btn"
                      : "hostly-btn-soft hostly-recep-drawer-foot-btn"
                  }
                  disabled={drawerFooterState.footBusy}
                  title={
                    drawerFooterState.stockApplied
                      ? locale === "en"
                        ? "Stock already applied — click again for confirmation"
                        : "Stock ya aplicado — pulse de nuevo para el aviso"
                      : undefined
                  }
                  aria-busy={drawerStockApplying}
                  onClick={() => void applyStockFromDrawer()}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    padding: "10px 8px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    boxSizing: "border-box",
                    minHeight: 40,
                    opacity: drawerFooterState.footBusy ? 0.75 : 1,
                    cursor: drawerFooterState.footBusy ? "wait" : "pointer",
                  }}
                >
                  {drawerStockApplying ? "Aplicando…" : "Aplicar stock"}
                </button>
                <button
                  type="button"
                  className="hostly-btn-soft hostly-recep-drawer-foot-btn"
                  disabled={drawerFooterState.footBusy}
                  onClick={() => {
                    if (drawerFooterState.footBusy) return;
                    invoiceFileInputRef.current?.click();
                  }}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    padding: "10px 8px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    boxSizing: "border-box",
                    minHeight: 40,
                    opacity: drawerFooterState.footBusy ? 0.72 : 1,
                    cursor: drawerFooterState.footBusy ? "wait" : "pointer",
                  }}
                >
                  Registrar factura
                </button>
              </div>
              </HostlySurface>
            </aside>
          ) : null}
        </div>
      </HostlySection>
    </ModulePageShell>
  );
}
