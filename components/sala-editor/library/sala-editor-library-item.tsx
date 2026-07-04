"use client";

import type {
  SalaEditorLibraryItem,
  SalaEditorLibrarySelection,
} from "@/lib/sala-editor/library/types";

export type SalaEditorLibraryItemProps = {
  item: SalaEditorLibraryItem;
  selected: boolean;
  onSelect: (item: SalaEditorLibraryItem) => void;
};

export function SalaEditorLibraryItemRow({
  item,
  selected,
  onSelect,
}: SalaEditorLibraryItemProps) {
  const disabled = item.status === "upcoming";

  return (
    <li className="hostly-sala-library__item">
      <button
        type="button"
        className={[
          "hostly-sala-library__item-btn",
          selected && !disabled ? "is-selected" : "",
          disabled ? "is-upcoming" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-pressed={disabled ? undefined : selected}
        aria-disabled={disabled}
        title={disabled ? `${item.label} — Próximamente` : item.label}
        onClick={() => {
          if (disabled) return;
          onSelect(item);
        }}
      >
        <span className="hostly-sala-library__item-marker" aria-hidden>
          ○
        </span>
        <span className="hostly-sala-library__item-label">{item.label}</span>
        {disabled ? (
          <span className="hostly-sala-library__item-badge">Próximamente</span>
        ) : null}
      </button>
    </li>
  );
}

export function isLibraryItemSelected(
  item: SalaEditorLibraryItem,
  selection: SalaEditorLibrarySelection,
): boolean {
  if (item.status !== "available") return false;
  if (item.structuralKind != null) {
    return selection.structuralKind === item.structuralKind;
  }
  if (item.operationalType != null) {
    if (selection.operationalType !== item.operationalType) return false;
    if (item.visualVariant != null) {
      return selection.visualVariant === item.visualVariant;
    }
    return selection.visualVariant == null;
  }
  if (item.landscapeKind != null) {
    return selection.landscapeKind === item.landscapeKind;
  }
  if (item.zoneType != null) {
    return selection.zoneType === item.zoneType;
  }
  if (item.baseToolId != null) {
    return selection.baseToolId === item.baseToolId;
  }
  if (item.surfaceMaterial != null) {
    return selection.surfaceMaterial === item.surfaceMaterial;
  }
  return false;
}
