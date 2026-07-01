/**
 * Documento de trabajo del editor de sala (memoria local / borrador).
 * Contrato objetivo para Fases 2–3 del roadmap; no persiste en Firestore aún.
 */

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaOperationalElement } from "@/lib/sala-editor/types/elementos-operativos";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import { createDefaultSalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";

export const SALA_EDITOR_DOCUMENT_VERSION = 1 as const;

export type SalaEditorDocument = {
  version: typeof SALA_EDITOR_DOCUMENT_VERSION;
  restaurantId: string;
  espacios: SalaEspacio[];
  structuralElements: SalaStructuralElement[];
  operationalElements: SalaOperationalElement[];
  navigation: SalaEditorNavigation;
  updatedAt: number;
};

export function createEmptySalaEditorDocument(
  restaurantId: string,
): SalaEditorDocument {
  const rid = restaurantId.trim();
  return {
    version: SALA_EDITOR_DOCUMENT_VERSION,
    restaurantId: rid,
    espacios: [],
    structuralElements: [],
    operationalElements: [],
    navigation: createDefaultSalaEditorNavigation(),
    updatedAt: Date.now(),
  };
}
