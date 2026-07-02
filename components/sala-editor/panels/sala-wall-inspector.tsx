"use client";

import type { ReactNode } from "react";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import {
  formatWallCoordinates,
  formatWallLengthPx,
  wallSegmentLength,
} from "@/lib/sala-editor/geometry/wall-geometry";

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="hostly-sala-editor-inspector__section">
      <h4 className="hostly-sala-editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  );
}

const WALL_UPCOMING_ACTIONS = ["Girar", "Bloquear"] as const;

export type SalaWallInspectorProps = {
  wall: SalaWallSegment;
};

export function SalaWallInspector({ wall }: SalaWallInspectorProps) {
  const length = wallSegmentLength(wall);

  return (
    <div className="hostly-sala-editor-inspector">
      <InspectorSection title="Pared">
        <div className="hostly-sala-editor-inspector__card">
          <p className="text-xs font-extrabold text-slate-900">Pared</p>
          <dl className="mt-2 space-y-1.5 text-[10px]">
            <div>
              <dt className="font-bold text-slate-600">Longitud</dt>
              <dd className="font-semibold text-slate-700">{formatWallLengthPx(length)}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-600">Coordenadas</dt>
              <dd className="font-mono font-semibold text-slate-600">
                {formatWallCoordinates(wall)}
              </dd>
            </div>
          </dl>
        </div>
      </InspectorSection>

      <InspectorSection title="Próximamente">
        <ul className="hostly-sala-editor-inspector__card space-y-1 bg-slate-50/70 py-2">
          {WALL_UPCOMING_ACTIONS.map((action) => (
            <li
              key={action}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"
            >
              <span className="text-[var(--hostly-accent)]" aria-hidden>
                •
              </span>
              {action}
            </li>
          ))}
        </ul>
      </InspectorSection>
    </div>
  );
}
