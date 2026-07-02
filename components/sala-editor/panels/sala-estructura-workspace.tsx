"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
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
  onWallDelete?: (wallId: string) => void;
  onWallAttachmentPlace?: (wallId: string, positionRatio: number) => void;
  onWallAttachmentSelect?: (attachmentId: string) => void;
  onWallAttachmentClearSelection?: () => void;
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
  onWallDelete,
  onWallAttachmentPlace,
  onWallAttachmentSelect,
  onWallAttachmentClearSelection,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
  const isDoorTool = tool.kind === "door";
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
      {wallDrawingEnabled || isDoorTool ? (
        <SalaWallCanvas
          walls={walls}
          wallAttachments={wallAttachments}
          draft={wallDraft}
          selectedWallId={selectedWallId}
          selectedWallAttachmentId={selectedWallAttachmentId}
          attachmentPlacementKind={isDoorTool ? "door" : null}
          hint={tool.workspaceHint}
          onPointerDown={onWallPointerDown}
          onPointerMove={onWallPointerMove}
          onPointerUp={onWallPointerUp}
          onPointerCancel={onWallPointerCancel}
          onDeleteWall={onWallDelete}
          onPlaceWallAttachment={onWallAttachmentPlace}
          onSelectWallAttachment={onWallAttachmentSelect}
          onClearWallAttachmentSelection={onWallAttachmentClearSelection}
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
