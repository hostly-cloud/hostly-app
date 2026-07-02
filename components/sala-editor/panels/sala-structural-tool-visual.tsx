"use client";

import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";

export type SalaStructuralToolVisualProps = {
  kind: SalaStructuralElementKind;
  mini?: boolean;
};

export function SalaStructuralToolVisual({
  kind,
  mini = false,
}: SalaStructuralToolVisualProps) {
  return (
    <div
      className={[
        "hostly-sala-struct-visual",
        mini ? "hostly-sala-struct-visual--mini" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-kind={kind}
    >
      <div className="hostly-sala-struct-visual__glyph" aria-hidden />
    </div>
  );
}
