import InventarioStockSection from "@/app/dashboard/inventario/inventario-stock-section";

/**
 * Compatibilidad de URL: `/dashboard/stock` reutiliza la única superficie
 * canónica de inventario. No mantiene estado ni persistencia propios.
 */
export default function StockPage() {
  return <InventarioStockSection />;
}
