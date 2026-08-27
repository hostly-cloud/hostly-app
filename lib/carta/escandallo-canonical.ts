import type { ProductDocument } from "@/lib/firestore/products";
import { estimateRecipeCostTotal } from "@/lib/recipes/product-recipe-helpers";

export type CanonicalEscandalloRow = {
  id: string;
  nombre_plato: string | null;
  coste_total: number | null;
  precio_venta: number | null;
};

/**
 * Proyección de solo lectura para Escandallos desde el catálogo central.
 * El coste procede exclusivamente de la receta persistida; no consulta ni
 * aplica overrides de localStorage.
 */
export function buildCanonicalEscandalloRows(
  docs: readonly ProductDocument[],
): CanonicalEscandalloRow[] {
  return docs
    .filter((doc) => doc.active !== false)
    .map((doc) => ({
      id: doc.id,
      nombre_plato: doc.name?.trim() || "Sin nombre",
      coste_total: estimateRecipeCostTotal(doc.recipe),
      precio_venta:
        typeof doc.price === "number" && Number.isFinite(doc.price)
          ? doc.price
          : null,
    }))
    .sort((a, b) =>
      (a.nombre_plato ?? "").localeCompare(b.nombre_plato ?? "", undefined, {
        sensitivity: "base",
      }),
    );
}
