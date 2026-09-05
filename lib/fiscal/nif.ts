const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

export function normalizeSpanishTaxId(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function validDniOrNie(nif: string): boolean {
  if (/^\d{8}[A-Z]$/.test(nif)) {
    return DNI_LETTERS[Number(nif.slice(0, 8)) % 23] === nif[8];
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const prefix = nif[0] === "X" ? "0" : nif[0] === "Y" ? "1" : "2";
    return DNI_LETTERS[Number(prefix + nif.slice(1, 8)) % 23] === nif[8];
  }
  return false;
}

function validCif(nif: string): boolean {
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return false;
  const digits = nif.slice(1, 8).split("").map(Number);
  const even = digits[1]! + digits[3]! + digits[5]!;
  const odd = [digits[0]!, digits[2]!, digits[4]!, digits[6]!].reduce((sum, value) => {
    const doubled = value * 2;
    return sum + Math.floor(doubled / 10) + (doubled % 10);
  }, 0);
  const controlDigit = (10 - ((even + odd) % 10)) % 10;
  const supplied = nif[8]!;
  const initial = nif[0]!;
  if ("ABEH".includes(initial)) return supplied === String(controlDigit);
  if ("KPQS".includes(initial)) return supplied === CIF_CONTROL_LETTERS[controlDigit];
  return supplied === String(controlDigit) || supplied === CIF_CONTROL_LETTERS[controlDigit];
}

export function isValidSpanishTaxId(value: string): boolean {
  const normalized = normalizeSpanishTaxId(value);
  return validDniOrNie(normalized) || validCif(normalized);
}

export function assertValidSpanishTaxId(value: string): string {
  const normalized = normalizeSpanishTaxId(value);
  if (!isValidSpanishTaxId(normalized)) throw new Error("SPANISH_TAX_ID_INVALID");
  return normalized;
}
