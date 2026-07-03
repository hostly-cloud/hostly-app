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
