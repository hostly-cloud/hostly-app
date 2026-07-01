"use client";

import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";

export type SalaStructuralToolCardProps = {
  item: StructuralToolboxItem;
  selected: boolean;
  onSelect: () => void;
};

export function SalaStructuralToolCard({
  item,
  selected,
  onSelect,
}: SalaStructuralToolCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={item.label}
      className={[
        "hostly-sala-editor-tool-chip hostly-sala-editor-tool-chip--structural",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="hostly-sala-editor-tool-chip__glyph" aria-hidden>
        {item.icon}
      </span>
      <span className="hostly-sala-editor-tool-chip__caption">{item.label}</span>
    </button>
  );
}
