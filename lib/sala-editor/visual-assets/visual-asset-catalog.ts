import type {
  VisualAssetDefinition,
  VisualAssetDraft,
  VisualAssetKey,
} from "@/lib/sala-editor/visual-assets/visual-asset-types";
import {
  DEFAULT_VISUAL_ASSET_AI_FLAGS,
  DEFAULT_VISUAL_ASSET_TRANSFORM,
} from "@/lib/sala-editor/visual-assets/visual-asset-types";

function withAiTags(
  semanticTags: readonly string[],
): VisualAssetDefinition["aiFlags"] {
  return {
    ...DEFAULT_VISUAL_ASSET_AI_FLAGS,
    suggestable: true,
    replaceable: true,
    semanticTags,
  };
}

export const VISUAL_ASSET_CATALOG: readonly VisualAssetDefinition[] = [
  {
    type: "texture",
    category: "surface",
    assetKey: "surface.stone.default",
    label: "Textura de piedra",
    description: "Referencia visual futura para superficies minerales.",
    variants: ["light", "dark", "irregular"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "tile",
    aiFlags: withAiTags(["piedra", "terraza", "mineral"]),
  },
  {
    type: "texture",
    category: "surface",
    assetKey: "surface.wood.default",
    label: "Textura de madera",
    description: "Referencia visual futura para tarimas y salones calidos.",
    variants: ["oak", "walnut", "deck"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "tile",
    aiFlags: withAiTags(["madera", "tarima", "interior"]),
  },
  {
    type: "texture",
    category: "surface",
    assetKey: "surface.grass.default",
    label: "Cesped",
    description: "Referencia visual futura para jardines y zonas exteriores.",
    variants: ["short", "dense", "soft"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "tile",
    aiFlags: withAiTags(["cesped", "jardin", "exterior"]),
  },
  {
    type: "texture",
    category: "surface",
    assetKey: "surface.sand.default",
    label: "Arena",
    description: "Referencia visual futura para beach clubs y zonas de playa.",
    variants: ["fine", "warm", "pale"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "tile",
    aiFlags: withAiTags(["arena", "playa", "exterior"]),
  },
  {
    type: "texture",
    category: "surface",
    assetKey: "surface.tile.default",
    label: "Baldosas",
    description: "Referencia visual futura para suelos de baldosa.",
    variants: ["small", "large", "patterned"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "pattern",
    aiFlags: withAiTags(["baldosa", "suelo", "interior"]),
  },
  {
    type: "material",
    category: "surface",
    assetKey: "surface.concrete.default",
    label: "Hormigon",
    description: "Referencia visual futura para suelos neutros o industriales.",
    variants: ["smooth", "rough", "polished"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 0,
    defaultRenderMode: "tile",
    aiFlags: withAiTags(["hormigon", "industrial", "neutro"]),
  },
  {
    type: "water",
    category: "water",
    assetKey: "water.pool.default",
    label: "Piscina",
    description: "Referencia visual futura para laminas de agua o piscinas.",
    variants: ["blue", "turquoise", "dark"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 1,
    defaultRenderMode: "cover",
    aiFlags: withAiTags(["piscina", "agua", "beach club"]),
  },
  {
    type: "vegetation",
    category: "vegetation",
    assetKey: "vegetation.tree.default",
    label: "Arbol",
    description: "Referencia visual futura para vegetacion general.",
    variants: ["small", "medium", "large"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "stamp",
    aiFlags: withAiTags(["arbol", "sombra", "vegetacion"]),
  },
  {
    type: "vegetation",
    category: "vegetation",
    assetKey: "vegetation.palm.default",
    label: "Palmera",
    description: "Referencia visual futura para espacios tropicales o playa.",
    variants: ["short", "tall", "wide"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "stamp",
    aiFlags: withAiTags(["palmera", "playa", "terraza"]),
  },
  {
    type: "vegetation",
    category: "vegetation",
    assetKey: "vegetation.olive.default",
    label: "Olivo",
    description: "Referencia visual futura para terrazas mediterraneas.",
    variants: ["small", "medium", "old"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "stamp",
    aiFlags: withAiTags(["olivo", "mediterraneo", "vegetacion"]),
  },
  {
    type: "object",
    category: "decor",
    assetKey: "decor.planter.default",
    label: "Jardinera",
    description: "Referencia visual futura para separacion vegetal.",
    variants: ["rectangular", "round", "long"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "contain",
    aiFlags: withAiTags(["jardinera", "separador", "vegetal"]),
  },
  {
    type: "object",
    category: "decor",
    assetKey: "decor.rock.default",
    label: "Roca",
    description: "Referencia visual futura para decoracion mineral.",
    variants: ["small", "large", "group"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "stamp",
    aiFlags: withAiTags(["roca", "mineral", "decoracion"]),
  },
  {
    type: "object",
    category: "decor",
    assetKey: "decor.fountain.default",
    label: "Fuente",
    description: "Referencia visual futura para elementos de agua decorativos.",
    variants: ["round", "wall", "small"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 2,
    defaultRenderMode: "contain",
    aiFlags: withAiTags(["fuente", "agua", "decoracion"]),
  },
  {
    type: "object",
    category: "structure",
    assetKey: "structure.bar.default",
    label: "Barra",
    description: "Referencia visual futura para barras fijas o mostradores.",
    variants: ["straight", "corner", "island"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 3,
    defaultRenderMode: "contain",
    aiFlags: withAiTags(["barra", "mostrador", "servicio"]),
  },
  {
    type: "furniture",
    category: "furniture",
    assetKey: "furniture.sofa.default",
    label: "Sofa",
    description: "Referencia visual futura para asientos lounge.",
    variants: ["two-seat", "three-seat", "corner"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 1,
    defaultVisualZIndex: 4,
    defaultRenderMode: "contain",
    aiFlags: withAiTags(["sofa", "lounge", "asiento"]),
  },
  {
    type: "lighting",
    category: "lighting",
    assetKey: "lighting.ambient.default",
    label: "Iluminacion",
    description: "Referencia visual futura para puntos o zonas de luz.",
    variants: ["warm", "neutral", "accent"],
    defaultScale: 1,
    defaultRotation: 0,
    defaultOpacity: 0.85,
    defaultVisualZIndex: 5,
    defaultRenderMode: "stamp",
    aiFlags: withAiTags(["iluminacion", "ambiente", "luz"]),
  },
] as const;

export function getVisualAssetDefinition(
  assetKey: VisualAssetKey | null | undefined,
): VisualAssetDefinition | null {
  if (!assetKey) return null;
  return VISUAL_ASSET_CATALOG.find((asset) => asset.assetKey === assetKey) ?? null;
}

export function createVisualAssetDraftFromDefinition(
  definition: VisualAssetDefinition,
  overrides: Partial<
    Pick<
      VisualAssetDraft,
      | "variant"
      | "scale"
      | "rotation"
      | "opacity"
      | "visualZIndex"
      | "renderMode"
      | "aiFlags"
    >
  > = {},
): VisualAssetDraft {
  return {
    type: definition.type,
    category: definition.category,
    assetKey: definition.assetKey,
    ...(overrides.variant ? { variant: overrides.variant } : {}),
    scale: overrides.scale ?? definition.defaultScale,
    rotation: overrides.rotation ?? definition.defaultRotation,
    opacity: overrides.opacity ?? definition.defaultOpacity,
    visualZIndex: overrides.visualZIndex ?? definition.defaultVisualZIndex,
    renderMode: overrides.renderMode ?? definition.defaultRenderMode,
    aiFlags: overrides.aiFlags ?? definition.aiFlags,
  };
}

export function createVisualAssetDraftFromKey(
  assetKey: VisualAssetKey,
  overrides?: Parameters<typeof createVisualAssetDraftFromDefinition>[1],
): VisualAssetDraft | null {
  const definition = getVisualAssetDefinition(assetKey);
  if (!definition) return null;
  return createVisualAssetDraftFromDefinition(definition, overrides);
}

export const DEFAULT_VISUAL_ASSET_DRAFT: VisualAssetDraft = {
  type: "material",
  category: "surface",
  assetKey: "surface.neutral.default",
  scale: DEFAULT_VISUAL_ASSET_TRANSFORM.scale,
  rotation: DEFAULT_VISUAL_ASSET_TRANSFORM.rotation,
  opacity: DEFAULT_VISUAL_ASSET_TRANSFORM.opacity,
  visualZIndex: DEFAULT_VISUAL_ASSET_TRANSFORM.visualZIndex,
  renderMode: DEFAULT_VISUAL_ASSET_TRANSFORM.renderMode,
  aiFlags: DEFAULT_VISUAL_ASSET_AI_FLAGS,
};
