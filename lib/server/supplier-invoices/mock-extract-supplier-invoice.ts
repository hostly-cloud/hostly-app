import type { ExtractedSupplierInvoiceDraft } from "@/lib/inventory/extracted-supplier-invoice-types";

export type MockExtractSupplierInvoiceParams = {
  filename: string;
  mimeType: string;
};

function readTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function inferSupplierFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("coca") || lower.includes("cola")) return "Coca-Cola Europacific Partners";
  if (lower.includes("schweppes") || lower.includes("tonica") || lower.includes("tónica")) {
    return "Schweppes Iberia";
  }
  return "Proveedor detectado (mock)";
}

/**
 * Extracción simulada server-side para la fase OCR/revisión.
 * Sustituible por OpenAI Vision / OCR real en fase posterior.
 */
export function mockExtractSupplierInvoice(
  params: MockExtractSupplierInvoiceParams,
): ExtractedSupplierInvoiceDraft {
  const invoiceDate = readTodayIsoDate();
  const supplierName = inferSupplierFromFilename(params.filename);
  const suffix = params.filename.replace(/\.[^.]+$/, "").slice(-4) || "0001";

  return {
    supplierName,
    invoiceNumber: `MOCK-F-${invoiceDate.replace(/-/g, "")}-${suffix}`,
    invoiceDate,
    lines: [
      {
        rawText: "Tónica Schweppes Premium 32 ud x 0,62 €",
        detectedProductName: "Tónica Schweppes Premium",
        quantity: 32,
        unit: "ud",
        unitPrice: 0.62,
        totalPrice: 19.84,
        status: "unmatched",
      },
      {
        rawText: "Coca-Cola Zero lata 24 ud x 0,55 €",
        detectedProductName: "Coca-Cola Zero",
        quantity: 24,
        unit: "ud",
        unitPrice: 0.55,
        totalPrice: 13.2,
        status: "unmatched",
      },
      {
        rawText: "Servicio logístico frío",
        detectedProductName: "Servicio logístico",
        quantity: 1,
        unit: "ud",
        unitPrice: 4.5,
        totalPrice: 4.5,
        status: "unmatched",
      },
    ],
  };
}
