export const DEFAULT_CASH_TIMEZONE = "Europe/Madrid";

export function resolveCashTimezone(timezone: unknown): string {
  const candidate = typeof timezone === "string" ? timezone.trim() : "";
  if (!candidate) return DEFAULT_CASH_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_CASH_TIMEZONE;
  }
}

export function businessDateForMs(ms: number, timezone: unknown): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveCashTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(ms));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
