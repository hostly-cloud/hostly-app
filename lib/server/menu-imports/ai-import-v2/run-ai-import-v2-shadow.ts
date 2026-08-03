import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import { downloadMenuImportStorageFile } from "../download-storage-file";
import type { OcrLayoutLine } from "../menu-import-ocr-layout-types";
import { compareAiImportV2WithParser } from "./compare-ai-import-v2-with-parser";
import { buildAiImportV2Prompt, summarizeOcrLayout } from "./build-ai-import-v2-prompt";
import { extractWithAiImportV2 } from "./extract-with-ai-import-v2";
import { validateAiImportV2Output } from "./validate-ai-import-v2-output";
import {
  isAiImportV2ShadowEnabled,
  type AiImportV2ShadowReport,
  type AiImportV2ShadowResult,
} from "./types";

function isImageContent(contentType: string, fileName?: string): boolean {
  if (contentType.startsWith("image/")) return true;
  return Boolean(fileName && /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(fileName));
}

async function resolveImageDataUrl(args: {
  restaurantId: string;
  draftId: string;
  sourceType: "image" | "pdf" | "qr_url";
  storagePath?: string;
  originalFileName?: string;
}): Promise<string | undefined> {
  if (args.sourceType !== "image") return undefined;
  const storagePath = args.storagePath;
  if (typeof storagePath !== "string" || !storagePath) return undefined;

  try {
    const downloaded = await downloadMenuImportStorageFile(storagePath, {
      restaurantId: args.restaurantId,
      draftId: args.draftId,
    });
    if (!isImageContent(downloaded.contentType, args.originalFileName)) return undefined;
    const base64 = downloaded.buffer.toString("base64");
    return `data:${downloaded.contentType};base64,${base64}`;
  } catch {
    return undefined;
  }
}

export type RunAiImportV2ShadowParams = {
  restaurantId: string;
  draftId: string;
  rawText: string;
  parserItems: ImportedMenuItem[];
  menuType: MenuImportMenuType;
  sourceType: "image" | "pdf" | "qr_url";
  storagePath?: string;
  originalFileName?: string;
  ocrLayoutLines?: OcrLayoutLine[];
};

/**
 * Ejecuta IA Import V2 en shadow mode. Nunca lanza: errores → report con error.
 * Sin flag HOSTLY_AI_IMPORT_V2_SHADOW=true devuelve null (cero impacto).
 */
export async function runAiImportV2Shadow(
  params: RunAiImportV2ShadowParams,
): Promise<AiImportV2ShadowReport | null> {
  if (!isAiImportV2ShadowEnabled()) return null;

  const started = Date.now();
  const layoutSummary = params.ocrLayoutLines?.length
    ? summarizeOcrLayout(
        params.ocrLayoutLines.map((line) => ({
          text: line.text,
          centerX: line.box.centerX,
          centerY: line.box.centerY,
        })),
      )
    : undefined;

  let imageDataUrl: string | undefined;
  try {
    imageDataUrl = await resolveImageDataUrl({
      restaurantId: params.restaurantId,
      draftId: params.draftId,
      sourceType: params.sourceType,
      storagePath: params.storagePath,
      originalFileName: params.originalFileName,
    });
  } catch {
    imageDataUrl = undefined;
  }

  const baseResult = (): AiImportV2ShadowResult => ({
    enabled: true,
    model: process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() || process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini",
    usedVision: Boolean(imageDataUrl),
    durationMs: Date.now() - started,
    extraction: null,
    validation: null,
    comparison: null,
    tokenEstimate: {
      inputChars: params.rawText.length,
      layoutChars: layoutSummary?.length ?? 0,
      hasImage: Boolean(imageDataUrl),
    },
  });

  try {
    const { extraction, model, usedVision } = await extractWithAiImportV2({
      rawText: params.rawText,
      parserItems: params.parserItems,
      menuType: params.menuType,
      sourceType: params.sourceType,
      storagePath: params.storagePath,
      originalFileName: params.originalFileName,
      layoutSummary,
      imageDataUrl,
    });

    const validation = validateAiImportV2Output(extraction, params.rawText);
    const comparison = compareAiImportV2WithParser({
      parserItems: params.parserItems,
      v2Accepted: validation.accepted,
      v2RejectedCount: validation.rejected.length,
    });

    const result: AiImportV2ShadowResult = {
      enabled: true,
      model,
      usedVision,
      durationMs: Date.now() - started,
      extraction,
      validation,
      comparison,
      tokenEstimate: {
        inputChars: params.rawText.length,
        layoutChars: layoutSummary?.length ?? 0,
        hasImage: usedVision,
      },
    };

    logShadowComparison(result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI_IMPORT_V2_SHADOW_FAILED";
    const result = baseResult();
    result.error = message;
    console.warn("[Hostly][AI Import V2 Shadow] failed (non-blocking)", { error: message });
    return result;
  }
}

function logShadowComparison(result: AiImportV2ShadowResult): void {
  if (!result.comparison) return;

  const c = result.comparison;
  console.info("[Hostly][AI Import V2 Shadow] comparison", {
    model: result.model,
    usedVision: result.usedVision,
    durationMs: result.durationMs,
    parserDetected: c.parserDetected,
    v2Accepted: c.v2Accepted,
    v2Rejected: c.v2Rejected,
    matchedBoth: c.matchedBoth,
    parserOnly: c.parserOnly.slice(0, 8).map((p) => p.name),
    v2Only: c.v2Only.slice(0, 8).map((p) => p.name),
    priceMismatches: c.priceMismatches.length,
    parserVsV2Recall: c.parserVsV2Recall,
    parserVsV2Precision: c.parserVsV2Precision,
    avgV2Confidence: c.avgV2Confidence,
    rejectedSample: result.validation?.rejected.slice(0, 4).map((r) => ({
      name: r.name,
      reasons: r.rejectionReasons,
    })),
  });
}

/** Estimación orientativa de coste por análisis (USD). */
export function estimateAiImportV2CostUsd(args: {
  rawTextChars: number;
  hasImage: boolean;
  model?: string;
}): { low: number; high: number; model: string } {
  const model = args.model || process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() || "gpt-4o-mini";
  const textTokens = Math.ceil(args.rawTextChars / 4) + 800;
  const imageTokens = args.hasImage ? 1200 : 0;
  const outputTokens = 1200;
  const inputCostPerM = args.hasImage ? 0.15 : 0.15;
  const outputCostPerM = 0.6;
  const inputUsd = ((textTokens + imageTokens) / 1_000_000) * inputCostPerM;
  const outputUsd = (outputTokens / 1_000_000) * outputCostPerM;
  const total = inputUsd + outputUsd;
  return { low: total * 0.8, high: total * 1.4, model };
}

export function buildShadowPromptPreview(params: RunAiImportV2ShadowParams): string {
  const layoutSummary = params.ocrLayoutLines?.length
    ? summarizeOcrLayout(
        params.ocrLayoutLines.map((line) => ({
          text: line.text,
          centerX: line.box.centerX,
          centerY: line.box.centerY,
        })),
      )
    : undefined;

  return buildAiImportV2Prompt({
    rawText: params.rawText,
    menuType: params.menuType,
    layoutSummary,
    hasImage: params.sourceType === "image" && Boolean(params.storagePath),
  });
}
