import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildFiscalRecordsNdjson } from "../../lib/server/fiscal/export-fiscal-records";
import type { FiscalRecord } from "../../lib/fiscal/model";

const record = {
  schemaVersion: "1.0",
  kind: "anulacion",
  issuerNif: "B12345674",
  invoiceNumber: "FS-2027-000001",
  issueDate: "02-01-2027",
  generatedAt: "2027-01-02T11:20:31+01:00",
  previous: null,
  software: {
    producerLegalName: "Hostly Test SL",
    producerNif: "B12345674",
    systemName: "Hostly",
    systemId: "H1",
    version: "1.0.0",
    installationNumber: "installation-1",
    onlyVerifactuCapable: true,
    multiTaxpayerCapable: true,
    multipleTaxpayersUsed: true,
  },
  hashAlgorithm: "01",
  hash: "A".repeat(64),
} satisfies FiscalRecord;

test("exporta una copia exacta de cada registro con manifiesto y hashes", () => {
  const output = buildFiscalRecordsNdjson({
    restaurantId: "restaurant-a",
    fromMs: 100,
    toMs: 300,
    generatedAt: "2027-01-03T00:00:00.000Z",
    rows: [
      { documentId: "b", recordId: "record-b", invoiceId: "invoice-b", createdAtMs: 200, version: { fiscalModule: "1.0.0" }, record },
      { documentId: "a", recordId: "record-a", invoiceId: "invoice-a", createdAtMs: 100, version: { fiscalModule: "1.0.0" }, record },
    ],
  });
  const lines = output.trimEnd().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 3);
  assert.equal(lines[0].type, "manifest");
  assert.equal(lines[0].recordCount, 2);
  assert.equal(lines[1].documentId, "a");
  assert.equal(lines[2].documentId, "b");
  assert.deepEqual(lines[1].record, record);

  const recordJson = JSON.stringify(record);
  assert.equal(lines[1].recordSha256, createHash("sha256").update(recordJson).digest("hex"));
  const payload = output.trimEnd().split("\n").slice(1).join("\n");
  assert.equal(lines[0].payloadSha256, createHash("sha256").update(payload).digest("hex"));
});

test("un periodo sin registros sigue generando un manifiesto verificable", () => {
  const output = buildFiscalRecordsNdjson({
    restaurantId: "restaurant-a",
    rows: [],
    generatedAt: "2027-01-03T00:00:00.000Z",
  });
  const manifest = JSON.parse(output.trim());
  assert.equal(manifest.recordCount, 0);
  assert.equal(manifest.payloadSha256, createHash("sha256").update("").digest("hex"));
});
