"use client";

import {
  useCallback,
  useRef,
  type ReactNode,
  type PointerEvent,
  type RefObject,
} from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import {
  getOperationalElementCatalogItem,
  type OperationalElementCatalogItem,
} from "@/lib/sala-editor/ose/operational-element-catalog";
import {
  getOperationalInstanceCanvasSize,
  type OperationalInstanceResizeCorner,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type { SnapGuide } from "@/lib/sala-editor/snap";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaSmartSnapGuidesLayer } from "@/components/sala-editor/panels/sala-smart-snap-guides-layer";
import { SalaEditorCanvasToolHint } from "@/components/sala-editor/sala-editor-canvas-tool-hint";
import {
  getOperationalToolHint,
  resolveEditorToolHint,
  resolveOperationalInteractionState,
} from "@/lib/sala-editor/ux/editor-tool-hints";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaOperationalInstanceCanvasObject } from "@/components/sala-editor/panels/sala-operational-instance-canvas-object";

export type SalaOperacionWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  activeCatalogItem: OperationalElementCatalogItem;
  instances: OperationalElementInstance[];
  selectedInstanceId: string | null;
  draggingInstanceId: string | null;
  resizingInstanceId: string | null;
  dropAnimatingInstanceId: string | null;
  snapGuides?: SnapGuide[];
  isDragging: () => boolean;
  isResizing: () => boolean;
  onCanvasPointerDown: (point: { x: number; y: number }) => void;
  onInstancePointerDown: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onInstancePointerMove: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onInstancePointerUp: (instanceId: string) => void;
  onInstancePointerCancel: (instanceId: string) => void;
  onResizeStart: (
    instanceId: string,
    corner: OperationalInstanceResizeCorner,
    clientX: number,
    clientY: number,
  ) => void;
  onResizeMove: (clientX: number, clientY: number) => void;
  onResizeEnd: () => void;
  onResizeCancel: () => void;
  onDuplicateInstance: (instanceId: string) => void;
  canvasLayers?: ReactNode;
};

type SalaOperacionCanvasContentProps = Omit<
  SalaOperacionWorkspaceProps,
  "espacio" | "restaurantId" | "activeCatalogItem"
> & {
  surfaceRef: RefObject<HTMLDivElement | null>;
};

type OperationalInstanceMoveHandlers = {
  onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
};

export type SalaOperationalInstancesLayerProps = {
  instances: OperationalElementInstance[];
  selectedInstanceId?: string | null;
  draggingInstanceId?: string | null;
  resizingInstanceId?: string | null;
  dropAnimatingInstanceId?: string | null;
  createMoveHandlers?: (
    instance: OperationalElementInstance,
  ) => OperationalInstanceMoveHandlers;
  readOnly?: boolean;
};

export function SalaOperacionWorkspace({
  espacio,
  restaurantId,
  activeCatalogItem,
  instances,
  selectedInstanceId,
  draggingInstanceId,
  resizingInstanceId,
  dropAnimatingInstanceId,
  snapGuides,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onInstancePointerDown,
  onInstancePointerMove,
  onInstancePointerUp,
  onInstancePointerCancel,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onDuplicateInstance,
  canvasLayers = null,
}: SalaOperacionWorkspaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const base = normalizeSalaEspacioBase(espacio.base);
  const toolHintProfile = getOperationalToolHint(activeCatalogItem);
  const toolHint = resolveEditorToolHint(
    toolHintProfile,
    resolveOperationalInteractionState({
      dragging: Boolean(draggingInstanceId),
      resizing: Boolean(resizingInstanceId),
    }),
  );
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
      stageRef={surfaceRef}
      stageRole="application"
      stageAriaLabel="Lienzo de elementos operativos"
      stageStyle={{
        cursor: toolHint.cursor,
      }}
      hint={
        <SalaEditorCanvasToolHint icon={toolHint.icon} text={toolHint.text} />
      }
    >
      {canvasLayers}
      <SalaOperacionCanvasContent
        surfaceRef={surfaceRef}
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        draggingInstanceId={draggingInstanceId}
        resizingInstanceId={resizingInstanceId}
        dropAnimatingInstanceId={dropAnimatingInstanceId}
        snapGuides={snapGuides}
        isDragging={isDragging}
        isResizing={isResizing}
        onCanvasPointerDown={onCanvasPointerDown}
        onInstancePointerDown={onInstancePointerDown}
        onInstancePointerMove={onInstancePointerMove}
        onInstancePointerUp={onInstancePointerUp}
        onInstancePointerCancel={onInstancePointerCancel}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
        onResizeCancel={onResizeCancel}
        onDuplicateInstance={onDuplicateInstance}
      />
    </SalaEspacioCanvasFrame>
  );
}

function SalaOperacionCanvasContent({
  surfaceRef,
  instances,
  selectedInstanceId,
  draggingInstanceId,
  resizingInstanceId,
  dropAnimatingInstanceId,
  snapGuides,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onInstancePointerDown,
  onInstancePointerMove,
  onInstancePointerUp,
  onInstancePointerCancel,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onDuplicateInstance,
}: SalaOperacionCanvasContentProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const resolveLogicalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      const displayPoint =
        fromViewport ??
        (surfaceRef.current
          ? clientToStagePoint(surfaceRef.current, clientX, clientY)
          : null);
      if (!displayPoint) return null;
      return unscaleEditorPoint(displayPoint, coordinateScale);
    },
    [canvasViewport, coordinateScale],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isDragging() || isResizing()) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      onCanvasPointerDown(point);
    },
    [isDragging, isResizing, onCanvasPointerDown, resolveLogicalPoint],
  );

  const createMoveHandlers = useCallback(
    (instance: OperationalElementInstance) => ({
      onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if (isResizing()) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerDown(instance.id, {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType,
        });
      },
      onBodyPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (isResizing()) return;
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerMove(instance.id, {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType,
        });
      },
      onBodyPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerUp(instance.id);
      },
      onBodyPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerCancel(instance.id);
      },
    }),
    [
      isResizing,
      onInstancePointerCancel,
      onInstancePointerDown,
      onInstancePointerMove,
      onInstancePointerUp,
      resolveLogicalPoint,
    ],
  );

  return (
    <>
      <div
        className="absolute inset-0"
        aria-hidden
        onPointerDown={handleCanvasPointerDown}
      />
      <SalaSmartSnapGuidesLayer
        guides={snapGuides ?? []}
        coordinateScale={coordinateScale}
      />
      <SalaOperationalInstancesLayer
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        draggingInstanceId={draggingInstanceId}
        resizingInstanceId={resizingInstanceId}
        dropAnimatingInstanceId={dropAnimatingInstanceId}
        createMoveHandlers={createMoveHandlers}
      />
    </>
  );
}

export function SalaOperationalInstancesLayer({
  instances,
  selectedInstanceId = null,
  draggingInstanceId = null,
  resizingInstanceId = null,
  dropAnimatingInstanceId = null,
  createMoveHandlers,
  readOnly = false,
}: SalaOperationalInstancesLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const noopHandlers: OperationalInstanceMoveHandlers = {
    onBodyPointerDown: () => undefined,
    onBodyPointerMove: () => undefined,
    onBodyPointerUp: () => undefined,
    onBodyPointerCancel: () => undefined,
  };

  return (
    <div className={readOnly ? "hostly-sala-operational-layer is-readonly" : "hostly-sala-operational-layer"}>
      {instances.map((instance) => {
        const instanceCatalog = getOperationalElementCatalogItem(instance.elementType);
        const moveHandlers =
          !readOnly && createMoveHandlers ? createMoveHandlers(instance) : noopHandlers;
        const dragging = !readOnly && draggingInstanceId === instance.id;
        const resizing = !readOnly && resizingInstanceId === instance.id;
        const dropAnimating = dropAnimatingInstanceId === instance.id;
        const size = getOperationalInstanceCanvasSize(instance);

        return (
          <div
            key={instance.id}
            className="absolute"
            style={{
              left: instance.position.x * coordinateScale,
              top: instance.position.y * coordinateScale,
            }}
          >
            <SalaOperationalInstanceCanvasObject
              instance={instance}
              catalogColor={instanceCatalog?.color}
              size={size}
              selected={!readOnly && instance.id === selectedInstanceId}
              isDragging={dragging}
              isResizing={resizing}
              isDropAnimating={dropAnimating}
              {...moveHandlers}
            />
          </div>
        );
      })}
    </div>
  );
}
