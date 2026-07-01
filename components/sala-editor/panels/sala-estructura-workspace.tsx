"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";

export type SalaEstructuraWorkspaceProps = {
  espacio: SalaEspacio;
  tool: StructuralToolboxItem;
  walls?: SalaWallSegment[];
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  onWallPointerDown?: (point: { x: number; y: number }) => void;
  onWallPointerMove?: (point: { x: number; y: number }) => void;
};

export function SalaEstructuraWorkspace({
  tool,
  walls = [],
  wallDraft = null,
  selectedWallId = null,
  onWallPointerDown,
  onWallPointerMove,
}: SalaEstructuraWorkspaceProps) {
  const isWallTool = tool.kind === "wall";
  const wallDrawingEnabled =
    isWallTool && onWallPointerDown && onWallPointerMove;

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas">
      {wallDrawingEnabled ? (
        <SalaWallCanvas
          walls={walls}
          draft={wallDraft}
          selectedWallId={selectedWallId}
          hint={tool.workspaceHint}
          onPointerDown={onWallPointerDown}
          onPointerMove={onWallPointerMove}
        />
      ) : (
        <div className="hostly-sala-editor-canvas-frame__surface relative flex flex-col items-center justify-center px-4 py-6 text-center">
          <div className="hostly-sala-editor-dot-grid" aria-hidden />

          <div className="relative max-w-xs">
            <p className="text-xs font-bold leading-snug text-slate-600">{tool.workspaceHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
