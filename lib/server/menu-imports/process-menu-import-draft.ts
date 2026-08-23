import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { MenuImportDraftDocument } from "@/lib/firestore/menu-import-drafts";
import {
  assertMenuImportStoragePathForDraft,
  truncateRawTextForStorage,
} from "./download-storage-file";
import { enrichMenuItemsWithAI } from "./enrich-menu-items-with-ai";
import { extractMenuText } from "./extract-menu-text";
import {
  MenuImportPipelineTracer,
  type MenuImportPipelineStep,
} from "./menu-import-pipeline-diagnostics";
import {
  explainOcrValidationDecision,
  filterItemsByOcrSource,
  logOcrValidationDiagnostics,
} from "./validate-items-against-ocr";
import { loadHostlyCategoryNames } from "./load-hostly-categories";
import {
  getMenuImportDraftAdmin,
  updateMenuImportDraftAdmin,
} from "./menu-import-draft-admin";
import {
  groupParsedItemsIntoSections,
  normalizeMenuImportOcrText,
  parseMenuText,
} from "./parse-menu-text";
import {
  buildMenuImportDebugReport,
  type MenuImportDebugReport,
} from "./menu-import-debug-report";
import { isMenuImportDebugReportEnabled } from "@/lib/carta/menu-import-debug-report-types";
import type { MenuImportOperationalWarning } from "@/lib/carta/menu-import-operational-warnings-types";
import { buildMenuImportOperationalWarningsForDraft } from "./build-menu-import-operational-warnings";
import { runAiImportV2Shadow } from "./ai-import-v2/run-ai-import-v2-shadow";
import { mergePhotoVisionItems } from "./ai-import-v2/merge-photo-vision-items";
import {
  isAiImportV2PhotoRecoveryEnabled,
  type AiImportV2ShadowReport,
} from "./ai-import-v2/types";

const ANALYZING_STALE_MS = 2 * 60 * 1000;

export class ProcessMenuImportDraftError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ProcessMenuImportDraftError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type ProcessMenuImportDraftResult = {
  draftId: string;
  status: MenuImportDraftDocument["status"];
  alreadyProcessed: boolean;
  itemCount: number;
  debugReport?: MenuImportDebugReport;
  operationalWarnings?: MenuImportOperationalWarning[];
  aiImportV2Shadow?: AiImportV2ShadowReport;
};

export async function processMenuImportDraft(params: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  userId: string;
}): Promise<ProcessMenuImportDraftResult> {
  const { db, restaurantId, userId } = params;
  const draftId = params.draftId.trim();
  if (!draftId) {
    throw new ProcessMenuImportDraftError("INVALID_DRAFT_ID", "draftId obligatorio", 400);
  }

  const draft = await getMenuImportDraftAdmin(db, restaurantId, draftId);
  if (!draft) {
    throw new ProcessMenuImportDraftError("DRAFT_NOT_FOUND", "Borrador no encontrado", 404);
  }

  const trace = new MenuImportPipelineTracer({
    draftId,
    restaurantId,
    fileName: draft.originalFileName ?? null,
    sourceType: draft.sourceType,
  });

  trace.step("draft_loaded", {
    status: draft.status,
    storagePath: draft.storagePath ?? null,
    sourceUrl: draft.sourceUrl ?? null,
    existingItems: draft.items.length,
    existingSections: draft.sections.length,
  });

  if (draft.restaurantId !== restaurantId.trim()) {
    throw new ProcessMenuImportDraftError("TENANT_MISMATCH", "Borrador fuera del tenant", 403);
  }
  if (draft.storagePath?.trim()) {
    try {
      assertMenuImportStoragePathForDraft(draft.storagePath, { restaurantId, draftId });
    } catch {
      throw new ProcessMenuImportDraftError(
        "STORAGE_PATH_SCOPE_MISMATCH",
        "El archivo no pertenece a este borrador",
        403,
      );
    }
  }

  if (draft.status === "ready" || draft.status === "published") {
    trace.step("already_processed", {
      status: draft.status,
      itemCount: draft.items.length,
      sectionCount: draft.sections.length,
      rawTextLength: draft.rawText?.length ?? 0,
    });
    trace.draftFinal({ status: draft.status, itemCount: draft.items.length, alreadyProcessed: true });
    return {
      draftId,
      status: draft.status,
      alreadyProcessed: true,
      itemCount: draft.items.length,
    };
  }

  if (draft.status === "analyzing") {
    const ageMs = Date.now() - draft.updatedAt;
    if (ageMs < ANALYZING_STALE_MS) {
      throw new ProcessMenuImportDraftError(
        "ANALYZING_IN_PROGRESS",
        "El borrador ya se está procesando. Espera unos segundos.",
        409,
      );
    }
  }

  if (draft.sourceType === "qr_url") {
    if (!draft.sourceUrl?.trim()) {
      throw new ProcessMenuImportDraftError("MISSING_SOURCE_URL", "Falta URL del menú QR en el borrador", 400);
    }
  } else if (!draft.storagePath?.trim()) {
    throw new ProcessMenuImportDraftError(
      "MISSING_STORAGE_PATH",
      "Falta archivo subido en Storage para este borrador",
      400,
    );
  }

  await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
    status: "analyzing",
    errorMessage: FieldValue.delete(),
    parserWarnings: FieldValue.delete(),
    aiWarnings: FieldValue.delete(),
    updatedBy: userId,
  });

  let currentStep: MenuImportPipelineStep = "ocr_extract_start";

  try {
    trace.step("ocr_extract_start", {
      storagePath: draft.storagePath ?? null,
      sourceUrl: draft.sourceUrl ?? null,
    });

    currentStep = "ocr_raw";
    const extracted = await extractMenuText({
      restaurantId,
      draftId,
      sourceType: draft.sourceType,
      menuType: draft.menuType,
      storagePath: draft.storagePath,
      sourceUrl: draft.sourceUrl,
      originalFileName: draft.originalFileName,
    });
    trace.ocrRaw(extracted.rawText, extracted.warnings);

    currentStep = "ocr_cleaned";
    const cleanedText = normalizeMenuImportOcrText(extracted.rawText);
    trace.ocrCleaned(cleanedText);

    currentStep = "parser";
    const parsed = parseMenuText(extracted.rawText, {
      sourceType: draft.sourceType,
      menuType: draft.menuType,
      ocrLayoutLines: extracted.ocrLayoutLines,
      ocrPageWidth: extracted.ocrPageWidth,
      ocrPageHeight: extracted.ocrPageHeight,
    });
    trace.parser(parsed.items, parsed.warnings);
    if (parsed.diagnostics && isMenuImportDebugReportEnabled()) {
      trace.step("parser", {
        lineAuditCount: parsed.diagnostics.lineEvents.length,
        unparsedPendingNames: parsed.diagnostics.unparsedPendingNames.slice(0, 12),
      });
    }

    const aiImportV2Shadow = await runAiImportV2Shadow({
      restaurantId,
      draftId,
      rawText: extracted.rawText,
      parserItems: parsed.items,
      menuType: draft.menuType,
      sourceType: draft.sourceType,
      storagePath: draft.storagePath,
      originalFileName: draft.originalFileName,
      ocrLayoutLines: extracted.ocrLayoutLines,
    }).catch((shadowErr) => {
      const message = shadowErr instanceof Error ? shadowErr.message : "AI_IMPORT_V2_SHADOW_FAILED";
      console.warn("[Hostly][AI Import V2 Shadow] outer catch (non-blocking)", { error: message });
      return {
        enabled: true as const,
        model: process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() || "gpt-4o-mini",
        apiMode:
          process.env.HOSTLY_AI_IMPORT_V2_API?.trim() === "responses"
            ? ("responses" as const)
            : ("chat_completions" as const),
        usedVision: false,
        durationMs: 0,
        extraction: null,
        validation: null,
        comparison: null,
        error: message,
      };
    });

    if (aiImportV2Shadow) {
      trace.step("ai_import_v2_shadow", {
        model: aiImportV2Shadow.model,
        usedVision: aiImportV2Shadow.usedVision,
        error: aiImportV2Shadow.error ?? null,
        parserDetected: aiImportV2Shadow.comparison?.parserDetected ?? parsed.items.length,
        v2Accepted: aiImportV2Shadow.comparison?.v2Accepted ?? 0,
        matchedBoth: aiImportV2Shadow.comparison?.matchedBoth ?? 0,
      });
    }

    const parserWarnings = [...extracted.warnings, ...parsed.warnings];
    const knownCategories = await loadHostlyCategoryNames(db, restaurantId);

    currentStep = "ai_enrichment";
    const enriched = await enrichMenuItemsWithAI({
      rawText: extracted.rawText,
      items: parsed.items,
      menuType: draft.menuType,
      knownCategories,
      parserWarnings,
    });
    trace.aiEnrichment({
      inputCount: parsed.items.length,
      outputCount: enriched.items.length,
      enriched: enriched.enriched,
      aiWarnings: enriched.aiWarnings,
      items: enriched.items,
    });

    currentStep = "ocr_validation";
    const wrapped = enriched.items.map((item) => ({ name: item.name, item }));
    const ocrValidated = filterItemsByOcrSource(wrapped, extracted.rawText);
    let finalItems = ocrValidated.accepted.map((row) => row.item);

    const photoRecoveryEligible =
      draft.sourceType === "image" &&
      isAiImportV2PhotoRecoveryEnabled() &&
      aiImportV2Shadow?.usedVision === true &&
      Boolean(aiImportV2Shadow.validation?.accepted.length);

    if (photoRecoveryEligible && aiImportV2Shadow?.validation) {
      const merged = mergePhotoVisionItems({
        existingItems: finalItems,
        acceptedVisionItems: aiImportV2Shadow.validation.accepted,
      });
      if (merged.recoveredCount > 0) {
        finalItems = merged.items;
        parserWarnings.push(
          `photo_vision_recovered:${merged.recoveredCount}`,
        );
      }
    }

    trace.ocrValidation({
      ocrTextLength: ocrValidated.ocrTextLength,
      accepted: finalItems,
      rejected: ocrValidated.rejected.map((row) => {
        const decision = explainOcrValidationDecision(row.name, extracted.rawText);
        return { name: row.name, reason: decision.reason };
      }),
    });

    logOcrValidationDiagnostics(
      {
        ocrTextLength: ocrValidated.ocrTextLength,
        aiReturnedCount: enriched.items.length,
        acceptedCount: finalItems.length,
        rejectedCount: ocrValidated.rejected.length,
        acceptedNames: finalItems.map((i) => i.name),
        rejectedNames: ocrValidated.rejected.map((i) => i.name),
      },
      "process-menu-import-draft",
    );

    const debugReport = isMenuImportDebugReportEnabled()
      ? buildMenuImportDebugReport({
          fileName: draft.originalFileName ?? null,
          sourceType: draft.sourceType,
          inputMetadata: extracted.inputMetadata,
          ocrLayoutExtractionMeta: extracted.ocrLayoutExtractionMeta,
          rawOcrText: extracted.rawText,
          cleanedOcrText: cleanedText,
          parserWarnings,
          aiWarnings: enriched.aiWarnings,
          parseDiagnostics: parsed.diagnostics,
          parsedItems: parsed.items,
          enrichedItems: enriched.items,
          ocrValidationAccepted: finalItems,
          ocrValidationRejected: ocrValidated.rejected,
          rawOcrTextForValidation: extracted.rawText,
          aiImportV2Shadow,
        })
      : undefined;

    if (debugReport && isMenuImportDebugReportEnabled()) {
      console.info("[Hostly][MenuImport Debug] visual_parser_gate", {
        textItemsCount: debugReport.textItemsCount,
        visualItemsCount: debugReport.visualItemsCount,
        layoutLinesCount: debugReport.layoutLinesCount,
        visualBlocksCount: debugReport.visualBlocksCount,
        recoveredVisualBlocksCount: debugReport.recoveredVisualBlocksCount,
        selectedParserMode: debugReport.selectedParserMode,
        visualParserGateReason: debugReport.visualParserGateReason,
        visualCandidateRejectedReason: debugReport.visualCandidateRejectedReason,
        ocrPageWidth: debugReport.ocrPageWidth,
        ocrMethod: debugReport.inputMetadata?.ocrMethod,
      });
      console.info("[Hostly][MenuImport Debug] phase_counts", debugReport.counts);
      console.info("[Hostly][MenuImport Debug] rejected", debugReport.rejected.slice(0, 20));
      console.info(
        "[Hostly][MenuImport Debug] likely_unparsed_lines",
        debugReport.likelyUnparsedOcrLines.slice(0, 20),
      );
    }

    if (finalItems.length === 0) {
      trace.pipelineError("ocr_validation", new Error("NO_PRODUCTS_DETECTED"));
      throw new ProcessMenuImportDraftError(
        "NO_PRODUCTS_DETECTED",
        "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.",
        422,
      );
    }

    const sections = groupParsedItemsIntoSections(finalItems);
    const { text: rawTextStored, truncated } = truncateRawTextForStorage(extracted.rawText);

    if (truncated) {
      parserWarnings.push("rawText truncado por límite de almacenamiento");
    }

    const aiWarnings = enriched.aiWarnings;
    if (!enriched.enriched && aiWarnings.length > 0) {
      parserWarnings.push(...aiWarnings);
    }

    const operationalWarnings = await buildMenuImportOperationalWarningsForDraft({
      db,
      restaurantId,
      draftId,
      sourceType: draft.sourceType,
      storagePath: draft.storagePath,
      ocrMethod: extracted.inputMetadata?.ocrMethod,
      parserWarnings,
      rawTextLength: extracted.rawText.length,
      items: finalItems,
      parseDiagnostics: parsed.diagnostics,
    });

    currentStep = "draft_save";
    trace.draftSave({
      itemCount: finalItems.length,
      sectionCount: sections.length,
      items: finalItems,
      status: "ready",
    });

    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      status: "ready",
      rawText: rawTextStored,
      sections,
      items: finalItems,
      parserWarnings: parserWarnings.length > 0 ? parserWarnings : FieldValue.delete(),
      aiWarnings: enriched.enriched && aiWarnings.length > 0 ? aiWarnings : FieldValue.delete(),
      errorMessage: FieldValue.delete(),
      updatedBy: userId,
    });

    trace.draftFinal({ status: "ready", itemCount: finalItems.length, alreadyProcessed: false });

    return {
      draftId,
      status: "ready",
      alreadyProcessed: false,
      itemCount: finalItems.length,
      debugReport,
      operationalWarnings,
      ...(aiImportV2Shadow ? { aiImportV2Shadow } : {}),
    };
  } catch (e) {
    trace.pipelineError(currentStep, e);
    const message = e instanceof Error ? e.message : "Error al procesar la carta";
    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      status: "failed",
      errorMessage: message,
      updatedBy: userId,
    }).catch(() => {
      /* secondary failure */
    });
    throw new ProcessMenuImportDraftError("PROCESS_FAILED", message, 500);
  }
}
