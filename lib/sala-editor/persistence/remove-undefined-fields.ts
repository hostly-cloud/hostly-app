/** Elimina `undefined` recursivamente (Firestore lo rechaza). Conserva null/0/false. */
export function removeUndefinedFields<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedFields(item)) as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    clean[key] = removeUndefinedFields(entry);
  }
  return clean as T;
}
