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
      title={item.description}
      className={[
        "hostly-sala-editor-tool-tile",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="hostly-sala-editor-tool-tile__icon" aria-hidden>
        {item.icon}
      </span>
      <span className="hostly-sala-editor-tool-tile__label">{item.label}</span>
    </button>
  );
}
