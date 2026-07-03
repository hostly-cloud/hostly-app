"use client";

import type { ReactNode } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type {
  SalaWallAttachment,
  SalaWallAttachmentKind,
} from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";

export type SalaEstructuraWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  tool: StructuralToolboxItem;
  walls?: SalaWallSegment[];
  wallAttachments?: SalaWallAttachment[];
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
  canvasLayers?: ReactNode;
};

export function SalaEstructuraWorkspace({
  espacio,
  restaurantId,
  tool,
  walls = [],
  wallAttachments = [],
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
  canvasLayers = null,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
  const attachmentPlacementKind =
    tool.kind === "door" || tool.kind === "glass" ? tool.kind : null;
  const wallDrawingEnabled =
    isWallTool &&
    onWallPointerDown &&
    onWallPointerMove &&
    onWallPointerUp &&
    onWallPointerCancel;

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
      {wallDrawingEnabled || attachmentPlacementKind ? (
        <SalaWallCanvas
          walls={walls}
          wallAttachments={wallAttachments}
          draft={wallDraft}
          selectedWallId={selectedWallId}
          selectedWallAttachmentId={selectedWallAttachmentId}
          attachmentPlacementKind={attachmentPlacementKind}
          hint={tool.workspaceHint}
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
        />
      ) : (
        <div className="hostly-sala-espacio-frame__placeholder">
          <p>{tool.workspaceHint}</p>
        </div>
      )}
    </SalaEspacioCanvasFrame>
  );
}
