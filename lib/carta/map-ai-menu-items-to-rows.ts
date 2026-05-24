import { findPotentialDuplicates } from "@/lib/carta/duplicate-detection";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import {
  inferTipoVentaFromCartaText,
  loadPlatos,
  parseTipoVentaLoose,
  type TipoProductoVenta,
} from "@/lib/platos-local";

export type AiMenuDetectedItem = {
  nombre: string;
  categoria: string;
  descripcion?: string;
  precio: number | null;
  confianza?: number;
  tipoVenta?: TipoProductoVenta;
};

export function mapAiMenuItemsToExtractedRows(
  items: AiMenuDetectedItem[],
  restauranteId: string,
): ExtractedMenuRow[] {
  const catalog = loadPlatos(restauranteId);
  return items.map((it, idx) => {
    const nombre = (it.nombre ?? "").trim();
    const categoria = (it.categoria ?? "").trim() || "General";
    const precio = it.precio == null ? NaN : Number(it.precio);
    const candidatePrecio = Number.isFinite(precio) ? Math.round(precio * 100) / 100 : NaN;
    const dup = findPotentialDuplicates({
      restauranteId,
      catalog,
      candidate: { nombre, categoria, precio: candidatePrecio },
    });
    const needsReview = dup.length > 0 || it.precio == null;
    return {
      tempId: `ai-${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
      selected: true,
      action: needsReview ? "pending_review" : "create_new",
      targetPlatoId: dup[0]?.platoId ?? null,
      potentialDuplicates: dup.map((d) => ({ platoId: d.platoId, score: d.score, reasons: d.reasons })),
      nombre: nombre || "Producto",
      categoria,
      precio: Number.isFinite(precio) ? Math.round(precio * 100) / 100 : NaN,
      tipoVenta:
        parseTipoVentaLoose(it.tipoVenta) ?? inferTipoVentaFromCartaText(categoria, nombre),
      issues: dup.length ? (["duplicate"] as ExtractedMenuRow["issues"]) : undefined,
      categoryLowConfidence: typeof it.confianza === "number" ? it.confianza < 0.55 : false,
      familia: "",
      iaNotes: (it.descripcion ?? "").trim() ? [(it.descripcion ?? "").trim()] : undefined,
      disponible: true,
    };
  });
}
