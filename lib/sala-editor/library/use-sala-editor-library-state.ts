"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [expandedIds, setExpandedIds] = useState<string[]>(() =>
    resolveExpandedIds(phase),
  );

  useEffect(() => {
    setExpandedIds(resolveExpandedIds(phase));
  }, [phase]);

  useEffect(() => {
    writeExpandedState({
      ...readExpandedState(),
      [phase]: expandedIds,
    });
  }, [expandedIds, phase]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }, []);

  const isExpanded = useCallback(
    (categoryId: string) => expandedIds.includes(categoryId),
    [expandedIds],
  );

  return {
    categories,
    expandedIds,
    toggleCategory,
    isExpanded,
  };
}
