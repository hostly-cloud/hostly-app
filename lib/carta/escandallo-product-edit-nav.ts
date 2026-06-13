export type EscandalloRecipeEditNavMode = "central" | "legacy";

const PRODUCTOS_CONFIG_PATH = "/dashboard/configuracion/carta/productos";

/** Enlace a edición de receta: producto central (drawer) o detalle legacy. */
export function buildEscandalloRecipeEditHref(
  productOrEscandalloId: string | number,
  mode: EscandalloRecipeEditNavMode,
): string {
  const id = encodeURIComponent(String(productOrEscandalloId).trim());
  if (!id) return PRODUCTOS_CONFIG_PATH;
  if (mode === "central") {
    return `${PRODUCTOS_CONFIG_PATH}?productId=${id}&focus=recipe`;
  }
  return `/dashboard/escandallos/${id}`;
}

export function escandalloRecipeEditNavModeFromCatalogSource(
  source: "central" | "legacy_local" | "legacy_fallback" | null | undefined,
): EscandalloRecipeEditNavMode {
  return source === "central" ? "central" : "legacy";
}

export function escandalloRecipeLinkTitle(mode: EscandalloRecipeEditNavMode): string {
  return mode === "central"
    ? "Editar escandallo en la ficha del producto"
    : "Abrir receta (catálogo legacy)";
}
