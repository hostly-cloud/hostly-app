export const WASTE_REASONS = [
  "roto",
  "caducado",
  "error cocina",
  "invitación",
  "otro",
] as const;

export type WasteReason = (typeof WASTE_REASONS)[number];

export function formatWasteDate(isoDate: string): string {
  const value = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
