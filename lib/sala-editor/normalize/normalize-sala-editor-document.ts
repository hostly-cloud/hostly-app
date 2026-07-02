import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import { normalizeWallAttachments } from "@/lib/sala-editor/types/wall-attachment";

type NormalizableSalaEditorDocument = Omit<
  SalaEditorDocument,
  "wallAttachments"
> & {
  wallAttachments?: SalaWallAttachment[];
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
  const validWallIds = new Set(document.walls.map((wall) => wall.id));

  return {
    ...document,
    espacios: document.espacios.map(withNormalizedSalaEspacioBase),
    wallAttachments: normalizeWallAttachments(
      document.wallAttachments ?? [],
      validWallIds,
    ),
  };
}
