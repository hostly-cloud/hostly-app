import { ImageAnnotatorClient } from "@google-cloud/vision";
import { MAX_VISION_PDF_PAGES, OCR_TIMEOUT_MS } from "./menu-import-limits";

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

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const client = getVisionClient();
  if (!client) {
    throw new Error("Google Vision API no disponible (revisa credenciales Admin y API habilitada)");
  }

  const [result] = await withTimeout(
    client.documentTextDetection({ image: { content: buffer } }),
    OCR_TIMEOUT_MS,
    "image",
  );

  const text = joinVisionText(result.fullTextAnnotation);
  if (!text) {
    throw new Error("OCR no detectó texto en la imagen");
  }
  return text;
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
