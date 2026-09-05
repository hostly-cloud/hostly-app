import assert from "node:assert/strict";
import test from "node:test";
import { calculateFiscalInvoice } from "../../lib/fiscal/money";
import { buildRegistrationRecord } from "../../lib/fiscal/record-builder";
import {
  AEAT_XML_NAMESPACES,
  buildVerifactuSoapEnvelope,
  markVerifactuEnvelopeAsIncident,
} from "../../lib/fiscal/verifactu-xml";

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

test("genera un alta SOAP en el orden exigido por el XSD oficial", () => {
  const calculation = calculateFiscalInvoice([
    { lineId: "1", description: "Menú <día>", quantity: 1, grossAmountCents: 1_100, vatRateBps: 1_000 },
  ]);
  const record = buildRegistrationRecord({
    issuerNif: "B12345678",
    issuerLegalName: "Restaurante & Compañía",
    invoiceNumber: "FS-2027-000001",
    issueDate: "02-01-2027",
    generatedAt: "2027-01-02T11:20:30+01:00",
    invoiceType: "F2",
    description: "Servicios de hostelería",
    customer: null,
    calculation,
    previous: null,
    software,
  });
  const envelope = buildVerifactuSoapEnvelope({
    taxpayerLegalName: "Restaurante & Compañía",
    taxpayerNif: "B12345678",
    records: [record],
  });

  assert.match(envelope, new RegExp(`xmlns:sum1="${AEAT_XML_NAMESPACES.suministroLR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(envelope, /<sum:PrimerRegistro>S<\/sum:PrimerRegistro>/);
  assert.match(envelope, /<sum:TipoFactura>F2<\/sum:TipoFactura>/);
  assert.match(envelope, /<sum:TipoImpositivo>10<\/sum:TipoImpositivo>/);
  assert.match(envelope, /<sum:BaseImponibleOimporteNoSujeto>10\.00<\/sum:BaseImponibleOimporteNoSujeto>/);
  assert.match(envelope, /Restaurante &amp; Compañía/);
  assert.doesNotMatch(envelope, /<sum:Destinatarios>/);
});

test("exige destinatario en factura completa", () => {
  assert.throws(
    () => buildRegistrationRecord({
      issuerNif: "B12345678",
      issuerLegalName: "Hostly Test",
      invoiceNumber: "F-1",
      issueDate: "02-01-2027",
      generatedAt: "2027-01-02T11:20:30+01:00",
      invoiceType: "F1",
      description: "Hostelería",
      customer: null,
      calculation: calculateFiscalInvoice([{ lineId: "1", description: "A", quantity: 1, grossAmountCents: 110, vatRateBps: 1_000 }]),
      previous: null,
      software,
    }),
    /FISCAL_COMPLETE_CUSTOMER_REQUIRED/,
  );
});

test("genera F3 con la referencia XSD a la factura simplificada sustituida", () => {
  const reference = {
    issuerNif: "B12345678",
    invoiceNumber: "FS-2027-000001",
    issueDate: "02-01-2027",
    hash: "A".repeat(64),
  };
  const record = buildRegistrationRecord({
    issuerNif: "B12345678",
    issuerLegalName: "Hostly Test",
    invoiceNumber: "FC-2027-000001",
    issueDate: "03-01-2027",
    generatedAt: "2027-01-03T11:20:30+01:00",
    invoiceType: "F3",
    description: "Sustitución de factura simplificada",
    customer: {
      legalName: "Cliente SL",
      nif: "B12345678",
      address: { line1: "Calle Uno, 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
    },
    substitutedInvoices: [reference],
    calculation: calculateFiscalInvoice([{ lineId: "1", description: "A", quantity: 1, grossAmountCents: 110, vatRateBps: 1_000 }]),
    previous: reference,
    software,
  });
  const envelope = buildVerifactuSoapEnvelope({ taxpayerLegalName: "Hostly Test", taxpayerNif: "B12345678", records: [record] });
  assert.match(envelope, /<sum:TipoFactura>F3<\/sum:TipoFactura>/);
  assert.match(envelope, /<sum:FacturasSustituidas><sum:IDFacturaSustituida>/);
  assert.match(envelope, /<sum:NumSerieFactura>FS-2027-000001<\/sum:NumSerieFactura>/);
  assert.ok(envelope.indexOf("<sum:FacturasSustituidas>") < envelope.indexOf("<sum:DescripcionOperacion>"));
});

test("F3 exige destinatario y factura sustituida", () => {
  const common = {
    issuerNif: "B12345678", issuerLegalName: "Hostly Test", invoiceNumber: "FC-1",
    issueDate: "03-01-2027", generatedAt: "2027-01-03T11:20:30+01:00" as const,
    invoiceType: "F3" as const, description: "Sustitución",
    calculation: calculateFiscalInvoice([{ lineId: "1", description: "A", quantity: 1, grossAmountCents: 110, vatRateBps: 1_000 }]),
    previous: null, software,
  };
  assert.throws(() => buildRegistrationRecord({ ...common, customer: null }), /FISCAL_COMPLETE_CUSTOMER_REQUIRED/);
  assert.throws(() => buildRegistrationRecord({
    ...common,
    customer: { legalName: "Cliente SL", nif: "B12345678", address: { line1: "A", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" } },
  }), /FISCAL_SUBSTITUTED_INVOICE_REFERENCE_REQUIRED/);
});

test("marca los reenvíos tras una incidencia en la cabecera oficial", () => {
  const envelope = "<sum:ObligadoEmision><sum:NIF>B12345678</sum:NIF></sum:ObligadoEmision>";
  const marked = markVerifactuEnvelopeAsIncident(envelope);
  assert.match(marked, /<sum:RemisionVoluntaria><sum:Incidencia>S<\/sum:Incidencia><\/sum:RemisionVoluntaria>/);
  assert.equal(markVerifactuEnvelopeAsIncident(marked), marked);
});
