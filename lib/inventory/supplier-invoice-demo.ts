import type {
  ExtractedSupplierInvoiceDraft,
  SupplierInvoiceExtractionMeta,
} from "@/lib/inventory/extracted-supplier-invoice-types";

export const SUPPLIER_INVOICE_DEMO_FILENAME = "hostly-factura-demo-qa.svg";

export function readDemoInvoiceIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildSupplierInvoiceDemoDraft(
  invoiceDate = readDemoInvoiceIsoDate(),
): ExtractedSupplierInvoiceDraft {
  const suffix = invoiceDate.replace(/-/g, "");

  return {
    supplierName: "Distribuidora Bebidas Demo S.L.",
    invoiceNumber: `DEMO-F-${suffix}-001`,
    invoiceDate,
    lines: [
      {
        rawText: "Tónica Schweppes Premium 24 ud x 0,68 €",
        detectedProductName: "Tónica Schweppes Premium",
        quantity: 24,
        unit: "ud",
        unitPrice: 0.68,
        totalPrice: 16.32,
        status: "unmatched",
      },
      {
        rawText: "Coca-Cola lata 33cl 48 ud x 0,52 €",
        detectedProductName: "Coca-Cola",
        quantity: 48,
        unit: "ud",
        unitPrice: 0.52,
        totalPrice: 24.96,
        status: "unmatched",
      },
      {
        rawText: "Red Bull Energy Drink 24 ud x 1,15 €",
        detectedProductName: "Red Bull",
        quantity: 24,
        unit: "ud",
        unitPrice: 1.15,
        totalPrice: 27.6,
        status: "unmatched",
      },
      {
        rawText: "Ginebra London Dry 70cl 6 ud x 8,90 €",
        detectedProductName: "Ginebra London Dry",
        quantity: 6,
        unit: "ud",
        unitPrice: 8.9,
        totalPrice: 53.4,
        status: "unmatched",
      },
    ],
  };
}

export function buildSupplierInvoiceDemoExtractionMeta(): SupplierInvoiceExtractionMeta {
  return {
    source: "demo",
    warnings: [
      "Factura ficticia para QA. No se subió a Storage ni pasó por OCR/IA real.",
    ],
  };
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSupplierInvoiceDemoSvg(draft: ExtractedSupplierInvoiceDraft): string {
  const lines = draft.lines
    .map((line, index) => {
      const y = 250 + index * 34;
      const label = line.rawText?.trim() || line.detectedProductName?.trim() || "Línea demo";
      return `<text x="48" y="${y}" font-size="13" fill="#0f172a">${escapeSvgText(label)}</text>`;
    })
    .join("\n");

  const total = draft.lines.reduce((sum, line) => sum + (line.totalPrice ?? 0), 0);
  const totalLabel = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="920" viewBox="0 0 720 920">
  <rect width="720" height="920" fill="#ffffff"/>
  <rect x="24" y="24" width="672" height="872" rx="16" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="360" y="72" text-anchor="middle" font-size="28" font-weight="700" fill="#0f172a">FACTURA DEMO</text>
  <text x="360" y="102" text-anchor="middle" font-size="14" fill="#64748b">Solo QA · no es un documento real</text>
  <text x="48" y="150" font-size="14" fill="#334155">Proveedor: ${escapeSvgText(draft.supplierName ?? "—")}</text>
  <text x="48" y="178" font-size="14" fill="#334155">Nº factura: ${escapeSvgText(draft.invoiceNumber ?? "—")}</text>
  <text x="48" y="206" font-size="14" fill="#334155">Fecha: ${escapeSvgText(draft.invoiceDate ?? "—")}</text>
  <line x1="48" y1="228" x2="672" y2="228" stroke="#cbd5e1"/>
  ${lines}
  <line x1="48" y1="400" x2="672" y2="400" stroke="#cbd5e1"/>
  <text x="48" y="432" font-size="16" font-weight="700" fill="#0f172a">Total: ${totalLabel} €</text>
  <text x="360" y="860" text-anchor="middle" font-size="13" fill="#94a3b8">Hostly · factura demo OCR</text>
</svg>`;
}

export function createSupplierInvoiceDemoPreviewUrl(
  draft = buildSupplierInvoiceDemoDraft(),
): string {
  const svg = buildSupplierInvoiceDemoSvg(draft);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return URL.createObjectURL(blob);
}

export function createSupplierInvoiceDemoFile(
  draft = buildSupplierInvoiceDemoDraft(),
): File {
  const svg = buildSupplierInvoiceDemoSvg(draft);
  return new File([svg], SUPPLIER_INVOICE_DEMO_FILENAME, { type: "image/svg+xml" });
}

export function isSupplierInvoiceDemoEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
