"use client";

import type { ReactNode } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type {
  LandscapeElement,
  LandscapeElementDraft,
  LandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import { getBaseFloorCatalogEntry, type BaseFloorCatalogKind } from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaLandscapeElementsLayer } from "@/components/sala-editor/panels/sala-landscape-elements-layer";

export type SalaPaisajismoWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  activeLandscapeKind: LandscapeElementKind | null;
  landscapeElements: LandscapeElement[];
  selectedLandscapeElementId: string | null;
  onLandscapeElementCreate?: (draft: LandscapeElementDraft) => void;
  onLandscapeElementSelect?: (elementId: string | null) => void;
  onLandscapeElementClearSelection?: () => void;
  onLandscapeElementUpdate?: (
    elementId: string,
    patch: Partial<Omit<LandscapeElement, "id">>,
  ) => void;
  onLandscapeElementMoveStart?: () => void;
  onLandscapeElementMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onLandscapeElementResizeStart?: () => void;
  onLandscapeElementResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  canvasLayers?: ReactNode;
};

export function SalaPaisajismoWorkspace({
  espacio,
  restaurantId,
  activeLandscapeKind,
  landscapeElements,
  selectedLandscapeElementId,
  onLandscapeElementCreate,
  onLandscapeElementSelect,
  onLandscapeElementClearSelection,
  onLandscapeElementUpdate,
  onLandscapeElementMoveStart,
  onLandscapeElementMoveEnd,
  onLandscapeElementResizeStart,
  onLandscapeElementResizeEnd,
  canvasLayers = null,
}: SalaPaisajismoWorkspaceProps) {
  const base = normalizeSalaEspacioBase(espacio.base);
  const floorEntry = getBaseFloorCatalogEntry(
    (base.floor.kind === "wood" ||
    base.floor.kind === "stone" ||
    base.floor.kind === "grass" ||
    base.floor.kind === "sand" ||
    base.floor.kind === "neutral"
      ? base.floor.kind
      : "neutral") as BaseFloorCatalogKind,
  );

  return (
    <SalaEspacioCanvasFrame
      espacio={espacio}
      restaurantId={restaurantId}
      basePreview={base}
      floorBackground={floorEntry.background}
      stageRole="application"
      stageAriaLabel="Lienzo de paisajismo"
      stageStyle={{ cursor: activeLandscapeKind ? "crosshair" : "default" }}
    >
      {canvasLayers}
      <SalaLandscapeElementsLayer
        espacioId={espacio.id}
        gridSize={base.grid.size}
        activeLandscapeKind={activeLandscapeKind}
        landscapeElements={landscapeElements}
        selectedLandscapeElementId={selectedLandscapeElementId}
        onCreateLandscapeElement={onLandscapeElementCreate}
        onSelectLandscapeElement={onLandscapeElementSelect}
        onClearLandscapeSelection={onLandscapeElementClearSelection}
        onUpdateLandscapeElement={onLandscapeElementUpdate}
        onMoveStart={onLandscapeElementMoveStart}
        onMoveEnd={onLandscapeElementMoveEnd}
        onResizeStart={onLandscapeElementResizeStart}
        onResizeEnd={onLandscapeElementResizeEnd}
      />
    </SalaEspacioCanvasFrame>
  );
}
