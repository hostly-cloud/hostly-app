import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";

/** Mapea estación sugerida del import a valor persistido en ProductDocument.station. */
export function mapImportStationToProduct(station: ImportedMenuSuggestedStation): string | null {
  switch (station) {
    case "kitchen":
      return "kitchen";
    case "bar":
      return "bar";
    case "cocktail":
      return "cocktail";
    case "none":
    default:
      return null;
  }
}
