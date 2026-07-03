export type {
  SalaEspacio,
  SalaEspacioDraft,
  SalaEspacioId,
} from "@/lib/sala-editor/types/espacio";
export {
  DEFAULT_SALA_ESPACIO_COLOR,
  createDefaultSalaEspacioDraft,
  sortSalaEspacios,
} from "@/lib/sala-editor/types/espacio";

export type {
  SalaEspacioBase,
  SalaEspacioBaseDimensions,
  SalaEspacioBaseFloor,
  SalaEspacioBaseGrid,
  SalaEspacioBaseOrientation,
  SalaEspacioBaseScale,
  SalaEspacioBaseShapeType,
  SalaEspacioBaseStatus,
  SalaEspacioBaseUnit,
} from "@/lib/sala-editor/types/espacio-base";
export {
  DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS,
  DEFAULT_SALA_ESPACIO_BASE_FLOOR,
  DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE,
  DEFAULT_SALA_ESPACIO_BASE_SCALE,
  SALA_ESPACIO_BASE_FLOOR_LABELS,
  SALA_ESPACIO_BASE_SHAPE_LABELS,
  SALA_ESPACIO_BASE_STATUS_LABELS,
  createDefaultSalaEspacioBase,
  createSalaEspacioBaseFromCanvasSize,
  normalizeSalaEspacioBase,
} from "@/lib/sala-editor/types/espacio-base";

export type {
  SalaStructuralElement,
  SalaStructuralElementConfig,
  SalaStructuralElementId,
  SalaStructuralElementKind,
} from "@/lib/sala-editor/types/elementos-estructurales";

export type {
  SalaOperationalElement,
  SalaOperationalElementConfig,
  SalaOperationalElementId,
  SalaOperationalElementKind,
} from "@/lib/sala-editor/types/elementos-operativos";

export type {
  SalaEditorNavigation,
  SalaEditorPhase,
} from "@/lib/sala-editor/types/editor-navigation";
export {
  SALA_EDITOR_PHASE_DESCRIPTIONS,
  SALA_EDITOR_PHASE_LABELS,
  SALA_EDITOR_PHASE_ORDER,
  SALA_EDITOR_VISIBLE_PHASE_ORDER,
  createDefaultSalaEditorNavigation,
} from "@/lib/sala-editor/types/editor-navigation";

export type {
  SalaEditorActiveTool,
  SalaStructuralActiveTool,
} from "@/lib/sala-editor/types/editor-tool";
export {
  createStructuralActiveTool,
  DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND,
  isStructuralToolActive,
  isToolSelected,
} from "@/lib/sala-editor/types/editor-tool";
export type {
  SalaWallSegment,
  SalaWallSegmentDraft,
  SalaWallSegmentId,
} from "@/lib/sala-editor/types/wall-segment";
export { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
export type {
  SalaWallAttachment,
  SalaWallAttachmentDraft,
  SalaWallAttachmentId,
  SalaWallAttachmentKind,
  SalaWallAttachmentOffset,
} from "@/lib/sala-editor/types/wall-attachment";
export {
  clampWallAttachmentPosition,
  createSalaWallAttachment,
  normalizeWallAttachment,
  normalizeWallAttachments,
  removeWallAttachmentsForWall,
} from "@/lib/sala-editor/types/wall-attachment";
export type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
export {
  SALA_EDITOR_DOCUMENT_VERSION,
  createEmptySalaEditorDocument,
} from "@/lib/sala-editor/types/editor-document";
