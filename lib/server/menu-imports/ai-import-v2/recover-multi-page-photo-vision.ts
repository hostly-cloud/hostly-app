import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import type { MenuImportSourceFile } from "@/lib/carta/menu-import-source-files";
import type { ExtractMenuTextResult } from "../extract-menu-text";
import { parseMenuText } from "../parse-menu-text";
import { mergePhotoVisionItems } from "./merge-photo-vision-items";
import { runAiImportV2Shadow } from "./run-ai-import-v2-shadow";
import {
  isAiImportV2PhotoRecoveryEnabled,
  type AiImportV2ShadowReport,
} from "./types";

const MAX_PAGE_VISION_CONCURRENCY = 2;

type ParsedPage = {
  source: MenuImportSourceFile;
  extraction: ExtractMenuTextResult;
  parsed: ReturnType<typeof parseMenuText>;
};

type ShadowRunner = typeof runAiImportV2Shadow;

export type MultiPagePhotoVisionRecoveryResult = {
  pages: ParsedPage[];
  recoveredCount: number;
  warnings: string[];
  reports: Array<AiImportV2ShadowReport | null>;
};

export async function recoverMultiPagePhotoVision(params: {
  restaurantId: string;
  draftId: string;
  menuType: MenuImportMenuType;
  pages: readonly ParsedPage[];
  runShadow?: ShadowRunner;
}): Promise<MultiPagePhotoVisionRecoveryResult> {
  if (!isAiImportV2PhotoRecoveryEnabled() || params.pages.length < 2) {
    return {
      pages: [...params.pages],
      recoveredCount: 0,
      warnings: [],
      reports: params.pages.map(() => null),
    };
  }

  const runShadow = params.runShadow ?? runAiImportV2Shadow;
  const pages = params.pages.map((page) => ({
    ...page,
    parsed: { ...page.parsed, items: [...page.parsed.items] },
  }));
  const reports: Array<AiImportV2ShadowReport | null> = pages.map(() => null);
  const warnings: string[] = [];
  let recoveredCount = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const pageIndex = cursor;
      cursor += 1;
      if (pageIndex >= pages.length) return;

      const page = pages[pageIndex];
      if (page.source.sourceType !== "image") continue;

      const report = await runShadow({
        restaurantId: params.restaurantId,
        draftId: params.draftId,
        rawText: page.extraction.rawText,
        parserItems: page.parsed.items,
        menuType: params.menuType,
        sourceType: "image",
        storagePath: page.source.storagePath,
        originalFileName: page.source.originalFileName,
        ocrLayoutLines: page.extraction.ocrLayoutLines,
      }).catch(() => null);
      reports[pageIndex] = report;

      if (
        report?.usedVision !== true ||
        !report.validation?.accepted.length
      ) {
        continue;
      }

      const merged = mergePhotoVisionItems({
        existingItems: page.parsed.items,
        acceptedVisionItems: report.validation.accepted,
        duplicateMode: "name_price",
        idPrefix: "photo-vision",
        warningTags: [`photo_vision_page_${pageIndex + 1}`],
      });
      if (merged.recoveredCount === 0) continue;

      page.parsed.items = merged.items;
      recoveredCount += merged.recoveredCount;
      warnings.push(
        `photo_vision_page_${pageIndex + 1}_recovered:${merged.recoveredCount}`,
      );
    }
  }

  const workerCount = Math.min(MAX_PAGE_VISION_CONCURRENCY, pages.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { pages, recoveredCount, warnings, reports };
}
