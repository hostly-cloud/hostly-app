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
  espacio,
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
    <div className="hostly-sala-editor-canvas-frame">
      <div className="hostly-sala-editor-canvas-frame__bar">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hostly-accent-soft)] text-sm"
            aria-hidden
          >
            {tool.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-slate-900">{tool.label}</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">{espacio.name}</p>
          </div>
        </div>
      </div>

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
          <div
            className="pointer-events-none absolute inset-6 rounded-2xl opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />

          <div className="relative max-w-sm">
            <p className="text-sm font-extrabold leading-snug text-slate-800">{tool.workspaceHint}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              El dibujo estará disponible en la siguiente iteración.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
