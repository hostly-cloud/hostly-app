/**
 * Biblioteca escalable del Editor Sala V2.
 * Contrato de categorías e ítems por fase (Base, Estructura, Operación).
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";
import type { ZoneType } from "@/lib/sala-editor/zones/zone";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";

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
  /** Enlace opcional a herramienta estructural existente. */
  structuralKind?: SalaStructuralElementKind;
  /** Enlace opcional a tipo operativo OSE existente. */
  operationalType?: OperationalElementType;
  /** Enlace opcional a herramienta Landscape propia. */
  landscapeKind?: LandscapeElementKind;
  /** Enlace opcional a tipo de zona funcional. */
  zoneType?: ZoneType;
  /** Variante visual ligera (p. ej. mesa redonda sobre TABLE). */
  visualVariant?: OperationalVisualVariant;
  /** Identificador futuro de herramienta Base. */
  baseToolId?: string;
  /** Material de superficie para la fase Terreno. */
  surfaceMaterial?: SurfaceMaterialKind;
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
  landscapeKind?: LandscapeElementKind | null;
  zoneType?: ZoneType | null;
  visualVariant?: OperationalVisualVariant | null;
  baseToolId?: string | null;
  surfaceMaterial?: SurfaceMaterialKind | null;
};
