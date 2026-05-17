/**
 * Persistencia local del módulo Compras (/dashboard/compras).
 * Vinculación a inventario: producto_stock_id + cantidad_recibida + unidad (+ nombre para UI).
 */

import type { UnidadStock } from "@/lib/stock-local";

export const COMPRAS_LOCAL_STORAGE_KEY = "hostly.compras.pedidos.v1";

export type CompraEstado = "pendiente" | "recibido" | "cancelado";

/** Documento de factura asociado a la recepción (local hasta Storage/OCR). */
export type CompraInvoiceDocument = {
  attached: boolean;
  filename?: string;
  uploaded_at?: number;
  status?: "missing" | "attached" | "reviewing" | "matched";
  /** Reservado: total en factura tras extracción / conciliación. */
  invoice_total?: number;
};

export type CompraLineItemLocal = {
  id?: string;
  producto_stock_nombre?: string;
  nombre?: string;
  producto?: string;
  producto_stock_id?: string;
  unidad?: UnidadStock;
  /** Cantidad recibida (o equivalente) en la línea. */
  cantidad?: number;
  cantidad_pedida?: number;
  precio_unitario?: number;
  subtotal?: number;
  importe?: number;
  /** Marca de incidencia a nivel de línea (solo persistencia local). */
  incidencia?: boolean;
  /** Cantidad según factura (conciliación local; sin OCR). */
  invoice_qty?: number;
  /** Coste unitario según factura (conciliación local; sin OCR). */
  invoice_cost?: number;
};

export type CompraLocal = {
  id: string;
  /** Nombre legible para listados y flujos legacy. */
  proveedor: string;
  /** Catálogo canónico local / futuro Firestore. */
  supplierId?: string;
  supplierDisplayName?: string;
  supplierLegalName?: string;
  /** Texto tal cual escribió el usuario (OCR / IA futura / auditoría). */
  supplierInput?: string;
  fecha: string;
  estado: CompraEstado;
  total: number;
  notas?: string;
  stock_aplicado?: boolean;
  /** Marca temporal (ms) de aplicación al inventario central (`inventoryReceipts` + movimientos). */
  stock_applied_at?: number;
  /** Id del documento en `restaurants/{rid}/inventoryReceipts` tras aplicar stock central desde Recepciones. */
  inventory_receipt_id?: string;
  /** Id del producto en `loadStock()` / inventario local. */
  producto_stock_id?: string;
  /** Copia para listados sin depender del stock actual. */
  producto_stock_nombre?: string;
  unidad?: UnidadStock;
  cantidad_recibida?: number;
  /** Coste unitario cuando la compra es de una sola línea (recepción simple). */
  precio_unitario?: number;
  /** Incidencia operativa en recepción mono-línea (solo persistencia local). */
  recepcion_incidencia?: boolean;
  /** Conciliación factura (recepción mono-línea): cantidad facturada. */
  invoice_qty?: number;
  /** Conciliación factura (recepción mono-línea): coste unitario facturado. */
  invoice_cost?: number;
  /** Líneas opcionales (recepción multi-ítem). */
  items?: CompraLineItemLocal[];
  /** Factura / documento proveedor (metadata local; sin upload en esta fase). */
  invoice_document?: CompraInvoiceDocument;
};

export const COMPRA_ESTADOS: readonly CompraEstado[] = ["pendiente", "recibido", "cancelado"] as const;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseUnidad(v: unknown): UnidadStock | undefined {
  if (v === "kg" || v === "g" || v === "l" || v === "ml" || v === "uds") return v;
  return undefined;
}

const SEED: CompraLocal[] = [
  {
    id: "seed-c1",
    proveedor: "Makro Ibiza",
    fecha: "2026-04-01",
    estado: "recibido",
    total: 428.5,
    notas: "Pedido semanal frescos",
    producto_stock_id: "seed-1",
    producto_stock_nombre: "Arroz bomba",
    unidad: "kg",
    cantidad_recibida: 5,
    stock_aplicado: true,
  },
  {
    id: "seed-c2",
    proveedor: "Cash & Carry San Antonio",
    fecha: "2026-04-02",
    estado: "pendiente",
    total: 312.0,
    producto_stock_id: "seed-2",
    producto_stock_nombre: "Aceite de oliva virgen",
    unidad: "l",
    cantidad_recibida: 2,
    stock_aplicado: false,
  },
  {
    id: "seed-c3",
    proveedor: "Distribuciones locales SL",
    fecha: "2026-03-28",
    estado: "cancelado",
    total: 156.4,
    notas: "Anulado por el proveedor",
    stock_aplicado: false,
  },
];

function isValidEstado(v: unknown): v is CompraEstado {
  return v === "pendiente" || v === "recibido" || v === "cancelado";
}

export function formatFechaCompra(isoDate: string): string {
  const t = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDate;
  try {
    const [y, m, d] = t.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

/**
 * Indica si esta compra cuenta como ingreso en inventario y hay que revertirla antes de recalcular.
 * Criterio: producto + cantidad > 0 y (ya marcada aplicada o estado recibido).
 * No usar solo `stock_aplicado === false` para bloquear: en datos viejos podía quedar false pese a haber sumado stock.
 */
export function compraSumaStockContabilizada(c: CompraLocal): boolean {
  const q = parseCantidadRecibida(c.cantidad_recibida as unknown);
  const id = c.producto_stock_id?.trim();
  if (!id || q == null || q <= 0) return false;
  return c.stock_aplicado === true || c.estado === "recibido";
}

/** Acepta número o string (JSON antiguo / copias) para que la sync a Stock no falle en silencio. */
export function parseCantidadRecibida(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/** Lee producto_stock_id admitiendo el nombre legacy `stock_producto_id` en JSON. */
export function parseProductoStockId(r: Record<string, unknown>): string | undefined {
  const a = r.producto_stock_id;
  const b = r.stock_producto_id;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return undefined;
}

/** Coste unitario factura (acepta número o string). */
function parseInvoiceCost(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function parseCompraLineItem(el: Record<string, unknown>): CompraLineItemLocal {
  const o: CompraLineItemLocal = {};
  if (typeof el.id === "string" && el.id.trim()) o.id = el.id.trim();
  if (typeof el.producto_stock_nombre === "string" && el.producto_stock_nombre.trim())
    o.producto_stock_nombre = el.producto_stock_nombre.trim();
  if (typeof el.nombre === "string" && el.nombre.trim()) o.nombre = el.nombre.trim();
  if (typeof el.producto === "string" && el.producto.trim()) o.producto = el.producto.trim();
  const pid = parseProductoStockId(el);
  if (pid) o.producto_stock_id = pid;
  const u = parseUnidad(el.unidad);
  if (u) o.unidad = u;
  const q = parseCantidadRecibida(el.cantidad ?? el.qty);
  if (q != null) o.cantidad = q;
  const qp = parseCantidadRecibida(el.cantidad_pedida ?? el.qty_ordered ?? el.qtyOrdered);
  if (qp != null) o.cantidad_pedida = qp;
  if (typeof el.precio_unitario === "number" && Number.isFinite(el.precio_unitario))
    o.precio_unitario = Math.max(0, el.precio_unitario);
  else if (typeof el.coste_unitario === "number" && Number.isFinite(el.coste_unitario))
    o.precio_unitario = Math.max(0, el.coste_unitario);
  if (typeof el.subtotal === "number" && Number.isFinite(el.subtotal)) o.subtotal = el.subtotal;
  if (typeof el.importe === "number" && Number.isFinite(el.importe)) o.importe = el.importe;
  if (el.incidencia === true || el.incidencia === "true") o.incidencia = true;
  const iq = parseCantidadRecibida(el.invoice_qty ?? el.qty_invoice);
  if (iq != null) o.invoice_qty = iq;
  const ic = parseInvoiceCost(el.invoice_cost ?? el.coste_factura);
  if (ic != null) o.invoice_cost = ic;
  return o;
}

function parseInvoiceDocument(v: unknown): CompraInvoiceDocument | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const attached = o.attached === true || o.attached === "true";
  const filename =
    typeof o.filename === "string" && o.filename.trim() ? o.filename.trim().slice(0, 512) : undefined;
  const uploaded_at =
    typeof o.uploaded_at === "number" && Number.isFinite(o.uploaded_at) ? o.uploaded_at : undefined;
  const st = o.status;
  const statusOk = st === "missing" || st === "attached" || st === "reviewing" || st === "matched";
  const status: CompraInvoiceDocument["status"] = statusOk
    ? st
    : attached
      ? "attached"
      : "missing";
  const invoice_total =
    typeof o.invoice_total === "number" && Number.isFinite(o.invoice_total)
      ? Math.max(0, o.invoice_total)
      : undefined;

  if (!attached && !filename && uploaded_at == null && invoice_total == null) return undefined;

  const doc: CompraInvoiceDocument = {
    attached: attached || Boolean(filename),
    status,
    ...(filename != null ? { filename } : {}),
    ...(uploaded_at != null ? { uploaded_at } : {}),
    ...(invoice_total != null ? { invoice_total } : {}),
  };
  return doc;
}

export function loadCompras(): CompraLocal[] {
  if (typeof window === "undefined") return [...SEED];
  try {
    const raw = localStorage.getItem(COMPRAS_LOCAL_STORAGE_KEY);
    if (!raw) {
      const initial = [...SEED];
      localStorage.setItem(COMPRAS_LOCAL_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED];
    const out: CompraLocal[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : newId();
      const proveedor = typeof r.proveedor === "string" ? r.proveedor.trim() : "";
      const fecha = typeof r.fecha === "string" ? r.fecha.trim() : "";
      const estado = isValidEstado(r.estado) ? r.estado : "pendiente";
      const total = typeof r.total === "number" && Number.isFinite(r.total) ? Math.max(0, r.total) : 0;
      const notas = typeof r.notas === "string" && r.notas.trim() ? r.notas.trim() : undefined;
      const producto_stock_id = parseProductoStockId(r);
      const producto_stock_nombre =
        typeof r.producto_stock_nombre === "string" && r.producto_stock_nombre.trim()
          ? r.producto_stock_nombre.trim()
          : undefined;
      const unidad = parseUnidad(r.unidad);
      const cantidad_recibida = parseCantidadRecibida(r.cantidad_recibida);
      const inventory_receipt_id =
        typeof r.inventory_receipt_id === "string" && r.inventory_receipt_id.trim()
          ? r.inventory_receipt_id.trim()
          : undefined;
      const precio_unitario =
        typeof r.precio_unitario === "number" && Number.isFinite(r.precio_unitario)
          ? Math.max(0, r.precio_unitario)
          : typeof r.coste_unitario === "number" && Number.isFinite(r.coste_unitario)
            ? Math.max(0, r.coste_unitario)
            : undefined;
      const recepcion_incidencia = r.recepcion_incidencia === true || r.recepcion_incidencia === "true";
      const invoice_qty_root = parseCantidadRecibida(r.invoice_qty);
      const invoice_cost_root = parseInvoiceCost(r.invoice_cost);
      let items: CompraLineItemLocal[] | undefined;
      if (Array.isArray(r.items)) {
        const tmp: CompraLineItemLocal[] = [];
        for (const el of r.items) {
          if (!el || typeof el !== "object") continue;
          tmp.push(parseCompraLineItem(el as Record<string, unknown>));
        }
        if (tmp.length) items = tmp;
      }
      const rawStockAplicado = r.stock_aplicado;
      /** Alias Firestore / futuro sync remoto */
      const rawAplicadoFs = r.aplicadoStock;
      let stock_aplicado: boolean;
      if (
        rawStockAplicado === true ||
        rawStockAplicado === "true" ||
        rawAplicadoFs === true ||
        rawAplicadoFs === "true"
      ) {
        stock_aplicado = true;
      } else if (rawStockAplicado === false || rawStockAplicado === "false") {
        stock_aplicado = false;
      } else {
        stock_aplicado =
          estado === "recibido" &&
          Boolean(producto_stock_id?.trim()) &&
          cantidad_recibida != null &&
          cantidad_recibida > 0;
      }
      if (!proveedor || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      const supplierId =
        typeof r.supplierId === "string" && r.supplierId.trim() ? r.supplierId.trim() : undefined;
      const supplierDisplayName =
        typeof r.supplierDisplayName === "string" && r.supplierDisplayName.trim()
          ? r.supplierDisplayName.trim()
          : undefined;
      const supplierLegalName =
        typeof r.supplierLegalName === "string" && r.supplierLegalName.trim()
          ? r.supplierLegalName.trim()
          : undefined;
      const supplierInput =
        typeof r.supplierInput === "string" && r.supplierInput.trim()
          ? r.supplierInput.trim()
          : undefined;
      const compra: CompraLocal = {
        id,
        proveedor,
        fecha,
        estado,
        total,
        notas,
        stock_aplicado,
        producto_stock_id,
        producto_stock_nombre,
        unidad,
        cantidad_recibida,
        inventory_receipt_id,
      };
      if (precio_unitario != null) compra.precio_unitario = precio_unitario;
      if (invoice_qty_root != null) compra.invoice_qty = invoice_qty_root;
      if (invoice_cost_root != null) compra.invoice_cost = invoice_cost_root;
      if (recepcion_incidencia) compra.recepcion_incidencia = true;
      if (items) compra.items = items;
      const stock_applied_at =
        typeof r.stock_applied_at === "number" && Number.isFinite(r.stock_applied_at)
          ? r.stock_applied_at
          : undefined;
      if (stock_applied_at != null) compra.stock_applied_at = stock_applied_at;
      const invoice_document = parseInvoiceDocument(r.invoice_document);
      if (invoice_document) compra.invoice_document = invoice_document;
      if (supplierId) compra.supplierId = supplierId;
      if (supplierDisplayName) compra.supplierDisplayName = supplierDisplayName;
      if (supplierLegalName) compra.supplierLegalName = supplierLegalName;
      if (supplierInput) compra.supplierInput = supplierInput;
      out.push(compra);
    }
    return out.length ? out : [...SEED];
  } catch {
    return [...SEED];
  }
}

export function saveCompras(compras: CompraLocal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPRAS_LOCAL_STORAGE_KEY, JSON.stringify(compras));
  } catch {
    // noop
  }
}

export { newId as newCompraId };
