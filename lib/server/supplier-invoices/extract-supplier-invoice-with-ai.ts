import type { ExtractedSupplierInvoiceDraft } from "@/lib/inventory/extracted-supplier-invoice-types";
import { MIN_PDF_TEXT_CHARS } from "@/lib/server/menu-imports/menu-import-limits";
import {
  extractPdfEmbeddedText,
  ocrImageBuffer,
  ocrPdfBuffer,
} from "@/lib/server/menu-imports/vision-ocr";
import { mockExtractSupplierInvoice } from "@/lib/server/supplier-invoices/mock-extract-supplier-invoice";

const AI_TIMEOUT_MS = 45_000;
const MAX_OCR_TEXT_FOR_AI = 14_000;

const INVOICE_EXTRACTION_JSON_SCHEMA = {
  name: "supplier_invoice_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      supplierName: { type: ["string", "null"] },
      invoiceNumber: { type: ["string", "null"] },
      invoiceDate: { type: ["string", "null"] },
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rawText: { type: ["string", "null"] },
            detectedName: { type: ["string", "null"] },
            quantity: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
            unitPrice: { type: ["number", "null"] },
            totalPrice: { type: ["number", "null"] },
          },
          required: [
            "rawText",
            "detectedName",
            "quantity",
            "unit",
            "unitPrice",
            "totalPrice",
          ],
        },
      },
    },
    required: ["supplierName", "invoiceNumber", "invoiceDate", "lines"],
  },
} as const;

type AiInvoiceLine = {
  rawText: string | null;
  detectedName: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

type AiInvoicePayload = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: AiInvoiceLine[];
};

export type ExtractSupplierInvoiceWithVisionParams = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  restaurantId: string;
};

export type ExtractSupplierInvoiceWithVisionResult = {
  draft: ExtractedSupplierInvoiceDraft;
  warnings: string[];
  source: "vision_ai" | "mock_fallback";
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${label}) tras ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function truncateOcrText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_OCR_TEXT_FOR_AI) return trimmed;
  return `${trimmed.slice(0, MAX_OCR_TEXT_FOR_AI)}\n\n[… texto OCR truncado …]`;
}

function isPdfUpload(buffer: Buffer, mimeType: string, filename: string): boolean {
  if (mimeType.toLowerCase().includes("pdf")) return true;
  if (filename.toLowerCase().endsWith(".pdf")) return true;
  return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

function readPositiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function readTrimmedString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function normalizeIsoDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString().slice(0, 10);
}

async function ocrSupplierInvoiceBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  if (isPdfUpload(params.buffer, params.mimeType, params.filename)) {
    const embedded = await extractPdfEmbeddedText(params.buffer);
    if (embedded.length >= MIN_PDF_TEXT_CHARS) {
      warnings.push("PDF con capa de texto (sin OCR Vision)");
      return { text: embedded, warnings };
    }

    const ocr = await ocrPdfBuffer(params.buffer);
    return { text: ocr.text, warnings: [...warnings, ...ocr.warnings] };
  }

  const text = await ocrImageBuffer(params.buffer);
  warnings.push("OCR imagen vía Google Vision");
  return { text, warnings };
}

function buildStructurePrompt(ocrText: string, filename: string): string {
  return [
    "Eres un asistente de extracción de facturas de proveedor para restauración.",
    "A partir del texto OCR bruto, devuelve SOLO datos que aparezcan explícitamente en el documento.",
    "",
    "Reglas estrictas:",
    "- NO inventes líneas, precios ni cantidades.",
    "- NO infieras datos que no estén en el texto.",
    "- Si un campo no aparece o no es legible: null.",
    "- invoiceDate en formato YYYY-MM-DD si es posible.",
    "- lines: solo filas de producto/servicio facturables visibles en el OCR.",
    "- rawText: fragmento literal de la línea en el OCR.",
    "- detectedName: nombre del producto tal como aparece (sin inventar).",
    "",
    `Archivo: ${filename}`,
    "",
    "Texto OCR:",
    ocrText,
  ].join("\n");
}

function validateAiPayload(raw: unknown): AiInvoicePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const linesRaw = Array.isArray(rec.lines) ? rec.lines : [];
  const lines: AiInvoiceLine[] = [];

  for (const item of linesRaw.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    lines.push({
      rawText: typeof line.rawText === "string" ? line.rawText : null,
      detectedName: typeof line.detectedName === "string" ? line.detectedName : null,
      quantity:
        typeof line.quantity === "number" && Number.isFinite(line.quantity)
          ? line.quantity
          : null,
      unit: typeof line.unit === "string" ? line.unit : null,
      unitPrice:
        typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice)
          ? line.unitPrice
          : null,
      totalPrice:
        typeof line.totalPrice === "number" && Number.isFinite(line.totalPrice)
          ? line.totalPrice
          : null,
    });
  }

  return {
    supplierName: typeof rec.supplierName === "string" ? rec.supplierName : null,
    invoiceNumber: typeof rec.invoiceNumber === "string" ? rec.invoiceNumber : null,
    invoiceDate: typeof rec.invoiceDate === "string" ? rec.invoiceDate : null,
    lines,
  };
}

async function structureInvoiceWithOpenAI(
  ocrText: string,
  filename: string,
): Promise<AiInvoicePayload> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = process.env.HOSTLY_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const prompt = buildStructurePrompt(truncateOcrText(ocrText), filename);

  const res = await withTimeout(
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Devuelve únicamente JSON válido según el schema. No inventes líneas ni precios.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: INVOICE_EXTRACTION_JSON_SCHEMA,
        },
      }),
    }),
    AI_TIMEOUT_MS,
    "openai-invoice",
  );

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${bodyText.slice(0, 240)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("OpenAI response invalid JSON envelope");
  }

  const content = (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI empty invoice extraction content");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("OpenAI invoice extraction malformed JSON");
  }

  const validated = validateAiPayload(payload);
  if (!validated) {
    throw new Error("OpenAI invoice extraction invalid payload");
  }

  return validated;
}

function mapAiPayloadToDraft(payload: AiInvoicePayload): ExtractedSupplierInvoiceDraft {
  const lines = payload.lines
    .map((line) => {
      const rawText = readTrimmedString(line.rawText, 240);
      const detectedProductName =
        readTrimmedString(line.detectedName, 160) ?? rawText?.slice(0, 160);
      const quantity = readPositiveNumber(line.quantity);
      const unit = readTrimmedString(line.unit, 16);
      const unitPrice = readPositiveNumber(line.unitPrice);
      const totalPrice = readPositiveNumber(line.totalPrice);

      if (!rawText && !detectedProductName) return null;

      return {
        rawText,
        detectedProductName,
        quantity,
        unit,
        unitPrice,
        totalPrice,
        status: "unmatched" as const,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line != null);

  return {
    supplierName: readTrimmedString(payload.supplierName, 160),
    invoiceNumber: readTrimmedString(payload.invoiceNumber, 64),
    invoiceDate: normalizeIsoDate(payload.invoiceDate),
    lines,
  };
}

/**
 * Pipeline real: OCR bruto (Vision / PDF embebido) → OpenAI estructuración JSON.
 * Mismo contrato que el mock (`ExtractedSupplierInvoiceDraft`).
 */
export async function extractSupplierInvoiceWithVision(
  params: ExtractSupplierInvoiceWithVisionParams,
): Promise<ExtractSupplierInvoiceWithVisionResult> {
  const warnings: string[] = [];

  try {
    const ocr = await ocrSupplierInvoiceBuffer({
      buffer: params.buffer,
      mimeType: params.mimeType,
      filename: params.filename,
    });
    warnings.push(...ocr.warnings);

    if (!ocr.text.trim()) {
      throw new Error("OCR_EMPTY");
    }

    const structured = await structureInvoiceWithOpenAI(ocr.text, params.filename);
    const draft = mapAiPayloadToDraft(structured);

    if (draft.lines.length === 0) {
      throw new Error("AI_NO_LINES");
    }

    warnings.push("Extracción estructurada con OpenAI");
    return { draft, warnings, source: "vision_ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXTRACT_FAILED";
    warnings.push(`Fallback mock: ${message}`);

    return {
      draft: mockExtractSupplierInvoice({
        filename: params.filename,
        mimeType: params.mimeType,
      }),
      warnings,
      source: "mock_fallback",
    };
  }
}
