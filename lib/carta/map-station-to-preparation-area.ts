/** Mapea estación central (import) → área operativa TPV/KDS (español). */
export function mapStationToPreparationArea(station: string | null | undefined): string | undefined {
  const s = typeof station === "string" ? station.trim().toLowerCase() : "";
  if (s === "kitchen") return "cocina";
  if (s === "bar") return "barra";
  if (s === "cocktail") return "cocteleria";
  if (s === "none") return "none";
  if (s === "cocina" || s === "barra" || s === "cocteleria") return s;
  return undefined;
}

/** Inverso operativo: área TPV → estación canónica central. */
export function mapPreparationAreaToStation(
  preparationArea: string | null | undefined,
): string | null {
  const s = typeof preparationArea === "string" ? preparationArea.trim().toLowerCase() : "";
  if (s === "cocina" || s === "kitchen") return "kitchen";
  if (s === "barra" || s === "bar") return "bar";
  if (s === "cocteleria" || s === "cocktail") return "cocktail";
  if (s === "none") return "none";
  return null;
}
