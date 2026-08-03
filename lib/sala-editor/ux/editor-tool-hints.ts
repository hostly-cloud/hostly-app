import type { CSSProperties } from "react";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";
import { getSurfaceMaterialCatalogItem } from "@/lib/sala-editor/surface/surface-material-catalog";

export type EditorToolCursor = NonNullable<CSSProperties["cursor"]>;

export type EditorToolHintState =
  | "idle"
  | "drawing"
  | "dragging"
  | "resizing"
  | "blocked";

export type EditorToolHintProfile = {
  icon: string;
  cursor: EditorToolCursor;
  idleHint: string;
  drawingHint?: string;
  draggingHint?: string;
  resizingHint?: string;
  blockedHint?: string;
};

export type ResolvedEditorToolHint = {
  icon: string;
  text: string;
  cursor: EditorToolCursor;
};

const STRUCTURAL_TOOL_HINTS: Record<
  SalaStructuralElementKind,
  EditorToolHintProfile
> = {
  wall: {
    icon: "🧱",
    cursor: "crosshair",
    idleHint: "Haz clic para fijar el inicio del muro.",
    drawingHint: "Muro iniciado. Mueve el cursor y haz otro clic para terminar.",
  },
  door: {
    icon: "🚪",
    cursor: "crosshair",
    idleHint: "Haz clic sobre un muro para colocar una puerta.",
    blockedHint: "No cabe en este hueco.",
  },
  glass: {
    icon: "🪟",
    cursor: "crosshair",
    idleHint: "Haz clic sobre un muro para colocar un cristal.",
    blockedHint: "No cabe en este hueco.",
  },
  squareColumn: {
    icon: "■",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar una columna cuadrada.",
    draggingHint: "Suelta para fijar la columna.",
    resizingHint: "Suelta para confirmar el tamaño.",
  },
  roundColumn: {
    icon: "●",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar una columna circular.",
    draggingHint: "Suelta para fijar la columna.",
    resizingHint: "Suelta para confirmar el tamaño.",
  },
  divider: {
    icon: "▭",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar un separador fijo.",
    draggingHint: "Suelta para fijar el separador.",
    resizingHint: "Suelta para confirmar el tamaño.",
  },
  bar: {
    icon: "▭",
    cursor: "crosshair",
    idleHint: "Haz clic para crear una barra.",
  },
  stage: {
    icon: "🎭",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar un escenario.",
  },
  decoration: {
    icon: "✨",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar un elemento decorativo.",
  },
  planter: {
    icon: "🌿",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar una jardinera.",
  },
  separator: {
    icon: "⬜",
    cursor: "crosshair",
    idleHint: "Haz clic para colocar un separador.",
  },
};

export const EDITOR_INTERACTION_HINTS = {
  surfaceDrawing: "Suelta para crear la superficie.",
  surfaceDragging: "Suelta para fijar la posición.",
  surfaceResizing: "Suelta para confirmar el tamaño.",
  operationalDragging: "Suelta para fijar.",
  operationalResizing: "Suelta para confirmar el tamaño.",
  wallDrawingCancel: "Esc cancela el trazo.",
} as const;

export function resolveEditorToolHint(
  profile: EditorToolHintProfile,
  state: EditorToolHintState = "idle",
): ResolvedEditorToolHint {
  switch (state) {
    case "drawing":
      return {
        icon: profile.icon,
        text: profile.drawingHint ?? profile.idleHint,
        cursor: profile.cursor,
      };
    case "dragging":
      return {
        icon: profile.icon,
        text: profile.draggingHint ?? profile.idleHint,
        cursor: "grabbing",
      };
    case "resizing":
      return {
        icon: profile.icon,
        text: profile.resizingHint ?? profile.idleHint,
        cursor: "nwse-resize",
      };
    case "blocked":
      return {
        icon: profile.icon,
        text: profile.blockedHint ?? profile.idleHint,
        cursor: "not-allowed",
      };
    case "idle":
    default:
      return {
        icon: profile.icon,
        text: profile.idleHint,
        cursor: profile.cursor,
      };
  }
}

export function getStructuralToolHint(
  kind: SalaStructuralElementKind,
): EditorToolHintProfile {
  return STRUCTURAL_TOOL_HINTS[kind];
}

export function getStructuralToolHintFromItem(
  tool: StructuralToolboxItem,
): EditorToolHintProfile {
  const profile = getStructuralToolHint(tool.kind);
  return {
    ...profile,
    icon: tool.icon || profile.icon,
  };
}

export function getSurfaceMaterialToolHint(
  material: SurfaceMaterialKind,
): EditorToolHintProfile {
  const entry = getSurfaceMaterialCatalogItem(material);
  const label = entry?.label.toLowerCase() ?? "material";

  return {
    icon: "🌿",
    cursor: "crosshair",
    idleHint: `Arrastra para crear una superficie de ${label}.`,
    drawingHint: EDITOR_INTERACTION_HINTS.surfaceDrawing,
    draggingHint: EDITOR_INTERACTION_HINTS.surfaceDragging,
    resizingHint: EDITOR_INTERACTION_HINTS.surfaceResizing,
  };
}

export function getOperationalToolHint(
  item: OperationalElementCatalogItem,
): EditorToolHintProfile {
  return {
    icon: item.icon,
    cursor: "crosshair",
    idleHint: item.workspaceHint,
    draggingHint: EDITOR_INTERACTION_HINTS.operationalDragging,
    resizingHint: EDITOR_INTERACTION_HINTS.operationalResizing,
  };
}

export function resolveSurfaceInteractionState(input: {
  draftActive: boolean;
  moveActive: boolean;
  resizeActive: boolean;
}): EditorToolHintState {
  if (input.draftActive) return "drawing";
  if (input.moveActive) return "dragging";
  if (input.resizeActive) return "resizing";
  return "idle";
}

export function resolveOperationalInteractionState(input: {
  dragging: boolean;
  resizing: boolean;
}): EditorToolHintState {
  if (input.dragging) return "dragging";
  if (input.resizing) return "resizing";
  return "idle";
}

export function resolveWallInteractionState(input: {
  draftActive: boolean;
  blocked: boolean;
}): EditorToolHintState {
  if (input.draftActive) return "drawing";
  if (input.blocked) return "blocked";
  return "idle";
}
