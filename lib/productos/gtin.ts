export const HOSTLY_GTIN_LENGTHS = [8, 12, 13, 14] as const;

const GTIN_LENGTHS = new Set<number>(HOSTLY_GTIN_LENGTHS);

export function normalizeGtinDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Validates the standard GS1 check digit for GTIN-8, GTIN-12/UPC-A,
 * GTIN-13/EAN-13 and GTIN-14. This validates structure only; it does not
 * assert that GS1 allocated the company prefix.
 */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !GTIN_LENGTHS.has(value.length)) return false;
  const data = value.slice(0, -1);
  const checkDigit = Number(value.at(-1));
  let sum = 0;
  let weight = 3;
  for (let index = data.length - 1; index >= 0; index -= 1) {
    sum += Number(data[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

export function normalizeValidGtin(value: string): string | null {
  const digits = normalizeGtinDigits(value);
  return isValidGtin(digits) ? digits : null;
}
