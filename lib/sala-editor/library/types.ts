/**
 * Biblioteca escalable del Editor Sala V2.
 * Contrato de categorías e ítems por fase (Base, Estructura, Operación).
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";
import type { ZoneType } from "@/lib/sala-editor/zones/zone";
import type { SurfaceMaterialKind, SurfaceShapeKind } from "@/lib/sala-editor/surface/surface-object";
import type { SalaWallPreset } from "@/lib/sala-editor/walls/wall-presets";

export type SalaEditorLibraryPhase =
  | "base"
  | "zonas"
  | "terreno"
  | "estructura"
  | "paisajismo"
  | "operacion";

export type SalaEditorLibraryItemStatus = "available" | "upcoming";

export type SalaEditorLibraryItem = {
  id: string;
  label: string;
  status: SalaEditorLibraryItemStatus;
  structuralKind?: SalaStructuralElementKind;
  operationalType?: OperationalElementType;
  landscapeKind?: LandscapeElementKind;
  zoneType?: ZoneType;
  visualVariant?: OperationalVisualVariant;
  baseToolId?: string;
  surfaceMaterial?: SurfaceMaterialKind;
  /** Variante geométrica para paredes compuestas. */
  wallPreset?: SalaWallPreset;
  /** Variante geométrica de una superficie de terreno. */
  surfaceShape?: SurfaceShapeKind;
};

export type SalaEditorLibraryCategory = {
  id: string;
  label: string;
  icon: string;
  items: readonly SalaEditorLibraryItem[];
  upcoming?: boolean;
};

export type SalaEditorLibrarySelection = {
  structuralKind?: SalaStructuralElementKind | null;
  operationalType?: OperationalElementType | null;
  landscapeKind?: LandscapeElementKind | null;
  zoneType?: ZoneType | null;
  visualVariant?: OperationalVisualVariant | null;
  baseToolId?: string | null;
  surfaceMaterial?: SurfaceMaterialKind | null;
  wallPreset?: SalaWallPreset | null;
  surfaceShape?: SurfaceShapeKind | null;
};
