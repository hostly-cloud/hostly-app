import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";

export function withNormalizedSalaEspacioBase(espacio: SalaEspacio): SalaEspacio {
  return {
    ...espacio,
    base: normalizeSalaEspacioBase(espacio.base),
  };
}

/** Garantiza base mínima en todos los mapas del documento sin alterar el resto. */
export function normalizeSalaEditorDocument(
  document: SalaEditorDocument,
): SalaEditorDocument {
  return {
    ...document,
    espacios: document.espacios.map(withNormalizedSalaEspacioBase),
  };
}
