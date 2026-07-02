"use client";

import type { PointerEvent } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalInstanceResizeCorner } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { resolveOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { SalaCanvasSelectionToolbar } from "@/components/sala-editor/panels/sala-canvas-selection-toolbar";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";

const RESIZE_CORNERS: OperationalInstanceResizeCorner[] = ["nw", "ne", "sw", "se"];

export type SalaOperationalInstanceCanvasObjectProps = {
  instance: OperationalElementInstance;
  catalogColor?: string;
  size: OperationalInstanceCanvasSize;
  selected: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
  isDropAnimating?: boolean;
  onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (
    corner: OperationalInstanceResizeCorner,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onResizePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function SalaOperationalInstanceCanvasObject({
  instance,
  catalogColor = "#315f7d",
  size,
  selected,
  isDragging = false,
  isResizing = false,
  isDropAnimating = false,
  onBodyPointerDown,
  onBodyPointerMove,
  onBodyPointerUp,
  onBodyPointerCancel,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizePointerCancel,
  onDuplicate,
  onDelete,
}: SalaOperationalInstanceCanvasObjectProps) {
  const chromeVisible = selected && !isDragging && !isResizing;
  const visualVariant = resolveOperationalVisualVariant(
    instance.metadata,
    instance.elementType,
  );

  return (
    <div
      className={[
        "hostly-sala-canvas-object",
        selected ? "is-selected" : "",
        isDragging ? "is-dragging" : "",
        isResizing ? "is-resizing" : "",
        chromeVisible ? "is-chrome-visible" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size.width,
        height: size.height,
        transform: isDragging
          ? "translate(-50%, -50%) scale(1.02)"
          : "translate(-50%, -50%)",
        zIndex: isDragging || isResizing ? 40 : selected ? 20 : 1,
      }}
    >
      {selected ? (
        <>
          <div className="hostly-sala-canvas-object__frame" aria-hidden />
          <SalaCanvasSelectionToolbar onDuplicate={onDuplicate} onDelete={onDelete} />
          <button
            type="button"
            className="hostly-sala-canvas-object__rotate-handle"
            aria-label="Rotación — próximamente"
            title="Rotación — próximamente"
            disabled
            tabIndex={-1}
          />
          {RESIZE_CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              aria-label={`Redimensionar esquina ${corner}`}
              className={[
                "hostly-sala-canvas-object__handle",
                `hostly-sala-canvas-object__handle--${corner}`,
              ].join(" ")}
              onPointerDown={(event) => onResizePointerDown(corner, event)}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerCancel}
            />
          ))}
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={instance.name}
        className={[
          "hostly-sala-canvas-object__body",
          isDropAnimating ? "is-drop-animating" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerCancel}
      >
        <SalaOperationalElementVisual
          elementType={instance.elementType}
          label={instance.name}
          color={catalogColor}
          visualVariant={visualVariant}
        />
      </div>
    </div>
  );
}
