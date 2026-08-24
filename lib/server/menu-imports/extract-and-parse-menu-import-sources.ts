import type { MenuImportDraftDocument } from "@/lib/firestore/menu-import-drafts";
import type { MenuImportSourceFile } from "@/lib/carta/menu-import-source-files";
import { resolveMenuImportSourceFiles } from "@/lib/carta/menu-import-source-files";
import { assertMenuImportStoragePathForDraft } from "./download-storage-file";
import { extractMenuText, type ExtractMenuTextResult } from "./extract-menu-text";
import { parseMenuText } from "./parse-menu-text";
import { mergeMenuImportPageItems } from "./merge-menu-import-pages";

export type ParsedMenuImportPage = {
  source: MenuImportSourceFile;
  extraction: ExtractMenuTextResult;
  parsed: ReturnType<typeof parseMenuText>;
};

export type ParsedMenuImportSources = {
  sourceCount: number;
  rawText: string;
  extractionWarnings: string[];
  parserWarnings: string[];
  items: ReturnType<typeof parseMenuText>["items"];
  diagnostics?: ReturnType<typeof parseMenuText>["diagnostics"];
  primaryExtraction?: ExtractMenuTextResult;
  primaryStoragePath?: string;
  primaryOriginalFileName?: string;
  pages?: ParsedMenuImportPage[];
  multiSource: boolean;
};

export async function extractAndParseMenuImportSources(params: {
  restaurantId: string;
  draftId: string;
  draft: MenuImportDraftDocument;
}): Promise<ParsedMenuImportSources> {
  const { restaurantId, draftId, draft } = params;

  if (draft.sourceType === "qr_url") {
    const extracted = await extractMenuText({
      restaurantId,
      draftId,
      sourceType: "qr_url",
      menuType: draft.menuType,
      sourceUrl: draft.sourceUrl,
    });
    const parsed = parseMenuText(extracted.rawText, {
      sourceType: "qr_url",
      menuType: draft.menuType,
      ocrLayoutLines: extracted.ocrLayoutLines,
      ocrPageWidth: extracted.ocrPageWidth,
      ocrPageHeight: extracted.ocrPageHeight,
    });
    return {
      sourceCount: 1,
      rawText: extracted.rawText,
      extractionWarnings: extracted.warnings,
      parserWarnings: parsed.warnings,
      items: parsed.items,
      diagnostics: parsed.diagnostics,
      primaryExtraction: extracted,
      multiSource: false,
    };
  }

  const sourceFiles = resolveMenuImportSourceFiles(draft);
  if (sourceFiles.length === 0) {
    throw new Error("Falta archivo subido en Storage para este borrador");
  }

  for (const source of sourceFiles) {
    assertMenuImportStoragePathForDraft(source.storagePath, { restaurantId, draftId });
  }

  const pages: ParsedMenuImportPage[] = [];

  for (const source of sourceFiles) {
    const extraction = await extractMenuText({
      restaurantId,
      draftId,
      sourceType: source.sourceType,
      menuType: draft.menuType,
      storagePath: source.storagePath,
      originalFileName: source.originalFileName,
    });
    const parsed = parseMenuText(extraction.rawText, {
      sourceType: source.sourceType,
      menuType: draft.menuType,
      ocrLayoutLines: extraction.ocrLayoutLines,
      ocrPageWidth: extraction.ocrPageWidth,
      ocrPageHeight: extraction.ocrPageHeight,
    });
    pages.push({ source, extraction, parsed });
  }

  if (pages.length === 1) {
    const page = pages[0];
    const source = sourceFiles[0];
    return {
      sourceCount: 1,
      rawText: page.extraction.rawText,
      extractionWarnings: page.extraction.warnings,
      parserWarnings: page.parsed.warnings,
      items: page.parsed.items,
      diagnostics: page.parsed.diagnostics,
      primaryExtraction: page.extraction,
      primaryStoragePath: source.storagePath,
      primaryOriginalFileName: source.originalFileName,
      pages,
      multiSource: false,
    };
  }

  const merged = mergeMenuImportPageItems(
    pages.map((page, pageIndex) => ({ pageIndex, items: page.parsed.items })),
  );
  const rawText = pages
    .map((page, pageIndex) => `--- PÁGINA ${pageIndex + 1} ---\n${page.extraction.rawText}`)
    .join("\n\n");
  const extractionWarnings = pages.flatMap((page, pageIndex) =>
    page.extraction.warnings.map((warning) => `página ${pageIndex + 1}: ${warning}`),
  );
  extractionWarnings.push(`multi_page_sources:${pages.length}`);
  if (merged.duplicateCount > 0) {
    extractionWarnings.push(`multi_page_duplicates_skipped:${merged.duplicateCount}`);
  }

  return {
    sourceCount: pages.length,
    rawText,
    extractionWarnings,
    parserWarnings: pages.flatMap((page, pageIndex) =>
      page.parsed.warnings.map((warning) => `página ${pageIndex + 1}: ${warning}`),
    ),
    items: merged.items,
    pages,
    multiSource: true,
  };
}
