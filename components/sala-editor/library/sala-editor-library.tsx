"use client";

import { useEffect, useMemo, useState } from "react";
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

export function SalaEditorLibrary({ phase, selection, onSelectItem }: SalaEditorLibraryProps) {
  const {
    categories,
    filteredCategories,
    searchQuery,
    setSearchQuery,
    isSearching,
    hasSearchResults,
  } = useSalaEditorLibraryState(phase);

  const availableCategories = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          items: category.items.filter((item) => item.status === "available"),
        }))
        .filter(({ items }) => items.length > 0),
    [categories],
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    availableCategories[0]?.category.id ?? null,
  );

  useEffect(() => {
    const stillExists = availableCategories.some(
      ({ category }) => category.id === activeCategoryId,
    );
    if (!stillExists) {
      setActiveCategoryId(availableCategories[0]?.category.id ?? null);
    }
  }, [activeCategoryId, availableCategories, phase]);

  const visibleCategories = isSearching
    ? filteredCategories
    : availableCategories.filter(({ category }) => category.id === activeCategoryId);

  return (
    <div className="hostly-sala-library">
      <div className="hostly-sala-library__head">
        <div className="hostly-sala-library__heading-copy">
          <p className="hostly-sala-library__eyebrow">Biblioteca</p>
          <h2 className="hostly-sala-library__title">Elementos</h2>
          <p className="hostly-sala-library__subtitle">{PHASE_COPY[phase]}</p>
        </div>

        <label className="hostly-sala-library__search">
          <span className="hostly-sala-library__search-icon" aria-hidden>⌕</span>
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

        {!isSearching && availableCategories.length > 1 ? (
          <div className="hostly-sala-library__tabs" role="tablist" aria-label="Tipos de elementos">
            {availableCategories.map(({ category, items }) => {
              const active = category.id === activeCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={["hostly-sala-library__tab", active ? "is-active" : ""].filter(Boolean).join(" ")}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <span aria-hidden>{category.icon}</span>
                  <span>{category.label}</span>
                  <span className="hostly-sala-library__tab-count">{items.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="hostly-sala-library__scroll">
        {!hasSearchResults ? (
          <div className="hostly-sala-library__empty" role="status">
            <span className="hostly-sala-library__empty-icon" aria-hidden>⌕</span>
            <p className="hostly-sala-library__empty-title">No hay elementos que coincidan</p>
            <p className="hostly-sala-library__empty-copy">Prueba con otro nombre o elimina el filtro de búsqueda.</p>
          </div>
        ) : (
          <div className="hostly-sala-library__catalog" aria-label="Elementos disponibles">
            {visibleCategories.map(({ category, items }) => (
              <SalaEditorLibraryCategorySection
                key={category.id}
                category={category}
                expanded
                onToggle={() => undefined}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
