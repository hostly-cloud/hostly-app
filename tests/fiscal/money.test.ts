import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFiscalInvoice,
  calculateFiscalCredit,
  eurosToCents,
  formatAeatAmount,
  formatAeatRate,
} from "../../lib/fiscal/money";

test("calcula IVA incluido por tipo sin perder un céntimo", () => {
  const result = calculateFiscalInvoice([
    { lineId: "food", description: "Menú", quantity: 1, grossAmountCents: 2_200, vatRateBps: 1_000 },
    { lineId: "drink", description: "Refresco", quantity: 1, grossAmountCents: 242, vatRateBps: 2_100 },
  ]);

  assert.deepEqual(result.breakdown, [
    {
      taxCode: "01",
      regimeCode: "01",
      operationClassification: "S1",
      vatRateBps: 1_000,
      taxableBaseCents: 2_000,
      taxAmountCents: 200,
      grossAmountCents: 2_200,
    },
    {
      taxCode: "01",
      regimeCode: "01",
      operationClassification: "S1",
      vatRateBps: 2_100,
      taxableBaseCents: 200,
      taxAmountCents: 42,
      grossAmountCents: 242,
    },
  ]);
  assert.equal(result.totals.totalCents, 2_442);
  assert.equal(result.totals.taxableBaseCents + result.totals.taxAmountCents, 2_442);
});

test("una devolución parcial conserva el total y reparte bases por tipo", () => {
  const original = calculateFiscalInvoice([
    { lineId: "food", description: "Comida", quantity: 1, grossAmountCents: 1_100, vatRateBps: 1_000 },
    { lineId: "drink", description: "Bebida", quantity: 1, grossAmountCents: 1_210, vatRateBps: 2_100 },
  ]);
  const credit = calculateFiscalCredit(original, 1_155);
  assert.equal(credit.totals.totalCents, -1_155);
  assert.equal(credit.lines.reduce((sum, line) => sum + line.netGrossCents, 0), -1_155);
  assert.deepEqual(credit.breakdown.map((row) => row.vatRateBps), [1_000, 2_100]);
});

test("reparte descuentos de forma determinista por resto mayor", () => {
  const result = calculateFiscalInvoice(
    [
      { lineId: "a", description: "A", quantity: 1, grossAmountCents: 100, vatRateBps: 1_000 },
      { lineId: "b", description: "B", quantity: 1, grossAmountCents: 100, vatRateBps: 1_000 },
      { lineId: "c", description: "C", quantity: 1, grossAmountCents: 100, vatRateBps: 1_000 },
    ],
    2,
  );
  assert.deepEqual(result.lines.map((line) => line.discountCents), [1, 1, 0]);
  assert.equal(result.totals.totalCents, 298);
});

test("rechaza importes y líneas ambiguas", () => {
  assert.throws(() => calculateFiscalInvoice([], 0), /FISCAL_LINES_REQUIRED/);
  assert.throws(
    () => calculateFiscalInvoice([{ lineId: "x", description: "X", quantity: 1, grossAmountCents: 100, vatRateBps: -1 }]),
    /VAT_RATE_BPS_INVALID/,
  );
  assert.throws(
    () => calculateFiscalInvoice([{ lineId: "x", description: "X", quantity: 1, grossAmountCents: 100, vatRateBps: 1_000 }], 101),
    /DISCOUNT_EXCEEDS_GROSS/,
  );
});

test("normaliza importes y tipos para XML y huella", () => {
  assert.equal(eurosToCents(12.35), 1_235);
  assert.equal(formatAeatAmount(-5), "-0.05");
  assert.equal(formatAeatRate(1_000), "10");
  assert.equal(formatAeatRate(1_055), "10.55");
});
