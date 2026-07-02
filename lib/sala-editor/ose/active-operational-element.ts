/**
 * Selección de tipo operativo activo en el editor (catálogo, sin colocación).
 */

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";

export type ActiveOperationalElement = {
  layer: "operacion";
  type: OperationalElementType;
  visualVariant?: OperationalVisualVariant;
};

export type ActiveOperationalElementSelection = ActiveOperationalElement | null;

export const DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE: OperationalElementType =
  "TABLE";

export function createActiveOperationalElement(
  type: OperationalElementType,
  visualVariant?: OperationalVisualVariant,
): ActiveOperationalElement {
  return {
    layer: "operacion",
    type,
    ...(visualVariant ? { visualVariant } : {}),
  };
}

export function isOperationalElementTypeSelected(
  active: ActiveOperationalElementSelection,
  type: OperationalElementType,
  visualVariant?: OperationalVisualVariant,
): boolean {
  if (active?.layer !== "operacion" || active.type !== type) return false;
  if (visualVariant != null) return active.visualVariant === visualVariant;
  return active.visualVariant == null;
}
