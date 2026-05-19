/** Joins class strings; tiny stand-in where clsx/cn are not a project dependency. */
export function hostlyCx(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}
