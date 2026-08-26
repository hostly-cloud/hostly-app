import { redirect } from "next/navigation";

/**
 * Compatibility route for the retired local purchase validation queue.
 * Purchase validation now lives in the canonical Firestore-backed purchase orders flow.
 */
export default function ValidacionInteligentePage() {
  redirect("/dashboard/inventario/pedidos-compra");
}
