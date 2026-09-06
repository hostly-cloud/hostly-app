import { jsPDF } from "jspdf";
import qrcode from "qrcode-generator";
import { AEAT_QR_SPECIFICATION } from "@/lib/fiscal/verifactu-qr";

type FiscalPdfInvoice = {
  invoiceNumber: string;
  documentKind: string;
  mode: "test" | "live";
  issueDate: string;
  issuedAtMs: number;
  qrUrl: string;
  originalInvoiceNumber?: string | null;
  rectificationReason?: string | null;
  issuerSnapshot: { legalName: string; nif: string; address: { line1: string; postalCode: string; city: string; province: string; countryCode: string } };
  establishmentSnapshot?: { name?: string; address?: { line1?: string } } | null;
  customerSnapshot?: { legalName: string; nif: string; address: { line1: string; postalCode: string; city: string; province: string; countryCode: string }; email?: string | null } | null;
  linesSnapshot: Array<{ description: string; quantity: number; netGrossCents: number; vatRateBps: number }>;
  taxBreakdown: Array<{ vatRateBps: number; taxableBaseCents: number; taxAmountCents: number }>;
  totals: { discountCents: number; taxableBaseCents: number; taxAmountCents: number; totalCents: number };
  paymentMethods?: string[];
};

export type FiscalPdfPaper = "a4" | "80mm" | "58mm";

export const FISCAL_PDF_QR_SIZE_MM = 35;
export const FISCAL_PDF_QR_POSITION = "before_invoice_content" as const;

function money(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function percent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)} %`;
}

function paymentLabel(value: string): string {
  return ({ cash: "Efectivo", card: "Tarjeta", voucher: "Vale" } as Record<string, string>)[value] ?? value;
}

function qrDataUrl(value: string): string {
  const qr = qrcode(0, AEAT_QR_SPECIFICATION.errorCorrectionLevel);
  qr.addData(value, "Byte");
  qr.make();
  return qr.createDataURL(5, 4);
}

export function generateFiscalInvoicePdf(input: {
  invoice: FiscalPdfInvoice;
  paper?: FiscalPdfPaper;
  duplicate?: boolean;
}): Buffer {
  if ((input.invoice.documentKind === "rectification" || input.invoice.documentKind === "replacement") && !input.invoice.originalInvoiceNumber?.trim()) {
    throw new Error("FISCAL_ORIGINAL_INVOICE_NUMBER_REQUIRED");
  }

  const paper = input.paper ?? "a4";
  const thermal = paper !== "a4";
  const width = paper === "58mm" ? 58 : paper === "80mm" ? 80 : 210;
  const estimatedHeight = thermal
    ? Math.max(160, 120 + input.invoice.linesSnapshot.length * 8 + input.invoice.taxBreakdown.length * 8)
    : 297;
  const doc = new jsPDF({ unit: "mm", format: thermal ? [width, estimatedHeight] : "a4", compress: true });
  const margin = thermal ? 4 : 16;
  const contentWidth = width - margin * 2;
  const pageHeight = thermal ? estimatedHeight : 297;
  const bottomMargin = thermal ? margin : 16;
  let y = margin;
  const lineHeight = thermal ? 3.7 : 4.6;

  const ensureSpace = (heightMm: number) => {
    if (!thermal && y + heightMm > pageHeight - bottomMargin) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (value: string, options?: { size?: number; bold?: boolean; align?: "left" | "center" | "right" }) => {
    const size = options?.size ?? (thermal ? 7.5 : 9.5);
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, contentWidth);
    ensureSpace(lines.length * lineHeight);
    const x = options?.align === "center" ? width / 2 : options?.align === "right" ? width - margin : margin;
    doc.text(lines, x, y, { align: options?.align ?? "left" });
    y += lines.length * lineHeight;
  };
  const rule = () => {
    ensureSpace(3);
    doc.setDrawColor(150);
    doc.line(margin, y, width - margin, y);
    y += 3;
  };

  if (input.invoice.mode === "test") {
    write("DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL", { bold: true, align: "center", size: thermal ? 7 : 10 });
    y += 1;
  }

  // AEAT requires the fiscal QR to appear once, at the beginning of the invoice
  // and before the invoice content. Keep the graphic itself within the statutory
  // 30–40 mm range for A4 and both supported thermal widths.
  const qrSize = FISCAL_PDF_QR_SIZE_MM;
  const qrX = (width - qrSize) / 2;
  write(AEAT_QR_SPECIFICATION.leadingText, { align: "center", bold: true, size: thermal ? 7 : 8 });
  ensureSpace(qrSize + 3);
  doc.addImage(qrDataUrl(input.invoice.qrUrl), "GIF", qrX, y, qrSize, qrSize);
  y += qrSize + 3;
  write(AEAT_QR_SPECIFICATION.verifactuText, { align: "center", bold: true, size: thermal ? 6.5 : 8 });
  y += 2;

  write(input.invoice.documentKind === "simplified" ? "FACTURA SIMPLIFICADA" : input.invoice.documentKind === "rectification" ? "FACTURA RECTIFICATIVA" : "FACTURA", { bold: true, align: "center", size: thermal ? 10 : 16 });
  if (input.duplicate) write("DUPLICADO", { bold: true, align: "center", size: thermal ? 8 : 11 });
  write(input.invoice.invoiceNumber, { bold: true, align: "center", size: thermal ? 9 : 12 });
  write(`Fecha: ${input.invoice.issueDate}`, { align: thermal ? "center" : "left" });
  if (input.invoice.documentKind === "rectification") {
    write(`Factura rectificada: ${input.invoice.originalInvoiceNumber}`, { bold: true });
    write(`Rectificación: ${input.invoice.rectificationReason?.trim() || "Rectificación de importes de la factura original"}`);
  } else if (input.invoice.documentKind === "replacement") {
    write(`Factura simplificada sustituida: ${input.invoice.originalInvoiceNumber}`, { bold: true });
  }
  rule();

  write(input.invoice.issuerSnapshot.legalName, { bold: true });
  write(`NIF: ${input.invoice.issuerSnapshot.nif}`);
  const issuerAddress = input.invoice.issuerSnapshot.address;
  write(`${issuerAddress.line1} · ${issuerAddress.postalCode} ${issuerAddress.city} (${issuerAddress.province})`);
  if (input.invoice.establishmentSnapshot?.name) write(`Establecimiento: ${input.invoice.establishmentSnapshot.name}`);
  if (input.invoice.customerSnapshot) {
    y += 1;
    write("Cliente", { bold: true });
    write(input.invoice.customerSnapshot.legalName);
    write(`NIF: ${input.invoice.customerSnapshot.nif}`);
    const customerAddress = input.invoice.customerSnapshot.address;
    write(`${customerAddress.line1} · ${customerAddress.postalCode} ${customerAddress.city} (${customerAddress.province})`);
  }
  rule();

  for (const line of input.invoice.linesSnapshot) {
    write(`${line.quantity} × ${line.description}`, { bold: false });
    write(`${percent(line.vatRateBps)} IVA · ${money(line.netGrossCents)}`, { align: "right" });
  }
  rule();
  for (const row of input.invoice.taxBreakdown) {
    write(`Base ${percent(row.vatRateBps)}: ${money(row.taxableBaseCents)} · IVA: ${money(row.taxAmountCents)}`);
  }
  if (input.invoice.totals.discountCents !== 0) write(`Descuento: ${money(-input.invoice.totals.discountCents)}`);
  write(`TOTAL: ${money(input.invoice.totals.totalCents)}`, { bold: true, align: "right", size: thermal ? 10 : 13 });
  if (input.invoice.paymentMethods?.length) write(`Pago: ${input.invoice.paymentMethods.map(paymentLabel).join(" + ")}`);

  return Buffer.from(doc.output("arraybuffer"));
}
