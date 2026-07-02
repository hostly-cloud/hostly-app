"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallSnapGuide } from "@/lib/sala-editor/canvas/wall-snap";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";

export type SalaEstructuraWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  tool: StructuralToolboxItem;
  walls?: SalaWallSegment[];
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  draggingWallId?: string | null;
  resizingWallId?: string | null;
  wallSnapGuide?: WallSnapGuide | null;
  onWallPointerDown?: (payload: WallPointerPayload) => void;
  onWallPointerMove?: (payload: WallPointerPayload) => void;
  onWallPointerUp?: () => void;
  onWallPointerCancel?: () => void;
  onWallDuplicate?: (wallId: string) => void;
  onWallDelete?: (wallId: string) => void;
};

export function SalaEstructuraWorkspace({
  espacio,
  restaurantId,
  tool,
  walls = [],
  wallDraft = null,
  selectedWallId = null,
  draggingWallId = null,
  resizingWallId = null,
  wallSnapGuide = null,
  onWallPointerDown,
  onWallPointerMove,
  onWallPointerUp,
  onWallPointerCancel,
  onWallDuplicate,
  onWallDelete,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
  const wallDrawingEnabled =
    isWallTool &&
    onWallPointerDown &&
    onWallPointerMove &&
    onWallPointerUp &&
    onWallPointerCancel;

  return (
    <SalaEspacioCanvasFrame espacio={espacio} restaurantId={restaurantId}>
      {wallDrawingEnabled ? (
        <SalaWallCanvas
          walls={walls}
          draft={wallDraft}
          selectedWallId={selectedWallId}
          draggingWallId={draggingWallId}
          resizingWallId={resizingWallId}
          snapGuide={wallSnapGuide}
          hint={tool.workspaceHint}
          onPointerDown={onWallPointerDown}
          onPointerMove={onWallPointerMove}
          onPointerUp={onWallPointerUp}
          onPointerCancel={onWallPointerCancel}
          onDuplicateWall={onWallDuplicate}
          onDeleteWall={onWallDelete}
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
