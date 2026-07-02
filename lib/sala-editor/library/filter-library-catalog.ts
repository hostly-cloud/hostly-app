/**
 * Filtrado visual de la biblioteca (sin modificar el catálogo).
 */

import { countAvailableLibraryItems } from "@/lib/sala-editor/library/editor-library-catalog";
import type {
  SalaEditorLibraryCategory,
  SalaEditorLibraryItem,
} from "@/lib/sala-editor/library/types";

export type FilteredLibraryCategory = {
  category: SalaEditorLibraryCategory;
  items: SalaEditorLibraryItem[];
};

export function normalizeLibrarySearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function isLibraryCategoryInteractive(
  category: SalaEditorLibraryCategory,
): boolean {
  return countAvailableLibraryItems(category) > 0;
}

export function filterSalaEditorLibraryCategories(
  categories: readonly SalaEditorLibraryCategory[],
  query: string,
): FilteredLibraryCategory[] {
  const normalizedQuery = normalizeLibrarySearchQuery(query);

  if (!normalizedQuery) {
    return categories.map((category) => ({
      category,
      items: category.items.filter((item) => item.status === "available"),
    }));
  }

  const results: FilteredLibraryCategory[] = [];

  for (const category of categories) {
    const availableItems = category.items.filter((item) => item.status === "available");
    const categoryMatches = category.label.toLowerCase().includes(normalizedQuery);
    const matchingItems = availableItems.filter((item) =>
      item.label.toLowerCase().includes(normalizedQuery),
    );

    if (matchingItems.length > 0) {
      results.push({ category, items: matchingItems });
      continue;
    }

    if (categoryMatches && availableItems.length > 0) {
      results.push({ category, items: availableItems });
    }
  }

  return results;
}
