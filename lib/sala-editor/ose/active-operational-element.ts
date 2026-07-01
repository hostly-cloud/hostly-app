/**
 * Selección de tipo operativo activo en el editor (catálogo, sin colocación).
 */

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";

export type ActiveOperationalElement = {
  layer: "operacion";
  type: OperationalElementType;
};

export type ActiveOperationalElementSelection = ActiveOperationalElement | null;

export const DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE: OperationalElementType =
  "TABLE";

export function createActiveOperationalElement(
  type: OperationalElementType,
): ActiveOperationalElement {
  return { layer: "operacion", type };
}

export function isOperationalElementTypeSelected(
  active: ActiveOperationalElementSelection,
  type: OperationalElementType,
): boolean {
  return active?.layer === "operacion" && active.type === type;
}
