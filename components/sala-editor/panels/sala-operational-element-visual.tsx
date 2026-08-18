"use client";

import type { CSSProperties } from "react";
import {
  isOperationalBarElementType,
  isOperationalServiceAreaElementType,
  type OperationalElementType,
} from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { createTableSeatLayout } from "@/lib/sala-editor/canvas/table-seat-layout";
import type { OperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";

export type SalaOperationalElementVisualProps = {
  elementType: OperationalElementType;
  label: string;
  color: string;
  visualVariant?: OperationalVisualVariant | null;
  seatCount?: number;
  canvasSize?: OperationalInstanceCanvasSize;
  mini?: boolean;
};

function resolveTableVisualLabel(label: string): {
  number: string;
  name: string | null;
} {
  const normalizedLabel = label.trim();
  const numberMatch = normalizedLabel.match(/(\d+)\s*$/);

  if (!numberMatch) {
    return {
      number: normalizedLabel,
      name: null,
    };
  }

  const number = numberMatch[1] ?? normalizedLabel;
  const name = normalizedLabel.slice(0, numberMatch.index).trim();
  return {
    number,
    name: name.length > 0 ? name : null,
  };
}

export function SalaOperationalElementVisual({
  elementType,
  label,
  color,
  visualVariant = null,
  seatCount,
  canvasSize,
  mini = false,
}: SalaOperationalElementVisualProps) {
  const canvasViewport = useCanvasViewport();
  const tableLabel =
    elementType === "TABLE" && !mini ? resolveTableVisualLabel(label) : null;
  const showName = !mini && (!tableLabel || tableLabel.name);
  const tableLayout =
    elementType === "TABLE" && !mini
      ? createTableSeatLayout(
          seatCount,
          visualVariant,
          canvasSize,
          canvasViewport?.scale,
        )
      : null;

  return (
    <div
      className={[
        "hostly-sala-op-visual",
        mini ? "hostly-sala-op-visual--mini" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-type={elementType}
      {...(visualVariant ? { "data-visual-variant": visualVariant } : {})}
      style={{ "--op-accent": color } as CSSProperties}
    >
      {tableLayout ? (
        <div
          className="hostly-sala-op-visual__table-layout"
          style={{
            width: tableLayout.tableTop.width,
            height: tableLayout.tableTop.height,
          }}
        >
          {tableLayout.seats.length > 0 ? (
            <div className="hostly-sala-op-visual__seats" aria-hidden>
              {tableLayout.seats.map((seat, index) => (
                <span
                  key={index}
                  className="hostly-sala-op-visual__seat"
                  style={{
                    left: seat.x,
                    top: seat.y,
                    width: tableLayout.seatSize.width,
                    height: tableLayout.seatSize.height,
                    transform: `translate(-50%, -50%) rotate(${seat.rotationDegrees}deg)`,
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className="hostly-sala-op-visual__glyph" aria-hidden>
            <span className="hostly-sala-op-visual__table-number">
              {tableLabel?.number}
            </span>
          </div>
        </div>
      ) : (
        <div className="hostly-sala-op-visual__glyph" aria-hidden />
      )}
      {showName ? (
        <span className="hostly-sala-op-visual__name">
          {tableLabel?.name ?? label}
        </span>
      ) : null}
      {!mini && isOperationalBarElementType(elementType) ? (
        <span className="hostly-sala-op-visual__bar-badge">Barra</span>
      ) : null}
      {!mini && isOperationalServiceAreaElementType(elementType) ? (
        <span className="hostly-sala-op-visual__service-badge">Servicio</span>
      ) : null}
    </div>
  );
}
