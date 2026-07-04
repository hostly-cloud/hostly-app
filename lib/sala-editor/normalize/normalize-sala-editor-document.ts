import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import { normalizeWallAttachments } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObject } from "@/lib/sala-editor/surface/surface-object";
import { normalizeSurfaceObjects } from "@/lib/sala-editor/surface/surface-object";
import type { SalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import { normalizeSalaStructuralElements } from "@/lib/sala-editor/types/elementos-estructurales";
import type { LandscapeElement } from "@/lib/sala-editor/landscape/landscape-element";
import { normalizeLandscapeElements } from "@/lib/sala-editor/landscape/landscape-element";
import type { Zone } from "@/lib/sala-editor/zones/zone";
import { normalizeZones } from "@/lib/sala-editor/zones/zone";

type NormalizableSalaEditorDocument = Omit<
  SalaEditorDocument,
  "wallAttachments" | "surfaceObjects" | "structuralElements" | "landscapeElements"
  | "zones"
> & {
  wallAttachments?: SalaWallAttachment[];
  surfaceObjects?: SurfaceObject[];
  zones?: Zone[];
  structuralElements?: SalaStructuralElement[];
  landscapeElements?: LandscapeElement[];
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
    zones: normalizeZones(document.zones ?? [], validEspacioIds),
    structuralElements: normalizeSalaStructuralElements(
      document.structuralElements ?? [],
      validEspacioIds,
    ),
    landscapeElements: normalizeLandscapeElements(
      document.landscapeElements ?? [],
      validEspacioIds,
    ),
    wallAttachments: normalizeWallAttachments(
      document.wallAttachments ?? [],
      validWallIds,
    ),
  };
}
