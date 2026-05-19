import InventarioStockSection from "@/app/dashboard/inventario/inventario-stock-section";

/**
 * Inventario hub — entrada Stock (`InventarioStockSection`).
 * Los tabs Compras/Recepciones/Mermas viven en el shell junto al título (`InventarioRouteTabs`).
 */
export default function InventarioPage() {
  return <InventarioStockSection />;
}
