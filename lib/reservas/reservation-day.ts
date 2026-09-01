const RESERVATION_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseReservationDay(ymd: string): { year: number; month: number; day: number } | null {
  const match = RESERVATION_DAY_PATTERN.exec(String(ymd ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function shiftReservationDay(ymd: string, offsetDays: number): string {
  const parsed = parseReservationDay(ymd);
  if (!parsed || !Number.isFinite(offsetDays)) return ymd;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + Math.trunc(offsetDays));

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
