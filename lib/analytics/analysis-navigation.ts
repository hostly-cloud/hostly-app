const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type SalesDetailRange = {
  dateFrom: string;
  dateTo: string;
};

function isValidYmd(value: string | null): value is string {
  if (!value || !YMD_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function normalizeRange(dateFrom: string, dateTo: string): SalesDetailRange {
  return dateFrom <= dateTo
    ? { dateFrom, dateTo }
    : { dateFrom: dateTo, dateTo: dateFrom };
}

export function buildSalesDetailHref(range: SalesDetailRange): string {
  const normalized = normalizeRange(range.dateFrom, range.dateTo);
  const params = new URLSearchParams(normalized);
  return `/dashboard/analisis/ventas?${params.toString()}`;
}

export function parseSalesDetailRange(search: string): SalesDetailRange | null {
  const params = new URLSearchParams(search);
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (!isValidYmd(dateFrom) || !isValidYmd(dateTo)) return null;
  return normalizeRange(dateFrom, dateTo);
}
