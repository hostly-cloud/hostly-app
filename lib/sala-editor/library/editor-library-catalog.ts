/**
 * Catálogo canónico de la biblioteca del Editor Sala V2.
 * Solo definición de producto; sin persistencia ni lógica de canvas.
 */

import type {
  SalaEditorLibraryCategory,
  SalaEditorLibraryPhase,
} from "@/lib/sala-editor/library/types";
import { SURFACE_MATERIAL_CATALOG } from "@/lib/sala-editor/surface/surface-material-catalog";

const BASE_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  {
    id: "suelos",
    label: "Suelos",
    icon: "🟫",
    upcoming: true,
    items: [],
  },
  {
    id: "materiales",
    label: "Materiales",
    icon: "🧱",
    upcoming: true,
    items: [],
  },
  {
    id: "formas",
    label: "Formas",
    icon: "▢",
    upcoming: true,
    items: [],
  },
] as const;

const ESTRUCTURA_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  {
    id: "muros",
    label: "Muros",
    icon: "🧱",
    items: [
      {
        id: "pared",
        label: "Pared",
        status: "available",
        structuralKind: "wall",
      },
    ],
  },
  {
    id: "puertas",
    label: "Puertas",
    icon: "🚪",
    items: [
      {
        id: "puerta-simple",
        label: "Puerta simple",
        status: "available",
        structuralKind: "door",
      },
      {
        id: "puerta-doble",
        label: "Puerta doble",
        status: "upcoming",
        structuralKind: "door",
      },
      {
        id: "puerta-corredera",
        label: "Puerta corredera",
        status: "upcoming",
        structuralKind: "door",
      },
    ],
  },
  {
    id: "cristales",
    label: "Cristales",
    icon: "🪟",
    items: [
      {
        id: "cristal-fijo",
        label: "Cristal fijo",
        status: "available",
        structuralKind: "glass",
      },
      {
        id: "cristal-corredero",
        label: "Cristal corredero",
        status: "upcoming",
        structuralKind: "glass",
      },
      {
        id: "mampara",
        label: "Mampara",
        status: "upcoming",
        structuralKind: "glass",
      },
    ],
  },
  {
    id: "columnas",
    label: "Columnas",
    icon: "🏛",
    upcoming: true,
    items: [],
  },
  {
    id: "barras-fijas",
    label: "Barras fijas",
    icon: "▭",
    upcoming: true,
    items: [],
  },
  {
    id: "jardineria",
    label: "Jardinería",
    icon: "🌿",
    upcoming: true,
    items: [],
  },
  {
    id: "separadores",
    label: "Separadores",
    icon: "⬜",
    upcoming: true,
    items: [],
  },
  {
    id: "piscinas",
    label: "Piscinas",
    icon: "💧",
    upcoming: true,
    items: [],
  },
  {
    id: "escaleras",
    label: "Escaleras",
    icon: "🪜",
    upcoming: true,
    items: [],
  },
] as const;

const TERRENO_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  {
    id: "superficies",
    label: "Superficies",
    icon: "◼",
    items: SURFACE_MATERIAL_CATALOG.map((material) => ({
      id: `surface-${material.kind}`,
      label: material.label,
      status: "available",
      surfaceMaterial: material.kind,
    })),
  },
] as const;

const OPERACION_LIBRARY_CATEGORIES: readonly SalaEditorLibraryCategory[] = [
  {
    id: "mesas",
    label: "Mesas",
    icon: "🍽",
    items: [
      {
        id: "mesa-redonda",
        label: "Mesa redonda",
        status: "available",
        operationalType: "TABLE",
        visualVariant: "round",
      },
      {
        id: "mesa-cuadrada",
        label: "Mesa cuadrada",
        status: "available",
        operationalType: "TABLE",
        visualVariant: "square",
      },
      {
        id: "mesa-rectangular",
        label: "Mesa rectangular",
        status: "available",
        operationalType: "TABLE",
        visualVariant: "rectangular",
      },
    ],
  },
  {
    id: "asientos",
    label: "Asientos",
    icon: "🪑",
    upcoming: true,
    items: [],
  },
  {
    id: "barras",
    label: "Barras",
    icon: "🍸",
    upcoming: true,
    items: [],
  },
  {
    id: "servicio",
    label: "Servicio",
    icon: "🛎",
    upcoming: true,
    items: [],
  },
  {
    id: "exterior",
    label: "Exterior",
    icon: "☀",
    upcoming: true,
    items: [],
  },
  {
    id: "beach-club",
    label: "Beach Club",
    icon: "🏖",
    upcoming: true,
    items: [],
  },
  {
    id: "decoracion",
    label: "Decoración",
    icon: "✨",
    upcoming: true,
    items: [],
  },
  {
    id: "personalizados",
    label: "Personalizados",
    icon: "⚙",
    upcoming: true,
    items: [],
  },
] as const;

const LIBRARY_BY_PHASE: Record<
  SalaEditorLibraryPhase,
  readonly SalaEditorLibraryCategory[]
> = {
  base: BASE_LIBRARY_CATEGORIES,
  terreno: TERRENO_LIBRARY_CATEGORIES,
  estructura: ESTRUCTURA_LIBRARY_CATEGORIES,
  operacion: OPERACION_LIBRARY_CATEGORIES,
};

export function getSalaEditorLibraryCategories(
  phase: SalaEditorLibraryPhase,
): readonly SalaEditorLibraryCategory[] {
  return LIBRARY_BY_PHASE[phase];
}

export function countAvailableLibraryItems(
  category: SalaEditorLibraryCategory,
): number {
  if (category.upcoming) return 0;
  return category.items.filter((item) => item.status === "available").length;
}

export function getDefaultExpandedLibraryCategoryId(
  categories: readonly SalaEditorLibraryCategory[],
): string | null {
  const firstWithTools = categories.find(
    (category) => !category.upcoming && countAvailableLibraryItems(category) > 0,
  );
  if (firstWithTools) return firstWithTools.id;
  return categories[0]?.id ?? null;
}
