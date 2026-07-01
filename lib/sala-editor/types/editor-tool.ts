/**
 * Herramienta activa del editor V2 (memoria local).
 * Una sola herramienta activa en todo momento.
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";

export type SalaStructuralActiveTool = {
  layer: "estructura";
  kind: SalaStructuralElementKind;
};

/** Herramienta activa; null si ninguna seleccionada. */
export type SalaEditorActiveTool = SalaStructuralActiveTool | null;

export function createStructuralActiveTool(
  kind: SalaStructuralElementKind,
): SalaStructuralActiveTool {
  return { layer: "estructura", kind };
}

export function isStructuralToolActive(
  activeTool: SalaEditorActiveTool,
  kind: SalaStructuralElementKind,
): boolean {
  return activeTool?.layer === "estructura" && activeTool.kind === kind;
}

export function isToolSelected(
  activeTool: SalaEditorActiveTool,
  kind: SalaStructuralElementKind,
): boolean {
  return isStructuralToolActive(activeTool, kind);
}

export const DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND: SalaStructuralElementKind =
  "wall";
