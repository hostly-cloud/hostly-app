"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Selección múltiple de productos (Fase 1).
 * IDs globales en pantalla: persisten al cambiar filtro/búsqueda.
 */
export function useProductosSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const toggleRowSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAllDisplayed = useCallback((displayedIds: readonly string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn =
        displayedIds.length > 0 && displayedIds.every((id) => next.has(id));
      if (allOn) {
        for (const id of displayedIds) next.delete(id);
      } else {
        for (const id of displayedIds) next.add(id);
      }
      return next;
    });
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    selectAllRef,
    toggleRowSelected,
    clearSelection,
    toggleSelectAllDisplayed,
  };
}
