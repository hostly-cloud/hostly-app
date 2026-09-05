import assert from "node:assert/strict";
import test from "node:test";
import { buildFiscalInvoicesCsv } from "../../lib/server/fiscal/list-fiscal-invoices";

test("exporta importes contables y neutraliza fórmulas CSV", () => {
  const csv = buildFiscalInvoicesCsv([{
    id: "invoice-1",
    recordId: "record-1",
    deliveryStatus: "accepted",
    delivery: null,
    invoiceNumber: "=DANGEROUS",
    issueDate: "02-01-2027",
    documentKind: "complete",
    customerSnapshot: { legalName: "+Cliente", nif: "B12345674" },
    totals: { taxableBaseCents: 1_000, taxAmountCents: 100, totalCents: 1_100 },
    paymentMethods: ["cash", "card"],
  }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=DANGEROUS"/);
  assert.match(csv, /"'\+Cliente"/);
  assert.match(csv, /10\.00;1\.00;11\.00/);
  assert.match(csv, /"cash\+card"/);
});
