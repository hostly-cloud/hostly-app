/**
 * Visual Materials - catalogo arquitectonico para Visual Assets.
 *
 * No renderiza y no modifica Surface, Structure ni Operation System. Describe
 * propiedades visuales reutilizables para que futuros Visual Assets puedan
 * representar materiales realistas sin acoplar apariencia y comportamiento.
 */

export type VisualMaterialId = string;

export type VisualMaterialCategory =
  | "wood"
  | "concrete"
  | "stone"
  | "vegetation"
  | "sand"
  | "water"
  | "tile"
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
    id: "wood.oak",
    label: "Roble",
    category: "wood",
    baseColor: "#b77942",
    secondaryColor: "#7c4a24",
    saturation: 0.58,
    contrast: 0.48,
    visualPriority: 34,
    recommendedOpacity: 0.9,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "wood.walnut",
    label: "Nogal",
    category: "wood",
    baseColor: "#6f4328",
    secondaryColor: "#3f2418",
    saturation: 0.52,
    contrast: 0.56,
    visualPriority: 38,
    recommendedOpacity: 0.88,
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
    baseColor: "#9a9488",
    secondaryColor: "#665f55",
    saturation: 0.2,
    contrast: 0.46,
    visualPriority: 30,
    recommendedOpacity: 0.86,
    supportsTables: true,
    discreet: true,
  }),
  createVisualMaterial({
    id: "stone.marble",
    label: "Marmol",
    category: "stone",
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
    id: "vegetation.grass-soft",
    label: "Cesped suave",
    category: "vegetation",
    baseColor: "#84cc16",
    secondaryColor: "#4d7c0f",
    saturation: 0.62,
    contrast: 0.38,
    visualPriority: 34,
    recommendedOpacity: 0.72,
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
    id: "sand.default",
    label: "Arena",
    category: "sand",
    baseColor: "#eabf7a",
    secondaryColor: "#c98f45",
    saturation: 0.46,
    contrast: 0.3,
    visualPriority: 28,
    recommendedOpacity: 0.76,
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
    id: "deck.default",
    label: "Tarima",
    category: "deck",
    baseColor: "#a16207",
    secondaryColor: "#713f12",
    saturation: 0.54,
    contrast: 0.46,
    visualPriority: 36,
    recommendedOpacity: 0.84,
    supportsTables: true,
    discreet: true,
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

