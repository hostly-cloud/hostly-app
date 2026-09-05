/** Catálogo canónico de la biblioteca del Editor Sala V2. */
import type { SalaEditorLibraryCategory, SalaEditorLibraryPhase } from "@/lib/sala-editor/library/types";
import { SURFACE_MATERIAL_CATALOG } from "@/lib/sala-editor/surface/surface-material-catalog";
import { LANDSCAPE_TOOLBOX_ITEMS } from "@/lib/sala-editor/catalog/landscape-toolbox";
import { ZONE_CATALOG } from "@/lib/sala-editor/zones/zone-catalog";
import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";

const BASE_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "suelos", label: "Suelos", icon: "🟫", upcoming: true, items: [] },
  { id: "materiales", label: "Materiales", icon: "🧱", upcoming: true, items: [] },
  { id: "formas", label: "Formas", icon: "▢", upcoming: true, items: [] },
] as const;

const ESTRUCTURA_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "muros", label: "Paredes", icon: "🧱", items: [
    { id: "pared-libre", label: "Pared libre", status: "available", structuralKind: "wall", wallPreset: "free" },
    { id: "pared-horizontal", label: "Horizontal", status: "available", structuralKind: "wall", wallPreset: "horizontal" },
    { id: "pared-vertical", label: "Vertical", status: "available", structuralKind: "wall", wallPreset: "vertical" },
    { id: "pared-esquina", label: "Esquina 90°", status: "available", structuralKind: "wall", wallPreset: "corner" },
    { id: "pared-u", label: "Pared en U", status: "available", structuralKind: "wall", wallPreset: "u-shape" },
    { id: "pared-curva", label: "Pared curva", status: "available", structuralKind: "wall", wallPreset: "arc" },
  ] },
  { id: "puertas", label: "Puertas", icon: "🚪", items: [
    { id: "puerta-simple", label: "Puerta simple", status: "available", structuralKind: "door" },
    { id: "puerta-doble", label: "Puerta doble", status: "upcoming", structuralKind: "door" },
    { id: "puerta-corredera", label: "Puerta corredera", status: "upcoming", structuralKind: "door" },
  ] },
  { id: "cristales", label: "Cristales", icon: "🪟", items: [
    { id: "cristal-fijo", label: "Cristal fijo", status: "available", structuralKind: "glass" },
    { id: "cristal-corredero", label: "Cristal corredero", status: "upcoming", structuralKind: "glass" },
    { id: "mampara", label: "Mampara", status: "upcoming", structuralKind: "glass" },
  ] },
  { id: "columnas", label: "Columnas", icon: "🏛", items: [
    { id: "columna-cuadrada", label: "Columna cuadrada", status: "available", structuralKind: "squareColumn" },
    { id: "columna-circular", label: "Columna circular", status: "available", structuralKind: "roundColumn" },
  ] },
  { id: "separadores", label: "Separadores", icon: "⬜", items: [{ id: "separador-fijo", label: "Separador fijo", status: "available", structuralKind: "divider" }] },
] as const;

const TERRENO_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "superficies", label: "Material", icon: "◼", items: SURFACE_MATERIAL_CATALOG.map((material) => ({
    id: `surface-${material.kind}`, label: material.label, status: "available" as const, surfaceMaterial: material.kind,
  })) },
  { id: "formas-superficie", label: "Forma", icon: "◯", items: [
    { id: "shape-rectangle", label: "Rectangular", status: "available", surfaceShape: "rectangle" },
    { id: "shape-rounded", label: "Redondeada", status: "available", surfaceShape: "rounded" },
    { id: "shape-ellipse", label: "Circular / ovalada", status: "available", surfaceShape: "ellipse" },
    { id: "shape-organic", label: "Orgánica / irregular", status: "available", surfaceShape: "organic" },
  ] },
] as const;

const ZONAS_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "zone-catalog", label: "Zonas del local", icon: "◫", items: ZONE_CATALOG.map((zone) => ({ id: `zone-${zone.type}`, label: zone.label, status: "available" as const, zoneType: zone.type })) },
] as const;

function landscapeItems(kinds: readonly LandscapeElementKind[]) {
  return LANDSCAPE_TOOLBOX_ITEMS.filter((item) => kinds.includes(item.kind)).map((item) => ({
    id: `landscape-${item.kind}`,
    label: item.label,
    status: "available" as const,
    landscapeKind: item.kind,
  }));
}

const PAISAJISMO_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "arboles", label: "Árboles", icon: "🌳", items: landscapeItems(["palm", "olive", "tree"]) },
  { id: "vegetacion", label: "Vegetación", icon: "🌿", items: landscapeItems(["shrub", "hedge", "flowers"]) },
  { id: "jardineras", label: "Jardineras", icon: "🪴", items: landscapeItems(["rectangularPlanter", "roundPlanter"]) },
  { id: "exterior", label: "Exterior", icon: "⛲", items: landscapeItems(["rock", "fountain"]) },
] as const;

const OPERACION_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  { id: "mesas", label: "Mesas", icon: "🍽", items: [
    { id: "mesa-redonda", label: "Mesa redonda", status: "available", operationalType: "TABLE", visualVariant: "round" },
    { id: "mesa-cuadrada", label: "Mesa cuadrada", status: "available", operationalType: "TABLE", visualVariant: "square" },
    { id: "mesa-rectangular", label: "Mesa rectangular", status: "available", operationalType: "TABLE", visualVariant: "rectangular" },
  ] },
  { id: "asientos", label: "Asientos", icon: "🪑", upcoming: true, items: [] },
  { id: "barras", label: "Barras", icon: "🍸", items: [
    { id: "barra-recta", label: "Barra recta", status: "available", operationalType: "BAR_STRAIGHT" },
    { id: "barra-l", label: "Barra en L", status: "available", operationalType: "BAR_L" },
    { id: "barra-u", label: "Barra en U", status: "upcoming" },
    { id: "barra-curva", label: "Barra curva", status: "upcoming" },
    { id: "isla-central", label: "Isla central", status: "upcoming" },
  ] },
  { id: "servicio", label: "Puntos de servicio", icon: "🛎", items: [
    { id: "recepcion", label: "Recepción", status: "available", operationalType: "RECEPTION" },
    { id: "estacion-camareros", label: "Estación de camareros", status: "available", operationalType: "WAITER_STATION" },
    { id: "punto-recogida", label: "Punto de recogida", status: "available", operationalType: "PICKUP_POINT" },
  ] },
] as const;

const LIBRARY_BY_PHASE: Record<SalaEditorLibraryPhase, readonly SalaEditorLibraryCategory[]> = {
  base: BASE_LIBRARY_CATEGORIES,
  zonas: ZONAS_LIBRARY_CATEGORIES,
  terreno: TERRENO_LIBRARY_CATEGORIES,
  estructura: ESTRUCTURA_LIBRARY_CATEGORIES,
  paisajismo: PAISAJISMO_LIBRARY_CATEGORIES,
  operacion: OPERACION_LIBRARY_CATEGORIES,
};

export function getSalaEditorLibraryCategories(phase: SalaEditorLibraryPhase): readonly SalaEditorLibraryCategory[] { return LIBRARY_BY_PHASE[phase]; }
export function countAvailableLibraryItems(category: SalaEditorLibraryCategory): number { return category.upcoming ? 0 : category.items.filter((item) => item.status === "available").length; }
export function getDefaultExpandedLibraryCategoryId(categories: readonly SalaEditorLibraryCategory[]): string | null {
  return categories.find((category) => !category.upcoming && countAvailableLibraryItems(category) > 0)?.id ?? categories[0]?.id ?? null;
}
