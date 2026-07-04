export type {
  VisualAsset,
  VisualAssetAiFlags,
  VisualAssetAssignment,
  VisualAssetCategory,
  VisualAssetDefinition,
  VisualAssetDraft,
  VisualAssetId,
  VisualAssetKey,
  VisualAssetRenderMode,
  VisualAssetTargetFamily,
  VisualAssetTargetRef,
  VisualAssetType,
} from "@/lib/sala-editor/visual-assets/visual-asset-types";
export {
  DEFAULT_VISUAL_ASSET_AI_FLAGS,
  DEFAULT_VISUAL_ASSET_TRANSFORM,
  createVisualAsset,
  normalizeVisualAsset,
  normalizeVisualAssets,
} from "@/lib/sala-editor/visual-assets/visual-asset-types";

export {
  DEFAULT_VISUAL_ASSET_DRAFT,
  VISUAL_ASSET_CATALOG,
  createVisualAssetDraftFromDefinition,
  createVisualAssetDraftFromKey,
  getVisualAssetDefinition,
} from "@/lib/sala-editor/visual-assets/visual-asset-catalog";

export type {
  VisualMaterial,
  VisualMaterialCategory,
  VisualMaterialId,
} from "@/lib/sala-editor/visual-assets/visual-material-system";
export {
  VISUAL_MATERIAL_CATALOG,
  getTableSafeVisualMaterials,
  getVisualMaterial,
  getVisualMaterialsByCategory,
} from "@/lib/sala-editor/visual-assets/visual-material-system";

export type {
  VisualAssetProfile,
  VisualAssetProfileCategory,
  VisualAssetProfileId,
  VisualAssetProfileInteractionStyle,
  VisualAssetProfileOutlineStyle,
  VisualAssetProfileShadowStyle,
  VisualAssetProfileZoomVisibility,
} from "@/lib/sala-editor/visual-assets/visual-asset-profiles";
export {
  VISUAL_ASSET_PROFILE_CATALOG,
  getVisualAssetProfile,
  getVisualAssetProfilesByCategory,
  getVisualAssetProfilesByMaterial,
  getVisualAssetProfilesForInteraction,
} from "@/lib/sala-editor/visual-assets/visual-asset-profiles";
