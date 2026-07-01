"use client";

import type { CSSProperties } from "react";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

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
        "hostly-sala-editor-tool-tile",
        selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        selected
          ? undefined
          : ({
              "--tool-accent": item.color,
            } as CSSProperties)
      }
    >
      <span
        className="hostly-sala-editor-tool-tile__icon"
        style={selected ? undefined : { backgroundColor: `${item.color}20` }}
        aria-hidden
      >
        {item.icon}
      </span>
      <span className="hostly-sala-editor-tool-tile__label">{item.label}</span>
    </button>
  );
}
