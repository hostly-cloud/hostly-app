"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";
import { getSpaceWorkspaceKey, createSpaceWorkspaceScope } from "@/lib/sala-editor/canvas/space-workspace";

export type SalaEspacioCanvasFrameProps = {
  espacio: SalaEspacio;
  restaurantId?: string;
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
  restaurantId,
  stageRef,
  stageRole,
  stageAriaLabel,
  stageStyle,
  onStagePointerDown,
  children,
  hint,
}: SalaEspacioCanvasFrameProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const workspaceKey =
    restaurantId != null
      ? getSpaceWorkspaceKey(createSpaceWorkspaceScope(restaurantId, espacio.id))
      : espacio.id;

  useEffect(() => {
    const viewport = viewportRef.current;
    const frame = frameRef.current;
    if (!viewport || !frame) return;

    frame.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "smooth",
    });
  }, [espacio.id]);

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas hostly-sala-editor-canvas-frame--blueprint hostly-sala-editor-canvas-frame--space-workspace">
      <div
        ref={viewportRef}
        className="hostly-sala-editor-canvas-frame__surface hostly-sala-espacio-frame-viewport"
      >
        <div
          ref={frameRef}
          className="hostly-sala-espacio-frame hostly-sala-espacio-frame--blueprint hostly-sala-espacio-frame--active-workspace"
          data-space-workspace-id={espacio.id}
          data-space-workspace-key={workspaceKey}
          style={{ "--espacio-accent": espacio.color } as CSSProperties}
        >
          <div className="hostly-sala-espacio-frame__header">
            <span
              className="hostly-sala-espacio-frame__header-swatch"
              style={{ backgroundColor: espacio.color }}
              aria-hidden
            />
            <span
              className="hostly-sala-espacio-frame__header-icon"
              style={{ color: espacio.color }}
              aria-hidden
            >
              {icon}
            </span>
            <span className="hostly-sala-espacio-frame__header-name">{espacio.name}</span>
          </div>

          <div
            ref={stageRef}
            role={stageRole}
            aria-label={stageAriaLabel ?? `Lienzo de ${espacio.name}`}
            className="hostly-sala-espacio-frame__stage hostly-sala-espacio-frame__stage--workspace"
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
