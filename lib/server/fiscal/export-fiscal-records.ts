import { createHash } from "node:crypto";
import type { FiscalRecord } from "@/lib/fiscal/model";

export type FiscalRecordExportRow = {
  documentId: string;
  createdAtMs: number;
  recordId: string;
  invoiceId: string | null;
  version: unknown;
  record: FiscalRecord;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildFiscalRecordsNdjson(input: {
  restaurantId: string;
  fromMs?: number;
  toMs?: number;
  rows: FiscalRecordExportRow[];
  generatedAt?: string;
}): string {
  const rows = [...input.rows].sort((a, b) => a.createdAtMs - b.createdAtMs || a.documentId.localeCompare(b.documentId));
  const payloadLines = rows.map((row) => {
    const storedRecordJson = JSON.stringify(row.record);
    return JSON.stringify({
      type: "fiscal_record",
      documentId: row.documentId,
      recordId: row.recordId,
      invoiceId: row.invoiceId,
      createdAtMs: row.createdAtMs,
      version: row.version,
      recordSha256: sha256(storedRecordJson),
      record: row.record,
    });
  });
  const payload = payloadLines.join("\n");
  const manifest = JSON.stringify({
    type: "manifest",
    format: "hostly-rrsif-ndjson-v1",
    restaurantId: input.restaurantId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    period: {
      fromMs: input.fromMs ?? null,
      toMs: input.toMs ?? null,
    },
    recordCount: rows.length,
    payloadSha256: sha256(payload),
  });
  return payload ? `${manifest}\n${payload}\n` : `${manifest}\n`;
}
