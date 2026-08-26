import { redirect } from "next/navigation";

const CANONICAL_SUPPLIER_INVOICES_ROUTE = "/dashboard/inventario/facturas-proveedor";

/**
 * Compatibilidad con enlaces antiguos.
 * Facturas y costes ya tienen una única fuente de verdad en el flujo canónico de Inventario.
 */
export default function LegacyFacturasCostesPage() {
  redirect(CANONICAL_SUPPLIER_INVOICES_ROUTE);
}
