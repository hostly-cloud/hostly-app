import test from "node:test";
import { calculateFiscalInvoice } from "../../lib/fiscal/money";
import { buildCancellationRecord, buildRegistrationRecord } from "../../lib/fiscal/record-builder";
import type { FiscalRecordPrevious } from "../../lib/fiscal/model";
import { buildVerifactuSoapEnvelope, markVerifactuEnvelopeAsIncident } from "../../lib/fiscal/verifactu-xml";
import { validateVerifactuEnvelopeAgainstOfficialSchemas } from "../../lib/server/fiscal/verifactu-xsd-validator";

const software = {
  producerLegalName: "HOSTLY CLOUD SL",
  producerNif: "B12345678",
  systemName: "Hostly",
  systemId: "H1",
  version: "1.0.0",
  installationNumber: "inst-1",
  onlyVerifactuCapable: true,
  multiTaxpayerCapable: true,
  multipleTaxpayersUsed: true,
};

test("valida altas F2/F3 y anulación contra los XSD oficiales vigentes", async () => {
  const calculation = calculateFiscalInvoice([
    { lineId: "1", description: "Menú", quantity: 1, grossAmountCents: 1_100, vatRateBps: 1_000 },
  ]);
  const first = buildRegistrationRecord({
    issuerNif: "B12345678", issuerLegalName: "Hostly Test", invoiceNumber: "FS-2027-000001",
    issueDate: "02-01-2027", generatedAt: "2027-01-02T11:20:30+01:00", invoiceType: "F2",
    description: "Servicios de hostelería", customer: null, calculation, previous: null, software,
  });
  const firstLink: FiscalRecordPrevious = { issuerNif: first.issuerNif, invoiceNumber: first.invoiceNumber, issueDate: first.issueDate, hash: first.hash };
  const replacement = buildRegistrationRecord({
    issuerNif: "B12345678", issuerLegalName: "Hostly Test", invoiceNumber: "FC-2027-000001",
    issueDate: "03-01-2027", generatedAt: "2027-01-03T11:20:30+01:00", invoiceType: "F3",
    description: "Sustitución de factura simplificada",
    customer: { legalName: "Cliente SL", nif: "B12345678", address: { line1: "Calle Uno, 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" } },
    substitutedInvoices: [firstLink], calculation, previous: firstLink, software,
  });
  const replacementLink: FiscalRecordPrevious = { issuerNif: replacement.issuerNif, invoiceNumber: replacement.invoiceNumber, issueDate: replacement.issueDate, hash: replacement.hash };
  const cancellation = buildCancellationRecord({
    issuerNif: "B12345678", invoiceNumber: "FS-2027-000099", issueDate: "03-01-2027",
    generatedAt: "2027-01-03T11:21:30+01:00", previous: replacementLink, software,
  });
  const envelope = buildVerifactuSoapEnvelope({ taxpayerLegalName: "Hostly Test", taxpayerNif: "B12345678", records: [first, replacement, cancellation] });
  await validateVerifactuEnvelopeAgainstOfficialSchemas(envelope);
  await validateVerifactuEnvelopeAgainstOfficialSchemas(markVerifactuEnvelopeAsIncident(envelope));
});
