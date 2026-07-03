"use client";

import type { ReactNode } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type {
  SalaWallAttachment,
  SalaWallAttachmentKind,
} from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type {
  SalaStructuralElement,
  SalaStructuralElementDraft,
} from "@/lib/sala-editor/types/elementos-estructurales";
import { isSalaStructuralObjectKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { getStructuralToolHintFromItem } from "@/lib/sala-editor/ux/editor-tool-hints";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";
import { SalaStructureObjectsLayer } from "@/components/sala-editor/panels/sala-structure-objects-layer";

export type SalaEstructuraWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  tool: StructuralToolboxItem;
  walls?: SalaWallSegment[];
  wallAttachments?: SalaWallAttachment[];
  structuralElements?: SalaStructuralElement[];
  selectedStructuralElementId?: string | null;
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  selectedWallAttachmentId?: string | null;
  onWallPointerDown?: (payload: WallPointerPayload) => void;
  onWallPointerMove?: (payload: WallPointerPayload) => void;
  onWallPointerUp?: () => void;
  onWallPointerCancel?: () => void;
  onWallAttachmentPlace?: (
    wallId: string,
    positionRatio: number,
    kind: SalaWallAttachmentKind,
  ) => void;
  onWallAttachmentSelect?: (attachmentId: string) => void;
  onWallAttachmentClearSelection?: () => void;
  onWallAttachmentUpdate?: (
    attachmentId: string,
    patch: Partial<Pick<SalaWallAttachment, "positionRatio" | "offset">>,
  ) => void;
  onWallAttachmentMoveStart?: () => void;
  onWallAttachmentMoveEnd?: (outcome: WallAttachmentEditOutcome) => void;
  onStructuralElementCreate?: (draft: SalaStructuralElementDraft) => void;
  onStructuralElementSelect?: (elementId: string | null) => void;
  onStructuralElementClearSelection?: () => void;
  onStructuralElementUpdate?: (
    elementId: string,
    patch: Partial<Omit<SalaStructuralElement, "id">>,
  ) => void;
  onStructuralElementMoveStart?: () => void;
  onStructuralElementMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onStructuralElementResizeStart?: () => void;
  onStructuralElementResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  canvasLayers?: ReactNode;
};

export function SalaEstructuraWorkspace({
  espacio,
  restaurantId,
  tool,
  walls = [],
  wallAttachments = [],
  structuralElements = [],
  selectedStructuralElementId = null,
  wallDraft = null,
  selectedWallId = null,
  selectedWallAttachmentId = null,
  onWallPointerDown,
  onWallPointerMove,
  onWallPointerUp,
  onWallPointerCancel,
  onWallAttachmentPlace,
  onWallAttachmentSelect,
  onWallAttachmentClearSelection,
  onWallAttachmentUpdate,
  onWallAttachmentMoveStart,
  onWallAttachmentMoveEnd,
  onStructuralElementCreate,
  onStructuralElementSelect,
  onStructuralElementClearSelection,
  onStructuralElementUpdate,
  onStructuralElementMoveStart,
  onStructuralElementMoveEnd,
  onStructuralElementResizeStart,
  onStructuralElementResizeEnd,
  canvasLayers = null,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
  const toolHintProfile = getStructuralToolHintFromItem(tool);
  const attachmentPlacementKind =
    tool.kind === "door" || tool.kind === "glass" ? tool.kind : null;
  const wallDrawingEnabled =
    isWallTool &&
    onWallPointerDown &&
    onWallPointerMove &&
    onWallPointerUp &&
    onWallPointerCancel;
  const activeStructureObjectKind = isSalaStructuralObjectKind(tool.kind)
    ? tool.kind
    : null;
  const wallCanvasVisible = Boolean(
    wallDrawingEnabled ||
      attachmentPlacementKind ||
      walls.length > 0 ||
      wallAttachments.length > 0,
  );

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
    >
      {canvasLayers}
      {wallCanvasVisible ? (
        <SalaWallCanvas
          walls={walls}
          wallAttachments={wallAttachments}
          draft={wallDraft}
          selectedWallId={wallDrawingEnabled ? selectedWallId : null}
          selectedWallAttachmentId={
            attachmentPlacementKind ? selectedWallAttachmentId : null
          }
          attachmentPlacementKind={attachmentPlacementKind}
          toolHintProfile={toolHintProfile}
          onPointerDown={onWallPointerDown}
          onPointerMove={onWallPointerMove}
          onPointerUp={onWallPointerUp}
          onPointerCancel={onWallPointerCancel}
          onPlaceWallAttachment={onWallAttachmentPlace}
          onSelectWallAttachment={onWallAttachmentSelect}
          onClearWallAttachmentSelection={onWallAttachmentClearSelection}
          onUpdateWallAttachment={onWallAttachmentUpdate}
          onWallAttachmentMoveStart={onWallAttachmentMoveStart}
          onWallAttachmentMoveEnd={onWallAttachmentMoveEnd}
          embedded
          readOnly={!wallDrawingEnabled && !attachmentPlacementKind}
        />
      ) : null}
      <SalaStructureObjectsLayer
        espacioId={espacio.id}
        gridSize={base.grid.size}
        activeToolKind={activeStructureObjectKind}
        structuralElements={structuralElements}
        selectedStructuralElementId={selectedStructuralElementId}
        onCreateStructuralElement={onStructuralElementCreate}
        onSelectStructuralElement={onStructuralElementSelect}
        onClearStructuralElementSelection={onStructuralElementClearSelection}
        onUpdateStructuralElement={onStructuralElementUpdate}
        onMoveStart={onStructuralElementMoveStart}
        onMoveEnd={onStructuralElementMoveEnd}
        onResizeStart={onStructuralElementResizeStart}
        onResizeEnd={onStructuralElementResizeEnd}
      />
      {!wallCanvasVisible && !activeStructureObjectKind ? (
        <div className="hostly-sala-espacio-frame__placeholder">
          <p>{tool.workspaceHint}</p>
        </div>
      ) : null}
    </SalaEspacioCanvasFrame>
  );
}
