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

function LibraryItemGlyph({ item }: { item: SalaEditorLibraryItem }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (item.operationalType === "TABLE") {
    if (item.visualVariant === "round") {
      return <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="9" {...common}/><path d="M20 5v5M20 30v5M5 20h5M30 20h5" {...common}/></svg>;
    }
    if (item.visualVariant === "rectangular") {
      return <svg viewBox="0 0 40 40"><rect x="10" y="14" width="20" height="12" rx="3" {...common}/><path d="M14 8v5M26 8v5M14 27v5M26 27v5" {...common}/></svg>;
    }
    return <svg viewBox="0 0 40 40"><rect x="12" y="12" width="16" height="16" rx="3" {...common}/><path d="M20 5v5M20 30v5M5 20h5M30 20h5" {...common}/></svg>;
  }

  if (item.operationalType === "BAR_L") {
    return <svg viewBox="0 0 40 40"><path d="M11 9v20h18" {...common}/><path d="M16 14v10h9" {...common}/></svg>;
  }
  if (item.operationalType === "BAR_STRAIGHT") {
    return <svg viewBox="0 0 40 40"><rect x="8" y="15" width="24" height="10" rx="3" {...common}/><path d="M13 12v3M20 12v3M27 12v3" {...common}/></svg>;
  }
  if (item.operationalType != null) {
    return <svg viewBox="0 0 40 40"><rect x="10" y="11" width="20" height="18" rx="5" {...common}/><path d="M15 20h10M20 15v10" {...common}/></svg>;
  }

  if (item.structuralKind === "wall") return <svg viewBox="0 0 40 40"><path d="M7 24h26M10 18h20" {...common}/></svg>;
  if (item.structuralKind === "door") return <svg viewBox="0 0 40 40"><path d="M10 30V10h14v20" {...common}/><path d="M24 10a14 14 0 0 1 14 14" {...common}/></svg>;
  if (item.structuralKind === "glass") return <svg viewBox="0 0 40 40"><rect x="9" y="11" width="22" height="18" rx="2" {...common}/><path d="M15 11v18M25 11v18" {...common}/></svg>;
  if (item.structuralKind === "roundColumn") return <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="8" {...common}/><circle cx="20" cy="20" r="3" {...common}/></svg>;
  if (item.structuralKind != null) return <svg viewBox="0 0 40 40"><rect x="12" y="12" width="16" height="16" rx="2" {...common}/></svg>;

  if (item.landscapeKind != null) return <svg viewBox="0 0 40 40"><circle cx="20" cy="18" r="8" {...common}/><path d="M20 26v8M14 30h12" {...common}/></svg>;
  if (item.zoneType != null) return <svg viewBox="0 0 40 40"><rect x="8" y="9" width="24" height="22" rx="4" strokeDasharray="3 3" {...common}/></svg>;
  if (item.surfaceMaterial != null) return <svg viewBox="0 0 40 40"><path d="M8 13h24M8 20h24M8 27h24" {...common}/></svg>;
  return <svg viewBox="0 0 40 40"><rect x="10" y="10" width="20" height="20" rx="5" {...common}/></svg>;
}

export function SalaEditorLibraryItemRow({ item, selected, onSelect }: SalaEditorLibraryItemProps) {
  const disabled = item.status === "upcoming";
  return (
    <li className="hostly-sala-library__item">
      <button
        type="button"
        className={["hostly-sala-library__item-btn", selected && !disabled ? "is-selected" : "", disabled ? "is-upcoming" : ""].filter(Boolean).join(" ")}
        disabled={disabled}
        aria-pressed={disabled ? undefined : selected}
        aria-disabled={disabled}
        title={disabled ? `${item.label} — Próximamente` : item.label}
        onClick={() => { if (!disabled) onSelect(item); }}
      >
        <span className="hostly-sala-library__item-preview" aria-hidden><LibraryItemGlyph item={item} /></span>
        <span className="hostly-sala-library__item-copy">
          <span className="hostly-sala-library__item-label">{item.label}</span>
          <span className="hostly-sala-library__item-meta">{disabled ? "Disponible próximamente" : getLibraryItemMeta(item)}</span>
        </span>
        <span className="hostly-sala-library__item-state" aria-hidden>{disabled ? "" : selected ? "✓" : "+"}</span>
        {disabled ? <span className="hostly-sala-library__item-badge">Próximamente</span> : null}
      </button>
    </li>
  );
}

export function isLibraryItemSelected(item: SalaEditorLibraryItem, selection: SalaEditorLibrarySelection): boolean {
  if (item.status !== "available") return false;
  if (item.structuralKind != null) return selection.structuralKind === item.structuralKind;
  if (item.operationalType != null) {
    if (selection.operationalType !== item.operationalType) return false;
    if (item.visualVariant != null) return selection.visualVariant === item.visualVariant;
    return selection.visualVariant == null;
  }
  if (item.landscapeKind != null) return selection.landscapeKind === item.landscapeKind;
  if (item.zoneType != null) return selection.zoneType === item.zoneType;
  if (item.baseToolId != null) return selection.baseToolId === item.baseToolId;
  if (item.surfaceMaterial != null) return selection.surfaceMaterial === item.surfaceMaterial;
  return false;
}
