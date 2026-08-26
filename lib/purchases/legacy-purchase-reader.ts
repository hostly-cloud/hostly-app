export const LEGACY_PURCHASE_STORAGE_KEY = "hostly.compras.pedidos.v1";

export type LegacyPurchaseUnit = "kg" | "g" | "l" | "ml" | "uds";
export type LegacyPurchaseStatus = "pendiente" | "recibido" | "cancelado";

export type LegacyPurchaseLine = {
  producto_stock_nombre?: string;
  nombre?: string;
  producto?: string;
  producto_stock_id?: string;
  unidad?: LegacyPurchaseUnit;
  cantidad?: number;
  cantidad_pedida?: number;
  precio_unitario?: number;
};

export type LegacyPurchase = {
  id: string;
  proveedor: string;
  supplierDisplayName?: string;
  fecha: string;
  estado: LegacyPurchaseStatus;
  total: number;
  notas?: string;
  stock_aplicado?: boolean;
  inventory_receipt_id?: string;
  producto_stock_id?: string;
  producto_stock_nombre?: string;
  unidad?: LegacyPurchaseUnit;
  cantidad_recibida?: number;
  precio_unitario?: number;
  items?: LegacyPurchaseLine[];
};

export function parseLegacyPurchaseQuantity(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function parseUnit(value: unknown): LegacyPurchaseUnit | undefined {
  return value === "kg" || value === "g" || value === "l" || value === "ml" || value === "uds"
    ? value
    : undefined;
}

function parseProductId(row: Record<string, unknown>): string | undefined {
  const value = row.producto_stock_id ?? row.stock_producto_id;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseLine(value: unknown): LegacyPurchaseLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const line: LegacyPurchaseLine = {};
  if (typeof row.producto_stock_nombre === "string" && row.producto_stock_nombre.trim()) {
    line.producto_stock_nombre = row.producto_stock_nombre.trim();
  }
  if (typeof row.nombre === "string" && row.nombre.trim()) line.nombre = row.nombre.trim();
  if (typeof row.producto === "string" && row.producto.trim()) line.producto = row.producto.trim();
  const productId = parseProductId(row);
  if (productId) line.producto_stock_id = productId;
  const unit = parseUnit(row.unidad);
  if (unit) line.unidad = unit;
  const quantity = parseLegacyPurchaseQuantity(row.cantidad ?? row.qty);
  if (quantity != null) line.cantidad = quantity;
  const ordered = parseLegacyPurchaseQuantity(row.cantidad_pedida ?? row.qty_ordered ?? row.qtyOrdered);
  if (ordered != null) line.cantidad_pedida = ordered;
  const unitCost = row.precio_unitario ?? row.coste_unitario;
  if (typeof unitCost === "number" && Number.isFinite(unitCost)) {
    line.precio_unitario = Math.max(0, unitCost);
  }
  return line;
}

function parseStatus(value: unknown): LegacyPurchaseStatus {
  return value === "recibido" || value === "cancelado" ? value : "pendiente";
}

export function readLegacyPurchasesFromRaw(raw: string): LegacyPurchase[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const purchases: LegacyPurchase[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      const proveedor = typeof row.proveedor === "string" ? row.proveedor.trim() : "";
      const fecha = typeof row.fecha === "string" ? row.fecha.trim() : "";
      if (!id || !proveedor || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      const total = typeof row.total === "number" && Number.isFinite(row.total) ? Math.max(0, row.total) : 0;
      const purchase: LegacyPurchase = {
        id,
        proveedor,
        fecha,
        estado: parseStatus(row.estado),
        total,
      };
      if (typeof row.supplierDisplayName === "string" && row.supplierDisplayName.trim()) {
        purchase.supplierDisplayName = row.supplierDisplayName.trim();
      }
      if (typeof row.notas === "string" && row.notas.trim()) purchase.notas = row.notas.trim();
      const productId = parseProductId(row);
      if (productId) purchase.producto_stock_id = productId;
      if (typeof row.producto_stock_nombre === "string" && row.producto_stock_nombre.trim()) {
        purchase.producto_stock_nombre = row.producto_stock_nombre.trim();
      }
      const unit = parseUnit(row.unidad);
      if (unit) purchase.unidad = unit;
      const received = parseLegacyPurchaseQuantity(row.cantidad_recibida);
      if (received != null) purchase.cantidad_recibida = received;
      const unitCost = row.precio_unitario ?? row.coste_unitario;
      if (typeof unitCost === "number" && Number.isFinite(unitCost)) {
        purchase.precio_unitario = Math.max(0, unitCost);
      }
      purchase.stock_aplicado =
        row.stock_aplicado === true ||
        row.stock_aplicado === "true" ||
        row.aplicadoStock === true ||
        row.aplicadoStock === "true";
      if (typeof row.inventory_receipt_id === "string" && row.inventory_receipt_id.trim()) {
        purchase.inventory_receipt_id = row.inventory_receipt_id.trim();
      }
      if (Array.isArray(row.items)) {
        const lines = row.items.map(parseLine).filter((line): line is LegacyPurchaseLine => line != null);
        if (lines.length) purchase.items = lines;
      }
      purchases.push(purchase);
    }
    return purchases;
  } catch {
    return [];
  }
}
