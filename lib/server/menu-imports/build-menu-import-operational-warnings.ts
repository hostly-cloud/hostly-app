import { buildMenuImportOperationalWarnings } from "@/lib/carta/build-menu-import-operational-warnings";
import type {
  BuildMenuImportOperationalWarningsInput,
  MenuImportOperationalWarning,
} from "@/lib/carta/menu-import-operational-warnings-types";
import type { ImportedMenuItem, ImportedMenuSourceType } from "@/lib/carta/imported-menu-types";
import type { MenuImportInputMetadata } from "@/lib/carta/menu-import-debug-report-types";
import type { ParseMenuTextDiagnostics } from "./parse-menu-text";
import { MAX_VISION_PDF_PAGES } from "./menu-import-limits";
import { downloadMenuImportStorageFile } from "./download-storage-file";
import {
  hasImportCategoryHint,
  resolveImportCategoryForItem,
} from "./evaluate-import-item-for-publish";
import { loadHostlyCartaCategories } from "./load-hostly-carta-categories";
import type { Firestore } from "firebase-admin/firestore";

async function readPdfPageCount(buffer: Buffer): Promise<number | undefined> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      return typeof info.total === "number" && info.total > 0 ? info.total : undefined;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    return undefined;
  }
}

async function resolvePdfPageMeta(params: {
  sourceType: ImportedMenuSourceType;
  storagePath?: string;
  ocrMethod?: MenuImportInputMetadata["ocrMethod"];
  parserWarnings: string[];
}): Promise<{ pdfPagesDetected?: number; pdfPagesProcessed?: number }> {
  const truncated = params.parserWarnings.some((w) => w.includes("OCR PDF limitado"));
  const needsPdfMeta =
    params.sourceType === "pdf" && (truncated || params.ocrMethod === "vision_pdf");
  if (!needsPdfMeta) return {};

  const storagePath = params.storagePath?.trim();
  if (!storagePath) return { pdfPagesProcessed: MAX_VISION_PDF_PAGES };

  try {
    const downloaded = await downloadMenuImportStorageFile(storagePath);
    const detected = await readPdfPageCount(downloaded.buffer);
    if (!detected) return { pdfPagesProcessed: MAX_VISION_PDF_PAGES };
    return {
      pdfPagesDetected: detected,
      pdfPagesProcessed: Math.min(detected, MAX_VISION_PDF_PAGES),
    };
  } catch {
    return { pdfPagesProcessed: MAX_VISION_PDF_PAGES };
  }
}

function countUnresolvedCategoryItems(
  items: ImportedMenuItem[],
  categories: Awaited<ReturnType<typeof loadHostlyCartaCategories>>,
): number {
  return items.filter((item) => {
    if (!item.selectedForPublish) return false;
    if (!hasImportCategoryHint(item)) return false;
    return !resolveImportCategoryForItem(item, categories);
  }).length;
}

export async function buildMenuImportOperationalWarningsForDraft(params: {
  db: Firestore;
  restaurantId: string;
  sourceType: ImportedMenuSourceType;
  storagePath?: string;
  ocrMethod?: MenuImportInputMetadata["ocrMethod"];
  parserWarnings: string[];
  rawTextLength: number;
  items: ImportedMenuItem[];
  parseDiagnostics?: ParseMenuTextDiagnostics;
}): Promise<MenuImportOperationalWarning[]> {
  const [pdfMeta, categories] = await Promise.all([
    resolvePdfPageMeta({
      sourceType: params.sourceType,
      storagePath: params.storagePath,
      ocrMethod: params.ocrMethod,
      parserWarnings: params.parserWarnings,
    }),
    loadHostlyCartaCategories(params.db, params.restaurantId),
  ]);

  const input: BuildMenuImportOperationalWarningsInput = {
    sourceType: params.sourceType,
    ocrMethod: params.ocrMethod,
    parserWarnings: params.parserWarnings,
    rawTextLength: params.rawTextLength,
    itemCount: params.items.length,
    unresolvedCategoryItemCount: countUnresolvedCategoryItems(params.items, categories),
    visualCandidateRejectedReason: params.parseDiagnostics?.visualCandidateRejectedReason,
    ...pdfMeta,
  };

  return buildMenuImportOperationalWarnings(input);
}
