/**
 * Toolbox de Fase 2 — herramientas estructurales con copy de UX.
 */

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";

export type StructuralToolboxItem = {
  kind: SalaStructuralElementKind;
  label: string;
  icon: string;
  description: string;
  workspaceHint: string;
  upcomingActions: readonly string[];
  /** Solo herramientas disponibles son seleccionables en el panel. */
  available: boolean;
};

export const STRUCTURAL_TOOLBOX_ITEMS: readonly StructuralToolboxItem[] = [
  {
    kind: "wall",
    label: "Pared",
    icon: "⬛",
    description: "Divide espacios.",
    workspaceHint: "Haz clic sobre el plano para comenzar una pared.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: true,
  },
  {
    kind: "glass",
    label: "Cristal",
    icon: "🟦",
    description: "Separación transparente o mampara.",
    workspaceHint: "Haz clic para colocar un cristal.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: false,
  },
  {
    kind: "door",
    label: "Puerta",
    icon: "🚪",
    description: "Acceso entre espacios o al exterior.",
    workspaceHint: "Haz clic para colocar una puerta.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: false,
  },
  {
    kind: "bar",
    label: "Barra",
    icon: "▭",
    description: "Mostrador o barra de servicio.",
    workspaceHint: "Haz clic para crear una barra.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: false,
  },
  {
    kind: "planter",
    label: "Jardinera",
    icon: "🌿",
    description: "Macizo o separador vegetal.",
    workspaceHint: "Haz clic para colocar una jardinera.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: false,
  },
  {
    kind: "separator",
    label: "Separador",
    icon: "⬜",
    description: "Delimitación ligera entre zonas.",
    workspaceHint: "Haz clic para colocar un separador.",
    upcomingActions: ["Dibujar", "Duplicar", "Girar", "Bloquear"],
    available: false,
  },
] as const;

export const AVAILABLE_STRUCTURAL_TOOLBOX_ITEMS = STRUCTURAL_TOOLBOX_ITEMS.filter(
  (item) => item.available,
);

export const UPCOMING_STRUCTURAL_TOOLBOX_ITEMS = STRUCTURAL_TOOLBOX_ITEMS.filter(
  (item) => !item.available,
);

export function getStructuralToolboxItem(
  kind: SalaStructuralElementKind,
): StructuralToolboxItem | undefined {
  return STRUCTURAL_TOOLBOX_ITEMS.find((item) => item.kind === kind);
}

export function getDefaultStructuralToolboxItem(): StructuralToolboxItem {
  return STRUCTURAL_TOOLBOX_ITEMS[0]!;
}
