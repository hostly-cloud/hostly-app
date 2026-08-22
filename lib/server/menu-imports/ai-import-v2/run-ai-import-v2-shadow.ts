import type { Firestore } from "firebase-admin/firestore";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import { downloadMenuImportStorageFile } from "../download-storage-file";
import { loadHostlyProductFamilies } from "../load-hostly-product-families";
import { loadHostlyProductionStations } from "../load-hostly-production-stations";
import type { OcrLayoutLine } from "../menu-import-ocr-layout-types";
import { compareAiImportV2WithParser } from "./compare-ai-import-v2-with-parser";
import { buildAiImportV2Prompt, summarizeOcrLayout } from "./build-ai-import-v2-prompt";
import { extractWithAiImportV2 } from "./extract-with-ai-import-v2";
import { resolveRestaurantOperationalContext } from "./resolve-restaurant-operational-context";
import { validateAiImportV2Output } from "./validate-ai-import-v2-output";
import {
  isAiImportV2ShadowEnabled,
  resolveAiImportV2ApiMode,
  resolveAiImportV2Model,
  type AiImportV2RestaurantContextResult,
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
  db?: Firestore;
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

async function buildRestaurantContext(
  params: RunAiImportV2ShadowParams,
  acceptedItems: NonNullable<AiImportV2ShadowResult["validation"]>["accepted"],
): Promise<AiImportV2RestaurantContextResult | undefined> {
  if (!params.db) return undefined;

  try {
    const [productFamilies, productionStations] = await Promise.all([
      loadHostlyProductFamilies(params.db, params.restaurantId, { ensureDefaults: false }),
      loadHostlyProductionStations(params.db, params.restaurantId),
    ]);

    return resolveRestaurantOperationalContext({
      restaurantId: params.restaurantId,
      items: acceptedItems,
      productionStations,
      productFamilies,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESTAURANT_CONTEXT_LOAD_FAILED";
    console.warn("[Hostly][AI Import V2 Shadow] restaurant context unavailable", {
      restaurantId: params.restaurantId,
      error: message,
    });
    return undefined;
  }
}

/**
 * Ejecuta IA Import V2 en shadow mode. Nunca lanza: errores -> report con error.
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
    model: resolveAiImportV2Model(),
    apiMode: resolveAiImportV2ApiMode(),
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
    const { extraction, model, apiMode, usedVision } = await extractWithAiImportV2({
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
    const restaurantContext = await buildRestaurantContext(params, validation.accepted);

    const result: AiImportV2ShadowResult = {
      enabled: true,
      model,
      apiMode,
      usedVision,
      durationMs: Date.now() - started,
      extraction,
      validation,
      comparison,
      ...(restaurantContext ? { restaurantContext } : {}),
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
    console.warn("[Hostly][AI Import V2 Shadow] failed (non-blocking)", {
      error: message,
      model: result.model,
      apiMode: result.apiMode,
    });
    return result;
  }
}

function logShadowComparison(result: AiImportV2ShadowResult): void {
  if (!result.comparison) return;

  const c = result.comparison;
  const accepted = result.validation?.accepted ?? [];
  const operationalReviewCount = accepted.filter((item) => item.operationalWarnings.length > 0).length;
  const stationCounts = accepted.reduce<Record<string, number>>((acc, item) => {
    const station = item.operationalSuggestion.suggestedStation;
    acc[station] = (acc[station] ?? 0) + 1;
    return acc;
  }, {});

  console.info("[Hostly][AI Import V2 Shadow] comparison", {
    model: result.model,
    apiMode: result.apiMode,
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
    operationalReviewCount,
    stationCounts,
    restaurantContext: result.restaurantContext
      ? {
          productionStationsRead: result.restaurantContext.productionStationsRead,
          activeProductionStations: result.restaurantContext.activeProductionStations,
          productFamiliesRead: result.restaurantContext.productFamiliesRead,
          activeProductFamilies: result.restaurantContext.activeProductFamilies,
          fullyResolvedCount: result.restaurantContext.fullyResolvedCount,
          partialCount: result.restaurantContext.partialCount,
          reviewCount: result.restaurantContext.reviewCount,
          warnings: result.restaurantContext.warnings,
        }
      : null,
    operationalSample: accepted.slice(0, 8).map((item) => ({
      name: item.name,
      categoryType: item.operationalSuggestion.categoryType,
      productFamilyType: item.operationalSuggestion.productFamilyType,
      station: item.operationalSuggestion.suggestedStation,
      confidence: item.operationalSuggestion.confidence,
      warnings: item.operationalWarnings,
    })),
    resolvedTargetSample: result.restaurantContext?.targets.slice(0, 8),
    rejectedSample: result.validation?.rejected.slice(0, 4).map((r) => ({
      name: r.name,
      reasons: r.rejectionReasons,
    })),
  });
}

type ModelPricing = { inputPerM: number; outputPerM: number };

function resolveModelPricing(model: string): ModelPricing {
  if (model.startsWith("gpt-5.6-luna")) return { inputPerM: 0.2, outputPerM: 1.2 };
  if (model.startsWith("gpt-5.6-terra")) return { inputPerM: 2, outputPerM: 12 };
  if (model === "gpt-5.6" || model.startsWith("gpt-5.6-sol")) {
    return { inputPerM: 5, outputPerM: 30 };
  }
  return { inputPerM: 0.15, outputPerM: 0.6 };
}

/** Estimacion orientativa de coste por analisis (USD). */
export function estimateAiImportV2CostUsd(args: {
  rawTextChars: number;
  hasImage: boolean;
  model?: string;
}): { low: number; high: number; model: string } {
  const model = args.model || resolveAiImportV2Model();
  const textTokens = Math.ceil(args.rawTextChars / 4) + 800;
  const imageTokens = args.hasImage ? 1200 : 0;
  const outputTokens = 1200;
  const pricing = resolveModelPricing(model);
  const inputUsd = ((textTokens + imageTokens) / 1_000_000) * pricing.inputPerM;
  const outputUsd = (outputTokens / 1_000_000) * pricing.outputPerM;
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
