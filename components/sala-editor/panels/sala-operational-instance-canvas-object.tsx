"use client";

import type { PointerEvent } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type {
  OperationalInstanceResizeCorner,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { V2ProjectedGeometry } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import { resolveOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";

const RESIZE_CORNERS: readonly OperationalInstanceResizeCorner[] = [
  "nw",
  "ne",
  "sw",
  "se",
];

export type SalaOperationalInstanceCanvasObjectProps = {
  instance: OperationalElementInstance;
  catalogColor?: string;
  geometry: V2ProjectedGeometry;
  selected: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
  isDropAnimating?: boolean;
  linkedTableLabel?: string | null;
  onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onBodyPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (
    instanceId: string,
    corner: OperationalInstanceResizeCorner,
    clientX: number,
    clientY: number,
  ) => void;
  onResizeMove: (clientX: number, clientY: number) => void;
  onResizeEnd: () => void;
  onResizeCancel: () => void;
};

export function SalaOperationalInstanceCanvasObject({
  instance,
  catalogColor = "#315f7d",
  geometry,
  selected,
  isDragging = false,
  isResizing = false,
  isDropAnimating = false,
  linkedTableLabel = null,
  onBodyPointerDown,
  onBodyPointerMove,
  onBodyPointerUp,
  onBodyPointerCancel,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
}: SalaOperationalInstanceCanvasObjectProps) {
  const chromeVisible = selected && !isDragging && !isResizing;
  const visualVariant = resolveOperationalVisualVariant(
    instance.metadata,
    instance.elementType,
  );
  const showLinkBadge = instance.elementType === "TABLE";
  const linked = typeof linkedTableLabel === "string" && linkedTableLabel.trim() !== "";
  const createResizePointerHandlers = (corner: OperationalInstanceResizeCorner) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      onResizeStart(instance.id, corner, event.clientX, event.clientY);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      onResizeMove(event.clientX, event.clientY);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onResizeEnd();
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onResizeCancel();
    },
  });

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
        width: geometry.width,
        height: geometry.height,
        transform:
          [
            geometry.rotation !== 0 ? `rotate(${geometry.rotation}deg)` : "",
            isDragging ? "scale(1.02)" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        transformOrigin: "center center",
        zIndex: isDragging || isResizing ? 40 : selected ? 20 : 1,
      }}
    >
      {selected ? <div className="hostly-sala-canvas-object__frame" aria-hidden /> : null}
      {showLinkBadge ? (
        <span
          className={[
            "hostly-sala-canvas-object__link-badge",
            linked ? "is-linked" : "is-unlinked",
          ].join(" ")}
        >
          {linked ? `Enlazada con ${linkedTableLabel}` : "No enlazada"}
        </span>
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

      {selected
        ? RESIZE_CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              className={[
                "hostly-sala-canvas-object__handle",
                `hostly-sala-canvas-object__handle--${corner}`,
              ].join(" ")}
              aria-label={`Redimensionar ${instance.name}`}
              {...createResizePointerHandlers(corner)}
            />
          ))
        : null}
    </div>
  );
}
