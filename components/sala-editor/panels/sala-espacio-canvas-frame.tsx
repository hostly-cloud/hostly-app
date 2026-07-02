"use client";

import {
  useRef,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { getSpaceWorkspaceKey, createSpaceWorkspaceScope } from "@/lib/sala-editor/canvas/space-workspace";
import { getEditorCoordinateScale, scaleEditorGridSize } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useEditorVisualLayout } from "@/lib/sala-editor/canvas/use-editor-visual-layout";
import { CanvasViewportProvider } from "@/components/sala-editor/canvas/canvas-viewport-context";

export type SalaEspacioCanvasFrameProps = {
  espacio: SalaEspacio;
  restaurantId?: string;
  basePreview?: SalaEspacioBase;
  floorBackground?: string;
  stageRef?: RefObject<HTMLDivElement | null>;
  stageRole?: string;
  stageAriaLabel?: string;
  stageStyle?: CSSProperties;
  onStagePointerDown?: PointerEventHandler<HTMLDivElement>;
  children?: ReactNode;
  hint?: ReactNode;
};

function assignRef<T>(ref: RefObject<T | null> | undefined, value: T | null) {
  if (!ref) return;
  ref.current = value;
}

export function SalaEspacioCanvasFrame({
  espacio,
  restaurantId,
  basePreview,
  floorBackground,
  stageRef,
  stageRole,
  stageAriaLabel,
  stageStyle,
  onStagePointerDown,
  children,
  hint,
}: SalaEspacioCanvasFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitContentRef = useRef<HTMLDivElement>(null);
  const stageElementRef = useRef<HTMLDivElement>(null);

  const workspaceKey =
    restaurantId != null
      ? getSpaceWorkspaceKey(createSpaceWorkspaceScope(restaurantId, espacio.id))
      : espacio.id;

  const hasBoundedPlan = basePreview != null;
  const visualLayout = useEditorVisualLayout(
    viewportRef,
    basePreview,
    hasBoundedPlan,
    [espacio.id, basePreview?.dimensions.width, basePreview?.dimensions.height],
  );

  const previewWidth = hasBoundedPlan ? visualLayout.stageWidth : undefined;
  const previewHeight = hasBoundedPlan ? visualLayout.stageHeight : undefined;
  const coordinateScale = hasBoundedPlan ? getEditorCoordinateScale(visualLayout) : 1;
  const gridSize = basePreview?.grid.size ?? 16;
  const displayGridSize = hasBoundedPlan
    ? scaleEditorGridSize(gridSize, coordinateScale)
    : gridSize;
  const gridOffset = displayGridSize / 2;
  const fitScale = hasBoundedPlan ? visualLayout.fitScale : 1;

  const frame = (
    <div
      ref={hasBoundedPlan ? fitContentRef : undefined}
      className={[
        "hostly-sala-espacio-frame hostly-sala-espacio-frame--blueprint hostly-sala-espacio-frame--active-workspace",
        hasBoundedPlan ? "hostly-sala-espacio-frame--bounded" : "hostly-sala-espacio-frame--fluid",
      ]
        .filter(Boolean)
        .join(" ")}
      data-space-workspace-id={espacio.id}
      data-space-workspace-key={workspaceKey}
      data-canvas-fit-scale={fitScale}
      data-canvas-display-ppu={visualLayout.displayPixelsPerUnit}
      data-canvas-logical-ppu={visualLayout.logicalPixelsPerUnit}
      style={{ "--espacio-accent": espacio.color } as CSSProperties}
    >
      <div
        ref={(node) => {
          assignRef(stageElementRef, node);
          assignRef(stageRef, node);
        }}
        role={stageRole}
        aria-label={stageAriaLabel ?? `Plano de ${espacio.name}`}
        className={[
          "hostly-sala-espacio-frame__stage hostly-sala-espacio-frame__stage--workspace hostly-sala-espacio-frame__stage--bounded-plan",
          basePreview ? "hostly-sala-espacio-frame__stage--base-preview" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          ...stageStyle,
          ...(previewWidth != null && previewHeight != null
            ? {
                width: previewWidth,
                height: previewHeight,
                minWidth: previewWidth,
                minHeight: previewHeight,
                flex: "0 0 auto",
              }
            : {}),
          ...(floorBackground ? { background: floorBackground } : {}),
        }}
        onPointerDown={onStagePointerDown}
      >
        <CanvasViewportProvider
          stageRef={stageElementRef}
          scale={fitScale}
          displayPixelsPerUnit={visualLayout.displayPixelsPerUnit}
          logicalPixelsPerUnit={visualLayout.logicalPixelsPerUnit}
          coordinateScale={coordinateScale}
        >
          <div className="hostly-sala-espacio-frame__plan-corners" aria-hidden />
          {basePreview?.grid.visible !== false ? (
            <div
              className="hostly-sala-editor-dot-grid hostly-sala-editor-dot-grid--soft"
              aria-hidden
              style={{
                backgroundSize: `${displayGridSize}px ${displayGridSize}px`,
                backgroundPosition: `${gridOffset}px ${gridOffset}px`,
              }}
            />
          ) : null}
          {!basePreview ? (
            <div className="hostly-sala-editor-dot-grid hostly-sala-editor-dot-grid--soft" aria-hidden />
          ) : null}
          {children}
          {hint}
        </CanvasViewportProvider>
      </div>
    </div>
  );

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas hostly-sala-editor-canvas-frame--blueprint hostly-sala-editor-canvas-frame--space-workspace">
      <div
        ref={viewportRef}
        className="hostly-sala-editor-canvas-frame__surface hostly-sala-espacio-frame-viewport"
      >
        {hasBoundedPlan ? (
          <div className="hostly-sala-espacio-frame-fit">
            <div
              className="hostly-sala-espacio-frame-fit__content"
              style={{
                transform: fitScale === 1 ? undefined : `scale(${fitScale})`,
              }}
            >
              {frame}
            </div>
          </div>
        ) : (
          <div className="hostly-sala-espacio-frame-fluid">{frame}</div>
        )}
      </div>
    </div>
  );
}
