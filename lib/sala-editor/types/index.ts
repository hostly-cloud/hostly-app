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
export type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
export {
  SALA_EDITOR_DOCUMENT_VERSION,
  createEmptySalaEditorDocument,
} from "@/lib/sala-editor/types/editor-document";
