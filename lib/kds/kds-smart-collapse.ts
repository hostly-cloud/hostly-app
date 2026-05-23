const STORAGE_PREFIX = "hostly.kds.collapsed";

function storageKey(scope: string, batchKey: string): string {
  return `${STORAGE_PREFIX}.${scope}.${batchKey}`;
}

export function readKdsBatchCollapsed(
  scope: string,
  batchKey: string,
  defaultCollapsed = false,
): boolean {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const raw = window.sessionStorage.getItem(storageKey(scope, batchKey));
    if (raw == null) return defaultCollapsed;
    return raw === "1";
  } catch {
    return defaultCollapsed;
  }
}

export function writeKdsBatchCollapsed(
  scope: string,
  batchKey: string,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(scope, batchKey), collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}
