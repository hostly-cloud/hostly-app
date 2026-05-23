/**
 * Estado operativo de stock para inventario central (avisos, no bloqueo TPV).
 */

export type StockStatus = "ok" | "low" | "out" | "unknown";

export type StockStatusProductInput = {
  currentStock?: number | null;
  minStock?: number | null;
};

function readStockNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function hasConfiguredMinStock(minStock: number | null | undefined): boolean {
  const min = readStockNumber(minStock);
  return min != null && min > 0;
}

export function resolveStockStatus(product: StockStatusProductInput): StockStatus {
  const stock = readStockNumber(product.currentStock);
  if (stock == null) return "unknown";
  if (stock <= 0) return "out";
  if (
    hasConfiguredMinStock(product.minStock) &&
    stock <= (readStockNumber(product.minStock) as number)
  ) {
    return "low";
  }
  return "ok";
}

/** Umbral mínimo alcanzado pero aún hay stock (> 0). */
export function isLowStock(product: StockStatusProductInput): boolean {
  return resolveStockStatus(product) === "low";
}

export function isOutOfStock(product: StockStatusProductInput): boolean {
  return resolveStockStatus(product) === "out";
}

export function formatStockStatusLabel(status: StockStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "low":
      return "Bajo";
    case "out":
      return "Sin stock";
    case "unknown":
      return "Sin datos";
    default:
      return "Sin datos";
  }
}

export function stockStatusBadgeClassName(status: StockStatus): string {
  switch (status) {
    case "low":
      return "is-low";
    case "out":
      return "is-out";
    case "unknown":
      return "is-unknown";
    case "ok":
    default:
      return "is-ok";
  }
}

export type StockLevelListFilter = "all" | "low" | "out";

export const STOCK_LEVEL_LIST_FILTER_OPTIONS: ReadonlyArray<{
  id: StockLevelListFilter;
  label: string;
}> = [
  { id: "all", label: "Todos" },
  { id: "low", label: "Bajo stock" },
  { id: "out", label: "Sin stock" },
];

export function matchesStockLevelListFilter(
  product: StockStatusProductInput,
  filter: StockLevelListFilter,
): boolean {
  if (filter === "all") return true;
  const status = resolveStockStatus(product);
  if (filter === "low") return status === "low";
  if (filter === "out") return status === "out";
  return true;
}
