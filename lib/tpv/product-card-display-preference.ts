export const TPV_PRODUCT_CARD_DISPLAY_STORAGE_KEY =
  "hostly.tpv.productCardDisplay";

export type TpvProductCardDisplayMode = "images" | "names";

export function parseTpvProductCardDisplayMode(
  value: unknown,
): TpvProductCardDisplayMode {
  return value === "names" ? "names" : "images";
}

