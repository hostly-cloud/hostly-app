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
  const { categories, toggleCategory, isExpanded } = useSalaEditorLibraryState(phase);

  return (
    <div className="hostly-sala-library">
      <div className="hostly-sala-library__head">
        <p className="hostly-sala-library__title">Biblioteca</p>
        <p className="hostly-sala-library__hint">Categorías por fase</p>
      </div>

      <div className="hostly-sala-library__scroll">
        {categories.map((category) => {
          const expanded = isExpanded(category.id);
          const hasItems = category.items.length > 0;

          return (
            <SalaEditorLibraryCategorySection
              key={category.id}
              category={category}
              expanded={expanded}
              onToggle={() => toggleCategory(category.id)}
            >
              {hasItems ? (
                <ul className="hostly-sala-library__items">
                  {category.items.map((item) => (
                    <SalaEditorLibraryItemRow
                      key={item.id}
                      item={item}
                      selected={isLibraryItemSelected(item, selection)}
                      onSelect={onSelectItem}
                    />
                  ))}
                </ul>
              ) : (
                <p className="hostly-sala-library__placeholder">
                  Disponible en una próxima versión.
                </p>
              )}
            </SalaEditorLibraryCategorySection>
          );
        })}
      </div>
    </div>
  );
}
