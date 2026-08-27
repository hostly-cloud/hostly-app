import { findPotentialDuplicates } from "@/lib/carta/duplicate-detection";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
  type TipoProductoVenta,
} from "@/lib/carta/product-sale-contract";
import { loadPlatos } from "@/lib/carta/legacy-platos-storage";

export type AiMenuDetectedItem = {
  nombre: string;
  categoria: string;
  descripcion?: string;
  precio: number | null;
  confianza?: number;
  tipoVenta?: TipoProductoVenta;
  needsReview?: boolean;
  rawText?: string;
  sourceLine?: string;
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
    const lowConfidence =
      typeof it.confianza === "number" ? it.confianza < 0.65 : false;
    const flaggedReview = it.needsReview === true || lowConfidence;
    const needsReview = dup.length > 0 || it.precio == null || flaggedReview;
    const issues: ExtractedMenuRow["issues"] = [];
    if (dup.length) issues.push("duplicate");
    if (it.precio == null) issues.push("price_suspicious");
    const iaNotes = [
      ...((it.descripcion ?? "").trim() ? [(it.descripcion ?? "").trim()] : []),
      ...(it.sourceLine?.trim() ? [`Línea: ${it.sourceLine.trim()}`] : []),
      ...(flaggedReview && !dup.length && it.precio != null ? ["Revisar nombre OCR"] : []),
    ];
    return {
      tempId: `ai-${Date.now()}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
      selected: !needsReview,
      action: needsReview ? "pending_review" : "create_new",
      targetPlatoId: dup[0]?.platoId ?? null,
      potentialDuplicates: dup.map((d) => ({ platoId: d.platoId, score: d.score, reasons: d.reasons })),
      nombre: nombre || "Producto",
      categoria,
      precio: Number.isFinite(precio) ? Math.round(precio * 100) / 100 : NaN,
      tipoVenta:
        parseTipoVentaLoose(it.tipoVenta) ?? inferTipoVentaFromCartaText(categoria, nombre),
      issues: issues.length > 0 ? issues : undefined,
      categoryLowConfidence: lowConfidence,
      familia: "",
      iaNotes: iaNotes.length > 0 ? iaNotes : undefined,
      disponible: true,
    };
  });
}
