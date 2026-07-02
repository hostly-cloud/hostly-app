/**
 * Biblioteca escalable del Editor Sala V2.
 * Contrato de categorías e ítems por fase (Base, Estructura, Operación).
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";

export type SalaEditorLibraryPhase = "base" | "estructura" | "operacion";

export type SalaEditorLibraryItemStatus = "available" | "upcoming";

export type SalaEditorLibraryItem = {
  id: string;
  label: string;
  status: SalaEditorLibraryItemStatus;
  /** Enlace opcional a herramienta estructural existente. */
  structuralKind?: SalaStructuralElementKind;
  /** Enlace opcional a tipo operativo OSE existente. */
  operationalType?: OperationalElementType;
  /** Identificador futuro de herramienta Base. */
  baseToolId?: string;
};

export type SalaEditorLibraryCategory = {
  id: string;
  label: string;
  icon: string;
  items: readonly SalaEditorLibraryItem[];
  /** Categoría completa aún no disponible. */
  upcoming?: boolean;
};

export type SalaEditorLibrarySelection = {
  structuralKind?: SalaStructuralElementKind | null;
  operationalType?: OperationalElementType | null;
  baseToolId?: string | null;
};
