import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
} from "@/lib/carta/product-sale-contract";
import type { ProductImageContentStrategy } from "@/lib/productos/product-image-review-contract";
import { catalogMatchContextFromProduct } from "@/lib/server/product-images/search-catalog-product-images";

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A positive match always routes to a real catalog, never image generation. */
export function looksLikeBrandedOrBeverageProduct(
  name: string,
  categoryName: string,
): boolean {
  const text = normalizeMatchText(`${categoryName} ${name}`);
  return /\b(coca cola|fanta|sprite|pepsi|heineken|mahou|estrella damm|san miguel|corona|red bull|monster|aquarius|nestea|schweppes|tonicas?|cervezas?|beers?|vinos?|wines?|rioja|ribera del duero|cavas?|champagnes?|proseccos?|whisk(?:y|ey)s?|vodkas?|rones?|rums?|gins?|ginebras?|vermuts?|vermouths?|licores?|refrescos?|sodas?|aguas? minerales?|zumos?|juices?|cafes?|coffees?|cocktails?|cocteles?)\b/.test(
    text,
  );
}

export function hasCommercialCatalogSignals(
  data: Record<string, unknown>,
): boolean {
  const context = catalogMatchContextFromProduct(data);
  const categoryName = context.categoryName ?? "";
  const tipoVenta =
    parseTipoVentaLoose(data.tipoVenta) ??
    inferTipoVentaFromCartaText(categoryName, context.name);
  return Boolean(
    context.barcode ||
      context.brand ||
      context.wineProducer ||
      context.wineAppellation ||
      context.wineVintage ||
      data.productFamilyType === "drink" ||
      tipoVenta === "bebida" ||
      looksLikeBrandedOrBeverageProduct(context.name, categoryName),
  );
}

/** Selects a conservative provider strategy from saved product data. */
export function classifyProductImageContentStrategy(
  data: Record<string, unknown>,
): ProductImageContentStrategy {
  const context = catalogMatchContextFromProduct(data);
  if (context.name.trim().length < 3) return "manual_review";
  if (hasCommercialCatalogSignals(data)) return "catalog_search";

  if (
    typeof data.tipoVenta === "string" &&
    data.tipoVenta.trim().toLowerCase() === "otro"
  ) {
    return "manual_review";
  }

  const categoryName = context.categoryName ?? "";
  const tipoVenta =
    parseTipoVentaLoose(data.tipoVenta) ??
    inferTipoVentaFromCartaText(categoryName, context.name);
  return tipoVenta === "plato" && data.productFamilyType !== "drink"
    ? "ai_generate"
    : "manual_review";
}
