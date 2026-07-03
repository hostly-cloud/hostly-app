import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import { normalizeWallAttachments } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObject } from "@/lib/sala-editor/surface/surface-object";
import { normalizeSurfaceObjects } from "@/lib/sala-editor/surface/surface-object";
import type { SalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import { normalizeSalaStructuralElements } from "@/lib/sala-editor/types/elementos-estructurales";

type NormalizableSalaEditorDocument = Omit<
  SalaEditorDocument,
  "wallAttachments" | "surfaceObjects" | "structuralElements"
> & {
  wallAttachments?: SalaWallAttachment[];
  surfaceObjects?: SurfaceObject[];
  structuralElements?: SalaStructuralElement[];
};

export function withNormalizedSalaEspacioBase(espacio: SalaEspacio): SalaEspacio {
  return {
    ...espacio,
    base: normalizeSalaEspacioBase(espacio.base),
  };
}

/** Garantiza base mínima en todos los mapas del documento sin alterar el resto. */
export function normalizeSalaEditorDocument(
  document: NormalizableSalaEditorDocument,
): SalaEditorDocument {
  const validEspacioIds = new Set(document.espacios.map((espacio) => espacio.id));
  const validWallIds = new Set(document.walls.map((wall) => wall.id));

  return {
    ...document,
    espacios: document.espacios.map(withNormalizedSalaEspacioBase),
    surfaceObjects: normalizeSurfaceObjects(
      document.surfaceObjects ?? [],
      validEspacioIds,
    ),
    structuralElements: normalizeSalaStructuralElements(
      document.structuralElements ?? [],
      validEspacioIds,
    ),
    wallAttachments: normalizeWallAttachments(
      document.wallAttachments ?? [],
      validWallIds,
    ),
  };
}
