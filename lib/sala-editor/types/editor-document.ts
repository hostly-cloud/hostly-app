/**
 * Documento de trabajo del editor de sala (memoria local / borrador).
 * Contrato objetivo para Fases 2–3 del roadmap; no persiste en Firestore aún.
 */

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaOperationalElement } from "@/lib/sala-editor/types/elementos-operativos";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObject } from "@/lib/sala-editor/surface/surface-object";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import { createDefaultSalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";

export const SALA_EDITOR_DOCUMENT_VERSION = 1 as const;

export type SalaEditorDocument = {
  version: typeof SALA_EDITOR_DOCUMENT_VERSION;
  restaurantId: string;
  espacios: SalaEspacio[];
  /** Paredes dibujadas localmente (Fase 2.3). */
  walls: SalaWallSegment[];
  /** Elementos estructurales anclados a paredes; resuelven posición desde wallId + ratio. */
  wallAttachments: SalaWallAttachment[];
  /** Superficies de Terreno dibujadas localmente. */
  surfaceObjects: SurfaceObject[];
  structuralElements: SalaStructuralElement[];
  operationalElements: SalaOperationalElement[];
  /** Instancias OSE colocadas localmente (Fase 2). */
  operationalElementInstances: OperationalElementInstance[];
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
    walls: [],
    wallAttachments: [],
    surfaceObjects: [],
    structuralElements: [],
    operationalElements: [],
    operationalElementInstances: [],
    navigation: createDefaultSalaEditorNavigation(),
    updatedAt: Date.now(),
  };
}
