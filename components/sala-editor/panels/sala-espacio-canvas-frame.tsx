"use client";

import type { CSSProperties, PointerEventHandler, ReactNode, RefObject } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioCanvasFrameProps = {
  espacio: SalaEspacio;
  stageRef?: RefObject<HTMLDivElement | null>;
  stageRole?: string;
  stageAriaLabel?: string;
  stageStyle?: CSSProperties;
  onStagePointerDown?: PointerEventHandler<HTMLDivElement>;
  children?: ReactNode;
  hint?: ReactNode;
};

export function SalaEspacioCanvasFrame({
  espacio,
  stageRef,
  stageRole,
  stageAriaLabel,
  stageStyle,
  onStagePointerDown,
  children,
  hint,
}: SalaEspacioCanvasFrameProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas hostly-sala-editor-canvas-frame--blueprint">
      <div className="hostly-sala-editor-canvas-frame__surface hostly-sala-espacio-frame-host">
        <div
          className="hostly-sala-espacio-frame hostly-sala-espacio-frame--blueprint"
          style={{ "--espacio-accent": espacio.color } as CSSProperties}
        >
          <div className="hostly-sala-espacio-frame__header">
            <span className="hostly-sala-espacio-frame__header-icon" aria-hidden>
              {icon}
            </span>
            <span className="hostly-sala-espacio-frame__header-name">{espacio.name}</span>
          </div>

          <div
            ref={stageRef}
            role={stageRole}
            aria-label={stageAriaLabel}
            className="hostly-sala-espacio-frame__stage"
            style={stageStyle}
            onPointerDown={onStagePointerDown}
          >
            <div className="hostly-sala-editor-dot-grid hostly-sala-editor-dot-grid--soft" aria-hidden />
            {children}
            {hint}
          </div>
        </div>
      </div>
    </div>
  );
}
