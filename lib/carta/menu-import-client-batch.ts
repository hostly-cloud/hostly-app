import { MAX_MENU_IMPORT_SOURCE_FILES } from "@/lib/carta/menu-import-source-files";

export type MenuImportClientFileLike = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
};

export type MenuImportBatchSelectionErrorCode =
  | "MENU_IMPORT_FILES_REQUIRED"
  | "MENU_IMPORT_BATCH_TOO_LARGE"
  | "MENU_IMPORT_BATCH_PDF_MIXED"
  | "MENU_IMPORT_FILE_TYPE_UNSUPPORTED";

export type MenuImportBatchSelectionValidation =
  | { ok: true }
  | { ok: false; code: MenuImportBatchSelectionErrorCode };

function fileIdentity(file: MenuImportClientFileLike): string {
  return [file.name, file.size, file.type, file.lastModified ?? 0].join("::");
}

export function dedupeMenuImportBatchFiles<T extends MenuImportClientFileLike>(
  files: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const file of files) {
    const key = fileIdentity(file);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

export function validateMenuImportBatchSelection(
  files: readonly MenuImportClientFileLike[],
): MenuImportBatchSelectionValidation {
  if (files.length === 0) {
    return { ok: false, code: "MENU_IMPORT_FILES_REQUIRED" };
  }
  if (files.length > MAX_MENU_IMPORT_SOURCE_FILES) {
    return { ok: false, code: "MENU_IMPORT_BATCH_TOO_LARGE" };
  }
  if (files.some((file) => !file.type.startsWith("image/") && file.type !== "application/pdf")) {
    return { ok: false, code: "MENU_IMPORT_FILE_TYPE_UNSUPPORTED" };
  }
  if (files.length > 1 && files.some((file) => file.type === "application/pdf")) {
    return { ok: false, code: "MENU_IMPORT_BATCH_PDF_MIXED" };
  }
  return { ok: true };
}

export function moveMenuImportBatchFile<T>(
  files: readonly T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= files.length || nextIndex < 0 || nextIndex >= files.length) {
    return [...files];
  }
  const next = [...files];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function removeMenuImportBatchFile<T>(files: readonly T[], index: number): T[] {
  if (index < 0 || index >= files.length) return [...files];
  return files.filter((_, currentIndex) => currentIndex !== index);
}

type GlobalMenuImportBatchRegistry = typeof globalThis & {
  __hostlyMenuImportBatchRegistry?: WeakMap<File, readonly File[]>;
};

function getRegistry(): WeakMap<File, readonly File[]> {
  const globalWithRegistry = globalThis as GlobalMenuImportBatchRegistry;
  if (!globalWithRegistry.__hostlyMenuImportBatchRegistry) {
    globalWithRegistry.__hostlyMenuImportBatchRegistry = new WeakMap<File, readonly File[]>();
  }
  return globalWithRegistry.__hostlyMenuImportBatchRegistry;
}

export function registerMenuImportBatch(primaryFile: File, files: readonly File[]): void {
  const normalized = dedupeMenuImportBatchFiles(files);
  if (normalized.length === 0) {
    getRegistry().delete(primaryFile);
    return;
  }
  getRegistry().set(primaryFile, normalized);
}

export function readRegisteredMenuImportBatch(primaryFile: File): readonly File[] | undefined {
  return getRegistry().get(primaryFile);
}

export function clearRegisteredMenuImportBatch(primaryFile: File): void {
  getRegistry().delete(primaryFile);
}
