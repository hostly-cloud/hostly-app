import assert from "node:assert/strict";
import test from "node:test";
import {
  fiscalYearForDate,
  formatAeatDateTime,
  formatAeatIssueDate,
  formatFiscalInvoiceNumber,
} from "../../lib/fiscal/format";

test("serializa fecha y huso español incluyendo horario de verano", () => {
  assert.equal(formatAeatIssueDate(new Date("2027-01-02T10:20:30Z"), "Europe/Madrid"), "02-01-2027");
  assert.equal(formatAeatDateTime(new Date("2027-01-02T10:20:30Z"), "Europe/Madrid"), "2027-01-02T11:20:30+01:00");
  assert.equal(formatAeatDateTime(new Date("2027-07-02T10:20:30Z"), "Europe/Madrid"), "2027-07-02T12:20:30+02:00");
});

test("calcula el ejercicio en el huso del establecimiento", () => {
  const instant = new Date("2026-12-31T23:30:00Z");
  assert.equal(fiscalYearForDate(instant, "Europe/Madrid"), 2027);
  assert.equal(fiscalYearForDate(instant, "Atlantic/Canary"), 2026);
});

test("genera numeración legible y rechaza series peligrosas", () => {
  assert.equal(formatFiscalInvoiceNumber("fs", 2027, 12, 6), "FS-2027-000012");
  assert.throws(() => formatFiscalInvoiceNumber("../../x", 2027, 1, 6), /FISCAL_SERIES_INVALID/);
});
