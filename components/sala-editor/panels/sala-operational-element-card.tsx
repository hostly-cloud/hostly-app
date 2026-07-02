"use client";

import type { CSSProperties } from "react";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";

export type SalaOperationalElementCardProps = {
  item: OperationalElementCatalogItem;
  selected: boolean;
  onSelect: () => void;
};

export function SalaOperationalElementCard({
  item,
  selected,
  onSelect,
}: SalaOperationalElementCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={item.label}
      className={[
        "hostly-sala-editor-tool-chip",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--tool-accent": item.color } as CSSProperties}
    >
      <span className="hostly-sala-editor-tool-chip__preview" aria-hidden>
        <SalaOperationalElementVisual
          elementType={item.type}
          label={item.label}
          color={item.color}
          mini
        />
      </span>
      <span className="hostly-sala-editor-tool-chip__caption">{item.label}</span>
    </button>
  );
}
