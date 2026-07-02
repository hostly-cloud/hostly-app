"use client";

import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import { SalaStructuralToolVisual } from "@/components/sala-editor/panels/sala-structural-tool-visual";

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
  const disabled = !item.available;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-pressed={disabled ? undefined : selected}
      aria-disabled={disabled}
      title={disabled ? `${item.label} — Próximamente` : item.label}
      className={[
        "hostly-sala-editor-tool-chip hostly-sala-editor-tool-chip--structural",
        selected && !disabled ? "is-selected" : "",
        disabled ? "is-upcoming" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="hostly-sala-editor-tool-chip__preview" aria-hidden>
        <SalaStructuralToolVisual kind={item.kind} mini />
      </span>
      <span className="hostly-sala-editor-tool-chip__caption">{item.label}</span>
      {disabled ? (
        <span className="hostly-sala-editor-tool-chip__badge">Próximamente</span>
      ) : null}
    </button>
  );
}
