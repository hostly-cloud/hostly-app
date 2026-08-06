/**
 * Visual Materials - catalogo arquitectonico para Visual Assets.
 *
 * No renderiza y no modifica Surface, Structure ni Operation System. Describe
 * propiedades visuales reutilizables para que futuros Visual Assets puedan
 * representar materiales realistas sin acoplar apariencia y comportamiento.
 */

export type VisualMaterialId = string;

export type VisualMaterialCategory =
  | "neutral"
  | "wood"
  | "concrete"
  | "stone"
  | "marble"
  | "vegetation"
  | "sand"
  | "water"
  | "tile"
  | "textile"
  | "metal"
  | "ceramic"
  | "deck"
  | "asphalt"
  | "earth";

export type VisualMaterial = {
  id: VisualMaterialId;
  label: string;
  category: VisualMaterialCategory;
  baseColor: string;
  secondaryColor: string;
  /**
   * Intensidad cromatica recomendada para render futuro. 0 = neutro, 1 = maxima.
   */
  saturation: number;
  /**
   * Contraste recomendado para render futuro. 0 = plano, 1 = alto contraste.
   */
  contrast: number;
  /**
   * Jerarquia visual. 0 = fondo discreto, 100 = foco visual fuerte.
   */
  visualPriority: number;
  recommendedOpacity: number;
  supportsTables: boolean;
  discreet: boolean;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampPriority(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createVisualMaterial(
  material: Omit<
    VisualMaterial,
    "saturation" | "contrast" | "visualPriority" | "recommendedOpacity"
  > & {
    saturation: number;
    contrast: number;
    visualPriority: number;
    recommendedOpacity: number;
  },
): VisualMaterial {
  return {
    ...material,
    saturation: clamp01(material.saturation),
    contrast: clamp01(material.contrast),
    visualPriority: clampPriority(material.visualPriority),
    recommendedOpacity: clamp01(material.recommendedOpacity),
  };
}

export const VISUAL_MATERIAL_CATALOG: readonly VisualMaterial[] = [
  createVisualMaterial({
    id: "neutral.warm",
    label: "Suelo neutro calido",
    category: "neutral",
    baseColor: "#e8e3d8",
    secondaryColor: "#c9c2b7",
    saturation: 0.1,
    contrast: 0.18,
    visualPriority: 8,
    recommendedOpacity: 0.78,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "wood.oak",
    label: "Roble",
    category: "wood",
    baseColor: "#c59a6a",
    secondaryColor: "#8f6847",
    saturation: 0.38,
    contrast: 0.34,
    visualPriority: 24,
    recommendedOpacity: 0.82,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "wood.walnut",
    label: "Nogal",
    category: "wood",
    baseColor: "#765642",
    secondaryColor: "#4f382d",
    saturation: 0.36,
    contrast: 0.4,
    visualPriority: 28,
    recommendedOpacity: 0.82,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "concrete.raw",
    label: "Hormigon",
    category: "concrete",
    baseColor: "#9ca3af",
    secondaryColor: "#6b7280",
    saturation: 0.14,
    contrast: 0.34,
    visualPriority: 22,
    recommendedOpacity: 0.82,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "concrete.cement",
    label: "Cemento",
    category: "concrete",
    baseColor: "#c4c7c5",
    secondaryColor: "#8f9491",
    saturation: 0.08,
    contrast: 0.28,
    visualPriority: 18,
    recommendedOpacity: 0.8,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "stone.natural",
    label: "Piedra natural",
    category: "stone",
    baseColor: "#aaa59c",
    secondaryColor: "#777169",
    saturation: 0.12,
    contrast: 0.3,
    visualPriority: 20,
    recommendedOpacity: 0.8,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "stone.marble",
    label: "Marmol",
    category: "marble",
    baseColor: "#e5e7eb",
    secondaryColor: "#a8adb5",
    saturation: 0.12,
    contrast: 0.52,
    visualPriority: 42,
    recommendedOpacity: 0.88,
    supportsTables: true,
    discreet: false,
  }),
  createVisualMaterial({
    id: "textile.rug-neutral",
    label: "Alfombra neutra",
    category: "textile",
    baseColor: "#b8afa3",
    secondaryColor: "#7c7167",
    saturation: 0.22,
    contrast: 0.34,
    visualPriority: 32,
    recommendedOpacity: 0.74,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "vegetation.grass-soft",
    label: "Cesped suave",
    category: "vegetation",
    baseColor: "#91ad72",
    secondaryColor: "#657e50",
    saturation: 0.38,
    contrast: 0.26,
    visualPriority: 22,
    recommendedOpacity: 0.68,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "vegetation.grass-decorative",
    label: "Cesped decorativo",
    category: "vegetation",
    baseColor: "#65a30d",
    secondaryColor: "#365314",
    saturation: 0.72,
    contrast: 0.5,
    visualPriority: 48,
    recommendedOpacity: 0.78,
    supportsTables: false,
    discreet: false,
  }),
  createVisualMaterial({
    id: "vegetation.flower-soft",
    label: "Flores suaves",
    category: "vegetation",
    baseColor: "#d8b4c6",
    secondaryColor: "#8f5f76",
    saturation: 0.38,
    contrast: 0.34,
    visualPriority: 36,
    recommendedOpacity: 0.68,
    supportsTables: false,
    discreet: false,
  }),
  createVisualMaterial({
    id: "vegetation.shrub-soft",
    label: "Arbusto suave",
    category: "vegetation",
    baseColor: "#7f9f70",
    secondaryColor: "#4f6f46",
    saturation: 0.42,
    contrast: 0.32,
    visualPriority: 28,
    recommendedOpacity: 0.7,
    supportsTables: false,
    discreet: true,
  }),
  createVisualMaterial({
    id: "vegetation.hedge-dark",
    label: "Seto oscuro",
    category: "vegetation",
    baseColor: "#4d6b43",
    secondaryColor: "#2f4729",
    saturation: 0.42,
    contrast: 0.4,
    visualPriority: 34,
    recommendedOpacity: 0.76,
    supportsTables: false,
    discreet: true,
  }),
  createVisualMaterial({
    id: "sand.default",
    label: "Arena",
    category: "sand",
    baseColor: "#dfc99e",
    secondaryColor: "#bea77d",
    saturation: 0.28,
    contrast: 0.2,
    visualPriority: 18,
    recommendedOpacity: 0.7,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "water.pool",
    label: "Agua piscina",
    category: "water",
    baseColor: "#38bdf8",
    secondaryColor: "#0284c7",
    saturation: 0.78,
    contrast: 0.52,
    visualPriority: 62,
    recommendedOpacity: 0.82,
    supportsTables: false,
    discreet: false,
  }),
  createVisualMaterial({
    id: "water.decorative",
    label: "Agua decorativa",
    category: "water",
    baseColor: "#7dd3fc",
    secondaryColor: "#0ea5e9",
    saturation: 0.62,
    contrast: 0.42,
    visualPriority: 44,
    recommendedOpacity: 0.72,
    supportsTables: false,
    discreet: false,
  }),
  createVisualMaterial({
    id: "tile.default",
    label: "Baldosa",
    category: "tile",
    baseColor: "#d6d3d1",
    secondaryColor: "#a8a29e",
    saturation: 0.16,
    contrast: 0.36,
    visualPriority: 26,
    recommendedOpacity: 0.82,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "ceramic.terracotta",
    label: "Ceramica terracota",
    category: "ceramic",
    baseColor: "#c26f45",
    secondaryColor: "#8f4526",
    saturation: 0.46,
    contrast: 0.38,
    visualPriority: 34,
    recommendedOpacity: 0.78,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "deck.default",
    label: "Tarima",
    category: "deck",
    baseColor: "#a87843",
    secondaryColor: "#775331",
    saturation: 0.36,
    contrast: 0.34,
    visualPriority: 26,
    recommendedOpacity: 0.78,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "metal.matte-black",
    label: "Metal negro mate",
    category: "metal",
    baseColor: "#2f343b",
    secondaryColor: "#111827",
    saturation: 0.08,
    contrast: 0.46,
    visualPriority: 36,
    recommendedOpacity: 0.86,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "metal.brass-soft",
    label: "Laton suave",
    category: "metal",
    baseColor: "#b08d57",
    secondaryColor: "#6f542f",
    saturation: 0.36,
    contrast: 0.42,
    visualPriority: 42,
    recommendedOpacity: 0.82,
    supportsTables: false,
    discreet: false,
  }),
  createVisualMaterial({
    id: "asphalt.default",
    label: "Asfalto",
    category: "asphalt",
    baseColor: "#4b5563",
    secondaryColor: "#1f2937",
    saturation: 0.1,
    contrast: 0.5,
    visualPriority: 24,
    recommendedOpacity: 0.78,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "earth.default",
    label: "Tierra",
    category: "earth",
    baseColor: "#92400e",
    secondaryColor: "#5f2d0c",
    saturation: 0.44,
    contrast: 0.42,
    visualPriority: 30,
    recommendedOpacity: 0.74,
    supportsTables: false,
    discreet: true,
  }),
] as const;

export function getVisualMaterial(
  id: VisualMaterialId | null | undefined,
): VisualMaterial | null {
  if (!id) return null;
  return VISUAL_MATERIAL_CATALOG.find((material) => material.id === id) ?? null;
}

export function getVisualMaterialsByCategory(
  category: VisualMaterialCategory,
): readonly VisualMaterial[] {
  return VISUAL_MATERIAL_CATALOG.filter(
    (material) => material.category === category,
  );
}

export function getTableSafeVisualMaterials(): readonly VisualMaterial[] {
  return VISUAL_MATERIAL_CATALOG.filter((material) => material.supportsTables);
}

