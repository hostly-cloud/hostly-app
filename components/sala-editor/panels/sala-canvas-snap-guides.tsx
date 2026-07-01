"use client";

import type { OperationalSnapGuides } from "@/lib/sala-editor/canvas/operational-snap";

export type SalaCanvasSnapGuidesProps = {
  guides: OperationalSnapGuides;
};

export function SalaCanvasSnapGuides({ guides }: SalaCanvasSnapGuidesProps) {
  if (guides.v.length === 0 && guides.h.length === 0) return null;

  return (
    <div className="hostly-sala-canvas-snap-guides" aria-hidden>
      {guides.v.map((x, index) => (
        <div
          key={`snap-v-${index}-${x}`}
          className="hostly-sala-canvas-snap-guides__line hostly-sala-canvas-snap-guides__line--v"
          style={{ left: x }}
        />
      ))}
      {guides.h.map((y, index) => (
        <div
          key={`snap-h-${index}-${y}`}
          className="hostly-sala-canvas-snap-guides__line hostly-sala-canvas-snap-guides__line--h"
          style={{ top: y }}
        />
      ))}
    </div>
  );
}
