import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";

export type SurfaceMaterialCatalogItem = {
  kind: SurfaceMaterialKind;
  label: string;
  swatch: string;
  description: string;
};

export const SURFACE_MATERIAL_CATALOG: readonly SurfaceMaterialCatalogItem[] = [
  {
    kind: "wood",
    label: "Madera",
    swatch: "#b77942",
    description: "Zonas cálidas de comedor, tarimas interiores o salones.",
  },
  {
    kind: "stone",
    label: "Piedra",
    swatch: "#94a3b8",
    description: "Terrazas, zonas de paso y superficies minerales.",
  },
  {
    kind: "grass",
    label: "Césped",
    swatch: "#65a30d",
    description: "Jardines, exteriores y espacios beach club.",
  },
  {
    kind: "sand",
    label: "Arena",
    swatch: "#eabf7a",
    description: "Zonas de playa, chill out o espacios exteriores.",
  },
  {
    kind: "water",
    label: "Agua",
    swatch: "#38bdf8",
    description: "Piscinas, láminas de agua o referencias acuáticas.",
  },
  {
    kind: "deck",
    label: "Tarima",
    swatch: "#a16207",
    description: "Plataformas, elevaciones y zonas de madera exterior.",
  },
] as const;

export function getSurfaceMaterialCatalogItem(
  kind: SurfaceMaterialKind | null | undefined,
): SurfaceMaterialCatalogItem | null {
  if (!kind) return null;
  return SURFACE_MATERIAL_CATALOG.find((item) => item.kind === kind) ?? null;
}
