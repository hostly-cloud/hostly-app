import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";

/** Imagen de referencia para trazas destacadas en consola dev. */
export const MENU_IMPORT_TRACE_TARGET_FILE = "1000121329.jpg";

export type MenuImportPipelineStep =
  | "draft_loaded"
  | "ocr_extract_start"
  | "ocr_raw"
  | "ocr_cleaned"
  | "parser"
  | "ai_enrichment"
  | "ocr_validation"
  | "draft_save"
  | "draft_final"
  | "already_processed"
  | "pipeline_error";

export function isMenuImportPipelineDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isMenuImportTraceTarget(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  return fileName.toLowerCase().includes(MENU_IMPORT_TRACE_TARGET_FILE.toLowerCase());
}

function summarizeItems(items: readonly ImportedMenuItem[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price ?? null,
    section: item.sectionName ?? null,
    category: item.suggestedCategory ?? null,
    confidence: item.confidence,
    needsReview: item.needsReview,
    selectedForPublish: item.selectedForPublish,
  }));
}

export type MenuImportPipelineTracerContext = {
  draftId: string;
  restaurantId: string;
  fileName?: string | null;
  sourceType?: string;
};

/**
 * Trazabilidad dev del pipeline OCR → parser → IA → validación → draft.
 * No escribe en Firestore ni altera el flujo.
 */
export class MenuImportPipelineTracer {
  readonly context: MenuImportPipelineTracerContext;
  private lastCompletedStep: MenuImportPipelineStep | null = null;
  private failedStep: MenuImportPipelineStep | null = null;
  private failureMessage: string | null = null;

  ocrRawLength = 0;
  ocrCleanedLength = 0;
  parserItemCount = 0;
  aiItemCount = 0;
  validatedItemCount = 0;
  draftSaveItemCount = 0;
  finalStatus: string | null = null;

  constructor(context: MenuImportPipelineTracerContext) {
    this.context = context;
  }

  private enabled(): boolean {
    return isMenuImportPipelineDiagnosticsEnabled();
  }

  private header(step: MenuImportPipelineStep): string {
    const target = isMenuImportTraceTarget(this.context.fileName) ? " ★ TARGET" : "";
    return `[Hostly][MenuImport Pipeline] ${step}${target}`;
  }

  step(step: MenuImportPipelineStep, payload: Record<string, unknown> = {}): void {
    if (!this.enabled()) return;
    this.lastCompletedStep = step;
    console.group(this.header(step));
    console.log("context", {
      draftId: this.context.draftId,
      restaurantId: this.context.restaurantId,
      fileName: this.context.fileName ?? null,
      sourceType: this.context.sourceType ?? null,
    });
    if (Object.keys(payload).length > 0) console.log("data", payload);
    console.groupEnd();
  }

  ocrRaw(text: string, warnings: string[]): void {
    if (!this.enabled()) return;
    this.ocrRawLength = text.length;
    this.step("ocr_raw", {
      length: text.length,
      warnings,
      preview: text.slice(0, 500),
    });
    console.group(this.header("ocr_raw") + " · texto completo");
    console.log(text || "(vacío)");
    console.groupEnd();
  }

  ocrCleaned(text: string): void {
    if (!this.enabled()) return;
    this.ocrCleanedLength = text.length;
    this.step("ocr_cleaned", {
      length: text.length,
      preview: text.slice(0, 500),
    });
    console.group(this.header("ocr_cleaned") + " · texto completo");
    console.log(text || "(vacío)");
    console.groupEnd();
  }

  parser(items: ImportedMenuItem[], warnings: string[]): void {
    if (!this.enabled()) return;
    this.parserItemCount = items.length;
    this.step("parser", {
      count: items.length,
      warnings,
      products: summarizeItems(items),
    });
  }

  aiEnrichment(args: {
    inputCount: number;
    outputCount: number;
    enriched: boolean;
    aiWarnings: string[];
    items: ImportedMenuItem[];
  }): void {
    if (!this.enabled()) return;
    this.aiItemCount = args.outputCount;
    this.step("ai_enrichment", {
      inputCount: args.inputCount,
      outputCount: args.outputCount,
      enriched: args.enriched,
      aiWarnings: args.aiWarnings,
      products: summarizeItems(args.items),
    });
  }

  ocrValidation(args: {
    ocrTextLength: number;
    accepted: ImportedMenuItem[];
    rejected: { name: string; reason?: string }[];
  }): void {
    if (!this.enabled()) return;
    this.validatedItemCount = args.accepted.length;
    this.step("ocr_validation", {
      ocrTextLength: args.ocrTextLength,
      minOcrLength: 40,
      acceptedCount: args.accepted.length,
      rejectedCount: args.rejected.length,
      acceptedProducts: summarizeItems(args.accepted),
      rejected: args.rejected.slice(0, 20),
    });
  }

  draftSave(args: {
    itemCount: number;
    sectionCount: number;
    items: ImportedMenuItem[];
    status: string;
  }): void {
    if (!this.enabled()) return;
    this.draftSaveItemCount = args.itemCount;
    this.step("draft_save", {
      status: args.status,
      itemCount: args.itemCount,
      sectionCount: args.sectionCount,
      products: summarizeItems(args.items),
    });
  }

  draftFinal(args: {
    status: string;
    itemCount: number;
    alreadyProcessed: boolean;
  }): void {
    if (!this.enabled()) return;
    this.finalStatus = args.status;
    this.step("draft_final", {
      status: args.status,
      itemCount: args.itemCount,
      alreadyProcessed: args.alreadyProcessed,
    });
    this.flushSummary();
  }

  pipelineError(step: MenuImportPipelineStep, error: unknown): void {
    if (!this.enabled()) return;
    this.failedStep = step;
    this.failureMessage = error instanceof Error ? error.message : String(error);
    this.step("pipeline_error", {
      failedAt: step,
      lastCompletedStep: this.lastCompletedStep,
      message: this.failureMessage,
    });
    this.flushSummary();
  }

  private summaryHeader(): string {
    const target = isMenuImportTraceTarget(this.context.fileName) ? " ★ TARGET" : "";
    return `[Hostly][MenuImport Pipeline] RESUMEN${target}`;
  }

  flushSummary(): void {
    if (!this.enabled()) return;
    console.group(this.summaryHeader());
    console.table({
      fileName: this.context.fileName ?? "(sin nombre)",
      draftId: this.context.draftId,
      ocrRawChars: this.ocrRawLength,
      ocrCleanedChars: this.ocrCleanedLength,
      parserProducts: this.parserItemCount,
      afterAiProducts: this.aiItemCount,
      afterOcrValidation: this.validatedItemCount,
      draftSaveProducts: this.draftSaveItemCount,
      finalStatus: this.finalStatus ?? "(no completado)",
      failedStep: this.failedStep ?? "(ninguno)",
      failureMessage: this.failureMessage ?? "(ninguno)",
    });
    console.groupEnd();
  }
}
