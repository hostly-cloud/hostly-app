/**
 * Persistencia local del módulo Compras (/dashboard/compras).
 * Vinculación a inventario: producto_stock_id + cantidad_recibida + unidad (+ nombre para UI).
 */

import type { UnidadStock } from "@/lib/stock-local";

export const COMPRAS_LOCAL_STORAGE_KEY = "hostly.compras.pedidos.v1";

export type CompraEstado = "pendiente" | "recibido" | "cancelado";

export type CompraLocal = {
  id: string;
  proveedor: string;
  fecha: string;
  estado: CompraEstado;
  total: number;
  notas?: string;
  stock_aplicado?: boolean;
  /** Id del producto en `loadStock()` / inventario local. */
  producto_stock_id?: string;
  /** Copia para listados sin depender del stock actual. */
  producto_stock_nombre?: string;
  unidad?: UnidadStock;
  cantidad_recibida?: number;
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
function parseProductoStockId(r: Record<string, unknown>): string | undefined {
  const a = r.producto_stock_id;
  const b = r.stock_producto_id;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return undefined;
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
      out.push({
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
      });
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
