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

function getLibraryItemMeta(item: SalaEditorLibraryItem): string {
  if (item.operationalType != null) return "Operación";
  if (item.structuralKind != null) return "Estructura";
  if (item.landscapeKind != null) return "Paisajismo";
  if (item.zoneType != null) return "Zona";
  if (item.surfaceMaterial != null) return "Superficie";
  if (item.baseToolId != null) return "Base del plano";
  return "Elemento";
}

function getLibraryItemVisual(item: SalaEditorLibraryItem): string {
  if (item.operationalType != null) return "OP";
  if (item.structuralKind != null) return "ES";
  if (item.landscapeKind != null) return "PA";
  if (item.zoneType != null) return "ZO";
  if (item.surfaceMaterial != null) return "SU";
  if (item.baseToolId != null) return "BA";
  return "EL";
}

export function SalaEditorLibraryItemRow({
  item,
  selected,
  onSelect,
}: SalaEditorLibraryItemProps) {
  const disabled = item.status === "upcoming";
  const meta = getLibraryItemMeta(item);
  const visual = getLibraryItemVisual(item);

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
        <span className="hostly-sala-library__item-preview" aria-hidden>
          <span className="hostly-sala-library__item-preview-mark">{visual}</span>
        </span>

        <span className="hostly-sala-library__item-copy">
          <span className="hostly-sala-library__item-label">{item.label}</span>
          <span className="hostly-sala-library__item-meta">
            {disabled ? "Disponible próximamente" : meta}
          </span>
        </span>

        <span
          className="hostly-sala-library__item-state"
          aria-hidden
        >
          {disabled ? "" : selected ? "✓" : "+"}
        </span>

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
