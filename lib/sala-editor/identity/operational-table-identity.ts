/**
 * Identidad operativa determinista compartida por el publicador y el TPV.
 * El nombre visible de una mesa nunca participa en su identidad.
 */
export function stableOperationalTableIdFromEditorInstance(
  instanceId: string,
): string {
  const stable = instanceId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stable ? `v2-table-${stable}` : "";
}

export function isEditorGeneratedOperationalTableId(tableId: string): boolean {
  return tableId.trim().startsWith("v2-table-");
}
