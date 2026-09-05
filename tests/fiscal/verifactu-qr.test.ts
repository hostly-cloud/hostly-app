import assert from "node:assert/strict";
import test from "node:test";
import { AEAT_QR_SPECIFICATION, buildAeatQrUrl } from "../../lib/fiscal/verifactu-qr";

test("genera la URL oficial de cotejo VERI*FACTU con codificación UTF-8", () => {
  assert.equal(
    buildAeatQrUrl({
      environment: "production",
      mode: "verifactu",
      issuerNif: " b12345678 ",
      invoiceNumber: "FS/2027 0001",
      issueDate: "02-01-2027",
      totalCents: 12_345,
    }),
    "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FS%2F2027+0001&fecha=02-01-2027&importe=123.45",
  );
});

test("mantiene las restricciones físicas oficiales del QR", () => {
  assert.deepEqual(AEAT_QR_SPECIFICATION, {
    minSizeMm: 30,
    maxSizeMm: 40,
    errorCorrectionLevel: "M",
    leadingText: "QR tributario:",
    verifactuText: "Factura verificable en la sede electrónica de la AEAT",
    quietZoneMinimumMm: 2,
    quietZoneRecommendedMm: 6,
  });
});

test("rechaza identificadores que AEAT no admite", () => {
  assert.throws(
    () => buildAeatQrUrl({ environment: "test", mode: "verifactu", issuerNif: "123", invoiceNumber: "1", issueDate: "01-01-2027", totalCents: 1 }),
    /AEAT_QR_NIF_INVALID/,
  );
});
