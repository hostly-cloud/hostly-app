"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
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
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  onWallPointerDown?: (payload: WallPointerPayload) => void;
  onWallPointerMove?: (payload: WallPointerPayload) => void;
  onWallPointerUp?: () => void;
  onWallPointerCancel?: () => void;
};

export function SalaEstructuraWorkspace({
  espacio,
  restaurantId,
  tool,
  walls = [],
  wallDraft = null,
  selectedWallId = null,
  onWallPointerDown,
  onWallPointerMove,
  onWallPointerUp,
  onWallPointerCancel,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
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
      {wallDrawingEnabled ? (
        <SalaWallCanvas
          walls={walls}
          draft={wallDraft}
          selectedWallId={selectedWallId}
          hint={tool.workspaceHint}
          onPointerDown={onWallPointerDown}
          onPointerMove={onWallPointerMove}
          onPointerUp={onWallPointerUp}
          onPointerCancel={onWallPointerCancel}
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
