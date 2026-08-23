import type { ImportedMenuSourceType } from "./imported-menu-types";

export const MAX_MENU_IMPORT_SOURCE_FILES = 12;

export type MenuImportSourceFile = {
  storagePath: string;
  originalFileName: string;
  sourceType: "image" | "pdf";
  order: number;
};

type LegacyMenuImportSource = {
  sourceType: ImportedMenuSourceType;
  storagePath?: string;
  originalFileName?: string;
  sourceFiles?: MenuImportSourceFile[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSourceType(value: unknown): MenuImportSourceFile["sourceType"] | null {
  return value === "image" || value === "pdf" ? value : null;
}

export function readMenuImportSourceFiles(raw: unknown): MenuImportSourceFile[] {
  if (!Array.isArray(raw)) return [];
  const files: MenuImportSourceFile[] = [];
  for (const entry of raw.slice(0, MAX_MENU_IMPORT_SOURCE_FILES)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const storagePath = text(record.storagePath);
    const originalFileName = text(record.originalFileName);
    const sourceType = readSourceType(record.sourceType);
    const order =
      typeof record.order === "number" && Number.isFinite(record.order)
        ? Math.max(0, Math.floor(record.order))
        : files.length;
    if (!storagePath || !originalFileName || !sourceType) continue;
    files.push({ storagePath, originalFileName, sourceType, order });
  }
  return files.sort((a, b) => a.order - b.order);
}

export function resolveMenuImportSourceFiles(
  draft: LegacyMenuImportSource,
): MenuImportSourceFile[] {
  const batch = readMenuImportSourceFiles(draft.sourceFiles);
  if (batch.length > 0) return batch;

  const storagePath = text(draft.storagePath);
  const originalFileName = text(draft.originalFileName);
  if (!storagePath || !originalFileName) return [];
  if (draft.sourceType !== "image" && draft.sourceType !== "pdf") return [];

  return [
    {
      storagePath,
      originalFileName,
      sourceType: draft.sourceType,
      order: 0,
    },
  ];
}

export function normalizeMenuImportSourceFilesForWrite(
  files: MenuImportSourceFile[],
): MenuImportSourceFile[] {
  return readMenuImportSourceFiles(
    files.map((file, index) => ({
      storagePath: file.storagePath,
      originalFileName: file.originalFileName,
      sourceType: file.sourceType,
      order: index,
    })),
  );
}
