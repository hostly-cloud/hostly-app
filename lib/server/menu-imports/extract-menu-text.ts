import type { ImportedMenuSourceType } from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import { downloadMenuImportStorageFile } from "./download-storage-file";
import {
  fetchRemoteMenuContent,
  htmlToVisibleText,
} from "./fetch-remote-menu-url";
import type { MenuImportInputMetadata } from "@/lib/carta/menu-import-debug-report-types";
import { isMenuImportDebugReportEnabled } from "@/lib/carta/menu-import-debug-report-types";
import { isMenuImportPipelineDiagnosticsEnabled } from "./menu-import-pipeline-diagnostics";
import { MIN_PDF_TEXT_CHARS } from "./menu-import-limits";
import {
  extractPdfEmbeddedText,
  ocrImageBufferWithLayout,
  ocrPdfBuffer,
} from "./vision-ocr";
import type { OcrLayoutLine } from "./menu-import-ocr-layout-types";
import type { OcrLayoutExtractionMeta } from "./vision-ocr-layout";

export type ExtractMenuTextInput = {
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
  storagePath?: string;
  sourceUrl?: string;
  originalFileName?: string;
};

export type ExtractMenuTextResult = {
  rawText: string;
  warnings: string[];
  inputMetadata?: MenuImportInputMetadata;
  /** Líneas OCR con bounding boxes (solo imágenes vía Vision). */
  ocrLayoutLines?: OcrLayoutLine[];
  ocrPageWidth?: number;
  ocrPageHeight?: number;
  ocrLayoutExtractionMeta?: OcrLayoutExtractionMeta;
};

function isPdfContent(contentType: string, buffer: Buffer, fileName?: string): boolean {
  if (contentType.includes("pdf")) return true;
  if (fileName?.toLowerCase().endsWith(".pdf")) return true;
  return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

function isImageContent(contentType: string, fileName?: string): boolean {
  if (contentType.startsWith("image/")) return true;
  return Boolean(fileName && /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(fileName));
}

async function extractFromPdfBuffer(
  buffer: Buffer,
): Promise<{ rawText: string; warnings: string[]; ocrMethod: MenuImportInputMetadata["ocrMethod"] }> {
  const warnings: string[] = [];
  const embedded = await extractPdfEmbeddedText(buffer);
  if (embedded.length >= MIN_PDF_TEXT_CHARS) {
    warnings.push("PDF con capa de texto detectada (sin OCR)");
    return { rawText: embedded, warnings, ocrMethod: "pdf_embedded" };
  }

  const ocr = await ocrPdfBuffer(buffer);
  return { rawText: ocr.text, warnings: [...warnings, ...ocr.warnings], ocrMethod: "vision_pdf" };
}

async function extractFromStorageFile(input: ExtractMenuTextInput): Promise<ExtractMenuTextResult> {
  const storagePath = input.storagePath?.trim();
  if (!storagePath) {
    throw new Error("Falta storagePath para extraer la carta");
  }

  const downloaded = await downloadMenuImportStorageFile(storagePath);
  const warnings: string[] = [];

  if (isMenuImportPipelineDiagnosticsEnabled()) {
    console.info("[Hostly][MenuImport Pipeline] storage_download", {
      storagePath,
      originalFileName: input.originalFileName ?? null,
      contentType: downloaded.contentType,
      bytes: downloaded.buffer.length,
    });
  }

  const collectMeta = isMenuImportDebugReportEnabled();

  if (isPdfContent(downloaded.contentType, downloaded.buffer, input.originalFileName)) {
    const pdf = await extractFromPdfBuffer(downloaded.buffer);
    return {
      rawText: pdf.rawText,
      warnings: [...warnings, ...pdf.warnings],
      ...(collectMeta
        ? {
            inputMetadata: {
              bytes: downloaded.buffer.length,
              contentType: downloaded.contentType,
              ocrMethod: pdf.ocrMethod,
              storagePath,
            },
          }
        : {}),
    };
  }

  if (isImageContent(downloaded.contentType, input.originalFileName)) {
    if (isMenuImportPipelineDiagnosticsEnabled()) {
      console.info("[Hostly][MenuImport Pipeline] vision_image_ocr_start", {
        originalFileName: input.originalFileName ?? null,
        bytes: downloaded.buffer.length,
      });
    }
    const ocr = await ocrImageBufferWithLayout(downloaded.buffer);
    warnings.push("OCR de imagen vía Google Vision");
    return {
      rawText: ocr.text,
      warnings,
      ocrLayoutLines: ocr.lines,
      ocrPageWidth: ocr.pageWidth,
      ocrPageHeight: ocr.pageHeight,
      ocrLayoutExtractionMeta: ocr.extractionMeta,
      ...(collectMeta
        ? {
            inputMetadata: {
              bytes: downloaded.buffer.length,
              contentType: downloaded.contentType,
              ocrMethod: "vision_image" as const,
              storagePath,
            },
          }
        : {}),
    };
  }

  throw new Error("Tipo de archivo no soportado para OCR (usa imagen o PDF)");
}

async function extractFromQrUrl(sourceUrl: string): Promise<ExtractMenuTextResult> {
  const remote = await fetchRemoteMenuContent(sourceUrl);
  const warnings: string[] = [`Menú remoto descargado desde ${remote.finalUrl}`];

  if (isPdfContent(remote.contentType, remote.buffer)) {
    const pdf = await extractFromPdfBuffer(remote.buffer);
    return {
      rawText: pdf.rawText,
      warnings: [...warnings, ...pdf.warnings],
      ...(isMenuImportDebugReportEnabled()
        ? {
            inputMetadata: {
              bytes: remote.buffer.length,
              contentType: remote.contentType,
              ocrMethod: pdf.ocrMethod,
            },
          }
        : {}),
    };
  }

  const html = remote.buffer.toString("utf8");
  const visible = htmlToVisibleText(html);
  if (visible.length < MIN_PDF_TEXT_CHARS) {
    throw new Error("La página del menú QR no contiene texto visible suficiente");
  }
  warnings.push("Texto extraído de HTML (sin ejecutar JavaScript)");
  return {
    rawText: visible,
    warnings,
    ...(isMenuImportDebugReportEnabled()
      ? {
          inputMetadata: {
            bytes: remote.buffer.length,
            contentType: remote.contentType,
            ocrMethod: "url_html" as const,
          },
        }
      : {}),
  };
}

/**
 * Extrae texto real de imagen/PDF (Storage) o URL QR (HTML/PDF remoto).
 */
export async function extractMenuText(input: ExtractMenuTextInput): Promise<ExtractMenuTextResult> {
  if (input.sourceType === "qr_url") {
    const url = input.sourceUrl?.trim();
    if (!url) throw new Error("Falta sourceUrl para menú QR");
    return extractFromQrUrl(url);
  }

  return extractFromStorageFile(input);
}
