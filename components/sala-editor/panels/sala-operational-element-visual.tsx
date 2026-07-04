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
  mini = false,
}: SalaOperationalElementVisualProps) {
  const tableLabel =
    elementType === "TABLE" && !mini ? resolveTableVisualLabel(label) : null;

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
      <div className="hostly-sala-op-visual__glyph" aria-hidden>
        {tableLabel ? (
          <span className="hostly-sala-op-visual__table-number">
            {tableLabel.number}
          </span>
        ) : null}
      </div>
      {!mini && (!tableLabel || tableLabel.name) ? (
        <span className="hostly-sala-op-visual__name">
          {tableLabel?.name ?? label}
        </span>
      ) : null}
    </div>
  );
}
