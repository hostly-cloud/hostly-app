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
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#eef2f7_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
      <div className="border-b border-slate-200/70 bg-white/85 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
          Herramienta activa
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hostly-accent-soft)] text-lg"
            aria-hidden
          >
            {tool.icon}
          </span>
          <div>
            <p className="text-base font-extrabold text-slate-900">{tool.label}</p>
            <p className="text-[11px] font-semibold text-slate-500">{espacio.name}</p>
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
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div
            className="pointer-events-none absolute inset-6 rounded-2xl opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />

          <div className="relative max-w-md">
            <p className="text-lg font-extrabold leading-snug text-slate-800">
              {tool.workspaceHint}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              El dibujo estará disponible en la siguiente iteración.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
