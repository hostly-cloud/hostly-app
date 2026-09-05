import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCancellationHashInput,
  buildRegistrationHashInput,
  calculateCancellationHash,
  calculateRegistrationHash,
} from "../../lib/fiscal/verifactu-hash";

const firstRecord = {
  issuerNif: "89890001K",
  invoiceNumber: "12345678/G33",
  issueDate: "01-01-2024",
  invoiceType: "F1" as const,
  taxAmountCents: 1_235,
  totalCents: 12_345,
  previousHash: null,
  generatedAt: "2024-01-01T19:20:30+01:00",
};

test("reproduce el primer vector SHA-256 oficial de AEAT", () => {
  assert.equal(
    buildRegistrationHashInput(firstRecord),
    "IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00",
  );
  assert.equal(
    calculateRegistrationHash(firstRecord),
    "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
  );
});

test("reproduce el segundo vector encadenado oficial de AEAT", () => {
  assert.equal(
    calculateRegistrationHash({
      ...firstRecord,
      invoiceNumber: "12345679/G34",
      previousHash: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
      generatedAt: "2024-01-01T19:20:35+01:00",
    }),
    "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
  );
});

test("reproduce el vector oficial de anulación encadenada de AEAT", () => {
  const cancellation = {
    issuerNif: "89890001K",
    invoiceNumber: "12345679/G34",
    issueDate: "01-01-2024",
    previousHash: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
    generatedAt: "2024-01-01T19:20:40+01:00",
  };
  assert.equal(
    buildCancellationHashInput(cancellation),
    "IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00",
  );
  assert.equal(
    calculateCancellationHash(cancellation),
    "177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68",
  );
});
