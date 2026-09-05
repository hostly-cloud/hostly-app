export function formatAeatIssueDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.day}-${value.month}-${value.year}`;
}

export function formatAeatDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const rawOffset = value.timeZoneName === "GMT" ? "+00:00" : value.timeZoneName?.replace("GMT", "");
  if (!rawOffset || !/^[+-]\d{2}:\d{2}$/.test(rawOffset)) {
    throw new Error("TIMEZONE_OFFSET_UNAVAILABLE");
  }
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}${rawOffset}`;
}

export function fiscalYearForDate(date: Date, timeZone: string): number {
  const year = new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(date);
  const parsed = Number(year);
  if (!Number.isInteger(parsed)) throw new Error("FISCAL_YEAR_INVALID");
  return parsed;
}

export function formatFiscalInvoiceNumber(
  seriesCode: string,
  year: number,
  sequence: number,
  padding: number,
): string {
  const series = seriesCode.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,19}$/.test(series)) throw new Error("FISCAL_SERIES_INVALID");
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("FISCAL_YEAR_INVALID");
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("FISCAL_SEQUENCE_INVALID");
  if (!Number.isInteger(padding) || padding < 1 || padding > 12) throw new Error("FISCAL_PADDING_INVALID");
  return `${series}-${year}-${String(sequence).padStart(padding, "0")}`;
}
