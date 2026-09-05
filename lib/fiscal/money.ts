import type {
  FiscalInvoiceCalculation,
  FiscalInvoiceLine,
  FiscalInvoiceLineInput,
  FiscalTaxBreakdown,
} from "@/lib/fiscal/model";

function assertInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${name}_MUST_BE_SAFE_INTEGER`);
}

function checkedBigIntToNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("MONEY_RESULT_OUT_OF_RANGE");
  return result;
}

function roundDivisionHalfAwayFromZero(numerator: bigint, denominator: bigint): number {
  if (denominator <= BigInt(0)) {
    throw new Error("INVALID_INTEGER_DIVISION");
  }
  const sign = numerator < BigInt(0) ? BigInt(-1) : BigInt(1);
  const absolute = numerator < BigInt(0) ? -numerator : numerator;
  return checkedBigIntToNumber(sign * ((absolute + denominator / BigInt(2)) / denominator));
}

function allocateByWeight(weights: readonly number[], amountCents: number): number[] {
  assertInteger("ALLOCATED_AMOUNT_CENTS", amountCents);
  if (amountCents < 0) throw new Error("ALLOCATED_AMOUNT_NEGATIVE");
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (amountCents > total) throw new Error("ALLOCATED_AMOUNT_EXCEEDS_TOTAL");
  if (total === 0) {
    if (amountCents !== 0) throw new Error("ALLOCATION_WITH_ZERO_TOTAL");
    return weights.map(() => 0);
  }
  const allocations = weights.map((weight, index) => {
    assertInteger("ALLOCATION_WEIGHT", weight);
    if (weight < 0) throw new Error("ALLOCATION_WEIGHT_NEGATIVE");
    const scaled = BigInt(weight) * BigInt(amountCents);
    return { index, cents: checkedBigIntToNumber(scaled / BigInt(total)), remainder: scaled % BigInt(total) };
  });
  const missing = amountCents - allocations.reduce((sum, row) => sum + row.cents, 0);
  allocations.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < missing; i += 1) allocations[i]!.cents += 1;
  allocations.sort((a, b) => a.index - b.index);
  return allocations.map((row) => row.cents);
}

function allocateDiscount(lines: readonly FiscalInvoiceLineInput[], discountCents: number): number[] {
  assertInteger("DISCOUNT_CENTS", discountCents);
  if (discountCents < 0) throw new Error("DISCOUNT_CENTS_NEGATIVE");
  const total = lines.reduce((sum, line) => sum + line.grossAmountCents, 0);
  if (discountCents > total) throw new Error("DISCOUNT_EXCEEDS_GROSS");
  if (total === 0) {
    if (discountCents !== 0) throw new Error("DISCOUNT_WITH_ZERO_GROSS");
    return lines.map(() => 0);
  }

  return allocateByWeight(lines.map((line) => line.grossAmountCents), discountCents);
}

export function calculateFiscalCredit(
  original: FiscalInvoiceCalculation,
  creditTotalCents: number,
): FiscalInvoiceCalculation {
  assertInteger("FISCAL_CREDIT_TOTAL_CENTS", creditTotalCents);
  if (creditTotalCents <= 0 || creditTotalCents > original.totals.totalCents) {
    throw new Error("FISCAL_CREDIT_TOTAL_INVALID");
  }
  const allocatedGross = allocateByWeight(
    original.lines.map((line) => line.netGrossCents),
    creditTotalCents,
  );
  const lines: FiscalInvoiceLine[] = original.lines.map((line, index) => {
    const gross = allocatedGross[index]!;
    const tax = calculateTaxIncluded(gross, line.vatRateBps);
    return {
      ...line,
      grossAmountCents: -gross,
      discountCents: 0,
      netGrossCents: -gross,
      taxableBaseCents: -tax.taxableBaseCents,
      taxAmountCents: -tax.taxAmountCents,
    };
  }).filter((line) => line.netGrossCents !== 0);
  const grouped = new Map<number, FiscalTaxBreakdown>();
  for (const line of lines) {
    const current = grouped.get(line.vatRateBps) ?? {
      taxCode: "01" as const,
      regimeCode: "01" as const,
      operationClassification: "S1" as const,
      vatRateBps: line.vatRateBps,
      taxableBaseCents: 0,
      taxAmountCents: 0,
      grossAmountCents: 0,
    };
    current.taxableBaseCents += line.taxableBaseCents;
    current.taxAmountCents += line.taxAmountCents;
    current.grossAmountCents += line.netGrossCents;
    grouped.set(line.vatRateBps, current);
  }
  const breakdown = [...grouped.values()].sort((a, b) => a.vatRateBps - b.vatRateBps);
  const taxableBaseCents = breakdown.reduce((sum, row) => sum + row.taxableBaseCents, 0);
  const taxAmountCents = breakdown.reduce((sum, row) => sum + row.taxAmountCents, 0);
  return {
    lines,
    breakdown,
    totals: {
      grossBeforeDiscountCents: -creditTotalCents,
      discountCents: 0,
      taxableBaseCents,
      taxAmountCents,
      totalCents: taxableBaseCents + taxAmountCents,
    },
  };
}

function calculateTaxIncluded(grossCents: number, vatRateBps: number): {
  taxableBaseCents: number;
  taxAmountCents: number;
} {
  assertInteger("GROSS_CENTS", grossCents);
  assertInteger("VAT_RATE_BPS", vatRateBps);
  if (grossCents < 0) throw new Error("GROSS_CENTS_NEGATIVE");
  if (vatRateBps < 0 || vatRateBps > 10_000) throw new Error("VAT_RATE_BPS_INVALID");
  const taxableBaseCents = roundDivisionHalfAwayFromZero(
    BigInt(grossCents) * BigInt(10_000),
    BigInt(10_000 + vatRateBps),
  );
  return { taxableBaseCents, taxAmountCents: grossCents - taxableBaseCents };
}

export function calculateFiscalInvoice(
  inputLines: readonly FiscalInvoiceLineInput[],
  discountCents = 0,
): FiscalInvoiceCalculation {
  if (inputLines.length === 0) throw new Error("FISCAL_LINES_REQUIRED");
  const seen = new Set<string>();
  for (const line of inputLines) {
    if (!line.lineId.trim()) throw new Error("FISCAL_LINE_ID_REQUIRED");
    if (seen.has(line.lineId)) throw new Error("FISCAL_LINE_ID_DUPLICATED");
    seen.add(line.lineId);
    if (!line.description.trim()) throw new Error("FISCAL_LINE_DESCRIPTION_REQUIRED");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("FISCAL_LINE_QUANTITY_INVALID");
    }
    assertInteger("FISCAL_LINE_GROSS_CENTS", line.grossAmountCents);
    assertInteger("FISCAL_LINE_VAT_RATE_BPS", line.vatRateBps);
    if (line.grossAmountCents < 0) throw new Error("FISCAL_LINE_GROSS_NEGATIVE");
  }

  const discounts = allocateDiscount(inputLines, discountCents);
  const lines: FiscalInvoiceLine[] = inputLines.map((line, index) => {
    const lineDiscount = discounts[index]!;
    const netGrossCents = line.grossAmountCents - lineDiscount;
    const tax = calculateTaxIncluded(netGrossCents, line.vatRateBps);
    return {
      ...line,
      description: line.description.trim(),
      discountCents: lineDiscount,
      netGrossCents,
      ...tax,
    };
  });

  const grouped = new Map<number, FiscalTaxBreakdown>();
  for (const line of lines) {
    const current = grouped.get(line.vatRateBps) ?? {
      taxCode: "01" as const,
      regimeCode: "01" as const,
      operationClassification: "S1" as const,
      vatRateBps: line.vatRateBps,
      taxableBaseCents: 0,
      taxAmountCents: 0,
      grossAmountCents: 0,
    };
    current.taxableBaseCents += line.taxableBaseCents;
    current.taxAmountCents += line.taxAmountCents;
    current.grossAmountCents += line.netGrossCents;
    grouped.set(line.vatRateBps, current);
  }
  const breakdown = [...grouped.values()].sort((a, b) => a.vatRateBps - b.vatRateBps);
  const grossBeforeDiscountCents = inputLines.reduce(
    (sum, line) => sum + line.grossAmountCents,
    0,
  );
  const taxableBaseCents = breakdown.reduce((sum, row) => sum + row.taxableBaseCents, 0);
  const taxAmountCents = breakdown.reduce((sum, row) => sum + row.taxAmountCents, 0);
  const totalCents = taxableBaseCents + taxAmountCents;

  return {
    lines,
    breakdown,
    totals: {
      grossBeforeDiscountCents,
      discountCents,
      taxableBaseCents,
      taxAmountCents,
      totalCents,
    },
  };
}

export function eurosToCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("MONEY_VALUE_INVALID");
  const cents = Math.round((value + Number.EPSILON) * 100);
  assertInteger("MONEY_CENTS", cents);
  return cents;
}

export function formatAeatAmount(cents: number): string {
  assertInteger("AEAT_AMOUNT_CENTS", cents);
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function formatAeatRate(rateBps: number): string {
  assertInteger("AEAT_RATE_BPS", rateBps);
  const whole = Math.floor(rateBps / 100);
  const decimals = rateBps % 100;
  return decimals === 0 ? String(whole) : `${whole}.${String(decimals).padStart(2, "0").replace(/0$/, "")}`;
}
