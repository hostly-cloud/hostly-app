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

  const visibleCategories = isSearching ? filteredCategories : categories.map((category) => ({
    category,
    items: category.items.filter((item) => item.status === "available"),
  }));

  return (
    <div className="hostly-sala-library">
      <div className="hostly-sala-library__head">
        <p className="hostly-sala-library__title">Biblioteca</p>
        <label className="hostly-sala-library__search">
          <span className="hostly-sala-library__search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar herramientas…"
            className="hostly-sala-library__search-input"
            aria-label="Buscar herramientas en la biblioteca"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="hostly-sala-library__scroll">
        {!hasSearchResults ? (
          <div className="hostly-sala-library__empty" role="status">
            <span className="hostly-sala-library__empty-icon" aria-hidden>
              🔍
            </span>
            <p className="hostly-sala-library__empty-title">
              No hay herramientas que coincidan
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
