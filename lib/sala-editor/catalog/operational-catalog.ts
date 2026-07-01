/**
 * Catálogo de elementos operativos (Fase 3) para toolbox futuro.
 */

import type { SalaOperationalElementKind } from "@/lib/sala-editor/types/elementos-operativos";

export type SalaOperationalCatalogItem = {
  kind: SalaOperationalElementKind;
  label: string;
  description: string;
  defaultSize: { width: number; height: number };
  defaultSeats?: number;
};

export const SALA_OPERATIONAL_CATALOG: readonly SalaOperationalCatalogItem[] = [
  {
    kind: "table",
    label: "Mesa",
    description: "Mesa estándar de servicio.",
    defaultSize: { width: 116, height: 76 },
    defaultSeats: 4,
  },
  {
    kind: "high-table",
    label: "Mesa alta",
    description: "Mesa de bar o cocktail.",
    defaultSize: { width: 72, height: 72 },
    defaultSeats: 2,
  },
  {
    kind: "sofa",
    label: "Sofá",
    description: "Asiento lounge o chill-out.",
    defaultSize: { width: 180, height: 90 },
    defaultSeats: 4,
  },
  {
    kind: "sunbed",
    label: "Hamaca",
    description: "Tumbona o sunbed de playa/piscina.",
    defaultSize: { width: 200, height: 52 },
    defaultSeats: 2,
  },
  {
    kind: "balinese-bed",
    label: "Cama balinesa",
    description: "Cama exterior o daybed.",
    defaultSize: { width: 160, height: 110 },
    defaultSeats: 4,
  },
  {
    kind: "stool",
    label: "Taburete",
    description: "Asiento alto individual.",
    defaultSize: { width: 44, height: 44 },
    defaultSeats: 1,
  },
  {
    kind: "chair",
    label: "Silla",
    description: "Asiento suelto configurable.",
    defaultSize: { width: 40, height: 40 },
    defaultSeats: 1,
  },
  {
    kind: "custom",
    label: "Elemento personalizado",
    description: "Superficie o elemento a medida.",
    defaultSize: { width: 116, height: 76 },
  },
] as const;

export function getOperationalCatalogItem(
  kind: SalaOperationalElementKind,
): SalaOperationalCatalogItem | undefined {
  return SALA_OPERATIONAL_CATALOG.find((item) => item.kind === kind);
}
