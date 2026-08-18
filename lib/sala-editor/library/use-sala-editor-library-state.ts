"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterSalaEditorLibraryCategories,
  normalizeLibrarySearchQuery,
} from "@/lib/sala-editor/library/filter-library-catalog";
import {
  getDefaultExpandedLibraryCategoryId,
  getSalaEditorLibraryCategories,
} from "@/lib/sala-editor/library/editor-library-catalog";
import type { SalaEditorLibraryPhase } from "@/lib/sala-editor/library/types";

const STORAGE_KEY = "hostly-sala-editor-library-expanded-v1";

type ExpandedStateByPhase = Partial<Record<SalaEditorLibraryPhase, string[]>>;

function readExpandedState(): ExpandedStateByPhase {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ExpandedStateByPhase;
  } catch {
    return {};
  }
}

function writeExpandedState(state: ExpandedStateByPhase): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* preferencia de UI; ignorar fallo de storage */
  }
}

function resolveExpandedIds(phase: SalaEditorLibraryPhase): string[] {
  const categories = getSalaEditorLibraryCategories(phase);
  const stored = readExpandedState()[phase];
  if (stored && stored.length > 0) return stored;

  const defaultId = getDefaultExpandedLibraryCategoryId(categories);
  return defaultId ? [defaultId] : [];
}

export function useSalaEditorLibraryState(phase: SalaEditorLibraryPhase) {
  const categories = getSalaEditorLibraryCategories(phase);
  const [searchQuery, setSearchQuery] = useState("");
  const [manualExpandedIds, setManualExpandedIds] = useState<string[]>(() =>
    resolveExpandedIds(phase),
  );
  const preSearchExpandedIdsRef = useRef<string[] | null>(null);
  const manualExpandedIdsRef = useRef(manualExpandedIds);

  useEffect(() => {
    manualExpandedIdsRef.current = manualExpandedIds;
  }, [manualExpandedIds]);

  const normalizedSearch = normalizeLibrarySearchQuery(searchQuery);
  const isSearching = normalizedSearch.length > 0;

  const filteredCategories = useMemo(
    () => filterSalaEditorLibraryCategories(categories, searchQuery),
    [categories, searchQuery],
  );

  const searchExpandedIds = useMemo(
    () => filteredCategories.map((entry) => entry.category.id),
    [filteredCategories],
  );

  useEffect(() => {
    if (isSearching) {
      if (preSearchExpandedIdsRef.current === null) {
        preSearchExpandedIdsRef.current = manualExpandedIdsRef.current;
      }
      return;
    }

    if (preSearchExpandedIdsRef.current !== null) {
      setManualExpandedIds(preSearchExpandedIdsRef.current);
      preSearchExpandedIdsRef.current = null;
    }
  }, [isSearching]);

  useEffect(() => {
    if (isSearching) return;
    writeExpandedState({
      ...readExpandedState(),
      [phase]: manualExpandedIds,
    });
  }, [isSearching, manualExpandedIds, phase]);

  const toggleCategory = useCallback(
    (categoryId: string) => {
      if (isSearching) return;
      setManualExpandedIds((current) =>
        current.includes(categoryId)
          ? current.filter((id) => id !== categoryId)
          : [...current, categoryId],
      );
    },
    [isSearching],
  );

  const isExpanded = useCallback(
    (categoryId: string) => {
      if (isSearching) return searchExpandedIds.includes(categoryId);
      return manualExpandedIds.includes(categoryId);
    },
    [isSearching, manualExpandedIds, searchExpandedIds],
  );

  return {
    categories,
    filteredCategories,
    searchQuery,
    setSearchQuery,
    isSearching,
    hasSearchResults: !isSearching || filteredCategories.length > 0,
    toggleCategory,
    isExpanded,
  };
}
