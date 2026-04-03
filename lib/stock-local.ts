/**
 * Persistencia local del módulo Stock (/dashboard/stock).
 * Misma forma que un futuro row de Supabase: id, nombre, unidad, stock_actual, stock_minimo.
 * Para conectar: sustituir loadStock/saveStock por fetch desde una tabla tipo `stock_productos`.
 */

export const STOCK_LOCAL_STORAGE_KEY = "hostly.stock.productos.v1";

/** Tras guardar inventario, otras vistas en la misma pestaña pueden releer con loadStock(). */
export const STOCK_CHANGED_EVENT = "hostly-stock-changed";

export type UnidadStock = "kg" | "g" | "l" | "ml" | "uds";

export type StockProducto = {
  id: string;
  nombre: string;
  unidad: UnidadStock;
  stock_actual: number;
  stock_minimo: number;
};

export const UNIDADES_STOCK: readonly UnidadStock[] = ["kg", "g", "l", "ml", "uds"] as const;

const SEED: StockProducto[] = [
  /** Coherente con compra SEED recibida (+5 kg) en `compras-local` cuando ambos se inicializan juntos. */
  { id: "seed-1", nombre: "Arroz bomba", unidad: "kg", stock_actual: 23, stock_minimo: 8 },
  { id: "seed-2", nombre: "Aceite de oliva virgen", unidad: "l", stock_actual: 6, stock_minimo: 4 },
  { id: "seed-3", nombre: "Tomate pera", unidad: "kg", stock_actual: 4.5, stock_minimo: 10 },
  { id: "seed-4", nombre: "Leche entera", unidad: "l", stock_actual: 12, stock_minimo: 6 },
  { id: "seed-5", nombre: "Servilletas", unidad: "uds", stock_actual: 800, stock_minimo: 200 },
  { id: "seed-6", nombre: "Sal marina", unidad: "g", stock_actual: 250, stock_minimo: 500 },
];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isStockBajo(p: StockProducto): boolean {
  return p.stock_actual <= p.stock_minimo;
}

export function loadStock(): StockProducto[] {
  if (typeof window === "undefined") return [...SEED];
  try {
    const raw = localStorage.getItem(STOCK_LOCAL_STORAGE_KEY);
    if (!raw) {
      const initial = [...SEED];
      localStorage.setItem(STOCK_LOCAL_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED];
    const out: StockProducto[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : newId();
      const nombre = typeof r.nombre === "string" ? r.nombre : "";
      const u = r.unidad;
      const unidad: UnidadStock =
        u === "kg" || u === "g" || u === "l" || u === "ml" || u === "uds" ? u : "uds";
      const stock_actual = typeof r.stock_actual === "number" && Number.isFinite(r.stock_actual) ? r.stock_actual : 0;
      const stock_minimo = typeof r.stock_minimo === "number" && Number.isFinite(r.stock_minimo) ? r.stock_minimo : 0;
      if (!nombre.trim()) continue;
      out.push({ id, nombre: nombre.trim(), unidad, stock_actual, stock_minimo });
    }
    return out.length ? out : [...SEED];
  } catch {
    return [...SEED];
  }
}

export function saveStock(productos: StockProducto[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STOCK_LOCAL_STORAGE_KEY, JSON.stringify(productos));
    window.dispatchEvent(new Event(STOCK_CHANGED_EVENT));
  } catch {
    // noop
  }
}

export { newId as newStockProductoId };
