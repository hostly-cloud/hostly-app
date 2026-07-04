/**
 * Asset Profiles - capa visual entre Material System y Visual Assets.
 *
 * Flujo canonico futuro:
 * Visual Material -> Asset Profile -> Visual Asset -> Renderer
 *
 * Este modulo no renderiza, no contiene sprites, SVG, imagenes ni CSS, y no
 * modifica Surface, Structure, Operation, Documento V2, Smart Snap ni interaccion.
 * Solo describe como deberia verse un asset cuando exista un renderer realista.
 */

import type { VisualMaterialId } from "@/lib/sala-editor/visual-assets/visual-material-system";

export type VisualAssetProfileId = string;

export type VisualAssetProfileCategory =
  | "floor"
  | "water"
  | "vegetation"
  | "structure"
  | "furniture"
  | "shade"
  | "decor";

export type VisualAssetProfileShadowStyle =
  | "none"
  | "subtle"
  | "soft"
  | "elevated"
  | "canopy"
  | "ambient";

export type VisualAssetProfileOutlineStyle =
  | "none"
  | "subtle"
  | "architectural"
  | "organic"
  | "furniture"
  | "operational";

export type VisualAssetProfileZoomVisibility =
  | "always"
  | "overview"
  | "medium"
  | "close";

export type VisualAssetProfileInteractionStyle =
  | "passive-surface"
  | "structural-object"
  | "operational-object"
  | "decorative-object"
  | "ambient-object";

export type VisualAssetProfile = {
  id: VisualAssetProfileId;
  displayName: string;
  category: VisualAssetProfileCategory;
  material: VisualMaterialId;
  defaultScale: number;
  shadowStyle: VisualAssetProfileShadowStyle;
  outlineStyle: VisualAssetProfileOutlineStyle;
  renderPriority: number;
  supportsTint: boolean;
  supportsVariants: boolean;
  supportsRotation: boolean;
  supportsOpacity: boolean;
  recommendedZoomVisibility: VisualAssetProfileZoomVisibility;
  interactionStyle: VisualAssetProfileInteractionStyle;
};

function clampRenderPriority(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDefaultScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function createAssetProfile(
  profile: Omit<VisualAssetProfile, "defaultScale" | "renderPriority"> & {
    defaultScale: number;
    renderPriority: number;
  },
): VisualAssetProfile {
  return {
    ...profile,
    defaultScale: normalizeDefaultScale(profile.defaultScale),
    renderPriority: clampRenderPriority(profile.renderPriority),
  };
}

export const VISUAL_ASSET_PROFILE_CATALOG: readonly VisualAssetProfile[] = [
  createAssetProfile({
    id: "profile.floor.oak",
    displayName: "Oak Floor",
    category: "floor",
    material: "wood.oak",
    defaultScale: 1,
    shadowStyle: "none",
    outlineStyle: "none",
    renderPriority: 12,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "passive-surface",
  }),
  createAssetProfile({
    id: "profile.floor.concrete",
    displayName: "Concrete Floor",
    category: "floor",
    material: "concrete.raw",
    defaultScale: 1,
    shadowStyle: "none",
    outlineStyle: "none",
    renderPriority: 10,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "passive-surface",
  }),
  createAssetProfile({
    id: "profile.water.pool",
    displayName: "Pool Water",
    category: "water",
    material: "water.pool",
    defaultScale: 1,
    shadowStyle: "ambient",
    outlineStyle: "subtle",
    renderPriority: 28,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: false,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "ambient-object",
  }),
  createAssetProfile({
    id: "profile.vegetation.palm-tree",
    displayName: "Palm Tree",
    category: "vegetation",
    material: "vegetation.grass-decorative",
    defaultScale: 1,
    shadowStyle: "canopy",
    outlineStyle: "organic",
    renderPriority: 72,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "decorative-object",
  }),
  createAssetProfile({
    id: "profile.vegetation.olive-tree",
    displayName: "Olive Tree",
    category: "vegetation",
    material: "vegetation.grass-decorative",
    defaultScale: 1,
    shadowStyle: "canopy",
    outlineStyle: "organic",
    renderPriority: 70,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "decorative-object",
  }),
  createAssetProfile({
    id: "profile.decor.planter",
    displayName: "Planter",
    category: "decor",
    material: "vegetation.grass-decorative",
    defaultScale: 1,
    shadowStyle: "soft",
    outlineStyle: "organic",
    renderPriority: 58,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "decorative-object",
  }),
  createAssetProfile({
    id: "profile.structure.stone-wall",
    displayName: "Stone Wall",
    category: "structure",
    material: "stone.natural",
    defaultScale: 1,
    shadowStyle: "subtle",
    outlineStyle: "architectural",
    renderPriority: 60,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "structural-object",
  }),
  createAssetProfile({
    id: "profile.structure.wood-bar",
    displayName: "Wood Bar",
    category: "structure",
    material: "wood.walnut",
    defaultScale: 1,
    shadowStyle: "elevated",
    outlineStyle: "architectural",
    renderPriority: 68,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "structural-object",
  }),
  createAssetProfile({
    id: "profile.operation.round-table",
    displayName: "Round Table",
    category: "furniture",
    material: "wood.oak",
    defaultScale: 1,
    shadowStyle: "soft",
    outlineStyle: "operational",
    renderPriority: 80,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "operational-object",
  }),
  createAssetProfile({
    id: "profile.operation.square-table",
    displayName: "Square Table",
    category: "furniture",
    material: "wood.oak",
    defaultScale: 1,
    shadowStyle: "soft",
    outlineStyle: "operational",
    renderPriority: 80,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "always",
    interactionStyle: "operational-object",
  }),
  createAssetProfile({
    id: "profile.furniture.sofa",
    displayName: "Sofa",
    category: "furniture",
    material: "wood.walnut",
    defaultScale: 1,
    shadowStyle: "elevated",
    outlineStyle: "furniture",
    renderPriority: 78,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "operational-object",
  }),
  createAssetProfile({
    id: "profile.furniture.sunbed",
    displayName: "Sunbed",
    category: "furniture",
    material: "deck.default",
    defaultScale: 1,
    shadowStyle: "soft",
    outlineStyle: "furniture",
    renderPriority: 76,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "operational-object",
  }),
  createAssetProfile({
    id: "profile.shade.umbrella",
    displayName: "Umbrella",
    category: "shade",
    material: "concrete.cement",
    defaultScale: 1,
    shadowStyle: "canopy",
    outlineStyle: "furniture",
    renderPriority: 74,
    supportsTint: true,
    supportsVariants: true,
    supportsRotation: true,
    supportsOpacity: true,
    recommendedZoomVisibility: "medium",
    interactionStyle: "decorative-object",
  }),
] as const;

export function getVisualAssetProfile(
  id: VisualAssetProfileId | null | undefined,
): VisualAssetProfile | null {
  if (!id) return null;
  return VISUAL_ASSET_PROFILE_CATALOG.find((profile) => profile.id === id) ?? null;
}

export function getVisualAssetProfilesByCategory(
  category: VisualAssetProfileCategory,
): readonly VisualAssetProfile[] {
  return VISUAL_ASSET_PROFILE_CATALOG.filter(
    (profile) => profile.category === category,
  );
}

export function getVisualAssetProfilesByMaterial(
  material: VisualMaterialId,
): readonly VisualAssetProfile[] {
  return VISUAL_ASSET_PROFILE_CATALOG.filter(
    (profile) => profile.material === material,
  );
}

export function getVisualAssetProfilesForInteraction(
  interactionStyle: VisualAssetProfileInteractionStyle,
): readonly VisualAssetProfile[] {
  return VISUAL_ASSET_PROFILE_CATALOG.filter(
    (profile) => profile.interactionStyle === interactionStyle,
  );
}

