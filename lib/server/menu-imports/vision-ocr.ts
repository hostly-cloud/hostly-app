import { ImageAnnotatorClient } from "@google-cloud/vision";
import { isMenuImportPipelineDiagnosticsEnabled } from "./menu-import-pipeline-diagnostics";
import { MAX_VISION_PDF_PAGES, OCR_TIMEOUT_MS } from "./menu-import-limits";
import type { OcrLayoutLine } from "./menu-import-ocr-layout-types";
import {
  extractLayoutLinesFromVisionAnnotation,
  type OcrLayoutExtractionMeta,
  type VisionFullTextAnnotation,
} from "./vision-ocr-layout";

export type VisionOcrLayoutResult = {
  text: string;
  lines: OcrLayoutLine[];
  pageWidth: number;
  pageHeight: number;
  extractionMeta: OcrLayoutExtractionMeta;
};

let visionClient: ImageAnnotatorClient | null | undefined;

function getVisionClient(): ImageAnnotatorClient | null {
  if (visionClient !== undefined) return visionClient;
  try {
    visionClient = new ImageAnnotatorClient();
    return visionClient;
  } catch {
    visionClient = null;
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OCR timeout (${label}) tras ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function joinVisionText(fullTextAnnotation: { text?: string | null } | null | undefined): string {
  return (fullTextAnnotation?.text ?? "").trim();
}

export async function ocrImageBufferWithLayout(buffer: Buffer): Promise<VisionOcrLayoutResult> {
  const client = getVisionClient();
  if (!client) {
    const message = "Google Vision API no disponible (revisa credenciales Admin y API habilitada)";
    if (isMenuImportPipelineDiagnosticsEnabled()) {
      console.error("[Hostly][MenuImport Pipeline] vision_client_unavailable", { message });
    }
    throw new Error(message);
  }

  try {
    const [result] = await withTimeout(
      client.documentTextDetection({ image: { content: buffer } }),
      OCR_TIMEOUT_MS,
      "image",
    );

    const annotation = result.fullTextAnnotation as VisionFullTextAnnotation | null | undefined;
    const text = joinVisionText(annotation);
    if (!text) {
      const message = "OCR no detectó texto en la imagen";
      if (isMenuImportPipelineDiagnosticsEnabled()) {
        console.warn("[Hostly][MenuImport Pipeline] vision_empty_text", { message, bytes: buffer.length });
      }
      throw new Error(message);
    }

    const layout = extractLayoutLinesFromVisionAnnotation(annotation);

    if (isMenuImportPipelineDiagnosticsEnabled()) {
      console.info("[Hostly][MenuImport Pipeline] vision_image_ocr_ok", {
        textLength: text.length,
        layoutLines: layout.lines.length,
        pageWidth: layout.pageWidth,
        extractionMethod: layout.extractionMeta.method,
        visionBlockCount: layout.extractionMeta.visionBlockCount,
        visionParagraphCount: layout.extractionMeta.visionParagraphCount,
        preview: text.slice(0, 200),
      });
    }

    return {
      text,
      lines: layout.lines,
      pageWidth: layout.pageWidth,
      pageHeight: layout.pageHeight,
      extractionMeta: layout.extractionMeta,
    };
  } catch (e) {
    if (isMenuImportPipelineDiagnosticsEnabled()) {
      console.error("[Hostly][MenuImport Pipeline] vision_image_ocr_error", {
        message: e instanceof Error ? e.message : String(e),
        bytes: buffer.length,
      });
    }
    throw e;
  }
}

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const result = await ocrImageBufferWithLayout(buffer);
  return result.text;
}

export async function ocrPdfBuffer(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const client = getVisionClient();
  if (!client) {
    throw new Error("Google Vision API no disponible (revisa credenciales Admin y API habilitada)");
  }

  const warnings: string[] = [];
  const [result] = await withTimeout(
    client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: buffer,
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
    OCR_TIMEOUT_MS,
    "pdf",
  );

  const chunks: string[] = [];
  for (const fileResponse of result.responses ?? []) {
    for (const pageResponse of fileResponse.responses ?? []) {
      const pageText = joinVisionText(pageResponse.fullTextAnnotation);
      if (pageText) chunks.push(pageText);
    }
  }

  const text = chunks.join("\n\n").trim();
  if (!text) {
    throw new Error("OCR no detectó texto en el PDF");
  }

  warnings.push(`OCR PDF limitado a las primeras ${MAX_VISION_PDF_PAGES} páginas`);
  return { text, warnings };
}

export async function extractPdfEmbeddedText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      return typeof textResult.text === "string" ? textResult.text.trim() : "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    return "";
  }
}
