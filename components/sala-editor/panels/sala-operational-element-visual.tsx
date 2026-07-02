"use client";

import type { CSSProperties } from "react";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";

export type SalaOperationalElementVisualProps = {
  elementType: OperationalElementType;
  label: string;
  color: string;
  visualVariant?: OperationalVisualVariant | null;
  mini?: boolean;
};

export function SalaOperationalElementVisual({
  elementType,
  label,
  color,
  visualVariant = null,
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
      {...(visualVariant ? { "data-visual-variant": visualVariant } : {})}
      style={{ "--op-accent": color } as CSSProperties}
    >
      <div className="hostly-sala-op-visual__glyph" aria-hidden />
      {!mini ? <span className="hostly-sala-op-visual__name">{label}</span> : null}
    </div>
  );
}
