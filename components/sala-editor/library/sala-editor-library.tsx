"use client";

import type {
  SalaEditorLibraryItem,
  SalaEditorLibraryPhase,
  SalaEditorLibrarySelection,
} from "@/lib/sala-editor/library/types";
import { useSalaEditorLibraryState } from "@/lib/sala-editor/library/use-sala-editor-library-state";
import { SalaEditorLibraryCategorySection } from "@/components/sala-editor/library/sala-editor-library-category";
import {
  SalaEditorLibraryItemRow,
  isLibraryItemSelected,
} from "@/components/sala-editor/library/sala-editor-library-item";

export type SalaEditorLibraryProps = {
  phase: SalaEditorLibraryPhase;
  selection: SalaEditorLibrarySelection;
  onSelectItem: (item: SalaEditorLibraryItem) => void;
};

const PHASE_COPY: Record<SalaEditorLibraryPhase, string> = {
  base: "Define la base del plano",
  terreno: "Configura superficies y terreno",
  zonas: "Organiza espacios opcionales",
  estructura: "Añade límites y accesos",
  paisajismo: "Completa el ambiente",
  operacion: "Coloca los elementos del servicio",
};

export function SalaEditorLibrary({
  phase,
  selection,
  onSelectItem,
}: SalaEditorLibraryProps) {
  const {
    categories,
    filteredCategories,
    searchQuery,
    setSearchQuery,
    isSearching,
    hasSearchResults,
    toggleCategory,
    isExpanded,
  } = useSalaEditorLibraryState(phase);

  const visibleCategories = isSearching
    ? filteredCategories
    : categories.map((category) => {
        const hasAvailableItems = category.items.some(
          (item) => item.status === "available",
        );
        return {
          category,
          items: hasAvailableItems
            ? category.items
            : category.items.filter((item) => item.status === "available"),
        };
      });

  return (
    <div className="hostly-sala-library">
      <div className="hostly-sala-library__head">
        <div className="hostly-sala-library__heading-copy">
          <p className="hostly-sala-library__eyebrow">Biblioteca</p>
          <h2 className="hostly-sala-library__title">Elementos</h2>
          <p className="hostly-sala-library__subtitle">{PHASE_COPY[phase]}</p>
        </div>

        <label className="hostly-sala-library__search">
          <span className="hostly-sala-library__search-icon" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar en esta fase"
            className="hostly-sala-library__search-input"
            aria-label="Buscar elementos"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="hostly-sala-library__scroll">
        {!hasSearchResults ? (
          <div className="hostly-sala-library__empty" role="status">
            <span className="hostly-sala-library__empty-icon" aria-hidden>
              ⌕
            </span>
            <p className="hostly-sala-library__empty-title">
              No hay elementos que coincidan
            </p>
            <p className="hostly-sala-library__empty-copy">
              Prueba con otro nombre o elimina el filtro de búsqueda.
            </p>
          </div>
        ) : (
          visibleCategories.map(({ category, items }) => (
            <SalaEditorLibraryCategorySection
              key={category.id}
              category={category}
              expanded={isExpanded(category.id)}
              onToggle={() => toggleCategory(category.id)}
            >
              <ul className="hostly-sala-library__items">
                {items.map((item) => (
                  <SalaEditorLibraryItemRow
                    key={item.id}
                    item={item}
                    selected={isLibraryItemSelected(item, selection)}
                    onSelect={onSelectItem}
                  />
                ))}
              </ul>
            </SalaEditorLibraryCategorySection>
          ))
        )}
      </div>
    </div>
  );
}
