import assert from "node:assert/strict";
import test from "node:test";
import {
  FISCAL_PDF_QR_POSITION,
  FISCAL_PDF_QR_SIZE_MM,
  generateFiscalInvoicePdf,
} from "../../lib/fiscal/fiscal-invoice-pdf";
import { AEAT_QR_SPECIFICATION } from "../../lib/fiscal/verifactu-qr";

const invoice = {
  invoiceNumber: "FS-2027-000001",
  documentKind: "simplified",
  mode: "test" as const,
  issueDate: "02-01-2027",
  issuedAtMs: Date.now(),
  qrUrl: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674&numserie=FS-2027-000001&fecha=02-01-2027&importe=11.00",
  issuerSnapshot: { legalName: "Restaurante Test SL", nif: "B12345674", address: { line1: "Calle 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" } },
  establishmentSnapshot: { name: "Restaurante Test", address: { line1: "Calle 1" } },
  customerSnapshot: null,
  linesSnapshot: [{ description: "Menú", quantity: 1, netGrossCents: 1_100, vatRateBps: 1_000 }],
  taxBreakdown: [{ vatRateBps: 1_000, taxableBaseCents: 1_000, taxAmountCents: 100 }],
  totals: { discountCents: 0, taxableBaseCents: 1_000, taxAmountCents: 100, totalCents: 1_100 },
  paymentMethods: ["card"],
};

test("genera PDF A4 y tickets térmicos con QR", () => {
  for (const paper of ["a4", "80mm", "58mm"] as const) {
    const pdf = generateFiscalInvoicePdf({ invoice, paper, duplicate: true });
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.length > 2_000);
  }
});

test("mantiene el QR tributario al inicio y dentro de 30–40 mm", () => {
  assert.equal(FISCAL_PDF_QR_POSITION, "before_invoice_content");
  assert.ok(FISCAL_PDF_QR_SIZE_MM >= AEAT_QR_SPECIFICATION.minSizeMm);
  assert.ok(FISCAL_PDF_QR_SIZE_MM <= AEAT_QR_SPECIFICATION.maxSizeMm);
  assert.equal(AEAT_QR_SPECIFICATION.errorCorrectionLevel, "M");
});

test("pagina una factura A4 larga en vez de cortar su contenido", () => {
  const linesSnapshot = Array.from({ length: 90 }, (_, index) => ({
    description: `Producto de prueba ${index + 1}`,
    quantity: 1,
    netGrossCents: 110,
    vatRateBps: 1_000,
  }));
  const pdf = generateFiscalInvoicePdf({
    invoice: { ...invoice, linesSnapshot },
    paper: "a4",
  });
  const text = pdf.toString("latin1");
  const pageObjects = text.match(/\/Type \/Page\b/g) ?? [];
  assert.ok(pageObjects.length >= 2);
});

test("no permite imprimir una rectificativa sin identificar la factura rectificada", () => {
  assert.throws(
    () => generateFiscalInvoicePdf({
      invoice: { ...invoice, documentKind: "rectification" },
      paper: "a4",
    }),
    /FISCAL_ORIGINAL_INVOICE_NUMBER_REQUIRED/,
  );
  const pdf = generateFiscalInvoicePdf({
    invoice: {
      ...invoice,
      invoiceNumber: "FR-2027-000001",
      documentKind: "rectification",
      originalInvoiceNumber: "FS-2027-000001",
      rectificationReason: "Devolución parcial",
    },
    paper: "a4",
  });
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
});
