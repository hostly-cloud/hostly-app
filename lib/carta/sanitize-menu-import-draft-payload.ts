import type { ImportedMenuItem, ImportedMenuSection } from "./imported-menu-types";

/**
 * Elimina claves `undefined` en profundidad antes de escribir borradores IA en Firestore.
 * Conserva `null`, `false`, `0` y arrays vacíos; no convierte `undefined` en `null`.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(obj)) {
    if (nested === undefined) continue;
    const next = stripUndefinedDeep(nested);
    if (next !== undefined) {
      out[key] = next;
    }
  }
  return out as T;
}

export function normalizeMenuImportItemForPersist(item: ImportedMenuItem): Record<string, unknown> {
  return stripUndefinedDeep({
    ...item,
    description: item.description ?? "",
  }) as Record<string, unknown>;
}

export function normalizeMenuImportSectionsForPersist(
  sections: ImportedMenuSection[],
): Record<string, unknown>[] {
  return sections.map((section) =>
    stripUndefinedDeep({
      ...section,
      items: section.items.map((item) => normalizeMenuImportItemForPersist(item)),
    }),
  ) as Record<string, unknown>[];
}

export function sanitizeMenuImportDraftUpdatePatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };

  if (Array.isArray(patch.sections)) {
    out.sections = normalizeMenuImportSectionsForPersist(patch.sections as ImportedMenuSection[]);
  }
  if (Array.isArray(patch.items)) {
    out.items = (patch.items as ImportedMenuItem[]).map(normalizeMenuImportItemForPersist);
  }

  return stripUndefinedDeep(out) as Record<string, unknown>;
}
