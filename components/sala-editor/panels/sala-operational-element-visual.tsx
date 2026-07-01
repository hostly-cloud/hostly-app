"use client";

import type { CSSProperties } from "react";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";

export type SalaOperationalElementVisualProps = {
  elementType: OperationalElementType;
  label: string;
  color: string;
  mini?: boolean;
};

export function SalaOperationalElementVisual({
  elementType,
  label,
  color,
  mini = false,
}: SalaOperationalElementVisualProps) {
  return (
    <div
      className={[
        "hostly-sala-op-visual",
        mini ? "hostly-sala-op-visual--mini" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-type={elementType}
      style={{ "--op-accent": color } as CSSProperties}
    >
      <div className="hostly-sala-op-visual__glyph" aria-hidden />
      {!mini ? <span className="hostly-sala-op-visual__name">{label}</span> : null}
    </div>
  );
}
