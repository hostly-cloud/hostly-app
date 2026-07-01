import { parseProductPrecio } from "@/lib/productos/product-central-draft";

export type InlineFieldValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validateInlineProductName(
  raw: string,
  errorMessage: string,
): InlineFieldValidationResult<string> {
  const name = raw.trim();
  if (!name) {
    return { ok: false, error: errorMessage };
  }
  return { ok: true, value: name };
}

export function validateInlineProductPrice(
  raw: string,
  errorMessage: string,
): InlineFieldValidationResult<number> {
  const price = parseProductPrecio(raw);
  if (price == null) {
    return { ok: false, error: errorMessage };
  }
  return { ok: true, value: price };
}
