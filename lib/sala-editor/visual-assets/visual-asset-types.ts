/**
 * Visual Assets - contrato independiente para render realista futuro.
 *
 * Este modulo no renderiza, no persiste en Documento V2 y no modifica ningun
 * sistema del editor. Solo define la forma estable de describir recursos
 * visuales que futuras capas podran asociar a superficies, estructura u operacion.
 */

export type VisualAssetId = string;
export type VisualAssetKey = string;

export type VisualAssetType =
  | "texture"
  | "material"
  | "object"
  | "vegetation"
  | "water"
  | "furniture"
  | "lighting";

export type VisualAssetCategory =
  | "surface"
  | "structure"
  | "vegetation"
  | "water"
  | "furniture"
  | "exterior"
  | "shade"
  | "decor"
  | "lighting";

export type VisualAssetRenderMode =
  | "fill"
  | "tile"
  | "cover"
  | "contain"
  | "stamp"
  | "pattern";

export type VisualAssetAiFlags = {
  /** Puede ser sugerido por IA en futuras iteraciones. */
  suggestable: boolean;
  /** Puede ser sustituido por IA con confirmacion humana. */
  replaceable: boolean;
  /** Puede generarse a partir de prompt en una futura pipeline. */
  generatable: boolean;
  /** Etiquetas semanticas para busqueda/asistente; no afectan al render actual. */
  semanticTags: readonly string[];
};

export type VisualAssetTargetFamily =
  | "surface"
  | "wall"
  | "wallAttachment"
  | "structuralElement"
  | "operationalInstance"
  | "spaceBase";

export type VisualAssetTargetRef = {
  family: VisualAssetTargetFamily;
  id: string;
};

export type VisualAsset = {
  id: VisualAssetId;
  type: VisualAssetType;
  category: VisualAssetCategory;
  assetKey: VisualAssetKey;
  variant?: string;
  scale: number;
  rotation: number;
  opacity: number;
  visualZIndex: number;
  renderMode: VisualAssetRenderMode;
  aiFlags: VisualAssetAiFlags;
};

export type VisualAssetDraft = Omit<VisualAsset, "id">;

export type VisualAssetAssignment = {
  id: string;
  target: VisualAssetTargetRef;
  asset: VisualAsset;
};

export type VisualAssetDefinition = {
  type: VisualAssetType;
  category: VisualAssetCategory;
  assetKey: VisualAssetKey;
  label: string;
  description: string;
  variants: readonly string[];
  defaultScale: number;
  defaultRotation: number;
  defaultOpacity: number;
  defaultVisualZIndex: number;
  defaultRenderMode: VisualAssetRenderMode;
  aiFlags: VisualAssetAiFlags;
};

export const DEFAULT_VISUAL_ASSET_AI_FLAGS: VisualAssetAiFlags = {
  suggestable: false,
  replaceable: false,
  generatable: false,
  semanticTags: [],
};

export const DEFAULT_VISUAL_ASSET_TRANSFORM = {
  scale: 1,
  rotation: 0,
  opacity: 1,
  visualZIndex: 0,
  renderMode: "fill" satisfies VisualAssetRenderMode,
} as const;

export function createVisualAsset(draft: VisualAssetDraft): VisualAsset {
  return {
    id: `visual-asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
    aiFlags: {
      ...DEFAULT_VISUAL_ASSET_AI_FLAGS,
      ...draft.aiFlags,
      semanticTags: [...draft.aiFlags.semanticTags],
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOpacity(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_VISUAL_ASSET_TRANSFORM.opacity;
  return Math.max(0, Math.min(1, value));
}

function normalizeScale(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_VISUAL_ASSET_TRANSFORM.scale;
  }
  return value;
}

function normalizeRotation(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_VISUAL_ASSET_TRANSFORM.rotation;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function isVisualAssetType(value: unknown): value is VisualAssetType {
  return (
    value === "texture" ||
    value === "material" ||
    value === "object" ||
    value === "vegetation" ||
    value === "water" ||
    value === "furniture" ||
    value === "lighting"
  );
}

function isVisualAssetCategory(value: unknown): value is VisualAssetCategory {
  return (
    value === "surface" ||
    value === "structure" ||
    value === "vegetation" ||
    value === "water" ||
    value === "furniture" ||
    value === "exterior" ||
    value === "shade" ||
    value === "decor" ||
    value === "lighting"
  );
}

function isVisualAssetRenderMode(value: unknown): value is VisualAssetRenderMode {
  return (
    value === "fill" ||
    value === "tile" ||
    value === "cover" ||
    value === "contain" ||
    value === "stamp" ||
    value === "pattern"
  );
}

function normalizeAiFlags(value: unknown): VisualAssetAiFlags {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_VISUAL_ASSET_AI_FLAGS;
  }

  const input = value as Partial<VisualAssetAiFlags>;
  const semanticTags = Array.isArray(input.semanticTags)
    ? input.semanticTags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    suggestable: input.suggestable === true,
    replaceable: input.replaceable === true,
    generatable: input.generatable === true,
    semanticTags,
  };
}

export function normalizeVisualAsset(raw: unknown): VisualAsset | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as Partial<VisualAsset>;

  if (typeof input.id !== "string" || input.id.trim() === "") return null;
  if (!isVisualAssetType(input.type)) return null;
  if (!isVisualAssetCategory(input.category)) return null;
  if (typeof input.assetKey !== "string" || input.assetKey.trim() === "") {
    return null;
  }

  return {
    id: input.id,
    type: input.type,
    category: input.category,
    assetKey: input.assetKey.trim(),
    ...(typeof input.variant === "string" && input.variant.trim() !== ""
      ? { variant: input.variant.trim() }
      : {}),
    scale: normalizeScale(input.scale),
    rotation: normalizeRotation(input.rotation),
    opacity: normalizeOpacity(input.opacity),
    visualZIndex: isFiniteNumber(input.visualZIndex)
      ? input.visualZIndex
      : DEFAULT_VISUAL_ASSET_TRANSFORM.visualZIndex,
    renderMode: isVisualAssetRenderMode(input.renderMode)
      ? input.renderMode
      : DEFAULT_VISUAL_ASSET_TRANSFORM.renderMode,
    aiFlags: normalizeAiFlags(input.aiFlags),
  };
}

export function normalizeVisualAssets(
  assets: readonly unknown[],
): VisualAsset[] {
  return assets.flatMap((asset) => {
    const normalized = normalizeVisualAsset(asset);
    return normalized ? [normalized] : [];
  });
}
