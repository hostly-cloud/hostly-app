/**
 * Catálogo de elementos estructurales (Fase 2) para toolbox futuro.
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";

export type SalaStructuralCatalogItem = {
  kind: SalaStructuralElementKind;
  label: string;
  description: string;
  defaultSize: { width: number; height: number };
};

export const SALA_STRUCTURAL_CATALOG: readonly SalaStructuralCatalogItem[] = [
  {
    kind: "wall",
    label: "Pared",
    description: "Límite o tabique del mapa.",
    defaultSize: { width: 280, height: 12 },
  },
  {
    kind: "glass",
    label: "Cristal",
    description: "Separación transparente o mampara.",
    defaultSize: { width: 200, height: 12 },
  },
  {
    kind: "door",
    label: "Puerta",
    description: "Acceso dentro del mapa o al exterior.",
    defaultSize: { width: 36, height: 112 },
  },
  {
    kind: "bar",
    label: "Barra",
    description: "Mostrador o barra de servicio.",
    defaultSize: { width: 200, height: 48 },
  },
  {
    kind: "stage",
    label: "Escenario",
    description: "Tarima, DJ o zona de actuación.",
    defaultSize: { width: 240, height: 120 },
  },
  {
    kind: "decoration",
    label: "Decoración",
    description: "Elemento ambiental no operativo.",
    defaultSize: { width: 80, height: 80 },
  },
  {
    kind: "planter",
    label: "Jardinera",
    description: "Macizo o separador vegetal.",
    defaultSize: { width: 168, height: 44 },
  },
  {
    kind: "separator",
    label: "Separador",
    description: "Delimitación ligera entre zonas.",
    defaultSize: { width: 160, height: 8 },
  },
] as const;

export function getStructuralCatalogItem(
  kind: SalaStructuralElementKind,
): SalaStructuralCatalogItem | undefined {
  return SALA_STRUCTURAL_CATALOG.find((item) => item.kind === kind);
}
