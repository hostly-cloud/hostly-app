import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

/** Inspector visible solo cuando hay selección real (no catálogo/herramienta activa). */
export function hasSalaEditorInspectorSelection(params: {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  selectedWall: SalaWallSegment | null;
  selectedOperationalElementInstance: OperationalElementInstance | null;
}): boolean {
  const { phase, espacio, selectedWall, selectedOperationalElementInstance } = params;

  if (phase === "espacios") return espacio != null;
  if (phase === "estructura") return false;
  if (phase === "operacion") return false;
  return false;
}
