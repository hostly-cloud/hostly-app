export function formatCurrencyEs(
  value: number | null | undefined,
  currency = "EUR",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }

  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value;

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedValue);
}
