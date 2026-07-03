"use client";

import type { CSSProperties } from "react";
import type { SnapGuide } from "@/lib/sala-editor/snap";

export type SalaSmartSnapGuidesLayerProps = {
  guides: readonly SnapGuide[];
  coordinateScale?: number;
};

export function SalaSmartSnapGuidesLayer({
  guides,
  coordinateScale = 1,
}: SalaSmartSnapGuidesLayerProps) {
  if (guides.length === 0) return null;

  return (
    <div className="hostly-sala-smart-snap-guides" aria-hidden>
      {guides.map((guide, index) => {
        const from = guide.from * coordinateScale;
        const to = guide.to * coordinateScale;
        const length = Math.max(1, to - from);
        const position = guide.position * coordinateScale;
        const style =
          guide.axis === "x"
            ? ({
                left: position,
                top: from,
                height: length,
              } as CSSProperties)
            : ({
                top: position,
                left: from,
                width: length,
              } as CSSProperties);

        return (
          <div
            key={`${guide.axis}-${guide.position}-${guide.from}-${guide.to}-${index}`}
            className={[
              "hostly-sala-smart-snap-guides__line",
              guide.axis === "x"
                ? "hostly-sala-smart-snap-guides__line--v"
                : "hostly-sala-smart-snap-guides__line--h",
              `is-${guide.kind}`,
            ]
              .filter(Boolean)
              .join(" ")}
            style={style}
          />
        );
      })}
    </div>
  );
}
