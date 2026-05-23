/** Normaliza ids de grupos de modificadores (sin duplicados, orden estable). */
export function normalizeModifierGroupIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function readModifierGroupIdsFromRecord(
  data: Record<string, unknown>,
): string[] | undefined {
  const ids = normalizeModifierGroupIds(data.modifierGroupIds);
  return ids.length > 0 ? ids : undefined;
}

export function filterKnownActiveModifierGroupIds(
  ids: readonly string[],
  activeGroupIds: ReadonlySet<string>,
): string[] {
  return normalizeModifierGroupIds(ids).filter((id) => activeGroupIds.has(id));
}
