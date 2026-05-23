import type { ImportedMenuSourceType } from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import { downloadMenuImportStorageFile } from "./download-storage-file";
import {
  fetchRemoteMenuContent,
  htmlToVisibleText,
} from "./fetch-remote-menu-url";
import { MIN_PDF_TEXT_CHARS } from "./menu-import-limits";
import {
  extractPdfEmbeddedText,
  ocrImageBuffer,
  ocrPdfBuffer,
} from "./vision-ocr";

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

async function extractFromPdfBuffer(buffer: Buffer): Promise<{ rawText: string; warnings: string[] }> {
  const warnings: string[] = [];
  const embedded = await extractPdfEmbeddedText(buffer);
  if (embedded.length >= MIN_PDF_TEXT_CHARS) {
    warnings.push("PDF con capa de texto detectada (sin OCR)");
    return { rawText: embedded, warnings };
  }

  const ocr = await ocrPdfBuffer(buffer);
  return { rawText: ocr.text, warnings: [...warnings, ...ocr.warnings] };
}

async function extractFromStorageFile(input: ExtractMenuTextInput): Promise<ExtractMenuTextResult> {
  const storagePath = input.storagePath?.trim();
  if (!storagePath) {
    throw new Error("Falta storagePath para extraer la carta");
  }

  const downloaded = await downloadMenuImportStorageFile(storagePath);
  const warnings: string[] = [];

  if (isPdfContent(downloaded.contentType, downloaded.buffer, input.originalFileName)) {
    const pdf = await extractFromPdfBuffer(downloaded.buffer);
    return { rawText: pdf.rawText, warnings: [...warnings, ...pdf.warnings] };
  }

  if (isImageContent(downloaded.contentType, input.originalFileName)) {
    const text = await ocrImageBuffer(downloaded.buffer);
    warnings.push("OCR de imagen vía Google Vision");
    return { rawText: text, warnings };
  }

  throw new Error("Tipo de archivo no soportado para OCR (usa imagen o PDF)");
}

async function extractFromQrUrl(sourceUrl: string): Promise<ExtractMenuTextResult> {
  const remote = await fetchRemoteMenuContent(sourceUrl);
  const warnings: string[] = [`Menú remoto descargado desde ${remote.finalUrl}`];

  if (isPdfContent(remote.contentType, remote.buffer)) {
    const pdf = await extractFromPdfBuffer(remote.buffer);
    return { rawText: pdf.rawText, warnings: [...warnings, ...pdf.warnings] };
  }

  const html = remote.buffer.toString("utf8");
  const visible = htmlToVisibleText(html);
  if (visible.length < MIN_PDF_TEXT_CHARS) {
    throw new Error("La página del menú QR no contiene texto visible suficiente");
  }
  warnings.push("Texto extraído de HTML (sin ejecutar JavaScript)");
  return { rawText: visible, warnings };
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
