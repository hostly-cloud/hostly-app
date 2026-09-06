import assert from "node:assert/strict";
import test from "node:test";
import { buildFiscalConfiguration } from "../../lib/fiscal/configuration";
import { calculateFiscalInvoice } from "../../lib/fiscal/money";
import { buildRegistrationRecord } from "../../lib/fiscal/record-builder";
import { buildVerifactuSoapEnvelope } from "../../lib/fiscal/verifactu-xml";

const software = {
  producerLegalName: "HOSTLY CLOUD SL",
  producerNif: "B12345678",
  systemName: "Hostly",
  systemId: "H1",
  version: "1.0.0",
  installationNumber: "inst-tax-spain",
  onlyVerifactuCapable: true,
  multiTaxpayerCapable: true,
  multipleTaxpayersUsed: true,
};

const commonInput = {
  mode: "test" as const,
  taxpayerLegalName: "Restaurante Pruebas SL",
  taxpayerNif: "B12345674",
  taxpayerAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
  establishmentName: "Restaurante Pruebas",
  establishmentAddress: { line1: "Calle Mayor 1", postalCode: "28001", city: "Madrid", province: "Madrid", countryCode: "ES" },
  timezone: "Europe/Madrid",
  defaultVatRateBps: 1_000,
};

function envelopeFor(taxCode: "01" | "02" | "03") {
  const calculation = calculateFiscalInvoice([
    { lineId: "1", description: "Servicio", quantity: 1, grossAmountCents: 1_070, vatRateBps: 700 },
  ], 0, taxCode);
  const record = buildRegistrationRecord({
    issuerNif: "B12345678",
    issuerLegalName: "Hostly Test",
    invoiceNumber: `FS-${taxCode}`,
    issueDate: "02-01-2027",
    generatedAt: "2027-01-02T11:20:30+01:00",
    invoiceType: "F2",
    description: "Servicios de hostelería",
    customer: null,
    calculation,
    previous: null,
    software,
  });
  return { calculation, envelope: buildVerifactuSoapEnvelope({ taxpayerLegalName: "Hostly Test", taxpayerNif: "B12345678", records: [record] }) };
}

test("mantiene IVA como compatibilidad para configuraciones antiguas", () => {
  const config = buildFiscalConfiguration({ restaurantId: "restaurant-a", value: commonInput });
  assert.equal(config.indirectTaxCode, "01");
});

test("configura explícitamente IGIC e IPSI por restaurante", () => {
  const igic = buildFiscalConfiguration({ restaurantId: "canarias", value: { ...commonInput, indirectTaxCode: "03", timezone: "Atlantic/Canary" } });
  const ipsi = buildFiscalConfiguration({ restaurantId: "ceuta", value: { ...commonInput, indirectTaxCode: "02" } });
  assert.equal(igic.indirectTaxCode, "03");
  assert.equal(ipsi.indirectTaxCode, "02");
});

test("IVA e IGIC informan ClaveRegimen 01", () => {
  for (const taxCode of ["01", "03"] as const) {
    const { calculation, envelope } = envelopeFor(taxCode);
    assert.equal(calculation.breakdown[0]?.taxCode, taxCode);
    assert.equal(calculation.breakdown[0]?.regimeCode, "01");
    assert.match(envelope, new RegExp(`<sum:Impuesto>${taxCode}<\\/sum:Impuesto><sum:ClaveRegimen>01<\\/sum:ClaveRegimen>`));
  }
});

test("IPSI usa código 02 y omite ClaveRegimen", () => {
  const { calculation, envelope } = envelopeFor("02");
  assert.equal(calculation.breakdown[0]?.taxCode, "02");
  assert.equal(calculation.breakdown[0]?.regimeCode, null);
  assert.match(envelope, /<sum:Impuesto>02<\/sum:Impuesto>/);
  assert.doesNotMatch(envelope, /<sum:ClaveRegimen>/);
});

test("las rectificaciones conservan el impuesto indirecto original", () => {
  const original = calculateFiscalInvoice([
    { lineId: "1", description: "Servicio", quantity: 1, grossAmountCents: 1_070, vatRateBps: 700 },
  ], 0, "03");
  const { calculateFiscalCredit } = require("../../lib/fiscal/money") as typeof import("../../lib/fiscal/money");
  const credit = calculateFiscalCredit(original, 535);
  assert.equal(credit.breakdown[0]?.taxCode, "03");
  assert.equal(credit.breakdown[0]?.regimeCode, "01");
});
